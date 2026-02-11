const CACHE_NAME = 'alptekin-qr-ocr-v1';
// Önbellek adını ve versiyonunu belirliyoruz. 
// Kodlarında güncelleme yaptığında burayı 'alptekin-qr-ocr-v2', 'v3' şeklinde değiştirmelisin.
// Uygulamanın internetsiz çalışması için gereken tüm dosyaların listesi
const OFFLINE_DOSYALAR = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon.png',
  './zxing.min.js',
  './tesseract.min.js',
  './cropper.min.css',
  './cropper.min.js',
  './worker.min.js',
  './tesseract-core.wasm.js',
  './tesseract-core.wasm',
  './tur.traineddata.gz' // Eğer dil dosyanın adı veya uzantısı farklıysa burayı mutlaka düzelt
];

// 1. KURULUM (INSTALL) AŞAMASI
// Service Worker ilk yüklendiğinde çalışır ve yukarıdaki dosyaları indirip önbelleğe alır.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Çevrimdışı dosyalar önbelleğe alınıyor...');
        return cache.addAll(OFFLINE_DOSYALAR);
      })
      .then(() => self.skipWaiting())
  );
});

// 2. AKTİFLEŞTİRME (ACTIVATE) AŞAMASI
// Yeni Service Worker devreye girdiğinde çalışır. İnatçı eski önbellekleri burada temizleriz.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Eski önbellek siliniyor:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. GETİRME (FETCH) AŞAMASI
// Uygulama bir dosya istediğinde araya gireriz. Önce önbelleğe bakarız, yoksa internetten deneriz.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
            console.error('[Service Worker] Dosya ne önbellekte var ne de internet bağlantısı mevcut:', event.request.url);
        });
      })
  );
});