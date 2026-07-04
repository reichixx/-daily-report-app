/**
 * ============================================================
 * 緯度・経度 変換ツール（Googleスプレッドシート用）
 * ------------------------------------------------------------
 *  1) GSI_GEOCODE(住所)  … 住所 → 緯度・経度（国土地理院・APIキー不要）
 *  2) DMS2DEC(文字列)    … 度分秒/度分の表記 → 小数
 * ============================================================
 */

/**
 * 住所から緯度・経度を取得します（国土地理院ジオコーダー利用）。
 *   使い方:  =GSI_GEOCODE("京都市左京区下鴨泉川町59")
 *   結果  :  左のセルに「緯度」、右のセルに「経度」が入ります（小数）。
 *   範囲もOK: =GSI_GEOCODE(A2:A100) のようにまとめて変換できます。
 */
function GSI_GEOCODE(address) {
  if (Array.isArray(address)) {
    return address.map(function (row) {
      var a = Array.isArray(row) ? row[0] : row;
      return geocodeOne_(a);
    });
  }
  return [geocodeOne_(address)];
}

function geocodeOne_(address) {
  if (address === "" || address === null || address === undefined) return ["", ""];
  try {
    var url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q="
            + encodeURIComponent(String(address).trim());
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(res.getContentText());
    if (data && data.length > 0 && data[0].geometry) {
      var c = data[0].geometry.coordinates; // [経度, 緯度] の順で返ってくる
      return [c[1], c[0]];                   // [緯度, 経度] に並べ替えて返す
    }
    return ["見つかりません", ""];
  } catch (e) {
    return ["エラー", ""];
  }
}

/**
 * 度分秒(DMS)や度分(DM)の表記を小数に変換します。
 *   使い方:  =DMS2DEC("35°00'30\"N")     → 35.00833...
 *   対応例:  35°00'30"N  /  35 0 30 N  /  135°45.5'E  /  N35.00833  /  -122.4
 *   範囲もOK: =DMS2DEC(A2:A100)
 */
function DMS2DEC(text) {
  if (Array.isArray(text)) {
    return text.map(function (row) {
      var t = Array.isArray(row) ? row[0] : row;
      return [dms2decOne_(t)];
    });
  }
  return dms2decOne_(text);
}

function dms2decOne_(text) {
  if (text === "" || text === null || text === undefined) return "";
  var s = String(text).trim().toUpperCase();
  // 方位（S/W）または先頭マイナスならマイナス
  var sign = (/^-/.test(s) || /[SW]/.test(s)) ? -1 : 1;
  // 数字（小数含む）だけを順番に取り出す
  var nums = s.replace(/[NSEW]/g, "").match(/[\d.]+/g);
  if (!nums) return "";
  var deg = parseFloat(nums[0]) || 0;
  var min = nums.length > 1 ? parseFloat(nums[1]) : 0;
  var sec = nums.length > 2 ? parseFloat(nums[2]) : 0;
  return sign * (deg + min / 60 + sec / 3600);
}
