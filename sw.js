// Offline support. Network first, so development and updates are never served stale; the cache
// is the fallback when there is no connection. Registered by index.html only (not the preview).
'use strict';

const CACHE = 'qurn-mm-v19';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/tokens.css',
  'css/components.css',
  'assets/branding/svg/wird_mark.svg',
  'assets/branding/svg/wird_mark_inverse.svg',
  'assets/branding/svg/wird_icon_dark.svg',
  'assets/branding/png/favicon_32.png',
  'assets/branding/png/wird_icon_192.png',
  'assets/branding/png/wird_icon_512.png',
  'assets/branding/png/wird_icon_maskable_192.png',
  'assets/branding/png/wird_icon_maskable_512.png',
  'assets/branding/png/wird_icon_monochrome_512.png',
  'js/reference.js',
  'js/format.js',
  'js/model.js',
  'js/viewmodel.js', 'js/knowledge.js', 'js/knowledge_mut.js', 'js/audiocheck.js', 'js/recordings.js',
  'js/ui/icons.js',
  'js/ui/components.js',
  'js/screens/onboarding.js',
  'js/screens/today.js',
  'js/screens/memorized.js',
  'js/screens/progress.js', 'js/screens/recite.js', 'js/screens/knowledge.js',
  'js/screens/settings.js',
  'js/screens/sheets.js',
  'js/app.js',
  'fonts/BasisGrotesqueArabicPro-Light.ttf',
  'fonts/BasisGrotesqueArabicPro-Regular.ttf',
  'fonts/BasisGrotesqueArabicPro-Medium.ttf',
  'fonts/BasisGrotesqueArabicPro-Bold.ttf',
  'fonts/IBMPlexSansArabic-Regular.ttf',
  'fonts/IBMPlexSansArabic-Medium.ttf',
  'fonts/IBMPlexSansArabic-SemiBold.ttf'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});

// Tapping the daily reminder opens (or focuses) the app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list.length ? list[0].focus() : self.clients.openWindow('./')));
});
