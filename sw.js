const CACHE_NAME = 'alptekin-qr-ocr-v1';

// Uygulama açılır açılmaz önbelleğe alınacak temel dosyalar (Statik Önbellek)
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './zxing.min.js',
  './tesseract.min.js',
  './cropper.min.css',
  './cropper.min.js',
  './icon.png',
  './worker.min.js',
  './tesseract-core.wasm.js',
  './tur.traineddata.gz'
];

// Kurulum (Install) Aşaması: Temel dosyaları indir ve önbelleğe (cache) yaz
self.addEventListener('install', event => {
  self.skipWaiting(); // Yeni versiyon gelirse hemen devreye al
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Temel dosyalar önbelleğe alınıyor...');
        return cache.addAll(urlsToCache);
      })
  );
});

// Aktivasyon (Activate) Aşaması: Eski önbellekleri temizle
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eski önbellek siliniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Kontrolü hemen ele al
});

// Yakalama (Fetch) Aşaması: Ağ isteklerini dinle ve Çevrimdışı desteği sağla
self.addEventListener('fetch', event => {
  // Sadece GET isteklerini işle (POST/PUT gibi istekler önbelleğe alınmaz)
  if (event.request.method !== 'GET') return;

  // Tarayıcı eklentileri gibi http/https olmayan istekleri atla
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 1. Önbellekte varsa doğrudan oradan ver (Maksimum hız ve offline destek)
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. Önbellekte yoksa internetten indir (Ağ isteği yap)
      return fetch(event.request).then(networkResponse => {
        // Geçerli bir yanıt değilse doğrudan döndür
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
          return networkResponse;
        }

        // 3. Tesseract'ın indirdiği dil dosyaları gibi dinamik verileri de önbelleğe kaydet
        // Yanıt sadece bir kez okunabildiği için kopyasını (clone) oluşturuyoruz
        const responseToCache = networkResponse.clone();
        
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(error => {
        // İnternet yoksa ve dosya önbellekte de bulunamadıysa (Hata yönetimi)
        console.warn('Ağ isteği başarısız oldu ve önbellekte yok:', event.request.url);
        // İstenirse burada özel bir offline.html veya varsayılan bir görsel döndürülebilir
      });
    })
  );
});