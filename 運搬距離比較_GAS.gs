/**
 * ============================================================
 * 運搬距離 比較ツール（Googleスプレッドシート用）
 * ------------------------------------------------------------
 *  発生土の現場（起点）から、処分地までの「道路距離」を自動計算します。
 *  住所でも、緯度経度（例: 35.011, 135.768）でも入力できます。
 *
 *  ● 使える関数
 *    1) ROAD_DIST(起点, 処分地)        … 道路距離 km（0.1km単位で切り上げ）
 *    2) ROAD_TIME(起点, 処分地)        … 所要時間の目安（一般道想定）
 *    3) GSI_GEOCODE(住所)              … 住所 → 緯度・経度
 *
 *  ● メニュー（スプレッドシート上部に「運搬距離ツール」が出ます）
 *    ・比較表シートを作成 … 入力するだけの表を自動で用意します
 *
 *  ※ 道路距離: OSRM（OpenStreetMap道路網） / 住所検索: 国土地理院
 *     どちらもAPIキー不要・無料です。
 * ============================================================
 */


/* ============================================================
 *  メニュー
 * ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('運搬距離ツール')
    .addItem('① 比較表シートを作成', 'createCompareSheet_')
    .addSeparator()
    .addItem('使い方を表示', 'showHelp_')
    .addToUi();
}


/* ============================================================
 *  ① 道路距離  ROAD_DIST(起点, 処分地)
 *  ------------------------------------------------------------
 *   使い方:  =ROAD_DIST("大阪市北区梅田1-1-1", "堺市南区原山台1-1")
 *            =ROAD_DIST(B2, C2)
 *   起点・処分地は「住所」でも「緯度,経度」でもOK。
 *   結果: 道路距離(km)。積算に合わせて 0.1km 単位で切り上げます。
 * ============================================================ */
function ROAD_DIST(from, to) {
  var f = toLatLng_(from);
  var t = toLatLng_(to);
  if (!f || !t) return '';                 // どちらか空ならブランク
  if (f.error) return f.error;
  if (t.error) return t.error;

  var route = getRoute_(f, t);
  if (route.error) return route.error;
  // メートル → 0.1km単位で切り上げ
  return Math.ceil(route.distanceM / 100) / 10;
}


/* ============================================================
 *  ② 所要時間  ROAD_TIME(起点, 処分地)
 *  ------------------------------------------------------------
 *   使い方:  =ROAD_TIME(B2, C2)
 *   結果: 「約45分」「約1時間20分」など（一般道の自動車想定）
 * ============================================================ */
function ROAD_TIME(from, to) {
  var f = toLatLng_(from);
  var t = toLatLng_(to);
  if (!f || !t) return '';
  if (f.error) return f.error;
  if (t.error) return t.error;

  var route = getRoute_(f, t);
  if (route.error) return route.error;

  var min = Math.round(route.durationS / 60);
  if (min < 60) return '約' + min + '分';
  var h = Math.floor(min / 60);
  var m = min % 60;
  return '約' + h + '時間' + (m > 0 ? m + '分' : '');
}


/* ============================================================
 *  住所/座標 → {lat, lng} に変換（内部用・キャッシュ付き）
 * ============================================================ */
function toLatLng_(input) {
  if (input === '' || input === null || input === undefined) return null;
  var s = String(input).trim();
  if (s === '') return null;

  // 「緯度, 経度」形式ならそのまま使う（例: 35.011, 135.768）
  var m = s.match(/^(-?\d{1,3}(?:\.\d+)?)[\s,、]+(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) {
    var lat = parseFloat(m[1]);
    var lng = parseFloat(m[2]);
    if (lat >= 20 && lat <= 50 && lng >= 120 && lng <= 155) {
      return { lat: lat, lng: lng };
    }
  }
  // それ以外は住所として国土地理院で検索
  return geocode_(s);
}

function geocode_(address) {
  var cache = CacheService.getScriptCache();
  var key = 'geo_' + address;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  try {
    var url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q='
            + encodeURIComponent(address);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(res.getContentText());
    if (data && data.length > 0 && data[0].geometry) {
      var c = data[0].geometry.coordinates;  // [経度, 緯度]
      var out = { lat: c[1], lng: c[0] };
      cache.put(key, JSON.stringify(out), 21600); // 6時間キャッシュ
      return out;
    }
    return { error: '住所が見つかりません' };
  } catch (e) {
    return { error: '住所検索エラー' };
  }
}


/* ============================================================
 *  2点間の道路ルート取得（OSRM・キャッシュ付き）
 * ============================================================ */
function getRoute_(from, to) {
  var cache = CacheService.getScriptCache();
  var key = 'rt_' + from.lat.toFixed(5) + ',' + from.lng.toFixed(5)
          + '_' + to.lat.toFixed(5) + ',' + to.lng.toFixed(5);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  try {
    var url = 'https://router.project-osrm.org/route/v1/driving/'
            + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat
            + '?overview=false';
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(res.getContentText());
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      var out = {
        distanceM: data.routes[0].distance,
        durationS: data.routes[0].duration
      };
      cache.put(key, JSON.stringify(out), 21600); // 6時間キャッシュ
      return out;
    }
    return { error: 'ルートが見つかりません' };
  } catch (e) {
    return { error: 'ルート計算エラー' };
  }
}


/* ============================================================
 *  住所 → 緯度・経度（既存ツール互換: 左に緯度・右に経度）
 *   使い方:  =GSI_GEOCODE("京都市左京区下鴨泉川町59")
 *            =GSI_GEOCODE(A2:A100)
 * ============================================================ */
function GSI_GEOCODE(address) {
  if (Array.isArray(address)) {
    return address.map(function (row) {
      var a = Array.isArray(row) ? row[0] : row;
      return geocodeRow_(a);
    });
  }
  return [geocodeRow_(address)];
}

function geocodeRow_(address) {
  if (address === '' || address === null || address === undefined) return ['', ''];
  var p = geocode_(String(address).trim());
  if (p.error) return [p.error, ''];
  return [p.lat, p.lng];
}


/* ============================================================
 *  メニュー: 比較表シートを作成
 * ============================================================ */
function createCompareSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = '運搬距離比較';
  var old = ss.getSheetByName(name);
  if (old) {
    var ui = SpreadsheetApp.getUi();
    var ans = ui.alert('「' + name + '」シートは既にあります。',
      '作り直すと入力済みの内容は消えます。新しく作り直しますか？',
      ui.ButtonSet.YES_NO);
    if (ans !== ui.Button.YES) return;
    ss.deleteSheet(old);
  }
  var sh = ss.insertSheet(name, 0);

  // ---- タイトル ----
  sh.getRange('A1').setValue('運搬距離 比較表（住所または「緯度, 経度」を入力してください）');
  sh.getRange('A1:K1').merge()
    .setFontSize(13).setFontWeight('bold')
    .setFontColor('#ffffff').setBackground('#2d6a4f')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);

  // ---- 見出し（2段） ----
  var head1 = ['', '', '起点', '処分地A', '', '', '処分地B', '', '', '比較', ''];
  var head2 = ['No', '工事名', '発生土の現場\n（住所/緯度,経度）',
               '処分地A\n（住所/緯度,経度）', 'A 道路距離\n(km)', 'A 往復\n(km)',
               '処分地B\n（住所/緯度,経度）', 'B 道路距離\n(km)', 'B 往復\n(km)',
               '近いのは', '距離差\n(km)'];
  sh.getRange(2, 1, 1, 11).setValues([head1]);
  sh.getRange(3, 1, 1, 11).setValues([head2]);

  // 見出し色分け（起点=青 / A=赤 / B=橙 / 比較=紫）
  sh.getRange('C2').setBackground('#1a56db').setFontColor('#fff');
  sh.getRange('D2:F2').merge().setBackground('#e53e3e').setFontColor('#fff');
  sh.getRange('G2:I2').merge().setBackground('#d97706').setFontColor('#fff');
  sh.getRange('J2:K2').merge().setBackground('#7c3aed').setFontColor('#fff');
  sh.getRange('A2:B2').setBackground('#f1f5f9');
  sh.getRange(2, 1, 1, 11).setHorizontalAlignment('center').setFontWeight('bold');

  sh.getRange(3, 1, 1, 11)
    .setBackground('#f1f5f9').setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle')
    .setWrap(true);
  sh.setRowHeight(2, 22);
  sh.setRowHeight(3, 40);

  // ---- データ行（30行分）に式を入れる ----
  var rows = 30;
  var startRow = 4;
  for (var i = 0; i < rows; i++) {
    var r = startRow + i;
    sh.getRange(r, 1).setValue(i + 1);                       // No
    // A 道路距離
    sh.getRange(r, 5).setFormula(
      '=IF(AND($C' + r + '<>"",$D' + r + '<>""),ROAD_DIST($C' + r + ',$D' + r + '),"")');
    // A 往復
    sh.getRange(r, 6).setFormula(
      '=IF(N(E' + r + ')>0,E' + r + '*2,"")');
    // B 道路距離
    sh.getRange(r, 8).setFormula(
      '=IF(AND($C' + r + '<>"",$G' + r + '<>""),ROAD_DIST($C' + r + ',$G' + r + '),"")');
    // B 往復
    sh.getRange(r, 9).setFormula(
      '=IF(N(H' + r + ')>0,H' + r + '*2,"")');
    // 近いのは
    sh.getRange(r, 10).setFormula(
      '=IF(AND(N(E' + r + ')>0,N(H' + r + ')>0),' +
      'IF(E' + r + '<H' + r + ',"A が近い",IF(H' + r + '<E' + r + ',"B が近い","ほぼ同じ")),' +
      'IF(N(E' + r + ')>0,"A のみ",""))');
    // 距離差
    sh.getRange(r, 11).setFormula(
      '=IF(AND(N(E' + r + ')>0,N(H' + r + ')>0),ABS(E' + r + '-H' + r + '),"")');
  }

  // ---- 書式 ----
  sh.getRange(startRow, 5, rows, 1).setNumberFormat('0.0').setFontColor('#c53030').setFontWeight('bold');
  sh.getRange(startRow, 6, rows, 1).setNumberFormat('0.0');
  sh.getRange(startRow, 8, rows, 1).setNumberFormat('0.0').setFontColor('#b45309').setFontWeight('bold');
  sh.getRange(startRow, 9, rows, 1).setNumberFormat('0.0');
  sh.getRange(startRow, 11, rows, 1).setNumberFormat('0.0');
  sh.getRange(startRow, 1, rows, 11).setVerticalAlignment('middle');
  sh.getRange(startRow, 1, rows, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, 5, rows, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, 6, rows, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, 8, rows, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, 9, rows, 1).setHorizontalAlignment('center');
  sh.getRange(startRow, 10, rows, 2).setHorizontalAlignment('center');

  // 列幅
  sh.setColumnWidth(1, 36);    // No
  sh.setColumnWidth(2, 140);   // 工事名
  sh.setColumnWidth(3, 200);   // 起点
  sh.setColumnWidth(4, 200);   // 処分地A
  sh.setColumnWidth(5, 75);    // A距離
  sh.setColumnWidth(6, 70);    // A往復
  sh.setColumnWidth(7, 200);   // 処分地B
  sh.setColumnWidth(8, 75);    // B距離
  sh.setColumnWidth(9, 70);    // B往復
  sh.setColumnWidth(10, 80);   // 近いのは
  sh.setColumnWidth(11, 70);   // 距離差

  // 罫線
  sh.getRange(2, 1, rows + 2, 11).setBorder(true, true, true, true, true, true, '#cbd5e0', SpreadsheetApp.BorderStyle.SOLID);

  // 「近いのは」列に色付き条件（A=赤系 / B=橙系）
  var rules = [];
  var judgeRange = sh.getRange(startRow, 10, rows, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('A').setBackground('#fde2e1').setFontColor('#c53030')
    .setRanges([judgeRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('B').setBackground('#fdebd0').setFontColor('#b45309')
    .setRanges([judgeRange]).build());
  sh.setConditionalFormatRules(rules);

  // 入力欄をうっすら色付け（起点=薄青 / A=薄赤 / B=薄橙）
  sh.getRange(startRow, 3, rows, 1).setBackground('#eff6ff');
  sh.getRange(startRow, 4, rows, 1).setBackground('#fef5f5');
  sh.getRange(startRow, 7, rows, 1).setBackground('#fffaf0');

  // 補足メモ
  var noteRow = startRow + rows + 1;
  sh.getRange(noteRow, 1).setValue(
    '※ 道路距離は0.1km単位で切り上げ（積算対応）。処分地Bは空欄でもA単独で計算できます。' +
    '住所が見つからない場合は「緯度, 経度」を入力してください（例: 35.011, 135.768）。' +
    '出典: 道路距離=OSRM(OpenStreetMap) / 住所検索=国土地理院');
  sh.getRange(noteRow, 1, 1, 11).merge().setFontSize(10).setFontColor('#64748b').setWrap(true);

  sh.setFrozenRows(3);

  SpreadsheetApp.getUi().alert('「運搬距離比較」シートを作成しました。\n\n' +
    'C列に起点、D列に処分地A、G列に処分地B の住所（または「緯度, 経度」）を入れると、' +
    '道路距離が自動で計算されます。');
}


/* ============================================================
 *  使い方
 * ============================================================ */
function showHelp_() {
  var msg =
    '【運搬距離 比較ツール 使い方】\n\n' +
    '■ かんたんに使う\n' +
    '  メニュー「運搬距離ツール → ① 比較表シートを作成」を押すと、\n' +
    '  入力するだけの表ができます。\n' +
    '  C列=起点、D列=処分地A、G列=処分地B に住所を入れるだけ。\n\n' +
    '■ 関数で自分の表に組み込む\n' +
    '  =ROAD_DIST(起点, 処分地)   … 道路距離(km)\n' +
    '  =ROAD_TIME(起点, 処分地)   … 所要時間の目安\n' +
    '  =GSI_GEOCODE(住所)         … 緯度・経度\n\n' +
    '  起点・処分地は「住所」でも「緯度, 経度」でも入力できます。\n' +
    '  例: =ROAD_DIST("大阪市北区梅田1-1-1", "堺市南区原山台1-1")\n\n' +
    '■ 注意\n' +
    '  ・道路距離は 0.1km 単位で切り上げ（積算対応）。\n' +
    '  ・住所が見つからない山林・現場は「緯度, 経度」で入力。\n' +
    '  ・計算には数秒かかることがあります（API通信のため）。';
  SpreadsheetApp.getUi().alert(msg);
}
