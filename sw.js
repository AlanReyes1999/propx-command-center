/* MEDS PropX Command Center - offline shell (network-first document, cached fallback) */
const CV='ppx-shell-v2';
const PRE=['/','/index.html','/favicon.ico','/favicon.svg','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CV).then(c=>c.addAll(PRE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CV).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return; /* GAS y terceros: red directa */
  if(e.request.mode==='navigate'||u.pathname==='/'||u.pathname.endsWith('/index.html')){
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CV).then(c=>c.put('/index.html',cp));return r;})
      .catch(()=>caches.match('/index.html')));
    return;}
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const cp=r.clone();caches.open(CV).then(c=>c.put(e.request,cp));return r;}).catch(()=>hit)));
});
