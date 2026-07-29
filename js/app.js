  /* ---------- Aparência: cor principal customizável (aplica cedo pra evitar "flash" da cor padrão) ---------- */
  const COR_PRINCIPAL_PADRAO = '#7fa37a';
  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if(!m) return { r:127, g:163, b:122 };
    return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
  }
  const COR_PRINCIPAL_PRESETS = [
    '#7fa37a', '#5a8f6e', '#3f7d9e', '#6a91b4', '#4f6fd1', '#9b86c9',
    '#c26fb0', '#b46a5c', '#d1745f', '#e08a3c', '#ffc400', '#c9a227',
    '#8a9a3f', '#4fae8f', '#5cb3b0', '#7d6f5c'
  ];
  function applyCorPrincipal(hex){
    if(!hex) hex = COR_PRINCIPAL_PADRAO;
    const { r, g, b } = hexToRgb(hex);
    const root = document.documentElement.style;
    root.setProperty('--sage', hex);
    root.setProperty('--sage-soft', `rgba(${r},${g},${b},0.14)`);
    root.setProperty('--sage-line', `rgba(${r},${g},${b},0.4)`);
    root.setProperty('--sage-dark', `rgb(${Math.round(r*0.56)},${Math.round(g*0.56)},${Math.round(b*0.56)})`);
    const swatchBtn = document.getElementById('corPrincipalSwatchBtn');
    if(swatchBtn) swatchBtn.style.background = hex;
    document.querySelectorAll('.cor-swatch-option').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-cor') === hex);
    });
  }
  applyCorPrincipal(localStorage.getItem('corPrincipal') || COR_PRINCIPAL_PADRAO);

  /* ---------- Navegação principal ---------- */
  const navItems = document.querySelectorAll('.nav-item[data-view]');

  function goToView(target){
    navItems.forEach(i => i.classList.remove('active'));
    const navMatch = document.querySelector('.nav-item[data-view="' + target + '"]');
    if(navMatch){ navMatch.classList.add('active'); }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + target);
    if(el){ el.classList.add('active'); }
    document.querySelector('.main').scrollTo({top:0, behavior:'smooth'});
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => goToView(item.getAttribute('data-view')));
  });

  /* Qualquer botão/elemento com data-view-link também navega */
  document.querySelectorAll('[data-view-link]').forEach(el => {
    el.addEventListener('click', () => goToView(el.getAttribute('data-view-link')));
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

  /* ---------- Pesquisa global (Ctrl/Cmd + K) ---------- */
  const searchModal = document.getElementById('searchModal');
  const searchModalInput = document.getElementById('searchModalInput');
  function openSearch(){
    searchModal.classList.add('active');
    setTimeout(() => searchModalInput.focus(), 30);
  }
  function closeSearch(){
    searchModal.classList.remove('active');
    searchModalInput.value = '';
  }
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
    hojeHeroMotivation.textContent = 'Sua próxima ação de hoje.';
    hojeActivityName.textContent = a.kind === 'treino' ? 'Hora de ir pra academia.' : a.name;
    hojeActivityTime.textContent = a.time || '—';
    hojeActivityObj.textContent = a.obj || '—';
    comecarAtividadeBtn.disabled = false;
    comecarAtividadeBtn.textContent = '✓ Concluir';
  }

  const FLOW_KIND_META = {
    tarefa:  { label:'Tarefa',  cls:'tag-gold' },
    treino:  { label:'Treino',  cls:'tag-sage' }
  };
  function renderFlowList(){
    const nextIdx = getNextIndex();
    if(!activities.length){
      flowListEl.innerHTML = '<p class="empty-state">Nenhuma tarefa ou treino para hoje.</p>';
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
          <div class="flow-meta">
            <span class="tag ${meta.cls}">${meta.label}</span>${a.time ? '<span class="queue-time">' + escapeHtml(a.time) + '</span>' : ''}
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
     FIREBASE + OPENAI — camada de dados real (substitui os dados fictícios)
     ======================================================================= */

  const FIREBASE_API_KEY = "AIzaSyAQqB__M-gKZWHS4zQ1eIA-X6rGqzVtr0I";
  const FIREBASE_DB_URL  = "https://anki-71f4f-default-rtdb.firebaseio.com";
  const SESSION_KEY = "lifeos_v5_session";

  let session = null;      // { idToken, uid, email, expiresAt }
  let activeDataUid = null; // uid cujos dados /users/{uid}/... estão sendo lidos (== session.uid, ou o dono do Quadro selecionado)
  let currentBoardId = null; // Quadro atualmente selecionado (o id é sempre o uid do dono do quadro)
  let myBoards = {};         // { boardId: { name, role: 'owner'|'member', permissions? } }
  let userDisplayName = ''; // nome de exibição, salvo em /Profile/DisplayName
  let openaiApiKey = null; // carregada de /openAiKey após login

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
      if(!s || !s.idToken || !s.expiresAt || Date.now() > s.expiresAt) return null;
      return s;
    }catch(e){ return null; }
  }
  function clearSession(){ session = null; localStorage.removeItem(SESSION_KEY); }

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

  /* ---------- Firebase Realtime Database (REST) ---------- */
  // fetch() pode ficar pendurado para sempre (nunca resolve, nunca rejeita) em
  // certas condições de rede/navegador — por exemplo, ao abrir este arquivo
  // direto como file:// em vez de por um servidor web, o Chrome pode bloquear
  // ou travar silenciosamente chamadas para domínios remotos (Firebase, etc.).
  // Sem um timeout, isso trava a seção correspondente em "Carregando..." para
  // sempre, mesmo com o tratamento de erro no boot. Este wrapper garante que
  // toda chamada de rede sempre resolve ou rejeita dentro de 15s.
  async function fetchWithTimeout(url, options, timeoutMs){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 15000);
    try{
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    }catch(err){
      if(err && err.name === 'AbortError'){
        throw new Error('Tempo de conexão esgotado. Verifique sua internet e tente novamente.');
      }
      throw err;
    }finally{
      clearTimeout(timer);
    }
  }
  function buildUrl(path){
    const qs = session && session.idToken ? ('auth=' + session.idToken) : '';
    return FIREBASE_DB_URL + path + '.json' + (qs ? '?' + qs : '');
  }
  async function dbGet(path){
    showLoading('Carregando...');
    try{
      const res = await fetchWithTimeout(buildUrl(path));
      if(!res.ok) throw new Error('Erro ao ler ' + path);
      return await res.json();
    } finally { hideLoading(); }
  }
  async function dbPut(path, data){
    showLoading('Salvando...');
    try{
      const res = await fetchWithTimeout(buildUrl(path), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
      if(!res.ok) throw new Error('Erro ao salvar ' + path);
      return await res.json();
    } finally { hideLoading(); }
  }
  async function dbPatch(path, data){
    showLoading('Salvando...');
    try{
      const res = await fetchWithTimeout(buildUrl(path), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
      if(!res.ok) throw new Error('Erro ao atualizar ' + path);
      return await res.json();
    } finally { hideLoading(); }
  }
  // Mesma coisa que dbPatch, mas sem acionar o overlay de loading global — para
  // ajustes instantâneos de UI (ex: minimizar/maximizar um card) que não devem
  // travar a tela esperando a rede.
  async function dbPatchSilent(path, data){
    const res = await fetchWithTimeout(buildUrl(path), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if(!res.ok) throw new Error('Erro ao atualizar ' + path);
    return await res.json();
  }
  async function dbPutSilent(path, data){
    const res = await fetchWithTimeout(buildUrl(path), { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
    if(!res.ok) throw new Error('Erro ao salvar ' + path);
    return await res.json();
  }
  async function dbDeleteSilent(path){
    const res = await fetchWithTimeout(buildUrl(path), { method:'DELETE' });
    if(!res.ok) throw new Error('Erro ao remover ' + path);
    return await res.json();
  }
  async function dbDelete(path){
    showLoading('Removendo...');
    try{
      const res = await fetchWithTimeout(buildUrl(path), { method:'DELETE' });
      if(!res.ok) throw new Error('Erro ao remover ' + path);
      return await res.json();
    } finally { hideLoading(); }
  }
  function userPath(sub){ return '/users/' + (activeDataUid || session.uid) + sub; }

  async function loadOpenAiKey(){
    try{ openaiApiKey = await dbGet('/openAiKey'); }
    catch(e){ console.error('Não foi possível carregar a chave da OpenAI', e); openaiApiKey = null; }
  }

  /* ---------- Quadros (Grupos/Famílias) ----------
     Cada pessoa tem um Quadro próprio, identificado pelo seu próprio uid.
     Convidar alguém dá acesso de LEITURA/ESCRITA a /users/{seuUid}/... (com base nas
     permissões escolhidas por tela). Ao trocar de Quadro no seletor, activeDataUid
     passa a ser o uid do dono do quadro selecionado, e todas as chamadas userPath()
     do resto do app passam a ler/gravar os dados daquele quadro automaticamente. */
  const BOARD_VIEW_OPTIONS = [
    { key:'casa', label:'Casa' },
    { key:'hoje', label:'Hoje' },
    { key:'rotina', label:'Rotina' },
    { key:'tarefas', label:'Tarefas' },
    { key:'monday', label:'Monday' },
    { key:'agenda', label:'Agenda' },
    { key:'storage', label:'Arquivo' },
    { key:'academia', label:'Academia' },
    { key:'diario', label:'Diário' },
    { key:'planoalimentar', label:'Plano Alimentar' },
    { key:'objetivos', label:'Objetivos' },
    { key:'visionboard', label:'Vision Board' }
  ];
  const BOARD_ID_STORAGE_KEY = 'lifeos_currentBoardId';

  function sanitizeEmailKey(email){
    return (email || '').trim().toLowerCase().replace(/[.#$\[\]]/g, '_');
  }

  async function ensureOwnBoard(){
    const uid = session.uid;
    let meta = null;
    try{ meta = await dbGet('/boards/' + uid + '/meta'); }catch(e){ meta = null; }
    if(!meta){
      meta = { name: 'Meu Quadro', ownerUid: uid, ownerEmail: session.email };
      await dbPut('/boards/' + uid + '/meta', meta);
      const allPerms = {}; BOARD_VIEW_OPTIONS.forEach(o => allPerms[o.key] = true);
      await dbPut('/boards/' + uid + '/members/' + uid, { email: session.email, role: 'owner', permissions: allPerms });
    }
    try{ await dbPatchSilent('/users/' + uid + '/boards/' + uid, { name: (meta && meta.name) || 'Meu Quadro', role: 'owner' }); }catch(e){ /* ignore */ }
  }

  async function loadMyBoards(){
    let data = null;
    try{ data = await dbGet('/users/' + session.uid + '/boards'); }catch(e){ data = null; }
    data = data || {};
    if(!data[session.uid]) data[session.uid] = { name: 'Meu Quadro', role: 'owner' };
    for(const boardId of Object.keys(data)){
      if(boardId === session.uid) continue;
      try{
        const memberInfo = await dbGet('/boards/' + boardId + '/members/' + session.uid);
        if(memberInfo){ data[boardId] = Object.assign({}, data[boardId], { permissions: memberInfo.permissions || {} }); }
      }catch(e){ /* sem acesso mais — ignora */ }
    }
    myBoards = data;
  }

  function renderBoardSwitcher(){
    const select = document.getElementById('configBoardSelect');
    if(!select) return;
    const entries = Object.entries(myBoards);
    select.innerHTML = entries.map(([id, b]) => {
      const label = (b.name || (id === session.uid ? 'Meu Quadro' : 'Quadro')) + (id === session.uid ? ' (você)' : ' — membro');
      return `<option value="${id}" ${id === currentBoardId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function applyBoardPermissionsToNav(){
    const isOwn = currentBoardId === session.uid;
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      const key = item.getAttribute('data-view');
      if(isOwn){ item.style.display = ''; return; }
      const perms = (myBoards[currentBoardId] && myBoards[currentBoardId].permissions) || {};
      item.style.display = perms[key] ? '' : 'none';
    });
    const renameRow = document.getElementById('configBoardRenameRow');
    const inviteRow = document.getElementById('configBoardInviteRow');
    if(renameRow) renameRow.style.display = isOwn ? '' : 'none';
    if(inviteRow) inviteRow.style.display = isOwn ? '' : 'none';
    const activeDesc = document.getElementById('configBoardActiveDesc');
    if(activeDesc) activeDesc.textContent = isOwn ? 'Você está vendo os dados do seu próprio Quadro.' : 'Você está vendo os dados de um Quadro compartilhado com você.';
    const activeNav = document.querySelector('.nav-item.active[data-view]');
    if(activeNav && activeNav.style.display === 'none'){
      const firstVisible = Array.from(document.querySelectorAll('.nav-item[data-view]')).find(i => i.style.display !== 'none');
      goToView(firstVisible ? firstVisible.getAttribute('data-view') : 'casa');
    }
  }

  async function switchBoard(boardId){
    if(boardId === currentBoardId) return;
    currentBoardId = boardId;
    activeDataUid = boardId;
    localStorage.setItem(BOARD_ID_STORAGE_KEY, boardId);
    renderBoardSwitcher();
    applyBoardPermissionsToNav();
    await bootApp();
  }

  async function initBoards(){
    await ensureOwnBoard();
    await loadMyBoards();
    const saved = localStorage.getItem(BOARD_ID_STORAGE_KEY);
    currentBoardId = (saved && myBoards[saved]) ? saved : session.uid;
    activeDataUid = currentBoardId;
    renderBoardSwitcher();
    applyBoardPermissionsToNav();
  }

  async function checkPendingInvites(){
    const emailKey = sanitizeEmailKey(session.email);
    let invites = null;
    try{ invites = await dbGet('/boardInvites/' + emailKey); }catch(e){ invites = null; }
    if(!invites) return;
    const entries = Object.entries(invites);
    if(!entries.length) return;
    const list = document.getElementById('boardInvitesPendingList');
    list.innerHTML = entries.map(([id, inv]) => `
      <div class="casa-pending-item" data-invite-id="${id}">
        <span class="casa-pending-item-text">Quadro de <strong>${escapeHtml(inv.ownerEmail || '')}</strong></span>
        <div class="casa-pending-item-actions">
          <button class="btn btn-ghost btn-sm" data-decline-invite="${id}">Recusar</button>
          <button class="btn btn-primary btn-sm" data-accept-invite="${id}">Aceitar</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-accept-invite]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-accept-invite');
      const inv = invites[id];
      await dbPut('/boards/' + inv.ownerUid + '/members/' + session.uid, { email: session.email, role: 'member', permissions: inv.permissions || { casa:true } });
      await dbPut('/users/' + session.uid + '/boards/' + inv.ownerUid, { name: inv.boardName || 'Quadro', role: 'member' });
      await dbDelete('/boardInvites/' + emailKey + '/' + id);
      const row = btn.closest('.casa-pending-item'); if(row) row.remove();
      await loadMyBoards();
      renderBoardSwitcher();
      showAppMessage('Convite aceito! Troque de Quadro em Configurações para acessar.', 'success');
      if(!document.getElementById('boardInvitesPendingList').children.length){
        document.getElementById('boardInvitesPendingModal').classList.remove('active');
      }
    }));
    list.querySelectorAll('[data-decline-invite]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-decline-invite');
      await dbDelete('/boardInvites/' + emailKey + '/' + id);
      const row = btn.closest('.casa-pending-item'); if(row) row.remove();
      if(!document.getElementById('boardInvitesPendingList').children.length){
        document.getElementById('boardInvitesPendingModal').classList.remove('active');
      }
    }));
    document.getElementById('boardInvitesPendingModal').classList.add('active');
  }

  document.getElementById('configBoardSelect').addEventListener('change', (e) => {
    switchBoard(e.target.value);
  });
  document.getElementById('boardInvitesPendingCloseBtn').addEventListener('click', () => {
    document.getElementById('boardInvitesPendingModal').classList.remove('active');
  });

  function renderInvitePermChecklist(){
    const wrap = document.getElementById('boardInvitePermList');
    wrap.innerHTML = BOARD_VIEW_OPTIONS.map(o => `
      <label class="board-perm-item"><input type="checkbox" data-perm-key="${o.key}" ${o.key === 'casa' ? 'checked' : ''}> ${o.label}</label>
    `).join('');
  }
  document.getElementById('boardInviteOpenBtn').addEventListener('click', () => {
    document.getElementById('boardInviteEmailInput').value = '';
    renderInvitePermChecklist();
    document.getElementById('boardInviteModal').classList.add('active');
  });
  document.getElementById('boardInviteCancelBtn').addEventListener('click', () => {
    document.getElementById('boardInviteModal').classList.remove('active');
  });
  document.getElementById('boardInviteOkBtn').addEventListener('click', async () => {
    const email = document.getElementById('boardInviteEmailInput').value.trim().toLowerCase();
    if(!email || !email.includes('@')){ showAppMessage('Digite um e-mail válido.', 'error'); return; }
    const permissions = {};
    document.querySelectorAll('#boardInvitePermList [data-perm-key]').forEach(cb => { permissions[cb.getAttribute('data-perm-key')] = cb.checked; });
    const emailKey = sanitizeEmailKey(email);
    const inviteId = newId();
    await dbPut('/boardInvites/' + emailKey + '/' + inviteId, {
      ownerUid: session.uid,
      ownerEmail: session.email,
      boardName: (myBoards[session.uid] && myBoards[session.uid].name) || 'Meu Quadro',
      permissions,
      criadoEm: new Date().toISOString()
    });
    document.getElementById('boardInviteModal').classList.remove('active');
    showAppMessage('Convite enviado para ' + email + '. Ele aparece quando essa pessoa logar no Life OS.', 'success');
  });

  /* ---------- Config: renomear o Quadro ---------- */
  document.getElementById('configSaveBoardNameBtn').addEventListener('click', async () => {
    const input = document.getElementById('configBoardNameInput');
    const name = input.value.trim();
    if(!name){ showAppMessage('Digite um nome para o Quadro.', 'error'); return; }
    await dbPatch('/boards/' + session.uid + '/meta', { name });
    await dbPatch('/users/' + session.uid + '/boards/' + session.uid, { name });
    if(myBoards[session.uid]) myBoards[session.uid].name = name;
    renderBoardSwitcher();
    showAppMessage('Nome do Quadro atualizado.', 'success');
  });

  /* ---------- Config: pessoas da casa (usadas nos dropdowns de responsável) ---------- */
  let casaMembros = {}; // { id: nome }

  async function loadCasaMembros(){
    try{ casaMembros = await dbGet(userPath('/casa/membros')) || {}; }
    catch(e){ casaMembros = {}; }
  }

  function populateCasaResponsavelSelects(){
    const nomes = Object.entries(casaMembros).sort((a,b) => a[1].localeCompare(b[1]));
    const atividadeSelect = document.getElementById('casaAtividadeResponsavelInput');
    const regraSelect = document.getElementById('casaRegraResponsavelInput');
    const mondaySelect = document.getElementById('mondayResponsavelModalInput');
    const erroSelect = document.getElementById('casaErroPessoaInput');
    if(erroSelect){
      const current = erroSelect.value;
      erroSelect.innerHTML = '<option value="">Ninguém específico</option>' + nomes.map(([id, nome]) => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`).join('');
      erroSelect.value = current;
    }
    if(atividadeSelect){
      const current = atividadeSelect.value;
      atividadeSelect.innerHTML = '<option value="">Ninguém específico</option>' + nomes.map(([id, nome]) => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`).join('');
      atividadeSelect.value = current;
    }
    if(regraSelect){
      const current = regraSelect.value;
      regraSelect.innerHTML = '<option value="">Todo mundo</option>' + nomes.map(([id, nome]) => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`).join('');
      regraSelect.value = current;
    }
    if(mondaySelect){
      const current = mondaySelect.value;
      mondaySelect.innerHTML = '<option value="">Ninguém específico</option>' + nomes.map(([id, nome]) => `<option value="${escapeHtml(nome)}">${escapeHtml(nome)}</option>`).join('');
      mondaySelect.value = current;
    }
  }

  function renderConfigCasaMembros(){
    const wrap = document.getElementById('configCasaMembrosList');
    if(!wrap) return;
    const nomes = Object.entries(casaMembros).sort((a,b) => a[1].localeCompare(b[1]));
    if(!nomes.length){ wrap.innerHTML = '<p class="empty-state" style="margin:0;">Nenhuma pessoa cadastrada ainda.</p>'; return; }
    wrap.innerHTML = nomes.map(([id, nome]) => `
      <div class="config-tag"><span>${escapeHtml(nome)}</span><button data-del-membro="${id}" title="Remover">×</button></div>
    `).join('');
    wrap.querySelectorAll('[data-del-membro]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-membro');
      await dbDelete(userPath('/casa/membros/' + id));
      delete casaMembros[id];
      renderConfigCasaMembros();
      populateCasaResponsavelSelects();
    }));
  }

  document.getElementById('configAddCasaMembroBtn').addEventListener('click', async () => {
    const input = document.getElementById('configCasaMembroInput');
    const nome = input.value.trim();
    if(!nome){ showAppMessage('Digite um nome.', 'error'); return; }
    const id = newId();
    await dbPut(userPath('/casa/membros/' + id), nome);
    casaMembros[id] = nome;
    input.value = '';
    renderConfigCasaMembros();
    populateCasaResponsavelSelects();
  });

  /* ---------- Timeline "Minha rotina hoje": tooltip ao passar o mouse ---------- */
  let hojeTimelineHoverBlocos = [];

  function setupTimelineHoverTip(){
    const track = document.getElementById('hojeTimeline24hTrack');
    const tip = document.getElementById('timelineHoverTip');
    if(!track || !tip || track.dataset.hoverBound) return;
    track.dataset.hoverBound = '1';
    track.addEventListener('mousemove', (e) => {
      const rect = track.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const min = Math.round(frac * 1440);
      const bloco = hojeTimelineHoverBlocos.find(b => min >= b.inicio && min < b.fim);
      const nameEl = tip.querySelector('.tip-name');
      const timeEl = tip.querySelector('.tip-time');
      if(bloco){
        nameEl.textContent = bloco.nome;
        timeEl.textContent = bloco.inicioStr + '–' + bloco.fimStr;
        nameEl.style.color = bloco.cor;
        timeEl.style.color = bloco.cor;
        tip.style.borderColor = bloco.cor;
      } else {
        const hh = String(Math.floor(min / 60)).padStart(2, '0');
        const mm = String(min % 60).padStart(2, '0');
        nameEl.textContent = 'Livre';
        timeEl.textContent = hh + ':' + mm;
        nameEl.style.color = '';
        timeEl.style.color = '';
        tip.style.borderColor = '';
      }
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    });
    track.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }

  /* ---------- CASA (dados do Quadro ativo — atividades, regras, erros) ---------- */
  const CASA_FREQ_LABELS = { diaria:'Diária', semanal:'Semanal', quinzenal:'Quinzenal', mensal:'Mensal' };

  async function renderCasaAtividades(){
    const el = document.getElementById('casaAtividadesList');
    const data = await dbGet(userPath('/casa/atividades')) || {};
    const entries = Object.entries(data).sort((a,b) => (a[1].criadoEm||'').localeCompare(b[1].criadoEm||''));
    if(!entries.length){ el.innerHTML = '<p class="empty-state">Nenhuma atividade cadastrada ainda.</p>'; return; }
    el.innerHTML = entries.map(([id, a]) => `
      <div class="casa-card" data-id="${id}">
        <div class="casa-card-main">
          <p class="casa-card-title">${escapeHtml(a.nome)}</p>
          <div class="casa-card-meta">
            <span>${CASA_FREQ_LABELS[a.frequencia] || a.frequencia || ''}</span>
            ${a.responsavel ? `<span>· ${escapeHtml(a.responsavel)}</span>` : ''}
          </div>
        </div>
        <div class="casa-card-actions"><button data-del-atividade="${id}">excluir</button></div>
      </div>`).join('');
    el.querySelectorAll('[data-del-atividade]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta atividade?')) return;
      await dbDelete(userPath('/casa/atividades/' + btn.getAttribute('data-del-atividade')));
      await renderCasaAtividades();
    }));
  }
  document.getElementById('casaAddAtividadeBtn').addEventListener('click', () => {
    document.getElementById('casaAtividadeNomeInput').value = '';
    document.getElementById('casaAtividadeFrequenciaInput').value = 'semanal';
    populateCasaResponsavelSelects();
    document.getElementById('casaAtividadeResponsavelInput').value = '';
    document.getElementById('casaAtividadeModal').classList.add('active');
  });
  document.getElementById('casaAtividadeCancelBtn').addEventListener('click', () => document.getElementById('casaAtividadeModal').classList.remove('active'));
  document.getElementById('casaAtividadeOkBtn').addEventListener('click', async () => {
    const nome = document.getElementById('casaAtividadeNomeInput').value.trim();
    if(!nome){ showAppMessage('Digite o nome da atividade.', 'error'); return; }
    const frequencia = document.getElementById('casaAtividadeFrequenciaInput').value;
    const responsavel = document.getElementById('casaAtividadeResponsavelInput').value.trim();
    await dbPut(userPath('/casa/atividades/' + newId()), { nome, frequencia, responsavel, criadoEm: new Date().toISOString() });
    document.getElementById('casaAtividadeModal').classList.remove('active');
    await renderCasaAtividades();
  });

  async function renderCasaRegras(){
    const el = document.getElementById('casaRegrasList');
    const data = await dbGet(userPath('/casa/regras')) || {};
    const entries = Object.entries(data).sort((a,b) => (a[1].criadoEm||'').localeCompare(b[1].criadoEm||''));
    if(!entries.length){ el.innerHTML = '<p class="empty-state">Nenhuma regra cadastrada ainda.</p>'; return; }
    el.innerHTML = entries.map(([id, r]) => `
      <div class="casa-card" data-id="${id}">
        <div class="casa-card-main">
          <p class="casa-card-title" style="white-space:pre-wrap;">${escapeHtml(r.texto)}</p>
          ${r.responsavel ? `<div class="casa-card-meta"><span>Responsável: ${escapeHtml(r.responsavel)}</span></div>` : ''}
        </div>
        <div class="casa-card-actions"><button data-del-regra="${id}">excluir</button></div>
      </div>`).join('');
    el.querySelectorAll('[data-del-regra]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta regra?')) return;
      await dbDelete(userPath('/casa/regras/' + btn.getAttribute('data-del-regra')));
      await renderCasaRegras();
    }));
  }
  document.getElementById('casaAddRegraBtn').addEventListener('click', () => {
    document.getElementById('casaRegraTextoInput').value = '';
    populateCasaResponsavelSelects();
    document.getElementById('casaRegraResponsavelInput').value = '';
    document.getElementById('casaRegraModal').classList.add('active');
  });
  document.getElementById('casaRegraCancelBtn').addEventListener('click', () => document.getElementById('casaRegraModal').classList.remove('active'));
  document.getElementById('casaRegraOkBtn').addEventListener('click', async () => {
    const texto = document.getElementById('casaRegraTextoInput').value.trim();
    if(!texto){ showAppMessage('Digite o texto da regra.', 'error'); return; }
    const responsavel = document.getElementById('casaRegraResponsavelInput').value.trim();
    await dbPut(userPath('/casa/regras/' + newId()), { texto, responsavel, criadoEm: new Date().toISOString() });
    document.getElementById('casaRegraModal').classList.remove('active');
    await renderCasaRegras();
  });

  function casaErroCardHtml(id, er){
    return `
      <div class="casa-card" data-id="${id}">
        ${er.imagem ? `<img class="casa-erro-thumb" src="${escapeHtml(er.imagem)}" alt="">` : ''}
        <div class="casa-card-main">
          <p class="casa-card-title">${escapeHtml(er.descricao)}</p>
          <div class="casa-card-meta">
            ${er.pessoa ? `<span>${escapeHtml(er.pessoa)}</span>` : ''}
            <span>${er.criadoEm ? fmtShortDate(er.criadoEm.slice(0,10)) : ''}</span>
            ${er.corrigido && er.corrigidoEm ? `<span>corrigido em ${fmtShortDate(er.corrigidoEm.slice(0,10))}</span>` : ''}
          </div>
        </div>
        <div class="casa-card-actions">
          ${er.corrigido
            ? `<button data-reabrir-erro="${id}">reabrir</button>`
            : `<button data-corrigir-erro="${id}">✓ corrigido</button>`}
          <button data-del-erro="${id}">excluir</button>
        </div>
      </div>`;
  }
  async function renderCasaErros(){
    const el = document.getElementById('casaErrosList');
    const resolvidosToggle = document.getElementById('casaErrosResolvidosToggle');
    const resolvidosEl = document.getElementById('casaErrosResolvidosList');
    const data = await dbGet(userPath('/casa/erros')) || {};
    const entries = Object.entries(data).sort((a,b) => (b[1].criadoEm||'').localeCompare(a[1].criadoEm||''));
    const abertos = entries.filter(([, er]) => !er.corrigido);
    const corrigidos = entries.filter(([, er]) => er.corrigido);

    el.innerHTML = abertos.length
      ? abertos.map(([id, er]) => casaErroCardHtml(id, er)).join('')
      : '<p class="empty-state">Nenhum erro em aberto. 🎉</p>';

    if(corrigidos.length){
      resolvidosToggle.style.display = 'block';
      resolvidosToggle.setAttribute('data-count', corrigidos.length);
      const showing = resolvidosEl.style.display !== 'none';
      resolvidosToggle.innerHTML = (showing ? 'Esconder' : 'Ver') + ` erros já corrigidos (${corrigidos.length})`;
      resolvidosEl.innerHTML = corrigidos.map(([id, er]) => casaErroCardHtml(id, er)).join('');
    } else {
      resolvidosToggle.style.display = 'none';
      resolvidosEl.style.display = 'none';
      resolvidosEl.innerHTML = '';
    }

    [el, resolvidosEl].forEach(container => {
      container.querySelectorAll('[data-del-erro]').forEach(btn => btn.addEventListener('click', async () => {
        if(!await showConfirm('Excluir este registro?')) return;
        await dbDelete(userPath('/casa/erros/' + btn.getAttribute('data-del-erro')));
        await renderCasaErros();
      }));
      container.querySelectorAll('[data-corrigir-erro]').forEach(btn => btn.addEventListener('click', async () => {
        await dbPatch(userPath('/casa/erros/' + btn.getAttribute('data-corrigir-erro')), { corrigido: true, corrigidoEm: new Date().toISOString() });
        await renderCasaErros();
      }));
      container.querySelectorAll('[data-reabrir-erro]').forEach(btn => btn.addEventListener('click', async () => {
        await dbPatch(userPath('/casa/erros/' + btn.getAttribute('data-reabrir-erro')), { corrigido: false, corrigidoEm: null });
        await renderCasaErros();
      }));
    });
  }
  document.getElementById('casaErrosResolvidosToggle').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const listEl = document.getElementById('casaErrosResolvidosList');
    const showing = listEl.style.display !== 'none';
    listEl.style.display = showing ? 'none' : 'block';
    const count = btn.getAttribute('data-count') || '0';
    btn.innerHTML = (showing ? 'Ver' : 'Esconder') + ` erros já corrigidos (${count})`;
  });
  document.getElementById('casaAddErroBtn').addEventListener('click', () => {
    document.getElementById('casaErroDescricaoInput').value = '';
    populateCasaResponsavelSelects();
    document.getElementById('casaErroPessoaInput').value = '';
    document.getElementById('casaErroFotoInput').value = '';
    document.getElementById('casaErroFotoPreview').style.display = 'none';
    document.getElementById('casaErroFotoPreview').removeAttribute('src');
    document.getElementById('casaErroFotoRemoveBtn').style.display = 'none';
    document.getElementById('casaErroModal').classList.add('active');
  });
  document.getElementById('casaErroCancelBtn').addEventListener('click', () => document.getElementById('casaErroModal').classList.remove('active'));
  document.getElementById('casaErroFotoInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    try{
      const dataUrl = await resizeImageDataUrl(file, 900);
      const preview = document.getElementById('casaErroFotoPreview');
      preview.src = dataUrl;
      preview.style.display = 'block';
      document.getElementById('casaErroFotoRemoveBtn').style.display = 'inline-block';
    }catch(err){
      showAppMessage('Não consegui ler essa imagem.', 'error');
    }
  });
  document.getElementById('casaErroFotoRemoveBtn').addEventListener('click', () => {
    document.getElementById('casaErroFotoInput').value = '';
    const preview = document.getElementById('casaErroFotoPreview');
    preview.style.display = 'none';
    preview.removeAttribute('src');
    document.getElementById('casaErroFotoRemoveBtn').style.display = 'none';
  });
  document.getElementById('casaErroOkBtn').addEventListener('click', async () => {
    const descricao = document.getElementById('casaErroDescricaoInput').value.trim();
    if(!descricao){ showAppMessage('Descreva o que aconteceu.', 'error'); return; }
    const pessoa = document.getElementById('casaErroPessoaInput').value.trim();
    const imagem = document.getElementById('casaErroFotoPreview').getAttribute('src') || null;
    await dbPut(userPath('/casa/erros/' + newId()), { descricao, pessoa, imagem, autorEmail: session.email, criadoEm: new Date().toISOString() });
    document.getElementById('casaErroModal').classList.remove('active');
    await renderCasaErros();
  });


  /* ---------- FINANÇAS ---------- */
  const FINANCAS_URL = 'https://financas.guilherme-oliveira.com';
  function renderFinancas(){
    const wrap = document.getElementById('financasFrameWrap');
    const note = document.getElementById('financasEmbedNote');
    const openBtn = document.getElementById('financasOpenTabBtn');
    const email = session && session.email ? session.email : '';
    const src = FINANCAS_URL + (email ? ('?email=' + encodeURIComponent(email)) : '');
    openBtn.href = src;
    note.textContent = 'Tentando carregar aqui dentro — se não aparecer, use "Abrir em nova aba".';
    wrap.innerHTML = `<iframe id="financasIframe" src="${escapeHtml(src)}" title="Finanças"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals"
      referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    clearTimeout(renderFinancas._fallbackTimer);
    renderFinancas._fallbackTimer = setTimeout(() => {
      if(document.getElementById('financasIframe')){
        note.textContent = 'Se a tela acima estiver em branco, é porque as Finanças não permitem ser exibidas dentro de outro site — abra em nova aba.';
      }
    }, 4000);
  }

  /* ---------- OBJETIVOS (objetivo grande + pontos menores que dependem dele) ---------- */
  let objEditingId = null; // null = criando um novo objetivo

  function ringDashoffset(pct){
    // circunferência do círculo usado nos cards (r=16 -> 2*PI*16 ≈ 100.5)
    const circumference = 100.5;
    const clamped = Math.max(0, Math.min(100, pct));
    return (circumference - (circumference * clamped / 100)).toFixed(1);
  }

  const OBJ_CATEGORIAS = [
    { key:'saude', label:'Saúde', emoji:'🩺', color:'var(--sage)', soft:'var(--sage-soft)' },
    { key:'carreira', label:'Carreira', emoji:'💼', color:'var(--gold)', soft:'var(--gold-soft)' },
    { key:'financeiro', label:'Financeiro', emoji:'💰', color:'var(--blue)', soft:'var(--blue-soft)' },
    { key:'relacionamentos', label:'Relacionamentos', emoji:'❤️', color:'var(--coral)', soft:'var(--coral-soft)' },
    { key:'pessoal', label:'Pessoal', emoji:'🌱', color:'var(--purple)', soft:'var(--purple-soft)' },
    { key:'educacao', label:'Educação', emoji:'📚', color:'var(--blue)', soft:'var(--blue-soft)' },
    { key:'espiritualidade', label:'Espiritualidade', emoji:'✨', color:'var(--purple)', soft:'var(--purple-soft)' },
    { key:'outro', label:'Outro', emoji:'🎯', color:'var(--text-dim)', soft:'rgba(255,255,255,0.05)' }
  ];
  const OBJ_PRIORIDADE_LABEL = { alta:'Alta prioridade', media:'Média prioridade', baixa:'Baixa prioridade' };
  const OBJ_PRIORIDADE_ORDER = { alta:0, media:1, baixa:2 };
  function objCategoria(key){ return OBJ_CATEGORIAS.find(c => c.key === key) || OBJ_CATEGORIAS[OBJ_CATEGORIAS.length - 1]; }

  const OBJ_AUTO_TIPOS = {
    fluencia: 'cards de Fluência estudados',
    academia: 'exercícios concluídos na Academia',
    tarefas: 'tarefas concluídas',
    diario: 'entradas no Diário',
    monday: 'tarefas concluídas no Monday'
  };
  async function fetchAutoActionCounts(){
    const [cards, academiaDias, tasks, diario, monday] = await Promise.all([
      dbGet(userPath('/Cards')).catch(() => null),
      dbGet(userPath('/AcademiaDias')).catch(() => null),
      dbGet(userPath('/Tasks')).catch(() => null),
      dbGet(userPath('/DiarioEntradas')).catch(() => null),
      dbGet(userPath('/MondayTasks')).catch(() => null)
    ]);
    let fluencia = 0;
    Object.values(cards || {}).forEach(c => { fluencia += (c.History || []).length; });
    let academia = 0;
    Object.values(academiaDias || {}).forEach(dia => {
      Object.values((dia && dia.exercicios) || {}).forEach(ex => { academia += Object.keys(ex.doneDates || {}).length; });
    });
    const tarefas = Object.values(tasks || {}).filter(t => t.done).length;
    const diarioCount = Object.keys(diario || {}).length;
    const mondayCount = Object.values(monday || {}).filter(t => t.status === 'done').length;
    return { fluencia, academia, tarefas, diario: diarioCount, monday: mondayCount };
  }
  function objetivoPctFromData(objId, data, cache, visiting){
    if(cache.has(objId)) return cache.get(objId);
    const o = data[objId];
    if(!o || visiting.has(objId)){ return 0; } // sem objetivo ou ciclo entre referências
    visiting.add(objId);
    const pontos = Object.values(o.pontos || {});
    const pct = pontos.length
      ? Math.round(pontos.reduce((sum, p) => {
          if(p.autoTipo === 'objetivo' && p.autoObjId){
            return sum + objetivoPctFromData(p.autoObjId, data, cache, visiting);
          }
          return sum + pontoProgresso(p);
        }, 0) / pontos.length)
      : 0;
    visiting.delete(objId);
    cache.set(objId, pct);
    return pct;
  }
  function aplicarAutoProgresso(data, counts){
    // 1ª passada: pontos ligados a ações da própria plataforma (contagens diretas)
    Object.values(data).forEach(o => {
      Object.values(o.pontos || {}).forEach(p => {
        if(p.autoTipo && p.autoTipo !== 'objetivo' && counts[p.autoTipo] !== undefined){
          const atual = counts[p.autoTipo];
          const base = p.autoBase || 0;
          const meta = p.autoMeta || 1;
          p.progresso = Math.max(0, Math.min(100, Math.round((atual - base) / meta * 100)));
        }
      });
    });
    // 2ª passada: pontos que referenciam o progresso de outro objetivo (com proteção contra ciclos)
    const cache = new Map();
    Object.values(data).forEach(o => {
      Object.values(o.pontos || {}).forEach(p => {
        if(p.autoTipo === 'objetivo' && p.autoObjId){
          p.progresso = objetivoPctFromData(p.autoObjId, data, cache, new Set());
        }
      });
    });
  }
  async function renderObjetivos(){
    const el = document.getElementById('objetivosList');
    const data = await dbGet(userPath('/objetivos')) || {};
    const counts = await fetchAutoActionCounts();
    aplicarAutoProgresso(data, counts);
    const entries = Object.entries(data).sort((a,b) => {
      const pa = OBJ_PRIORIDADE_ORDER[a[1].prioridade] ?? 1;
      const pb = OBJ_PRIORIDADE_ORDER[b[1].prioridade] ?? 1;
      return pa - pb || (a[1].criadoEm||'').localeCompare(b[1].criadoEm||'');
    });
    if(!entries.length){
      el.innerHTML = '<p class="empty-state">Nenhum objetivo cadastrado ainda. Crie o primeiro com "+ Novo objetivo".</p>';
      return;
    }
    const hojeStr = new Date().toISOString().slice(0,10);
    el.innerHTML = entries.map(([id, o]) => {
      const pontosMap = o.pontos || {};
      const pontos = Object.entries(pontosMap).sort((a,b) => (a[1].criadoEm||'').localeCompare(b[1].criadoEm||''));
      const total = pontos.length;
      const pct = total ? Math.round(pontos.reduce((sum, [, p]) => sum + pontoProgresso(p), 0) / total) : 0;
      const cat = objCategoria(o.categoria);
      const prioridade = o.prioridade && OBJ_PRIORIDADE_LABEL[o.prioridade] ? o.prioridade : 'media';
      const prazoOverdue = o.prazo && o.prazo < hojeStr && pct < 100;
      return `
      <div class="obj-card-detail" data-obj-id="${id}" style="--obj-cat-color:${cat.color}; --obj-cat-soft:${cat.soft};">
        <div class="obj-top">
          <div class="obj-title-row">
            <div class="obj-icon-badge">${cat.emoji}</div>
            <div>
              <div class="obj-name">${escapeHtml(o.nome)}</div>
              ${o.descricao ? `<p class="obj-desc">${escapeHtml(o.descricao)}</p>` : ''}
            </div>
          </div>
          <svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="var(--surface-hi)" stroke-width="4"/><circle cx="20" cy="20" r="16" fill="none" stroke="var(--obj-cat-color, var(--sage))" stroke-width="4" stroke-dasharray="100.5" stroke-dashoffset="${ringDashoffset(pct)}" stroke-linecap="round" transform="rotate(-90 20 20)"/></svg>
        </div>
        <div class="obj-meta-row">
          <span class="obj-cat-pill">${cat.label}</span>
          <span class="obj-priority-pill priority-${prioridade}">${OBJ_PRIORIDADE_LABEL[prioridade]}</span>
          ${o.prazo ? `<span class="prazo-pill ${prazoOverdue ? 'prazo-futuro' : 'prazo-datado'}" style="${prazoOverdue ? 'color:var(--coral);border-color:rgba(180,106,92,0.4);' : ''}">${prazoOverdue ? 'atrasado · ' : 'até '}${fmtShortDate(o.prazo)}</span>` : ''}
        </div>
        <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct}%; background:linear-gradient(90deg, var(--obj-cat-color, var(--sage)), var(--obj-cat-color, var(--sage)));"></div></div>
        <div class="obj-foot" style="margin-bottom:0;">
          <span>${total ? total + ' ponto' + (total === 1 ? '' : 's') + ' · progresso médio' : 'sem pontos ainda'}</span>
          <span>${pct}%</span>
          <span class="obj-foot-actions">
            <button data-edit-obj="${id}">editar</button>
            <button data-del-obj="${id}">excluir</button>
          </span>
        </div>
        <p class="obj-group-sub-label">Pontos menores desse objetivo</p>
        <div class="obj-pontos-list">
          ${pontos.length ? pontos.map(([pid, p]) => {
            const progresso = pontoProgresso(p);
            const overdue = p.prazo && p.prazo < hojeStr && progresso < 100;
            const dep = p.dependeDe ? pontosMap[p.dependeDe] : null;
            const bloqueado = dep && pontoProgresso(dep) < 100;
            return `
            <div class="obj-ponto-card ${progresso >= 100 ? 'is-done' : ''}" data-ponto-id="${pid}">
              <div class="obj-ponto-top">
                <span class="obj-ponto-nome">${escapeHtml(p.nome)}</span>
                <span class="obj-ponto-actions">
                  <button data-edit-ponto="${pid}" data-obj-id="${id}">editar</button>
                  <button data-del-ponto="${pid}" data-obj-id="${id}">excluir</button>
                </span>
              </div>
              ${p.descricao ? `<p class="obj-ponto-desc">${escapeHtml(p.descricao)}</p>` : ''}
              <div class="obj-ponto-meta">
                <div class="obj-ponto-progress-track"><div class="obj-ponto-progress-fill" style="width:${progresso}%;"></div></div>
                <span class="obj-ponto-progress-pct">${progresso}%</span>
                ${p.autoTipo ? `<span class="obj-ponto-auto-tag">⚡ auto: ${p.autoTipo === 'objetivo' ? 'objetivo "' + escapeHtml((data[p.autoObjId] && data[p.autoObjId].nome) || '?') + '"' : (OBJ_AUTO_TIPOS[p.autoTipo] || p.autoTipo)}</span>` : ''}
                ${bloqueado ? `<span class="obj-ponto-blocked-tag">🔒 depende de: ${escapeHtml(dep.nome)}</span>` : ''}
                ${p.prazo ? `<span class="obj-ponto-prazo ${overdue ? 'is-overdue' : ''}">prazo: ${fmtShortDate(p.prazo)}</span>` : ''}
              </div>
            </div>`;
          }).join('') : '<p class="empty-state" style="margin:0 0 4px;">Nenhum ponto ainda — adicione abaixo.</p>'}
        </div>
        <button class="obj-ponto-add-btn" data-add-ponto="${id}">+ Adicionar ponto</button>
      </div>`;
    }).join('');

    // Editar / excluir objetivo
    el.querySelectorAll('[data-edit-obj]').forEach(btn => btn.addEventListener('click', () => openObjModal(btn.getAttribute('data-edit-obj'))));
    el.querySelectorAll('[data-del-obj]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir este objetivo e todos os pontos dele?')) return;
      await dbDelete(userPath('/objetivos/' + btn.getAttribute('data-del-obj')));
      await renderObjetivos();
    }));

    // Editar / excluir ponto
    el.querySelectorAll('[data-edit-ponto]').forEach(btn => btn.addEventListener('click', () => {
      openPontoModal(btn.getAttribute('data-obj-id'), btn.getAttribute('data-edit-ponto'));
    }));
    el.querySelectorAll('[data-del-ponto]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir este ponto?')) return;
      const objId = btn.getAttribute('data-obj-id');
      const pontoId = btn.getAttribute('data-del-ponto');
      await dbDelete(userPath('/objetivos/' + objId + '/pontos/' + pontoId));
      await renderObjetivos();
    }));

    // Adicionar ponto (abre o modal completo)
    el.querySelectorAll('[data-add-ponto]').forEach(btn => btn.addEventListener('click', () => {
      openPontoModal(btn.getAttribute('data-add-ponto'), null);
    }));
  }

  function pontoProgresso(p){
    // compatibilidade com pontos antigos que usavam status/feito em vez de um progresso 0-100
    if(!p) return 0;
    if(typeof p.progresso === 'number') return Math.max(0, Math.min(100, Math.round(p.progresso)));
    if(p.status === 'concluido') return 100;
    if(p.status === 'andamento') return 50;
    if(p.feito) return 100;
    return 0;
  }

  function populateObjCategoriaSelect(){
    const sel = document.getElementById('objCategoriaInput');
    if(sel.options.length) return;
    sel.innerHTML = OBJ_CATEGORIAS.map(c => `<option value="${c.key}">${c.emoji} ${c.label}</option>`).join('');
  }
  function openObjModal(id){
    objEditingId = id || null;
    populateObjCategoriaSelect();
    document.getElementById('objModalTitle').textContent = id ? 'Editar objetivo' : 'Novo objetivo';
    document.getElementById('objNomeInput').value = '';
    document.getElementById('objDescricaoInput').value = '';
    document.getElementById('objCategoriaInput').value = 'pessoal';
    document.getElementById('objPrioridadeInput').value = 'media';
    document.getElementById('objPrazoInput').value = '';
    document.getElementById('objPrazoInput').disabled = false;
    document.getElementById('objNoPrazoToggle').classList.remove('active');
    if(id){
      dbGet(userPath('/objetivos/' + id)).then(o => {
        if(!o) return;
        document.getElementById('objNomeInput').value = o.nome || '';
        document.getElementById('objDescricaoInput').value = o.descricao || '';
        document.getElementById('objCategoriaInput').value = o.categoria || 'pessoal';
        document.getElementById('objPrioridadeInput').value = o.prioridade || 'media';
        if(o.prazo){
          document.getElementById('objPrazoInput').value = o.prazo;
        } else {
          document.getElementById('objNoPrazoToggle').classList.add('active');
          document.getElementById('objPrazoInput').disabled = true;
        }
      });
    }
    document.getElementById('objModal').classList.add('active');
  }
  document.getElementById('objAddBtn').addEventListener('click', () => openObjModal(null));
  document.getElementById('objCancelBtn').addEventListener('click', () => document.getElementById('objModal').classList.remove('active'));
  document.getElementById('objNoPrazoToggle').addEventListener('click', () => {
    const toggle = document.getElementById('objNoPrazoToggle');
    const input = document.getElementById('objPrazoInput');
    const nowActive = !toggle.classList.contains('active');
    toggle.classList.toggle('active', nowActive);
    input.disabled = nowActive;
    if(nowActive) input.value = '';
  });
  document.getElementById('objOkBtn').addEventListener('click', async () => {
    const nome = document.getElementById('objNomeInput').value.trim();
    if(!nome){ showAppMessage('Digite o nome do objetivo.', 'error'); return; }
    const descricao = document.getElementById('objDescricaoInput').value.trim();
    const categoria = document.getElementById('objCategoriaInput').value;
    const prioridade = document.getElementById('objPrioridadeInput').value;
    const semPrazo = document.getElementById('objNoPrazoToggle').classList.contains('active');
    const prazo = semPrazo ? '' : document.getElementById('objPrazoInput').value;
    if(objEditingId){
      await dbPatch(userPath('/objetivos/' + objEditingId), { nome, descricao, categoria, prioridade, prazo });
    } else {
      await dbPut(userPath('/objetivos/' + newId()), { nome, descricao, categoria, prioridade, prazo, criadoEm: new Date().toISOString() });
    }
    document.getElementById('objModal').classList.remove('active');
    await renderObjetivos();
  });

  // Modal de ponto (sub-objetivo): criar/editar nome, descrição, prazo, progresso e dependência
  let pontoEditingObjId = null;
  let pontoEditingId = null; // null = criando um novo ponto

  function openPontoModal(objId, pontoId){
    pontoEditingObjId = objId;
    pontoEditingId = pontoId || null;
    document.getElementById('pontoModalTitle').textContent = pontoId ? 'Editar ponto' : 'Novo ponto';
    document.getElementById('pontoNomeInput').value = '';
    document.getElementById('pontoDescricaoInput').value = '';
    document.getElementById('pontoPrazoInput').value = '';
    document.getElementById('pontoNoPrazoToggle').classList.remove('active');
    document.getElementById('pontoPrazoInput').disabled = false;
    document.getElementById('pontoProgressoInput').value = 0;
    document.getElementById('pontoProgressoValue').textContent = '0%';
    document.getElementById('pontoAutoTipoInput').value = '';
    document.getElementById('pontoAutoMetaInput').value = '';
    document.getElementById('pontoAutoObjIdInput').value = '';
    pontoAtualizarVisibilidadeAuto();
    dbGet(userPath('/objetivos/' + objId + '/pontos')).then(pontosMap => {
      pontosMap = pontosMap || {};
      const depSelect = document.getElementById('pontoDependeDeInput');
      const outros = Object.entries(pontosMap).filter(([pid]) => pid !== pontoId);
      depSelect.innerHTML = '<option value="">Nenhum</option>' + outros.map(([pid, p]) => `<option value="${pid}">${escapeHtml(p.nome)}</option>`).join('');
      if(pontoId && pontosMap[pontoId]){
        const p = pontosMap[pontoId];
        document.getElementById('pontoNomeInput').value = p.nome || '';
        document.getElementById('pontoDescricaoInput').value = p.descricao || '';
        const progresso = pontoProgresso(p);
        document.getElementById('pontoProgressoInput').value = progresso;
        document.getElementById('pontoProgressoValue').textContent = progresso + '%';
        depSelect.value = p.dependeDe || '';
        if(p.autoTipo){
          document.getElementById('pontoAutoTipoInput').value = p.autoTipo;
          document.getElementById('pontoAutoMetaInput').value = p.autoMeta || '';
          pontoAtualizarVisibilidadeAuto();
          if(p.autoTipo === 'objetivo'){
            populatePontoAutoObjSelect().then(() => {
              document.getElementById('pontoAutoObjIdInput').value = p.autoObjId || '';
            });
          }
        }
        if(p.prazo){
          document.getElementById('pontoPrazoInput').value = p.prazo;
        } else {
          document.getElementById('pontoNoPrazoToggle').classList.add('active');
          document.getElementById('pontoPrazoInput').disabled = true;
        }
      }
    });
    document.getElementById('pontoModal').classList.add('active');
  }
  async function populatePontoAutoObjSelect(){
    const sel = document.getElementById('pontoAutoObjIdInput');
    const current = sel.value;
    const data = await dbGet(userPath('/objetivos')) || {};
    const outros = Object.entries(data).filter(([oid]) => oid !== pontoEditingObjId);
    sel.innerHTML = '<option value="">Selecione...</option>' + outros.map(([oid, o]) => `<option value="${oid}">${escapeHtml(o.nome)}</option>`).join('');
    sel.value = current;
  }
  function pontoAtualizarVisibilidadeAuto(){
    const tipo = document.getElementById('pontoAutoTipoInput').value;
    const isObjetivo = tipo === 'objetivo';
    document.getElementById('pontoAutoMetaRow').style.display = (tipo && !isObjetivo) ? 'flex' : 'none';
    document.getElementById('pontoAutoObjRow').style.display = isObjetivo ? 'block' : 'none';
    if(isObjetivo) populatePontoAutoObjSelect();
    document.getElementById('pontoProgressoLabel').style.display = tipo ? 'none' : '';
    document.getElementById('pontoProgressoInput').style.display = tipo ? 'none' : '';
  }
  document.getElementById('pontoAutoTipoInput').addEventListener('change', pontoAtualizarVisibilidadeAuto);
  document.getElementById('pontoProgressoInput').addEventListener('input', (e) => {
    document.getElementById('pontoProgressoValue').textContent = e.target.value + '%';
  });
  document.getElementById('pontoNoPrazoToggle').addEventListener('click', () => {
    const toggle = document.getElementById('pontoNoPrazoToggle');
    const input = document.getElementById('pontoPrazoInput');
    const nowActive = !toggle.classList.contains('active');
    toggle.classList.toggle('active', nowActive);
    input.disabled = nowActive;
    if(nowActive) input.value = '';
  });
  document.getElementById('pontoCancelBtn').addEventListener('click', () => document.getElementById('pontoModal').classList.remove('active'));
  document.getElementById('pontoOkBtn').addEventListener('click', async () => {
    const nome = document.getElementById('pontoNomeInput').value.trim();
    if(!nome){ showAppMessage('Digite o nome do ponto.', 'error'); return; }
    const descricao = document.getElementById('pontoDescricaoInput').value.trim();
    const semPrazo = document.getElementById('pontoNoPrazoToggle').classList.contains('active');
    const prazo = semPrazo ? '' : document.getElementById('pontoPrazoInput').value;
    const progresso = Number(document.getElementById('pontoProgressoInput').value) || 0;
    const dependeDe = document.getElementById('pontoDependeDeInput').value;
    const autoTipo = document.getElementById('pontoAutoTipoInput').value;
    let extra = { nome, descricao, prazo, dependeDe };
    if(autoTipo === 'objetivo'){
      const autoObjId = document.getElementById('pontoAutoObjIdInput').value;
      if(!autoObjId){ showAppMessage('Selecione o objetivo de referência.', 'error'); return; }
      extra = { ...extra, autoTipo, autoObjId, autoMeta: null, autoBase: null, progresso: 0 };
    } else if(autoTipo){
      const autoMeta = Math.max(1, Number(document.getElementById('pontoAutoMetaInput').value) || 1);
      let autoBase = null;
      if(pontoEditingId){
        const existente = await dbGet(userPath('/objetivos/' + pontoEditingObjId + '/pontos/' + pontoEditingId));
        if(existente && existente.autoTipo === autoTipo) autoBase = existente.autoBase;
      }
      if(autoBase === null){
        const counts = await fetchAutoActionCounts();
        autoBase = counts[autoTipo] || 0;
      }
      extra = { ...extra, autoTipo, autoMeta, autoBase, autoObjId: null, progresso: 0 };
    } else {
      extra = { ...extra, autoTipo: null, autoMeta: null, autoBase: null, autoObjId: null, progresso };
    }
    if(pontoEditingId){
      await dbPatch(userPath('/objetivos/' + pontoEditingObjId + '/pontos/' + pontoEditingId), extra);
    } else {
      await dbPut(userPath('/objetivos/' + pontoEditingObjId + '/pontos/' + newId()), { ...extra, criadoEm: new Date().toISOString() });
    }
    document.getElementById('pontoModal').classList.remove('active');
    await renderObjetivos();
  });

  /* ---------- VISION BOARD (colagem automática, com imagens por URL ou upload) ---------- */
  function resizeImageDataUrl(file, maxDim){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Arquivo inválido'));
        img.onload = () => {
          let { width, height } = img;
          if(width > maxDim || height > maxDim){
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function loadImageAspect(src){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve((img.naturalHeight / img.naturalWidth) || 1.2);
      img.onerror = () => resolve(1.2);
      img.src = src;
    });
  }
  async function visionBoardAutoLayout(srcs){
    const count = srcs.length;
    if(count <= 0) return [];
    // Usa a proporção real de cada imagem (em vez de estimar) pra empacotar em
    // colunas (masonry) sem sobrar vão nem uma foto cobrir a outra por engano.
    const aspects = await Promise.all(srcs.map(loadImageAspect));
    const cols = Math.max(2, Math.min(5, Math.round(Math.sqrt(count * 1.05))));
    const cellW = 100 / cols;
    const widthPct = Math.min(40, cellW * 0.94);
    const colHeights = new Array(cols).fill(0);
    const order = [...Array(count).keys()];
    for(let i = order.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const positions = new Array(count);
    order.forEach((i) => {
      // sempre entra na coluna mais curta no momento — mantém o preenchimento parelho,
      // sem vãos grandes nem uma foto avançando sobre a coluna vizinha.
      const col = colHeights.indexOf(Math.min(...colHeights));
      const w = widthPct * (0.9 + Math.random() * 0.2);
      const heightEst = w * Math.min(1.6, Math.max(0.55, aspects[i]));
      const jitterX = (Math.random() - 0.5) * cellW * 0.08;
      const left = col * cellW + cellW / 2 + jitterX;
      const top = colHeights[col] + heightEst / 2;
      colHeights[col] += heightEst + 3;
      const rotate = Math.round((Math.random() - 0.5) * 8);
      positions[i] = { left: Math.min(98, Math.max(2, left)), top, widthPct: w, rotate };
    });
    const maxHeight = Math.max(...colHeights, 1);
    positions.forEach((p, i) => {
      p.top = Math.min(97, Math.max(3, (p.top / maxHeight) * 94 + 3));
      p.z = i + 1;
    });
    return positions;
  }
  // dados do board em cache local + camadas pendentes de um "Embaralhar" ainda não salvo
  const VISION_DEFAULT_WIDTH = 24;
  const VISION_MIN_WIDTH = 10;
  const VISION_MAX_WIDTH = 45;
  let visionData = {};
  let visionPendingShuffle = null; // { id: {left,top,widthPct,rotate,z} } — só em memória até salvar

  function visionSortedEntries(data){
    return Object.entries(data).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  }
  function visionShowShuffleBar(show){
    document.getElementById('visionShuffleBar').classList.toggle('active', show);
    document.getElementById('visionLayersBtn').disabled = show;
    document.getElementById('visionAddOpenBtn').disabled = show;
  }
  async function shuffleVisionBoard(){
    visionData = await dbGet(userPath('/VisionBoard')) || {};
    const entries = visionSortedEntries(visionData);
    if(!entries.length) return;
    const layout = await visionBoardAutoLayout(entries.map(([, v]) => v.src));
    visionPendingShuffle = {};
    entries.forEach(([id], i) => { visionPendingShuffle[id] = layout[i]; });
    paintVisionBoard();
    visionShowShuffleBar(true);
  }
  async function saveVisionShuffle(){
    if(!visionPendingShuffle) return;
    const updates = {};
    Object.entries(visionData).forEach(([id, v]) => {
      updates[id] = { ...v, ...(visionPendingShuffle[id] || {}) };
    });
    await dbPutSilent(userPath('/VisionBoard'), updates);
    visionData = updates;
    visionPendingShuffle = null;
    visionShowShuffleBar(false);
    paintVisionBoard();
  }
  function cancelVisionShuffle(){
    visionPendingShuffle = null;
    visionShowShuffleBar(false);
    paintVisionBoard();
  }
  // Arraste manual: só ativo com o painel de Camadas aberto. Clique numa foto pra
  // selecionar (contorno destacado), clique de novo + arraste pra reposicionar.
  let visionManualSelectedId = null;
  function visionLayersOpen(){
    const panel = document.getElementById('visionLayersPanel');
    return !!(panel && panel.classList.contains('open')) && !visionPendingShuffle;
  }
  function paintVisionBoard(){
    const el = document.getElementById('visionBoard');
    if(!el) return;
    const entries = visionSortedEntries(visionData).map(([id, v]) => {
      const override = visionPendingShuffle && visionPendingShuffle[id];
      return [id, override ? { ...v, ...override } : v];
    });
    if(!entries.length){
      el.style.minHeight = '260px';
      el.innerHTML = '<p class="empty-state" style="padding:40px;">Seu Vision Board está vazio. Clique em "Gerenciar imagens" pra começar a montar.</p>';
      return;
    }
    // o board cresce conforme a quantidade de fotos, em vez de um tamanho fixo
    // grande demais que deixa vão sobrando quando tem poucas imagens.
    el.style.minHeight = Math.min(920, Math.max(320, 110 + entries.length * 95)) + 'px';
    el.classList.toggle('layers-mode', visionLayersOpen());
    const visibleEntries = entries.filter(([, v]) => !v.hidden);
    const handlesHtml = visionLayersOpen() ? `
        <span class="vision-handle vision-handle-rotate" data-vision-handle="rotate"></span>
        <span class="vision-handle vision-handle-corner vision-handle-nw" data-vision-handle="corner"></span>
        <span class="vision-handle vision-handle-corner vision-handle-ne" data-vision-handle="corner"></span>
        <span class="vision-handle vision-handle-corner vision-handle-sw" data-vision-handle="corner"></span>
        <span class="vision-handle vision-handle-corner vision-handle-se" data-vision-handle="corner"></span>` : '';
    el.innerHTML = visibleEntries.map(([id, v]) => `
      <div class="vision-item${id === visionManualSelectedId ? ' selected' : ''}" data-vision-id="${id}" style="left:${v.left}%; top:${v.top}%; width:${v.widthPct}%; --v-rot:${v.rotate}deg; z-index:${v.z || 1};">
        <img src="${escapeHtml(v.src)}" alt="" loading="lazy" draggable="false">
        ${id === visionManualSelectedId ? handlesHtml : ''}
      </div>`).join('');
    // Alças de escalar (cantos) e girar (topo), no estilo Canva — só aparecem na foto selecionada.
    el.querySelectorAll('.vision-item.selected .vision-handle').forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const itemEl = handle.closest('.vision-item');
        const id = itemEl.getAttribute('data-vision-id');
        const boardRect = el.getBoundingClientRect();
        const centerX = boardRect.left + (visionData[id].left / 100) * boardRect.width;
        const centerY = boardRect.top + (visionData[id].top / 100) * boardRect.height;
        handle.setPointerCapture(e.pointerId);
        itemEl.classList.add('vision-dragging');
        const kind = handle.getAttribute('data-vision-handle');
        let onMove;
        if(kind === 'rotate'){
          const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
          const startRotate = visionData[id].rotate || 0;
          onMove = (ev) => {
            const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180 / Math.PI;
            const rotate = Math.max(VISION_ROTATE_MIN, Math.min(VISION_ROTATE_MAX, startRotate + (angle - startAngle)));
            itemEl.style.setProperty('--v-rot', rotate + 'deg');
            visionData[id] = { ...visionData[id], rotate };
            renderVisionSelectedControls();
          };
        } else {
          const startDist = Math.max(1, Math.hypot(e.clientX - centerX, e.clientY - centerY));
          const startWidthPct = visionData[id].widthPct || VISION_DEFAULT_WIDTH;
          onMove = (ev) => {
            const dist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
            const widthPct = Math.max(VISION_MIN_WIDTH, Math.min(VISION_MAX_WIDTH, startWidthPct * (dist / startDist)));
            itemEl.style.width = widthPct + '%';
            visionData[id] = { ...visionData[id], widthPct };
            renderVisionSelectedControls();
          };
        }
        const onUp = () => {
          itemEl.classList.remove('vision-dragging');
          handle.removeEventListener('pointermove', onMove);
          handle.removeEventListener('pointerup', onUp);
          const { widthPct, rotate } = visionData[id];
          dbPatchSilent(userPath('/VisionBoard/' + id), { widthPct, rotate }).catch(err => console.error('Erro ao salvar ajuste da imagem', err));
        };
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
      });
    });
    el.querySelectorAll('.vision-item').forEach(itemEl => {
      itemEl.addEventListener('pointerdown', (e) => {
        if(!visionLayersOpen()) return;
        const id = itemEl.getAttribute('data-vision-id');
        if(id !== visionManualSelectedId){
          e.preventDefault();
          visionManualSelectedId = id;
          paintVisionBoard();
          renderVisionSelectedControls();
          return;
        }
        e.preventDefault();
        const boardRect = el.getBoundingClientRect();
        itemEl.classList.add('vision-dragging');
        itemEl.setPointerCapture(e.pointerId);
        // mantém o deslocamento entre onde o cursor pegou a foto e a posição dela,
        // em vez de recentralizar a foto embaixo do cursor de repente.
        const startCursorLeftPct = ((e.clientX - boardRect.left) / boardRect.width) * 100;
        const startCursorTopPct = ((e.clientY - boardRect.top) / boardRect.height) * 100;
        const offsetLeft = startCursorLeftPct - (visionData[id].left || 0);
        const offsetTop = startCursorTopPct - (visionData[id].top || 0);
        const onMove = (ev) => {
          const cursorLeftPct = ((ev.clientX - boardRect.left) / boardRect.width) * 100;
          const cursorTopPct = ((ev.clientY - boardRect.top) / boardRect.height) * 100;
          const left = Math.min(98, Math.max(2, cursorLeftPct - offsetLeft));
          const top = Math.min(97, Math.max(3, cursorTopPct - offsetTop));
          itemEl.style.left = left + '%';
          itemEl.style.top = top + '%';
          visionData[id] = { ...visionData[id], left, top };
        };
        const onUp = () => {
          itemEl.classList.remove('vision-dragging');
          itemEl.removeEventListener('pointermove', onMove);
          itemEl.removeEventListener('pointerup', onUp);
          const { left, top } = visionData[id];
          dbPatchSilent(userPath('/VisionBoard/' + id), { left, top }).catch(err => console.error('Erro ao salvar posição da imagem', err));
        };
        itemEl.addEventListener('pointermove', onMove);
        itemEl.addEventListener('pointerup', onUp);
      });
    });
  }
  async function renderVisionBoard(){
    if(!document.getElementById('visionBoard')) return;
    visionData = await dbGet(userPath('/VisionBoard')) || {};
    visionPendingShuffle = null;
    visionManualSelectedId = null;
    visionShowShuffleBar(false);
    paintVisionBoard();
    renderVisionSelectedControls();
    if(document.getElementById('visionLayersPanel').classList.contains('open')) renderVisionLayers();
  }

  /* Painel "Camadas" — lista as imagens do topo (frente) pro fundo, permite arrastar
     pra reordenar (define o z-index) e ajustar o tamanho individual de cada uma. */
  let visionLayerDragId = null;
  function visionLayersGetAfterElement(container, y){
    const rows = [...container.querySelectorAll('.vision-layer-row:not(.dragging)')];
    return rows.reduce((closest, row) => {
      const box = row.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if(offset < 0 && offset > closest.offset) return { offset, element: row };
      return closest;
    }, { offset: -Infinity, element: null }).element;
  }
  function renderVisionLayers(){
    const list = document.getElementById('visionLayersList');
    const entries = visionSortedEntries(visionData);
    if(!entries.length){
      list.innerHTML = '<p class="empty-state" style="margin:0;">Nenhuma imagem ainda.</p>';
      return;
    }
    // topo da lista = maior z-index (mais na frente), como nas Camadas do Canva
    const byZDesc = [...entries].sort((a, b) => (b[1].z || 0) - (a[1].z || 0));
    list.innerHTML = byZDesc.map(([id, v]) => `
      <li class="vision-layer-row${id === visionManualSelectedId ? ' selected' : ''}${v.hidden ? ' vision-layer-hidden' : ''}" data-vision-id="${id}">
        <span class="vision-layer-drag" draggable="true">⠿</span>
        <img class="vision-layer-thumb" src="${escapeHtml(v.src)}" alt="" draggable="false">
        <button type="button" class="vision-layer-eye" data-vision-eye="${id}" title="${v.hidden ? 'Mostrar foto' : 'Esconder foto'}">${v.hidden ? '🚫' : '👁'}</button>
      </li>`).join('');
    // Clicar em qualquer parte da linha (menos a alça de arrastar e o olho) seleciona a foto
    list.querySelectorAll('.vision-layer-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if(e.target.closest('.vision-layer-drag') || e.target.closest('.vision-layer-eye')) return;
        const id = row.getAttribute('data-vision-id');
        visionManualSelectedId = visionManualSelectedId === id ? null : id;
        paintVisionBoard();
        renderVisionLayers();
      });
    });
    list.querySelectorAll('[data-vision-eye]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-vision-eye');
      const hidden = !visionData[id].hidden;
      visionData[id] = { ...visionData[id], hidden };
      paintVisionBoard();
      renderVisionLayers();
      dbPatchSilent(userPath('/VisionBoard/' + id), { hidden }).catch(err => console.error('Erro ao salvar visibilidade da imagem', err));
    }));

    // Só a "alça" (⠿) é arrastável — assim a régua de tamanho e a miniatura
    // respondem ao próprio clique/arraste delas, sem disparar reordenar a linha.
    list.querySelectorAll('.vision-layer-drag').forEach(handle => {
      handle.addEventListener('dragstart', (e) => {
        const row = handle.closest('.vision-layer-row');
        visionLayerDragId = row.getAttribute('data-vision-id');
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try{ e.dataTransfer.setDragImage(row, 20, 20); }catch(err){ /* ignora navegadores sem suporte */ }
      });
      handle.addEventListener('dragend', async () => {
        const row = handle.closest('.vision-layer-row');
        row.classList.remove('dragging');
        visionLayerDragId = null;
        // topo da lista = maior z; reatribui z sequencial na nova ordem e salva
        const rows = [...list.querySelectorAll('.vision-layer-row')];
        const total = rows.length;
        const updates = {};
        rows.forEach((r, i) => {
          const id = r.getAttribute('data-vision-id');
          const z = total - i;
          visionData[id] = { ...visionData[id], z };
          updates[id] = z;
        });
        paintVisionBoard();
        await Promise.all(Object.entries(updates).map(([id, z]) => dbPatchSilent(userPath('/VisionBoard/' + id), { z })));
      });
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      if(!visionLayerDragId) return;
      const dragEl = list.querySelector('.vision-layer-row.dragging');
      if(!dragEl) return;
      const afterEl = visionLayersGetAfterElement(list, e.clientY);
      if(afterEl == null) list.appendChild(dragEl); else list.insertBefore(dragEl, afterEl);
    });

    renderVisionSelectedControls();
  }

  /* Botão "Restaurar esta foto" — aparece no painel de Camadas assim que uma foto
     é selecionada (clicando nela no board ou na lista). Escala e rotação em si
     são ajustadas pelas alças diretamente na foto selecionada no board. */
  const VISION_ROTATE_MIN = -180;
  const VISION_ROTATE_MAX = 180;
  let visionSelectedSaveTimer = null;
  function renderVisionSelectedControls(){
    const panel = document.getElementById('visionSelectedControls');
    if(!panel) return;
    const id = visionManualSelectedId;
    panel.classList.toggle('active', !!(id && visionData[id]));
  }
  function applyVisionSelectedChange(patch){
    const id = visionManualSelectedId;
    if(!id || !visionData[id]) return;
    visionData[id] = { ...visionData[id], ...patch };
    paintVisionBoard();
    renderVisionSelectedControls();
    clearTimeout(visionSelectedSaveTimer);
    visionSelectedSaveTimer = setTimeout(() => {
      dbPatchSilent(userPath('/VisionBoard/' + id), patch).catch(err => console.error('Erro ao salvar ajuste da imagem', err));
    }, 400);
  }
  document.getElementById('visionSelectedResetBtn').addEventListener('click', () => {
    applyVisionSelectedChange({ widthPct: VISION_DEFAULT_WIDTH, rotate: 0 });
  });
  document.getElementById('visionLayersBtn').addEventListener('click', async () => {
    const panel = document.getElementById('visionLayersPanel');
    const opening = !panel.classList.contains('open');
    panel.classList.toggle('open', opening);
    if(opening) renderVisionLayers();
    else visionManualSelectedId = null;
    paintVisionBoard();
  });
  document.getElementById('visionLayersCloseBtn').addEventListener('click', () => {
    document.getElementById('visionLayersPanel').classList.remove('open');
    visionManualSelectedId = null;
    paintVisionBoard();
  });
  document.getElementById('visionShuffleSaveBtn').addEventListener('click', saveVisionShuffle);
  document.getElementById('visionShuffleCancelBtn').addEventListener('click', cancelVisionShuffle);
  document.getElementById('visionRestoreAllBtn').addEventListener('click', async () => {
    visionData = await dbGet(userPath('/VisionBoard')) || {};
    const entries = visionSortedEntries(visionData);
    if(!entries.length) return;
    if(!await showConfirm('Isso restaura o tamanho e a posição de TODAS as fotos pro arranjo automático, desfazendo ajustes manuais. Continuar?')) return;
    const layout = await visionBoardAutoLayout(entries.map(([, v]) => v.src));
    const updates = {};
    entries.forEach(([id], i) => { updates[id] = { ...visionData[id], ...layout[i] }; });
    await dbPutSilent(userPath('/VisionBoard'), updates);
    visionData = updates;
    visionPendingShuffle = null;
    visionManualSelectedId = null;
    visionShowShuffleBar(false);
    paintVisionBoard();
    renderVisionSelectedControls();
    if(document.getElementById('visionLayersPanel').classList.contains('open')) renderVisionLayers();
  });

  /* Modal "Gerenciar imagens": lista tudo que já está no board (com opção de excluir) e permite
     adicionar várias imagens de uma vez, tanto por link quanto por upload. */
  async function renderVisionManageList(){
    const wrap = document.getElementById('visionManageList');
    const data = await dbGet(userPath('/VisionBoard')) || {};
    const entries = Object.entries(data).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    if(!entries.length){
      wrap.innerHTML = '<p class="empty-state" style="margin:0 0 8px;">Nenhuma imagem ainda.</p>';
      return;
    }
    wrap.innerHTML = entries.map(([id, v]) => `
      <div class="vision-manage-item" data-manage-id="${id}">
        <img src="${escapeHtml(v.src)}" alt="" loading="lazy">
        <button type="button" data-del-vision="${id}" title="Remover">×</button>
      </div>`).join('');
    wrap.querySelectorAll('[data-del-vision]').forEach(btn => btn.addEventListener('click', async () => {
      await dbDeleteSilent(userPath('/VisionBoard/' + btn.getAttribute('data-del-vision')));
      await renderVisionManageList();
      await renderVisionBoard();
    }));
  }
  document.getElementById('visionShuffleBtn').addEventListener('click', shuffleVisionBoard);
  document.getElementById('visionAddOpenBtn').addEventListener('click', async () => {
    document.getElementById('visionUrlInput').value = '';
    document.getElementById('visionUploadInput').value = '';
    document.getElementById('visionAddError').style.display = 'none';
    await renderVisionManageList();
    document.getElementById('visionAddModal').classList.add('active');
  });
  document.getElementById('visionAddCancelBtn').addEventListener('click', () => {
    document.getElementById('visionAddModal').classList.remove('active');
  });
  document.getElementById('visionAddOkBtn').addEventListener('click', async () => {
    const errorEl = document.getElementById('visionAddError');
    errorEl.style.display = 'none';
    const urls = document.getElementById('visionUrlInput').value.split('\n').map(s => s.trim()).filter(Boolean);
    const files = Array.from(document.getElementById('visionUploadInput').files || []);
    if(!urls.length && !files.length){
      errorEl.textContent = 'Cole ao menos um link ou escolha ao menos um arquivo de imagem.';
      errorEl.style.display = 'block';
      return;
    }
    const novasSrcs = [...urls];
    for(const file of files){
      try{
        novasSrcs.push(await resizeImageDataUrl(file, 900));
      } catch(err){
        errorEl.textContent = 'Não consegui ler uma das imagens enviadas. As demais foram adicionadas.';
        errorEl.style.display = 'block';
      }
    }
    const data = await dbGet(userPath('/VisionBoard')) || {};
    const existingEntries = Object.entries(data).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const allSrcs = existingEntries.map(([, v]) => v.src).concat(novasSrcs);
    const layout = await visionBoardAutoLayout(allSrcs);
    const updates = {};
    existingEntries.forEach(([id], i) => { updates[id] = { ...data[id], ...layout[i] }; });
    const novasEntries = novasSrcs.map((src, i) => {
      const pos = layout[existingEntries.length + i];
      return [newId(), { src, order: existingEntries.length + i, criadoEm: new Date().toISOString(), ...pos }];
    });
    novasEntries.forEach(([id, v]) => { updates[id] = v; });
    await Promise.all(Object.entries(updates).map(([id, v]) => dbPutSilent(userPath('/VisionBoard/' + id), v)));
    document.getElementById('visionUrlInput').value = '';
    document.getElementById('visionUploadInput').value = '';
    await renderVisionManageList();
    await renderVisionBoard();
  });

  /* ---------- Autenticação (Identity Toolkit REST) ---------- */
  async function identityRequest(kind, email, password){
    showLoading('Entrando...');
    try{
      const url = 'https://identitytoolkit.googleapis.com/v1/accounts:' + kind + '?key=' + FIREBASE_API_KEY;
      const res = await fetchWithTimeout(url, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email, password, returnSecureToken:true })
      });
      const data = await res.json();
      if(!res.ok){
        const msg = (data.error && data.error.message) || 'Erro desconhecido';
        throw new Error(msg);
      }
      return data;
    } finally { hideLoading(); }
  }
  function friendlyAuthError(msg){
    const map = {
      'EMAIL_NOT_FOUND':'E-mail não encontrado.',
      'INVALID_PASSWORD':'Senha incorreta.',
      'INVALID_LOGIN_CREDENTIALS':'E-mail ou senha incorretos.',
      'EMAIL_EXISTS':'Já existe uma conta com esse e-mail.',
      'WEAK_PASSWORD : Password should be at least 6 characters':'A senha deve ter ao menos 6 caracteres.',
      'MISSING_PASSWORD':'Digite uma senha.',
      'INVALID_EMAIL':'E-mail inválido.',
    };
    for(const k in map){ if(msg && msg.indexOf(k) !== -1) return map[k]; }
    return msg || 'Não foi possível concluir. Tente novamente.';
  }

  async function afterLoginSuccess(data){
    saveSession({
      idToken: data.idToken,
      uid: data.localId,
      email: data.email,
      expiresAt: Date.now() + (parseInt(data.expiresIn || '3600', 10) * 1000) - 30000
    });
    activeDataUid = session.uid;
    currentBoardId = session.uid;
    await dbPatch('/users/' + session.uid + '/Profile', { Email: data.email, LastLogin: new Date().toISOString() });
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = '';
    await loadOpenAiKey();
    await initBoards();
    await bootApp();
    checkPendingInvites();
  }

  /* ---------- Formulário de login/cadastro ---------- */
  let authMode = 'login'; // 'login' | 'signup' | 'reset'
  const authTitle = document.getElementById('authTitle');
  const authSub = document.getElementById('authSub');
  const authError = document.getElementById('authError');
  const authNote = document.getElementById('authNote');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authPasswordField = document.getElementById('authPasswordField');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authForgotBtn = document.getElementById('authForgotBtn');
  const authSwitchLine = document.getElementById('authSwitchLine');

  function setAuthMode(mode){
    authMode = mode;
    authError.classList.remove('active'); authNote.classList.remove('active');
    if(mode === 'login'){
      authTitle.textContent = 'Entrar'; authSub.textContent = 'Acesse sua conta para continuar.';
      authPasswordField.style.display = ''; authSubmitBtn.textContent = 'Entrar'; authForgotBtn.style.display = '';
      authSwitchLine.innerHTML = 'Não tem conta? <a id="authSwitchToSignup">Criar conta</a>';
    } else if(mode === 'signup'){
      authTitle.textContent = 'Criar conta'; authSub.textContent = 'Leva menos de um minuto.';
      authPasswordField.style.display = ''; authSubmitBtn.textContent = 'Criar conta'; authForgotBtn.style.display = 'none';
      authSwitchLine.innerHTML = 'Já tem conta? <a id="authSwitchToSignup">Entrar</a>';
    } else if(mode === 'reset'){
      authTitle.textContent = 'Recuperar senha'; authSub.textContent = 'Enviaremos um link de redefinição para o seu e-mail.';
      authPasswordField.style.display = 'none'; authSubmitBtn.textContent = 'Enviar link'; authForgotBtn.style.display = 'none';
      authSwitchLine.innerHTML = 'Lembrou a senha? <a id="authSwitchToSignup">Entrar</a>';
    }
    document.getElementById('authSwitchToSignup').addEventListener('click', () => {
      setAuthMode(mode === 'login' ? 'signup' : 'login');
    });
  }
  setAuthMode('login');

  authForgotBtn.addEventListener('click', () => setAuthMode('reset'));

  // Enter no campo de senha já tenta logar. Enter no campo de e-mail: se a senha
  // já estiver visível e ainda vazia, foca o campo de senha em vez de tentar
  // enviar o formulário incompleto; caso contrário (senha já preenchida, ou
  // no modo "recuperar senha", onde não há campo de senha), envia normalmente.
  authPassword.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); authSubmitBtn.click(); }
  });
  authEmail.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      const passwordVisible = authPasswordField.style.display !== 'none';
      if(passwordVisible && !authPassword.value){
        authPassword.focus();
      } else {
        authSubmitBtn.click();
      }
    }
  });

  authSubmitBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authError.classList.remove('active'); authNote.classList.remove('active');
    if(!email){ authError.textContent = 'Digite seu e-mail.'; authError.classList.add('active'); return; }
    authSubmitBtn.disabled = true;
    try{
      if(authMode === 'login'){
        if(!password){ throw new Error('Digite sua senha.'); }
        const data = await identityRequest('signInWithPassword', email, password);
        await afterLoginSuccess(data);
      } else if(authMode === 'signup'){
        if(!password){ throw new Error('Crie uma senha.'); }
        const data = await identityRequest('signUp', email, password);
        // Define a sessão ANTES de gravar no Firebase — buildUrl() depende de
        // session.idToken para autenticar a escrita. Gravar antes fazia essa
        // primeira escrita ir sem token, sendo rejeitada por regras de segurança.
        session = { idToken: data.idToken, uid: data.localId, email, expiresAt: Date.now() + 3600000 };
        await dbPut(('/users/' + data.localId + '/Profile'), { Email: email, CreatedAt: new Date().toISOString(), LastLogin: new Date().toISOString() });
        await afterLoginSuccess(data);
      } else if(authMode === 'reset'){
        showLoading('Enviando...');
        try{
          const url = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FIREBASE_API_KEY;
          const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requestType:'PASSWORD_RESET', email }) });
          const data = await res.json();
          if(!res.ok) throw new Error((data.error && data.error.message) || 'Erro ao enviar e-mail.');
          authNote.textContent = 'Link enviado! Verifique seu e-mail.'; authNote.classList.add('active');
        } finally { hideLoading(); }
      }
    }catch(err){
      authError.textContent = friendlyAuthError(err.message);
      authError.classList.add('active');
    }finally{
      authSubmitBtn.disabled = false;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearSession();
    location.reload();
  });

  document.getElementById('configSaveNameBtn').addEventListener('click', async () => {
    const input = document.getElementById('configDisplayNameInput');
    const name = input.value.trim();
    const btn = document.getElementById('configSaveNameBtn');
    const prevText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Salvando...';
    try{
      await dbPatch(userPath('/Profile'), { DisplayName: name });
      await renderHojeHeader();
      showAppMessage('Nome salvo.', 'success');
    }catch(err){
      showAppMessage('Erro ao salvar nome: ' + err.message, 'error');
    }finally{
      btn.disabled = false; btn.textContent = prevText;
    }
  });

  function escolherCorPrincipal(hex){
    applyCorPrincipal(hex);
    localStorage.setItem('corPrincipal', hex);
    dbPatchSilent(userPath('/Config'), { corPrincipal: hex }).catch(err => console.error('Erro ao salvar cor principal', err));
  }
  function renderCorPrincipalPopover(){
    const pop = document.getElementById('corPrincipalPopover');
    if(!pop || pop.children.length) return;
    pop.innerHTML = COR_PRINCIPAL_PRESETS.map(hex => `<button type="button" class="cor-swatch-option" data-cor="${hex}" style="background:${hex};" aria-label="${hex}"></button>`).join('');
    pop.querySelectorAll('.cor-swatch-option').forEach(btn => btn.addEventListener('click', () => {
      escolherCorPrincipal(btn.getAttribute('data-cor'));
      pop.classList.remove('active');
    }));
  }
  document.getElementById('corPrincipalSwatchBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    renderCorPrincipalPopover();
    document.getElementById('corPrincipalPopover').classList.toggle('active');
  });
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('corPrincipalPopover');
    if(pop && pop.classList.contains('active') && !pop.contains(e.target) && e.target.id !== 'corPrincipalSwatchBtn'){
      pop.classList.remove('active');
    }
  });
  document.getElementById('corPrincipalResetBtn').addEventListener('click', () => {
    escolherCorPrincipal(COR_PRINCIPAL_PADRAO);
  });
  async function loadCorPrincipal(){
    try{
      const config = await dbGet(userPath('/Config')) || {};
      if(config.corPrincipal){
        applyCorPrincipal(config.corPrincipal);
        localStorage.setItem('corPrincipal', config.corPrincipal);
      }
    } catch(e){ /* mantém a cor já aplicada a partir do localStorage */ }
  }

  /* ---------- INBOX ---------- */
  async function addInboxItem(text, source){
    const id = newId();
    await dbPut(userPath('/Inbox/' + id), { text, source: source || 'inbox', createdAt: new Date().toISOString(), status:'pending' });
    await renderInbox();
  }
  document.getElementById('newCaptureOpenBtn').addEventListener('click', () => {
    document.getElementById('newCaptureModal').classList.add('active');
    setTimeout(() => document.getElementById('newCaptureModalInput').focus(), 30);
  });
  function closeCaptureModal(){
    document.getElementById('newCaptureModal').classList.remove('active');
    document.getElementById('newCaptureModalInput').value = '';
  }
  document.getElementById('newCaptureModalCancelBtn').addEventListener('click', closeCaptureModal);
  document.getElementById('newCaptureModal').addEventListener('click', (e) => {
    if(e.target.id === 'newCaptureModal') closeCaptureModal();
  });
  // Palavras/expressões que costumam indicar um relato pessoal (diário) em vez de
  // uma nota de tarefa/ideia — heurística simples, sem IA, só pra sugerir o desvio.
  const DIARIO_CAPTURE_HINTS = [
    'hoje eu', 'hoje foi', 'hoje eh', 'meu dia', 'minha dia', 'me senti', 'estou me sentindo',
    'to me sentindo', 'estou feliz', 'estou triste', 'estou cansad', 'to feliz', 'to triste',
    'to cansad', 'sinto que', 'sinto-me', 'senti que', 'foi um dia', 'querido diário',
    'querido diario', 'diário hoje', 'diario hoje'
  ];
  function pareceEntradaDeDiario(text){
    const lower = text.toLowerCase();
    return DIARIO_CAPTURE_HINTS.some(h => lower.includes(h));
  }
  function enviarTextoParaDiario(text){
    goToView('diario');
    const textarea = document.getElementById('diarioTextInput');
    if(textarea){
      textarea.value = textarea.value ? (textarea.value + '\n' + text) : text;
      textarea.focus();
    }
  }
  document.getElementById('newCaptureModalOkBtn').addEventListener('click', async () => {
    const input = document.getElementById('newCaptureModalInput');
    const text = input.value.trim();
    if(!text) return;
    document.getElementById('newCaptureModal').classList.remove('active');
    input.value = '';
    if(pareceEntradaDeDiario(text)){
      const irParaDiario = await showConfirm('Isso parece um relato do seu dia — quer enviar direto pro Diário em vez do Arquivo?');
      if(irParaDiario){
        enviarTextoParaDiario(text);
        return;
      }
    }
    await addInboxItem(text, 'inbox');
  });
  document.getElementById('newCaptureModalInput').addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      document.getElementById('newCaptureModalOkBtn').click();
    }
    // Shift+Enter: comportamento padrão do textarea (quebra de linha)
  });

  async function renderInbox(){
    const el = document.getElementById('inboxList');
    const data = await dbGet(userPath('/Inbox')) || {};
    const items = Object.entries(data).filter(([id,it]) => it.status !== 'processed');
    document.getElementById('navInboxBadge').textContent = items.length;
    document.getElementById('inboxCountTab').textContent = items.length ? '(' + items.length + ')' : '';
    const aiOrganizeBtn = document.getElementById('runAiOrganizeBtn');
    // Só mostra o botão de organizar com IA se houver itens ainda não enviados para revisão
    const organizable = items.filter(([id,it]) => it.status !== 'awaiting_review');
    if(aiOrganizeBtn){ aiOrganizeBtn.style.display = organizable.length ? '' : 'none'; }
    if(!items.length){ el.innerHTML = '<p class="empty-state">Nenhuma captura ainda. Clique em "+ Nova captura" acima.</p>'; return; }
    el.innerHTML = items.sort((a,b) => (b[1].createdAt||'').localeCompare(a[1].createdAt||'')).map(([id, it]) => {
      const titulo = detectInboxTitle(it.text);
      return `
      <div class="inbox-item">
        <div class="inbox-icon">${it.text && it.text.startsWith('http') ? '🔗' : '📝'}</div>
        <div class="inbox-text">${escapeHtml(it.text)}</div>
        <div class="item-meta">${it.status === 'awaiting_review' ? '<span class="tag tag-gold">aguardando revisão</span> ' : ''}${titulo ? '<span class="tag tag-gold">gaveta: ' + escapeHtml(titulo) + '</span> ' : ''}${escapeHtml(it.source||'')}</div>
        <button class="btn btn-reject btn-sm" data-del-inbox="${id}">remover</button>
      </div>
    `;
    }).join('');
    el.querySelectorAll('[data-del-inbox]').forEach(btn => {
      btn.addEventListener('click', async () => { await dbDelete(userPath('/Inbox/' + btn.getAttribute('data-del-inbox'))); await renderInbox(); });
    });
  }

  /* ---------- REVISÃO IA (organização via OpenAI, modelo Pull Request) ---------- */
  function extractJson(text){
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  }

  // Detecta um "título" no início do texto capturado na Inbox, em formatos como
  // [Título], *Título* / **Título**, "Título:" ou TÍTULO EM CAIXA ALTA na primeira
  // linha. Esse título tende a indicar o nome da gaveta ideal para o item.
  function detectInboxTitle(text){
    if(!text) return null;
    const firstLine = String(text).split('\n')[0].trim();
    if(!firstLine) return null;
    let m = firstLine.match(/^\[(.+?)\]\s*$/);
    if(m) return m[1].trim();
    m = firstLine.match(/^\*{1,2}(.+?)\*{1,2}\s*$/);
    if(m) return m[1].trim();
    m = firstLine.match(/^([^\n:]{2,40}):\s*$/);
    if(m) return m[1].trim();
    if(firstLine.length >= 2 && firstLine.length <= 40 &&
       firstLine === firstLine.toUpperCase() && firstLine !== firstLine.toLowerCase() &&
       /[A-ZÀ-Ú]/.test(firstLine)){
      return firstLine.trim();
    }
    return null;
  }

  // Filosofia de organização (resumida do prompt do usuário): a estrutura nasce
  // dos dados (nunca um template fixo), poucas áreas bem organizadas, no máximo
  // ~3 níveis (Gaveta = área → item → detalhe dentro do texto do item), agrupar
  // por significado (não por palavra-chave), preservar contexto e links junto do
  // assunto, eliminar duplicação, e sempre otimizar pra "qual é a forma mais fácil
  // de encontrar isso daqui a 6 meses". Em vez de propor mudanças item a item, a
  // IA reescreve TUDO (Gavetas + Capturas novas) como um único documento, e a
  // pessoa compara lado a lado com a versão atual antes de aprovar.
  const ORGANIZER_SYSTEM_PROMPT = `Você é o organizador do Arquivo (Gavetas) de um sistema pessoal de produtividade chamado Life OS. Seu objetivo não é só arrumar texto — é reduzir a carga mental da pessoa, organizando pra que ela encontre qualquer informação no futuro sem precisar lembrar onde guardou. A pergunta que sempre guia a decisão: "qual é a forma mais simples e natural de encontrar essa informação daqui a seis meses?"

Princípios que você segue sempre:
1. A estrutura nasce dos dados: nunca use um template fixo de áreas. Olhe o conjunto inteiro (o que já existe + o que é novo) e descubra as áreas naturais daquele conteúdo. Só crie uma área nova quando isso realmente simplificar a busca futura; se uma área não faz mais sentido, reorganize-a.
2. Poucas áreas, bem organizadas: prefira poucas áreas grandes e coerentes a muitas pequenas. Nunca force uma informação numa área que não combina só pra evitar criar uma nova.
3. Pouca profundidade: no máximo 3 níveis — Área → item → detalhe dentro do próprio texto do item (ex: um item pode começar com "Projeto X:" pra dar contexto, mas isso não é um nível novo de hierarquia).
4. Organize pelo significado, não pela palavra: entenda o contexto antes de decidir a área. "Lucas comentou sobre abrir empresa" é sobre o Lucas E sobre a empresa — escolha o lugar que fará mais sentido dali a 6 meses.
5. Detecte padrões: se um assunto está crescendo, transforme-o numa área própria; se uma área ficou grande e heterogênea demais, separe-a.
6. Elimine duplicações: uma informação repetida ou uma nova captura que já existe em outro item deve virar uma coisa só — uma junto da outra, sem repetir. Nunca perca detalhes importantes ao unir.
7. Preserve contexto: nunca generalize um item a ponto de perder informação. Se o texto conecta duas ideias (ex: "estudar Firebase pro projeto Life OS"), mantenha essa relação — nunca invente relações que não estão explícitas.
8. Links ficam junto do assunto: nunca separe um link do contexto que o acompanha; se um link parecer incompleto, mantenha-o como está (não invente).
9. NUNCA descarte uma informação que já existia só porque não achou lugar óbvio pra ela — encontre a área mais adequada (ou crie uma) em vez de apagar. Preservar tudo que já existe é mais importante que deixar a estrutura "bonita".

Formato de saída — isto é OBRIGATÓRIO, porque o texto é interpretado por um programa:
- Cada área começa numa linha própria com "# " seguido do nome da área.
- Cada informação/item dentro da área começa numa linha própria com "• " (marcador bullet).
- Se um item precisar de mais de uma linha, as linhas seguintes de continuação NÃO começam com "#" nem "•".
- Deixe uma linha em branco entre uma área e outra.
- Responda APENAS com o documento nesse formato — sem markdown extra (sem \`\`\`), sem comentários, sem título, sem numerar as áreas, sem texto antes ou depois do documento.`;

  // Serializa o estado atual das Gavetas no mesmo formato de texto que a IA usa
  // (ex: "# Nome da área" seguido de linhas "• item"), pra comparar com a versão
  // que a IA devolver e pra dar contexto completo do que já existe.
  function serializeGavetasToDoc(gavetas){
    const entries = Object.entries(gavetas || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
    return entries.map(([, g]) => {
      const items = Object.entries(g.items || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
      const itemLines = items.map(([, it]) => {
        const lines = String(it.text || '').split('\n');
        return lines.map((l, idx) => idx === 0 ? '• ' + l.replace(/^[•\-\*]\s*/, '') : l).join('\n');
      }).join('\n');
      return `# ${g.name}` + (itemLines ? '\n' + itemLines : '');
    }).join('\n\n');
  }

  // Interpreta de volta um documento no formato "# área / • item" pra uma lista
  // de { name, items: [texto,...] }, na ordem em que aparecem no documento.
  function parseDocToGavetas(text){
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const gavetas = [];
    let current = null;
    let currentItemLines = null;
    function flushItem(){
      if(current && currentItemLines){
        const joined = currentItemLines.join('\n').trim();
        if(joined) current.items.push(joined);
      }
      currentItemLines = null;
    }
    lines.forEach(line => {
      const headingMatch = /^#\s*(.+?)\s*$/.exec(line);
      const itemMatch = /^[•\-\*]\s?(.*)$/.exec(line);
      if(headingMatch){
        flushItem();
        current = { name: headingMatch[1], items: [] };
        gavetas.push(current);
      } else if(itemMatch && current){
        flushItem();
        currentItemLines = [itemMatch[1]];
      } else if(current && currentItemLines && line.trim() !== ''){
        currentItemLines.push(line);
      } else if(currentItemLines && line.trim() === ''){
        flushItem();
      }
    });
    flushItem();
    return gavetas.filter(g => g.name);
  }

  // Diff simples por linha (LCS clássico) — devolve duas listas independentes
  // (uma pra cada lado) marcando cada linha como equal/removed (esquerda) ou
  // equal/added (direita), pra pintar a comparação lado a lado.
  function computeLineDiff(oldLines, newLines){
    const n = oldLines.length, m = newLines.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for(let i = n - 1; i >= 0; i--){
      for(let j = m - 1; j >= 0; j--){
        dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    const oldOut = [], newOut = [];
    let i = 0, j = 0;
    while(i < n && j < m){
      if(oldLines[i] === newLines[j]){
        oldOut.push({ type:'equal', text: oldLines[i] });
        newOut.push({ type:'equal', text: newLines[j] });
        i++; j++;
      } else if(dp[i+1][j] >= dp[i][j+1]){
        oldOut.push({ type:'removed', text: oldLines[i] });
        i++;
      } else {
        newOut.push({ type:'added', text: newLines[j] });
        j++;
      }
    }
    while(i < n){ oldOut.push({ type:'removed', text: oldLines[i] }); i++; }
    while(j < m){ newOut.push({ type:'added', text: newLines[j] }); j++; }
    return { oldOut, newOut };
  }

  document.getElementById('runAiOrganizeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('runAiOrganizeBtn');
    if(!openaiApiKey){ await loadOpenAiKey(); }
    if(!openaiApiKey){ alert('Não foi possível carregar a chave da OpenAI do Firebase.'); return; }
    btn.disabled = true; btn.textContent = '✦ Organizando...';
    showLoading('Organizando sua Inbox com IA...');
    try{
      const inbox = await dbGet(userPath('/Inbox')) || {};
      const pending = Object.entries(inbox).filter(([id,it]) => it.status === 'pending');
      if(!pending.length){ alert('Não há itens novos em Capturas para organizar.'); return; }
      const gavetas = await dbGet(userPath('/Gavetas')) || {};
      const oldDoc = serializeGavetasToDoc(gavetas);
      const capturasText = pending.map(([, it]) => '• ' + String(it.text || '').replace(/\n/g, ' ')).join('\n');

      const userPrompt = `Documento atual (todas as áreas e itens já existentes):
${oldDoc || '(nenhuma área criada ainda)'}

Novas capturas para incorporar e organizar dentro do documento (ainda soltas, sem organização):
${capturasText}

Gere o documento ATUALIZADO completo — todas as áreas existentes (reorganizadas se fizer sentido) mais as novas capturas já incorporadas nos lugares certos. Devolva o documento inteiro, não só as mudanças.`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + openaiApiKey },
        body: JSON.stringify({
          model:'gpt-4o-mini', temperature:0.4,
          messages:[{ role:'system', content: ORGANIZER_SYSTEM_PROMPT }, { role:'user', content: userPrompt }]
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error((data.error && data.error.message) || 'Erro na chamada à OpenAI');
      const newDoc = data.choices[0].message.content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();

      const inboxIds = pending.map(([id]) => id);
      await dbPut(userPath('/RevisaoDocumento'), { oldText: oldDoc, newText: newDoc, inboxIds, createdAt: new Date().toISOString() });
      await Promise.all(inboxIds.map(id => dbPatch(userPath('/Inbox/' + id), { status:'awaiting_review' })));

      await renderInbox();
      await renderRevisao();
      document.querySelector('.subtab[data-target="storage-revisao"]').click();
    }catch(err){
      alert('Erro ao organizar com IA: ' + err.message);
    }finally{
      hideLoading();
      btn.disabled = false; btn.textContent = '✦ Organizar Capturas com IA';
    }
  });


  function ensureBulletLine(line){
    if(line == null) return line;
    const trimmed = line.trim();
    if(!trimmed) return line;
    // já tem marcador de lista (•, -, *, ou numerado "1." / "1)") — não duplica
    if(/^(•|-|\*|\d+[.)])\s+/.test(trimmed)) return trimmed.replace(/^[\*\-]\s+/, '• ');
    return '• ' + trimmed;
  }
  function normalizeBullets(text){
    if(!text) return text;
    const lines = text.split('\n');
    // Só força bullet quando o texto tem mais de uma linha (é de fato uma lista).
    // Um texto de uma linha só (frase/parágrafo) fica como está.
    if(lines.length <= 1) return text.replace(/^\s*[\*\-]\s+/, '• ');
    return lines.map(l => (l.trim() ? ensureBulletLine(l) : l)).join('\n');
  }
  // Usado especificamente para conteúdo gerado pela IA no Storage: diferente de
  // normalizeBullets, força bullet point mesmo em textos de uma linha só,
  // já que todo item vindo da IA deve aparecer como bullet point.
  function forceBulletText(text){
    if(!text) return text;
    return text.split('\n').map(l => (l.trim() ? ensureBulletLine(l) : l)).join('\n');
  }
  function revisaoDiffLineHtml(d){
    const cls = d.type === 'removed' ? ' diff-line-removed' : d.type === 'added' ? ' diff-line-added' : '';
    return `<div class="diff-line${cls}">${escapeHtml(d.text)}</div>`;
  }
  async function renderRevisao(){
    const emptyEl = document.getElementById('revisaoEmptyState');
    const wrapEl = document.getElementById('revisaoDocWrap');
    const oldPane = document.getElementById('revisaoOldPane');
    const newPane = document.getElementById('revisaoNewPane');
    const doc = await dbGet(userPath('/RevisaoDocumento'));
    const countTab = document.getElementById('revisaoCountTab');
    if(countTab) countTab.textContent = doc ? '(1)' : '';
    if(!doc){
      if(emptyEl) emptyEl.style.display = '';
      if(wrapEl) wrapEl.style.display = 'none';
      return;
    }
    if(emptyEl) emptyEl.style.display = 'none';
    if(wrapEl) wrapEl.style.display = '';
    const oldLines = (doc.oldText || '').split('\n');
    const newLines = (doc.newText || '').split('\n');
    const { oldOut, newOut } = computeLineDiff(oldLines, newLines);
    oldPane.innerHTML = oldOut.map(revisaoDiffLineHtml).join('');
    newPane.innerHTML = newOut.map(revisaoDiffLineHtml).join('');
  }
  document.getElementById('approveRevisaoDocBtn').addEventListener('click', async () => {
    const doc = await dbGet(userPath('/RevisaoDocumento'));
    if(!doc) return;
    if(!await showConfirm('Aprovar a versão atualizada? Isso substitui as Gavetas atuais pelo conteúdo reorganizado.')) return;
    const newPane = document.getElementById('revisaoNewPane');
    const finalText = newPane.innerText;
    const parsedGavetas = parseDocToGavetas(finalText);
    const existing = await dbGet(userPath('/Gavetas')) || {};
    // Substitui as Gavetas atuais pelo que foi aprovado (a comparação lado a lado
    // já deixou claro o que estava mudando antes desse passo).
    await Promise.all(Object.keys(existing).map(gid => dbDelete(userPath('/Gavetas/' + gid))));
    for(let i = 0; i < parsedGavetas.length; i++){
      const g = parsedGavetas[i];
      const gid = newId();
      const items = {};
      g.items.forEach((text, idx) => {
        items[newId()] = { text: forceBulletText(text), order: idx, addedAt: new Date().toISOString() };
      });
      await dbPut(userPath('/Gavetas/' + gid), { name: g.name, order: i, collapsed:false, items });
    }
    const inboxIds = doc.inboxIds || [];
    await Promise.all(inboxIds.map(id => dbDelete(userPath('/Inbox/' + id))));
    await dbDelete(userPath('/RevisaoDocumento'));
    await renderInbox(); await renderRevisao(); await renderStorage();
  });
  document.getElementById('rejectRevisaoDocBtn').addEventListener('click', async () => {
    const doc = await dbGet(userPath('/RevisaoDocumento'));
    if(!doc) return;
    if(!await showConfirm('Rejeitar e manter tudo como está? As capturas voltam pra fila de Capturas.')) return;
    const inboxIds = doc.inboxIds || [];
    await Promise.all(inboxIds.map(id => dbPatch(userPath('/Inbox/' + id), { status:'pending' })));
    await dbDelete(userPath('/RevisaoDocumento'));
    await renderInbox(); await renderRevisao();
  });

  /* ---------- STORAGE (Gavetas) ---------- */
  document.getElementById('newGavetaOpenBtn').addEventListener('click', async () => {
    const name = await showPrompt('newGavetaModal', 'newGavetaModalInput', 'newGavetaModalOkBtn', 'newGavetaModalCancelBtn');
    if(!name) return;
    const existing = await dbGet(userPath('/Gavetas')) || {};
    const id = newId();
    await dbPut(userPath('/Gavetas/' + id), { name, order: Object.keys(existing).length, collapsed:false, items:{} });
    await renderStorage();
  });

  /* ---------- REORGANIZAÇÃO DE GAVETAS VIA IA (modelo Pull Request) ---------- */
  document.getElementById('runStorageAiOrganizeBtn').addEventListener('click', async () => {
    const btn = document.getElementById('runStorageAiOrganizeBtn');
    if(!openaiApiKey){ await loadOpenAiKey(); }
    if(!openaiApiKey){ showAppMessage('Não foi possível carregar a chave da OpenAI do Firebase.', 'error'); return; }
    btn.disabled = true; btn.textContent = '✦ Analisando...';
    showLoading('Analisando suas Gavetas com IA...');
    try{
      const gavetas = await dbGet(userPath('/Gavetas')) || {};
      if(!Object.keys(gavetas).length){ showAppMessage('Você ainda não tem gavetas para analisar.', 'info'); return; }
      const dump = Object.entries(gavetas).map(([gid,g]) => ({
        gavetaId: gid, nome: g.name,
        itens: Object.entries(g.items||{}).map(([iid,it]) => ({ itemId: iid, texto: it.text }))
      }));

      const systemPrompt = `Você é um assistente que organiza as "Gavetas" (agrupamentos de notas por assunto) de um sistema pessoal chamado Life OS.
Estrutura atual completa (JSON): ${JSON.stringify(dump)}

Seja CONSERVADOR: só proponha uma ação quando houver um problema real e evidente, como: item claramente na gaveta errada, gavetas duplicadas/redundantes tratando do mesmo assunto, itens duplicados ou obsoletos, gaveta vazia, nome de gaveta confuso/genérico demais, ou texto de item com erro claro (typo, corte, informação quebrada).
NÃO proponha uma ação só para "melhorar o estilo" ou reescrever um texto que já está compreensível — pequenas preferências de redação não justificam uma ação. Cada ação deve ter um motivo objetivo e específico.
Se, depois de analisar com calma, tudo já estiver bem organizado, retorne "acoes": [] (array vazio) e um resumo dizendo que está tudo organizado. Um array vazio é o resultado esperado na maioria das análises — não crie ações artificiais apenas para ter o que mostrar.
Responda APENAS com um objeto JSON, sem markdown, sem texto extra, no formato exato:
{
  "resumo": "breve resumo geral do que está sendo proposto e por quê",
  "acoes": [
    {"tipo":"mover_item", "itemId":"...", "gavetaOrigemId":"...", "gavetaDestinoId":"... ou null", "gavetaDestinoNome":"nome se for gaveta nova, senão omitir", "motivo":"..."},
    {"tipo":"mesclar_gavetas", "gavetaIds":["id1","id2"], "gavetaFinalId":"um dos ids acima, ou null para criar uma nova", "novoNome":"nome final da gaveta (obrigatório se gavetaFinalId for null)", "motivo":"..."},
    {"tipo":"excluir_item", "gavetaId":"...", "itemId":"...", "motivo":"..."},
    {"tipo":"excluir_gaveta", "gavetaId":"...", "motivo":"..."},
    {"tipo":"renomear_gaveta", "gavetaId":"...", "novoNome":"...", "motivo":"..."},
    {"tipo":"editar_item", "gavetaId":"...", "itemId":"...", "novoTexto":"...", "motivo":"..."}
  ]
}`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + openaiApiKey },
        body: JSON.stringify({ model:'gpt-4o-mini', temperature:0.3, messages:[{ role:'system', content: systemPrompt }] })
      });
      const data = await res.json();
      if(!res.ok) throw new Error((data.error && data.error.message) || 'Erro na chamada à OpenAI');
      const proposal = extractJson(data.choices[0].message.content);
      const acoes = Array.isArray(proposal.acoes) ? proposal.acoes : [];
      if(!acoes.length){ showAppMessage('A IA não encontrou mudanças relevantes a propor — sua organização já está boa.', 'success'); return; }

      const revId = newId();
      await dbPut(userPath('/StorageRevisao/' + revId), {
        resumo: proposal.resumo || 'Reorganização proposta pela IA.',
        acoes, status:'pending', createdAt: new Date().toISOString()
      });
      await renderStorageRevisao();
    }catch(err){
      showAppMessage('Erro ao analisar organização com IA: ' + err.message, 'error');
    }finally{
      hideLoading();
      btn.disabled = false; btn.textContent = '✦ Analisar Gavetas com IA';
    }
  });

  function describeStorageAcao(a, gavetasById){
    const gNome = (gid) => escapeHtml((gavetasById[gid] && gavetasById[gid].name) || '(gaveta removida)');
    const iTexto = (gid, iid) => escapeHtml((gavetasById[gid] && gavetasById[gid].items && gavetasById[gid].items[iid] && gavetasById[gid].items[iid].text) || '(item removido)');
    switch(a.tipo){
      case 'mover_item':
        return `Mover "${iTexto(a.gavetaOrigemId, a.itemId)}" de <strong>${gNome(a.gavetaOrigemId)}</strong> para <strong>${a.gavetaDestinoId ? gNome(a.gavetaDestinoId) : escapeHtml(a.gavetaDestinoNome || 'nova gaveta')}</strong>`;
      case 'mesclar_gavetas':
        return `Mesclar <strong>${a.gavetaIds.map(gNome).join(', ')}</strong> em <strong>${a.gavetaFinalId ? gNome(a.gavetaFinalId) : escapeHtml(a.novoNome || 'nova gaveta')}</strong>`;
      case 'excluir_item':
        return `Excluir item duplicado/obsoleto: "${iTexto(a.gavetaId, a.itemId)}" (em ${gNome(a.gavetaId)})`;
      case 'excluir_gaveta':
        return `Excluir gaveta <strong>${gNome(a.gavetaId)}</strong>`;
      case 'renomear_gaveta':
        return `Renomear <strong>${gNome(a.gavetaId)}</strong> para <strong>${escapeHtml(a.novoNome)}</strong>`;
      case 'editar_item':
        return `Reescrever item em <strong>${gNome(a.gavetaId)}</strong>: "${iTexto(a.gavetaId, a.itemId)}" → "${escapeHtml(a.novoTexto)}"`;
      default:
        return 'Ação desconhecida';
    }
  }

  async function renderStorageRevisao(){
    const el = document.getElementById('storageRevisaoList');
    const data = await dbGet(userPath('/StorageRevisao')) || {};
    const gavetasById = await dbGet(userPath('/Gavetas')) || {};
    const entries = Object.entries(data).filter(([id,r]) => r.status === 'pending');
    if(!entries.length){ el.innerHTML = ''; return; }
    el.innerHTML = entries.sort((a,b) => (b[1].createdAt||'').localeCompare(a[1].createdAt||'')).map(([id, r]) => `
      <div class="pr-card" style="margin-bottom:16px;">
        <div class="pr-head">
          <div class="pr-head-top">
            <p class="pr-raw">${escapeHtml(r.resumo)}</p>
            <span class="tag tag-gold">${r.acoes.length} ${r.acoes.length===1?'mudança':'mudanças'}</span>
          </div>
          <p class="pr-suggested-by">reorganização proposta pela IA</p>
        </div>
        <div class="pr-diff">
          ${r.acoes.map(a => `<div class="diff-row"><span class="diff-key">${escapeHtml(a.tipo)}</span><span class="diff-val new">${describeStorageAcao(a, gavetasById)}</span></div>`).join('')}
        </div>
        <div class="pr-foot">
          <button class="btn btn-approve btn-sm" data-approve-storage-pr="${id}">✓ Aprovar</button>
          <button class="btn btn-reject btn-sm" data-reject-storage-pr="${id}">Rejeitar</button>
        </div>
      </div>
    `).join('');
    el.querySelectorAll('[data-approve-storage-pr]').forEach(btn => btn.addEventListener('click', () => approveStorageRevisao(btn.getAttribute('data-approve-storage-pr'))));
    el.querySelectorAll('[data-reject-storage-pr]').forEach(btn => btn.addEventListener('click', () => rejectStorageRevisao(btn.getAttribute('data-reject-storage-pr'))));
  }

  async function rejectStorageRevisao(id){
    await dbDelete(userPath('/StorageRevisao/' + id));
    await renderStorageRevisao();
  }

  async function approveStorageRevisao(id){
    const rev = await dbGet(userPath('/StorageRevisao/' + id));
    if(!rev) return;
    const btn = document.querySelector(`[data-approve-storage-pr="${id}"]`);
    if(btn){ btn.disabled = true; btn.textContent = 'Aplicando...'; }
    try{
      const gavetas = await dbGet(userPath('/Gavetas')) || {};
      let maxOrder = Object.values(gavetas).reduce((m,g) => Math.max(m, g.order||0), -1);
      const deleted = new Set();

      function ensureGaveta(gid, nome){
        if(gid && gavetas[gid] && !deleted.has(gid)) return gid;
        const newGid = newId();
        maxOrder += 1;
        gavetas[newGid] = { name: nome || 'Sem nome', order: maxOrder, collapsed:false, items:{} };
        return newGid;
      }

      for(const a of (rev.acoes || [])){
        try{
          if(a.tipo === 'mover_item'){
            const origem = gavetas[a.gavetaOrigemId];
            if(!origem || !origem.items || !origem.items[a.itemId]) continue;
            const item = origem.items[a.itemId];
            const destId = ensureGaveta(a.gavetaDestinoId, a.gavetaDestinoNome);
            if(!gavetas[destId].items) gavetas[destId].items = {};
            gavetas[destId].items[a.itemId] = item;
            if(destId !== a.gavetaOrigemId) delete origem.items[a.itemId];
          } else if(a.tipo === 'mesclar_gavetas'){
            const finalId = ensureGaveta(a.gavetaFinalId, a.novoNome);
            if(!gavetas[finalId].items) gavetas[finalId].items = {};
            (a.gavetaIds || []).forEach(gid => {
              if(gid === finalId || !gavetas[gid]) return;
              Object.entries(gavetas[gid].items || {}).forEach(([iid, it]) => {
                const key = gavetas[finalId].items[iid] ? newId() : iid;
                gavetas[finalId].items[key] = it;
              });
              deleted.add(gid);
            });
          } else if(a.tipo === 'excluir_item'){
            if(gavetas[a.gavetaId] && gavetas[a.gavetaId].items){ delete gavetas[a.gavetaId].items[a.itemId]; }
          } else if(a.tipo === 'excluir_gaveta'){
            if(gavetas[a.gavetaId]) deleted.add(a.gavetaId);
          } else if(a.tipo === 'renomear_gaveta'){
            if(gavetas[a.gavetaId]) gavetas[a.gavetaId].name = a.novoNome;
          } else if(a.tipo === 'editar_item'){
            if(gavetas[a.gavetaId] && gavetas[a.gavetaId].items && gavetas[a.gavetaId].items[a.itemId]){
              gavetas[a.gavetaId].items[a.itemId].text = forceBulletText(a.novoTexto);
            }
          }
        }catch(actionErr){ console.warn('Falha ao aplicar ação de reorganização:', a, actionErr); }
      }

      // Grava o estado final: gavetas alteradas/criadas em uma única escrita, e remove as excluídas.
      const finalWrite = {};
      Object.entries(gavetas).forEach(([gid, g]) => { if(!deleted.has(gid)) finalWrite[gid] = g; });
      await dbPut(userPath('/Gavetas'), finalWrite);
      await dbDelete(userPath('/StorageRevisao/' + id));
      await renderStorage();
      await renderStorageRevisao();
    }catch(err){
      showAppMessage('Erro ao aplicar a reorganização: ' + err.message, 'error');
      if(btn){ btn.disabled = false; btn.textContent = '✓ Aprovar'; }
    }
  }

  const editingGavetas = new Set();
  async function renderStorage(){
    const el = document.getElementById('gavetaList');
    const data = await dbGet(userPath('/Gavetas')) || {};
    const gavetas = Object.entries(data).sort((a,b) => (a[1].order||0) - (b[1].order||0));
    if(!gavetas.length){ el.innerHTML = '<p class="empty-state">Nenhuma gaveta ainda. Crie uma acima, ou aprove itens na Revisão IA.</p>'; return; }
    el.innerHTML = gavetas.map(([id, g], idx) => {
      const items = Object.entries(g.items || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
      const isEditing = editingGavetas.has(id);
      const isMulti = items.length > 1;
      const joinedText = items.map(([,it]) => (isMulti ? ensureBulletLine(it.text) : it.text)).join('\n');
      return `
      <div class="gaveta-card ${g.collapsed && !isEditing ? 'collapsed' : ''}" data-gid="${id}">
        <div class="gaveta-head" data-toggle-collapse="${id}">
          <span class="gaveta-chevron">▾</span>
          ${isEditing
            ? `<input type="text" class="gaveta-name-edit" data-gid-name-edit="${id}" value="${escapeHtml(g.name)}" onclick="event.stopPropagation()">`
            : `<span class="gaveta-name">${escapeHtml(g.name)}</span>`}
          <span class="gaveta-count">${items.length} ${items.length===1 ? 'item' : 'itens'}</span>
          <div class="gaveta-actions">
            ${isEditing ? '' : `<button data-move-up="${id}" ${idx===0?'disabled':''}>↑</button>
            <button data-move-down="${id}" ${idx===gavetas.length-1?'disabled':''}>↓</button>
            <button data-edit-gaveta="${id}">editar</button>
            <button data-del-gaveta="${id}">excluir</button>`}
          </div>
        </div>
        <div class="gaveta-body">
          ${isEditing ? `
            <textarea class="gaveta-edit-textarea" data-gid-edit="${id}" placeholder="Um item por linha...">${escapeHtml(joinedText)}</textarea>
            <div class="gaveta-edit-actions">
              <button class="btn btn-ghost btn-sm" data-cancel-edit-gaveta="${id}">Cancelar</button>
              <button class="btn btn-primary btn-sm" data-save-gaveta="${id}">Salvar</button>
            </div>
          ` : (items.length ? `<div class="gaveta-item-text" style="white-space:pre-wrap;">${escapeHtml(joinedText)}</div>` : '<p class="gaveta-empty">Vazia.</p>')}
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-toggle-collapse]').forEach(headEl => {
      headEl.addEventListener('click', (e) => {
        if(e.target.closest('.gaveta-actions')) return;
        const gid = headEl.getAttribute('data-toggle-collapse');
        if(editingGavetas.has(gid)) return;
        const g = data[gid];
        const newCollapsed = !g.collapsed;
        g.collapsed = newCollapsed;
        const card = headEl.closest('.gaveta-card');
        if(card) card.classList.toggle('collapsed', newCollapsed);
        dbPatchSilent(userPath('/Gavetas/' + gid), { collapsed: newCollapsed })
          .catch(err => console.error('Erro ao salvar estado da gaveta', err));
      });
    });
    el.querySelectorAll('[data-move-up]').forEach(btn => btn.addEventListener('click', () => swapGavetaOrder(gavetas, btn.getAttribute('data-move-up'), -1)));
    el.querySelectorAll('[data-move-down]').forEach(btn => btn.addEventListener('click', () => swapGavetaOrder(gavetas, btn.getAttribute('data-move-down'), 1)));
    el.querySelectorAll('[data-del-gaveta]').forEach(btn => btn.addEventListener('click', async () => {
      if(!confirm('Excluir esta gaveta e todo o seu conteúdo?')) return;
      await dbDelete(userPath('/Gavetas/' + btn.getAttribute('data-del-gaveta')));
      await renderStorage();
    }));
    el.querySelectorAll('[data-edit-gaveta]').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      editingGavetas.add(btn.getAttribute('data-edit-gaveta'));
      await renderStorage();
      const gid = btn.getAttribute('data-edit-gaveta');
      const ta = el.querySelector(`[data-gid-edit="${gid}"]`);
      if(ta){ ta.focus(); ta.selectionStart = ta.value.length; }
    }));
    el.querySelectorAll('[data-cancel-edit-gaveta]').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      editingGavetas.delete(btn.getAttribute('data-cancel-edit-gaveta'));
      await renderStorage();
    }));
    el.querySelectorAll('[data-save-gaveta]').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gid = btn.getAttribute('data-save-gaveta');
      const ta = el.querySelector(`[data-gid-edit="${gid}"]`);
      const nameInput = el.querySelector(`[data-gid-name-edit="${gid}"]`);
      const rawLines = ta.value.split('\n').map(l => l.trim()).filter(Boolean);
      const lines = rawLines.length > 1 ? rawLines.map(ensureBulletLine) : rawLines.map(l => normalizeBullets(l));
      const newItems = {};
      lines.forEach((text, i) => { newItems['it' + i] = { text, order: i, addedAt: new Date().toISOString() }; });
      const newName = nameInput ? nameInput.value.trim() : '';
      await dbPut(userPath('/Gavetas/' + gid + '/items'), newItems);
      if(newName){ await dbPatch(userPath('/Gavetas/' + gid), { name: newName }); }
      editingGavetas.delete(gid);
      await renderStorage();
    }));
  }
  async function swapGavetaOrder(gavetas, gid, dir){
    const idx = gavetas.findIndex(([id]) => id === gid);
    const swapIdx = idx + dir;
    if(swapIdx < 0 || swapIdx >= gavetas.length) return;
    const [idA, gA] = gavetas[idx];
    const [idB, gB] = gavetas[swapIdx];
    await dbPatch(userPath('/Gavetas/' + idA), { order: gB.order });
    await dbPatch(userPath('/Gavetas/' + idB), { order: gA.order });
    await renderStorage();
  }
  async function setAllGavetasCollapsed(collapsed){
    await withoutLoading(async () => {
      const data = await dbGet(userPath('/Gavetas')) || {};
      await Promise.all(Object.keys(data).map(id => dbPatchSilent(userPath('/Gavetas/' + id), { collapsed })));
      await renderStorage();
    });
  }
  document.getElementById('expandAllGavetasBtn').addEventListener('click', () => setAllGavetasCollapsed(false));
  document.getElementById('collapseAllGavetasBtn').addEventListener('click', () => setAllGavetasCollapsed(true));

  /* ---------- DIÁRIO (registro pessoal, sem interferência da IA no conteúdo) ---------- */
  function formatDiarioDate(iso){
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yest.toDateString();
    const hora = d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    if(sameDay) return 'hoje, ' + hora;
    if(isYesterday) return 'ontem, ' + hora;
    const diffDays = Math.round((now - d) / 86400000);
    if(diffDays > 1 && diffDays < 30) return diffDays + ' dias atrás';
    return d.toLocaleDateString('pt-BR') + ', ' + hora;
  }

  const DIARIO_THEMES = [
    { key: 'navy', label: 'Meia-noite', swatch: '#212e3f' },
    { key: 'dark', label: 'Noturno', swatch: '#3a332a' },
    { key: 'green', label: 'Verde', swatch: '#243a2b' },
    { key: 'wine', label: 'Vinho', swatch: '#402228' },
    { key: 'plum', label: 'Roxo', swatch: '#332a44' }
  ];
  function applyDiarioTheme(key){
    const book = document.getElementById('diarioBook');
    if(!book) return;
    DIARIO_THEMES.forEach(t => book.classList.remove('theme-' + t.key));
    if(key && key !== 'navy') book.classList.add('theme-' + key);
    document.querySelectorAll('.diary-theme-dot').forEach(d => {
      d.classList.toggle('active', d.getAttribute('data-diary-theme') === (key || 'navy'));
    });
  }
  function renderDiarioThemeSwatches(){
    const row = document.getElementById('diarioThemeSwatches');
    if(!row || row.children.length) return;
    row.innerHTML = DIARIO_THEMES.map(t => `<button type="button" class="diary-theme-dot" data-diary-theme="${t.key}" style="background:${t.swatch};" title="${t.label}"></button>`).join('');
    row.querySelectorAll('.diary-theme-dot').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-diary-theme');
      applyDiarioTheme(key);
      localStorage.setItem('diarioTheme', key);
      dbPatchSilent(userPath('/Config'), { diarioTheme: key }).catch(err => console.error('Erro ao salvar tema do diário', err));
    }));
    applyDiarioTheme(localStorage.getItem('diarioTheme'));
  }
  async function loadDiarioTheme(){
    try{
      const config = await dbGet(userPath('/Config')) || {};
      if(config.diarioTheme){
        localStorage.setItem('diarioTheme', config.diarioTheme);
        applyDiarioTheme(config.diarioTheme);
      }
    }catch(e){ /* mantém o tema já aplicado a partir do localStorage */ }
  }
  async function renderDiario(){
    const listEl = document.getElementById('diarioEntriesList');
    const countEl = document.getElementById('diarioEntryCount');
    const labelEl = document.getElementById('diarioTodayLabel');
    if(labelEl) labelEl.textContent = fmtShortDate(todayStr()) || 'Hoje';
    renderDiarioThemeSwatches();
    const data = await dbGet(userPath('/DiarioEntradas')) || {};
    const entries = Object.entries(data).sort((a,b) => (b[1].createdAt||'').localeCompare(a[1].createdAt||''));

    if(countEl) countEl.textContent = entries.length ? `${entries.length} página${entries.length===1?'':'s'} escritas` : '';

    if(!entries.length){
      listEl.innerHTML = '<p class="empty-state">Nenhuma entrada ainda. Escreva sobre o seu dia ao lado.</p>';
      return;
    }

    listEl.innerHTML = entries.map(([id, e]) => `
      <div class="diary-entry">
        <div class="diary-entry-top">
          <span class="diary-entry-mood">${escapeHtml(e.mood || '🙂')}</span>
          <span class="diary-entry-date">${formatDiarioDate(e.createdAt)}</span>
          <button data-del-diario="${id}" style="margin-left:auto; background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:11.5px;">remover</button>
        </div>
        <div class="diary-entry-text">${escapeHtml(e.text)}</div>
      </div>
    `).join('');
    listEl.querySelectorAll('[data-del-diario]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await dbDelete(userPath('/DiarioEntradas/' + btn.getAttribute('data-del-diario')));
        await renderDiario();
      });
    });
  }

  /* ---------- HOJE — painel "Plano alimentar hoje" ----------
     Mostra sempre a PRÓXIMA refeição do dia ainda não confirmada, com todos
     os itens dela e dois botões (Fiz / Não fiz). Só ao responder é que a
     refeição seguinte aparece. O registro fica em /MealLog/{data}/{mealId}.
     Um botão adicional "Fiz outra refeição" permite registrar uma refeição
     extra fora do plano, sem interferir na refeição planejada pendente. */
  async function renderHojePlanoAlimentar(){
    const el = document.getElementById('hojePlanoAlimentarList');
    const dow = new Date().getDay();
    const diaData = await dbGet(userPath('/PlanoAlimentar/' + dow)) || {};
    const refeicoes = Object.entries(diaData.refeicoes || {})
      .sort((a,b) => (a[1].horario||'').localeCompare(b[1].horario||''));

    if(!refeicoes.length){
      el.innerHTML = '<p class="empty-state">Nenhuma refeição configurada para hoje ainda.</p>';
      return;
    }

    const today = todayStr();
    const mealLog = await dbGet(userPath('/MealLog/' + today)) || {};
    const pending = refeicoes.find(([mid]) => !mealLog[mid]);

    if(!pending){
      const feitas = refeicoes.filter(([mid]) => mealLog[mid] && mealLog[mid].status === 'done').length;
      el.innerHTML = `
        <p class="empty-state" style="color:var(--sage);">✓ Todas as ${refeicoes.length} refeições de hoje já foram registradas (${feitas} feita${feitas===1?'':'s'}).</p>
        <button class="btn btn-gold btn-sm" id="mealHojeExtraBtn" style="width:100%;">🍽 Fiz outra refeição</button>`;
      document.getElementById('mealHojeExtraBtn').addEventListener('click', () => logExtraMealHoje());
      return;
    }

    const [mid, r] = pending;
    const alimentos = Object.entries(r.alimentos || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
    el.innerHTML = `
      <div class="pa-hoje-card">
        <div class="pa-hoje-head">
          <div class="pa-hoje-name">${escapeHtml(r.nome || 'Refeição')}</div>
          <span class="queue-time">${escapeHtml(r.horario || '—')}</span>
        </div>
        ${alimentos.length ? `<ul class="pa-hoje-foods">
          ${alimentos.map(([fid,a]) => `<li>${escapeHtml(a.nome||'')}${a.quantidade ? ' <span style="color:var(--text-dim);">— ' + escapeHtml(a.quantidade) + '</span>' : ''}</li>`).join('')}
        </ul>` : '<p class="empty-state" style="margin:0;">Nenhum item cadastrado para esta refeição.</p>'}
        <div class="pa-hoje-actions">
          <button class="btn btn-approve btn-sm" id="mealHojeDoneBtn">✓ Fiz essa refeição</button>
          <button class="btn btn-gold btn-sm" id="mealHojeExtraBtn">🍽 Fiz outra refeição</button>
          <button class="btn btn-reject btn-sm" id="mealHojeSkipBtn">✕ Não fiz</button>
        </div>
      </div>`;

    document.getElementById('mealHojeDoneBtn').addEventListener('click', () => confirmMealHoje(mid, 'done'));
    document.getElementById('mealHojeSkipBtn').addEventListener('click', () => confirmMealHoje(mid, 'skipped'));
    document.getElementById('mealHojeExtraBtn').addEventListener('click', () => logExtraMealHoje());
  }

  async function confirmMealHoje(mid, status){
    const today = todayStr();
    await dbPut(userPath('/MealLog/' + today + '/' + mid), { status, at: new Date().toISOString() });
    await renderHojePlanoAlimentar();
  }

  // Registra uma refeição extra, fora das refeições planejadas do dia — não
  // afeta a contagem de refeições pendentes/feitas do plano em si.
  async function logExtraMealHoje(){
    const today = todayStr();
    const id = 'extra_' + newId();
    await dbPut(userPath('/MealLog/' + today + '/' + id), { status:'done', extra:true, at: new Date().toISOString() });
    showAppMessage('Refeição extra registrada.', 'success');
  }

  /* ---------- HOJE — painel "Objetivos" ---------- */
  async function renderHojeObjetivos(){
    const el = document.getElementById('hojeObjetivosList');
    const data = await dbGet(userPath('/objetivos')) || {};
    const counts = await fetchAutoActionCounts();
    aplicarAutoProgresso(data, counts);
    const entries = Object.entries(data).sort((a,b) => {
      const pa = OBJ_PRIORIDADE_ORDER[a[1].prioridade] ?? 1;
      const pb = OBJ_PRIORIDADE_ORDER[b[1].prioridade] ?? 1;
      return pa - pb || (a[1].criadoEm||'').localeCompare(b[1].criadoEm||'');
    });
    if(!entries.length){
      el.innerHTML = '<p class="empty-state">Nenhum objetivo cadastrado ainda.</p>';
      return;
    }
    el.innerHTML = entries.slice(0, 4).map(([id, o]) => {
      const pontos = Object.values(o.pontos || {});
      const pct = pontos.length ? Math.round(pontos.reduce((sum, p) => sum + pontoProgresso(p), 0) / pontos.length) : 0;
      const cat = objCategoria(o.categoria);
      return `
      <div class="hoje-obj-row">
        <div class="hoje-obj-top">
          <span class="hoje-obj-emoji">${cat.emoji}</span>
          <span class="hoje-obj-name">${escapeHtml(o.nome)}</span>
          <span class="hoje-obj-pct">${pct}%</span>
        </div>
        <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct}%; background:${cat.color};"></div></div>
      </div>`;
    }).join('');
  }

  /* ---------- ACADEMIA (cronograma semanal) ----------
     Mesmo padrão da Rotina: edições ficam num rascunho em memória e só vão
     pro Firebase ao clicar "Salvar alterações". "Cancelar" descarta e recarrega. */
  const ACADEMIA_DAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

  let academiaDraft = null;
  let academiaDirty = false;
  function cloneAcademia(data){ return JSON.parse(JSON.stringify(data || {})); }
  function setAcademiaDirty(dirty){
    academiaDirty = dirty;
    const status = document.getElementById('academiaSaveStatus');
    const saveBtn = document.getElementById('academiaSaveBtn');
    if(status) status.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
    if(status) status.style.color = dirty ? 'var(--gold)' : 'var(--text-dim)';
    if(saveBtn) saveBtn.disabled = !dirty;
  }
  function ensureAcademiaDay(dow){
    if(!academiaDraft[dow]) academiaDraft[dow] = { ativo:false, exercicios:{} };
    if(!academiaDraft[dow].exercicios) academiaDraft[dow].exercicios = {};
    return academiaDraft[dow];
  }
  function dayCopySelectHtml(dow){
    return `
      <select class="day-copy-select" data-copy-source="${dow}">
        <option value="">⧉ copiar para...</option>
        ${ACADEMIA_DAY_NAMES.map((n,i) => i === dow ? '' : `<option value="${i}">${n}</option>`).join('')}
      </select>`;
  }

  function renderAcademiaGrid(){
    const grid = document.getElementById('academiaDaysGrid');
    const todayDow = new Date().getDay();

    grid.innerHTML = ACADEMIA_DAY_NAMES.map((nome, dow) => {
      const dia = academiaDraft[dow] || {};
      const ativo = !!dia.ativo;
      const exercicios = Object.entries(dia.exercicios || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
      return `
      <div class="academia-day-card ${dow === todayDow ? 'today' : ''} ${ativo ? '' : 'inactive'}" data-dow="${dow}">
        <div class="academia-day-head">
          <span class="academia-day-name">${nome}${dow === todayDow ? ' <span class="academia-day-today-tag">hoje</span>' : ''}</span>
          <label class="academia-toggle">
            <input type="checkbox" data-day-toggle="${dow}" ${ativo ? 'checked' : ''}>
            <span class="academia-toggle-track"></span>
          </label>
        </div>
        <div class="academia-horario-row">
          <label>Horário do treino</label>
          <input type="time" class="academia-horario-input" data-day-horario="${dow}" value="${escapeHtml(dia.horario || '')}">
        </div>
        ${dayCopySelectHtml(dow)}
        <div class="academia-ex-list" data-ex-list="${dow}">
          ${exercicios.length ? exercicios.map(([eid,e], idx) => `
            <div class="academia-ex-row">
              <span class="academia-ex-index">${idx + 1}.</span>
              <input type="text" class="academia-ex-name-input" data-ex-name="${dow}|${eid}" value="${escapeHtml(e.nome||'')}" placeholder="Nome do exercício">
              <button data-del-ex="${dow}|${eid}">✕</button>
            </div>`).join('') : '<p class="academia-ex-empty">Nenhum exercício ainda.</p>'}
        </div>
        <div class="academia-add-row">
          <input type="text" placeholder="Adicionar exercício..." data-ex-input="${dow}">
          <button data-add-ex="${dow}">+</button>
        </div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-day-toggle]').forEach(input => {
      input.addEventListener('change', () => {
        const dow = input.getAttribute('data-day-toggle');
        ensureAcademiaDay(dow).ativo = input.checked;
        setAcademiaDirty(true);
      });
    });
    grid.querySelectorAll('[data-day-horario]').forEach(input => {
      input.addEventListener('input', () => {
        const dow = input.getAttribute('data-day-horario');
        ensureAcademiaDay(dow).horario = input.value;
        setAcademiaDirty(true);
      });
    });
    grid.querySelectorAll('[data-ex-name]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, eid] = input.getAttribute('data-ex-name').split('|');
        const dia = ensureAcademiaDay(dow);
        if(!dia.exercicios[eid]) dia.exercicios[eid] = { order:0 };
        dia.exercicios[eid].nome = input.value;
        setAcademiaDirty(true);
      });
    });
    grid.querySelectorAll('[data-add-ex]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dow = btn.getAttribute('data-add-ex');
        const input = grid.querySelector(`[data-ex-input="${dow}"]`);
        const nome = input.value.trim();
        if(!nome) return;
        const dia = ensureAcademiaDay(dow);
        const maxOrder = Object.values(dia.exercicios).reduce((max,e) => Math.max(max, Number.isFinite(e.order) ? e.order : 0), -1);
        const eid = newId();
        dia.exercicios[eid] = { nome, order: maxOrder + 1 };
        setAcademiaDirty(true);
        renderAcademiaGrid();
      });
    });
    grid.querySelectorAll('[data-ex-input]').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); grid.querySelector(`[data-add-ex="${input.getAttribute('data-ex-input')}"]`).click(); }
      });
    });
    grid.querySelectorAll('[data-del-ex]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, eid] = btn.getAttribute('data-del-ex').split('|');
        if(academiaDraft[dow] && academiaDraft[dow].exercicios) delete academiaDraft[dow].exercicios[eid];
        setAcademiaDirty(true);
        renderAcademiaGrid();
      });
    });
    grid.querySelectorAll('[data-copy-source]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const sourceDow = sel.getAttribute('data-copy-source');
        const targetDow = sel.value;
        sel.value = '';
        if(targetDow === '') return;
        const sourceName = ACADEMIA_DAY_NAMES[sourceDow], targetName = ACADEMIA_DAY_NAMES[targetDow];
        if(!(await showConfirm(`Copiar o treino de ${sourceName} para ${targetName}? Isso substitui o que já existe em ${targetName}.`))) return;
        const sourceDia = academiaDraft[sourceDow] || { ativo:false, exercicios:{} };
        const newExercicios = {};
        Object.values(sourceDia.exercicios || {}).forEach(e => { newExercicios[newId()] = { nome: e.nome, order: e.order || 0 }; });
        academiaDraft[targetDow] = { ativo: !!sourceDia.ativo, exercicios: newExercicios };
        setAcademiaDirty(true);
        renderAcademiaGrid();
      });
    });
  }

  async function renderAcademia(){
    const [dias, metas] = await Promise.all([
      dbGet(userPath('/AcademiaDias')) || {},
      dbGet(userPath('/AcademiaMetas')) || {}
    ]);
    academiaDraft = cloneAcademia(dias);
    const metasData = metas || {};
    const aguaMetaInput = document.getElementById('academiaAguaMetaInput');
    const creatinaMetaInput = document.getElementById('academiaCreatinaMetaInput');
    if(document.activeElement !== aguaMetaInput) aguaMetaInput.value = metasData.aguaMl || '';
    if(document.activeElement !== creatinaMetaInput) creatinaMetaInput.value = metasData.creatinaG || '';
    renderAcademiaGrid();
    setAcademiaDirty(false);
  }

  document.getElementById('academiaSaveBtn').addEventListener('click', async () => {
    if(!academiaDraft) return;
    Object.values(academiaDraft).forEach(dia => {
      Object.values((dia && dia.exercicios) || {}).forEach(e => { if(typeof e.nome === 'string') e.nome = e.nome.trim(); });
    });
    await dbPut(userPath('/AcademiaDias'), academiaDraft);
    setAcademiaDirty(false);
    await renderHojeQueue();
  });
  document.getElementById('academiaCancelBtn').addEventListener('click', async () => {
    await renderAcademia();
  });

  document.getElementById('academiaAguaMetaInput').addEventListener('change', async (e) => {
    const val = Math.max(0, Number(e.target.value) || 0);
    await dbPatch(userPath('/AcademiaMetas'), { aguaMl: val });
    await renderHojeHidratacao();
  });
  document.getElementById('academiaCreatinaMetaInput').addEventListener('change', async (e) => {
    const val = Math.max(0, Number(e.target.value) || 0);
    await dbPatch(userPath('/AcademiaMetas'), { creatinaG: val });
    await renderHojeHidratacao();
  });

  /* ---------- PLANO ALIMENTAR (refeições + alimentos por dia da semana) ----------
     Mesmo padrão da Rotina: edições ficam num rascunho em memória e só vão pro
     Firebase ao clicar "Salvar alterações". "Cancelar" descarta e recarrega. */
  const PA_DEFAULT_MEALS = [
    { nome:'Café da manhã',   horario:'08:00' },
    { nome:'Almoço',          horario:'12:00' },
    { nome:'Lanche da tarde', horario:'15:00' },
    { nome:'Jantar',          horario:'18:00' },
    { nome:'Ceia',            horario:'22:00' }
  ];
  function buildDefaultPlanoAlimentar(){
    const dias = {};
    for(let dow = 0; dow < 7; dow++){
      const refeicoes = {};
      PA_DEFAULT_MEALS.forEach((m, idx) => {
        refeicoes[newId()] = { nome:m.nome, horario:m.horario, order: idx, alimentos:{} };
      });
      dias[dow] = { refeicoes };
    }
    return dias;
  }

  let paDraft = null;
  let paDirty = false;
  function clonePa(data){ return JSON.parse(JSON.stringify(data || {})); }
  function setPaDirty(dirty){
    paDirty = dirty;
    const status = document.getElementById('paSaveStatus');
    const saveBtn = document.getElementById('paSaveBtn');
    if(status) status.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
    if(status) status.style.color = dirty ? 'var(--gold)' : 'var(--text-dim)';
    if(saveBtn) saveBtn.disabled = !dirty;
  }
  function ensurePaDay(dow){
    if(!paDraft[dow]) paDraft[dow] = { refeicoes:{} };
    if(!paDraft[dow].refeicoes) paDraft[dow].refeicoes = {};
    return paDraft[dow];
  }
  function ensurePaMeal(dow, mid){
    const dia = ensurePaDay(dow);
    if(!dia.refeicoes[mid]) dia.refeicoes[mid] = { alimentos:{} };
    if(!dia.refeicoes[mid].alimentos) dia.refeicoes[mid].alimentos = {};
    return dia.refeicoes[mid];
  }
  function ensurePaFood(dow, mid, fid){
    const meal = ensurePaMeal(dow, mid);
    if(!meal.alimentos[fid]) meal.alimentos[fid] = { order:0 };
    return meal.alimentos[fid];
  }

  function paMealCardHtml(dow, mid, m){
    const alimentos = Object.entries(m.alimentos || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
    return `
      <div class="pa-meal-card" data-meal="${dow}|${mid}">
        <div class="pa-meal-head">
          <input type="text" class="pa-meal-name-input" data-meal-name="${dow}|${mid}" value="${escapeHtml(m.nome||'')}" placeholder="Nome da refeição">
          <input type="time" class="pa-meal-time-input" data-meal-time="${dow}|${mid}" value="${escapeHtml(m.horario||'')}">
          <button class="pa-meal-del-btn" data-del-meal="${dow}|${mid}" title="Excluir refeição">✕</button>
        </div>
        <div class="pa-food-list" data-food-list="${dow}|${mid}">
          ${alimentos.length ? alimentos.map(([fid,f]) => `
            <div class="pa-food-row">
              <input type="text" class="pa-food-qty-edit" data-food-qty-edit="${dow}|${mid}|${fid}" value="${escapeHtml(f.quantidade||'')}" placeholder="Qtd">
              <input type="text" class="pa-food-name-edit" data-food-name-edit="${dow}|${mid}|${fid}" value="${escapeHtml(f.nome||'')}" placeholder="Alimento">
              <button data-del-food="${dow}|${mid}|${fid}">✕</button>
            </div>`).join('') : '<p class="academia-ex-empty">Nenhum alimento ainda.</p>'}
        </div>
        <div class="pa-food-add-row">
          <input type="text" placeholder="Qtd (ex: 150g)" data-food-qty-input="${dow}|${mid}">
          <input type="text" placeholder="Alimento..." data-food-name-input="${dow}|${mid}">
          <button data-add-food="${dow}|${mid}">+</button>
        </div>
      </div>`;
  }

  function renderPlanoAlimentarGrid(){
    const grid = document.getElementById('paDaysGrid');
    const todayDow = new Date().getDay();

    grid.innerHTML = ACADEMIA_DAY_NAMES.map((nome, dow) => {
      const dia = paDraft[dow] || {};
      const refeicoes = Object.entries(dia.refeicoes || {}).sort((a,b) => (a[1].horario||'').localeCompare(b[1].horario||'') || (a[1].order||0) - (b[1].order||0));
      return `
      <div class="pa-day-card ${dow === todayDow ? 'today' : ''}" data-dow="${dow}">
        <div class="pa-day-head">
          <span class="pa-day-name">${nome}${dow === todayDow ? ' <span class="academia-day-today-tag">hoje</span>' : ''}</span>
        </div>
        ${dayCopySelectHtml(dow)}
        <div class="pa-meal-list" data-meal-list="${dow}">
          ${refeicoes.length ? refeicoes.map(([mid,m]) => paMealCardHtml(dow, mid, m)).join('') : '<p class="academia-ex-empty">Nenhuma refeição ainda.</p>'}
        </div>
        <div class="pa-add-meal-row"><button data-add-meal="${dow}">+ Adicionar refeição</button></div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-meal-name]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, mid] = input.getAttribute('data-meal-name').split('|');
        ensurePaMeal(dow, mid).nome = input.value;
        setPaDirty(true);
      });
    });
    grid.querySelectorAll('[data-meal-time]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, mid] = input.getAttribute('data-meal-time').split('|');
        ensurePaMeal(dow, mid).horario = input.value;
        setPaDirty(true);
      });
      input.addEventListener('change', () => { renderPlanoAlimentarGrid(); });
    });
    grid.querySelectorAll('[data-del-meal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, mid] = btn.getAttribute('data-del-meal').split('|');
        if(paDraft[dow] && paDraft[dow].refeicoes) delete paDraft[dow].refeicoes[mid];
        setPaDirty(true);
        renderPlanoAlimentarGrid();
      });
    });
    grid.querySelectorAll('[data-add-meal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dow = btn.getAttribute('data-add-meal');
        const dia = ensurePaDay(dow);
        const mid = newId();
        dia.refeicoes[mid] = { nome:'Nova refeição', horario:'12:00', order: Object.keys(dia.refeicoes).length, alimentos:{} };
        setPaDirty(true);
        renderPlanoAlimentarGrid();
      });
    });
    grid.querySelectorAll('[data-food-name-edit]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, mid, fid] = input.getAttribute('data-food-name-edit').split('|');
        ensurePaFood(dow, mid, fid).nome = input.value;
        setPaDirty(true);
      });
    });
    grid.querySelectorAll('[data-food-qty-edit]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, mid, fid] = input.getAttribute('data-food-qty-edit').split('|');
        ensurePaFood(dow, mid, fid).quantidade = input.value;
        setPaDirty(true);
      });
    });
    grid.querySelectorAll('[data-add-food]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, mid] = btn.getAttribute('data-add-food').split('|');
        const nameInput = grid.querySelector(`[data-food-name-input="${dow}|${mid}"]`);
        const qtyInput = grid.querySelector(`[data-food-qty-input="${dow}|${mid}"]`);
        const nome = nameInput.value.trim();
        if(!nome) return;
        const quantidade = qtyInput.value.trim();
        const meal = ensurePaMeal(dow, mid);
        const fid = newId();
        meal.alimentos[fid] = { nome, quantidade, order: Object.keys(meal.alimentos).length };
        setPaDirty(true);
        renderPlanoAlimentarGrid();
      });
    });
    grid.querySelectorAll('[data-food-name-input],[data-food-qty-input]').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){
          e.preventDefault();
          const key = input.getAttribute('data-food-name-input') || input.getAttribute('data-food-qty-input');
          grid.querySelector(`[data-add-food="${key}"]`).click();
        }
      });
    });
    grid.querySelectorAll('[data-del-food]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, mid, fid] = btn.getAttribute('data-del-food').split('|');
        const meal = paDraft[dow] && paDraft[dow].refeicoes && paDraft[dow].refeicoes[mid];
        if(meal && meal.alimentos) delete meal.alimentos[fid];
        setPaDirty(true);
        renderPlanoAlimentarGrid();
      });
    });
    grid.querySelectorAll('[data-copy-source]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const sourceDow = sel.getAttribute('data-copy-source');
        const targetDow = sel.value;
        sel.value = '';
        if(targetDow === '') return;
        const sourceName = ACADEMIA_DAY_NAMES[sourceDow], targetName = ACADEMIA_DAY_NAMES[targetDow];
        if(!(await showConfirm(`Copiar as refeições de ${sourceName} para ${targetName}? Isso substitui o que já existe em ${targetName}.`))) return;
        const sourceDia = paDraft[sourceDow] || { refeicoes:{} };
        const newRefeicoes = {};
        Object.values(sourceDia.refeicoes || {}).forEach(m => {
          const newAlimentos = {};
          Object.values(m.alimentos || {}).forEach(f => { newAlimentos[newId()] = { nome:f.nome, quantidade:f.quantidade, order:f.order||0 }; });
          newRefeicoes[newId()] = { nome:m.nome, horario:m.horario, order:m.order||0, alimentos:newAlimentos };
        });
        paDraft[targetDow] = { refeicoes:newRefeicoes };
        setPaDirty(true);
        renderPlanoAlimentarGrid();
      });
    });
  }

  async function renderPlanoAlimentar(){
    let planoData = await dbGet(userPath('/PlanoAlimentar'));
    if(!planoData){
      planoData = buildDefaultPlanoAlimentar();
      await dbPut(userPath('/PlanoAlimentar'), planoData);
    }
    paDraft = clonePa(planoData);
    renderPlanoAlimentarGrid();
    setPaDirty(false);

    const config = await dbGet(userPath('/PlanoAlimentarConfig')) || {};
    const cafeInput = document.getElementById('paInsulinaCafeMetaInput');
    const almocoInput = document.getElementById('paInsulinaAlmocoMetaInput');
    const jantarInput = document.getElementById('paInsulinaJantarMetaInput');
    if(document.activeElement !== cafeInput) cafeInput.value = config.insulinaCafeUi || '';
    if(document.activeElement !== almocoInput) almocoInput.value = config.insulinaAlmocoUi || '';
    if(document.activeElement !== jantarInput) jantarInput.value = config.insulinaJantarUi || '';
  }
  document.getElementById('paInsulinaCafeMetaInput').addEventListener('change', async (e) => {
    await dbPatch(userPath('/PlanoAlimentarConfig'), { insulinaCafeUi: Math.max(0, Number(e.target.value) || 0) });
    await renderHojeInsulina();
  });
  document.getElementById('paInsulinaAlmocoMetaInput').addEventListener('change', async (e) => {
    await dbPatch(userPath('/PlanoAlimentarConfig'), { insulinaAlmocoUi: Math.max(0, Number(e.target.value) || 0) });
    await renderHojeInsulina();
  });
  document.getElementById('paInsulinaJantarMetaInput').addEventListener('change', async (e) => {
    await dbPatch(userPath('/PlanoAlimentarConfig'), { insulinaJantarUi: Math.max(0, Number(e.target.value) || 0) });
    await renderHojeInsulina();
  });

  document.getElementById('paSaveBtn').addEventListener('click', async () => {
    if(!paDraft) return;
    Object.values(paDraft).forEach(dia => {
      Object.values((dia && dia.refeicoes) || {}).forEach(m => {
        if(typeof m.nome === 'string') m.nome = m.nome.trim() || 'Refeição';
        Object.values(m.alimentos || {}).forEach(f => { if(typeof f.nome === 'string') f.nome = f.nome.trim(); });
      });
    });
    await dbPut(userPath('/PlanoAlimentar'), paDraft);
    setPaDirty(false);
    await renderHojePlanoAlimentar();
  });
  document.getElementById('paCancelBtn').addEventListener('click', async () => {
    await renderPlanoAlimentar();
  });

  /* ---------- ROTINA (blocos de horário configuráveis por dia da semana) ----------
     As edições ficam num rascunho em memória (rotinaDraft) e só vão pro Firebase
     quando a pessoa clica em "Salvar alterações". "Cancelar" descarta o rascunho
     e recarrega o que estava salvo. */
  let rotinaDraft = null;
  let rotinaDirty = false;

  function cloneRotina(data){ return JSON.parse(JSON.stringify(data || {})); }

  function setRotinaDirty(dirty){
    rotinaDirty = dirty;
    const status = document.getElementById('rotinaSaveStatus');
    const saveBtn = document.getElementById('rotinaSaveBtn');
    if(status) status.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
    if(status) status.style.color = dirty ? 'var(--gold)' : 'var(--text-dim)';
    if(saveBtn) saveBtn.disabled = !dirty;
  }

  function ensureRotinaBlock(dow, bid){
    if(!rotinaDraft[dow]) rotinaDraft[dow] = { blocos:{} };
    if(!rotinaDraft[dow].blocos) rotinaDraft[dow].blocos = {};
    if(!rotinaDraft[dow].blocos[bid]) rotinaDraft[dow].blocos[bid] = {};
    return rotinaDraft[dow].blocos[bid];
  }

  const ROTINA_COLORS = ['#7fa37a', '#c9a227', '#b46a5c', '#6a8caf', '#9482b0', '#b0768f', '#5fa39a', '#8b93a1'];
  const ROTINA_DEFAULT_COLOR = '#7fa37a';

  function rotBlockRowHtml(dow, bid, b, isFirst, isLast){
    const cor = b.cor || ROTINA_DEFAULT_COLOR;
    const key = dow + '|' + bid;
    return `
      <div class="rot-block-row" data-block="${key}">
        <div class="rot-block-order-btns">
          <button data-move-block-up="${key}" ${isFirst ? 'disabled' : ''} title="Mover para cima">↑</button>
          <button data-move-block-down="${key}" ${isLast ? 'disabled' : ''} title="Mover para baixo">↓</button>
        </div>
        <div class="rot-color-picker">
          <button type="button" class="rot-color-dot" data-color-toggle="${key}" style="background:${cor};" title="Cor deste horário"></button>
          <div class="rot-color-popover" data-color-popover="${key}">
            ${ROTINA_COLORS.map(c => `<button type="button" class="rot-color-swatch ${cor === c ? 'selected' : ''}" data-color-pick="${key}|${c}" style="background:${c};" title="${c}"></button>`).join('')}
          </div>
        </div>
        <div class="rot-block-times">
          <input type="time" class="rot-block-time-input" data-block-inicio="${key}" value="${escapeHtml(b.inicio||'')}">
          <span class="rot-block-sep">–</span>
          <input type="time" class="rot-block-time-input" data-block-fim="${key}" value="${escapeHtml(b.fim||'')}">
        </div>
        <input type="text" class="rot-block-name-input" data-block-name="${key}" value="${escapeHtml(b.nome||'')}" placeholder="O que você faz nesse horário...">
        <button class="rot-block-del-btn" data-del-block="${key}" title="Excluir horário">✕</button>
      </div>`;
  }

  // Ordena por "order" (posição manual definida pela pessoa), não pelo horário —
  // assim adicionar/mover um horário não embaralha os outros automaticamente.
  function sortedRotinaBlocks(dow){
    const dia = rotinaDraft[dow] || {};
    return Object.entries(dia.blocos || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0));
  }

  function moveRotinaBlock(dow, bid, direction){
    const sorted = sortedRotinaBlocks(dow);
    const idx = sorted.findIndex(([id]) => id === bid);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if(idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    // Renumera tudo em sequência antes de trocar, garantindo que a troca sempre funcione
    // mesmo com dados antigos que não tinham "order" definido.
    sorted.forEach(([id, b], i) => { b.order = i; });
    const a = sorted[idx][1], b2 = sorted[swapIdx][1];
    const tmp = a.order; a.order = b2.order; b2.order = tmp;
    setRotinaDirty(true);
    renderRotinaGrid();
  }

  function renderRotinaGrid(){
    const grid = document.getElementById('rotinaDaysGrid');
    const todayDow = new Date().getDay();

    grid.innerHTML = ACADEMIA_DAY_NAMES.map((nome, dow) => {
      const blocos = sortedRotinaBlocks(dow);
      return `
      <div class="rot-day-card ${dow === todayDow ? 'today' : ''}" data-dow="${dow}">
        <div class="rot-day-head">
          <span class="rot-day-name">${nome}${dow === todayDow ? ' <span class="academia-day-today-tag">hoje</span>' : ''}</span>
        </div>
        ${dayCopySelectHtml(dow)}
        <div class="rot-block-list" data-block-list="${dow}">
          ${blocos.length ? blocos.map(([bid,b], idx) => rotBlockRowHtml(dow, bid, b, idx === 0, idx === blocos.length - 1)).join('') : '<p class="academia-ex-empty">Nenhum horário configurado ainda.</p>'}
        </div>
        <div class="rot-add-block-row"><button data-add-block="${dow}">+ Adicionar horário</button></div>
      </div>`;
    }).join('');

    grid.querySelectorAll('[data-block-inicio]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, bid] = input.getAttribute('data-block-inicio').split('|');
        ensureRotinaBlock(dow, bid).inicio = input.value;
        setRotinaDirty(true);
      });
    });
    grid.querySelectorAll('[data-block-fim]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, bid] = input.getAttribute('data-block-fim').split('|');
        ensureRotinaBlock(dow, bid).fim = input.value;
        setRotinaDirty(true);
      });
    });
    grid.querySelectorAll('[data-block-name]').forEach(input => {
      input.addEventListener('input', () => {
        const [dow, bid] = input.getAttribute('data-block-name').split('|');
        ensureRotinaBlock(dow, bid).nome = input.value;
        setRotinaDirty(true);
      });
    });
    grid.querySelectorAll('[data-del-block]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, bid] = btn.getAttribute('data-del-block').split('|');
        if(rotinaDraft[dow] && rotinaDraft[dow].blocos) delete rotinaDraft[dow].blocos[bid];
        setRotinaDirty(true);
        renderRotinaGrid();
      });
    });
    grid.querySelectorAll('[data-move-block-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, bid] = btn.getAttribute('data-move-block-up').split('|');
        moveRotinaBlock(dow, bid, 'up');
      });
    });
    grid.querySelectorAll('[data-move-block-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [dow, bid] = btn.getAttribute('data-move-block-down').split('|');
        moveRotinaBlock(dow, bid, 'down');
      });
    });
    grid.querySelectorAll('[data-color-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = btn.getAttribute('data-color-toggle');
        grid.querySelectorAll('.rot-color-popover.open').forEach(p => {
          if(p.getAttribute('data-color-popover') !== key) p.classList.remove('open');
        });
        const pop = grid.querySelector(`[data-color-popover="${key}"]`);
        if(pop) pop.classList.toggle('open');
      });
    });
    grid.querySelectorAll('[data-color-pick]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [dow, bid, color] = btn.getAttribute('data-color-pick').split('|');
        ensureRotinaBlock(dow, bid).cor = color;
        setRotinaDirty(true);
        renderRotinaGrid();
      });
    });
    grid.querySelectorAll('[data-add-block]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dow = btn.getAttribute('data-add-block');
        if(!rotinaDraft[dow]) rotinaDraft[dow] = { blocos:{} };
        if(!rotinaDraft[dow].blocos) rotinaDraft[dow].blocos = {};
        // Garante que o novo horário sempre fica por último, mesmo que os
        // horários existentes ainda não tenham "order" definido.
        const maxOrder = Object.values(rotinaDraft[dow].blocos).reduce(
          (max, b) => Math.max(max, Number.isFinite(b.order) ? b.order : 0), -1
        );
        const bid = newId();
        rotinaDraft[dow].blocos[bid] = { nome:'', inicio:'09:00', fim:'10:00', order: maxOrder + 1, cor: ROTINA_DEFAULT_COLOR };
        setRotinaDirty(true);
        renderRotinaGrid();
      });
    });
    grid.querySelectorAll('[data-copy-source]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const sourceDow = sel.getAttribute('data-copy-source');
        const targetDow = sel.value;
        sel.value = '';
        if(targetDow === '') return;
        const sourceName = ACADEMIA_DAY_NAMES[sourceDow], targetName = ACADEMIA_DAY_NAMES[targetDow];
        if(!(await showConfirm(`Copiar a rotina de ${sourceName} para ${targetName}? Isso substitui o que já existe em ${targetName}.`))) return;
        const sourceDia = rotinaDraft[sourceDow] || { blocos:{} };
        const newBlocos = {};
        Object.values(sourceDia.blocos || {}).forEach(b => {
          newBlocos[newId()] = { nome:b.nome, inicio:b.inicio, fim:b.fim, order:b.order||0, cor:b.cor || ROTINA_DEFAULT_COLOR };
        });
        rotinaDraft[targetDow] = { blocos:newBlocos };
        setRotinaDirty(true);
        renderRotinaGrid();
      });
    });
  }
  document.addEventListener('click', () => {
    document.querySelectorAll('.rot-color-popover.open').forEach(p => p.classList.remove('open'));
  });

  async function renderRotina(){
    const saved = await dbGet(userPath('/Rotina')) || {};
    rotinaDraft = cloneRotina(saved);
    renderRotinaGrid();
    setRotinaDirty(false);
  }

  document.getElementById('rotinaSaveBtn').addEventListener('click', async () => {
    if(!rotinaDraft) return;
    Object.values(rotinaDraft).forEach(dia => {
      Object.values((dia && dia.blocos) || {}).forEach(b => { if(typeof b.nome === 'string') b.nome = b.nome.trim(); });
    });
    await dbPut(userPath('/Rotina'), rotinaDraft);
    setRotinaDirty(false);
    await renderRotinaHoje();
    await renderHojeTimeline();
  });
  document.getElementById('rotinaCancelBtn').addEventListener('click', async () => {
    await renderRotina();
  });

  /* ---------- Rotina hoje (comparação no TODAY: onde estou, o que falta, horas livres) ---------- */
  // O dia "termina" às 23:59 (não 24:00) para efeito do cálculo de horas
  // livres — evita contar um minuto a mais que não existe de verdade.
  const DAY_END_MIN = 23 * 60 + 59;

  function rotToMinutes(t){
    if(!t) return null;
    const parts = t.split(':');
    const h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if(isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  function rotFmtHours(mins){
    mins = Math.round(mins);
    const h = Math.floor(mins / 60), m = mins % 60;
    if(h <= 0) return m + 'min';
    return h + 'h' + (m ? ' ' + m + 'min' : '');
  }

  /* ---------- Timeline 24h da Hoje: blocos da Rotina de hoje + linha do momento atual ---------- */
  async function renderHojeTimeline(){
    const track = document.getElementById('hojeTimeline24hTrack');
    if(!track) return;
    const now = new Date();
    const dow = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const diaData = await dbGet(userPath('/Rotina/' + dow)) || {};
    const blocos = Object.entries(diaData.blocos || {})
      .map(([id, b]) => ({ id, nome: (b.nome || '').trim() || 'Sem nome', inicio: rotToMinutes(b.inicio), fim: rotToMinutes(b.fim), cor: b.cor || ROTINA_DEFAULT_COLOR, inicioStr: b.inicio || '', fimStr: b.fim || '' }))
      .filter(b => b.inicio != null && b.fim != null && b.fim > b.inicio)
      .sort((a,b) => a.inicio - b.inicio);

    const dayMin = 24 * 60;
    const pct = (min) => (Math.min(dayMin, Math.max(0, min)) / dayMin) * 100;

    let html = '';
    for(let h = 0; h <= 24; h += 2){
      html += `<div class="timeline-24h-tick" style="left:${pct(h * 60)}%;"></div>`;
    }
    blocos.forEach(b => {
      const left = pct(b.inicio);
      const width = Math.max(0.6, pct(b.fim) - pct(b.inicio));
      html += `<div class="timeline-24h-block" style="left:${left}%; width:${width}%; background:${b.cor}2e; border-color:${b.cor};"><span class="timeline-24h-block-label" style="color:${b.cor};">${escapeHtml(b.nome)}</span></div>`;
    });
    html += `<div class="timeline-24h-now" style="left:${pct(nowMin)}%;"></div>`;
    track.innerHTML = html;

    hojeTimelineHoverBlocos = blocos;
    setupTimelineHoverTip();
  }

  function updateHojeTimelineNowMarker(){
    const track = document.getElementById('hojeTimeline24hTrack');
    if(!track) return;
    const marker = track.querySelector('.timeline-24h-now');
    if(!marker) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const dayMin = 24 * 60;
    const pct = (Math.min(dayMin, Math.max(0, nowMin)) / dayMin) * 100;
    marker.style.left = pct + '%';
  }
  setInterval(updateHojeTimelineNowMarker, 60 * 1000);

  async function renderRotinaHoje(){
    const nowRow = document.getElementById('rotinaHojeNowRow');
    const agoraEl = document.getElementById('rotinaHojeAgora');
    const livresTotalEl = document.getElementById('rotinaHojeLivresTotal');
    const livresRestanteEl = document.getElementById('rotinaHojeLivresRestante');
    const upcomingEl = document.getElementById('rotinaHojeUpcoming');

    const now = new Date();
    const dow = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    agoraEl.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

    const diaData = await dbGet(userPath('/Rotina/' + dow)) || {};
    const blocos = Object.entries(diaData.blocos || {})
      .map(([id, b]) => ({ id, nome: (b.nome || '').trim() || 'Sem nome', inicio: rotToMinutes(b.inicio), fim: rotToMinutes(b.fim) }))
      .filter(b => b.inicio != null && b.fim != null && b.fim > b.inicio)
      .sort((a,b) => a.inicio - b.inicio);

    if(!blocos.length){
      nowRow.textContent = 'Nenhum horário configurado para hoje ainda — configure na Rotina.';
      livresTotalEl.textContent = rotFmtHours(DAY_END_MIN);
      livresRestanteEl.textContent = rotFmtHours(Math.max(0, DAY_END_MIN - nowMin));
      upcomingEl.innerHTML = '<p class="empty-state">Configure sua rotina para ver o que falta hoje.</p>';
      return;
    }

    let current = null;
    let totalBusyMin = 0;
    blocos.forEach(b => {
      totalBusyMin += (b.fim - b.inicio);
      if(nowMin >= b.inicio && nowMin < b.fim) current = b;
    });

    const upcoming = blocos.filter(b => b.fim > nowMin);
    let remainingBusyMin = 0;
    upcoming.forEach(b => { remainingBusyMin += Math.max(0, b.fim - Math.max(b.inicio, nowMin)); });

    const totalFreeMin = Math.max(0, DAY_END_MIN - totalBusyMin);
    const remainingDayMin = Math.max(0, DAY_END_MIN - nowMin);
    const remainingFreeMin = Math.max(0, remainingDayMin - remainingBusyMin);

    nowRow.textContent = current ? ('Agora você está em: ' + current.nome) : 'Nenhum bloco da rotina agora — hora livre.';
    livresTotalEl.textContent = rotFmtHours(totalFreeMin);
    livresRestanteEl.textContent = rotFmtHours(remainingFreeMin);

    if(!upcoming.length){
      upcomingEl.innerHTML = '<p class="empty-state">Rotina de hoje concluída — nada mais planejado.</p>';
    } else {
      upcomingEl.innerHTML = upcoming.map(b => {
        const h1 = String(Math.floor(b.inicio / 60)).padStart(2,'0'), m1 = String(b.inicio % 60).padStart(2,'0');
        return `<div class="rot-hoje-upcoming-row"><span class="rot-hoje-upcoming-time">${h1}:${m1}</span><span>${escapeHtml(b.nome)}</span></div>`;
      }).join('');
    }
  }

  /* ---------- AGENDA (eventos + importação .ics) ---------- */
  const newEventAllDayToggle = document.getElementById('newEventAllDayToggle');
  newEventAllDayToggle.addEventListener('click', () => {
    newEventAllDayToggle.classList.toggle('active');
  });

  function openEventModal(){
    document.getElementById('newEventTitleInput').value = '';
    document.getElementById('newEventDateInput').value = todayStr();
    document.getElementById('newEventTimeInput').value = '';
    newEventAllDayToggle.classList.remove('active');
    document.getElementById('newEventModal').classList.add('active');
    setTimeout(() => document.getElementById('newEventTitleInput').focus(), 30);
  }
  function closeEventModal(){
    document.getElementById('newEventModal').classList.remove('active');
  }
  document.getElementById('addEventOpenBtn').addEventListener('click', openEventModal);
  document.getElementById('newEventCancelBtn').addEventListener('click', closeEventModal);
  document.getElementById('newEventModal').addEventListener('click', (e) => {
    if(e.target.id === 'newEventModal') closeEventModal();
  });

  document.getElementById('newEventCreateBtn').addEventListener('click', async () => {
    const title = document.getElementById('newEventTitleInput').value.trim();
    const date = document.getElementById('newEventDateInput').value;
    const time = document.getElementById('newEventTimeInput').value;
    const allDay = newEventAllDayToggle.classList.contains('active');
    if(!title || !date) return;
    const id = newId();
    await dbPut(userPath('/Events/' + id), { title, date, time: allDay ? '' : time, allDay, createdAt: new Date().toISOString() });
    closeEventModal();
    await renderAgenda(); await renderHojeAvisosEventos();
  });

  document.getElementById('importIcsBtn').addEventListener('click', () => document.getElementById('importIcsInput').click());
  document.getElementById('importIcsInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const importBtn = document.getElementById('importIcsBtn');
    const agendaEl = document.getElementById('agendaList');
    const originalBtnText = importBtn.textContent;
    importBtn.disabled = true;
    importBtn.textContent = '⏳ Importando...';
    agendaEl.innerHTML = '<p class="empty-state">Importando eventos do .ics...</p>';
    try{
      const text = await file.text();
      const events = parseIcs(text);
      // Grava todos os eventos em uma única escrita (multi-path update), garantindo
      // que a leitura seguinte já reflita 100% dos dados importados.
      const eventsObj = {};
      events.forEach(ev => { eventsObj[newId()] = ev; });
      if(Object.keys(eventsObj).length){
        await dbPatch(userPath('/Events'), eventsObj);
      }
      await renderAgenda();
      await renderHojeAvisosEventos();
      alert(events.length + ' evento(s) importado(s) do .ics.');
    }catch(err){
      alert('Erro ao importar .ics: ' + err.message);
      await renderAgenda();
    }finally{
      e.target.value = '';
      importBtn.disabled = false;
      importBtn.textContent = originalBtnText;
    }
  });

  function parseIcs(text){
    // Desdobra linhas continuadas (RFC5545): uma linha que começa com espaço/tab
    // é continuação da linha anterior. Sem isso, DTSTART/RRULE/SUMMARY longos ou
    // quebrados pelo app de calendário de origem não batem no regex e o evento
    // simplesmente some da importação.
    const unfolded = text.replace(/\r\n/g,'\n').replace(/\n[ \t]/g, '');
    const events = [];
    const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
    const today = new Date(); today.setHours(0,0,0,0);

    for(const block of blocks){
      const body = block.split('END:VEVENT')[0];
      const summaryMatch = body.match(/^SUMMARY.*?:(.*)$/m);
      const dtstartMatch = body.match(/^DTSTART[^:]*:(\d{8})(T(\d{2})(\d{2}))?/m);
      const rruleMatch = body.match(/^RRULE:(.*)$/m);
      if(!dtstartMatch) continue;

      const y = dtstartMatch[1].slice(0,4), m = dtstartMatch[1].slice(4,6), d = dtstartMatch[1].slice(6,8);
      const allDay = !dtstartMatch[2];
      const time = allDay ? '' : (dtstartMatch[3] + ':' + dtstartMatch[4]);
      const dtstartDate = new Date(Number(y), Number(m)-1, Number(d));
      const title = (summaryMatch ? summaryMatch[1].trim() : 'Evento importado').replace(/\r/g,'');

      let occDate = dtstartDate;
      let recurring = false;

      if(rruleMatch){
        recurring = true;
        occDate = nextIcsOccurrence(dtstartDate, rruleMatch[1], today);
        // Evento recorrente que já terminou (UNTIL/COUNT no passado) — não há
        // próxima ocorrência, então não faz sentido importar.
        if(!occDate) continue;
      } else if(dtstartDate < today){
        // Evento único no passado: não entra na Agenda (que só lista futuros),
        // mas isso é intencional — não é um bug de importação.
        continue;
      }

      const date = occDate.getFullYear() + '-' + String(occDate.getMonth()+1).padStart(2,'0') + '-' + String(occDate.getDate()).padStart(2,'0');
      events.push({
        title, date, time, allDay, recurring,
        createdAt: new Date().toISOString(), source:'ics'
      });
    }
    return events;
  }

  // Calcula a próxima ocorrência (>= fromDate) de um evento recorrente simples.
  // Suporta FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT e UNTIL — cobre a
  // grande maioria dos eventos exportados por Google/Apple/Outlook Calendar.
  function nextIcsOccurrence(dtstart, rrule, fromDate){
    const parts = {};
    rrule.split(';').forEach(p => { const [k,v] = p.split('='); if(k) parts[k] = v; });
    const freq = parts.FREQ;
    const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1);
    const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null;
    let until = null;
    if(parts.UNTIL){
      const um = parts.UNTIL.match(/(\d{4})(\d{2})(\d{2})/);
      if(um) until = new Date(Number(um[1]), Number(um[2])-1, Number(um[3]));
    }
    if(!freq) return dtstart >= fromDate ? dtstart : null;

    let cursor = new Date(dtstart);
    let n = 0;
    const MAX_ITER = 2000; // trava de segurança
    for(let i=0; i<MAX_ITER; i++){
      if(count !== null && n >= count) return null;
      if(until && cursor > until) return null;
      if(cursor >= fromDate) return cursor;
      n++;
      if(freq === 'DAILY') cursor.setDate(cursor.getDate() + interval);
      else if(freq === 'WEEKLY') cursor.setDate(cursor.getDate() + 7*interval);
      else if(freq === 'MONTHLY') cursor.setMonth(cursor.getMonth() + interval);
      else if(freq === 'YEARLY') cursor.setFullYear(cursor.getFullYear() + interval);
      else return dtstart >= fromDate ? dtstart : null; // FREQ não suportado: melhor mostrar do que sumir
    }
    return null;
  }

  /* ---------- SIDEBAR — data de hoje (visível em qualquer página) ---------- */
  function renderSidebarDate(){
    const el = document.getElementById('sidebarDate');
    if(!el) return;
    const now = new Date();
    const weekdayFull = WEEKDAYS_PT[now.getDay()];
    const weekdayCap = weekdayFull.charAt(0).toUpperCase() + weekdayFull.slice(1);
    el.innerHTML = `${weekdayCap}, <strong>${now.getDate()} de ${MONTHS_FULL_PT[now.getMonth()]}</strong>`;
  }

  async function renderAgenda(){
    const el = document.getElementById('agendaList');
    const data = await dbGet(userPath('/Events')) || {};
    const today = todayStr();
    const now = new Date();

    const events = Object.values(data).filter(ev => ev.date >= today).sort((a,b) => (a.date+a.time).localeCompare(b.date+b.time));
    if(!events.length){ el.innerHTML = '<p class="empty-state">Nenhum evento futuro. Clique em "+ Novo evento" acima ou importe seu .ics.</p>'; return; }

    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
    function toDate(dstr){ const [y,m,d] = dstr.split('-').map(Number); return new Date(y, m-1, d); }

    // Agrupa por data exata — cada dia vira um bloco de calendário (data em
    // destaque à esquerda), com os horários como detalhe menor de cada evento.
    const byDate = {};
    const order = [];
    events.forEach(ev => {
      if(!byDate[ev.date]){ byDate[ev.date] = []; order.push(ev.date); }
      byDate[ev.date].push(ev);
    });

    let html = '';
    let currentMonthLabel = null;
    let weekPrinted = false;
    for(const dateKey of order){
      const evDate = toDate(dateKey);
      const inThisWeek = evDate >= startOfWeek && evDate <= endOfWeek;
      const monthLabel = MONTHS_FULL_PT[evDate.getMonth()] + ' de ' + evDate.getFullYear();
      if(inThisWeek && !weekPrinted){ html += '<div class="cal-week-label">Esta semana</div>'; weekPrinted = true; currentMonthLabel = null; }
      else if(!inThisWeek && monthLabel !== currentMonthLabel){ html += '<div class="cal-week-label">' + monthLabel + '</div>'; currentMonthLabel = monthLabel; }

      const isToday = dateKey === today;
      const weekdayAbbr = WEEKDAYS_PT[evDate.getDay()].slice(0,3).toUpperCase();
      const monthAbbr = MONTHS_PT[evDate.getMonth()];
      const dayEvents = byDate[dateKey];

      html += `<div class="cal-day-block ${isToday ? 'today' : ''}">
        <div class="cal-day-datebox">
          <span class="cal-day-weekday">${isToday ? 'hoje' : weekdayAbbr}</span>
          <span class="cal-day-num">${evDate.getDate()}</span>
          <span class="cal-day-month">${monthAbbr}</span>
        </div>
        <div class="cal-day-events">
          ${dayEvents.map(ev => `<div class="cal-event-row">
            <span class="cal-event-time">${ev.allDay ? 'dia todo' : (ev.time || '—')}</span>
            <span class="cal-event-title">${escapeHtml(ev.title)}${ev.recurring ? ' <span style="color:var(--text-dim); font-size:11px;">↻ recorrente</span>' : ''}</span>
          </div>`).join('')}
        </div>
      </div>`;
    }
    el.innerHTML = '<div class="panel">' + html + '</div>';
  }

  /* ---------- TAREFAS ---------- */
  const newTaskNoDateToggle = document.getElementById('newTaskNoDateToggle');
  const newTaskDateInput = document.getElementById('newTaskDateInput');
  newTaskNoDateToggle.addEventListener('click', () => {
    const nowActive = !newTaskNoDateToggle.classList.contains('active');
    newTaskNoDateToggle.classList.toggle('active', nowActive);
    newTaskDateInput.disabled = nowActive;
    if(nowActive) newTaskDateInput.value = '';
  });

  function openTaskModal(){
    document.getElementById('newTaskNameInput').value = '';
    newTaskDateInput.value = '';
    newTaskDateInput.disabled = false;
    newTaskNoDateToggle.classList.remove('active');
    document.getElementById('newTaskHorarioInput').value = '';
    document.getElementById('newTaskModal').classList.add('active');
    setTimeout(() => document.getElementById('newTaskNameInput').focus(), 30);
  }
  function closeTaskModal(){
    document.getElementById('newTaskModal').classList.remove('active');
  }
  document.getElementById('addTaskOpenBtn').addEventListener('click', openTaskModal);
  document.getElementById('newTaskCancelBtn').addEventListener('click', closeTaskModal);
  document.getElementById('newTaskModal').addEventListener('click', (e) => {
    if(e.target.id === 'newTaskModal') closeTaskModal();
  });

  document.getElementById('newTaskCreateBtn').addEventListener('click', async () => {
    const name = document.getElementById('newTaskNameInput').value.trim();
    if(!name) return;
    const noDate = newTaskNoDateToggle.classList.contains('active');
    const date = noDate ? '' : newTaskDateInput.value;
    const group = document.getElementById('newTaskGroupSelect').value;
    const horario = document.getElementById('newTaskHorarioInput').value || '';
    const id = newId();
    await dbPut(userPath('/Tasks/' + id), { name, date, group, horario, done:false, createdAt: new Date().toISOString() });
    closeTaskModal();
    await renderTasks(); await renderTaskGroups(); await renderHojeQueue();
  });

  async function toggleTaskDone(id, done){
    await dbPatch(userPath('/Tasks/' + id), { done });
    await renderTaskGroups(); await renderHojeQueue();
  }
  async function deleteTask(id){
    await dbDelete(userPath('/Tasks/' + id));
    await renderTaskGroups(); await renderHojeQueue();
  }

  // Classifica o prazo de uma tarefa em: Hoje, Dia DD/MM (próximos 6 dias ou
  // atrasada), Futuro (mais de 6 dias), ou Indefinido (sem data) — sempre com
  // o dia da semana quando existe data.
  function prazoInfo(dateStr){
    if(!dateStr) return { label:'Indefinido', cls:'prazo-indefinido' };
    const today = todayStr();
    const [y,m,d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m-1, d);
    const weekdayAbbr = WEEKDAYS_PT[dateObj.getDay()].slice(0,3);
    if(dateStr === today) return { label:'Hoje', cls:'prazo-hoje', weekday: weekdayAbbr };
    const dd = String(d).padStart(2,'0'), mm = String(m).padStart(2,'0');
    return { label:'Dia ' + dd + '/' + mm, cls:'prazo-datado', weekday: weekdayAbbr };
  }
  function prazoPillHtml(dateStr){
    const info = prazoInfo(dateStr);
    return `<span class="prazo-pill ${info.cls}">${info.label}${info.weekday ? ' · ' + info.weekday : ''}</span>`;
  }

  /* ---------- GRUPOS DE TAREFAS (containers nomeados, no mesmo espírito do Storage) ---------- */
  const TASK_GROUP_DEFAULTS = ['Pessoais', 'Profissionais', 'Casa'];
  let ungroupedTasksCollapsed = false;
  async function ensureTaskGroupDefaults(){
    const existing = await dbGet(userPath('/TaskGroups'));
    if(existing) return existing;
    const seeded = {};
    TASK_GROUP_DEFAULTS.forEach((name, idx) => { seeded[newId()] = { name, order: idx, collapsed:false }; });
    await dbPut(userPath('/TaskGroups'), seeded);
    return seeded;
  }
  async function populateTaskGroupSelect(){
    const sel = document.getElementById('newTaskGroupSelect');
    if(!sel) return;
    const groups = await ensureTaskGroupDefaults();
    const sorted = Object.entries(groups).sort((a,b) => (a[1].order||0) - (b[1].order||0));
    const prevValue = sel.value;
    sel.innerHTML = '<option value="">Sem grupo</option>' + sorted.map(([id,g]) => `<option value="${id}">${escapeHtml(g.name)}</option>`).join('');
    if(sorted.some(([id]) => id === prevValue)) sel.value = prevValue;
  }

  document.getElementById('addTaskGroupBtn').addEventListener('click', async () => {
    const name = await showPrompt('newGroupModal', 'newGroupModalInput', 'newGroupModalOkBtn', 'newGroupModalCancelBtn');
    if(!name) return;
    const groups = await dbGet(userPath('/TaskGroups')) || {};
    const id = newId();
    await dbPut(userPath('/TaskGroups/' + id), { name, order: Object.keys(groups).length, collapsed:false });
    await populateTaskGroupSelect();
    await renderTaskGroups();
  });

  async function renderTaskGroups(){
    const el = document.getElementById('taskGroupsList');
    const [groupsData, tasksData] = await Promise.all([
      dbGet(userPath('/TaskGroups')) || {},
      dbGet(userPath('/Tasks')) || {}
    ]);
    const groups = groupsData || {};
    const tasks = tasksData || {};
    const groupEntries = Object.entries(groups).sort((a,b) => (a[1].order||0) - (b[1].order||0));

    function tasksOfGroup(gid){
      return Object.entries(tasks).filter(([id,t]) => (t.group || '') === gid);
    }
    function groupCardHtml(gid, g, isUngrouped){
      const groupTasks = tasksOfGroup(gid).sort((a,b) => (a[1].date||'9999').localeCompare(b[1].date||'9999'));
      const pending = groupTasks.filter(([id,t]) => !t.done).length;
      return `
      <div class="gaveta-card ${g.collapsed ? 'collapsed' : ''}" data-tgid="${gid}">
        <div class="gaveta-head" data-toggle-tgroup="${gid}">
          <span class="gaveta-chevron">▾</span>
          <span class="gaveta-name">${escapeHtml(g.name)}</span>
          <span class="gaveta-count">${groupTasks.length} ${groupTasks.length===1?'tarefa':'tarefas'} · ${pending} pendente${pending===1?'':'s'}</span>
          ${isUngrouped ? '' : `<div class="gaveta-actions">
            <button data-rename-tgroup="${gid}">renomear</button>
            <button data-del-tgroup="${gid}">excluir</button>
          </div>`}
        </div>
        <div class="gaveta-body">
          ${groupTasks.length ? `
          <table class="task-table">
            <thead><tr><th>Prazo</th><th>Tarefa</th><th>Status</th><th></th></tr></thead>
            <tbody>
              ${groupTasks.map(([id,t]) => `
              <tr>
                <td>${prazoPillHtml(t.date)}</td>
                <td style="${t.done?'text-decoration:line-through;color:var(--text-dim);':''}">${escapeHtml(t.name)}</td>
                <td><span class="status-pill ${t.done?'status-concluido':'status-fazer'}" data-toggle-task="${id}" style="cursor:pointer;">${t.done?'concluído':'a fazer'}</span></td>
                <td><button class="task-del-btn" data-del-task="${id}">excluir</button></td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<p class="gaveta-empty">Nenhuma tarefa neste grupo ainda.</p>'}
        </div>
      </div>`;
    }

    let html = groupEntries.map(([gid,g]) => groupCardHtml(gid, g, false)).join('');
    const ungroupedCount = tasksOfGroup('').length;
    html += groupCardHtml('', { name:'Sem grupo', collapsed:ungroupedTasksCollapsed }, true);
    el.innerHTML = html || '<p class="empty-state">Crie um grupo para organizar suas tarefas.</p>';

    el.querySelectorAll('[data-toggle-tgroup]').forEach(headEl => {
      headEl.addEventListener('click', (e) => {
        if(e.target.closest('.gaveta-actions') || e.target.closest('[data-toggle-task]') || e.target.closest('[data-del-task]')) return;
        const gid = headEl.getAttribute('data-toggle-tgroup');
        const card = headEl.closest('.gaveta-card');
        const newCollapsed = !card.classList.contains('collapsed');
        card.classList.toggle('collapsed', newCollapsed);
        if(gid){ dbPatchSilent(userPath('/TaskGroups/' + gid), { collapsed: newCollapsed }).catch(err => console.error('Erro ao salvar estado do grupo', err)); }
        else { ungroupedTasksCollapsed = newCollapsed; }
      });
    });
    el.querySelectorAll('[data-rename-tgroup]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gid = btn.getAttribute('data-rename-tgroup');
        const current = groups[gid] ? groups[gid].name : '';
        const novo = await showPrompt('renameGroupModal', 'renameGroupModalInput', 'renameGroupModalOkBtn', 'renameGroupModalCancelBtn', current);
        if(novo === null) return;
        await dbPatch(userPath('/TaskGroups/' + gid), { name: novo });
        await populateTaskGroupSelect();
        await renderTaskGroups();
      });
    });
    el.querySelectorAll('[data-del-tgroup]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gid = btn.getAttribute('data-del-tgroup');
        const affected = tasksOfGroup(gid);
        await Promise.all(affected.map(([id]) => dbPatchSilent(userPath('/Tasks/' + id), { group:'' })));
        await dbDelete(userPath('/TaskGroups/' + gid));
        await populateTaskGroupSelect();
        await renderTaskGroups();
        await renderTasks();
      });
    });
    el.querySelectorAll('[data-toggle-task]').forEach(chk => {
      chk.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = chk.getAttribute('data-toggle-task');
        const t = tasks[id];
        await toggleTaskDone(id, !t.done);
        await renderTaskGroups();
      });
    });
    el.querySelectorAll('[data-del-task]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await deleteTask(btn.getAttribute('data-del-task'));
        await renderTaskGroups();
      });
    });
  }
  async function setAllTaskGroupsCollapsed(collapsed){
    await withoutLoading(async () => {
      const data = await dbGet(userPath('/TaskGroups')) || {};
      await Promise.all(Object.keys(data).map(id => dbPatchSilent(userPath('/TaskGroups/' + id), { collapsed })));
      ungroupedTasksCollapsed = collapsed;
      await renderTaskGroups();
    });
  }
  document.getElementById('expandAllTaskGroupsBtn').addEventListener('click', () => setAllTaskGroupsCollapsed(false));
  document.getElementById('collapseAllTaskGroupsBtn').addEventListener('click', () => setAllTaskGroupsCollapsed(true));

  async function renderTasks(){
    // Mantém o select de grupos do formulário rápido atualizado.
    // A listagem em si (Prazo, Tarefa, Status, Excluir) é renderizada por renderTaskGroups().
    await populateTaskGroupSelect();
  }

  /* ---------- MONDAY (board com sessões de início/parada, responsável, status e tempo total) ---------- */
  const MONDAY_STATUS_ORDER = ['todo', 'doing', 'done', 'blocked'];
  const MONDAY_STATUS_CLASS = { todo:'status-todo', doing:'status-andamento', done:'status-concluido', blocked:'status-blocked' };
  const MONDAY_STATUS_LABEL = { todo:'To Do', doing:'Doing', done:'Done', blocked:'Blocked' };
  const MONDAY_STATUS_DOT = { todo:'var(--blue)', doing:'var(--gold)', done:'var(--sage)', blocked:'var(--coral)' };
  let mondayTasksData = {};
  let mondayResponsavelEditingId = null;

  function fmtHMS(totalSeconds){
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }
  function isoToDatetimeLocal(iso){
    if(!iso) return '';
    const d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function datetimeLocalToIso(val){
    if(!val) return '';
    const d = new Date(val);
    if(isNaN(d.getTime())) return '';
    return d.toISOString();
  }
  function mondaySessionsTotalSeconds(sessoes){
    const now = Date.now();
    return Object.values(sessoes || {}).reduce((sum, s) => {
      const start = new Date(s.inicio).getTime();
      if(isNaN(start)) return sum;
      const end = s.fim ? new Date(s.fim).getTime() : now;
      return sum + Math.max(0, Math.floor((end - start) / 1000));
    }, 0);
  }
  function mondayOpenSessionId(sessoes){
    const found = Object.entries(sessoes || {}).find(([, s]) => !s.fim);
    return found ? found[0] : null;
  }

  function tickMondayTimers(){
    Object.entries(mondayTasksData).forEach(([id, t]) => {
      if(!mondayOpenSessionId(t.sessoes)) return;
      const totalEl = document.querySelector('[data-monday-total="' + id + '"]');
      if(totalEl) totalEl.textContent = fmtHMS(mondaySessionsTotalSeconds(t.sessoes));
    });
  }
  setInterval(tickMondayTimers, 1000);

  /* Dropdown genérico para escolher status (em vez de ciclar clicando) */
  function closeStatusDropdown(){
    const existing = document.querySelector('.status-dropdown');
    if(existing) existing.remove();
    document.removeEventListener('click', closeStatusDropdownOnOutsideClick, true);
  }
  function closeStatusDropdownOnOutsideClick(e){
    const dd = document.querySelector('.status-dropdown');
    if(dd && !dd.contains(e.target)) closeStatusDropdown();
  }
  function openStatusDropdown(anchorEl, onSelect){
    closeStatusDropdown();
    const rect = anchorEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'status-dropdown';
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.left = rect.left + 'px';
    menu.innerHTML = MONDAY_STATUS_ORDER.map(s => `<button type="button" data-pick-status="${s}"><span class="status-dropdown-dot" style="background:${MONDAY_STATUS_DOT[s]};"></span>${MONDAY_STATUS_LABEL[s]}</button>`).join('');
    document.body.appendChild(menu);
    menu.querySelectorAll('[data-pick-status]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(btn.getAttribute('data-pick-status'));
      closeStatusDropdown();
    }));
    setTimeout(() => document.addEventListener('click', closeStatusDropdownOnOutsideClick, true), 0);
  }

  async function renderMondayTasks(){
    const el = document.getElementById('mondayList');
    if(!el) return;
    const data = await dbGet(userPath('/MondayTasks')) || {};
    mondayTasksData = data;
    const entries = Object.entries(data).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    if(!entries.length){
      el.innerHTML = '<p class="empty-state">Nenhuma task ainda. Clique em "+ Nova task" para começar a rodar horas.</p>';
      return;
    }
    el.innerHTML = `
      <table class="task-table">
        <thead><tr><th>Task</th><th>Responsável</th><th>Status</th><th>Tempo total</th><th></th><th></th><th></th></tr></thead>
        <tbody>
          ${entries.map(([id, t]) => {
            const status = MONDAY_STATUS_ORDER.includes(t.status) ? t.status : 'todo';
            const openSid = mondayOpenSessionId(t.sessoes);
            const total = mondaySessionsTotalSeconds(t.sessoes);
            const sessCount = Object.keys(t.sessoes || {}).length;
            return `
            <tr data-monday-id="${id}">
              <td>${escapeHtml(t.nome)}</td>
              <td><span class="monday-responsavel-tag" data-edit-responsavel="${id}">${t.responsavel ? escapeHtml(t.responsavel) : '+ definir'}</span></td>
              <td><span class="status-pill ${MONDAY_STATUS_CLASS[status]}" data-pick-status-for="${id}" style="cursor:pointer;">${MONDAY_STATUS_LABEL[status]}</span></td>
              <td class="mono" data-monday-total="${id}">${fmtHMS(total)}</td>
              <td>${openSid
                ? `<button class="btn btn-ghost btn-sm" data-pause-monday="${id}">⏸ Pausar</button>`
                : `<button class="btn btn-approve btn-sm" data-play-monday="${id}">▶ Play</button>`}</td>
              <td><button class="monday-sessions-count" data-view-sessions="${id}">${sessCount} sessõe${sessCount === 1 ? '' : 's'}</button></td>
              <td><button class="task-del-btn" data-del-monday="${id}">excluir</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    el.querySelectorAll('[data-pick-status-for]').forEach(pill => pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = pill.getAttribute('data-pick-status-for');
      openStatusDropdown(pill, async (status) => {
        await dbPatchSilent(userPath('/MondayTasks/' + id), { status });
        await renderMondayTasks();
      });
    }));
    el.querySelectorAll('[data-play-monday]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-play-monday');
      await dbPutSilent(userPath('/MondayTasks/' + id + '/sessoes/' + newId()), { inicio: new Date().toISOString(), fim: '' });
      await renderMondayTasks();
    }));
    el.querySelectorAll('[data-pause-monday]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-pause-monday');
      const sid = mondayOpenSessionId(mondayTasksData[id] && mondayTasksData[id].sessoes);
      if(!sid) return;
      await dbPatchSilent(userPath('/MondayTasks/' + id + '/sessoes/' + sid), { fim: new Date().toISOString() });
      await renderMondayTasks();
    }));
    el.querySelectorAll('[data-edit-responsavel]').forEach(tag => tag.addEventListener('click', () => {
      openMondayResponsavelModal(tag.getAttribute('data-edit-responsavel'));
    }));
    el.querySelectorAll('[data-view-sessions]').forEach(btn => btn.addEventListener('click', () => {
      openMondaySessionsModal(btn.getAttribute('data-view-sessions'));
    }));
    el.querySelectorAll('[data-del-monday]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta task e todo o histórico de sessões dela?')) return;
      await dbDeleteSilent(userPath('/MondayTasks/' + btn.getAttribute('data-del-monday')));
      await renderMondayTasks();
    }));

    tickMondayTimers();
  }

  document.getElementById('addMondayTaskBtn').addEventListener('click', async () => {
    const nome = await showPrompt('newMondayTaskModal', 'newMondayTaskModalInput', 'newMondayTaskModalOkBtn', 'newMondayTaskModalCancelBtn');
    if(!nome) return;
    const data = await dbGet(userPath('/MondayTasks')) || {};
    await dbPutSilent(userPath('/MondayTasks/' + newId()), {
      nome, responsavel:'', status:'todo', sessoes:{}, order: Object.keys(data).length, criadoEm: new Date().toISOString()
    });
    await renderMondayTasks();
  });

  /* Modal de responsável: escolhido a partir da lista de pessoas cadastrada em Configurações */
  function openMondayResponsavelModal(id){
    mondayResponsavelEditingId = id;
    populateCasaResponsavelSelects();
    const sel = document.getElementById('mondayResponsavelModalInput');
    sel.value = (mondayTasksData[id] && mondayTasksData[id].responsavel) || '';
    document.getElementById('mondayResponsavelModal').classList.add('active');
  }
  document.getElementById('mondayResponsavelModalCancelBtn').addEventListener('click', () => {
    document.getElementById('mondayResponsavelModal').classList.remove('active');
  });
  document.getElementById('mondayResponsavelModalOkBtn').addEventListener('click', async () => {
    const id = mondayResponsavelEditingId;
    if(!id) return;
    const responsavel = document.getElementById('mondayResponsavelModalInput').value;
    await dbPatchSilent(userPath('/MondayTasks/' + id), { responsavel });
    document.getElementById('mondayResponsavelModal').classList.remove('active');
    await renderMondayTasks();
  });

  /* Modal de sessões: lista editável de início/fim, com adição e remoção manual de linhas */
  let mondaySessionsEditingId = null;
  function mondaySessionRowHtml(sid, s){
    return `
      <div class="monday-session-row" data-sid="${sid}">
        <input type="datetime-local" class="monday-session-inicio" value="${isoToDatetimeLocal(s.inicio)}">
        <input type="datetime-local" class="monday-session-fim" value="${isoToDatetimeLocal(s.fim)}" placeholder="ainda rodando">
        <button type="button" data-remove-session-row title="Remover">×</button>
      </div>`;
  }
  function openMondaySessionsModal(id){
    mondaySessionsEditingId = id;
    const t = mondayTasksData[id];
    if(!t) return;
    document.getElementById('mondaySessionsModalTitle').textContent = t.nome;
    const rows = document.getElementById('mondaySessionsRows');
    const sessoes = Object.entries(t.sessoes || {}).sort((a, b) => (a[1].inicio || '').localeCompare(b[1].inicio || ''));
    rows.innerHTML = sessoes.length
      ? sessoes.map(([sid, s]) => mondaySessionRowHtml(sid, s)).join('')
      : '<p class="empty-state" style="margin:0 0 8px;">Nenhuma sessão ainda.</p>';
    wireMondaySessionRowRemovers();
    document.getElementById('mondaySessionsModal').classList.add('active');
  }
  function wireMondaySessionRowRemovers(){
    document.querySelectorAll('#mondaySessionsRows [data-remove-session-row]').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.monday-session-row').remove());
    });
  }
  document.getElementById('mondayAddSessionRowBtn').addEventListener('click', () => {
    const rows = document.getElementById('mondaySessionsRows');
    const empty = rows.querySelector('.empty-state');
    if(empty) empty.remove();
    const now = new Date().toISOString();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = mondaySessionRowHtml('new_' + newId(), { inicio: now, fim: now });
    rows.appendChild(wrapper.firstElementChild);
    wireMondaySessionRowRemovers();
  });
  document.getElementById('mondaySessionsModalCancelBtn').addEventListener('click', () => {
    document.getElementById('mondaySessionsModal').classList.remove('active');
  });
  document.getElementById('mondaySessionsModalOkBtn').addEventListener('click', async () => {
    const id = mondaySessionsEditingId;
    if(!id) return;
    const rowEls = document.querySelectorAll('#mondaySessionsRows .monday-session-row');
    const novasSessoes = {};
    let invalido = false;
    rowEls.forEach(row => {
      const sid = row.getAttribute('data-sid');
      const inicioVal = row.querySelector('.monday-session-inicio').value;
      const fimVal = row.querySelector('.monday-session-fim').value;
      if(!inicioVal){ invalido = true; return; }
      const finalSid = sid.startsWith('new_') ? newId() : sid;
      novasSessoes[finalSid] = { inicio: datetimeLocalToIso(inicioVal), fim: fimVal ? datetimeLocalToIso(fimVal) : '' };
    });
    if(invalido){ showAppMessage('Toda sessão precisa de um início.', 'error'); return; }
    await dbPutSilent(userPath('/MondayTasks/' + id + '/sessoes'), novasSessoes);
    document.getElementById('mondaySessionsModal').classList.remove('active');
    await renderMondayTasks();
  });

  /* ---------- HOJE (fila combinada: tarefas + treino/hábitos de hoje) ---------- */
  async function renderHojeQueue(){
    const today = todayStr();
    const dow = new Date().getDay(); // 0=domingo
    const [tasksData, academiaDias, skipsData] = await Promise.all([
      dbGet(userPath('/Tasks')) || {},
      dbGet(userPath('/AcademiaDias')) || {},
      dbGet(userPath('/HojeSkips/' + today)) || {}
    ]);
    const skips = skipsData || {};

    const todaysTasks = Object.entries(tasksData).filter(([id,t]) => t.date === today);
    const diaHoje = academiaDias[dow] || {};
    const exerciciosHoje = diaHoje.ativo ? Object.entries(diaHoje.exercicios || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0)) : [];
    const treinoHorario = diaHoje.horario || '';

    activities = [
      ...todaysTasks.map(([id,t]) => {
        const key = 'tarefa_' + id;
        return {
          kind:'tarefa', obj: 'Tarefa', name: t.name, time: t.horario || '', done: !!t.done, skipped: !!skips[key],
          onComplete: async () => { await dbPatch(userPath('/Tasks/' + id), { done:true }); },
          onSkip: async (skipped) => { await dbPatch(userPath('/HojeSkips/' + today), { [key]: skipped ? true : null }); }
        };
      }),
      ...exerciciosHoje.map(([eid,e]) => {
        const key = 'treino_' + eid;
        return {
          kind:'treino', obj: 'Academia', name: e.nome, time: treinoHorario, done: !!(e.doneDates && e.doneDates[today]), skipped: !!skips[key],
          onComplete: async () => { await dbPatch(userPath('/AcademiaDias/' + dow + '/exercicios/' + eid + '/doneDates'), { [today]: true }); },
          onSkip: async (skipped) => { await dbPatch(userPath('/HojeSkips/' + today), { [key]: skipped ? true : null }); }
        };
      })
    ];
    // Ordena pelo horário (quando definido) pra refletir a ordem real do dia;
    // itens sem horário ficam depois, mantendo a ordem relativa entre eles.
    activities.sort((a, b) => {
      if(a.time && b.time) return a.time.localeCompare(b.time);
      if(a.time && !b.time) return -1;
      if(!a.time && b.time) return 1;
      return 0;
    });
    updateHeroCard(); updateDayProgress(); updateFlowUI();
  }

  /* ---------- HOJE — painel "Água & creatina" ---------- */
  async function renderHojeHidratacao(){
    const el = document.getElementById('hojeHidratacaoList');
    const today = todayStr();
    const [metas, consumo] = await Promise.all([
      dbGet(userPath('/AcademiaMetas')) || {},
      dbGet(userPath('/AcademiaConsumo/' + today)) || {}
    ]);
    const metasData = metas || {};
    const consumoData = consumo || {};
    const aguaMeta = Number(metasData.aguaMl) || 0;
    const creatinaMeta = Number(metasData.creatinaG) || 0;
    const aguaAtual = Number(consumoData.aguaMl) || 0;
    const creatinaAtual = Number(consumoData.creatinaG) || 0;

    if(!aguaMeta && !creatinaMeta){
      el.innerHTML = '<p class="empty-state">Defina suas metas de água e creatina na Academia.</p>';
      return;
    }

    let html = '';
    if(aguaMeta){
      const pct = Math.min(100, Math.round((aguaAtual / aguaMeta) * 100));
      html += `
        <div class="hidra-row">
          <div class="hidra-top">
            <span>💧 Água ${aguaAtual >= aguaMeta ? '<span class="hidra-done-tag">meta batida</span>' : ''}</span>
            <span>${aguaAtual} / ${aguaMeta} ml</span>
          </div>
          <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct}%"></div></div>
          <div class="hidra-actions">
            <button class="hidra-btn" data-add-agua="200">+200ml</button>
            <button class="hidra-btn" data-add-agua="300">+300ml</button>
            <button class="hidra-btn" data-add-agua="500">+500ml</button>
            <button class="hidra-btn" data-reset-agua="1">zerar</button>
          </div>
        </div>`;
    }
    if(creatinaMeta){
      const pct = Math.min(100, Math.round((creatinaAtual / creatinaMeta) * 100));
      html += `
        <div class="hidra-row">
          <div class="hidra-top">
            <span>💊 Creatina ${creatinaAtual >= creatinaMeta ? '<span class="hidra-done-tag">tomada</span>' : ''}</span>
            <span>${creatinaAtual} / ${creatinaMeta} g</span>
          </div>
          <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct}%"></div></div>
          <div class="hidra-actions">
            <button class="hidra-btn" data-add-creatina="${creatinaMeta}">tomei a dose</button>
            <button class="hidra-btn" data-reset-creatina="1">zerar</button>
          </div>
        </div>`;
    }
    el.innerHTML = html;

    el.querySelectorAll('[data-add-agua]').forEach(btn => btn.addEventListener('click', async () => {
      const add = Number(btn.getAttribute('data-add-agua'));
      await dbPatch(userPath('/AcademiaConsumo/' + today), { aguaMl: aguaAtual + add });
      await renderHojeHidratacao();
    }));
    el.querySelectorAll('[data-reset-agua]').forEach(btn => btn.addEventListener('click', async () => {
      await dbPatch(userPath('/AcademiaConsumo/' + today), { aguaMl: 0 });
      await renderHojeHidratacao();
    }));
    el.querySelectorAll('[data-add-creatina]').forEach(btn => btn.addEventListener('click', async () => {
      const add = Number(btn.getAttribute('data-add-creatina'));
      await dbPatch(userPath('/AcademiaConsumo/' + today), { creatinaG: add });
      await renderHojeHidratacao();
    }));
    el.querySelectorAll('[data-reset-creatina]').forEach(btn => btn.addEventListener('click', async () => {
      await dbPatch(userPath('/AcademiaConsumo/' + today), { creatinaG: 0 });
      await renderHojeHidratacao();
    }));
  }

  /* ---------- HOJE — painel "Insulina" (ligado ao Plano Alimentar: Café da Manhã, Almoço, Jantar) ---------- */
  const INSULINA_REFEICOES = [
    { key:'Cafe', label:'Insulina — Café da Manhã' },
    { key:'Almoco', label:'Insulina — Almoço' },
    { key:'Jantar', label:'Insulina — Jantar' }
  ];
  async function renderHojeInsulina(){
    const el = document.getElementById('hojeInsulinaList');
    if(!el) return;
    const today = todayStr();
    const [config, consumo] = await Promise.all([
      dbGet(userPath('/PlanoAlimentarConfig')) || {},
      dbGet(userPath('/AcademiaConsumo/' + today)) || {}
    ]);
    const configData = config || {};
    const consumoData = consumo || {};
    const insulinaMetas = INSULINA_REFEICOES.map(r => ({ ...r, meta: Number(configData['insulina' + r.key + 'Ui']) || 0, atual: Number(consumoData['insulina' + r.key + 'Ui']) || 0 }));
    const ativas = insulinaMetas.filter(r => r.meta > 0);
    if(!ativas.length){ el.innerHTML = ''; return; }

    el.innerHTML = `
      <p class="obj-group-sub-label" style="margin:0 0 10px;">Insulina de hoje</p>
      ${ativas.map(r => {
        const pct = Math.min(100, Math.round((r.atual / r.meta) * 100));
        return `
        <div class="hidra-row">
          <div class="hidra-top">
            <span>💉 ${r.label} ${r.atual >= r.meta ? '<span class="hidra-done-tag">tomada</span>' : ''}</span>
            <span>${r.atual} / ${r.meta} UI</span>
          </div>
          <div class="obj-bar-track"><div class="obj-bar-fill" style="width:${pct}%"></div></div>
          <div class="hidra-actions">
            <button class="hidra-btn" data-add-insulina="${r.key}" data-insulina-meta="${r.meta}">tomei a dose</button>
            <button class="hidra-btn" data-reset-insulina="${r.key}">zerar</button>
          </div>
        </div>`;
      }).join('')}`;

    el.querySelectorAll('[data-add-insulina]').forEach(btn => btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-add-insulina');
      const meta = Number(btn.getAttribute('data-insulina-meta'));
      await dbPatch(userPath('/AcademiaConsumo/' + today), { ['insulina' + key + 'Ui']: meta });
      await renderHojeInsulina();
    }));
    el.querySelectorAll('[data-reset-insulina]').forEach(btn => btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-reset-insulina');
      await dbPatch(userPath('/AcademiaConsumo/' + today), { ['insulina' + key + 'Ui']: 0 });
      await renderHojeInsulina();
    }));
  }


  /* ---------- HOJE — painel "Avisos & eventos" (unificado) ----------
     Um único container: mostra os eventos de hoje e os avisos ativos juntos,
     com uma divisória apenas quando os dois tipos coexistem. Só mostra a
     mensagem de "nada por hoje" quando os dois estiverem realmente vazios. */
  async function renderHojeAvisosEventos(){
    const el = document.getElementById('hojeAvisosEventosList');
    const [eventsRaw, avisosRaw] = await Promise.all([
      dbGet(userPath('/Events')),
      dbGet(userPath('/Avisos'))
    ]);
    const eventsData = eventsRaw || {};
    const avisosData = avisosRaw || {};
    const today = todayStr();
    const todaysEvents = Object.values(eventsData).filter(ev => ev.date === today).sort((a,b) => (a.time||'').localeCompare(b.time||''));
    const ativos = Object.values(avisosData).filter(a => a.active !== false);

    if(!todaysEvents.length && !ativos.length){
      el.innerHTML = '<p class="empty-state">Nenhum aviso ou evento por hoje.</p>';
      return;
    }

    const eventsHtml = todaysEvents.map(ev => `<div class="event-row"><div class="event-time">${ev.allDay?'dia todo':(ev.time||'—')}</div><div class="event-title">${escapeHtml(ev.title)}</div></div>`).join('');
    const avisosHtml = ativos.map(a => `<div class="notice" style="margin-top:0;">✳ ${escapeHtml(a.text)}</div>`).join('');
    const divider = (todaysEvents.length && ativos.length) ? '<div style="height:1px; background:var(--line); margin:8px 0;"></div>' : '';
    el.innerHTML = eventsHtml + divider + avisosHtml;
  }

  async function renderHojeHeader(){
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const profile = await dbGet(userPath('/Profile')) || {};
    userDisplayName = (profile.DisplayName || '').trim();
    const shownName = userDisplayName || (session && session.email ? session.email.split('@')[0] : '');
    document.getElementById('hojeEyebrow').textContent = greeting + (shownName ? ', ' + shownName : '');
    document.getElementById('hojeDatePill').textContent = fmtDatePill(now);
  }

  /* ---------- FLUÊNCIA — cards respondidos hoje (dados reais de /Cards, meta: 30/dia) ---------- */
  const FLUENCIA_DAILY_GOAL = 30;
  const FLUENCIA_RING_CIRC = 2 * Math.PI * 42; // r=42 no SVG do anel
  const FLUENCIA_WEEK_LABELS = ['D','S','T','Q','Q','S','S'];

  function dateKey(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  async function renderFluenciaToday(){
    const tag = document.getElementById('fluenciaTodayTag');
    const note = document.getElementById('fluenciaTodayNote');
    const ringFill = document.getElementById('fluenciaRingFill');
    const ringCount = document.getElementById('fluenciaRingCount');
    const weekEl = document.getElementById('fluenciaWeek');
    const streakEl = document.getElementById('fluenciaStreak');
    const streakText = document.getElementById('fluenciaStreakText');

    try{
      const cards = await dbGet(userPath('/Cards')) || {};

      // Conta cards respondidos por dia (chave 'YYYY-MM-DD') para os últimos 7 dias + histórico p/ streak
      const countsByDay = {};
      Object.values(cards).forEach(card => {
        (card.History || []).forEach(h => {
          if(!h || typeof h.Date !== 'string') return;
          const d = new Date(h.Date);
          if(isNaN(d)) return;
          const key = dateKey(d);
          countsByDay[key] = (countsByDay[key] || 0) + 1;
        });
      });

      const today = new Date();
      const todayKey = dateKey(today);
      const count = countsByDay[todayKey] || 0;

      // Anel de progresso
      const pct = Math.min(1, count / FLUENCIA_DAILY_GOAL);
      const goalHit = count >= FLUENCIA_DAILY_GOAL;
      ringFill.style.strokeDashoffset = String(FLUENCIA_RING_CIRC * (1 - pct));
      ringFill.classList.toggle('goal-hit', goalHit);
      ringCount.textContent = count;
      tag.textContent = '/ ' + FLUENCIA_DAILY_GOAL;

      // Semana atual, começando no domingo (getDay()===0) até sábado — em vez
      // dos últimos 7 dias corridos, para bater com o calendário da semana.
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      weekEl.innerHTML = '';
      for(let i = 0; i < 7; i++){
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const key = dateKey(d);
        const dayCount = countsByDay[key] || 0;
        const isToday = key === todayKey;
        let dotClass = 'fluencia-day-dot';
        if(dayCount >= FLUENCIA_DAILY_GOAL) dotClass += ' done';
        else if(dayCount > 0) dotClass += ' partial';
        if(isToday) dotClass += ' today';
        const dayEl = document.createElement('div');
        dayEl.className = 'fluencia-day';
        dayEl.title = fmtShortDate(key) + ' · ' + dayCount + ' cards';
        dayEl.innerHTML = `<div class="${dotClass}"></div><span class="fluencia-day-label">${FLUENCIA_WEEK_LABELS[d.getDay()]}</span>`;
        weekEl.appendChild(dayEl);
      }

      // Streak de dias seguidos batendo a meta (conta a partir de hoje; se hoje ainda
      // não bateu a meta, considera a partir de ontem para não zerar cedo demais)
      let streak = 0;
      let cursor = new Date(today);
      if(!goalHit) cursor.setDate(cursor.getDate() - 1);
      while((countsByDay[dateKey(cursor)] || 0) >= FLUENCIA_DAILY_GOAL){
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }
      streakEl.classList.toggle('active', streak > 0);
      streakText.textContent = streak > 0
        ? streak + (streak === 1 ? ' dia seguido na meta' : ' dias seguidos na meta')
        : 'nenhuma sequência ativa';

      // Nota de status
      note.classList.toggle('hit', goalHit);
      note.textContent = goalHit
        ? 'Meta batida — ' + count + ' cards respondidos hoje. 🎉'
        : (FLUENCIA_DAILY_GOAL - count) + ' cards restantes para bater a meta de hoje.';
    }catch(err){
      note.textContent = 'Não foi possível carregar os dados do Fluência.';
    }
  }

  /* ---------- FLUÊNCIA ---------- */
  const FLUENCIA_URL = 'https://fluencia.guilherme-oliveira.com';
  function renderFluencia(){
    const wrap = document.getElementById('fluenciaFrameWrap');
    const note = document.getElementById('fluenciaEmbedNote');
    const openBtn = document.getElementById('fluenciaOpenTabBtn');
    // Tenta repassar o e-mail da sessão do Life OS para o Fluência via querystring,
    // como atalho de login caso o app suporte esse parâmetro. Como são domínios
    // diferentes, não é possível autenticar de fato por aqui — mas como o iframe
    // aponta sempre para o mesmo domínio, uma vez logado no Fluência o cookie de
    // sessão dele é mantido pelo navegador e o login é pulado automaticamente
    // nas próximas visitas.
    const email = session && session.email ? session.email : '';
    const src = FLUENCIA_URL + (email ? ('?email=' + encodeURIComponent(email)) : '');
    openBtn.href = src;
    note.textContent = 'Tentando carregar aqui dentro — se não aparecer, use "Abrir em nova aba".';

    // sandbox sem 'allow-top-navigation' irrestrito: impede que o site embutido
    // navegue a aba principal inteira, mas libera navegação por ação do próprio
    // usuário (ex: um redirect de login) e popups de login (ex: OAuth), que são
    // causas comuns de um iframe parecer "não abrir".
    wrap.innerHTML = `<iframe id="fluenciaIframe" src="${escapeHtml(src)}" title="Fluência"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals"
      referrerpolicy="no-referrer-when-downgrade"></iframe>`;

    // Se o site embutido bloquear o próprio carregamento em iframe (por exemplo,
    // via cabeçalho X-Frame-Options / Content-Security-Policy: frame-ancestors —
    // uma configuração do servidor da Fluência, fora do alcance deste arquivo),
    // o navegador não emite um erro que dá para capturar de forma confiável.
    // Por isso, após alguns segundos, reforçamos a opção de abrir em nova aba
    // com uma mensagem mais clara, para não deixar a pessoa presa a uma tela em branco.
    clearTimeout(renderFluencia._fallbackTimer);
    renderFluencia._fallbackTimer = setTimeout(() => {
      if(document.getElementById('fluenciaIframe')){
        note.textContent = 'Se a tela acima estiver em branco, é porque a Fluência não permite ser exibida dentro de outro site — abra em nova aba.';
      }
    }, 4000);
  }

  /* ---------- BATERIA ---------- */
  const BATERIA_URL = 'https://drum.guilherme-oliveira.com';
  function renderBateria(){
    const wrap = document.getElementById('bateriaFrameWrap');
    const note = document.getElementById('bateriaEmbedNote');
    const openBtn = document.getElementById('bateriaOpenTabBtn');
    const email = session && session.email ? session.email : '';
    const src = BATERIA_URL + (email ? ('?email=' + encodeURIComponent(email)) : '');
    openBtn.href = src;
    note.textContent = 'Tentando carregar aqui dentro — se não aparecer, use "Abrir em nova aba".';
    wrap.innerHTML = `<iframe id="bateriaIframe" src="${escapeHtml(src)}" title="Bateria"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-modals"
      referrerpolicy="no-referrer-when-downgrade"></iframe>`;
    clearTimeout(renderBateria._fallbackTimer);
    renderBateria._fallbackTimer = setTimeout(() => {
      if(document.getElementById('bateriaIframe')){
        note.textContent = 'Se a tela acima estiver em branco, é porque a Bateria não permite ser exibida dentro de outro site — abra em nova aba.';
      }
    }, 4000);
  }

  /* ---------- BOOT ---------- */
  // Antes, se QUALQUER seção falhasse ao buscar dados no Firebase (token expirado,
  // rede instável, regra de segurança negando, etc.), o Promise.all simplesmente
  // deixava aquela seção travada no "Carregando..." para sempre — sem nenhum erro
  // visível, causando a sensação de "loading infinito" após o login. Cada seção
  // agora é isolada: se uma falhar, só ela mostra um erro com botão de retry, e
  // o restante do app carrega normalmente.
  function renderErrorState(containerIds, label, retryFn){
    const ids = Array.isArray(containerIds) ? containerIds : [containerIds];
    ids.forEach(id => {
      if(!id) return;
      const el = document.getElementById(id);
      if(!el) return;
      el.innerHTML = `<p class="empty-state" style="color:#c0392b;">
        Não foi possível carregar ${escapeHtml(label)}.
        <a href="#" data-retry-section style="text-decoration:underline; cursor:pointer;">Tentar novamente</a>
      </p>`;
      const link = el.querySelector('[data-retry-section]');
      if(link){
        link.addEventListener('click', (e) => { e.preventDefault(); guardRender(retryFn, label, containerIds); });
      }
    });
  }
  async function guardRender(fn, label, containerIds){
    try{
      await fn();
    }catch(err){
      console.error('Falha ao carregar "' + label + '":', err);
      renderErrorState(containerIds, label, fn);
    }
  }
  async function bootApp(){
    await renderHojeHeader();
    renderSidebarDate();
    const configEmailEl = document.getElementById('configAccountEmail');
    if(configEmailEl) configEmailEl.textContent = (session && session.email) || '—';
    const configNameEl = document.getElementById('configDisplayNameInput');
    if(configNameEl) configNameEl.value = userDisplayName;
    const configBoardNameEl = document.getElementById('configBoardNameInput');
    if(configBoardNameEl) configBoardNameEl.value = (myBoards[session.uid] && myBoards[session.uid].name) || 'Meu Quadro';
    await loadCasaMembros();
    loadCorPrincipal();
    loadDiarioTheme();
    renderConfigCasaMembros();
    populateCasaResponsavelSelects();
    await Promise.allSettled([
      guardRender(renderHojeQueue, 'a fila de hoje', []),
      guardRender(renderHojeAvisosEventos, 'os avisos e eventos', 'hojeAvisosEventosList'),
      guardRender(renderHojeHidratacao, 'água & creatina', 'hojeHidratacaoList'),
      guardRender(renderHojePlanoAlimentar, 'o plano alimentar de hoje', 'hojePlanoAlimentarList'),
      guardRender(renderHojeInsulina, 'a insulina de hoje', 'hojeInsulinaList'),
      guardRender(renderHojeObjetivos, 'os objetivos de hoje', 'hojeObjetivosList'),
      guardRender(renderRotinaHoje, 'a rotina de hoje', 'rotinaHojeUpcoming'),
      guardRender(renderHojeTimeline, 'a linha do tempo de hoje', 'hojeTimeline24hTrack'),
      guardRender(renderFluenciaToday, 'o Fluência de hoje', []),
      guardRender(renderInbox, 'a Inbox', 'inboxList'),
      guardRender(renderRevisao, 'a Revisão', 'revisaoEmptyState'),
      guardRender(renderStorage, 'as Gavetas', 'gavetaList'),
      guardRender(renderStorageRevisao, 'a Revisão de Gavetas', 'storageRevisaoList'),
      guardRender(renderAgenda, 'a Agenda', 'agendaList'),
      guardRender(renderTasks, 'as Tarefas', []),
      guardRender(renderTaskGroups, 'os grupos de tarefas', 'taskGroupsList'),
      guardRender(renderMondayTasks, 'o Monday', 'mondayList'),
      guardRender(renderAcademia, 'a Academia', 'academiaDaysGrid'),
      guardRender(renderDiario, 'o Diário', 'diarioEntriesList'),
      guardRender(renderPlanoAlimentar, 'o Plano Alimentar', 'paDaysGrid'),
      guardRender(renderRotina, 'a Rotina', 'rotinaDaysGrid'),
      guardRender(renderFluencia, 'o Fluência', []),
      guardRender(renderBateria, 'a Bateria', []),
      guardRender(renderFinancas, 'as Finanças', []),
      guardRender(renderCasaAtividades, 'as atividades da Casa', 'casaAtividadesList'),
      guardRender(renderCasaRegras, 'as regras da Casa', 'casaRegrasList'),
      guardRender(renderCasaErros, 'os erros da Casa', 'casaErrosList'),
      guardRender(renderObjetivos, 'os Objetivos', 'objetivosList'),
      guardRender(renderVisionBoard, 'o Vision Board', 'visionBoard')
    ]);
    // Trava de segurança: garante que o overlay global de loading nunca fique
    // travado após o boot, independentemente de qualquer erro acima.
    loadingDepth = 0;
    globalLoadingEl.classList.remove('active');
  }

  (async function init(){
    const restored = loadSessionFromStorage();
    if(restored){
      session = restored;
      activeDataUid = session.uid;
      currentBoardId = session.uid;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appShell').style.display = '';
      await loadOpenAiKey();
      await initBoards();
      await bootApp();
      checkPendingInvites();
    }
  })();
