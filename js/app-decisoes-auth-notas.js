  /* ---------- Central de Decisões ---------- */
  const DEC_STATUS_LABEL = { em_analise: 'Em análise', decidida: 'Decidida', cancelada: 'Cancelada' };
  const DEC_IMPORTANCIA_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
  const DEC_COLORS = [
    { color: 'var(--blue)', soft: 'var(--blue-soft)' },
    { color: 'var(--purple)', soft: 'var(--purple-soft)' },
    { color: 'var(--gold)', soft: 'var(--gold-soft)' },
    { color: 'var(--coral)', soft: 'var(--coral-soft)' },
    { color: 'var(--sage)', soft: 'var(--sage-soft)' }
  ];
  function decColorForCategoria(cat){
    const s = String(cat || '').trim().toLowerCase();
    if(!s) return DEC_COLORS[0];
    let hash = 0;
    for(let i = 0; i < s.length; i++){ hash = (hash * 31 + s.charCodeAt(i)) >>> 0; }
    return DEC_COLORS[hash % DEC_COLORS.length];
  }
  function decParseLines(text){
    return String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  }
  function decParseCriterios(text){
    const out = {};
    decParseLines(text).forEach(line => {
      const parts = line.split(',');
      const nome = (parts[0] || '').trim();
      if(!nome) return;
      let peso = parseInt(parts[1], 10);
      if(!Number.isFinite(peso) || peso < 1) peso = 3;
      if(peso > 5) peso = 5;
      out[newId()] = { nome, peso };
    });
    return out;
  }

  let decEditingId = null;
  let decCurrentFilter = 'todas';
  let decOpcaoEditingDecId = null;
  let decOpcaoEditingId = null;

  async function renderDecisoes(){
    const el = document.getElementById('decisoesList');
    const data = await dbGet(userPath('/Decisoes')) || {};
    const entries = Object.entries(data)
      .filter(([, d]) => decCurrentFilter === 'todas' || d.status === decCurrentFilter)
      .sort((a, b) => (b[1].data || b[1].criadoEm || '').localeCompare(a[1].data || a[1].criadoEm || ''));

    if(!entries.length){
      el.innerHTML = '<p class="empty-state">Nenhuma decisão registrada ainda. Crie a primeira com "+ Nova decisão".</p>';
      return;
    }

    el.innerHTML = entries.map(([id, d]) => {
      const cat = decColorForCategoria(d.categoria);
      const opcoes = Object.entries(d.opcoes || {}).sort((a,b) => (a[1].ordem||0) - (b[1].ordem||0));
      const criterios = Object.entries(d.criterios || {});
      const status = d.status || 'em_analise';
      return `
      <div class="dec-card" data-dec-id="${id}" style="--dec-color:${cat.color}; --dec-soft:${cat.soft};">
        <div class="dec-card-head">
          <div>
            <p class="dec-title">${escapeHtml(d.titulo)}</p>
            <div class="dec-meta-row">
              ${d.categoria ? `<span class="dec-pill">${escapeHtml(d.categoria)}</span>` : ''}
              <span class="dec-pill status-${status}">${DEC_STATUS_LABEL[status] || status}</span>
              <span class="dec-pill">${DEC_IMPORTANCIA_LABEL[d.importancia] || 'Média'}</span>
              <span class="dec-date">${d.data ? fmtShortDate(d.data) : ''}</span>
            </div>
          </div>
          <div class="dec-actions">
            <button data-edit-decisao="${id}">editar</button>
            <button data-del-decisao="${id}">excluir</button>
          </div>
        </div>
        ${d.contexto ? `<p class="dec-contexto">${escapeHtml(d.contexto)}</p>` : ''}

        ${criterios.length ? `
        <p class="dec-section-label">Critérios importantes</p>
        <div class="dec-criterios-list">
          ${criterios.map(([, c]) => `<span class="dec-criterio-chip">${escapeHtml(c.nome)} <span class="dec-criterio-peso">${'★'.repeat(c.peso)}</span></span>`).join('')}
        </div>` : ''}

        <p class="dec-section-label">Opções</p>
        <div class="dec-opcoes-grid">
          ${opcoes.map(([oid, o]) => `
            <div class="dec-opcao-card">
              <div class="dec-opcao-nome">${escapeHtml(o.nome)}</div>
              ${(o.pros||[]).length ? `<ul class="dec-opcao-lista pros">${(o.pros||[]).map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
              ${(o.contras||[]).length ? `<ul class="dec-opcao-lista contras">${(o.contras||[]).map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}
              <div class="dec-opcao-foot">
                <button data-edit-opcao="${oid}" data-dec-id="${id}">editar</button>
                <button data-del-opcao="${oid}" data-dec-id="${id}">excluir</button>
              </div>
            </div>`).join('')}
        </div>
        <button class="dec-add-inline-btn" data-add-opcao="${id}">+ Adicionar opção</button>

        ${d.resultado ? `
        <div class="dec-resultado-box">
          <div class="dec-resultado-label">Decisão tomada</div>
          <strong>${escapeHtml(d.resultado.escolhaNome || '')}</strong>
          ${d.resultado.justificativa ? `<p style="margin:6px 0 0;">${escapeHtml(d.resultado.justificativa)}</p>` : ''}
        </div>` : (status === 'decidida' ? `<button class="dec-add-inline-btn" data-add-resultado="${id}">+ Registrar resultado</button>` : '')}

        ${d.revisao ? `
        <div class="dec-revisao-box">
          <div class="dec-revisao-label">Revisão futura · ${fmtShortDate(d.revisao.data)}</div>
          Valeu a pena: <strong>${escapeHtml(d.revisao.valeu === 'sim' ? 'Sim' : d.revisao.valeu === 'parcial' ? 'Parcialmente' : 'Não')}</strong> ·
          Faria de novo: <strong>${escapeHtml(d.revisao.faria === 'sim' ? 'Sim' : d.revisao.faria === 'nao' ? 'Não' : 'Talvez')}</strong>
          ${d.revisao.consequencias ? `<p style="margin:6px 0 0;">${escapeHtml(d.revisao.consequencias)}</p>` : ''}
          <div class="dec-opcao-foot" style="margin-top:8px;"><button data-add-revisao="${id}">editar revisão</button></div>
        </div>` : (d.resultado ? `<button class="dec-add-inline-btn" data-add-revisao="${id}">+ Registrar revisão futura</button>` : '')}
      </div>`;
    }).join('');

    el.querySelectorAll('[data-edit-decisao]').forEach(btn => btn.addEventListener('click', () => openDecisaoModal(btn.getAttribute('data-edit-decisao'))));
    el.querySelectorAll('[data-del-decisao]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta decisão e todo o histórico dela?')) return;
      await dbDelete(userPath('/Decisoes/' + btn.getAttribute('data-del-decisao')));
      await renderDecisoes();
    }));
    el.querySelectorAll('[data-add-opcao]').forEach(btn => btn.addEventListener('click', () => openDecisaoOpcaoModal(btn.getAttribute('data-add-opcao'), null)));
    el.querySelectorAll('[data-edit-opcao]').forEach(btn => btn.addEventListener('click', () => openDecisaoOpcaoModal(btn.getAttribute('data-dec-id'), btn.getAttribute('data-edit-opcao'))));
    el.querySelectorAll('[data-del-opcao]').forEach(btn => btn.addEventListener('click', async () => {
      if(!await showConfirm('Excluir esta opção?')) return;
      await dbDelete(userPath('/Decisoes/' + btn.getAttribute('data-dec-id') + '/opcoes/' + btn.getAttribute('data-del-opcao')));
      await renderDecisoes();
    }));
    el.querySelectorAll('[data-add-resultado]').forEach(btn => btn.addEventListener('click', () => openDecisaoResultadoModal(btn.getAttribute('data-add-resultado'))));
    el.querySelectorAll('[data-add-revisao]').forEach(btn => btn.addEventListener('click', () => openDecisaoRevisaoModal(btn.getAttribute('data-add-revisao'))));
  }

  document.querySelectorAll('#decisaoFilters [data-dec-filter]').forEach(btn => btn.addEventListener('click', () => {
    decCurrentFilter = btn.getAttribute('data-dec-filter');
    document.querySelectorAll('#decisaoFilters [data-dec-filter]').forEach(b => b.classList.toggle('active', b === btn));
    renderDecisoes();
  }));

  async function populateDecisaoCategoriaDatalist(){
    const list = document.getElementById('decisaoCategoriaList');
    if(list.options.length) return;
    const data = await dbGet(userPath('/Decisoes')) || {};
    const cats = [...new Set(Object.values(data).map(d => d.categoria).filter(Boolean))];
    list.innerHTML = cats.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
  }

  function openDecisaoModal(id){
    decEditingId = id || null;
    populateDecisaoCategoriaDatalist();
    document.getElementById('decisaoModalTitle').textContent = id ? 'Editar decisão' : 'Nova decisão';
    document.getElementById('decisaoTituloInput').value = '';
    document.getElementById('decisaoCategoriaInput').value = '';
    document.getElementById('decisaoImportanciaInput').value = 'media';
    document.getElementById('decisaoStatusInput').value = 'em_analise';
    document.getElementById('decisaoDataInput').value = todayStr();
    document.getElementById('decisaoContextoInput').value = '';
    document.getElementById('decisaoCriteriosInput').value = '';
    if(id){
      dbGet(userPath('/Decisoes/' + id)).then(d => {
        if(!d) return;
        document.getElementById('decisaoTituloInput').value = d.titulo || '';
        document.getElementById('decisaoCategoriaInput').value = d.categoria || '';
        document.getElementById('decisaoImportanciaInput').value = d.importancia || 'media';
        document.getElementById('decisaoStatusInput').value = d.status || 'em_analise';
        document.getElementById('decisaoDataInput').value = d.data || todayStr();
        document.getElementById('decisaoContextoInput').value = d.contexto || '';
        document.getElementById('decisaoCriteriosInput').value = Object.values(d.criterios || {}).map(c => c.nome + ', ' + c.peso).join('\n');
      });
    }
    document.getElementById('decisaoModal').classList.add('active');
  }
  document.getElementById('decisaoAddBtn').addEventListener('click', () => openDecisaoModal(null));
  document.getElementById('decisaoCancelBtn').addEventListener('click', () => document.getElementById('decisaoModal').classList.remove('active'));
  document.getElementById('decisaoOkBtn').addEventListener('click', async () => {
    const titulo = document.getElementById('decisaoTituloInput').value.trim();
    if(!titulo){ showAppMessage('Digite o título da decisão.', 'error'); return; }
    const categoria = document.getElementById('decisaoCategoriaInput').value.trim();
    const importancia = document.getElementById('decisaoImportanciaInput').value;
    const status = document.getElementById('decisaoStatusInput').value;
    const data = document.getElementById('decisaoDataInput').value || todayStr();
    const contexto = document.getElementById('decisaoContextoInput').value.trim();
    const criterios = decParseCriterios(document.getElementById('decisaoCriteriosInput').value);
    if(decEditingId){
      await dbPatch(userPath('/Decisoes/' + decEditingId), { titulo, categoria, importancia, status, data, contexto, criterios });
    } else {
      const novaDecId = newId();
      await dbPut(userPath('/Decisoes/' + novaDecId), { titulo, categoria, importancia, status, data, contexto, criterios, criadoEm: new Date().toISOString() });
    }
    document.getElementById('decisaoModal').classList.remove('active');
    await renderDecisoes();
  });

  function openDecisaoOpcaoModal(decId, opcaoId){
    decOpcaoEditingDecId = decId;
    decOpcaoEditingId = opcaoId || null;
    document.getElementById('decisaoOpcaoModalTitle').textContent = opcaoId ? 'Editar opção' : 'Nova opção';
    document.getElementById('decisaoOpcaoNomeInput').value = '';
    document.getElementById('decisaoOpcaoProsInput').value = '';
    document.getElementById('decisaoOpcaoContrasInput').value = '';
    if(opcaoId){
      dbGet(userPath('/Decisoes/' + decId + '/opcoes/' + opcaoId)).then(o => {
        if(!o) return;
        document.getElementById('decisaoOpcaoNomeInput').value = o.nome || '';
        document.getElementById('decisaoOpcaoProsInput').value = (o.pros || []).join('\n');
        document.getElementById('decisaoOpcaoContrasInput').value = (o.contras || []).join('\n');
      });
    }
    document.getElementById('decisaoOpcaoModal').classList.add('active');
  }
  document.getElementById('decisaoOpcaoCancelBtn').addEventListener('click', () => document.getElementById('decisaoOpcaoModal').classList.remove('active'));
  document.getElementById('decisaoOpcaoOkBtn').addEventListener('click', async () => {
    const nome = document.getElementById('decisaoOpcaoNomeInput').value.trim();
    if(!nome){ showAppMessage('Digite o nome da opção.', 'error'); return; }
    const pros = decParseLines(document.getElementById('decisaoOpcaoProsInput').value);
    const contras = decParseLines(document.getElementById('decisaoOpcaoContrasInput').value);
    const path = '/Decisoes/' + decOpcaoEditingDecId + '/opcoes/' + (decOpcaoEditingId || newId());
    await dbPut(userPath(path), { nome, pros, contras });
    document.getElementById('decisaoOpcaoModal').classList.remove('active');
    await renderDecisoes();
  });

  let decResultadoEditingId = null;
  async function openDecisaoResultadoModal(decId){
    decResultadoEditingId = decId;
    const d = await dbGet(userPath('/Decisoes/' + decId)) || {};
    const opcoes = Object.entries(d.opcoes || {});
    const sel = document.getElementById('decisaoResultadoEscolhaInput');
    sel.innerHTML = opcoes.length
      ? opcoes.map(([oid, o]) => `<option value="${oid}">${escapeHtml(o.nome)}</option>`).join('')
      : '<option value="">(nenhuma opção cadastrada — descreva na justificativa)</option>';
    if(d.resultado && d.resultado.escolhaOpcaoId) sel.value = d.resultado.escolhaOpcaoId;
    document.getElementById('decisaoResultadoJustificativaInput').value = d.resultado ? (d.resultado.justificativa || '') : '';
    document.getElementById('decisaoResultadoModal').classList.add('active');
  }
  document.getElementById('decisaoResultadoCancelBtn').addEventListener('click', () => document.getElementById('decisaoResultadoModal').classList.remove('active'));
  document.getElementById('decisaoResultadoOkBtn').addEventListener('click', async () => {
    const sel = document.getElementById('decisaoResultadoEscolhaInput');
    const escolhaOpcaoId = sel.value;
    const escolhaNome = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
    const justificativa = document.getElementById('decisaoResultadoJustificativaInput').value.trim();
    await dbPatch(userPath('/Decisoes/' + decResultadoEditingId), {
      resultado: { escolhaOpcaoId, escolhaNome, justificativa, data: todayStr() }
    });
    document.getElementById('decisaoResultadoModal').classList.remove('active');
    await renderDecisoes();
  });

  let decRevisaoEditingId = null;
  async function openDecisaoRevisaoModal(decId){
    decRevisaoEditingId = decId;
    const d = await dbGet(userPath('/Decisoes/' + decId)) || {};
    document.getElementById('decisaoRevisaoValeuInput').value = d.revisao ? d.revisao.valeu : 'sim';
    document.getElementById('decisaoRevisaoFariaInput').value = d.revisao ? d.revisao.faria : 'sim';
    document.getElementById('decisaoRevisaoConsequenciasInput').value = d.revisao ? (d.revisao.consequencias || '') : '';
    document.getElementById('decisaoRevisaoModal').classList.add('active');
  }
  document.getElementById('decisaoRevisaoCancelBtn').addEventListener('click', () => document.getElementById('decisaoRevisaoModal').classList.remove('active'));
  document.getElementById('decisaoRevisaoOkBtn').addEventListener('click', async () => {
    const valeu = document.getElementById('decisaoRevisaoValeuInput').value;
    const faria = document.getElementById('decisaoRevisaoFariaInput').value;
    const consequencias = document.getElementById('decisaoRevisaoConsequenciasInput').value.trim();
    await dbPatch(userPath('/Decisoes/' + decRevisaoEditingId), {
      revisao: { valeu, faria, consequencias, data: todayStr() }
    });
    document.getElementById('decisaoRevisaoModal').classList.remove('active');
    await renderDecisoes();
  });

  /* ---------- Decisões: padrões via IA ---------- */
  document.getElementById('decisaoPadroesBtn').addEventListener('click', async () => {
    if(!IA_PROXY_URL){ showAppMessage('As features de IA precisam da Cloud Function publicada.', 'error'); return; }
    const box = document.getElementById('decisaoPadroesBox');
    const data = await dbGet(userPath('/Decisoes')) || {};
    const entries = Object.entries(data);
    if(!entries.length){ showAppMessage('Registre ao menos uma decisão para a IA identificar padrões.', 'info'); return; }
    showLoading('Analisando padrões nas suas decisões...');
    try{
      const dump = entries.map(([id, d]) => ({
        titulo: d.titulo, categoria: d.categoria, importancia: d.importancia, status: d.status, data: d.data,
        contexto: d.contexto,
        criterios: Object.values(d.criterios || {}).map(c => c.nome + ' (peso ' + c.peso + ')'),
        opcoes: Object.values(d.opcoes || {}).map(o => o.nome),
        resultado: d.resultado ? { escolha: d.resultado.escolhaNome, justificativa: d.resultado.justificativa } : null,
        revisao: d.revisao ? { valeu: d.revisao.valeu, faria: d.revisao.faria, consequencias: d.revisao.consequencias } : null
      }));
      const systemPrompt = 'Você analisa um histórico de decisões pessoais de um usuário do app LifeOS e identifica padrões de comportamento na forma como ele decide. ' +
        'Responda em português, em 3 a 6 frases curtas e diretas, no estilo "Você costuma priorizar X ao invés de Y", "Decisões de categoria Z normalmente consideram W", "Suas decisões de tipo X costumam ser revistas após N meses". ' +
        'Baseie-se apenas nos dados fornecidos, sem inventar. Se houver poucos dados, diga isso brevemente e aponte o que já dá para notar.\n\nDecisões (JSON): ' + JSON.stringify(dump);
      const texto = (await chamarIA(systemPrompt, 'Analise as decisões acima e aponte os padrões.')).trim();
      box.innerHTML = '<button class="dec-padroes-close" id="decisaoPadroesCloseBtn">✕</button>✦ ' + escapeHtml(texto);
      box.style.display = 'block';
      document.getElementById('decisaoPadroesCloseBtn').addEventListener('click', () => { box.style.display = 'none'; });
    }catch(err){
      showAppMessage('Erro ao analisar padrões: ' + err.message, 'error');
    }finally{
      hideLoading();
    }
  });

  /* ---------- Busca Semântica (Perguntar ao LifeOS) ---------- */
  const BUSCA_TIPO_VIEW = { tarefas: 'tarefas', storage: 'storage', objetivos: 'objetivos', diario: 'diario', agenda: 'agenda', decisoes: 'decisoes' };
  const BUSCA_TIPO_LABEL = { tarefas: 'Tarefa', storage: 'Nota', objetivos: 'Objetivo', diario: 'Diário', agenda: 'Agenda', decisoes: 'Decisão' };

  function buscaTruncate(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  async function buscaColetarContexto(){
    const [tasks, notasAreas, notas, objetivos, diario, events, decisoes] = await Promise.all([
      dbGet(userPath('/Tasks')), dbGet(userPath('/NotasAreas')), dbGet(userPath('/Notas')),
      dbGet(userPath('/objetivos')), dbGet(userPath('/DiarioEntradas')), dbGet(userPath('/Events')),
      dbGet(userPath('/Decisoes'))
    ]);
    const ctx = {};
    ctx.tarefas = Object.values(tasks || {}).slice(-80).map(t => ({ nome: t.name, data: t.date, feita: !!t.done }));
    ctx.notasDoArquivo = Object.values(notas || {}).slice(-120).map(n => ({
      titulo: n.titulo, categoria: n.areaId && notasAreas ? (notasAreas[n.areaId] || {}).nome : null,
      conteudo: buscaTruncate(notasParaMarkdown(n), 300)
    }));
    ctx.objetivos = Object.values(objetivos || {}).map(o => ({
      nome: o.nome, descricao: o.descricao, categoria: o.categoria,
      pontos: Object.values(o.pontos || {}).map(p => p.nome)
    }));
    ctx.diario = Object.values(diario || {}).slice(-80).map(e => ({ data: (e.createdAt||'').slice(0,10), humor: e.mood, texto: buscaTruncate(e.text, 160) }));
    ctx.agenda = Object.values(events || {}).slice(-80).map(e => ({ titulo: e.title, data: e.date, hora: e.time }));
    ctx.decisoes = Object.values(decisoes || {}).map(d => ({
      titulo: d.titulo, categoria: d.categoria, status: d.status, data: d.data, contexto: buscaTruncate(d.contexto, 300),
      opcoes: Object.values(d.opcoes || {}).map(o => o.nome),
      resultado: d.resultado ? { escolha: d.resultado.escolhaNome, justificativa: d.resultado.justificativa } : null,
      revisao: d.revisao || null
    }));
    return ctx;
  }

  function buscaAppendMsg(role, html){
    const log = document.getElementById('buscaChatLog');
    const hint = log.querySelector('.busca-empty-hint');
    if(hint) hint.remove();
    const el = document.createElement('div');
    el.className = 'busca-msg ' + role;
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  async function buscaEnviarPergunta(){
    const input = document.getElementById('buscaChatInput');
    const pergunta = input.value.trim();
    if(!pergunta) return;
    if(!IA_PROXY_URL){ showAppMessage('As features de IA precisam da Cloud Function publicada.', 'error'); return; }

    buscaAppendMsg('user', escapeHtml(pergunta));
    input.value = '';
    const sendBtn = document.getElementById('buscaChatSendBtn');
    sendBtn.disabled = true;
    const loadingEl = buscaAppendMsg('ai loading', 'pensando...');

    try{
      const ctx = await buscaColetarContexto();
      const systemPrompt = 'Você é um assistente que responde perguntas em português sobre a vida pessoal de um usuário do LifeOS, usando apenas os dados fornecidos abaixo (tarefas, notas, objetivos, diário, agenda e decisões). ' +
        'Seja direto e específico, citando datas e nomes quando existirem. Se não houver informação suficiente, diga isso claramente em vez de inventar. ' +
        'Responda APENAS com um objeto JSON, sem markdown, no formato exato: {"resposta": "texto da resposta em português", "referencias": [{"tipo": "tarefas|storage|objetivos|diario|agenda|decisoes", "texto": "trecho curto de referência"}]}. ' +
        'Inclua no máximo 6 referências, só das fontes realmente usadas na resposta.\n\nDados do usuário (JSON): ' + JSON.stringify(ctx);

      const parsed = extractJson(await chamarIA(systemPrompt, pergunta));
      const resposta = parsed.resposta || '(sem resposta)';
      const refs = Array.isArray(parsed.referencias) ? parsed.referencias.slice(0, 6) : [];

      loadingEl.classList.remove('loading');
      loadingEl.innerHTML = escapeHtml(resposta) +
        (refs.length ? '<div class="busca-refs">' + refs.map(r => {
          const tipoKey = String(r.tipo || '').toLowerCase();
          const view = BUSCA_TIPO_VIEW[tipoKey] || BUSCA_TIPO_VIEW[r.tipo] || 'busca';
          const label = BUSCA_TIPO_LABEL[tipoKey] || BUSCA_TIPO_LABEL[r.tipo] || r.tipo || '';
          return `<span class="busca-ref-chip" data-view-link="${view}" title="${escapeHtml(r.texto || '')}">${escapeHtml(label)} → abrir</span>`;
        }).join('') + '</div>' : '');
      loadingEl.querySelectorAll('[data-view-link]').forEach(chip => chip.addEventListener('click', () => goToView(chip.getAttribute('data-view-link'))));
    }catch(err){
      loadingEl.classList.remove('loading');
      loadingEl.textContent = 'Erro ao consultar a IA: ' + err.message;
    }finally{
      sendBtn.disabled = false;
      document.getElementById('buscaChatLog').scrollTop = document.getElementById('buscaChatLog').scrollHeight;
    }
  }
  document.getElementById('buscaChatSendBtn').addEventListener('click', buscaEnviarPergunta);
  document.getElementById('buscaChatInput').addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); buscaEnviarPergunta(); }
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
      'EMAIL_NOT_FOUND':'Não existe conta com esse e-mail.',
      'INVALID_PASSWORD':'Senha incorreta.',
      'INVALID_LOGIN_CREDENTIALS':'E-mail ou senha incorretos — o Firebase usa a mesma mensagem para os dois. Confira o e-mail (dígito por dígito) e a senha.',
      'EMAIL_EXISTS':'Já existe uma conta com esse e-mail.',
      'WEAK_PASSWORD : Password should be at least 6 characters':'A senha deve ter ao menos 6 caracteres.',
      'MISSING_PASSWORD':'Digite uma senha.',
      'INVALID_EMAIL':'E-mail inválido.',
      'USER_DISABLED':'Esta conta foi desativada no Firebase.',
      'TOO_MANY_ATTEMPTS_TRY_LATER':'Muitas tentativas seguidas. O Firebase bloqueou o login temporariamente — espere ~30 minutos e tente uma vez só.',
      'OPERATION_NOT_ALLOWED':'Login por e-mail/senha está desativado no projeto Firebase.',
    };
    for(const k in map){ if(msg && msg.indexOf(k) !== -1) return map[k]; }
    return msg || 'Não foi possível concluir. Tente novamente.';
  }

  async function afterLoginSuccess(data){
    saveSession({
      idToken: data.idToken,
      refreshToken: data.refreshToken, // sem isso a sessão morre em 1h e não volta
      uid: data.localId,
      email: data.email,
      expiresAt: Date.now() + (parseInt(data.expiresIn || '3600', 10) * 1000) - 60000
    });
    dbCacheClear();
    activeDataUid = session.uid;
    currentBoardId = session.uid;
    await dbPatch('/users/' + session.uid + '/Profile', { Email: data.email, LastLogin: new Date().toISOString() });
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appShell').style.display = '';
    document.body.classList.add('app-ativo');
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

  // Mostrar / ocultar senha
  const authPassToggle = document.getElementById('authPassToggle');
  if(authPassToggle){
    authPassToggle.addEventListener('click', () => {
      const revelar = authPassword.type === 'password';
      authPassword.type = revelar ? 'text' : 'password';
      authPassToggle.textContent = revelar ? 'ocultar' : 'mostrar';
      authPassToggle.setAttribute('aria-label', revelar ? 'Ocultar senha' : 'Mostrar senha');
      authPassToggle.setAttribute('aria-pressed', revelar ? 'true' : 'false');
      authPassword.focus();
    });
  }

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

  const AUTH_EMAILS_PERMITIDOS = ['guittk@hotmail.com', 'julialealdecamargo@hotmail.com'];
  authSubmitBtn.addEventListener('click', async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;
    authError.classList.remove('active'); authNote.classList.remove('active');
    if(!email){ authError.textContent = 'Digite seu e-mail.'; authError.classList.add('active'); return; }
    if(!AUTH_EMAILS_PERMITIDOS.includes(email.toLowerCase())){
      authError.textContent = 'Este e-mail não tem acesso a este app.';
      authError.classList.add('active');
      return;
    }
    authSubmitBtn.disabled = true;
    try{
      if(authMode === 'login' || authMode === 'signup'){
        if(!password){ throw new Error(authMode === 'signup' ? 'Crie uma senha.' : 'Digite sua senha.'); }
        // Fase de AUTENTICAÇÃO: falha aqui é credencial errada.
        const kind = authMode === 'signup' ? 'signUp' : 'signInWithPassword';
        const data = await identityRequest(kind, email, password);

        if(authMode === 'signup'){
          // Define a sessão ANTES de gravar no Firebase — buildUrl() depende de
          // session.idToken para autenticar a escrita.
          session = { idToken: data.idToken, refreshToken: data.refreshToken, uid: data.localId, email, expiresAt: Date.now() + 3600000 };
        }

        // Fase de INÍCIO DE SESSÃO: a credencial já está certa. Uma falha daqui
        // pra frente (rede, regras do banco, boot) NÃO é "e-mail ou senha
        // incorretos" — mostrar isso mandaria você trocar a senha à toa.
        try{
          if(authMode === 'signup'){
            await dbPut(('/users/' + data.localId + '/Profile'), { Email: email, CreatedAt: new Date().toISOString(), LastLogin: new Date().toISOString() });
          }
          await afterLoginSuccess(data);
        }catch(bootErr){
          console.error('Autenticou, mas falhou ao abrir a sessão:', bootErr);
          // A sessão já foi salva por afterLoginSuccess/aqui — dá pra recarregar.
          authError.textContent = 'Você entrou, mas algo falhou ao carregar seus dados: ' +
            (bootErr && bootErr.message || 'erro desconhecido') + '. Recarregue a página.';
          authError.classList.add('active');
          return;
        }
      } else if(authMode === 'reset'){
        showLoading('Enviando...');
        try{
          const url = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FIREBASE_API_KEY;
          const res = await fetch(url, {
            method:'POST', headers:{'Content-Type':'application/json'},
            // continueUrl faz o link de redefinição voltar para este domínio.
            body: JSON.stringify({ requestType:'PASSWORD_RESET', email, continueUrl: location.origin + '/index.html' })
          });
          const data = await res.json();
          if(!res.ok) throw new Error((data.error && data.error.message) || 'Erro ao enviar e-mail.');
          // O Firebase responde 200 mesmo quando a conta não existe (proteção
          // contra enumeração) — então "enviado" aqui não garante que chegou.
          authNote.textContent = 'Se existir uma conta com esse e-mail, o link chega em alguns minutos. Verifique também o spam.';
          authNote.classList.add('active');
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
    pop.innerHTML = COR_PRINCIPAL_PRESETS.map(hex =>
      `<button type="button" class="cor-swatch-option" data-cor="${hex}" style="background:${hex};" aria-label="${hex}"></button>`).join('');
    pop.querySelectorAll('[data-cor]').forEach(btn => btn.addEventListener('click', () => {
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
      // O tema vem antes da cor: applyCorPrincipal ajusta o acento conforme o
      // fundo, então aplicar na ordem errada calcularia pro tema errado.
      if(config.tema){
        applyTheme(config.tema);
        localStorage.setItem(THEME_KEY, config.tema);
      }
      if(config.corPrincipal){
        applyCorPrincipal(config.corPrincipal);
        localStorage.setItem('corPrincipal', config.corPrincipal);
      }
    } catch(e){ /* mantém tema e cor já aplicados a partir do localStorage */ }
  }

  // Seletor de tema em Configurações → Aparência
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => escolherTema(btn.getAttribute('data-theme-mode')));
  });

  // Notificações — Configurações → Aparência
  const notificacoesBtn = document.getElementById('notificacoesBtn');
  if(notificacoesBtn){
    notificacoesBtn.addEventListener('click', async () => {
      if(notificacoesLigadas()){
        localStorage.setItem(NOTIF_KEY, 'nao');
        atualizarBotaoNotificacoes();
        showAppMessage('Notificações desativadas.', 'info');
        return;
      }
      if(await pedirPermissaoNotificacoes()) iniciarAgendadorDeAvisos();
    });
  }

  /* ---------- Proteção contra sobrescrita entre dispositivos ----------
     Rotina, Academia e Plano Alimentar funcionam por rascunho: você carrega,
     edita, e o Salvar grava a árvore inteira por cima. Se outro dispositivo
     (ou a Júlia, num Quadro compartilhado) tiver mexido no intervalo, aquele
     trabalho sumia em silêncio.

     Aqui a versão remota é lida no momento do Salvar e comparada com a que
     estava na tela. Divergiu, você decide — não é resolvido automaticamente,
     porque mesclar rascunhos errado é pior que perguntar. */
  const versoesCarregadas = new Map();

  function assinaturaDe(valor){
    try{ return JSON.stringify(valor || {}).length + ':' + JSON.stringify(valor || {}).slice(0, 200); }
    catch(e){ return ''; }
  }
  async function registrarVersaoCarregada(caminho){
    try{ versoesCarregadas.set(caminho, assinaturaDe(await dbGet(userPath(caminho)))); }
    catch(e){ versoesCarregadas.delete(caminho); }
  }
  function marcarVersaoSalva(caminho){ versoesCarregadas.delete(caminho); }

  async function confirmarSobrescrita(caminho, rotulo){
    const base = versoesCarregadas.get(caminho);
    if(base === undefined) return true;   // nunca registrado: nada a comparar
    let atual;
    try{ atual = assinaturaDe(await dbGet(userPath(caminho), { fresh: true })); }
    catch(e){ return true; }              // sem conseguir ler, não trava o salvamento
    if(atual === base) return true;
    return await showConfirm(
      rotulo.charAt(0).toUpperCase() + rotulo.slice(1) +
      ' foi alterada em outro dispositivo depois que você abriu esta tela. ' +
      'Salvar agora substitui aquela versão pela sua. Continuar?'
    );
  }

  /* ---------- Exportar todos os dados ----------
     Uma ferramenta que quer ser fonte única da verdade precisa deixar você
     sair dela. Baixa a subárvore inteira do Quadro ativo, sem passar por
     servidor nenhum: o JSON é montado no navegador e salvo direto. */
  document.getElementById('exportarDadosBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('exportarDadosBtn');
    const textoOriginal = btn.textContent;
    btn.disabled = true; btn.textContent = 'Preparando...';
    try{
      // Uma leitura só na raiz do usuário: traz tudo de uma vez e evita
      // dezenas de requisições com risco de exportar um estado inconsistente.
      const dados = await dbGet(userPath(''), { fresh: true });
      const pacote = {
        exportadoEm: new Date().toISOString(),
        quadro: (myBoards[currentBoardId] && myBoards[currentBoardId].name) || currentBoardId,
        conta: session && session.email,
        dados: dados || {}
      };
      const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lifeos-' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoga depois do clique: revogar antes cancelaria o download.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showAppMessage('Exportado.', 'success');
    }catch(err){
      console.error('Falha ao exportar:', err);
      showAppMessage('Não foi possível exportar: ' + err.message, 'error');
    }finally{
      btn.disabled = false; btn.textContent = textoOriginal;
    }
  });

  /* ---------- NOTAS (Arquivo — mural de notas, portado do projeto Organizer) ----------
     Substitui Inbox + Gavetas + Revisão IA: um mural de cards, cada um com itens
     tipados (seção, texto, marcador, tarefa, passo, link, divisor) escritos como um
     texto solto por card — sem tela separada por nota. A triagem automática por IA
     fica pra depois (ver conversa) — por ora a captura cria a nota direto, ou divide
     por parágrafo em várias de uma vez ("Dividir em várias", sem IA nenhuma). */

  const NOTAS_URL_RE = /^https?:\/\/[^\s]+$/i;
  const NOTAS_BARE_DOMAIN_RE = /^(www\.)?[a-z0-9-]+\.[a-z]{2,}([/?#][^\s]*)?$/i;
  function notasIsUrlOnly(text){
    const t = String(text || '').trim();
    if(!t || /\s/.test(t)) return false;
    return NOTAS_URL_RE.test(t) || NOTAS_BARE_DOMAIN_RE.test(t);
  }
  function notasNormalizeUrl(raw){
    let t = String(raw || '').trim();
    if(!t) return null;
    if(/^(javascript|data):/i.test(t)) return null;
    if(!/^https?:\/\//i.test(t)) t = 'https://' + t;
    try{ new URL(t); }catch(e){ return null; }
    return t;
  }
  function notasDomainFromUrl(url){
    try{ return new URL(url).hostname.replace(/^www\./, ''); }
    catch(e){ return url; }
  }
  // Reconhece o marcador de uma linha já sem indentação; null = texto solto (vira
  // continuação do item anterior — ver notasMarkdownParaItens).
  function notasDetectLineTipo(trimmed){
    let m;
    if((m = trimmed.match(/^#{1,3}\s+(.*)$/))) return { tipo:'secao', texto:m[1].trim() };
    if((m = trimmed.match(/^\[([ xX])\]\s+(.*)$/))) return { tipo:'tarefa', texto:m[2].trim(), feito:/x/i.test(m[1]) };
    if((m = trimmed.match(/^[•\-\*]\s+(.*)$/))) return { tipo:'bullet', texto:m[1].trim() };
    if((m = trimmed.match(/^\d+[.)]\s+(.*)$/))) return { tipo:'passo', texto:m[1].trim() };
    if(/^-{3,}$|^—{2,}$/.test(trimmed)) return { tipo:'divisor', texto:'' };
    if(notasIsUrlOnly(trimmed)){
      const url = notasNormalizeUrl(trimmed);
      if(url) return { tipo:'link', texto:url, url };
    }
    return null;
  }
  // Texto colado/digitado → lista de itens (sem id/ordem — quem grava atribui).
  // Indentação de 2 espaços (ou 1 tab) vira nível, até 3. Linhas contíguas sem
  // marcador se juntam ao item anterior.
  function notasMarkdownParaItens(rawText){
    const lines = String(rawText || '').replace(/\r\n?/g, '\n').split('\n');
    const itens = [];
    let current = null;
    let linhaVaziaPendente = false;
    function flush(){ if(current && current.texto.trim()) itens.push(current); current = null; }
    lines.forEach((line) => {
      if(!line.trim()){ flush(); if(itens.length) linhaVaziaPendente = true; return; }
      const indentLen = (line.match(/^(\s*)/)[1]).replace(/\t/g, '  ').length;
      const nivel = Math.min(3, Math.floor(indentLen / 2));
      const trimmed = line.trim();
      const parsed = notasDetectLineTipo(trimmed);
      if(parsed){
        flush();
        current = { tipo:parsed.tipo, texto:parsed.texto, nivel, feito:!!parsed.feito, url:parsed.url || null, linhaVaziaAntes:linhaVaziaPendente };
        linhaVaziaPendente = false;
      } else if(current){
        current.texto += '\n' + trimmed;
      } else {
        current = { tipo:'texto', texto:trimmed, nivel, feito:false, url:null, linhaVaziaAntes:linhaVaziaPendente };
        linhaVaziaPendente = false;
      }
    });
    flush();
    return itens;
  }
  function notasLinePrefix(item){
    switch(item.tipo){
      case 'secao': return '# ';
      case 'tarefa': return '[' + (item.feito ? 'x' : ' ') + '] ';
      case 'bullet': return '• ';
      case 'passo': return '1. ';
      default: return '';
    }
  }
  function notasItemParaLinhas(item){
    if(item.tipo === 'divisor') return ['---'];
    const indent = '  '.repeat(item.nivel || 0);
    const linhas = String(item.texto || '').split('\n');
    const prefix = notasLinePrefix(item);
    return linhas.map((l, i) => indent + (i === 0 ? prefix : ' '.repeat(prefix.length)) + l);
  }
  function notasOrdenados(itensObj){
    return Object.values(itensObj || {}).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  function notasParaMarkdown(nota){
    return notasOrdenados(nota.itens).flatMap((item, i) => {
      const linhas = notasItemParaLinhas(item);
      return item.linhaVaziaAntes && i > 0 ? [''].concat(linhas) : linhas;
    }).join('\n');
  }
  // Divide um texto cru em blocos por linha em branco — usado por "Dividir em
  // várias" na barra de captura: cada bloco vira uma nota própria.
  function notasSplitEmBlocos(rawText){
    return String(rawText || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  function notasTituloAutomatico(linha){
    const t = String(linha || '').replace(/^[•\-\*]\s*/, '').replace(/^\[[ xX]\]\s*/, '').trim();
    if(t.length <= 42) return t || 'Sem título';
    const cut = t.slice(0, 42);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  /* ---------- Estado + persistência (RTDB: /Notas e /NotasAreas) ---------- */
  const NOTAS_MODO_KEY = 'lifeosNotasModo';
  const NOTAS_COLUNAS_KEY = 'lifeosNotasColunas';
  const NOTAS_PALETA = ['#60519b','#0a7386','#4f8f0c','#a86a00','#c62b4a','#8b5cf6','#1f5c8b','#b0537a'];
  let notasState = { areas:{}, notas:{}, loaded:false };

  async function notasCarregarEstado(){
    const [areas, notas] = await Promise.all([dbGet(userPath('/NotasAreas')), dbGet(userPath('/Notas'))]);
    notasState = { areas: areas || {}, notas: notas || {}, loaded:true };
    return notasState;
  }
  function notasNaArea(areaId){
    return Object.values(notasState.notas).filter(n => (n.areaId || null) === areaId);
  }
  function notasOrdemManualDe(n){ return n.ordemManual || new Date(n.criadoEm || 0).getTime(); }
  function notasSortedList(){
    return Object.values(notasState.notas)
      .sort((a, b) => { if(!!a.fixada !== !!b.fixada) return a.fixada ? -1 : 1; return notasOrdemManualDe(a) - notasOrdemManualDe(b); });
  }
  async function notasCreateArea(nome, cor){
    const areas = Object.values(notasState.areas);
    const area = { id:newId(), nome: nome || 'Nova categoria', cor: cor || NOTAS_PALETA[areas.length % NOTAS_PALETA.length], ordem: areas.length };
    notasState.areas[area.id] = area;
    await dbPutSilent(userPath('/NotasAreas/' + area.id), area);
    return area;
  }
  async function notasUpdateArea(id, patch){
    if(!notasState.areas[id]) return;
    notasState.areas[id] = { ...notasState.areas[id], ...patch };
    await dbPatchSilent(userPath('/NotasAreas/' + id), patch);
  }
  async function notasDeleteArea(id){
    delete notasState.areas[id];
    await dbDeleteSilent(userPath('/NotasAreas/' + id));
  }
  async function notasCreateNota(areaId, titulo){
    const now = new Date().toISOString();
    const nota = { id:newId(), areaId: areaId || null, titulo: titulo || '', icone:'📝', itens:{}, fixada:false, criadoEm:now, atualizadoEm:now, ordemManual: Date.now() };
    notasState.notas[nota.id] = nota;
    await dbPutSilent(userPath('/Notas/' + nota.id), nota);
    return nota;
  }
  async function notasCreateNotaComTexto(areaId, textoBruto){
    const itensArr = notasMarkdownParaItens(textoBruto);
    const now = new Date().toISOString();
    const itens = {};
    itensArr.forEach((it, i) => { const id = newId(); itens[id] = { id, ordem:i, criadoEm:now, ...it }; });
    const primeiraLinha = String(textoBruto || '').split('\n').find(l => l.trim()) || '';
    const nota = { id:newId(), areaId: areaId || null, titulo: notasTituloAutomatico(primeiraLinha), icone:'📝', itens, fixada:false, criadoEm:now, atualizadoEm:now, ordemManual: Date.now() };
    notasState.notas[nota.id] = nota;
    await dbPutSilent(userPath('/Notas/' + nota.id), nota);
    return nota;
  }
  async function notasUpdateNota(id, patch){
    if(!notasState.notas[id]) return;
    const atualizadoEm = new Date().toISOString();
    notasState.notas[id] = { ...notasState.notas[id], ...patch, atualizadoEm };
    await dbPatchSilent(userPath('/Notas/' + id), { ...patch, atualizadoEm });
  }
  async function notasSubstituirItens(id, textoBruto){
    const nota = notasState.notas[id];
    if(!nota) return;
    const itensArr = notasMarkdownParaItens(textoBruto);
    const now = new Date().toISOString();
    const itens = {};
    itensArr.forEach((it, i) => { const itemId = newId(); itens[itemId] = { id:itemId, ordem:i, criadoEm:now, ...it }; });
    nota.itens = itens;
    nota.atualizadoEm = now;
    await dbPutSilent(userPath('/Notas/' + id), nota);
  }
  async function notasUpdateItem(notaId, itemId, patch){
    const nota = notasState.notas[notaId];
    if(!nota || !nota.itens[itemId]) return;
    nota.itens[itemId] = { ...nota.itens[itemId], ...patch };
    await dbPatchSilent(userPath('/Notas/' + notaId + '/itens/' + itemId), patch);
  }
  async function notasDeleteNota(id){
    delete notasState.notas[id];
    await dbDeleteSilent(userPath('/Notas/' + id));
  }
  async function notasReordenarNota(idArrastado, idAlvo){
    const lista = notasSortedList().filter(n => n.id !== idArrastado);
    const idxAlvo = idAlvo ? lista.findIndex(n => n.id === idAlvo) : lista.length;
    const antes = idxAlvo > 0 ? lista[idxAlvo - 1] : null;
    const depois = idxAlvo >= 0 && idxAlvo < lista.length ? lista[idxAlvo] : null;
    const ordemAntes = antes ? notasOrdemManualDe(antes) : Date.now() - 1e10;
    const ordemDepois = depois ? notasOrdemManualDe(depois) : Date.now();
    await notasUpdateNota(idArrastado, { ordemManual: (ordemAntes + ordemDepois) / 2 });
  }

  /* ---------- Board (mural de cards) ---------- */
  let notasContainerEl = null;
  let notasModoEdicao = localStorage.getItem(NOTAS_MODO_KEY) === 'edicao';
  let notasFiltroAreaIds = new Set();
  let notasModoSelecao = false;
  let notasSelecionados = new Set();
  let notasIsolando = false;
  let notasFocarId = null;
  let notasMaxColunas = Math.min(4, Math.max(2, parseInt(localStorage.getItem(NOTAS_COLUNAS_KEY), 10) || 3));
  let notasCardFocadoId = null;
  let notasItemSelecionadoId = null;

  function notasAutoGrow(ta){ ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function notasAlgumOutroModalAberto(){
    return (searchModal && searchModal.classList.contains('active')) || !!document.querySelector('.confirm-modal.active');
  }
  function notasAplicarFiltroArea(v, comShift){
    if(comShift && v){
      if(notasFiltroAreaIds.has(v)) notasFiltroAreaIds.delete(v); else notasFiltroAreaIds.add(v);
    } else {
      notasFiltroAreaIds = new Set(v ? [v] : []);
    }
    notasIsolando = false;
  }
  function notasFiltradas(){
    let lista = notasSortedList();
    if(notasIsolando) lista = lista.filter(n => notasSelecionados.has(n.id));
    else if(notasFiltroAreaIds.size) lista = lista.filter(n => notasFiltroAreaIds.has(n.areaId || '__sem__'));
    return lista;
  }
  function notasPeso(nota){
    const itens = Object.values(nota.itens || {});
    let peso = 1.5;
    itens.forEach(item => { peso += 1 + Math.floor((item.texto || '').length / 40); });
    return peso;
  }
  function notasDistribuirEmColunas(lista, n){
    const colunas = Array.from({ length:n }, () => []);
    const pesos = new Array(n).fill(0);
    lista.forEach(item => {
      let idx = 0;
      for(let i = 1; i < n; i++) if(pesos[i] < pesos[idx]) idx = i;
      colunas[idx].push(item);
      pesos[idx] += notasPeso(item);
    });
    return colunas;
  }
  function notasLinhaTexto(texto){ return escapeHtml(texto).replace(/\n/g, '<br>'); }
  function notasCorpoVisualizacaoHtml(nota){
    const itens = notasOrdenados(nota.itens);
    if(!itens.length) return '<div class="l-vazio">Nota vazia — mude pra "Editar" pra escrever.</div>';
    let passoN = 0;
    return itens.map(item => {
      const nivel = ' style="margin-left:' + (item.nivel || 0) * 14 + 'px"';
      const base = (extra) => 'class="l-item' + (item.linhaVaziaAntes ? ' espaco-antes' : '') + (extra ? ' ' + extra : '') + '" data-item-id="' + item.id + '"' + nivel;
      if(item.tipo === 'secao') return '<div ' + base('l-secao') + '>' + notasLinhaTexto(item.texto) + '</div>';
      if(item.tipo === 'divisor') return '<div ' + base('l-divisor') + '></div>';
      if(item.tipo === 'tarefa'){
        return '<label ' + base('l-tarefa' + (item.feito ? ' feito' : '')) + '>' +
          '<input type="checkbox" ' + (item.feito ? 'checked' : '') + ' data-toggle-tarefa="' + item.id + '">' +
          '<span>' + notasLinhaTexto(item.texto) + '</span></label>';
      }
      if(item.tipo === 'link'){
        const dom = notasDomainFromUrl(item.texto);
        return '<div ' + base('') + '><a class="l-link" href="' + escapeHtml(item.texto) + '" target="_blank" rel="noopener">' +
          notasLinhaTexto(item.texto) + '</a> <span style="opacity:.5">' + escapeHtml(dom) + '</span></div>';
      }
      if(item.tipo === 'passo'){ passoN++; return '<div ' + base('l-passo') + '><span class="marca">' + passoN + '.</span><span>' + notasLinhaTexto(item.texto) + '</span></div>'; }
      if(item.tipo === 'bullet') return '<div ' + base('l-bullet') + '><span class="marca">•</span><span>' + notasLinhaTexto(item.texto) + '</span></div>';
      return '<div ' + base('') + '>' + notasLinhaTexto(item.texto) + '</div>';
    }).join('');
  }
  function notasProgressoHtml(nota){
    const tarefas = notasOrdenados(nota.itens).filter(i => i.tipo === 'tarefa');
    if(!tarefas.length) return '';
    const feitas = tarefas.filter(t => t.feito).length;
    const totalDots = Math.min(tarefas.length, 12);
    const razao = feitas / tarefas.length;
    const dots = Array.from({ length: totalDots }).map((_, i) => (
      '<span class="dot' + ((i + 1) / totalDots <= razao + 0.0001 ? ' feito' : '') + '"></span>'
    )).join('');
    return '<div class="board-card-progresso"><div class="dots">' + dots + '</div><span class="pct">' + feitas + '/' + tarefas.length + '</span></div>';
  }
  function notasCardHtml(nota){
    const area = nota.areaId ? notasState.areas[nota.areaId] : null;
    const cor = area ? area.cor : null;
    const tocada = nota.atualizadoEm && Date.now() - new Date(nota.atualizadoEm).getTime() < 6000;
    const sel = notasSelecionados.has(nota.id);
    const totalItens = Object.keys(nota.itens || {}).length;
    return (
      '<div class="board-card' + (tocada ? ' flash-new' : '') + (notasModoSelecao ? ' modo-selecao' : '') + (sel ? ' selecionado' : '') +
      (nota.id === notasCardFocadoId ? ' card-focado' : '') +
      '" style="--card-cor:' + (cor || 'var(--text-dim)') + '" data-nota-id="' + nota.id + '" draggable="' + (!notasModoSelecao) + '">' +
      (area ? '<span class="board-card-cat-badge">' + escapeHtml(area.nome) + '</span>' : '') +
      (totalItens ? '<span class="board-card-count-badge">' + totalItens + (totalItens === 1 ? ' item' : ' itens') + '</span>' : '') +
      '<div class="board-card-top">' +
      '<span class="board-card-icon-check" data-select="1"></span>' +
      '<button type="button" tabindex="-1" class="board-card-pin-btn' + (nota.fixada ? ' on' : '') + '" data-pin="1" title="' + (nota.fixada ? 'Desfixar' : 'Fixar') + '">📌</button>' +
      '<button type="button" tabindex="-1" class="board-card-menu-btn" data-menu="1" title="Mais">⋯</button>' +
      '</div>' +
      '<div class="board-card-titulo-row">' +
      '<button type="button" tabindex="-1" class="board-card-icone-btn" data-icone-item="' + nota.id + '" title="Mudar ícone">' + escapeHtml(nota.icone || '📝') + '</button>' +
      (notasModoEdicao
        ? '<input class="board-card-titulo-input" data-titulo="1" placeholder="Sem título" value="' + escapeHtml(nota.titulo || '') + '">'
        : '<div class="board-card-titulo-texto">' + escapeHtml(nota.titulo || 'Sem título') + '</div>') +
      '</div>' +
      (notasModoEdicao
        ? '<textarea class="board-card-textarea" data-corpo="1" rows="1">' + escapeHtml(notasParaMarkdown(nota)) + '</textarea>'
        : '<div class="board-card-corpo">' + notasCorpoVisualizacaoHtml(nota) + '</div>') +
      notasProgressoHtml(nota) +
      '</div>'
    );
  }
  function notasConverterBulletAoDigitar(textarea){
    if(textarea.selectionStart !== textarea.selectionEnd) return;
    const pos = textarea.selectionStart;
    const value = textarea.value;
    const inicioLinha = value.lastIndexOf('\n', pos - 1) + 1;
    const linhaAteCursor = value.slice(inicioLinha, pos);
    if(!/^[*-] $/.test(linhaAteCursor)) return;
    textarea.value = value.slice(0, inicioLinha) + '• ' + value.slice(pos);
    const novaPos = inicioLinha + 2;
    textarea.setSelectionRange(novaPos, novaPos);
  }
  function notasLimitesDoBloco(value, selStart, selEnd){
    const inicio = value.lastIndexOf('\n', selStart - 1) + 1;
    let fimBusca = selEnd;
    if(selEnd > selStart && value[selEnd - 1] === '\n') fimBusca = selEnd - 1;
    let fim = value.indexOf('\n', fimBusca);
    if(fim === -1) fim = value.length;
    return { inicio, fim };
  }
  function notasIndentarSelecao(textarea, indentar){
    const value = textarea.value;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;
    const { inicio, fim } = notasLimitesDoBloco(value, selStart, selEnd);
    const trecho = value.slice(inicio, fim);
    const linhas = trecho.split('\n');
    let deltaPrimeira = 0;
    const novasLinhas = linhas.map((linha, i) => {
      if(indentar){ if(i === 0) deltaPrimeira = 2; return '  ' + linha; }
      let remover = 0;
      if(linha.startsWith('  ')) remover = 2;
      else if(linha.startsWith('\t') || linha.startsWith(' ')) remover = 1;
      if(i === 0) deltaPrimeira = -remover;
      return linha.slice(remover);
    });
    const novoTrecho = novasLinhas.join('\n');
    const deltaTotal = novoTrecho.length - trecho.length;
    textarea.value = value.slice(0, inicio) + novoTrecho + value.slice(fim);
    const novoSelStart = Math.max(inicio, selStart + deltaPrimeira);
    const novoSelEnd = Math.max(novoSelStart, selEnd + deltaTotal);
    textarea.setSelectionRange(novoSelStart, novoSelEnd);
    notasAutoGrow(textarea);
  }
  async function notasSalvarCorpo(notaId, textarea){
    const nota = notasState.notas[notaId];
    if(!nota) return;
    if(textarea.value === notasParaMarkdown(nota)) return;
    await notasSubstituirItens(notaId, textarea.value);
  }
  function notasToggleSelecao(notaId){
    if(notasSelecionados.has(notaId)) notasSelecionados.delete(notaId); else notasSelecionados.add(notaId);
    notasRender();
  }
  function notasFocarCard(notaId, itemId){
    notasCardFocadoId = notaId;
    notasItemSelecionadoId = itemId;
    notasRender();
  }
  function notasAplicarFocoNoDOM(){
    notasContainerEl.querySelectorAll('.board-card.card-focado').forEach(el => el.classList.remove('card-focado'));
    notasContainerEl.querySelectorAll('.l-item.selecionado').forEach(el => el.classList.remove('selecionado'));
    if(!notasCardFocadoId) return;
    const card = notasContainerEl.querySelector('[data-nota-id="' + notasCardFocadoId + '"]');
    if(!card){ notasCardFocadoId = null; notasItemSelecionadoId = null; return; }
    card.classList.add('card-focado');
    if(notasItemSelecionadoId){
      const item = card.querySelector('[data-item-id="' + notasItemSelecionadoId + '"]');
      if(item){ item.classList.add('selecionado'); item.scrollIntoView({ block:'nearest' }); }
    }
  }
  function notasMoverSelecao(delta){
    const nota = notasState.notas[notasCardFocadoId];
    if(!nota) return;
    const itens = notasOrdenados(nota.itens);
    if(!itens.length) return;
    const idxAtual = itens.findIndex(i => i.id === notasItemSelecionadoId);
    const novoIdx = idxAtual === -1 ? 0 : Math.min(itens.length - 1, Math.max(0, idxAtual + delta));
    notasItemSelecionadoId = itens[novoIdx].id;
    notasAplicarFocoNoDOM();
  }
  function notasOnKeydownNavegacao(e){
    if(notasModoEdicao || notasModoSelecao || !notasCardFocadoId) return;
    if(!notasContainerEl || !notasContainerEl.offsetParent) return; // view Arquivo não está aberta
    const tag = document.activeElement && document.activeElement.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA') return;
    if(notasAlgumOutroModalAberto()) return;
    if(e.key === 'ArrowDown'){ e.preventDefault(); notasMoverSelecao(1); return; }
    if(e.key === 'ArrowUp'){ e.preventDefault(); notasMoverSelecao(-1); return; }
    if(e.key === 'Escape'){ e.preventDefault(); notasCardFocadoId = null; notasItemSelecionadoId = null; notasAplicarFocoNoDOM(); return; }
    if(e.key === ' ' && notasItemSelecionadoId){
      const nota = notasState.notas[notasCardFocadoId];
      const item = nota && nota.itens[notasItemSelecionadoId];
      if(item && item.tipo === 'tarefa'){ e.preventDefault(); notasUpdateItem(notasCardFocadoId, notasItemSelecionadoId, { feito: !item.feito }).then(notasRender); }
      return;
    }
  }
  document.addEventListener('keydown', notasOnKeydownNavegacao);
  document.addEventListener('click', (e) => {
    if(!notasCardFocadoId || e.target.closest('.board-card')) return;
    notasCardFocadoId = null; notasItemSelecionadoId = null;
    if(notasContainerEl) notasAplicarFocoNoDOM();
  });

  function notasFecharPops(){ document.querySelectorAll('.board-card-pop, .color-picker').forEach(el => el.remove()); }

  const NOTAS_ICONES = ['📝','💡','📌','✅','📋','📚','🎯','💰','🏠','🍽️','🎬','🎮','💻','🔧','🌱','❤️','⭐','🗓️','✈️','🎨'];
  function notasAbrirIconePopover(anchorEl, onEscolher){
    notasFecharPops();
    const pop = document.createElement('div');
    pop.className = 'board-card-pop notas-icone-pop';
    pop.innerHTML = NOTAS_ICONES.map(ic => '<button type="button" class="notas-icone-opcao" data-icone="' + ic + '">' + ic + '</button>').join('');
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 210) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    function fechar(){ pop.remove(); document.removeEventListener('click', onDoc); }
    function onDoc(e){ if(!pop.contains(e.target) && e.target !== anchorEl) fechar(); }
    pop.querySelectorAll('[data-icone]').forEach(btn => {
      btn.addEventListener('click', () => { fechar(); onEscolher(btn.getAttribute('data-icone')); });
    });
    setTimeout(() => document.addEventListener('click', onDoc), 10);
  }
  function notasAbrirCategoriaPopover(anchorEl, onEscolher){
    notasFecharPops();
    const areas = Object.values(notasState.areas).sort((a,b) => (a.ordem||0) - (b.ordem||0));
    const pop = document.createElement('div');
    pop.className = 'board-card-pop';
    pop.innerHTML =
      '<div class="cat-item" data-cat=""><span class="dot" style="background:var(--text-dim)"></span>Sem categoria</div>' +
      areas.map(a => '<div class="cat-item" data-cat="' + a.id + '"><span class="dot" style="background:' + a.cor + '"></span>' + escapeHtml(a.nome) + '</div>').join('');
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 210) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    function fechar(){ pop.remove(); document.removeEventListener('click', onDoc); }
    function onDoc(e){ if(!pop.contains(e.target) && e.target !== anchorEl) fechar(); }
    pop.querySelectorAll('.cat-item').forEach(el => {
      el.addEventListener('click', () => { fechar(); onEscolher(el.getAttribute('data-cat') || null); });
    });
    setTimeout(() => document.addEventListener('click', onDoc), 10);
  }

  function notasAbrirMenuCard(anchorEl, nota){
    notasFecharPops();
    const pop = document.createElement('div');
    pop.className = 'board-card-pop';
    const areas = Object.values(notasState.areas).sort((a,b) => (a.ordem||0) - (b.ordem||0));
    pop.innerHTML =
      '<div class="cat-item" data-cat=""><span class="dot" style="background:var(--text-dim)"></span>Sem categoria</div>' +
      areas.map(a => '<div class="cat-item" data-cat="' + a.id + '"><span class="dot" style="background:' + a.cor + '"></span>' + escapeHtml(a.nome) + '</div>').join('') +
      '<hr>' +
      '<button type="button" data-act="excluir" class="danger">Excluir</button>';
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 210) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    function fechar(){ pop.remove(); document.removeEventListener('click', onDoc); }
    function onDoc(e){ if(!pop.contains(e.target) && e.target !== anchorEl) fechar(); }
    pop.querySelectorAll('.cat-item').forEach(el => {
      el.addEventListener('click', () => { fechar(); notasUpdateNota(nota.id, { areaId: el.getAttribute('data-cat') || null }).then(() => { notasRender(); notasRenderChips(); }); });
    });
    pop.querySelector('[data-act="excluir"]').addEventListener('click', async () => {
      fechar();
      const ok = await showConfirm('Excluir "' + (nota.titulo || 'sem título') + '"? Essa ação não pode ser desfeita.');
      if(!ok) return;
      await notasDeleteNota(nota.id);
      notasRender();
      notasRenderChips();
    });
    setTimeout(() => document.addEventListener('click', onDoc), 10);
  }

  function notasAbrirColorPicker(anchorEl, corAtual, onEscolher){
    notasFecharPops();
    const pop = document.createElement('div');
    pop.className = 'color-picker';
    pop.innerHTML =
      '<div class="color-picker-grid">' +
      NOTAS_PALETA.map(c => '<button type="button" class="color-picker-swatch' + (c.toLowerCase() === (corAtual||'').toLowerCase() ? ' on' : '') + '" data-cor="' + c + '" style="background:' + c + '" title="' + c + '"></button>').join('') +
      '<label class="color-picker-custom" title="Cor personalizada"><input type="color" value="' + (corAtual || '#60519b') + '"></label></div>';
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 190)) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 6) + 'px';
    pop.querySelectorAll('[data-cor]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); notasFecharPops(); onEscolher(b.getAttribute('data-cor')); }));
    const inputCor = pop.querySelector('input[type="color"]');
    inputCor.addEventListener('input', (e) => onEscolher(e.target.value));
    inputCor.addEventListener('click', (e) => e.stopPropagation());
    function fechar(){ pop.remove(); document.removeEventListener('click', onDoc); }
    function onDoc(e){ if(!pop.contains(e.target) && e.target !== anchorEl) fechar(); }
    setTimeout(() => document.addEventListener('click', onDoc), 10);
  }

  function notasWireCards(){
    notasContainerEl.querySelectorAll('.board-card').forEach(card => {
      const notaId = card.getAttribute('data-nota-id');
      const nota = notasState.notas[notaId];
      if(!nota) return;
      if(notasModoSelecao){
        card.addEventListener('click', (e) => { if(e.target.closest('button, a, input')) return; notasToggleSelecao(notaId); });
      }
      const checkSel = card.querySelector('[data-select]');
      if(checkSel) checkSel.addEventListener('click', (e) => { e.stopPropagation(); notasToggleSelecao(notaId); });
      const menuBtn = card.querySelector('[data-menu]');
      if(menuBtn) menuBtn.addEventListener('click', (e) => { e.stopPropagation(); notasAbrirMenuCard(menuBtn, nota); });
      const pinBtn = card.querySelector('[data-pin]');
      if(pinBtn) pinBtn.addEventListener('click', (e) => { e.stopPropagation(); notasUpdateNota(notaId, { fixada: !nota.fixada }).then(notasRender); });
      const iconeBtn = card.querySelector('[data-icone-item]');
      if(iconeBtn) iconeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notasAbrirIconePopover(iconeBtn, (icone) => { notasUpdateNota(notaId, { icone }).then(notasRender); });
      });

      if(notasModoEdicao && !notasModoSelecao){
        const tituloInput = card.querySelector('[data-titulo]');
        tituloInput.addEventListener('click', (e) => e.stopPropagation());
        tituloInput.addEventListener('blur', () => {
          if(tituloInput.value !== (nota.titulo || '')) notasUpdateNota(notaId, { titulo: tituloInput.value.trim() });
        });
        tituloInput.addEventListener('keydown', (e) => {
          if(e.key === 'Enter'){ e.preventDefault(); const ta = card.querySelector('[data-corpo]'); if(ta) ta.focus(); }
        });
        const textarea = card.querySelector('[data-corpo]');
        textarea.addEventListener('click', (e) => e.stopPropagation());
        notasAutoGrow(textarea);
        textarea.addEventListener('input', () => { notasAutoGrow(textarea); notasConverterBulletAoDigitar(textarea); });
        textarea.addEventListener('keydown', (e) => {
          if(e.key === 'Tab'){ e.preventDefault(); notasIndentarSelecao(textarea, !e.shiftKey); }
        });
        textarea.addEventListener('blur', () => notasSalvarCorpo(notaId, textarea));
      } else if(!notasModoSelecao){
        card.querySelectorAll('[data-toggle-tarefa]').forEach(chk => {
          chk.addEventListener('click', (e) => {
            e.stopPropagation();
            notasUpdateItem(notaId, chk.getAttribute('data-toggle-tarefa'), { feito: chk.checked });
          });
        });
        card.querySelectorAll('.l-item').forEach(el => {
          const itemId = el.getAttribute('data-item-id');
          el.addEventListener('click', (e) => { if(e.target.closest('input, a')) return; e.stopPropagation(); notasFocarCard(notaId, itemId); });
        });
      }

      if(!notasModoSelecao){
        card.addEventListener('dragstart', (e) => {
          if(e.target.closest('input, textarea')){ e.preventDefault(); return; }
          card.classList.add('arrastando');
          e.dataTransfer.setData('text/nota-id', notaId);
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => card.classList.remove('arrastando'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('alvo-drop'); });
        card.addEventListener('dragleave', () => card.classList.remove('alvo-drop'));
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          card.classList.remove('alvo-drop');
          const idArrastado = e.dataTransfer.getData('text/nota-id');
          if(!idArrastado || idArrastado === notaId) return;
          await notasReordenarNota(idArrastado, notaId);
          notasRender();
        });
      }
    });
    if(!notasModoSelecao){
      notasContainerEl.querySelectorAll('.board-grid-col, #notasBoardGrid').forEach(zona => {
        zona.addEventListener('dragover', (e) => { if(e.target === zona) e.preventDefault(); });
        zona.addEventListener('drop', async (e) => {
          if(e.target !== zona) return;
          const idArrastado = e.dataTransfer.getData('text/nota-id');
          if(!idArrastado) return;
          await notasReordenarNota(idArrastado, null);
          notasRender();
        });
      });
    }
  }

  function notasRenderChips(){
    const el = document.getElementById('notasAreaChips');
    if(!el) return;
    const areas = Object.values(notasState.areas).sort((a,b) => (a.ordem||0) - (b.ordem||0));
    const total = Object.keys(notasState.notas).length;
    const semCategoria = Object.values(notasState.notas).filter(n => !n.areaId).length;
    let html = '<button type="button" class="notas-chip' + (notasFiltroAreaIds.size === 0 ? ' active' : '') + '" data-area-id="">' +
      '<span class="notas-chip-dot" style="background:var(--text-dim)"></span>Tudo <span class="notas-chip-count">' + total + '</span></button>';
    html += areas.map(a => {
      const count = notasNaArea(a.id).length;
      return '<button type="button" class="notas-chip' + (notasFiltroAreaIds.has(a.id) ? ' active' : '') + '" data-area-id="' + a.id + '" title="Shift+clique combina com outra categoria">' +
        '<span class="notas-chip-dot" style="background:' + a.cor + '"></span>' + escapeHtml(a.nome) + ' <span class="notas-chip-count">' + count + '</span></button>';
    }).join('');
    if(semCategoria){
      html += '<button type="button" class="notas-chip' + (notasFiltroAreaIds.has('__sem__') ? ' active' : '') + '" data-area-id="__sem__">' +
        '<span class="notas-chip-dot" style="background:var(--text-dim);opacity:.4"></span>Sem categoria <span class="notas-chip-count">' + semCategoria + '</span></button>';
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-area-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        notasAplicarFiltroArea(btn.getAttribute('data-area-id'), e.shiftKey);
        notasRenderChips();
        notasRender();
      });
    });
  }

  function notasTituloFiltro(){
    if(notasIsolando) return 'Selecionadas';
    if(!notasFiltroAreaIds.size) return 'Todas as notas';
    const nomes = Array.from(notasFiltroAreaIds).map(id => id === '__sem__' ? 'Sem categoria' : (notasState.areas[id] && notasState.areas[id].nome)).filter(Boolean);
    return nomes.length ? nomes.join(' + ') : 'Todas as notas';
  }
  function notasSelecaoBarHtml(){
    return '<div class="board-selecao-bar">' + notasSelecionados.size + (notasSelecionados.size === 1 ? ' selecionada' : ' selecionadas') +
      (notasIsolando ? ' <button type="button" data-act="mostrar-tudo">Mostrar tudo</button>' : ' <button type="button" data-act="isolar">Isolar</button>') +
      ' <button type="button" data-act="mudar-categoria">Mudar categoria</button>' +
      ' <button type="button" data-act="excluir-selecao">Excluir</button>' +
      ' <button type="button" data-act="cancelar-selecao">Cancelar</button></div>';
  }
  function notasWireHead(){
    const isolarBtn = notasContainerEl.querySelector('[data-act="isolar"]');
    if(isolarBtn) isolarBtn.addEventListener('click', () => { notasIsolando = true; notasRender(); });
    const mostrarBtn = notasContainerEl.querySelector('[data-act="mostrar-tudo"]');
    if(mostrarBtn) mostrarBtn.addEventListener('click', () => { notasIsolando = false; notasRender(); });
    const cancelarBtn = notasContainerEl.querySelector('[data-act="cancelar-selecao"]');
    if(cancelarBtn) cancelarBtn.addEventListener('click', () => { notasSelecionados.clear(); notasIsolando = false; notasModoSelecao = false; notasRender(); });
    const mudarCatBtn = notasContainerEl.querySelector('[data-act="mudar-categoria"]');
    if(mudarCatBtn) mudarCatBtn.addEventListener('click', () => {
      notasAbrirCategoriaPopover(mudarCatBtn, async (areaId) => {
        await Promise.all(Array.from(notasSelecionados).map(id => notasUpdateNota(id, { areaId })));
        notasRender(); notasRenderChips();
      });
    });
    const excluirBtn = notasContainerEl.querySelector('[data-act="excluir-selecao"]');
    if(excluirBtn) excluirBtn.addEventListener('click', async () => {
      const n = notasSelecionados.size;
      if(!await showConfirm(`Excluir ${n} nota${n > 1 ? 's' : ''} selecionada${n > 1 ? 's' : ''}? Essa ação não pode ser desfeita.`)) return;
      await Promise.all(Array.from(notasSelecionados).map(id => notasDeleteNota(id)));
      notasSelecionados.clear();
      notasRender(); notasRenderChips();
    });
  }
  async function notasSalvarFocoAtivo(){
    const ativo = document.activeElement;
    if(!ativo) return;
    if(ativo.classList && ativo.classList.contains('board-card-textarea')){
      const card = ativo.closest('[data-nota-id]');
      if(card) await notasSalvarCorpo(card.getAttribute('data-nota-id'), ativo);
    } else if(ativo.classList && ativo.classList.contains('board-card-titulo-input')){
      ativo.blur();
    }
  }
  function notasAtualizarBotaoModo(){
    const btn = document.getElementById('notasModoToggleBtn');
    if(!btn) return;
    btn.textContent = notasModoEdicao ? '✏️ Editar' : '👁️ Ver';
    btn.classList.toggle('on', notasModoEdicao);
  }
  async function notasAlternarModo(querEdicao){
    const alvo = querEdicao === undefined ? !notasModoEdicao : querEdicao;
    if(alvo === notasModoEdicao) return;
    if(notasModoEdicao) await notasSalvarFocoAtivo();
    notasModoEdicao = alvo;
    localStorage.setItem(NOTAS_MODO_KEY, notasModoEdicao ? 'edicao' : 'visualizacao');
    notasAtualizarBotaoModo();
    notasRender();
  }
  async function notasAlternarSelecao(){
    if(!notasModoSelecao) await notasSalvarFocoAtivo();
    notasModoSelecao = !notasModoSelecao;
    document.getElementById('notasSelecionarBtn').classList.toggle('btn-primary', notasModoSelecao);
    if(!notasModoSelecao){ notasSelecionados.clear(); notasIsolando = false; }
    notasRender();
  }
  async function notasNovaNota(){
    await notasSalvarFocoAtivo();
    const idsFiltro = Array.from(notasFiltroAreaIds);
    const areaId = idsFiltro.length === 1 && idsFiltro[0] !== '__sem__' ? idsFiltro[0] : null;
    const nota = await notasCreateNota(areaId, '');
    notasModoEdicao = true;
    localStorage.setItem(NOTAS_MODO_KEY, 'edicao');
    notasAtualizarBotaoModo();
    notasModoSelecao = false;
    notasFocarId = nota.id;
    notasRender();
  }

  function notasRender(){
    if(!notasContainerEl) return;
    if(!notasState.loaded){ notasContainerEl.innerHTML = '<p class="empty-state">Carregando...</p>'; return; }
    notasFecharPops();
    const notas = notasFiltradas();
    const semNadaAinda = Object.keys(notasState.notas).length === 0;
    let html = '<div class="board-head"><h1 class="board-title">' + escapeHtml(notasTituloFiltro()) +
      '<span class="board-count">' + notas.length + (notas.length === 1 ? ' nota' : ' notas') + '</span></h1></div>' +
      (notasSelecionados.size ? notasSelecaoBarHtml() : '');
    if(semNadaAinda){
      html += '<div class="empty-state board-empty" style="text-align:left;max-width:52ch;padding-top:24px;"><strong>Nenhuma nota ainda.</strong><br><br>Jogue qualquer coisa na barra de captura lá embaixo, ou comece uma nota em branco em "+ Nova nota".</div>';
    } else if(!notas.length){
      html += '<div class="empty-state board-empty" style="text-align:left;">Nenhuma nota aqui ainda.</div>';
    } else {
      const nColunas = window.innerWidth <= 700 ? 1 : notasMaxColunas;
      const colunas = notasDistribuirEmColunas(notas, nColunas);
      html += '<div class="board-grid" id="notasBoardGrid">' +
        colunas.map(col => '<div class="board-grid-col">' + col.map(n => notasCardHtml(n)).join('') + '</div>').join('') +
        '</div>';
    }
    notasContainerEl.innerHTML = html;
    notasWireHead();
    notasWireCards();
    if(notasFocarId){
      const el = notasContainerEl.querySelector('[data-nota-id="' + notasFocarId + '"]');
      if(el){
        el.scrollIntoView({ block:'center' });
        const alvo = el.querySelector('[data-titulo]') || el.querySelector('[data-corpo]');
        if(alvo) setTimeout(() => alvo.focus(), 30);
      }
      notasFocarId = null;
    }
  }

  async function renderArquivoNotas(){
    if(!document.getElementById('notasBoard')) return;
    await notasCarregarEstado();
    notasContainerEl = document.getElementById('notasBoard');
    notasRenderChips();
    notasRender();
  }

  /* ---------- Modal "Categorias" ---------- */
  function notasRenderCategoriasModal(){
    const list = document.getElementById('notasCategoriasList');
    const areas = Object.values(notasState.areas).sort((a,b) => (a.ordem||0) - (b.ordem||0));
    if(!areas.length){
      list.innerHTML = '<p class="catcfg-vazio">Nenhuma categoria ainda — crie a primeira abaixo.</p>';
      return;
    }
    list.innerHTML = areas.map(a => {
      const notasDaArea = notasNaArea(a.id);
      return '<div class="catcfg-row" data-area-row="' + a.id + '">' +
        '<button type="button" class="catcfg-swatch" data-abrir-cor="' + a.id + '" style="background:' + a.cor + '" title="Mudar cor"></button>' +
        '<input class="catcfg-nome" data-nome-area="' + a.id + '" value="' + escapeHtml(a.nome) + '">' +
        '<span class="catcfg-count">' + notasDaArea.length + (notasDaArea.length === 1 ? ' nota' : ' notas') + '</span>' +
        '<button type="button" class="catcfg-del" data-excluir-area="' + a.id + '" title="Excluir">🗑</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-nome-area]').forEach(inp => {
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-nome-area');
        const nome = inp.value.trim();
        if(!nome){ inp.value = notasState.areas[id].nome; return; }
        if(nome === notasState.areas[id].nome) return;
        await notasUpdateArea(id, { nome });
        notasRenderChips(); if(notasContainerEl) notasRender();
      });
      inp.addEventListener('keydown', (e) => { if(e.key === 'Enter') inp.blur(); });
    });
    list.querySelectorAll('[data-abrir-cor]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-abrir-cor');
        notasAbrirColorPicker(btn, notasState.areas[id].cor, async (cor) => {
          btn.style.background = cor;
          await notasUpdateArea(id, { cor });
          notasRenderChips(); if(notasContainerEl) notasRender();
        });
      });
    });
    list.querySelectorAll('[data-excluir-area]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-excluir-area');
        const area = notasState.areas[id];
        const presas = notasNaArea(id);
        if(presas.length){
          if(!await showConfirm(`${presas.length} nota(s) usa(m) "${area.nome}" — excluir mesmo assim? Elas ficam sem categoria.`)) return;
          await Promise.all(presas.map(n => notasUpdateNota(n.id, { areaId:null })));
        } else if(!await showConfirm('Excluir "' + area.nome + '"?')){
          return;
        }
        await notasDeleteArea(id);
        notasRenderCategoriasModal(); notasRenderChips(); if(notasContainerEl) notasRender();
      });
    });
  }
  document.getElementById('notasCategoriasBtn').addEventListener('click', async () => {
    if(!notasState.loaded) await notasCarregarEstado();
    notasRenderCategoriasModal();
    document.getElementById('notasCategoriasModal').classList.add('active');
  });
  document.getElementById('notasCategoriasFecharBtn').addEventListener('click', () => {
    document.getElementById('notasCategoriasModal').classList.remove('active');
  });
  document.getElementById('notasCategoriasModal').addEventListener('click', (e) => {
    if(e.target.id === 'notasCategoriasModal') document.getElementById('notasCategoriasModal').classList.remove('active');
  });
  document.getElementById('notasCategoriasAddBtn').addEventListener('click', async () => {
    const nova = await notasCreateArea('Nova categoria');
    notasRenderChips();
    notasRenderCategoriasModal();
    const inp = document.getElementById('notasCategoriasList').querySelector('[data-nome-area="' + nova.id + '"]');
    if(inp){ inp.focus(); inp.select(); }
  });

  /* ---------- Toolbar da view (Ver/Editar, Selecionar, Nova nota) ---------- */
  notasAtualizarBotaoModo();
  document.getElementById('notasModoToggleBtn').addEventListener('click', () => notasAlternarModo());
  document.getElementById('notasSelecionarBtn').addEventListener('click', () => notasAlternarSelecao());
  document.getElementById('notasNovaBtn').addEventListener('click', () => notasNovaNota());

  /* ---------- Exportar/Importar (pra levar dados entre este app e o Organizer,
     que usa o mesmo formato de nota/área — foi de lá que este board foi
     portado) ---------- */
  function notasExportarJson(){
    const payload = {
      formato: 'lifeos-notas-v1',
      exportadoEm: new Date().toISOString(),
      areas: notasState.areas,
      notas: notasState.notas
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notas-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function notasImportarJson(file){
    let payload;
    try{ payload = JSON.parse(await file.text()); }
    catch(e){ showAppMessage('Arquivo inválido: não é um JSON legível.', 'error'); return; }
    const areasImportadas = payload.areas || {};
    const notasImportadas = payload.notas || {};
    const totalNotas = Object.keys(notasImportadas).length;
    const totalAreas = Object.keys(areasImportadas).length;
    if(!totalNotas && !totalAreas){
      showAppMessage('Nenhuma categoria ou nota encontrada nesse arquivo.', 'error');
      return;
    }
    if(!await showConfirm(`Importar ${totalNotas} nota(s) e ${totalAreas} categoria(s)? Elas são ADICIONADAS às que você já tem — nada existente é substituído ou removido.`)) return;
    if(!notasState.loaded) await notasCarregarEstado();
    // IDs são regenerados pra nunca colidir com o que já existe aqui — o mapa
    // guarda old→novo só pra recolocar cada nota na categoria certa.
    const mapaAreaId = {};
    for(const [oldId, a] of Object.entries(areasImportadas)){
      const nova = await notasCreateArea(a.nome || 'Categoria importada', a.cor);
      mapaAreaId[oldId] = nova.id;
    }
    let importadas = 0;
    for(const n of Object.values(notasImportadas)){
      const novoId = newId();
      const now = new Date().toISOString();
      const itensRemapeados = {};
      Object.values(n.itens || {}).forEach((item, i) => {
        const itemId = newId();
        itensRemapeados[itemId] = { ...item, id:itemId, ordem: item.ordem != null ? item.ordem : i };
      });
      const novaNota = {
        id:novoId, areaId: n.areaId && mapaAreaId[n.areaId] ? mapaAreaId[n.areaId] : null,
        titulo: n.titulo || '', icone: n.icone || '📝', itens: itensRemapeados, fixada: !!n.fixada,
        criadoEm: n.criadoEm || now, atualizadoEm: now, ordemManual: Date.now() + importadas
      };
      notasState.notas[novoId] = novaNota;
      await dbPutSilent(userPath('/Notas/' + novoId), novaNota);
      importadas++;
    }
    showAppMessage(`${importadas} nota(s) e ${Object.keys(mapaAreaId).length} categoria(s) importadas.`, 'success');
    notasRenderChips();
    if(notasContainerEl) notasRender();
  }
  document.getElementById('notasExportarBtn').addEventListener('click', () => notasExportarJson());
  document.getElementById('notasImportarBtn').addEventListener('click', () => document.getElementById('notasImportarInput').click());
  document.getElementById('notasImportarInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if(file) await notasImportarJson(file);
  });

  /* ---------- Barra de captura (sem IA por enquanto: cria direto, ou divide por parágrafo) ---------- */
  const notasCapturaInput = document.getElementById('notasCapturaInput');
  notasCapturaInput.addEventListener('input', () => notasAutoGrow(notasCapturaInput));
  notasCapturaInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); document.getElementById('notasCapturaOkBtn').click(); }
  });
  document.getElementById('notasCapturaOkBtn').addEventListener('click', async () => {
    const texto = notasCapturaInput.value.trim();
    if(!texto) return;
    if(!notasState.loaded) await notasCarregarEstado();
    const idsFiltro = Array.from(notasFiltroAreaIds);
    const areaId = idsFiltro.length === 1 && idsFiltro[0] !== '__sem__' ? idsFiltro[0] : null;
    await notasCreateNotaComTexto(areaId, texto);
    notasCapturaInput.value = '';
    notasAutoGrow(notasCapturaInput);
    notasRenderChips();
    if(notasContainerEl) notasRender();
    showAppMessage('Nota criada.', 'success');
  });
  document.getElementById('notasCapturaDividirBtn').addEventListener('click', async () => {
    const texto = notasCapturaInput.value.trim();
    if(!texto) return;
    if(!notasState.loaded) await notasCarregarEstado();
    const blocos = notasSplitEmBlocos(texto);
    if(!blocos.length) return;
    const idsFiltro = Array.from(notasFiltroAreaIds);
    const areaId = idsFiltro.length === 1 && idsFiltro[0] !== '__sem__' ? idsFiltro[0] : null;
    for(const bloco of blocos){ await notasCreateNotaComTexto(areaId, bloco); }
    notasCapturaInput.value = '';
    notasAutoGrow(notasCapturaInput);
    notasRenderChips();
    if(notasContainerEl) notasRender();
    showAppMessage(blocos.length + (blocos.length === 1 ? ' nota criada.' : ' notas criadas.'), 'success');
  });


