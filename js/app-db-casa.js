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

  /* ---------- Cache de leitura ----------
     Antes, cada função de render ia à rede do zero: /Gavetas era buscado em 10
     lugares, /VisionBoard em 5, /objetivos em 3. O cache guarda cada caminho por
     um tempo curto e é invalidado por qualquer escrita que o toque, então a
     leitura seguinte a uma escrita sempre vê o dado novo.

     A invalidação percorre a árvore nos dois sentidos: escrever em
     /users/x/Tasks/abc invalida também /users/x/Tasks (ancestral), e escrever em
     /users/x/Tasks invalida /users/x/Tasks/abc (descendente). */
  const DB_CACHE_TTL_MS = 30000;
  const dbCache = new Map(); // path -> { at, value }

  function dbCacheClear(){ dbCache.clear(); }
  function dbCacheInvalidate(path){
    for(const key of Array.from(dbCache.keys())){
      if(key === path || key.startsWith(path + '/') || path.startsWith(key + '/')){
        dbCache.delete(key);
      }
    }
  }
  // Os valores voltam clonados: várias telas leem o mesmo caminho e algumas
  // mutam o que recebem — sem o clone, uma contaminaria as outras.
  function cloneValue(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* Ponto único de saída de rede: renova o token, monta a URL e trata o erro.
     Toda função db* abaixo passa por aqui. */
  async function dbFetch(path, options, errLabel){
    await ensureFreshToken();
    const res = await fetchWithTimeout(buildUrl(path), options);
    if(!res.ok) throw new Error(errLabel + ' ' + path);
    return await res.json();
  }
  function jsonBody(data){
    return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  }

  async function dbGet(path, opts){
    const skipCache = opts && opts.fresh;
    if(!skipCache){
      const hit = dbCache.get(path);
      if(hit && (Date.now() - hit.at) < DB_CACHE_TTL_MS) return cloneValue(hit.value);
    }
    showLoading('Carregando...');
    try{
      const value = await dbFetch(path, undefined, 'Erro ao ler');
      dbCache.set(path, { at: Date.now(), value });
      return cloneValue(value);
    } finally { hideLoading(); }
  }
  async function dbPut(path, data){
    showLoading('Salvando...');
    try{
      dbCacheInvalidate(path);
      return await dbFetch(path, Object.assign({ method:'PUT' }, jsonBody(data)), 'Erro ao salvar');
    } finally { hideLoading(); }
  }
  async function dbPatch(path, data){
    showLoading('Salvando...');
    try{
      dbCacheInvalidate(path);
      return await dbFetch(path, Object.assign({ method:'PATCH' }, jsonBody(data)), 'Erro ao atualizar');
    } finally { hideLoading(); }
  }
  // Mesma coisa que dbPatch, mas sem acionar o overlay de loading global — para
  // ajustes instantâneos de UI (ex: minimizar/maximizar um card) que não devem
  // travar a tela esperando a rede.
  async function dbPatchSilent(path, data){
    dbCacheInvalidate(path);
    return await dbFetch(path, Object.assign({ method:'PATCH' }, jsonBody(data)), 'Erro ao atualizar');
  }
  async function dbPutSilent(path, data){
    dbCacheInvalidate(path);
    return await dbFetch(path, Object.assign({ method:'PUT' }, jsonBody(data)), 'Erro ao salvar');
  }
  async function dbDeleteSilent(path){
    dbCacheInvalidate(path);
    return await dbFetch(path, { method:'DELETE' }, 'Erro ao remover');
  }
  async function dbDelete(path){
    showLoading('Removendo...');
    try{
      dbCacheInvalidate(path);
      return await dbFetch(path, { method:'DELETE' }, 'Erro ao remover');
    } finally { hideLoading(); }
  }
  function userPath(sub){ return '/users/' + (activeDataUid || session.uid) + sub; }

  /* ---------- Chamada à IA (Claude via Cloud Function) ----------
     Ponto único para as 4 features de IA: Revisão de Capturas, reorganização de
     Gavetas, padrões em Decisões e Perguntar ao LifeOS.

     Não existe caminho direto do navegador de propósito. Chamar a Anthropic
     daqui exigiria mandar a chave para o cliente — que é exatamente o problema
     que este proxy resolve. Sem a function publicada, as features de IA ficam
     desligadas e avisam; o resto do app funciona normalmente.

     Preencha IA_PROXY_URL com a URL que `firebase deploy --only functions`
     imprime (instruções completas no topo de functions/index.js). */
  // Publicada em basehub-135f5 (onde o Blaze já está ativo — não em
  // anki-71f4f, que é só onde os dados moram; ver getAnkiApp() em
  // functions/index.js pra entender essa separação):
  //   firebase deploy --only functions:iaProxy --project basehub-135f5
  const IA_PROXY_URL = 'https://southamerica-east1-basehub-135f5.cloudfunctions.net/iaProxy';

  /* system: as instruções (papel, regras, formato de saída)
     prompt: o que se pede nesta chamada
     O Claude separa os dois — `system` é parâmetro próprio, e `messages` só
     aceita user/assistant. Mandar as instruções como uma mensagem de sistema,
     no formato da OpenAI, seria rejeitado. */
  async function chamarIA(system, prompt){
    if(!IA_PROXY_URL){
      throw new Error('As features de IA precisam da Cloud Function publicada. ' +
                      'Veja as instruções em functions/index.js.');
    }
    await ensureFreshToken();
    const res = await fetchWithTimeout(IA_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (session && session.idToken)
      },
      body: JSON.stringify({ system: system || '', prompt: prompt || '' })
    }, 120000); // esforço alto pensa mais: o teto de 15s padrão não serve aqui
    let data;
    try{ data = await res.json(); }
    catch(e){ throw new Error('A IA devolveu uma resposta ilegível.'); }
    if(!res.ok) throw new Error(data.error || 'A IA não respondeu.');
    return data.text;
  }
  // A IA às vezes cerca a resposta com ```json ... ``` mesmo quando pedimos JSON puro.
  function extractJson(text){
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  }

  /* ---------- Quadros (Grupos/Famílias) ----------
     Cada pessoa tem um Quadro próprio, identificado pelo seu próprio uid.
     Convidar alguém dá acesso de LEITURA/ESCRITA a /users/{seuUid}/... (com base nas
     permissões escolhidas por tela). Ao trocar de Quadro no seletor, activeDataUid
     passa a ser o uid do dono do quadro selecionado, e todas as chamadas userPath()
     do resto do app passam a ler/gravar os dados daquele quadro automaticamente. */
  const BOARD_VIEW_OPTIONS = [
    { key:'casa', label:'Casa' },
    { key:'manutencao', label:'Manutenção' },
    { key:'retrospectiva', label:'Retrospectiva' },
    { key:'hoje', label:'Hoje' },
    { key:'rotina', label:'Rotina' },
    { key:'tarefas', label:'Tarefas' },
    { key:'monday', label:'Planejamento' },
    { key:'agenda', label:'Agenda' },
    { key:'presentes', label:'Presentes & datas' },
    { key:'storage', label:'Notas' },
    { key:'academia', label:'Academia' },
    { key:'diario', label:'Diário' },
    { key:'planoalimentar', label:'Plano Alimentar' },
    { key:'objetivos', label:'Objetivos' },
    { key:'visionboard', label:'Vision Board' },
    { key:'financas', label:'Finanças' },
    { key:'decisoes', label:'Decisões' },
    { key:'timelineobjetivos', label:'Timeline' },
    { key:'fluencia', label:'Fluência' },
    { key:'bateria', label:'Bateria' },
    { key:'supermercado', label:'Supermercado' },
    { key:'calculos', label:'Cálculos' },
    { key:'empreendedorismo', label:'Empreendedorismo' }
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

  // Telas que não são "dados de um Quadro" — são utilitários pessoais
  // (configurações da própria conta, o chat de IA) — por isso ficam sempre
  // visíveis, mesmo vendo o Quadro de outra pessoa.
  const NAV_SEMPRE_VISIVEL = ['config', 'busca'];
  function applyBoardPermissionsToNav(){
    const isOwn = currentBoardId === session.uid;
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      const key = item.getAttribute('data-view');
      if(isOwn || NAV_SEMPRE_VISIVEL.includes(key)){ item.style.display = ''; return; }
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
    dbCacheClear();
    markAllViewsStale(); // o Quadro novo tem outros dados: tudo precisa redesenhar
    renderBoardSwitcher();
    applyBoardPermissionsToNav();
    await bootApp();
  }

  async function initBoards(){
    await ensureOwnBoard();
    await loadMyBoards();
    const saved = localStorage.getItem(BOARD_ID_STORAGE_KEY);
    if(saved && myBoards[saved]){
      currentBoardId = saved;
    }else{
      // Sem preferência salva (primeiro login neste aparelho): se a pessoa é
      // membro do Quadro de alguém, abre lá em vez do próprio Quadro vazio —
      // é o caso do casal, onde um é dono e o outro só participa.
      const quadroCompartilhado = Object.entries(myBoards).find(([id, b]) => b.role === 'member');
      currentBoardId = quadroCompartilhado ? quadroCompartilhado[0] : session.uid;
    }
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
    const inviteId = session.uid; // chave = dono do Quadro, não aleatória — as Database Rules precisam achar o convite sem conhecer o id
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
    // String(): casaMembros é { id: nome }, mas se um registro vier como objeto
    // (formato antigo ou dado torto), o localeCompare estoura — e como esta
    // função roda fora do guardRender, o boot inteiro morria e TODAS as telas
    // ficavam presas em "Carregando...".
    const nomes = Object.entries(casaMembros)
      .filter(([, nome]) => nome != null && typeof nome !== 'object')
      .sort((a,b) => String(a[1]).localeCompare(String(b[1])));
    const atividadeSelect = document.getElementById('casaAtividadeResponsavelInput');
    const regraSelect = document.getElementById('casaRegraResponsavelInput');
    const mondaySelect = document.getElementById('planResponsavelModalInput');
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
    // String(): casaMembros é { id: nome }, mas se um registro vier como objeto
    // (formato antigo ou dado torto), o localeCompare estoura — e como esta
    // função roda fora do guardRender, o boot inteiro morria e TODAS as telas
    // ficavam presas em "Carregando...".
    const nomes = Object.entries(casaMembros)
      .filter(([, nome]) => nome != null && typeof nome !== 'object')
      .sort((a,b) => String(a[1]).localeCompare(String(b[1])));
    if(!nomes.length){ wrap.innerHTML = '<p class="empty-state" style="margin:0;">Nenhuma pessoa cadastrada — adicione quem mora na casa aqui pra poder atribuir atividades e regras a alguém.</p>'; return; }
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

  /* Atividades da casa eram só criar e excluir — não havia como dizer "fiz".
     Agora cada uma guarda `feitaEm` (a data da última vez) e volta a aparecer
     como pendente conforme a frequência. É isso que permite dar XP por elas. */
  const CASA_FREQ_DIAS = { diaria: 1, semanal: 7, quinzenal: 14, mensal: 30 };

  // Dia(s) da semana é opcional e vale pra qualquer frequência: quando marcado,
  // troca o "conta dias desde a última vez" por "fica pendente no(s) dia(s)
  // certo(s)" — ex: uma atividade semanal trava sempre na segunda-feira, em vez
  // de deslizar pra qualquer dia em que ela tenha sido feita por último.
  const CASA_DIAS_SEMANA_NOMES = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  function casaDiasSemanaTexto(dias){
    if(!dias || !dias.length) return '';
    const ordenados = [...dias].sort((a, b) => a - b);
    const nomes = ordenados.map(d => CASA_DIAS_SEMANA_NOMES[d].replace('-feira', ''));
    if(nomes.length === 1){
      const ehFimDeSemana = ordenados[0] === 0 || ordenados[0] === 6; // domingo/sábado são masculinos: "todo domingo"
      return (ehFimDeSemana ? 'todo ' : 'toda ') + nomes[0];
    }
    return 'toda ' + nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  }

  function casaDiasDesde(dataStr){
    if(!dataStr) return Infinity;
    const d = new Date(dataStr + 'T00:00:00');
    if(isNaN(d)) return Infinity;
    return Math.floor((new Date(todayStr() + 'T00:00:00') - d) / 86400000);
  }
  // Uma atividade está pendente quando já passou o intervalo da frequência
  // desde a última vez que foi marcada — ou, se tem dia(s) da semana fixo(s),
  // quando hoje é um desses dias e ainda não foi feita hoje.
  function casaAtividadeStatus(a){
    const dias = casaDiasDesde(a.feitaEm);
    if(a.diasSemana && a.diasSemana.length){
      if(dias === 0) return { pendente: false, texto: 'feita hoje' };
      const hojeSemana = new Date(todayStr() + 'T00:00:00').getDay();
      if(a.diasSemana.includes(hojeSemana)) return { pendente: true, texto: 'pendente hoje' };
      return { pendente: false, texto: dias === Infinity ? 'ainda não feita' : 'feita há ' + dias + (dias === 1 ? ' dia' : ' dias') };
    }
    const intervalo = CASA_FREQ_DIAS[a.frequencia] || 1;
    if(dias === Infinity) return { pendente: true, texto: 'nunca feita' };
    if(dias >= intervalo) return { pendente: true, texto: dias === 0 ? 'pendente' : 'pendente há ' + dias + (dias === 1 ? ' dia' : ' dias') };
    const faltam = intervalo - dias;
    return {
      pendente: false,
      texto: dias === 0 ? 'feita hoje' : 'feita há ' + dias + (dias === 1 ? ' dia' : ' dias'),
      proxima: faltam === 1 ? 'volta amanhã' : 'volta em ' + faltam + ' dias'
    };
  }

  async function renderCasaAtividades(){
    const el = document.getElementById('casaAtividadesList');
    const data = await dbGet(userPath('/casa/atividades')) || {};
    const entries = Object.entries(data).sort((a,b) => {
      // Pendentes primeiro: é o que precisa de ação hoje.
      const pa = casaAtividadeStatus(a[1]).pendente ? 0 : 1;
      const pb = casaAtividadeStatus(b[1]).pendente ? 0 : 1;
      return pa - pb || (a[1].criadoEm||'').localeCompare(b[1].criadoEm||'');
    });
    if(!entries.length){ el.innerHTML = '<p class="empty-state">Nenhuma atividade da casa cadastrada. Toque em "+ Nova atividade" pra criar uma tarefa recorrente (ex: tirar o lixo, lavar louça).</p>'; return; }
    el.innerHTML = entries.map(([id, a]) => {
      const st = casaAtividadeStatus(a);
      const diasTexto = casaDiasSemanaTexto(a.diasSemana);
      return `
      <div class="casa-card ${st.pendente ? '' : 'casa-card-feita'}" data-id="${id}">
        <button type="button" class="casa-check" data-done-atividade="${id}"
                aria-label="${st.pendente ? 'Marcar como feita' : 'Desmarcar'}"
                title="${st.pendente ? 'Marcar como feita' : 'Desmarcar'}">${st.pendente ? '' : '✓'}</button>
        <div class="casa-card-main">
          <p class="casa-card-title">${escapeHtml(a.nome)}</p>
          <div class="casa-card-meta">
            <span>${diasTexto ? escapeHtml(diasTexto) : (CASA_FREQ_LABELS[a.frequencia] || a.frequencia || '')}</span>
            ${a.responsavel ? `<span>· ${escapeHtml(a.responsavel)}</span>` : ''}
            <span class="casa-status ${st.pendente ? 'casa-status-pendente' : ''}">· ${escapeHtml(st.texto)}</span>
            ${st.proxima ? `<span class="casa-status">· ${escapeHtml(st.proxima)}</span>` : ''}
          </div>
        </div>
        <div class="casa-card-actions">
          <button data-edit-atividade="${id}">editar</button>
          <button data-del-atividade="${id}">excluir</button>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('[data-done-atividade]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-done-atividade');
      const a = data[id];
      if(!a) return;
      const st = casaAtividadeStatus(a);
      if(st.pendente){
        const hoje = todayStr();
        await dbPatch(userPath('/casa/atividades/' + id), { feitaEm: hoje });
      }else{
        await dbPatch(userPath('/casa/atividades/' + id), { feitaEm: null });
      }
      await renderCasaAtividades();
    }));

    el.querySelectorAll('[data-edit-atividade]').forEach(btn => btn.addEventListener('click', () => {
      casaAbrirAtividadeModal(btn.getAttribute('data-edit-atividade'), data[btn.getAttribute('data-edit-atividade')]);
    }));

    el.querySelectorAll('[data-del-atividade]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta atividade?')) return;
      await dbDelete(userPath('/casa/atividades/' + btn.getAttribute('data-del-atividade')));
      await renderCasaAtividades();
    }));
  }

  let casaAtividadeEditandoId = null;
  function casaAbrirAtividadeModal(id, a){
    casaAtividadeEditandoId = id || null;
    document.getElementById('casaAtividadeModalTitle').textContent = id ? 'Editar atividade da casa' : 'Nova atividade da casa';
    document.getElementById('casaAtividadeOkBtn').textContent = id ? 'Salvar' : 'Adicionar';
    document.getElementById('casaAtividadeNomeInput').value = a ? a.nome : '';
    document.getElementById('casaAtividadeFrequenciaInput').value = a ? a.frequencia : 'semanal';
    populateCasaResponsavelSelects();
    document.getElementById('casaAtividadeResponsavelInput').value = a ? (a.responsavel || '') : '';
    const diasSelecionados = new Set((a && a.diasSemana) || []);
    document.querySelectorAll('#casaAtividadeDiasSemana [data-dia]').forEach(chip => {
      chip.classList.toggle('active', diasSelecionados.has(Number(chip.getAttribute('data-dia'))));
    });
    document.getElementById('casaAtividadeModal').classList.add('active');
  }
  document.getElementById('casaAddAtividadeBtn').addEventListener('click', () => casaAbrirAtividadeModal(null, null));
  document.querySelectorAll('#casaAtividadeDiasSemana [data-dia]').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
  });
  document.getElementById('casaAtividadeCancelBtn').addEventListener('click', () => document.getElementById('casaAtividadeModal').classList.remove('active'));
  document.getElementById('casaAtividadeOkBtn').addEventListener('click', async () => {
    const nome = document.getElementById('casaAtividadeNomeInput').value.trim();
    if(!nome){ showAppMessage('Digite o nome da atividade.', 'error'); return; }
    const frequencia = document.getElementById('casaAtividadeFrequenciaInput').value;
    const responsavel = document.getElementById('casaAtividadeResponsavelInput').value.trim();
    const diasSemana = Array.from(document.querySelectorAll('#casaAtividadeDiasSemana [data-dia].active'))
      .map(chip => Number(chip.getAttribute('data-dia')));
    const patch = { nome, frequencia, responsavel, diasSemana: diasSemana.length ? diasSemana : null };
    if(casaAtividadeEditandoId) await dbPatch(userPath('/casa/atividades/' + casaAtividadeEditandoId), patch);
    else await dbPut(userPath('/casa/atividades/' + newId()), { ...patch, criadoEm: new Date().toISOString() });
    document.getElementById('casaAtividadeModal').classList.remove('active');
    await renderCasaAtividades();
  });

  async function renderCasaRegras(){
    const el = document.getElementById('casaRegrasList');
    const data = await dbGet(userPath('/casa/regras')) || {};
    const entries = Object.entries(data).sort((a,b) => (a[1].criadoEm||'').localeCompare(b[1].criadoEm||''));
    if(!entries.length){ el.innerHTML = '<p class="empty-state">Nenhuma regra da casa cadastrada. Toque em "+ Nova regra" pra registrar algo combinado entre vocês.</p>'; return; }
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


  /* ---------- FINANÇAS (o mês a mês da planilha "Financeiro", agora nativo) ----------
     O encadeamento é o mesmo da planilha: a fatura final do Mercado Pago de um mês
     vira a "sobra do mês passado" do mês seguinte, e o que foi empurrado pra frente
     (empréstimo + taxa) volta como estimativa na fatura do cartão. Só as linhas de
     verdade são digitadas — sobra, fatura, empréstimo e totais são calculados.

     Linhas podem apontar para um item de "Valores" (refId) em vez de ter valor
     próprio: é o equivalente ao =$U$14 da planilha, um lugar só pra mudar o aluguel
     e todos os meses acompanharem. */
  const FIN_PATH = '/FinancasPlano';
  const FIN_MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const FIN_ORCAMENTO_PADRAO = 300; // teto mensal de gasto aleatório, se nunca foi definido

  let finState = null;
  let finStateSalvo = null; // último estado gravado no Firebase — pra onde "Cancelar" volta
  function finClone(obj){ return cloneValue(obj); } // cloneValue: ver "Cache de leitura", acima

  const finMoeda = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
  function finFmt(v){ return finMoeda.format(Number(v) || 0); }
  function finFmtNum(v){ return (Number(v) || 0).toFixed(2).replace('.', ','); }
  function finParseNum(txt){
    const limpo = String(txt).replace(/\s|R\$/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : n;
  }
  // Todo campo monetário do app usa inputmode="decimal" — em vez de cada tela
  // reimplementar o "digitei 160, vira 160,00", um único listener delegado no
  // documento cobre todos eles (inclusive os que ainda nem existem: linhas de
  // Finanças, Supermercado etc são recriadas a cada render). Dispara ao sair do
  // campo, não a cada tecla, pra não brigar com o cursor enquanto a pessoa digita.
  document.addEventListener('blur', (e) => {
    const el = e.target;
    if(el && el.matches && el.matches('input[inputmode="decimal"]') && el.value.trim() !== ''){
      el.value = finFmtNum(finParseNum(el.value));
    }
  }, true);
  function finLista(obj){ return Object.values(obj || {}).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)); }
  function finProxOrdem(obj){ return finLista(obj).reduce((m, i) => Math.max(m, (i.ordem || 0) + 1), 0); }
  function finValorDe(item){
    if(item.refId && finState.valores && finState.valores[item.refId]) return Number(finState.valores[item.refId].valor) || 0;
    return Number(item.valor) || 0;
  }
  function finSinal(v){ return v > 0 ? ' pos' : (v < 0 ? ' neg' : ''); }
  /* Teto de gasto aleatório: o mês pode ter o seu, senão vale o teto geral. */
  function finOrcamentoDoMes(mes){
    if(mes && mes.orcamentoAleatorio != null) return Math.abs(Number(mes.orcamentoAleatorio) || 0);
    return Math.abs(Number(finState.orcamentoAleatorio) || 0);
  }

  function finSeedInicial(){
    const valores = {};
    let ordemValor = 0;
    const val = (nome, valor) => {
      const id = newId();
      valores[id] = { id, nome, valor, ordem: ordemValor++ };
      return id;
    };
    const rSalario = val('Salário', 2512);
    const rVale = val('Vale', 1943);
    const rAlelo = val('Alelo', 186);
    const rRemedios = val('Remédios', -120);
    const rMercado = val('Supermercado', -600);
    const rGasolina = val('Gasolina', -400);
    const rCondominio = val('Condomínio', -165);
    const rAluguel = val('Aluguel', -600);
    const rLuz = val('Luz', -210);
    const rInternet = val('Internet', -100);
    const rAgua = val('Água', -50);

    const itens = {};
    let ordemItem = 0;
    const item = (secao, nome, extra) => {
      const id = newId();
      itens[id] = Object.assign({ id, secao, nome, valor:0, refId:null, ordem: ordemItem++ }, extra || {});
    };
    item('dia10', 'Salário', { refId: rSalario });
    item('dia10', 'Alelo', { refId: rAlelo });
    item('dia10', 'Condomínio', { refId: rCondominio });
    item('dia10', 'Aluguel', { refId: rAluguel });
    item('dia10', 'Luz', { refId: rLuz });
    item('dia10', 'Internet', { refId: rInternet });
    item('dia10', 'Água', { refId: rAgua });
    item('dia20', 'Vale', { refId: rVale });
    item('estimativas', 'Remédios', { refId: rRemedios });
    item('estimativas', 'Supermercado', { refId: rMercado });
    item('estimativas', 'Gasolina', { refId: rGasolina });
    item('renovacoes', 'Vivo Easy', { valor: -38 });
    item('renovacoes', 'YouTube Music', { valor: -21.9 });
    item('renovacoes', 'YouTube Premium', { valor: -26.9 });
    item('renovacoes', 'Google One', { valor: -4.5 });
    item('renovacoes', 'Google One', { valor: -14.99 });
    item('parcelas', 'Tablet', { valor: -229.74, parcela: 7, parcelas: 12 });
    item('parcelas', 'Academia', { valor: -159.9, parcela: 6, parcelas: 12 });
    item('parcelas', 'Seguro', { valor: -185.54, parcela: 1, parcelas: 7 });
    item('parcelas', 'Mercado Livre', { valor: -117.25, parcela: 2, parcelas: 4 });
    item('parcelas', 'Mercado Livre', { valor: -24.05, parcela: 2, parcelas: 4 });
    item('parcelas', 'Mercado Livre', { valor: -88.65, parcela: 2, parcelas: 3 });
    item('parcelas', 'Mercado Livre', { valor: -14.03, parcela: 1, parcelas: 3 });
    item('parcelas', 'Mercado Livre', { valor: -26.46, parcela: 1, parcelas: 6 });
    item('parcelas', 'Mercado Livre', { valor: -42, parcela: 1, parcelas: 3 });
    item('parcelas', 'Praia (Indaiá)', { valor: -162, parcela: 1, parcelas: 2 });

    const linhasCv = (linhas) => {
      const alvo = {};
      linhas.forEach(([nome, valor, refId], i) => {
        const id = newId();
        alvo[id] = { id, nome, valor: valor || 0, refId: refId || null, ordem: i };
      });
      return alvo;
    };
    const custoVidaBase = linhasCv([
      ['Remédios', 0, rRemedios], ['Supermercado (básico)', -500], ['Renovações automáticas (básico)', -45],
      ['Aluguel', 0, rAluguel], ['Luz (básico)', -200], ['Internet', 0, rInternet],
      ['Água', 0, rAgua], ['Imprevistos', -200]
    ]);
    const custoVida = linhasCv([
      ['Remédios', 0, rRemedios], ['Supermercado', -700], ['Suplementos', -165],
      ['Renovações automáticas', -80], ['Aluguel', 0, rAluguel], ['Luz', -175],
      ['Internet', 0, rInternet], ['Água', 0, rAgua], ['Academia', -120],
      ['Gasolina', -300], ['Imprevistos', -120]
    ]);

    const hoje = new Date();
    const mesId = newId();
    return {
      taxaEmprestimo: 0.065,
      orcamentoAleatorio: FIN_ORCAMENTO_PADRAO,
      valores, custoVida, custoVidaBase,
      meses: { [mesId]: { id: mesId, ano: hoje.getFullYear(), mes: hoje.getMonth(), ordem: 0, itens } }
    };
  }

  function finMesesOrdenados(){
    return finLista(finState.meses).sort((a, b) => (a.ano - b.ano) || (a.mes - b.mes));
  }
  function finItensDaSecao(mes, secao){
    return finLista(mes.itens).filter(i => i.secao === secao);
  }

  /* A cadeia de contas da planilha, mês a mês e na ordem do calendário. */
  function finCalcular(){
    const mapa = {};
    let sobraAnterior = 0;      // fatura final do mês anterior  (planilha: C34 -> F5)
    let empurradoAnterior = 0;  // empréstimo + taxa do mês anterior (planilha: C33 -> F38)
    finMesesOrdenados().forEach(mes => {
      const soma = (secao) => finItensDaSecao(mes, secao).reduce((s, i) => s + finValorDe(i), 0);
      const mpEstimativa = -empurradoAnterior;
      const cartaoLinhas = soma('estimativas') + soma('renovacoes') + soma('parcelas') + soma('compras') + soma('aleatorios');
      const cartaoTotal = cartaoLinhas + mpEstimativa;
      const posFatura = sobraAnterior + soma('dia10') + cartaoTotal;
      const posVale = posFatura + soma('dia20');
      const emprestimo = posVale < 50 ? (-posVale + 50) : 0;
      const taxa = emprestimo * (Number(finState.taxaEmprestimo) || 0);
      const empurrado = emprestimo + taxa;
      const faturaFinal = posVale + emprestimo;

      const doMes = finLista(mes.itens).filter(i => i.secao === 'dia10' || i.secao === 'dia20');
      const ganhos = doMes.reduce((s, i) => s + Math.max(0, finValorDe(i)), 0);
      const gastos = doMes.reduce((s, i) => s + Math.min(0, finValorDe(i)), 0) + cartaoTotal;

      const orcamento = finOrcamentoDoMes(mes);
      const aleatoriosGasto = -soma('aleatorios');

      mapa[mes.id] = {
        sobraAnterior, mpEstimativa, cartaoTotal, posFatura, posVale,
        fatura: posVale, emprestimo, taxa, empurrado, faturaFinal,
        ganhos, gastos, sobra: ganhos + gastos,
        orcamento, aleatoriosGasto, aleatoriosResta: orcamento - aleatoriosGasto
      };
      sobraAnterior = faturaFinal;
      empurradoAnterior = empurrado;
    });
    return mapa;
  }

  function finSetStatus(texto){
    const el = document.getElementById('finSaveStatus');
    if(el) el.textContent = texto;
  }
  /* Sem autosave: uma edição só marca "alterações não salvas" e libera Salvar/
     Cancelar. finPersistirAgora só grava no Firebase quando alguém pede — pelo
     botão Salvar, ou pelo preenchimento automático de meses (que não é uma
     edição do usuário, então não passa pelo fluxo de cancelar). */
  let finDirty = false;
  function finMarcarAlterado(){
    finDirty = true;
    finSetStatus('Alterações não salvas');
    const salvarBtn = document.getElementById('finSalvarBtn');
    const cancelarBtn = document.getElementById('finCancelarBtn');
    if(salvarBtn) salvarBtn.style.display = '';
    if(cancelarBtn) cancelarBtn.style.display = '';
  }
  async function finPersistirAgora(){
    finSetStatus('Salvando...');
    try{
      await dbPutSilent(userPath(FIN_PATH), finState);
      finStateSalvo = finClone(finState);
      finDirty = false;
      finSetStatus('Tudo salvo');
      return true;
    }catch(err){
      console.error('Falha ao salvar as Finanças:', err);
      finSetStatus('Não salvou — sem conexão?');
      return false;
    }
  }
  document.getElementById('finSalvarBtn').addEventListener('click', async () => {
    const ok = await finPersistirAgora();
    if(ok){
      document.getElementById('finSalvarBtn').style.display = 'none';
      document.getElementById('finCancelarBtn').style.display = 'none';
    }
  });
  document.getElementById('finCancelarBtn').addEventListener('click', () => {
    finState = finClone(finStateSalvo);
    finDirty = false;
    finSetStatus('Tudo salvo');
    document.getElementById('finSalvarBtn').style.display = 'none';
    document.getElementById('finCancelarBtn').style.display = 'none';
    finRenderMeses();
    finRenderValores();
    finRenderCustoVida();
    finRenderSimulador();
  });
  // Fechar/recarregar a aba com edição pendente perderia o que não foi salvo.
  // Rotina, Academia e Plano Alimentar usam o mesmo padrão de rascunho +
  // "dirty" que Finanças (ver setRotinaDirty/setAcademiaDirty/setPaDirty em
  // app-diario-hoje.js) — o aviso vale pros quatro, não só pro primeiro que
  // ganhou essa proteção.
  window.addEventListener('beforeunload', (e) => {
    if(!finDirty && !rotinaDirty && !academiaDirty && !paDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  /* ---------- Render ---------- */
  function finLinhaHtml(item, opts){
    const ref = item.refId && finState.valores ? finState.valores[item.refId] : null;
    const valor = finValorDe(item);
    // A parcela não é exclusiva da seção Parcelas: um lanche caro pode ter virado 3x.
    const parcelas = (opts && opts.parcelas) || item.parcelas != null;
    return '<div class="fin-linha" data-item-id="' + item.id + '">' +
      '<input class="fin-in-nome" value="' + escapeHtml(item.nome || '') + '" placeholder="Nome">' +
      (parcelas
        ? '<span class="fin-parc"><input class="fin-in-parc" data-k="parcela" type="number" min="1" value="' + (item.parcela || 1) + '">' +
          '<i>/</i><input class="fin-in-parc" data-k="parcelas" type="number" min="1" value="' + (item.parcelas || 1) + '"></span>'
        : '') +
      (ref
        ? '<button type="button" class="fin-ref" data-fin-desvincular title="Vem de Valores: ' + escapeHtml(ref.nome) + '. Clique para soltar o valor deste mês.">' + finFmt(valor) + '</button>'
        : '<input class="fin-in-valor' + finSinal(valor) + '" inputmode="decimal" value="' + finFmtNum(item.valor) + '">') +
      '<button type="button" class="fin-linha-x" data-fin-del-item title="Remover linha">×</button>' +
      '</div>';
  }
  function finAutoHtml(nome, mesId, campo, classe){
    return '<div class="fin-linha fin-auto' + (classe ? ' ' + classe : '') + '">' +
      '<span class="fin-auto-nome">' + escapeHtml(nome) + '</span>' +
      '<span class="fin-auto-valor" data-calc="' + mesId + '|' + campo + '"></span></div>';
  }
  /* Doce, lanche, besteira: o que não dá pra planejar, mas dá pra limitar. */
  function finBarraHtml(mes){
    return '<div class="fin-barra" data-barra="' + mes.id + '">' +
      '<div class="fin-barra-trilho"><span></span></div>' +
      '<div class="fin-barra-legenda">' +
      '<span class="fin-barra-txt"></span>' +
      '<label title="Teto de gasto aleatório deste mês">teto <input class="fin-barra-teto" inputmode="decimal" value="' +
      finFmtNum(finOrcamentoDoMes(mes)) + '"></label></div></div>';
  }
  function finSecaoHtml(mes, secaoId, titulo){
    const itens = finItensDaSecao(mes, secaoId);
    return '<div class="fin-sub" data-sub="' + secaoId + '">' +
      '<p class="fin-sec-titulo">' + escapeHtml(titulo) + '</p>' +
      itens.map(i => finLinhaHtml(i, { parcelas: secaoId === 'parcelas' })).join('') +
      '<button type="button" class="fin-add" data-fin-add="' + secaoId + '">+ linha</button>' +
      '</div>';
  }
  function finMesHtml(mes){
    const nome = FIN_MES_NOMES[mes.mes] || '';
    return '<article class="fin-mes" data-mes-id="' + mes.id + '">' +
      '<header class="fin-mes-head"><h2>' + escapeHtml(nome) + ' <span>' + mes.ano + '</span></h2>' +
      '<button type="button" class="fin-mes-x" data-fin-del-mes title="Excluir mês">×</button></header>' +

      '<section class="fin-sec fin-sec-dia10">' +
      '<p class="fin-sec-head">Dia 10</p>' +
      finAutoHtml('Sobra do mês passado', mes.id, 'sobraAnterior', 't-entrada') +
      finSecaoHtml(mes, 'dia10', 'Contas') +
      finAutoHtml('Cartão Santander', mes.id, 'cartaoTotal', 't-cartao') +
      '<div class="fin-total">Total pós fatura <b data-calc="' + mes.id + '|posFatura"></b></div>' +
      '</section>' +

      '<section class="fin-sec fin-sec-dia20">' +
      '<p class="fin-sec-head">Dia 20</p>' +
      finSecaoHtml(mes, 'dia20', 'Contas') +
      '<div class="fin-total">Total pós vale <b data-calc="' + mes.id + '|posVale"></b></div>' +
      '</section>' +

      '<section class="fin-sec fin-sec-mp">' +
      '<p class="fin-sec-head">Mercado Pago</p>' +
      finAutoHtml('Fatura', mes.id, 'fatura') +
      finAutoHtml('Empréstimo', mes.id, 'emprestimo') +
      finAutoHtml('Taxa', mes.id, 'taxa', 't-taxa') +
      finAutoHtml('Vai pra próxima fatura', mes.id, 'empurrado') +
      '<div class="fin-total">Fatura final <b data-calc="' + mes.id + '|faturaFinal"></b></div>' +
      '</section>' +

      '<section class="fin-sec fin-sec-cartao">' +
      '<p class="fin-sec-head">Cartão Santander</p>' +
      finAutoHtml('Mercado Pago (mês passado)', mes.id, 'mpEstimativa', 't-cartao') +
      finSecaoHtml(mes, 'estimativas', 'Estimativas') +
      finSecaoHtml(mes, 'renovacoes', 'Renovação automática') +
      finSecaoHtml(mes, 'parcelas', 'Parcelas') +
      finSecaoHtml(mes, 'compras', 'Compras') +
      finSecaoHtml(mes, 'aleatorios', 'Aleatórios') +
      finBarraHtml(mes) +
      '<div class="fin-total">Total do cartão <b data-calc="' + mes.id + '|cartaoTotal"></b></div>' +
      '</section>' +

      '<footer class="fin-mes-foot">' +
      '<div class="fin-kpi"><span>Ganhos</span><b data-calc="' + mes.id + '|ganhos"></b></div>' +
      '<div class="fin-kpi"><span>Gastos</span><b data-calc="' + mes.id + '|gastos"></b></div>' +
      '<div class="fin-kpi fin-kpi-forte"><span>Sobra do mês</span><b data-calc="' + mes.id + '|sobra"></b></div>' +
      '</footer></article>';
  }

  function finRenderMeses(){
    const el = document.getElementById('finMesesList');
    if(!el) return;
    const meses = finMesesOrdenados();
    el.innerHTML = meses.length
      ? meses.map(finMesHtml).join('')
      : '<p class="empty-state">Nenhum mês ainda. Use "+ Próximo mês" para começar.</p>';
    finAtualizarCalculados();
    finRenderSimulador();
  }

  function finLinhaSimplesHtml(linha, colecao){
    const ref = linha.refId && finState.valores ? finState.valores[linha.refId] : null;
    const valor = finValorDe(linha);
    return '<div class="fin-linha" data-cv="' + colecao + '" data-item-id="' + linha.id + '">' +
      '<input class="fin-in-nome" value="' + escapeHtml(linha.nome || '') + '" placeholder="Nome">' +
      (ref
        ? '<button type="button" class="fin-ref" data-fin-desvincular title="Vem de Valores: ' + escapeHtml(ref.nome) + '. Clique para soltar.">' + finFmt(valor) + '</button>'
        : '<input class="fin-in-valor' + finSinal(valor) + '" inputmode="decimal" value="' + finFmtNum(linha.valor) + '">') +
      '<button type="button" class="fin-linha-x" data-fin-del-item title="Remover linha">×</button></div>';
  }
  function finRenderValores(){
    const el = document.getElementById('finValoresList');
    if(!el) return;
    const taxa = document.getElementById('finTaxaInput');
    if(taxa && document.activeElement !== taxa) taxa.value = finState.taxaEmprestimo;
    const orcamento = document.getElementById('finOrcamentoInput');
    if(orcamento && document.activeElement !== orcamento) orcamento.value = finFmtNum(finState.orcamentoAleatorio || 0);
    el.innerHTML = finLista(finState.valores).map(v => finLinhaSimplesHtml(v, 'valores')).join('');
  }
  function finRenderCustoVida(){
    const alvos = [['custoVidaBase', 'finCvBaseList'], ['custoVida', 'finCvList']];
    alvos.forEach(([colecao, elId]) => {
      const el = document.getElementById(elId);
      if(!el) return;
      const linhas = finLista(finState[colecao]);
      el.innerHTML = linhas.map(l => finLinhaSimplesHtml(l, colecao)).join('') +
        '<div class="fin-total">Total <b data-calc="cv|' + colecao + '"></b></div>';
    });
    finAtualizarCalculados();
  }

  /* Recalcula sem redesenhar: só os campos marcados com data-calc mudam, então
     quem está digitando não perde o cursor. */
  function finAtualizarCalculados(){
    const mapa = finCalcular();
    document.querySelectorAll('#view-financas [data-calc]').forEach(el => {
      const [escopo, campo] = el.getAttribute('data-calc').split('|');
      let valor;
      if(escopo === 'cv'){
        valor = finLista(finState[campo]).reduce((s, l) => s + finValorDe(l), 0);
      }else{
        const calc = mapa[escopo];
        if(!calc) return;
        valor = calc[campo];
      }
      el.textContent = finFmt(valor);
      el.classList.toggle('pos', valor > 0);
      el.classList.toggle('neg', valor < 0);
    });
    document.querySelectorAll('#view-financas [data-barra]').forEach(el => {
      const calc = mapa[el.getAttribute('data-barra')];
      if(!calc) return;
      const pct = calc.orcamento > 0 ? Math.min(100, (calc.aleatoriosGasto / calc.orcamento) * 100) : 0;
      const estourou = calc.aleatoriosResta < 0;
      el.querySelector('.fin-barra-trilho span').style.width = pct + '%';
      el.classList.toggle('estourou', estourou);
      el.querySelector('.fin-barra-txt').textContent = calc.orcamento > 0
        ? finFmt(calc.aleatoriosGasto) + ' de ' + finFmt(calc.orcamento) +
          (estourou ? ' · passou ' + finFmt(-calc.aleatoriosResta) : ' · sobram ' + finFmt(calc.aleatoriosResta))
        : finFmt(calc.aleatoriosGasto) + ' sem teto definido';
    });
  }

  /* ---------- "Dá pra comprar?" ----------
     A pergunta que a planilha não respondia: o que essa compra faz com o mês.
     Olha dois limites ao mesmo tempo — o teto de gasto aleatório e a sobra do mês
     (de cada mês, quando é parcelado). Basta um estourar pra resposta mudar. */
  function finMesAtualId(){
    const meses = finMesesOrdenados();
    if(!meses.length) return '';
    const hoje = new Date();
    const atual = meses.find(m => m.ano === hoje.getFullYear() && m.mes === hoje.getMonth());
    return (atual || meses[0]).id;
  }
  function finRenderSimulador(){
    const select = document.getElementById('finSimMes');
    if(!select) return;
    const meses = finMesesOrdenados();
    const anterior = select.value;
    select.innerHTML = meses.map(m => '<option value="' + m.id + '">' + FIN_MES_NOMES[m.mes] + ' ' + m.ano + '</option>').join('');
    select.value = meses.some(m => m.id === anterior) ? anterior : finMesAtualId();
    finSimular();
  }
  function finSimular(){
    const el = document.getElementById('finSimResultado');
    if(!el) return;
    const valor = Math.abs(finParseNum(document.getElementById('finSimValor').value));
    const vezes = Math.max(1, Number(document.getElementById('finSimParcelas').value) || 1);
    const mesId = document.getElementById('finSimMes').value;
    const conta = document.getElementById('finSimAleatorio').checked;
    const meses = finMesesOrdenados();
    const idx = meses.findIndex(m => m.id === mesId);
    if(!valor || idx < 0){
      el.innerHTML = '<p class="empty-state" style="text-align:left;">Põe um valor pra ver o impacto.</p>';
      return;
    }

    const mapa = finCalcular();
    const parcela = valor / vezes;
    const ultimo = meses[meses.length - 1];
    const linhas = [];
    let pior = Infinity;
    for(let i = 0; i < vezes; i++){
      const mes = meses[idx + i];
      const base = mes ? mapa[mes.id].sobra : mapa[ultimo.id].sobra;
      const depois = base - parcela;
      pior = Math.min(pior, depois);
      const base0 = meses[idx];
      const futuro = new Date(base0.ano, base0.mes + i, 1);
      linhas.push({
        rotulo: (mes ? (FIN_MES_NOMES[mes.mes] + ' ' + mes.ano)
                     : (FIN_MES_NOMES[futuro.getMonth()] + ' ' + futuro.getFullYear() + ' · projeção')),
        projetado: !mes, depois
      });
    }
    const calc = mapa[mesId];
    const restaTeto = calc.aleatoriosResta - (conta ? parcela : 0);
    const cabeNoTeto = !conta || calc.orcamento <= 0 || restaTeto >= 0;
    const cabeNoMes = pior >= 0;

    let nivel, titulo, resumo;
    if(cabeNoMes && cabeNoTeto){
      nivel = 'ok'; titulo = 'Dá pra comprar.';
      resumo = conta && calc.orcamento > 0
        ? 'Ainda sobram ' + finFmt(restaTeto) + ' do teto de aleatórios deste mês.'
        : 'O mês continua no azul depois dessa compra.';
    }else if(cabeNoMes){
      nivel = 'aviso'; titulo = 'Dá, mas estoura o combinado.';
      resumo = 'Passa ' + finFmt(-restaTeto) + ' do teto de aleatórios do mês. O mês em si aguenta.';
    }else{
      nivel = 'nao'; titulo = 'Não dá.';
      resumo = 'O mês mais apertado fecharia em ' + finFmt(pior) + '.';
    }

    const nome = document.getElementById('finSimNome').value.trim();
    el.innerHTML =
      '<div class="fin-sim-veredito ' + nivel + '"><strong>' + titulo + '</strong><span>' + escapeHtml(resumo) + '</span></div>' +
      (vezes > 1 ? '<p class="fin-sim-nota">' + vezes + 'x de ' + finFmt(parcela) + '</p>' : '') +
      '<div class="fin-sim-linhas">' +
      linhas.map(l => '<div class="fin-sim-linha' + (l.projetado ? ' projetado' : '') + '">' +
        '<span>' + escapeHtml(l.rotulo) + '</span><b class="' + (l.depois < 0 ? 'neg' : 'pos') + '">' + finFmt(l.depois) + '</b></div>').join('') +
      '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="finSimRegistrarBtn">Registrar' + (nome ? ' "' + escapeHtml(nome) + '"' : ' compra') + '</button>';
  }
  /* Registrar é o que fecha o ciclo: avaliou, comprou, o mês já sabe. Parcelado
     entra em todos os meses que já existem; os que ainda não existem herdam a
     parcela quando forem criados pelo "+ Próximo mês". */
  function finRegistrarCompra(){
    const valor = Math.abs(finParseNum(document.getElementById('finSimValor').value));
    const vezes = Math.max(1, Number(document.getElementById('finSimParcelas').value) || 1);
    const mesId = document.getElementById('finSimMes').value;
    const conta = document.getElementById('finSimAleatorio').checked;
    const nome = document.getElementById('finSimNome').value.trim() || 'Compra';
    const meses = finMesesOrdenados();
    const idx = meses.findIndex(m => m.id === mesId);
    if(!valor || idx < 0) return;

    const parcela = valor / vezes;
    for(let i = 0; i < vezes; i++){
      const mes = meses[idx + i];
      if(!mes) break;
      if(!mes.itens) mes.itens = {};
      const id = newId();
      mes.itens[id] = {
        id, nome,
        secao: conta ? 'aleatorios' : (vezes > 1 ? 'parcelas' : 'compras'),
        valor: -parcela, refId: null, ordem: finProxOrdem(mes.itens)
      };
      if(vezes > 1){ mes.itens[id].parcela = i + 1; mes.itens[id].parcelas = vezes; }
    }
    document.getElementById('finSimNome').value = '';
    document.getElementById('finSimValor').value = '';
    document.getElementById('finSimParcelas').value = 1;
    finRenderMeses();
    finSimular();
    finMarcarAlterado();
    showAppMessage(nome + ' lançado em ' + FIN_MES_NOMES[meses[idx].mes] + '. Clique em Salvar pra confirmar.', 'success');
  }

  /* Monta o próximo mês a partir do anterior (contas que se repetem, parcelas
     que andam uma casa e somem quando acabam, compras do mês passado ficam
     pra trás). Só monta os dados — quem chama decide quando salvar/renderizar. */
  function finProximoMesDados(ultimo){
    const base = ultimo
      ? { ano: ultimo.mes === 11 ? ultimo.ano + 1 : ultimo.ano, mes: (ultimo.mes + 1) % 12 }
      : { ano: new Date().getFullYear(), mes: new Date().getMonth() };
    const id = newId();
    const itens = {};
    let ordem = 0;
    if(ultimo){
      finLista(ultimo.itens).forEach(item => {
        if(item.secao === 'compras') return;
        if(item.secao === 'aleatorios' && item.parcelas == null) return;
        const proxima = (item.parcela || 0) + 1;
        if(item.parcelas != null && proxima > item.parcelas) return;
        const novoId = newId();
        itens[novoId] = Object.assign({}, item, { id: novoId, ordem: ordem++ });
        if(item.parcelas != null) itens[novoId].parcela = proxima;
      });
    }
    const mes = { id, ano: base.ano, mes: base.mes, ordem: finProxOrdem(finState.meses), itens };
    if(ultimo && ultimo.orcamentoAleatorio != null) mes.orcamentoAleatorio = ultimo.orcamentoAleatorio;
    finState.meses[id] = mes;
    return mes;
  }

  /* Ninguém precisa clicar em "+ Próximo mês": sempre mantém os 12 meses a
     partir do atual já criados, e some sozinho quando um mês termina — o mês
     seguinte já existe da próxima vez que a tela é aberta. */
  function finGarantirMesesFuturos(){
    const hoje = new Date();
    const alvoIdx = hoje.getFullYear() * 12 + hoje.getMonth() + 11;
    let ultimo = finMesesOrdenados().pop();
    let ultimoIdx = ultimo ? ultimo.ano * 12 + ultimo.mes : -Infinity;
    let criou = false;
    while(ultimoIdx < alvoIdx){
      ultimo = finProximoMesDados(ultimo);
      ultimoIdx = ultimo.ano * 12 + ultimo.mes;
      criou = true;
    }
    return criou;
  }

  async function renderFinancas(){
    const dados = await dbGet(userPath(FIN_PATH));
    finState = dados || finSeedInicial();
    // O Firebase não guarda objeto vazio: uma coleção zerada volta como undefined.
    ['valores', 'custoVida', 'custoVidaBase', 'meses'].forEach(k => { finState[k] = finState[k] || {}; });
    const criouMeses = finGarantirMesesFuturos();
    if(!dados || criouMeses) await dbPutSilent(userPath(FIN_PATH), finState);
    finStateSalvo = finClone(finState);
    finDirty = false;
    finSetStatus('Tudo salvo');
    document.getElementById('finSalvarBtn').style.display = 'none';
    document.getElementById('finCancelarBtn').style.display = 'none';
    finRenderMeses();
    finRenderValores();
    finRenderCustoVida();
  }

  /* ---------- Edição ---------- */
  function finItemPorEvento(alvo){
    const linha = alvo.closest('[data-item-id]');
    if(!linha) return null;
    const id = linha.getAttribute('data-item-id');
    const colecao = linha.getAttribute('data-cv');
    if(colecao) return { item: finState[colecao][id], dono: finState[colecao] };
    const mesEl = linha.closest('[data-mes-id]');
    const mes = mesEl && finState.meses[mesEl.getAttribute('data-mes-id')];
    if(!mes) return null;
    return { item: mes.itens[id], dono: mes.itens };
  }

  document.getElementById('view-financas').addEventListener('input', (e) => {
    const alvo = e.target;
    if(alvo.id === 'finTaxaInput'){
      finState.taxaEmprestimo = Math.max(0, Number(alvo.value) || 0);
      finAtualizarCalculados();
      finMarcarAlterado();
      return;
    }
    if(alvo.id === 'finOrcamentoInput'){
      finState.orcamentoAleatorio = Math.abs(finParseNum(alvo.value));
      document.querySelectorAll('.fin-mes').forEach(card => {
        const mes = finState.meses[card.getAttribute('data-mes-id')];
        const teto = card.querySelector('.fin-barra-teto');
        if(mes && teto && mes.orcamentoAleatorio == null) teto.value = finFmtNum(finOrcamentoDoMes(mes));
      });
      finAtualizarCalculados();
      finMarcarAlterado();
      return;
    }
    if(alvo.id && alvo.id.indexOf('finSim') === 0){
      finSimular();
      return;
    }
    if(alvo.classList.contains('fin-barra-teto')){
      const mes = finState.meses[alvo.closest('[data-mes-id]').getAttribute('data-mes-id')];
      mes.orcamentoAleatorio = Math.abs(finParseNum(alvo.value));
      finAtualizarCalculados();
      finMarcarAlterado();
      return;
    }
    const achado = finItemPorEvento(alvo);
    if(!achado || !achado.item) return;
    if(alvo.classList.contains('fin-in-nome')){
      achado.item.nome = alvo.value;
    }else if(alvo.classList.contains('fin-in-valor')){
      achado.item.valor = finParseNum(alvo.value);
      alvo.classList.toggle('pos', achado.item.valor > 0);
      alvo.classList.toggle('neg', achado.item.valor < 0);
    }else if(alvo.classList.contains('fin-in-parc')){
      achado.item[alvo.getAttribute('data-k')] = Math.max(1, Number(alvo.value) || 1);
    }else{
      return;
    }
    finAtualizarCalculados();
    if(alvo.classList.contains('fin-in-valor')) finRenderValoresRefs();
    finMarcarAlterado();
  });

  /* Um valor de "Valores" aparece em várias linhas: quando ele muda, as linhas
     que apontam pra ele precisam mostrar o número novo. */
  function finRenderValoresRefs(){
    document.querySelectorAll('#view-financas .fin-ref').forEach(btn => {
      const achado = finItemPorEvento(btn);
      if(achado && achado.item) btn.textContent = finFmt(finValorDe(achado.item));
    });
  }

  document.getElementById('view-financas').addEventListener('change', (e) => {
    if(e.target.id === 'finSimMes' || e.target.id === 'finSimAleatorio') finSimular();
  });

  document.getElementById('view-financas').addEventListener('click', async (e) => {
    const alvo = e.target;

    if(alvo.id === 'finSimRegistrarBtn'){ finRegistrarCompra(); return; }

    const addSec = alvo.closest('[data-fin-add]');
    if(addSec){
      const mes = finState.meses[addSec.closest('[data-mes-id]').getAttribute('data-mes-id')];
      if(!mes.itens) mes.itens = {};
      const id = newId();
      mes.itens[id] = { id, secao: addSec.getAttribute('data-fin-add'), nome:'', valor:0, refId:null, ordem: finProxOrdem(mes.itens) };
      if(mes.itens[id].secao === 'parcelas'){ mes.itens[id].parcela = 1; mes.itens[id].parcelas = 1; }
      finRenderMeses();
      finMarcarAlterado();
      return;
    }

    const addCv = alvo.closest('[data-fin-add-cv]');
    if(addCv){
      const colecao = addCv.getAttribute('data-fin-add-cv');
      const id = newId();
      finState[colecao][id] = { id, nome:'', valor:0, refId:null, ordem: finProxOrdem(finState[colecao]) };
      finRenderCustoVida();
      finMarcarAlterado();
      return;
    }

    if(alvo.closest('[data-fin-desvincular]')){
      const achado = finItemPorEvento(alvo);
      if(!achado || !achado.item) return;
      achado.item.valor = finValorDe(achado.item);
      achado.item.refId = null;
      finRenderMeses();
      finRenderValores();
      finRenderCustoVida();
      finMarcarAlterado();
      return;
    }

    if(alvo.closest('[data-fin-del-item]')){
      const achado = finItemPorEvento(alvo);
      if(!achado || !achado.item) return;
      delete achado.dono[achado.item.id];
      finRenderMeses();
      finRenderValores();
      finRenderCustoVida();
      finMarcarAlterado();
      return;
    }

    if(alvo.closest('[data-fin-del-mes]')){
      const mesEl = alvo.closest('[data-mes-id]');
      const mes = finState.meses[mesEl.getAttribute('data-mes-id')];
      const ok = await showConfirm('Excluir ' + FIN_MES_NOMES[mes.mes] + ' de ' + mes.ano + '? Essa ação não pode ser desfeita.');
      if(!ok) return;
      delete finState.meses[mes.id];
      finRenderMeses();
      finMarcarAlterado();
    }
  });

  document.getElementById('finAddValorBtn').addEventListener('click', () => {
    const id = newId();
    finState.valores[id] = { id, nome:'', valor:0, ordem: finProxOrdem(finState.valores) };
    finRenderValores();
    finMarcarAlterado();
  });

  /* O mês novo nasce do anterior: as contas que se repetem vêm junto, as parcelas
     andam uma casa (e somem quando acabam) e as compras do mês passado ficam
     pra trás. É o que se faz na mão na planilha, sem fazer na mão. */
  document.getElementById('finAddMesBtn').addEventListener('click', () => {
    const ultimo = finMesesOrdenados().pop();
    const mes = finProximoMesDados(ultimo);
    finRenderMeses();
    finMarcarAlterado();
    showAppMessage(FIN_MES_NOMES[mes.mes] + ' criado a partir do mês anterior.', 'success');
  });

  // Segurar Shift e usar a rodinha rola os meses na horizontal — sem depender
  // do navegador converter o gesto sozinho, que era inconsistente.
  document.getElementById('finMesesScroll').addEventListener('wheel', (e) => {
    if(!e.shiftKey) return;
    e.preventDefault();
    e.currentTarget.scrollLeft += (e.deltaY || e.deltaX);
  }, { passive:false });

  /* ---------- CÁLCULOS: Rescisão ----------
     Modela só demissão sem justa causa com aviso prévio indenizado — o
     cenário mais comum e o único que dava pra verificar com números reais.
     Fórmulas conferidas contra um cálculo de referência real, verba a verba:
     o aviso prévio indenizado projeta a data de saída (Súmula 371 TST) — é
     essa data projetada, não a data do aviso, que conta pra 13º e férias
     proporcionais. Sem INSS/IRRF de propósito: as faixas mudam todo ano e
     errar por tabela desatualizada é pior que não calcular — ver aviso na tela. */
  const RESC_PATH = '/CalculosRescisao';
  let rescState = null;

  function rescAddMeses(d, n){ const r = new Date(d); r.setMonth(r.getMonth() + n); return r; }
  function rescAddAnos(d, n){ const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r; }
  function rescAddDias(d, n){ const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function rescDiffDias(a, b){ return Math.round((b - a) / 86400000); }
  // Conta anos/meses completos entre duas datas, com a fração do último mês/ano
  // contando inteiro só a partir de 15 dias — a mesma regra usada pra 13º e
  // férias proporcionais na CLT (Súmula 388/TST aplicada por analogia).
  function rescContarAnos(ini, fim){
    let n = 0, c = new Date(ini);
    while(rescAddAnos(c, 1) <= fim){ n++; c = rescAddAnos(c, 1); }
    return n;
  }
  function rescContarMeses(ini, fim){
    let n = 0, c = new Date(ini);
    while(rescAddMeses(c, 1) <= fim){ n++; c = rescAddMeses(c, 1); }
    if(rescDiffDias(c, fim) >= 15) n++;
    return n;
  }

  function rescSeedInicial(){
    return {
      salario: 5371.00, dataAdmissao: '2019-07-01', dataRescisao: todayStr(),
      periodosVencidos: 0, decimoAdiantado: false, valorAdiantamento: 0,
      fgtsTotalDepositado: 0, fgtsSaldoDisponivel: 0, dividaEmprestimoFgts: 0, fgtsBloqueadoGarantia: 0
    };
  }

  function rescCalcular(dados){
    const salario = Number(dados.salario) || 0;
    const admissao = new Date(dados.dataAdmissao + 'T00:00:00');
    const rescisao = new Date(dados.dataRescisao + 'T00:00:00');
    if(!salario || isNaN(admissao) || isNaN(rescisao) || rescisao <= admissao) return null;

    const anos = rescContarAnos(admissao, rescisao);
    const diasAviso = Math.min(90, 30 + 3 * anos);
    const projetada = rescAddDias(rescisao, diasAviso);

    const saldoSalario = salario / 30 * rescisao.getDate();
    const avisoIndenizado = salario / 30 * diasAviso;

    const jan1 = new Date(projetada.getFullYear(), 0, 1);
    const meses13 = rescContarMeses(jan1, projetada);
    const decimoBruto = salario / 12 * meses13;
    const adiantamento = dados.decimoAdiantado ? (Number(dados.valorAdiantamento) || 0) : 0;
    const decimoTerceiro = Math.max(0, decimoBruto - adiantamento);

    const anosAteProjetada = rescContarAnos(admissao, projetada);
    const inicioPeriodo = rescAddAnos(admissao, anosAteProjetada);
    const mesesFerias = rescContarMeses(inicioPeriodo, projetada);
    const feriasProporcionais = (salario / 12 * mesesFerias) * 4 / 3;

    const periodosVencidos = Math.max(0, Number(dados.periodosVencidos) || 0);
    const feriasVencidas = periodosVencidos * salario * 4 / 3;

    const trct = saldoSalario + avisoIndenizado + decimoTerceiro + feriasProporcionais + feriasVencidas;
    const fgtsTotalDepositado = Math.max(0, Number(dados.fgtsTotalDepositado) || 0);
    const multaFgts = fgtsTotalDepositado * 0.40;
    const totalSempre = trct + multaFgts;

    const fgtsDisponivel = Math.max(0, Number(dados.fgtsSaldoDisponivel) || 0);
    const divida = Math.max(0, Number(dados.dividaEmprestimoFgts) || 0);
    const fgtsBloqueado = Math.max(0, Number(dados.fgtsBloqueadoGarantia) || 0);

    // Cenário A: mantém o empréstimo — o FGTS bloqueado como garantia continua
    // travado (por isso não entra na soma), só o disponível na conta é usável.
    const totalA = totalSempre + fgtsDisponivel;
    // Cenário B: quita a dívida com parte da multa — o que sobrar da multa some
    // dela, e o FGTS bloqueado volta a ficar 100% disponível.
    const multaLiquida = multaFgts - divida;
    const totalB = trct + multaLiquida + (fgtsDisponivel + fgtsBloqueado);

    return {
      anos, diasAviso, projetada, saldoSalario, avisoIndenizado,
      meses13, decimoBruto, adiantamento, decimoTerceiro,
      mesesFerias, feriasProporcionais, periodosVencidos, feriasVencidas,
      trct, fgtsTotalDepositado, multaFgts, totalSempre,
      temEmprestimo: divida > 0 || fgtsBloqueado > 0,
      fgtsDisponivel, divida, fgtsBloqueado, totalA, multaLiquida, totalB, diferenca: totalB - totalA
    };
  }

  function rescLinha(rotulo, valor, nota){
    return '<div class="fin-sim-linha"><span>' + escapeHtml(rotulo) + (nota ? ' <span style="color:var(--text-dim);">(' + escapeHtml(nota) + ')</span>' : '') + '</span><b class="pos">' + finFmt(valor) + '</b></div>';
  }

  function renderCalculosRescisao(){
    const form = document.getElementById('calcRescisaoForm');
    const resultado = document.getElementById('calcRescisaoResultado');
    if(!form || !resultado) return;

    document.getElementById('rescSalarioInput').value = finFmtNum(rescState.salario);
    document.getElementById('rescAdmissaoInput').value = rescState.dataAdmissao || '';
    document.getElementById('rescDataInput').value = rescState.dataRescisao || '';
    document.getElementById('rescFeriasVencidasInput').value = rescState.periodosVencidos || 0;
    document.getElementById('rescDecimoAdiantadoInput').checked = !!rescState.decimoAdiantado;
    document.getElementById('rescValorAdiantamentoInput').value = finFmtNum(rescState.valorAdiantamento);
    document.getElementById('rescFgtsTotalInput').value = finFmtNum(rescState.fgtsTotalDepositado);
    document.getElementById('rescFgtsDisponivelInput').value = finFmtNum(rescState.fgtsSaldoDisponivel);
    document.getElementById('rescDividaInput').value = finFmtNum(rescState.dividaEmprestimoFgts);
    document.getElementById('rescFgtsBloqueadoInput').value = finFmtNum(rescState.fgtsBloqueadoGarantia);

    rescRecalcularEExibir();
  }

  function rescRecalcularEExibir(){
    const resultado = document.getElementById('calcRescisaoResultado');
    if(!resultado) return;
    const calc = rescCalcular(rescState);
    if(!calc){
      resultado.innerHTML = '<p class="empty-state">Preencha salário, admissão e data de rescisão pra calcular.</p>';
      return;
    }
    let html = '<p class="panel-title">Verbas (valores brutos)</p><div class="fin-sim-linhas">' +
      rescLinha('Saldo de salário', calc.saldoSalario) +
      rescLinha('Aviso prévio indenizado', calc.avisoIndenizado, calc.diasAviso + ' dias') +
      rescLinha('13º proporcional', calc.decimoTerceiro, calc.adiantamento ? 'já descontado o adiantamento' : (calc.meses13 + '/12')) +
      rescLinha('Férias proporcionais + 1/3', calc.feriasProporcionais, calc.mesesFerias + '/12') +
      (calc.periodosVencidos > 0 ? rescLinha('Férias vencidas + 1/3', calc.feriasVencidas, calc.periodosVencidos + (calc.periodosVencidos === 1 ? ' período' : ' períodos')) : '') +
      '</div>' +
      '<div class="fin-sim-veredito ok"><strong>' + finFmt(calc.trct) + '</strong><span>Subtotal TRCT</span></div>';
    if(calc.multaFgts > 0){
      html += '<div class="fin-sim-linhas" style="margin-top:10px;">' + rescLinha('Multa FGTS (40%)', calc.multaFgts) + '</div>' +
        '<div class="fin-sim-veredito ok"><strong>' + finFmt(calc.totalSempre) + '</strong><span>Total em dinheiro, direto na conta</span></div>';
    }
    if(calc.temEmprestimo){
      html += '<div class="grid-2" style="margin-top:16px; gap:14px;">' +
        '<div><p class="panel-title" style="font-size:12px;">Cenário A — mantém o empréstimo</p><div class="fin-sim-linhas">' +
          rescLinha('Dinheiro em mãos (TRCT + multa)', calc.totalSempre) +
          rescLinha('FGTS disponível na conta', calc.fgtsDisponivel) +
          (calc.fgtsBloqueado > 0 ? '<div class="fin-sim-linha"><span>FGTS bloqueado como garantia</span><b class="neg">' + finFmt(-calc.fgtsBloqueado) + '</b></div>' : '') +
        '</div><div class="fin-sim-veredito aviso"><strong>' + finFmt(calc.totalA) + '</strong><span>Total utilizável agora' + (calc.divida > 0 ? ' — dívida de ' + finFmt(calc.divida) + ' continua em aberto' : '') + '</span></div></div>' +
        '<div><p class="panel-title" style="font-size:12px;">Cenário B — quita o empréstimo</p><div class="fin-sim-linhas">' +
          rescLinha('TRCT', calc.trct) +
          rescLinha('Multa FGTS líquida', calc.multaLiquida, finFmt(calc.multaFgts) + ' − ' + finFmt(calc.divida)) +
          rescLinha('FGTS na conta, 100% liberado', calc.fgtsDisponivel + calc.fgtsBloqueado) +
        '</div><div class="fin-sim-veredito ok"><strong>' + finFmt(calc.totalB) + '</strong><span>Total utilizável — sem dívida em aberto</span></div></div>' +
      '</div>' +
      '<p class="fin-sim-nota" style="margin-top:12px;">Diferença entre os dois cenários: ' + finFmt(Math.abs(calc.diferenca)) +
        (calc.diferenca >= 0 ? ' a mais quitando o empréstimo (o FGTS que ficaria bloqueado vale mais que a dívida).' : ' a mais mantendo o empréstimo (a dívida é maior que o FGTS que seria liberado).') + '</p>';
    }
    html += '<p class="fin-sim-nota">Estimativa educativa — sem INSS/IRRF, não substitui o cálculo oficial do RH, contador, ou a conferência no app FGTS/Caixa.</p>';
    resultado.innerHTML = html;
  }

  async function renderCalculosRescisaoInit(){
    const dados = await dbGet(userPath(RESC_PATH));
    rescState = dados || rescSeedInicial();
    if(!dados) await dbPutSilent(userPath(RESC_PATH), rescState);
    renderCalculosRescisao();
  }

  // Recalcula na hora a cada tecla (é só matemática, não custa nada); grava no
  // Firebase só quando o campo perde o foco ou o valor muda de verdade — não a
  // cada tecla, pra não disparar uma escrita por caractere digitado.
  const RESC_CAMPOS = [
    ['rescSalarioInput', 'salario', 'moeda'], ['rescAdmissaoInput', 'dataAdmissao', 'data'],
    ['rescDataInput', 'dataRescisao', 'data'], ['rescFeriasVencidasInput', 'periodosVencidos', 'inteiro'],
    ['rescDecimoAdiantadoInput', 'decimoAdiantado', 'bool'], ['rescValorAdiantamentoInput', 'valorAdiantamento', 'moeda'],
    ['rescFgtsTotalInput', 'fgtsTotalDepositado', 'moeda'], ['rescFgtsDisponivelInput', 'fgtsSaldoDisponivel', 'moeda'],
    ['rescDividaInput', 'dividaEmprestimoFgts', 'moeda'], ['rescFgtsBloqueadoInput', 'fgtsBloqueadoGarantia', 'moeda']
  ];
  function rescLerCampo(el, tipo){
    if(tipo === 'bool') return el.checked;
    if(tipo === 'data') return el.value;
    if(tipo === 'inteiro') return Math.max(0, parseInt(el.value, 10) || 0);
    return finParseNum(el.value);
  }
  RESC_CAMPOS.forEach(([id, campo, tipo]) => {
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener('input', () => {
      rescState[campo] = rescLerCampo(el, tipo);
      rescRecalcularEExibir();
    });
    el.addEventListener('change', () => {
      dbPatchSilent(userPath(RESC_PATH), { [campo]: rescLerCampo(el, tipo) }).catch(() => {});
    });
  });

  /* ---------- MANUTENÇÃO (carro, casa, documentos — intervalo longo) ----------
     Mesmo modelo de pendência por frequência da Casa (ver casaAtividadeStatus),
     só que com intervalos de meses/anos em vez de dias/semanas. */
  const MANUT_FREQ_DIAS = { mensal:30, trimestral:90, semestral:180, anual:365 };
  const MANUT_FREQ_LABEL = { mensal:'Mensal', trimestral:'Trimestral', semestral:'Semestral', anual:'Anual' };

  function manutStatus(m){
    const intervalo = MANUT_FREQ_DIAS[m.frequencia] || 365;
    const dias = casaDiasDesde(m.feitaEm); // reaproveita a mesma conta de dias-desde da Casa
    if(dias === Infinity) return { pendente:true, texto:'nunca feita' };
    if(dias >= intervalo) return { pendente:true, texto: 'pendente há ' + dias + (dias === 1 ? ' dia' : ' dias') };
    const faltam = intervalo - dias;
    return { pendente:false, texto:'feita há ' + dias + (dias === 1 ? ' dia' : ' dias'), proxima: faltam === 1 ? 'volta amanhã' : 'volta em ' + faltam + ' dias' };
  }

  async function renderManutencao(){
    const el = document.getElementById('manutList');
    if(!el) return;
    const dados = await dbGet(userPath('/Manutencao')) || {};
    const entries = Object.entries(dados).sort((a, b) => {
      const pa = manutStatus(a[1]).pendente ? 0 : 1, pb = manutStatus(b[1]).pendente ? 0 : 1;
      return pa - pb || (a[1].criadoEm || '').localeCompare(b[1].criadoEm || '');
    });
    if(!entries.length){ el.innerHTML = '<p class="empty-state">Nenhuma manutenção cadastrada. Troca de óleo, revisão, IPVA, filtro de água...</p>'; return; }
    el.innerHTML = entries.map(([id, m]) => {
      const st = manutStatus(m);
      return `
      <div class="casa-card ${st.pendente ? '' : 'casa-card-feita'}" data-id="${id}">
        <button type="button" class="casa-check" data-manut-done="${id}" title="${st.pendente ? 'Marcar como feita' : 'Desmarcar'}">${st.pendente ? '' : '✓'}</button>
        <div class="casa-card-main">
          <p class="casa-card-title">${escapeHtml(m.nome)}</p>
          <div class="casa-card-meta">
            <span>${MANUT_FREQ_LABEL[m.frequencia] || m.frequencia}</span>
            ${m.custo ? `<span>· ${finFmt(m.custo)}</span>` : ''}
            <span class="casa-status ${st.pendente ? 'casa-status-pendente' : ''}">· ${escapeHtml(st.texto)}</span>
            ${st.proxima ? `<span class="casa-status">· ${escapeHtml(st.proxima)}</span>` : ''}
            ${m.observacao ? `<span>· ${escapeHtml(m.observacao)}</span>` : ''}
          </div>
        </div>
        <div class="casa-card-actions"><button data-manut-del="${id}">excluir</button></div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-manut-done]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-manut-done');
      const m = dados[id];
      const st = manutStatus(m);
      await dbPatch(userPath('/Manutencao/' + id), { feitaEm: st.pendente ? todayStr() : null });
      renderManutencao();
    }));
    el.querySelectorAll('[data-manut-del]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta manutenção?')) return;
      await dbDelete(userPath('/Manutencao/' + btn.getAttribute('data-manut-del')));
      renderManutencao();
    }));
  }
  document.getElementById('manutAddBtn').addEventListener('click', () => {
    document.getElementById('manutNomeInput').value = '';
    document.getElementById('manutFrequenciaInput').value = 'anual';
    document.getElementById('manutCustoInput').value = '';
    document.getElementById('manutObsInput').value = '';
    document.getElementById('manutModal').classList.add('active');
  });
  document.getElementById('manutCancelBtn').addEventListener('click', () => document.getElementById('manutModal').classList.remove('active'));
  document.getElementById('manutOkBtn').addEventListener('click', async () => {
    const nome = document.getElementById('manutNomeInput').value.trim();
    if(!nome){ showAppMessage('Digite o que precisa ser feito.', 'error'); return; }
    const frequencia = document.getElementById('manutFrequenciaInput').value;
    const custo = finParseNum(document.getElementById('manutCustoInput').value) || null;
    const observacao = document.getElementById('manutObsInput').value.trim();
    await dbPut(userPath('/Manutencao/' + newId()), { nome, frequencia, custo, observacao, criadoEm: new Date().toISOString() });
    document.getElementById('manutModal').classList.remove('active');
    renderManutencao();
  });

  /* ---------- Lançar item avulso nas Finanças (usado pelo Supermercado) ----------
     "Finalizar compra" no Supermercado lança o gasto no mês certo das Finanças —
     só quando aquele mês já existe lá (Finanças sempre mantém os próximos 12
     meses criados; se ainda não existir, avisa em vez de tentar recriar a
     lógica de geração de mês, que não é deste helper). Existiu uma tela de
     Ápice usando isto também (Clientes/A receber, lançando ganhos) — removida
     a pedido: Ápice virou só um link externo (ver nav-item na sidebar). */
  async function finEncontrarMesPorData(dataStr){
    const plano = await dbGet(userPath(FIN_PATH), { fresh:true });
    const d = new Date(dataStr + 'T00:00:00');
    if(!plano || !plano.meses || isNaN(d)) return null;
    const ano = d.getFullYear(), mes = d.getMonth();
    const entry = Object.entries(plano.meses).find(([, m]) => m.ano === ano && m.mes === mes);
    return entry ? { mesId: entry[0], mes: entry[1] } : null;
  }
  // `secao` decide onde a linha aparece nas Finanças (ver FIN_PATH acima: dia10
  // pra ganho batido com o dia do mês, compras pra gasto avulso). `valor` já
  // vem com o sinal certo — positivo é ganho, negativo é gasto.
  async function finLancarItem(dataStr, secao, nome, valor){
    const achado = await finEncontrarMesPorData(dataStr);
    if(!achado) return null;
    const itemId = newId();
    const ordem = Object.keys(achado.mes.itens || {}).length;
    await dbPut(userPath(FIN_PATH + '/meses/' + achado.mesId + '/itens/' + itemId), { id:itemId, secao, nome, valor, refId:null, ordem });
    dbCacheInvalidate(userPath(FIN_PATH)); // finState em memória (se a tela Finanças já abriu) fica defasado até reabrir
    return { mesId: achado.mesId, itemId };
  }
  async function finRemoverItem(mesId, itemId){
    if(!mesId || !itemId) return;
    await dbDelete(userPath(FIN_PATH + '/meses/' + mesId + '/itens/' + itemId)).catch(() => {});
  }
