const VERSION = 'lectura-v1.0.0-test';
const SHELL = ['./'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
