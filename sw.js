/* =============================================================================
   SERVICE WORKER — Life OS

   Duas estratégias, por natureza do recurso:

   1. Shell do app (html/css/js/ícones): NETWORK-FIRST. Tenta a rede, guarda o
      resultado, e só cai no cache quando está offline. Assim todo deploy é
      pego no próximo carregamento, sem depender de lembrar de subir a versão.
      (A estratégia antiga era cache-first: servia o app.js velho e só atualizava
      pro carregamento seguinte — foi o que fez o login continuar batendo no
      projeto Firebase errado depois da correção.)
   2. Leituras do Firebase: network-first com fallback pro cache. Online você vê
      sempre o dado atual; offline você vê o último estado conhecido em vez de
      uma tela de erro.

   Escritas (PUT/PATCH/DELETE) e chamadas de auth/IA NUNCA passam por cache —
   sem rede elas falham, e o app já trata esse erro.

   CACHE_VERSION só precisa mudar quando o formato do que é cacheado muda —
   com network-first, deploys normais não exigem bump.
   ============================================================================= */

const CACHE_VERSION = 'lifeos-v2';
const SHELL_CACHE = CACHE_VERSION + '-shell';
const DATA_CACHE  = CACHE_VERSION + '-dados';

/* =============================================================================
   DESPERTADORES — push em segundo plano (Firebase Cloud Messaging)

   O projeto de dados é o anki-71f4f (não confundir com o de hosting, ver nota
   em CLAUDE.md) — é o config abaixo que tem que apontar pra lá, senão o token
   gerado não bate com o que a Cloud Function usa pra mandar o push.
   ============================================================================= */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAQqB__M-gKZWHS4zQ1eIA-X6rGqzVtr0I',
  projectId: 'anki-71f4f',
  messagingSenderId: '319058865898',
  appId: '1:319058865898:web:7766cd5d90cb2fdc203193'
});
const messaging = firebase.messaging();

// A Cloud Function manda só "data" (não "notification") de propósito: assim
// quem decide como mostrar é este handler, não o comportamento padrão do
// navegador — o que permite tratar o clique e abrir direto na tela Acordar.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  self.registration.showNotification(d.titulo || 'Hora de acordar! ⏰', {
    body: d.corpo || 'Toque para abrir o Life OS.',
    icon: 'icon.svg',
    tag: 'despertador',
    requireInteraction: true,
    data: d
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Lembrete só abre o app normal; só o despertador sequestra pra tela Acordar.
  const ehDespertador = (event.notification.data || {}).tipo !== 'lembrete';
  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const client of clientList){
      if(ehDespertador) client.postMessage({ tipo: 'abrir-acordar' });
      if('focus' in client) return client.focus();
    }
    if(self.clients.openWindow) return self.clients.openWindow(ehDespertador ? './?despertador=1' : './');
  })());
});

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app-core.js',
  './js/app-db-casa.js',
  './js/app-objetivos-vision.js',
  './js/app-decisoes-auth-notas.js',
  './js/app-diario-hoje.js',
  './js/app-agenda-tarefas.js',
  './js/app-widgets-boot.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './platform-favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll falha inteiro se um arquivo falhar; individualmente, um 404 num
      // recurso opcional não impede a instalação.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => !n.startsWith(CACHE_VERSION)).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// A URL do Firebase carrega o token em ?auth=... — o token gira, então usar a
// URL crua como chave faria o cache errar sempre. A chave normalizada tira a
// query e mantém só o caminho do nó.
function chaveDeDados(url) {
  const u = new URL(url);
  return new Request(u.origin + u.pathname, { method: 'GET' });
}

function ehLeituraDeDados(request, url) {
  return request.method === 'GET' && url.hostname.endsWith('firebaseio.com');
}

function ehShell(request, url) {
  return request.method === 'GET'
    && url.origin === self.location.origin
    && !url.pathname.startsWith('/__');   // rotas do harness de dev
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // Auth, IA e escritas: sempre rede, nunca cache.
  if (request.method !== 'GET') return;
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('openai.com')) return;

  if (ehLeituraDeDados(request, url)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copia = res.clone();
          caches.open(DATA_CACHE).then((c) => c.put(chaveDeDados(request.url), copia));
          return res;
        })
        .catch(() => caches.open(DATA_CACHE)
          .then((c) => c.match(chaveDeDados(request.url)))
          // Só existe "último estado conhecido" quando já houve uma leitura bem-
          // sucedida desse caminho antes. Sem cache, devolver 200 com `null`
          // mentia "este caminho nunca existiu" — e as telas com seed on first
          // load (Finanças, Timeline, checklist de Acordar) tratam null como
          // "conta nova", podendo regravar o padrão por cima do dado real assim
          // que a rede voltar. Sem cache, o status precisa continuar sendo erro:
          // dbFetch() já sabe transformar isso num "tentar novamente" visível.
          .then((hit) => hit || new Response(JSON.stringify({ erro: 'offline-sem-cache' }), {
            status: 503, statusText: 'Offline sem dado em cache',
            headers: { 'Content-Type': 'application/json' }
          })))
    );
    return;
  }

  if (ehShell(request, url)) {
    // Network-first: a rede vence sempre que existe; o cache é só a rede de
    // segurança pra quando está offline.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.status === 200) {
            const copia = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copia));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
