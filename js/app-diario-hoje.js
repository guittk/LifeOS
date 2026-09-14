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
  /* Esconder/mostrar os textos do Diário — pra folhear sem se preocupar com quem
     está de relance por perto. Lembra a escolha entre sessões; começa escondido
     por padrão (privacidade primeiro), a não ser que a pessoa já tenha optado
     por deixar visível antes. */
  const DIARIO_OCULTO_KEY = 'lifeosDiarioOculto';
  function diarioTextosOcultos(){ return localStorage.getItem(DIARIO_OCULTO_KEY) !== 'nao'; }
  function aplicarDiarioOculto(){
    const view = document.getElementById('view-diario');
    const btn = document.getElementById('diarioToggleTextoBtn');
    if(!view || !btn) return;
    const oculto = diarioTextosOcultos();
    view.classList.toggle('diario-oculto', oculto);
    btn.textContent = oculto ? '👁 Mostrar textos' : '🙈 Esconder textos';
  }
  document.getElementById('diarioToggleTextoBtn').addEventListener('click', () => {
    localStorage.setItem(DIARIO_OCULTO_KEY, diarioTextosOcultos() ? 'nao' : 'sim');
    aplicarDiarioOculto();
  });
  aplicarDiarioOculto();

  async function renderDiario(){
    aplicarDiarioOculto();
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
      el.innerHTML = '<p class="empty-state">Nenhuma refeição configurada pra hoje. Monte o cardápio do dia na tela Plano Alimentar.</p>';
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
      el.innerHTML = '<p class="empty-state">Nenhum objetivo cadastrado ainda. Crie o primeiro na tela Objetivos.</p>';
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
      dbGet(userPath('/AcademiaDias')),
      dbGet(userPath('/AcademiaMetas'))
    ]);
    registrarVersaoCarregada('/AcademiaDias');
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
    registrarVersaoCarregada('/PlanoAlimentar');
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
  // As três metas de insulina só entravam no rascunho de nome — na prática
  // gravavam na hora (dbPatch a cada "change"), fora do fluxo de "Salvar
  // alterações" do resto da tela. Agora só marcam a tela como suja; a
  // gravação de verdade acontece junto com o resto, no clique de Salvar.
  ['paInsulinaCafeMetaInput', 'paInsulinaAlmocoMetaInput', 'paInsulinaJantarMetaInput'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => setPaDirty(true));
  });

  document.getElementById('paSaveBtn').addEventListener('click', async () => {
    if(!paDraft) return;
    Object.values(paDraft).forEach(dia => {
      Object.values((dia && dia.refeicoes) || {}).forEach(m => {
        if(typeof m.nome === 'string') m.nome = m.nome.trim() || 'Refeição';
        Object.values(m.alimentos || {}).forEach(f => { if(typeof f.nome === 'string') f.nome = f.nome.trim(); });
      });
    });
    const insulinaCafeUi = Math.max(0, Number(document.getElementById('paInsulinaCafeMetaInput').value) || 0);
    const insulinaAlmocoUi = Math.max(0, Number(document.getElementById('paInsulinaAlmocoMetaInput').value) || 0);
    const insulinaJantarUi = Math.max(0, Number(document.getElementById('paInsulinaJantarMetaInput').value) || 0);
    await Promise.all([
      dbPut(userPath('/PlanoAlimentar'), paDraft),
      dbPatch(userPath('/PlanoAlimentarConfig'), { insulinaCafeUi, insulinaAlmocoUi, insulinaJantarUi })
    ]);
    setPaDirty(false);
    await Promise.all([renderHojePlanoAlimentar(), renderHojeInsulina()]);
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
    registrarVersaoCarregada('/Rotina');
    rotinaDraft = cloneRotina(saved);
    renderRotinaGrid();
    setRotinaDirty(false);
  }

  document.getElementById('rotinaSaveBtn').addEventListener('click', async () => {
    if(!rotinaDraft) return;
    Object.values(rotinaDraft).forEach(dia => {
      Object.values((dia && dia.blocos) || {}).forEach(b => { if(typeof b.nome === 'string') b.nome = b.nome.trim(); });
    });
    if(!await confirmarSobrescrita('/Rotina', 'a Rotina')) return;
    await dbPut(userPath('/Rotina'), rotinaDraft);
    marcarVersaoSalva('/Rotina');
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
    agoraEl.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

    // Mesmo cálculo que a fila de Hoje usa para justificar a escolha — uma
    // implementação só, pra as duas telas nunca discordarem sobre quantas
    // horas livres você tem.
    const janela = await calcularJanelaLivre();
    const nowMin = janela.nowMin;
    const blocos = janela.blocos;

    if(!blocos.length){
      nowRow.textContent = 'Nenhum horário configurado para hoje ainda — configure na Rotina.';
      livresTotalEl.textContent = rotFmtHours(DAY_END_MIN);
      livresRestanteEl.textContent = rotFmtHours(Math.max(0, DAY_END_MIN - nowMin));
      upcomingEl.innerHTML = '<p class="empty-state">Configure sua rotina para ver o que falta hoje.</p>';
      return;
    }

    const current = janela.atual;
    const upcoming = blocos.filter(b => b.fim > nowMin);

    nowRow.textContent = current ? ('Agora você está em: ' + current.nome) : 'Nenhum bloco da rotina agora — hora livre.';
    livresTotalEl.textContent = rotFmtHours(janela.livresTotalMin);
    livresRestanteEl.textContent = rotFmtHours(janela.livresRestanteMin);

    if(!upcoming.length){
      upcomingEl.innerHTML = '<p class="empty-state">Rotina de hoje concluída — nada mais planejado.</p>';
    } else {
      upcomingEl.innerHTML = upcoming.map(b => {
        const h1 = String(Math.floor(b.inicio / 60)).padStart(2,'0'), m1 = String(b.inicio % 60).padStart(2,'0');
        return `<div class="rot-hoje-upcoming-row"><span class="rot-hoje-upcoming-time">${h1}:${m1}</span><span>${escapeHtml(b.nome)}</span></div>`;
      }).join('');
    }
  }

