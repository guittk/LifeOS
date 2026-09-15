  /* ---------- Tema (claro / escuro / sistema) ----------
     Aplicado antes de qualquer outra coisa pra não haver "flash" do tema errado.
     'sistema' não escreve data-theme nenhum no <html>: nesse estado quem decide
     é o @media (prefers-color-scheme) do CSS. */
  const THEME_KEY = 'lifeosTheme';
  const THEME_MODES = ['sistema', 'claro', 'escuro'];
  let temaAtual = 'sistema';

  function temaEfetivo(){
    if(temaAtual === 'claro') return 'claro';
    if(temaAtual === 'escuro') return 'escuro';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }
  function applyTheme(mode){
    temaAtual = THEME_MODES.indexOf(mode) === -1 ? 'sistema' : mode;
    const root = document.documentElement;
    if(temaAtual === 'sistema') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', temaAtual === 'escuro' ? 'dark' : 'light');
    // Barra do sistema no celular (e no app instalado) acompanha o tema.
    const metaTema = document.querySelector('meta[name="theme-color"]');
    if(metaTema) metaTema.setAttribute('content', temaEfetivo() === 'escuro' ? '#15161f' : '#eceaf4');
    document.querySelectorAll('.theme-opt').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-theme-mode') === temaAtual);
    });
    // O acento precisa ser recalculado: o mesmo hex não serve nos dois fundos.
    applyCorPrincipal(localStorage.getItem('corPrincipal') || COR_PRINCIPAL_PADRAO);
  }
  function escolherTema(mode){
    applyTheme(mode);
    localStorage.setItem(THEME_KEY, temaAtual);
    if(typeof session !== 'undefined' && session){
      dbPatchSilent(userPath('/Config'), { tema: temaAtual })
        .catch(err => console.error('Erro ao salvar o tema', err));
    }
  }
  /* ---------- Aparência: cor principal customizável ---------- */
  const COR_PRINCIPAL_PADRAO = '#60519b';
  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if(!m) return { r:96, g:81, b:155 };
    return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
  }
  // Paleta Cyberpunk Cartoon: violeta da referência + os neons de função.
  const COR_PRINCIPAL_PRESETS = [
    '#60519b', '#7a68c4', '#4f6fd1', '#0f9fb8', '#12a594', '#4f8f0c',
    '#8a9a3f', '#a86a00', '#d1745f', '#c62b4a', '#d1327c', '#9b3fb0',
    '#5a4da8', '#3f7d9e', '#6a91b4', '#7d6f5c',
    '#ff5ea8', '#34d9f0', '#b8f34a', '#ffb020'
  ];
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  /* Ajuste do acento por tema, em HSL.
     Misturar o hex com branco clareia mas DESSATURA: o violeta #60519b vira um
     lilás acinzentado sem energia nenhuma — exatamente o oposto do neon que a
     direção pede. Mexer em luminosidade e saturação separadamente mantém a cor
     viva no fundo escuro. */
  function hexToHsl(hex){
    let { r, g, b } = hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if(max !== min){
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if(max === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if(max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  }
  function hslToRgb(h, s, l){
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if(h < 60){ r = c; g = x; }
    else if(h < 120){ r = x; g = c; }
    else if(h < 180){ g = c; b = x; }
    else if(h < 240){ g = x; b = c; }
    else if(h < 300){ r = x; b = c; }
    else { r = c; b = x; }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }
  function applyCorPrincipal(hex){
    if(!hex) hex = COR_PRINCIPAL_PADRAO;
    const escuro = temaEfetivo() === 'escuro';
    const hsl = hexToHsl(hex);
    // No escuro: bem mais claro e mais saturado, pra virar neon em vez de pastel.
    const c = escuro
      ? hslToRgb(hsl.h, clamp(hsl.s + 35, 0, 88), clamp(hsl.l + 28, 58, 78))
      : hexToRgb(hex);
    const { r, g, b } = c;
    const efetivo = `rgb(${r},${g},${b})`;
    const root = document.documentElement.style;
    root.setProperty('--sage', efetivo);
    root.setProperty('--sage-soft', `rgba(${r},${g},${b},${escuro ? 0.16 : 0.13})`);
    root.setProperty('--sage-line', `rgba(${r},${g},${b},0.45)`);
    // Variante escura do acento (usada no gradiente da marca).
    const d = hslToRgb(hsl.h, hsl.s, clamp(hsl.l - 18, 12, 60));
    root.setProperty('--sage-dark', `rgb(${d.r},${d.g},${d.b})`);
    // O botão do seletor mostra sempre o hex escolhido, não o ajustado.
    const swatchBtn = document.getElementById('corPrincipalSwatchBtn');
    if(swatchBtn) swatchBtn.style.background = hex;
    document.querySelectorAll('.cor-swatch-option').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-cor') === hex);
    });
  }

  // Só agora: applyTheme() chama applyCorPrincipal(), que depende das constantes
  // acima — inverter a ordem daria erro de acesso antes da inicialização.
  applyTheme(localStorage.getItem(THEME_KEY) || 'sistema');
  // Quem está em "sistema" acompanha a troca do SO em tempo real.
  try{
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if(temaAtual === 'sistema') applyTheme('sistema');
    });
  }catch(e){ /* navegador antigo: só não acompanha a troca ao vivo */ }

  /* ---------- Acessibilidade ----------
     O HTML tinha 3 atributos aria em 1.300 linhas e nenhum tabindex. Isto aqui
     marca as regiões e os diálogos de uma vez, em vez de espalhar atributos por
     dezenas de blocos de markup. */
  (function marcarSemantica(){
    const main = document.querySelector('.main');
    if(main){ main.setAttribute('role', 'main'); main.setAttribute('id', 'conteudo'); }

    // Todo modal do app usa a mesma casca .confirm-modal / .confirm-modal-panel.
    document.querySelectorAll('.confirm-modal, .search-modal').forEach(m => {
      const painel = m.querySelector('.confirm-modal-panel, .search-modal-panel');
      if(!painel) return;
      painel.setAttribute('role', 'dialog');
      painel.setAttribute('aria-modal', 'true');
      // O primeiro texto do painel serve de nome acessível do diálogo.
      const titulo = painel.querySelector('.confirm-modal-text, .search-modal-input');
      if(titulo){
        if(!titulo.id) titulo.id = 'dlg-t-' + Math.random().toString(36).slice(2, 8);
        painel.setAttribute('aria-labelledby', titulo.id);
      }
    });

    /* Focus trap: sem isso o Tab escapa do diálogo e vai navegando pela página
       atrás dele — quem usa teclado ou leitor de tela se perde e não acha o
       botão de fechar. Um listener só, na captura, serve todos os modais. */
    document.addEventListener('keydown', (e) => {
      if(e.key !== 'Tab') return;
      const modal = document.querySelector('.confirm-modal.active, .search-modal.active');
      if(!modal) return;
      const foco = modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
        'select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
      );
      const visiveis = Array.from(foco).filter(el => el.offsetParent !== null || el === document.activeElement);
      if(!visiveis.length) return;
      const primeiro = visiveis[0];
      const ultimo = visiveis[visiveis.length - 1];
      // Foco fora do modal (veio da página atrás): traz pra dentro.
      if(!modal.contains(document.activeElement)){
        e.preventDefault();
        primeiro.focus();
        return;
      }
      if(e.shiftKey && document.activeElement === primeiro){
        e.preventDefault();
        ultimo.focus();
      }else if(!e.shiftKey && document.activeElement === ultimo){
        e.preventDefault();
        primeiro.focus();
      }
    }, true);

    // Botões que só têm ícone ou símbolo não dizem nada a um leitor de tela.
    const rotulos = {
      visionLayersCloseBtn: 'Fechar o painel de camadas',
      corPrincipalSwatchBtn: 'Escolher a cor principal',
      importIcsBtn: 'Importar eventos de um arquivo .ics',
      notasCategoriasBtn: 'Gerenciar categorias das Notas'
    };
    Object.entries(rotulos).forEach(([id, rotulo]) => {
      const el = document.getElementById(id);
      if(el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', rotulo);
    });
  })();

  /* ---------- PWA: service worker ----------
     Só registra sob http/https. Aberto como file:// o navegador bloqueia, e a
     exceção não tratada apareceria no console sem motivo. */
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .catch(err => console.warn('Service worker não registrado:', err));
    });
  }

  /* ---------- Notificações ----------
     O app esperava você lembrar dele. Dois avisos, e só dois — mais que isso
     vira ruído e a pessoa desliga tudo.

     LIMITE HONESTO: sem servidor de push, estes avisos só disparam com o app
     aberto (inclusive instalado, rodando em segundo plano no celular). Push
     de verdade, com o app fechado, exigiria Firebase Cloud Messaging e uma
     function — fica fora do escopo atual. */
  const NOTIF_KEY = 'lifeosNotificacoes';
  let notifTimer = null;

  function notificacoesLigadas(){
    return localStorage.getItem(NOTIF_KEY) === 'sim' &&
           typeof Notification !== 'undefined' && Notification.permission === 'granted';
  }

  async function pedirPermissaoNotificacoes(){
    if(typeof Notification === 'undefined'){
      showAppMessage('Este navegador não suporta notificações.', 'error');
      return false;
    }
    let permissao = Notification.permission;
    if(permissao === 'default') permissao = await Notification.requestPermission();
    if(permissao !== 'granted'){
      localStorage.setItem(NOTIF_KEY, 'nao');
      showAppMessage('Notificações bloqueadas pelo navegador.', 'error');
      atualizarBotaoNotificacoes();
      return false;
    }
    localStorage.setItem(NOTIF_KEY, 'sim');
    atualizarBotaoNotificacoes();
    new Notification('Life OS', { body: 'Pronto — vou te avisar do essencial.', icon: 'icon.svg' });
    registrarTokenFcm();
    return true;
  }

  /* Registra este dispositivo pra receber despertadores por push (funciona
     com o app fechado/celular bloqueado — ver functions/index.js). Sem chave
     VAPID configurada, ou em navegador sem suporte, falha em silêncio: o
     despertador continua funcionando do jeito antigo, só com a aba aberta. */
  let fcmMessagingApp = null;
  function getFcmMessaging(){
    if(fcmMessagingApp) return fcmMessagingApp;
    if(typeof firebase === 'undefined' || !firebase.messaging) return null;
    try{
      if(!firebase.apps.length) firebase.initializeApp(FCM_CONFIG);
      fcmMessagingApp = firebase.messaging();
      // Mensagens em primeiro plano são ignoradas de propósito: a checagem
      // local (checarDespertadores, a cada 20s) já cobre a aba aberta —
      // tratar as duas dispararia a tela Acordar duas vezes.
      fcmMessagingApp.onMessage(() => {});
      return fcmMessagingApp;
    }catch(err){
      console.warn('Push não suportado neste navegador:', err);
      return null;
    }
  }
  async function registrarTokenFcm(){
    if(!FCM_VAPID_KEY || !notificacoesLigadas() || !session) return;
    try{
      const messaging = getFcmMessaging();
      if(!messaging || !('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: reg });
      if(token) await dbPutSilent(userPath('/FcmTokens/' + token), true);
    }catch(err){
      console.warn('Não consegui registrar este dispositivo pra despertadores por push:', err);
    }
  }
  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
    if(event.data && event.data.tipo === 'abrir-acordar') abrirTelaAcordar(
      new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    );
  });

  function atualizarBotaoNotificacoes(){
    const btn = document.getElementById('notificacoesBtn');
    if(!btn) return;
    const bloqueado = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    btn.textContent = bloqueado ? 'Bloqueadas no navegador'
                    : notificacoesLigadas() ? 'Desativar' : 'Ativar';
    btn.disabled = bloqueado;
  }

  // Dispara uma vez por chave por dia — o registro fica no localStorage, então
  // trocar de aba ou recarregar não faz o aviso repetir.
  function avisar(chave, titulo, corpo){
    if(!notificacoesLigadas()) return;
    const hoje = todayStr();
    const marca = hoje + '_' + chave;
    let disparados = {};
    try{ disparados = JSON.parse(localStorage.getItem('lifeosAvisosDisparados') || '{}'); }catch(e){ /* ignore */ }
    if(disparados[marca]) return;
    // Limpa marcas de dias anteriores pra não acumular pra sempre.
    Object.keys(disparados).forEach(k => { if(!k.startsWith(hoje)) delete disparados[k]; });
    disparados[marca] = 1;
    localStorage.setItem('lifeosAvisosDisparados', JSON.stringify(disparados));
    try{
      new Notification(titulo, { body: corpo, icon: 'icon.svg', tag: marca });
    }catch(e){ console.warn('Falha ao notificar:', e); }
  }

  async function checarAvisos(){
    if(!notificacoesLigadas() || !session) return;
    const agora = new Date();
    const nowMin = agora.getHours() * 60 + agora.getMinutes();
    const hoje = todayStr();

    try{
      // 1) Início de bloco da rotina
      const janela = await calcularJanelaLivre();
      janela.blocos.forEach(b => {
        // Janela de 2 minutos para não perder o disparo entre um tick e outro.
        if(b.inicio <= nowMin && nowMin < b.inicio + 2){
          avisar('rotina_' + b.id, b.nome, 'Começa agora, até ' + minutosParaHora(b.fim) + '.');
        }
      });

      // 2) Refeição com dose de insulina
      const [paConfig, planoDia, mealLog] = await Promise.all([
        dbGet(userPath('/PlanoAlimentarConfig')),
        dbGet(userPath('/PlanoAlimentar/' + agora.getDay())),
        dbGet(userPath('/MealLog/' + hoje))
      ]);
      const cfg = paConfig || {}, log = mealLog || {};
      Object.entries((planoDia || {}).refeicoes || {}).forEach(([mid, r]) => {
        const hm = rotToMinutes(r.horario);
        if(hm == null || log[mid]) return;
        if(hm <= nowMin && nowMin < hm + 2){
          const dose = INSULINA_REFEICOES
            .filter(x => (r.nome || '').toLowerCase().includes(x.label.toLowerCase().split(' ')[0]))
            .map(x => Number(cfg['insulina' + x.key + 'Ui']) || 0)
            .find(v => v > 0);
          avisar('refeicao_' + mid, r.nome || 'Refeição',
                 dose ? 'Hora da refeição — dose de ' + dose + ' UI.' : 'Hora da refeição.');
        }
      });
    }catch(err){
      console.warn('Falha ao checar avisos:', err);
    }
  }
  function minutosParaHora(m){
    return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
  }
  function iniciarAgendadorDeAvisos(){
    clearInterval(notifTimer);
    notifTimer = setInterval(checarAvisos, 60000); // um tick por minuto
    checarAvisos();
  }

  /* ---------- Despertadores ----------
     Mesmo LIMITE HONESTO dos avisos acima: sem servidor de push, só tocam com
     o app aberto. Ao contrário dos avisos, não dependem do toggle de
     notificações — o som e a tela de Acordar funcionam só com a aba aberta,
     sem precisar de permissão nenhuma do navegador (a Notification do sistema,
     quando ligada, é só um reforço a mais). */
  let despertadores = {};
  let acordarChecklist = {};
  let despertadorTimer = null;
  let despertadorTocandoId = null;
  let despertadorAudioCtx = null;
  let despertadorBeepTimer = null;
  let despertadorAutoStopTimer = null;
  let acordarFeitos = new Set();

  const ACORDAR_CHECKLIST_PADRAO = [
    'Fazer café', 'Tomar banho', 'Escovar os dentes', 'Tomar café', 'Pegar marmita',
    'Pegar lanche da tarde', 'Pegar headset', 'Água', 'Cabos'
  ];
  function acordarChecklistSeed(){
    const obj = {};
    ACORDAR_CHECKLIST_PADRAO.forEach((texto, i) => { const id = newId(); obj[id] = { id, texto, ordem:i }; });
    return obj;
  }
  // Lembretes são a mesma coleção que os despertadores (tipo:'lembrete' em
  // vez de 'despertador', que é o padrão quando o campo não existe — os
  // despertadores criados antes desse campo existir continuam válidos).
  // Diferem só no que acontece ao disparar: sem som, sem sequestrar a tela.
  const LEMBRETES_PADRAO_HORAS = ['08:00', '12:00', '18:00'];
  async function carregarDespertadores(){
    const [desps, checklist] = await Promise.all([
      dbGet(userPath('/Despertadores')),
      dbGet(userPath('/AcordarChecklist'))
    ]);
    despertadores = desps || {};
    if(!Object.values(despertadores).some(d => d.tipo === 'lembrete')){
      const todosDias = [0, 1, 2, 3, 4, 5, 6];
      let ordem = Object.keys(despertadores).length;
      const novos = {};
      LEMBRETES_PADRAO_HORAS.forEach(hora => {
        const id = newId();
        novos[id] = { id, tipo:'lembrete', hora, dias:[...todosDias], ativo:true, ordem: ordem++ };
      });
      despertadores = { ...despertadores, ...novos };
      await Promise.all(Object.values(novos).map(d => dbPutSilent(userPath('/Despertadores/' + d.id), d)));
    }
    if(!checklist){
      acordarChecklist = acordarChecklistSeed();
      await dbPutSilent(userPath('/AcordarChecklist'), acordarChecklist);
    } else {
      acordarChecklist = checklist;
    }
  }

  function iniciarChecagemDeDespertadores(){
    clearInterval(despertadorTimer);
    despertadorTimer = setInterval(checarDespertadores, 20000);
    checarDespertadores();
  }
  function checarDespertadores(){
    if(!session || despertadorTocandoId) return;
    const agora = new Date();
    const hhmm = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
    const diaSemana = agora.getDay();
    const hoje = todayStr();
    let disparados = {};
    try{ disparados = JSON.parse(localStorage.getItem('lifeosDespertadoresDisparados') || '{}'); }catch(e){ /* ignore */ }
    Object.values(despertadores).some(d => {
      if(d.ativo === false || d.hora !== hhmm) return false;
      if(d.dias && d.dias.length && !d.dias.includes(diaSemana)) return false;
      const marca = hoje + '_' + d.id;
      if(disparados[marca]) return false;
      Object.keys(disparados).forEach(k => { if(!k.startsWith(hoje)) delete disparados[k]; });
      disparados[marca] = 1;
      localStorage.setItem('lifeosDespertadoresDisparados', JSON.stringify(disparados));
      if(d.tipo === 'lembrete') dispararLembrete(d); else dispararDespertador(d);
      return true; // um por vez — se dois batem no mesmo minuto, o próximo pega no tick seguinte
    });
  }
  function dispararLembrete(d){
    if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
      try{ new Notification('Life OS', { body:'Hora de dar uma olhada na plataforma.', icon:'icon.svg', tag:'lembrete_' + d.id }); }catch(e){ /* ignore */ }
    }
    showAppMessage('Hora de dar uma olhada no Life OS.', 'info');
  }
  function tocarSomDespertador(){
    pararSomDespertador();
    try{
      despertadorAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const bipar = () => {
        if(!despertadorAudioCtx) return;
        if(despertadorAudioCtx.state === 'suspended') despertadorAudioCtx.resume().catch(() => {});
        const t = despertadorAudioCtx.currentTime;
        const osc = despertadorAudioCtx.createOscillator();
        const gain = despertadorAudioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
        osc.connect(gain); gain.connect(despertadorAudioCtx.destination);
        osc.start(t); osc.stop(t + 0.45);
      };
      bipar();
      despertadorBeepTimer = setInterval(bipar, 800);
    }catch(e){ console.warn('Não consegui tocar o som do despertador:', e); }
  }
  function pararSomDespertador(){
    clearInterval(despertadorBeepTimer); despertadorBeepTimer = null;
    if(despertadorAudioCtx){ despertadorAudioCtx.close().catch(() => {}); despertadorAudioCtx = null; }
  }
  function abrirTelaAcordar(horaLabel){
    acordarFeitos = new Set();
    const el = document.getElementById('acordarHora');
    if(el) el.textContent = horaLabel;
    goToView('acordar');
    renderAcordarChecklist();
  }
  function dispararDespertador(d){
    despertadorTocandoId = d.id;
    tocarSomDespertador();
    clearTimeout(despertadorAutoStopTimer);
    despertadorAutoStopTimer = setTimeout(pararSomDespertador, 120000); // não toca pra sempre se ninguém mexer
    if(typeof Notification !== 'undefined' && Notification.permission === 'granted'){
      try{ new Notification('Hora de acordar! ⏰', { body: 'Toque para abrir o Life OS.', icon:'icon.svg', tag:'despertador' }); }catch(e){ /* ignore */ }
    }
    abrirTelaAcordar(d.hora);
  }
  function renderAcordarChecklist(){
    const list = document.getElementById('acordarChecklistList');
    if(!list) return;
    const itens = Object.values(acordarChecklist).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if(!itens.length){
      list.innerHTML = '<p class="empty-state">Nenhum item na checklist ainda — adicione em Configurações → Despertadores.</p>';
      return;
    }
    list.innerHTML = itens.map(it => '<label class="acordar-item' + (acordarFeitos.has(it.id) ? ' feito' : '') + '">' +
      '<input type="checkbox" data-acordar-item="' + it.id + '"' + (acordarFeitos.has(it.id) ? ' checked' : '') + '>' +
      '<span>' + escapeHtml(it.texto) + '</span></label>').join('');
    list.querySelectorAll('[data-acordar-item]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-acordar-item');
        if(cb.checked) acordarFeitos.add(id); else acordarFeitos.delete(id);
        cb.closest('.acordar-item').classList.toggle('feito', cb.checked);
      });
    });
  }
  document.getElementById('acordarSilenciarBtn').addEventListener('click', () => {
    pararSomDespertador();
  });
  document.getElementById('acordarProntoBtn').addEventListener('click', () => {
    pararSomDespertador();
    despertadorTocandoId = null;
    goToView('hoje');
  });

  /* Config → listas de despertadores e lembretes (mesma coleção, campo tipo
     diferente) + checklist. CRUD simples, sem modal. */
  const DESP_DIAS_LABEL = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  async function criarAlarme(tipo, defaults){
    const itens = Object.values(despertadores);
    const d = { id:newId(), tipo, hora:'07:00', dias:[1,2,3,4,5], ativo:true, ordem:itens.length, ...defaults };
    despertadores[d.id] = d;
    await dbPutSilent(userPath('/Despertadores/' + d.id), d);
    return d;
  }
  async function atualizarDespertador(id, patch){
    if(!despertadores[id]) return;
    despertadores[id] = { ...despertadores[id], ...patch };
    await dbPatchSilent(userPath('/Despertadores/' + id), patch);
  }
  async function excluirDespertador(id){
    delete despertadores[id];
    await dbDeleteSilent(userPath('/Despertadores/' + id));
  }
  function renderListaDeAlarmes(tipo, containerId, vazioTexto, confirmTexto){
    const list = document.getElementById(containerId);
    if(!list) return;
    const refazer = () => renderListaDeAlarmes(tipo, containerId, vazioTexto, confirmTexto);
    const itens = Object.values(despertadores)
      .filter(d => (d.tipo || 'despertador') === tipo)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if(!itens.length){
      list.innerHTML = '<p class="catcfg-vazio">' + vazioTexto + '</p>';
      return;
    }
    list.innerHTML = itens.map(d => '<div class="desp-row' + (d.ativo === false ? ' desp-off' : '') + '" data-desp-id="' + d.id + '">' +
      '<input type="time" class="desp-hora" data-desp-hora="' + d.id + '" value="' + (d.hora || '07:00') + '">' +
      '<div class="desp-dias">' + DESP_DIAS_LABEL.map((lbl, i) =>
        '<button type="button" class="desp-dia' + ((d.dias || []).includes(i) ? ' on' : '') + '" data-desp-dia="' + d.id + '" data-dia-idx="' + i + '">' + lbl + '</button>'
      ).join('') + '</div>' +
      '<button type="button" class="desp-toggle' + (d.ativo === false ? '' : ' on') + '" data-desp-toggle="' + d.id + '" title="' + (d.ativo === false ? 'Ativar' : 'Desativar') + '">' + (d.ativo === false ? '○' : '●') + '</button>' +
      '<button type="button" class="desp-del" data-desp-del="' + d.id + '" title="Excluir">🗑</button>' +
      '</div>').join('');
    list.querySelectorAll('[data-desp-hora]').forEach(inp => {
      inp.addEventListener('change', () => atualizarDespertador(inp.getAttribute('data-desp-hora'), { hora: inp.value }));
    });
    list.querySelectorAll('[data-desp-dia]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-desp-dia');
        const idx = Number(btn.getAttribute('data-dia-idx'));
        const dias = new Set(despertadores[id].dias || []);
        dias.has(idx) ? dias.delete(idx) : dias.add(idx);
        const novoDias = [...dias].sort();
        btn.classList.toggle('on', dias.has(idx));
        await atualizarDespertador(id, { dias: novoDias });
      });
    });
    list.querySelectorAll('[data-desp-toggle]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-desp-toggle');
        await atualizarDespertador(id, { ativo: despertadores[id].ativo === false });
        refazer();
      });
    });
    list.querySelectorAll('[data-desp-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-desp-del');
        if(!await showConfirm(confirmTexto)) return;
        await excluirDespertador(id);
        refazer();
      });
    });
  }
  function renderDespertadoresConfig(){
    renderListaDeAlarmes('despertador', 'despertadoresList', 'Nenhum despertador configurado — toque em "+ Novo despertador" pra escolher horário e dias.', 'Excluir este despertador?');
  }
  function renderLembretesConfig(){
    renderListaDeAlarmes('lembrete', 'lembretesList', 'Nenhum lembrete configurado — toque em "+ Novo lembrete" pra criar um.', 'Excluir este lembrete?');
  }
  const despertadorAddBtn = document.getElementById('despertadorAddBtn');
  if(despertadorAddBtn) despertadorAddBtn.addEventListener('click', async () => {
    await criarAlarme('despertador');
    renderDespertadoresConfig();
  });
  const lembreteAddBtn = document.getElementById('lembreteAddBtn');
  if(lembreteAddBtn) lembreteAddBtn.addEventListener('click', async () => {
    await criarAlarme('lembrete', { dias:[0,1,2,3,4,5,6] }); // lembrete nasce todo dia, despertador nasce seg-sex
    renderLembretesConfig();
  });

  async function criarAcordarChecklistItem(texto){
    const itens = Object.values(acordarChecklist);
    const it = { id:newId(), texto: texto || 'Novo item', ordem:itens.length };
    acordarChecklist[it.id] = it;
    await dbPutSilent(userPath('/AcordarChecklist/' + it.id), it);
    return it;
  }
  async function excluirAcordarChecklistItem(id){
    delete acordarChecklist[id];
    await dbDeleteSilent(userPath('/AcordarChecklist/' + id));
  }
  function renderDespertadorChecklistConfig(){
    const list = document.getElementById('despertadorChecklistList');
    if(!list) return;
    const itens = Object.values(acordarChecklist).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if(!itens.length){
      list.innerHTML = '<p class="catcfg-vazio">Nenhum item na checklist de acordar — toque em "+ Item" pra criar o primeiro (ex: tomar remédio, beber água).</p>';
      return;
    }
    list.innerHTML = itens.map(it => '<div class="catcfg-row" data-check-row="' + it.id + '">' +
      '<input class="catcfg-nome" data-nome-check="' + it.id + '" value="' + escapeHtml(it.texto) + '">' +
      '<button type="button" class="catcfg-del" data-excluir-check="' + it.id + '" title="Excluir">🗑</button>' +
      '</div>').join('');
    list.querySelectorAll('[data-nome-check]').forEach(inp => {
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-nome-check');
        const texto = inp.value.trim();
        if(!texto){ inp.value = acordarChecklist[id].texto; return; }
        if(texto === acordarChecklist[id].texto) return;
        acordarChecklist[id] = { ...acordarChecklist[id], texto };
        await dbPatchSilent(userPath('/AcordarChecklist/' + id), { texto });
      });
      inp.addEventListener('keydown', (e) => { if(e.key === 'Enter') inp.blur(); });
    });
    list.querySelectorAll('[data-excluir-check]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-excluir-check');
        if(!await showConfirm('Excluir este item da checklist?')) return;
        await excluirAcordarChecklistItem(id);
        renderDespertadorChecklistConfig();
      });
    });
  }
  const despertadorChecklistAddBtn = document.getElementById('despertadorChecklistAddBtn');
  if(despertadorChecklistAddBtn) despertadorChecklistAddBtn.addEventListener('click', async () => {
    await criarAcordarChecklistItem('Novo item');
    renderDespertadorChecklistConfig();
  });

  /* ---------- Navegação principal ---------- */
  const navItems = document.querySelectorAll('.nav-item[data-view]');

  // Sem histórico, o botão Voltar do Android fechava o app inteiro em vez de
  // voltar uma tela — goToView() nunca empilhava nada em history. currentView
  // evita empilhar de novo quando o popstate já está aplicando a troca.
  let currentView = 'hoje';

  function aplicarView(target){
    currentView = target;
    navItems.forEach(i => i.classList.remove('active'));
    const navMatch = document.querySelector('.nav-item[data-view="' + target + '"]');
    if(navMatch){ navMatch.classList.add('active'); }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + target);
    if(el){ el.classList.add('active'); }
    document.querySelector('.main').scrollTo({top:0, behavior:'smooth'});
    syncMobileNav(target);
    closeMobileMenu();
    // A view desenha na primeira abertura (ver VIEW_RENDERERS). Sem await: a
    // troca de tela é imediata e cada seção mostra seu próprio "Carregando...".
    renderView(target);
  }

  function goToView(target){
    if(target !== currentView){
      history.pushState({ lifeosView: target }, '', location.pathname + location.search);
    }
    aplicarView(target);
  }

  window.addEventListener('popstate', (e) => {
    aplicarView((e.state && e.state.lifeosView) || 'hoje');
  });
  // Ponto de partida da pilha: sem isso, o primeiro Voltar já não teria pra
  // onde ir e o navegador tentaria sair do app.
  history.replaceState({ lifeosView: currentView }, '', location.pathname + location.search);

  navItems.forEach(item => {
    item.addEventListener('click', () => goToView(item.getAttribute('data-view')));
    // A navegação era <div>: não recebia foco nem respondia ao teclado.
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); item.click(); }
    });
  });

  /* Qualquer botão/elemento com data-view-link também navega */
  document.querySelectorAll('[data-view-link]').forEach(el => {
    el.addEventListener('click', () => goToView(el.getAttribute('data-view-link')));
  });

  /* ---------- Minimizar/maximizar a sidebar (só desktop, >880px) ----------
     No mobile a sidebar já vira gaveta (ver "Navegação mobile" abaixo) — as
     regras de colapso ficam atrás de um @media (min-width:881px) no CSS, então
     nunca competem: redimensionar a janela pra baixo de 880px simplesmente
     ignora a classe .collapsed sem precisar zerar nada aqui. */
  const SIDEBAR_COLAPSADA_KEY = 'lifeosSidebarColapsada';
  const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
  function aplicarSidebarColapsada(colapsada){
    document.querySelector('.sidebar').classList.toggle('collapsed', colapsada);
    document.body.classList.toggle('sidebar-collapsed', colapsada);
    if(sidebarCollapseBtn){
      sidebarCollapseBtn.textContent = colapsada ? '»' : '«';
      sidebarCollapseBtn.title = colapsada ? 'Maximizar sidebar' : 'Minimizar sidebar';
      sidebarCollapseBtn.setAttribute('aria-label', sidebarCollapseBtn.title);
    }
  }
  if(sidebarCollapseBtn){
    aplicarSidebarColapsada(localStorage.getItem(SIDEBAR_COLAPSADA_KEY) === 'sim');
    sidebarCollapseBtn.addEventListener('click', () => {
      const colapsada = !document.querySelector('.sidebar').classList.contains('collapsed');
      localStorage.setItem(SIDEBAR_COLAPSADA_KEY, colapsada ? 'sim' : 'nao');
      aplicarSidebarColapsada(colapsada);
    });
  }

  /* ---------- Navegação mobile ----------
     Abaixo de 880px a sidebar vira gaveta: a barra inferior leva direto às 4
     telas mais usadas e o botão "Menu" abre a sidebar por cima do conteúdo. */
  const sidebarEl = document.querySelector('.sidebar');
  const mobileNavEl = document.getElementById('mobileNav');
  const mobileScrimEl = document.getElementById('mobileScrim');
  const mobileMoreBtn = document.getElementById('mobileMoreBtn');

  function closeMobileMenu(){
    if(!sidebarEl) return;
    sidebarEl.classList.remove('open');
    if(mobileScrimEl) mobileScrimEl.classList.remove('active');
    if(mobileMoreBtn) mobileMoreBtn.setAttribute('aria-expanded', 'false');
  }
  function toggleMobileMenu(){
    if(!sidebarEl) return;
    const open = sidebarEl.classList.toggle('open');
    if(mobileScrimEl) mobileScrimEl.classList.toggle('active', open);
    if(mobileMoreBtn) mobileMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  // Marca o item da barra inferior correspondente à view atual. Views que não
  // têm botão próprio (Rotina, Objetivos...) não acendem nenhum — o "Menu"
  // continua sendo o caminho pra elas.
  function syncMobileNav(view){
    if(!mobileNavEl) return;
    mobileNavEl.querySelectorAll('.mobile-nav-item[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });
  }

  if(mobileNavEl){
    mobileNavEl.querySelectorAll('.mobile-nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => goToView(btn.getAttribute('data-view')));
    });
  }
  if(mobileMoreBtn) mobileMoreBtn.addEventListener('click', toggleMobileMenu);
  if(mobileScrimEl) mobileScrimEl.addEventListener('click', closeMobileMenu);
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && sidebarEl && sidebarEl.classList.contains('open')) closeMobileMenu();
  });
  // Voltando pro desktop, a gaveta não pode continuar "aberta" por baixo.
  window.addEventListener('resize', () => {
    if(window.innerWidth > 880) closeMobileMenu();
  });
  // A altura da lousa do Vision Board acompanha a tela — recalcula ao redimensionar
  // a janela (só quando a view está mesmo aberta, senão getBoundingClientRect mentiria).
  let visionResizeDebounce = null;
  window.addEventListener('resize', () => {
    clearTimeout(visionResizeDebounce);
    visionResizeDebounce = setTimeout(() => {
      const view = document.getElementById('view-visionboard');
      if(view && view.classList.contains('active') && typeof paintVisionBoard === 'function') paintVisionBoard();
    }, 150);
  });

  /* ---------- Sub-abas (Tarefas: Hoje / Semana / Lista / Kanban) ---------- */
  document.querySelectorAll('.subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      const scope = tab.closest('.view') || document;
      scope.querySelectorAll('.subtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      scope.querySelectorAll('.subview').forEach(sv => sv.classList.remove('active'));
      const targetEl = document.getElementById(targetId);
      if(targetEl){ targetEl.classList.add('active'); }
    });
  });

  /* ---------- Pesquisa global (Ctrl/Cmd + K) ----------
     O modal existia mas nunca buscou nada: só focava o input. Agora ele monta um
     índice achatado de tudo que é texto no Quadro ativo (tarefas, capturas,
     gavetas, objetivos e seus pontos, diário, agenda, decisões, Monday) e filtra
     em memória. As leituras passam pelo cache do dbGet, então reabrir a busca
     logo em seguida não custa rede. */
  const searchModal = document.getElementById('searchModal');
  const searchModalInput = document.getElementById('searchModalInput');
  const searchResultsEl = document.getElementById('searchResults');
  const searchEmptyEl = document.getElementById('searchEmpty');
  const searchScopesEl = document.getElementById('searchScopes');

  const SEARCH_KIND_LABEL = {
    tarefa:'Tarefa', nota:'Nota', area:'Categoria', objetivo:'Objetivo',
    ponto:'Ponto', diario:'Diário', evento:'Agenda', decisao:'Decisão', plano:'Planejamento'
  };
  const SEARCH_KIND_VIEW = {
    tarefa:'tarefas', nota:'storage', area:'storage', objetivo:'objetivos',
    ponto:'objetivos', diario:'diario', evento:'agenda', decisao:'decisoes', plano:'monday'
  };
  // Agrupa os tipos sob o filtro que aparece na barra de escopos.
  const SEARCH_SCOPE_OF = {
    tarefa:'tarefa', plano:'tarefa', nota:'nota', area:'nota',
    objetivo:'objetivo', ponto:'objetivo', diario:'diario', evento:'evento', decisao:'decisao'
  };

  let searchIndex = null;
  let searchIndexPromise = null;
  let searchScope = '';
  let searchSelIdx = 0;
  let searchDebounce = null;

  /* Comandos do Ctrl+K — o campo não só busca, ele age. Cada comando tem
     palavras-chave próprias pra ser encontrado por sinônimo (quem digita
     "anotar" quer capturar). */
  const SEARCH_COMANDOS = [
    { rotulo:'Nova captura',       chaves:'capturar anotar ideia arquivo nota',run: () => abrirCapturaRapida() },
    { rotulo:'Nova tarefa',        chaves:'tarefa todo fazer',                 run: () => { goToView('tarefas'); document.getElementById('addTaskOpenBtn').click(); } },
    { rotulo:'Novo evento',        chaves:'evento agenda compromisso',         run: () => { goToView('agenda'); document.getElementById('addEventOpenBtn').click(); } },
    { rotulo:'Novo objetivo',      chaves:'objetivo meta',                     run: () => { goToView('objetivos'); document.getElementById('objAddBtn').click(); } },
    { rotulo:'Nova decisão',       chaves:'decisao decidir escolha',           run: () => { goToView('decisoes'); document.getElementById('decisaoAddBtn').click(); } },
    { rotulo:'Escrever no Diário', chaves:'diario escrever humor',             run: () => goToView('diario') },
    { rotulo:'Perguntar ao LifeOS',chaves:'perguntar ia buscar semantica',     run: () => goToView('busca') },
    { rotulo:'Configurações',      chaves:'config tema cor conta quadro',      run: () => goToView('config') },
    // Ápice não é uma view — o nav-item já abre o site direto (sem tela própria,
    // de propósito). O comando de busca faz o mesmo, em vez de tentar navegar
    // pra uma view que não existe.
    { rotulo:'Abrir Ápice',        chaves:'apice site empresa',                run: () => window.open('https://apicesolucoesdigitais.com.br', '_blank', 'noopener') }
  ];
  // Toda view também é um comando de navegação.
  const SEARCH_VIEWS = [
    ['hoje','Hoje'], ['storage','Notas'], ['tarefas','Tarefas'], ['monday','Planejamento'],
    ['agenda','Agenda'], ['presentes','Presentes & datas'], ['compras','Compras'], ['rotina','Rotina'], ['casa','Casa'],
    ['financas','Finanças'],
    ['fluencia','Fluência'], ['bateria','Bateria'], ['academia','Academia'], ['diario','Diário'],
    ['retrospectiva','Retrospectiva'],
    ['planoalimentar','Plano Alimentar'], ['objetivos','Objetivos'], ['timelineobjetivos','Timeline'], ['decisoes','Decisões'],
    ['visionboard','Vision Board'], ['supermercado','Supermercado'], ['calculos','Cálculos'],
    ['empreendedorismo','Empreendedorismo']
  ].map(([v, nome]) => ({
    rotulo: 'Ir para ' + nome, chaves: 'ir abrir ' + nome + ' ' + v, run: () => goToView(v)
  }));

  function comandosCasando(qNorm){
    const todos = SEARCH_COMANDOS.concat(SEARCH_VIEWS);
    if(!qNorm) return SEARCH_COMANDOS.slice(0, 5); // campo vazio: as ações mais úteis
    return todos.filter(c => searchNorm(c.rotulo + ' ' + c.chaves).indexOf(qNorm) !== -1).slice(0, 6);
  }

  // Sem acento e sem caixa: "decisao" precisa achar "decisão".
  function searchNorm(s){
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  function searchPush(list, kind, title, sub){
    const t = String(title || '').trim();
    if(!t) return;
    list.push({ kind, title: t, sub: sub || '', hay: searchNorm(t + ' ' + (sub || '')) });
  }

  async function buildSearchIndex(){
    const [tasks, notasAreas, notas, objetivos, diario, events, decisoes, planItens] = await Promise.all([
      dbGet(userPath('/Tasks')), dbGet(userPath('/NotasAreas')), dbGet(userPath('/Notas')),
      dbGet(userPath('/objetivos')), dbGet(userPath('/DiarioEntradas')), dbGet(userPath('/Events')),
      dbGet(userPath('/Decisoes')), dbGet(userPath('/PlanItens'))
    ]);
    const list = [];
    Object.values(tasks || {}).forEach(t => {
      searchPush(list, 'tarefa', t.name, (t.done ? 'concluída' : 'a fazer') + (t.date ? ' · ' + fmtShortDate(t.date) : ''));
    });
    Object.values(planItens || {}).forEach(t => {
      searchPush(list, 'plano', t.nome, [t.responsavel, PLAN_STATUS_LABEL[t.status]].filter(Boolean).join(' · '));
    });
    Object.values(notasAreas || {}).forEach(a => searchPush(list, 'area', a.nome, 'categoria das Notas'));
    Object.values(notas || {}).forEach(n => {
      const area = n.areaId && notasAreas ? notasAreas[n.areaId] : null;
      searchPush(list, 'nota', n.titulo, 'nota' + (area ? ' · ' + area.nome : ''));
    });
    Object.values(objetivos || {}).forEach(o => {
      searchPush(list, 'objetivo', o.nome, o.descricao);
      Object.values(o.pontos || {}).forEach(p => searchPush(list, 'ponto', p.nome, 'em ' + (o.nome || 'objetivo')));
    });
    Object.values(diario || {}).forEach(e => {
      searchPush(list, 'diario', e.text, (e.mood || '') + ' ' + fmtShortDate((e.createdAt || '').slice(0,10)));
    });
    Object.values(events || {}).forEach(e => {
      searchPush(list, 'evento', e.title, [fmtShortDate(e.date), e.time].filter(Boolean).join(' · '));
    });
    Object.values(decisoes || {}).forEach(d => {
      searchPush(list, 'decisao', d.titulo, [d.categoria, d.status].filter(Boolean).join(' · '));
      Object.values(d.opcoes || {}).forEach(o => searchPush(list, 'decisao', o.nome, 'opção de ' + (d.titulo || 'decisão')));
    });
    return list;
  }

  function ensureSearchIndex(){
    if(searchIndex) return Promise.resolve(searchIndex);
    if(!searchIndexPromise){
      // withoutLoading: o overlay global taparia o próprio modal de busca.
      searchIndexPromise = withoutLoading(buildSearchIndex)
        .then(list => { searchIndex = list; return list; })
        .catch(err => { console.error('Falha ao montar o índice de busca:', err); searchIndex = []; return []; })
        .finally(() => { searchIndexPromise = null; });
    }
    return searchIndexPromise;
  }

  // Destaca o trecho encontrado sem quebrar o escape de HTML.
  function searchHighlight(text, qNorm){
    const raw = String(text || '');
    if(!qNorm) return escapeHtml(raw);
    const at = searchNorm(raw).indexOf(qNorm);
    if(at === -1) return escapeHtml(raw);
    return escapeHtml(raw.slice(0, at)) +
           '<mark>' + escapeHtml(raw.slice(at, at + qNorm.length)) + '</mark>' +
           escapeHtml(raw.slice(at + qNorm.length));
  }

  function renderSearchResults(){
    const q = searchModalInput.value.trim();
    const qNorm = searchNorm(q);

    // Ações só aparecem no escopo "Tudo": filtrar por Diário e ver "Nova tarefa"
    // no meio dos resultados seria ruído.
    const acoes = searchScope ? [] : comandosCasando(qNorm);

    let hits = [];
    if(q && searchIndex){
      hits = searchIndex
        .filter(it => (!searchScope || SEARCH_SCOPE_OF[it.kind] === searchScope) && it.hay.indexOf(qNorm) !== -1)
        // Quem casa no começo do título vem primeiro — é o que a pessoa quis digitar.
        .sort((a, b) => searchNorm(a.title).indexOf(qNorm) - searchNorm(b.title).indexOf(qNorm))
        .slice(0, 40);
    }

    if(!acoes.length && !hits.length){
      searchResultsEl.innerHTML = '';
      searchEmptyEl.textContent = !q
        ? 'Comece a digitar para pesquisar ou executar uma ação.'
        : (searchIndex ? 'Nada encontrado para "' + q + '".' : 'Carregando seus dados...');
      searchEmptyEl.style.display = '';
      return;
    }

    searchEmptyEl.style.display = 'none';
    const totalItens = acoes.length + hits.length;
    searchSelIdx = Math.min(searchSelIdx, totalItens - 1);

    let html = '';
    let i = 0;
    if(acoes.length){
      html += '<p class="search-group-label">Ações</p>';
      html += acoes.map((c) => {
        const idx = i++;
        return `
        <button type="button" class="search-result${idx === searchSelIdx ? ' sel' : ''}" data-search-acao="${idx}">
          <span class="search-result-kind">Ação</span>
          <span class="search-result-body">
            <span class="search-result-title">${searchHighlight(c.rotulo, qNorm)}</span>
          </span>
        </button>`;
      }).join('');
    }
    if(hits.length){
      html += '<p class="search-group-label">Resultados</p>';
      html += hits.map((it) => {
        const idx = i++;
        return `
        <button type="button" class="search-result${idx === searchSelIdx ? ' sel' : ''}" data-search-view="${SEARCH_KIND_VIEW[it.kind]}">
          <span class="search-result-kind">${SEARCH_KIND_LABEL[it.kind]}</span>
          <span class="search-result-body">
            <span class="search-result-title">${searchHighlight(it.title, qNorm)}</span>
            ${it.sub ? `<span class="search-result-sub">${escapeHtml(it.sub)}</span>` : ''}
          </span>
        </button>`;
      }).join('');
    }
    searchResultsEl.innerHTML = html;
    // Guarda as ações desta renderização pro clique resolver pelo índice.
    searchResultsEl._acoes = acoes;
  }

  function moveSearchSel(delta){
    const items = searchResultsEl.querySelectorAll('.search-result');
    if(!items.length) return;
    searchSelIdx = (searchSelIdx + delta + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('sel', i === searchSelIdx));
    const sel = items[searchSelIdx];
    if(sel) sel.scrollIntoView({ block:'nearest' });
  }
  function openSearchSel(){
    const sel = searchResultsEl.querySelector('.search-result.sel') || searchResultsEl.querySelector('.search-result');
    if(sel) sel.click();
  }

  function openSearch(){
    searchModal.classList.add('active');
    searchSelIdx = 0;
    renderSearchResults();
    setTimeout(() => searchModalInput.focus(), 30);
    // O índice é montado uma vez por sessão de busca; invalidado ao fechar.
    ensureSearchIndex().then(renderSearchResults);
  }
  function closeSearch(){
    searchModal.classList.remove('active');
    searchModalInput.value = '';
    searchResultsEl.innerHTML = '';
    searchSelIdx = 0;
    // Solta o índice pra próxima abertura refletir o que mudou desde então.
    searchIndex = null;
  }

  if(searchModalInput){
    searchModalInput.addEventListener('input', () => {
      searchSelIdx = 0;
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(renderSearchResults, 90);
    });
    searchModalInput.addEventListener('keydown', (e) => {
      if(e.key === 'ArrowDown'){ e.preventDefault(); moveSearchSel(1); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); moveSearchSel(-1); }
      else if(e.key === 'Enter'){ e.preventDefault(); openSearchSel(); }
    });
  }
  if(searchResultsEl){
    searchResultsEl.addEventListener('click', (e) => {
      const acaoBtn = e.target.closest('[data-search-acao]');
      if(acaoBtn){
        const acoes = searchResultsEl._acoes || [];
        const cmd = acoes[Number(acaoBtn.getAttribute('data-search-acao'))];
        closeSearch();
        if(cmd && typeof cmd.run === 'function'){
          try{ cmd.run(); }
          catch(err){ console.error('Falha ao executar o comando:', err); }
        }
        return;
      }
      const btn = e.target.closest('[data-search-view]');
      if(!btn) return;
      const view = btn.getAttribute('data-search-view');
      closeSearch();
      if(view) goToView(view);
    });
  }
  if(searchScopesEl){
    searchScopesEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-scope]');
      if(!btn) return;
      searchScope = btn.getAttribute('data-scope') || '';
      searchScopesEl.querySelectorAll('.search-scope').forEach(b => b.classList.toggle('active', b === btn));
      searchSelIdx = 0;
      renderSearchResults();
      searchModalInput.focus();
    });
  }

  /* ---------- Captura rápida global ----------
     A tecla "C" (e o comando "Nova captura" do Ctrl+K) levam direto pra barra de
     captura do Arquivo, de qualquer tela — sem precisar navegar manualmente. */
  function abrirCapturaRapida(){
    closeSearch();
    goToView('storage');
    setTimeout(() => {
      const inp = document.getElementById('notasCapturaInput');
      if(inp) inp.focus();
    }, 30);
  }
  document.addEventListener('keydown', (e) => {
    // "C" abre a captura — só quando o foco não está num campo de texto.
    if(e.key !== 'c' && e.key !== 'C') return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;
    const alvo = e.target;
    const digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' ||
                               alvo.tagName === 'SELECT' || alvo.isContentEditable);
    if(digitando) return;
    if(document.querySelector('.confirm-modal.active')) return;
    e.preventDefault();
    abrirCapturaRapida();
  });

  const searchTriggerBtn = document.getElementById('searchTrigger');
  if(searchTriggerBtn){ searchTriggerBtn.addEventListener('click', openSearch); }
  if(searchModal){ searchModal.addEventListener('click', (e) => { if(e.target === searchModal){ closeSearch(); } }); }
  document.addEventListener('keydown', (e) => {
    if((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){
      e.preventDefault();
      searchModal.classList.contains('active') ? closeSearch() : openSearch();
    } else if(e.key === 'Escape' && searchModal.classList.contains('active')){
      closeSearch();
    }
  });

  /* ---------- Fila de hoje (sem modo foco: só concluir, nunca "iniciar") ---------- */
  // `activities` é preenchido dinamicamente por renderHojeQueue() com objetos:
  // { obj, name, time, done, onComplete: async ()=>{} }
  const hojeHeroMotivation = document.getElementById('hojeHeroMotivation');
  const hojeActivityName = document.getElementById('hojeActivityName');
  const hojeActivityTime = document.getElementById('hojeActivityTime');
  const hojeActivityObj = document.getElementById('hojeActivityObj');
  const comecarAtividadeBtn = document.getElementById('comecarAtividadeBtn');
  const dayProgressLabel = document.getElementById('dayProgressLabel');
  const dayProgressFill = document.getElementById('dayProgressFill');
  const flowListEl = document.getElementById('flowList');
  const seqCountTag = document.getElementById('seqCountTag');

  let activities = [];

  function getNextIndex(){
    for(let i = 0; i < activities.length; i++){ if(!activities[i].done && !activities[i].skipped) return i; }
    return -1;
  }

  function updateDayProgress(){
    const relevant = activities.filter(a => !a.skipped);
    const done = relevant.filter(a => a.done).length;
    const total = relevant.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    dayProgressLabel.textContent = done + ' de ' + total + ' concluídas (' + pct + '%)';
    dayProgressFill.style.width = pct + '%';
    seqCountTag.textContent = total + ' hoje';
  }

  function updateHeroCard(){
    const nextIdx = getNextIndex();
    if(!activities.length){
      hojeHeroMotivation.textContent = 'Nada planejado para hoje ainda. Adicione tarefas de hoje.';
      hojeActivityName.textContent = 'Sem missão definida para hoje.';
      hojeActivityTime.textContent = '—';
      hojeActivityObj.textContent = '—';
      comecarAtividadeBtn.textContent = 'Nada a fazer';
      comecarAtividadeBtn.disabled = true;
      return;
    }
    if(nextIdx === -1){
      hojeHeroMotivation.textContent = 'Você concluiu tudo que planejou para hoje. Aproveite o resto do dia.';
      hojeActivityName.textContent = 'Nenhuma atividade pendente — bom trabalho.';
      hojeActivityTime.textContent = '—';
      hojeActivityObj.textContent = '—';
      comecarAtividadeBtn.textContent = 'Dia concluído';
      comecarAtividadeBtn.disabled = true;
      return;
    }
    const a = activities[nextIdx];
    // A frase de justificativa é o ponto do redesenho: sem ela você reconfere a
    // lista inteira pra decidir se confia na primeira linha. Com ela, bate o
    // olho e vai.
    hojeHeroMotivation.textContent = a.porque || 'Sua próxima ação de hoje.';
    hojeActivityName.textContent = a.kind === 'treino' ? 'Hora de ir pra academia.' : a.name;
    hojeActivityTime.textContent = a.time || (a.semData ? 'sem data' : 'hoje');
    hojeActivityObj.textContent = a.obj || '—';
    comecarAtividadeBtn.disabled = false;
    comecarAtividadeBtn.textContent = '✓ Concluir';
  }

  const FLOW_KIND_META = {
    tarefa:  { label:'Tarefa',  cls:'tag-gold' },
    treino:  { label:'Treino',  cls:'tag-sage' },
    casa:    { label:'Casa',    cls:'tag-blue' }
  };
  function renderFlowList(){
    const nextIdx = getNextIndex();
    if(!activities.length){
      flowListEl.innerHTML = '<p class="empty-state">Nenhuma tarefa ou treino puxado pra hoje. Adicione em Tarefas ou marque um dia de treino na Academia.</p>';
      return;
    }
    flowListEl.innerHTML = activities.map((a, idx) => {
      const meta = FLOW_KIND_META[a.kind] || FLOW_KIND_META.tarefa;
      return `
      <div class="flow-item ${a.done ? 'done' : ''} ${a.skipped ? 'skipped' : ''} ${idx === nextIdx ? 'now' : ''}" data-activity="${idx}">
        <div class="flow-rail"><div class="seq-node" data-check="${idx}" title="${a.done ? 'Concluída' : 'Marcar como concluída'}"></div>${idx < activities.length - 1 ? '<div class="flow-connector"></div>' : ''}</div>
        <div class="flow-body">
          <div class="flow-top">
            ${idx === nextIdx ? '<span class="flow-now-tag">Agora</span>' : ''}
            ${a.skipped ? '<span class="flow-skipped-tag">pulada hoje</span>' : ''}
          </div>
          <div class="flow-text">${escapeHtml(a.name)}</div>
          ${idx === nextIdx && a.porque ? `<div class="flow-porque">${escapeHtml(a.porque)}</div>` : ''}
          <div class="flow-meta">
            <span class="tag ${meta.cls}">${meta.label}</span>${a.time ? '<span class="queue-time">' + escapeHtml(a.time) + '</span>' : ''}
            ${a.responsavel ? `<span class="tag">${escapeHtml(a.responsavel)}</span>` : ''}
            ${a.atraso > 0 ? `<span class="tag flow-atraso">${a.atraso === 1 ? '1 dia atrasada' : a.atraso + ' dias atrasada'}</span>` : ''}
            ${a.semData ? '<span class="tag flow-semdata">quando der</span>' : ''}
            ${a.recorrencia ? `<span class="tag flow-recorrente">↻ ${escapeHtml(TAREFA_RECORRENCIA_LABEL[a.recorrencia] || a.recorrencia)}</span>` : ''}
            ${!a.done ? `<button class="flow-skip-btn" data-skip="${idx}">${a.skipped ? 'desfazer' : 'pular hoje'}</button>` : ''}
          </div>
        </div>
      </div>
    `; }).join('');
    // Único gesto possível sobre uma atividade: marcar como concluída.
    // Não existe mais "iniciar" — clicar em uma pendente já a conclui.
    flowListEl.querySelectorAll('[data-check]').forEach(node => {
      node.addEventListener('click', () => {
        const idx = parseInt(node.getAttribute('data-check'), 10);
        if(activities[idx].done || activities[idx].skipped) return;
        markActivityDone(idx);
      });
    });
    flowListEl.querySelectorAll('[data-skip]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-skip'), 10);
        toggleActivitySkip(idx);
      });
    });
  }

  function updateFlowUI(){ renderFlowList(); }

  async function markActivityDone(idx){
    const a = activities[idx];
    if(!a) return;
    a.done = true;
    if(a.onComplete){ try { await a.onComplete(); } catch(e){ console.error('Erro ao salvar conclusão', e); } }
    updateFlowUI();
    updateDayProgress();
    updateHeroCard();
  }

  async function toggleActivitySkip(idx){
    const a = activities[idx];
    if(!a) return;
    a.skipped = !a.skipped;
    if(a.onSkip){ try { await a.onSkip(a.skipped); } catch(e){ console.error('Erro ao salvar pular', e); } }
    updateFlowUI();
    updateDayProgress();
    updateHeroCard();
  }

  // O botão de destaque conclui diretamente a próxima ação — não existe "começar".
  comecarAtividadeBtn.addEventListener('click', () => {
    const nextIdx = getNextIndex();
    if(nextIdx === -1) return;
    markActivityDone(nextIdx);
  });

  updateHeroCard();
  updateDayProgress();
  updateFlowUI();

  /* ---------- Diário: seletor de humor + captura ---------- */
  document.querySelectorAll('.mood-row').forEach(row => {
    row.querySelectorAll('.mood-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        row.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });

  document.getElementById('diarioSaveBtn').addEventListener('click', async () => {
    const textEl = document.getElementById('diarioTextInput');
    const text = textEl.value.trim();
    if(!text) return;
    const activeChip = document.querySelector('#diarioMoodRow .mood-chip.active');
    const mood = activeChip ? activeChip.getAttribute('data-mood') : '🙂';
    const id = newId();
    await dbPut(userPath('/DiarioEntradas/' + id), { mood, text, createdAt: new Date().toISOString() });
    textEl.value = '';
    await renderDiario();
  });

  /* =======================================================================
     FIREBASE — camada de dados real (a IA vive no proxy, em functions/)
     ======================================================================= */

  // Projeto Firebase: anki-71f4f (nomeado "LifeOS" no console). É onde vivem as
  // contas de verdade (guittkk@, guittk@, julialealdecamargo@, lucas.caramanti@)
  // e todos os dados. O app tinha sido apontado por engano para basehub-135f5
  // ("Hube"), onde essas contas não existem — por isso o login falhava com
  // qualquer senha, mesmo recém-definida.
  const FIREBASE_API_KEY = "AIzaSyAQqB__M-gKZWHS4zQ1eIA-X6rGqzVtr0I";
  const FIREBASE_DB_URL  = "https://anki-71f4f-default-rtdb.firebaseio.com";
  const SESSION_KEY = "lifeos_v5_session";

  // Config do Firebase Cloud Messaging (despertadores por push) — mesmo
  // projeto anki-71f4f de cima, precisa bater com o sw.js e com a Cloud
  // Function que manda o push (ver functions/index.js).
  const FCM_CONFIG = {
    apiKey: FIREBASE_API_KEY,
    projectId: 'anki-71f4f',
    messagingSenderId: '319058865898',
    appId: '1:319058865898:web:7766cd5d90cb2fdc203193'
  };
  // Chave VAPID gerada em console.firebase.google.com/project/anki-71f4f/settings/cloudmessaging
  // (aba "Web configuration" → "Web Push certificates"). Sem ela, getToken()
  // falha e os despertadores por push simplesmente não se registram — o resto
  // do app funciona normal, só cai de volta no alarme local (app aberto).
  const FCM_VAPID_KEY = 'BFip5vnWtU3URsAt79xTbGwmirNZw7y7HjL4zCQ9SsgP-Qivrp_joa84Y-yaqujmBj2qB8QjpAsTATGL20wN9vM';

  let session = null;      // { idToken, uid, email, expiresAt }
  let activeDataUid = null; // uid cujos dados /users/{uid}/... estão sendo lidos (== session.uid, ou o dono do Quadro selecionado)
  let currentBoardId = null; // Quadro atualmente selecionado (o id é sempre o uid do dono do quadro)
  let myBoards = {};         // { boardId: { name, role: 'owner'|'member', permissions? } }
  let userDisplayName = ''; // nome de exibição, salvo em /Profile/DisplayName

  function escapeHtml(str){
    return String(str == null ? '' : str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function newId(){ return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,9); }
  function todayStr(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  const WEEKDAYS_PT = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const MONTHS_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const MONTHS_FULL_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  function fmtDatePill(d){
    return WEEKDAYS_PT[d.getDay()].charAt(0).toUpperCase()+WEEKDAYS_PT[d.getDay()].slice(1) + ' · ' + d.getDate() + ' ' + MONTHS_PT[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  function fmtShortDate(dateStr){
    if(!dateStr) return 'indefinida';
    const [y,m,dd] = dateStr.split('-').map(Number);
    return dd + ' ' + MONTHS_PT[m-1] + ' ' + y;
  }

  /* ---------- Sessão ---------- */
  function saveSession(s){ session = s; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function loadSessionFromStorage(){
    try{
      const raw = localStorage.getItem(SESSION_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || !s.idToken) return null;
      // Uma sessão vencida ainda serve se tiver refreshToken: ensureFreshToken()
      // troca por um token novo antes da primeira chamada. Sem refreshToken
      // (sessão criada por uma versão antiga do app), só resta pedir login.
      if(!s.refreshToken && (!s.expiresAt || Date.now() > s.expiresAt)) return null;
      return s;
    }catch(e){ return null; }
  }
  function clearSession(){ session = null; localStorage.removeItem(SESSION_KEY); }

  /* Renovação do token de acesso.
     O idToken do Firebase vale 1 hora. Sem renovar, a pessoa é jogada de volta pra
     tela de login no meio do dia. O refreshToken (devolvido no login) é trocado por
     um idToken novo em securetoken.googleapis.com — que responde em snake_case,
     diferente do Identity Toolkit. */
  let refreshInFlight = null;

  async function refreshIdToken(){
    if(!session || !session.refreshToken) return false;
    const res = await fetchWithTimeout('https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(session.refreshToken)
    });
    const data = await res.json();
    if(!res.ok || !data.id_token) return false;
    saveSession(Object.assign({}, session, {
      idToken: data.id_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt: Date.now() + (parseInt(data.expires_in || '3600', 10) * 1000) - 60000
    }));
    return true;
  }

  // Chamada antes de toda requisição ao banco. Renova quando faltam menos de 5
  // minutos. O refreshInFlight garante uma única renovação mesmo quando o boot
  // dispara dezenas de leituras em paralelo.
  async function ensureFreshToken(){
    if(!session || !session.refreshToken) return;
    if(Date.now() < (session.expiresAt || 0) - 300000) return;
    if(!refreshInFlight){
      refreshInFlight = refreshIdToken()
        .catch((err) => { console.error('Falha ao renovar a sessão:', err); return false; })
        .finally(() => { refreshInFlight = null; });
    }
    const ok = await refreshInFlight;
    // Só desloga se o token já venceu de fato. Uma falha de rede com token ainda
    // válido não deve derrubar a sessão — a próxima chamada tenta de novo.
    if(!ok && Date.now() > (session.expiresAt || 0)){
      clearSession();
      showAppMessage('Sua sessão expirou. Entre novamente.', 'error');
      setTimeout(() => location.reload(), 1500);
    }
  }

  /* ---------- Loading global (IA / operações assíncronas) ---------- */
  const globalLoadingEl = document.getElementById('globalLoading');
  const globalLoadingTextEl = document.getElementById('globalLoadingText');
  let loadingDepth = 0;
  let loadingSuppressed = 0;
  function showLoading(msg){
    if(loadingSuppressed > 0) return;
    loadingDepth++;
    globalLoadingTextEl.textContent = msg || 'Carregando...';
    globalLoadingEl.classList.add('active');
  }
  function hideLoading(){
    if(loadingSuppressed > 0) return;
    loadingDepth = Math.max(0, loadingDepth - 1);
    if(loadingDepth === 0) globalLoadingEl.classList.remove('active');
  }
  // Executa fn() sem deixar o overlay global de loading aparecer — usado em ações
  // rápidas e puramente locais (ex: expandir/colapsar tudo) que não devem travar a tela.
  async function withoutLoading(fn){
    loadingSuppressed++;
    try{ return await fn(); }
    finally{ loadingSuppressed--; }
  }

  /* Notificação estilizada da própria aplicação — substitui alert() do navegador. */
  function showAppMessage(text, type){
    const wrap = document.getElementById('appToastWrap');
    if(!wrap){ return; }
    const el = document.createElement('div');
    el.className = 'app-toast' + (type ? ' ' + type : ' info');
    el.textContent = text;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 260);
    }, 4400);
  }

  /* Confirmação estilizada da própria aplicação — substitui window.confirm() do navegador.
     Retorna uma Promise<boolean>: true se a pessoa confirmou, false se cancelou. */
  function showConfirm(text){
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      const textEl = document.getElementById('confirmModalText');
      const okBtn = document.getElementById('confirmModalOkBtn');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');
      textEl.textContent = text;
      modal.classList.add('active');
      function cleanup(result){
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        resolve(result);
      }
      function onOk(){ cleanup(true); }
      function onCancel(){ cleanup(false); }
      function onBackdrop(e){ if(e.target === modal) cleanup(false); }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
    });
  }

  /* ---------- Rascunho + "dirty": Rotina, Academia e Plano Alimentar ----------
     As três telas editam um rascunho em memória e só gravam no Firebase ao
     clicar "Salvar alterações" — só o indicador visual (texto de status +
     botão) era idêntico e repetido três vezes; unificado aqui. Cada tela
     continua com sua própria variável `xDirty` e seu próprio rascunho — nada
     do estado em si foi tocado, só a exibição. Finanças fica de fora: usa um
     status com mais mensagens (Salvando..., erro de conexão) e mostra/esconde
     Salvar e Cancelar em vez de só desabilitar — forçar as duas formas na
     mesma função arriscava mudar comportamento visível, e a regra aqui foi
     não mudar nada visível. */
  function marcarStatusRascunho(dirty, statusId, saveBtnId){
    const status = document.getElementById(statusId);
    if(status){
      status.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
      status.style.color = dirty ? 'var(--gold)' : 'var(--text-dim)';
    }
    const saveBtn = document.getElementById(saveBtnId);
    if(saveBtn) saveBtn.disabled = !dirty;
  }

  /* Prompt estilizado da própria aplicação — substitui window.prompt() do navegador.
     Retorna uma Promise<string|null>: o texto digitado (trim) se confirmado e não vazio,
     ou null se cancelado / deixado em branco. */
  function showPrompt(modalId, inputId, okBtnId, cancelBtnId, defaultValue){
    return new Promise((resolve) => {
      const modal = document.getElementById(modalId);
      const input = document.getElementById(inputId);
      const okBtn = document.getElementById(okBtnId);
      const cancelBtn = document.getElementById(cancelBtnId);
      input.value = defaultValue || '';
      modal.classList.add('active');
      setTimeout(() => input.focus(), 30);
      function cleanup(result){
        modal.classList.remove('active');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        input.removeEventListener('keydown', onKeydown);
        resolve(result);
      }
      function onOk(){ const v = input.value.trim(); cleanup(v || null); }
      function onCancel(){ cleanup(null); }
      function onBackdrop(e){ if(e.target === modal) cleanup(null); }
      function onKeydown(e){
        if(e.key === 'Enter'){ e.preventDefault(); onOk(); }
        else if(e.key === 'Escape'){ onCancel(); }
      }
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      input.addEventListener('keydown', onKeydown);
    });
  }

