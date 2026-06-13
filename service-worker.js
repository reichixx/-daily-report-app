// このService Workerは「古いキャッシュを削除して自分自身も消える」ためのものです。
// 過去にキャッシュした古い日報アプリを端末から一掃し、常に最新版を読み込ませます。

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // すべてのキャッシュを削除
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // このService Worker自身の登録を解除
    await self.registration.unregister();
    // 開いているページを再読み込みして最新版を表示
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => client.navigate(client.url));
  })());
});
