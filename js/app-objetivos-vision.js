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
    // Chave "monday" mantida por compatibilidade com pontos já salvos com esse
    // autoTipo — o rótulo e a fonte de dados é que mudaram pro Planejamento.
    monday: 'elementos concluídos no Planejamento'
  };
  async function fetchAutoActionCounts(){
    const [cards, academiaDias, tasks, diario, planItens] = await Promise.all([
      dbGet(userPath('/Cards')).catch(() => null),
      dbGet(userPath('/AcademiaDias')).catch(() => null),
      dbGet(userPath('/Tasks')).catch(() => null),
      dbGet(userPath('/DiarioEntradas')).catch(() => null),
      dbGet(userPath('/PlanItens')).catch(() => null)
    ]);
    let fluencia = 0;
    Object.values(cards || {}).forEach(c => { fluencia += (c.History || []).length; });
    let academia = 0;
    Object.values(academiaDias || {}).forEach(dia => {
      Object.values((dia && dia.exercicios) || {}).forEach(ex => { academia += Object.keys(ex.doneDates || {}).length; });
    });
    const tarefas = Object.values(tasks || {}).filter(t => t.done).length;
    const diarioCount = Object.keys(diario || {}).length;
    const planCount = Object.values(planItens || {}).filter(t => t.status === 'done').length;
    return { fluencia, academia, tarefas, diario: diarioCount, monday: planCount };
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

  /* ---------- Timeline de Objetivos (marcos em ordem, editável) ---------- */
  // Migração do que existia hardcoded no HTML — só usado se a coleção nunca
  // foi criada (mesmo padrão do seed de Finanças/checklist de Acordar).
  const TIMELINE_SEED = [
    { nome:'Pagar dívidas', prazo:'Dezembro' },
    { nome:'Tirar CNH da Julia', valor:1000 },
    { nome:'Arrumar notebook', valor:1000 },
    { nome:'Comprar apartamento', valor:5330 },
    { nome:'Comprar microondas', valor:800 },
    { nome:'Comprar lava-louças', valor:1800 },
    { nome:'Reformar apartamento' },
    { nome:'Comprar uma moto', valor:8000 },
    { nome:'Vender apartamento', valor:140000, ganho:true },
    { nome:'Comprar uma chácara' },
    { nome:'Comprar um carro' },
    { nome:'Ter filho' }
  ];
  let timelineMarcos = {};
  let timelineDragId = null;
  function timelineOrdenados(){
    return Object.values(timelineMarcos).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  async function renderTimelineObjetivos(){
    const list = document.getElementById('timelineList');
    if(!list) return;
    const dados = await dbGet(userPath('/TimelineMarcos'));
    if(!dados){
      timelineMarcos = {};
      TIMELINE_SEED.forEach((m, i) => { const id = newId(); timelineMarcos[id] = { id, ordem:i, ...m }; });
      await dbPutSilent(userPath('/TimelineMarcos'), timelineMarcos);
    } else {
      timelineMarcos = dados;
    }
    const itens = timelineOrdenados();
    if(!itens.length){
      list.innerHTML = '<p class="empty-state">Nenhum marco ainda. Clique em "+ Novo marco" pra começar a traçar o caminho.</p>';
      return;
    }
    list.innerHTML = itens.map((m, i) => `
      <li class="obj-timeline-item" data-marco-id="${m.id}">
        <span class="obj-timeline-num">${i + 1}</span>
        <input class="obj-timeline-nome-input" data-marco-nome="${m.id}" value="${escapeHtml(m.nome || '')}" placeholder="Nome do marco">
        <div class="obj-timeline-actions">
          <span class="obj-timeline-drag" draggable="true" title="Arrastar pra reordenar">⠿</span>
          <button type="button" class="obj-timeline-del" data-marco-del="${m.id}" title="Excluir">×</button>
        </div>
        <div class="obj-timeline-meta">
          <input class="obj-timeline-prazo-input" data-marco-prazo="${m.id}" value="${escapeHtml(m.prazo || '')}" placeholder="prazo (ex: Dezembro)">
          <input class="obj-timeline-valor-input${m.ganho ? ' ganho' : ''}" data-marco-valor="${m.id}" inputmode="decimal" value="${m.valor != null ? finFmtNum(m.valor) : ''}" placeholder="valor">
          ${m.valor != null ? `<button type="button" class="obj-timeline-ganho-toggle${m.ganho ? ' on' : ''}" data-marco-ganho="${m.id}" title="Alternar entre valor a pagar e a receber">${m.ganho ? '↑ recebe' : '↓ paga'}</button>` : ''}
        </div>
      </li>`).join('');

    list.querySelectorAll('[data-marco-nome]').forEach(inp => {
      inp.addEventListener('change', () => timelineAtualizar(inp.getAttribute('data-marco-nome'), { nome: inp.value }));
    });
    list.querySelectorAll('[data-marco-prazo]').forEach(inp => {
      inp.addEventListener('change', () => timelineAtualizar(inp.getAttribute('data-marco-prazo'), { prazo: inp.value || null }));
    });
    list.querySelectorAll('[data-marco-valor]').forEach(inp => {
      inp.addEventListener('change', async () => {
        const id = inp.getAttribute('data-marco-valor');
        const texto = inp.value.trim();
        await timelineAtualizar(id, { valor: texto ? finParseNum(texto) : null });
        await renderTimelineObjetivos(); // o botão de ganho/paga aparece ou some
      });
    });
    list.querySelectorAll('[data-marco-ganho]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-marco-ganho');
        const ganho = !timelineMarcos[id].ganho;
        btn.classList.toggle('on', ganho);
        btn.textContent = ganho ? '↑ recebe' : '↓ paga';
        btn.closest('.obj-timeline-item').querySelector('[data-marco-valor]').classList.toggle('ganho', ganho);
        timelineAtualizar(id, { ganho });
      });
    });
    list.querySelectorAll('[data-marco-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-marco-del');
        if(!await showConfirm('Excluir "' + (timelineMarcos[id].nome || 'este marco') + '"?')) return;
        delete timelineMarcos[id];
        await dbDeleteSilent(userPath('/TimelineMarcos/' + id));
        await renderTimelineObjetivos();
      });
    });
    // Arrastar pela alça reordena — mesmo padrão do painel de Camadas do Vision Board.
    list.querySelectorAll('.obj-timeline-drag').forEach(handle => {
      handle.addEventListener('dragstart', (e) => {
        const li = handle.closest('.obj-timeline-item');
        timelineDragId = li.getAttribute('data-marco-id');
        li.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      handle.addEventListener('dragend', async () => {
        const li = handle.closest('.obj-timeline-item');
        li.classList.remove('dragging');
        timelineDragId = null;
        const rows = Array.from(list.querySelectorAll('.obj-timeline-item'));
        await Promise.all(rows.map((row, i) => {
          const id = row.getAttribute('data-marco-id');
          timelineMarcos[id].ordem = i;
          return dbPatchSilent(userPath('/TimelineMarcos/' + id), { ordem: i });
        }));
        await renderTimelineObjetivos();
      });
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      if(!timelineDragId) return;
      const dragEl = list.querySelector('.obj-timeline-item.dragging');
      if(!dragEl) return;
      const after = Array.from(list.querySelectorAll('.obj-timeline-item:not(.dragging)')).reduce((closest, row) => {
        const box = row.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if(offset < 0 && offset > closest.offset) return { offset, element: row };
        return closest;
      }, { offset: -Infinity, element: null }).element;
      if(after == null) list.appendChild(dragEl); else list.insertBefore(dragEl, after);
    });
  }
  async function timelineAtualizar(id, patch){
    if(!timelineMarcos[id]) return;
    timelineMarcos[id] = { ...timelineMarcos[id], ...patch };
    await dbPatchSilent(userPath('/TimelineMarcos/' + id), patch);
  }
  document.getElementById('timelineAddBtn').addEventListener('click', async () => {
    const id = newId();
    const ordem = timelineOrdenados().length;
    timelineMarcos[id] = { id, nome:'', ordem };
    await dbPutSilent(userPath('/TimelineMarcos/' + id), timelineMarcos[id]);
    await renderTimelineObjetivos();
    const novoInput = document.querySelector('[data-marco-nome="' + id + '"]');
    if(novoInput) novoInput.focus();
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
  // Categorias são quadros à parte: cada foto entra em no máximo uma. "Geral"
  // (visionFiltroCategoria === null) é sempre a soma de tudo, sem exceção.
  let visionCategorias = {};
  let visionFiltroCategoria = null; // null = Geral | '__sem__' = sem categoria | id de categoria

  function visionSortedEntries(data){
    return Object.entries(data).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  }
  function visionEntriesVisiveis(data){
    const entries = visionSortedEntries(data);
    if(visionFiltroCategoria == null) return entries;
    if(visionFiltroCategoria === '__sem__') return entries.filter(([, v]) => !v.categoria);
    return entries.filter(([, v]) => v.categoria === visionFiltroCategoria);
  }
  /* ---------- Categorias do Vision Board (quadros à parte + o Geral, que soma tudo) ---------- */
  async function visionCreateCategoria(nome){
    const cats = Object.values(visionCategorias);
    const cat = { id: newId(), nome: nome || 'Nova categoria', ordem: cats.length };
    visionCategorias[cat.id] = cat;
    await dbPutSilent(userPath('/VisionCategorias/' + cat.id), cat);
    return cat;
  }
  async function visionUpdateCategoria(id, patch){
    if(!visionCategorias[id]) return;
    visionCategorias[id] = { ...visionCategorias[id], ...patch };
    await dbPatchSilent(userPath('/VisionCategorias/' + id), patch);
  }
  async function visionDeleteCategoria(id){
    delete visionCategorias[id];
    await dbDeleteSilent(userPath('/VisionCategorias/' + id));
  }
  function visionRenderChips(){
    const el = document.getElementById('visionChips');
    if(!el) return;
    const cats = Object.values(visionCategorias).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    const semCategoria = Object.values(visionData).filter(v => !v.categoria).length;
    let html = '<button type="button" class="notas-chip' + (visionFiltroCategoria == null ? ' active' : '') + '" data-vision-cat="">' +
      '<span class="notas-chip-dot" style="background:var(--text-dim)"></span>Geral <span class="notas-chip-count">' + Object.keys(visionData).length + '</span></button>';
    html += cats.map(c => {
      const count = Object.values(visionData).filter(v => v.categoria === c.id).length;
      return '<button type="button" class="notas-chip' + (visionFiltroCategoria === c.id ? ' active' : '') + '" data-vision-cat="' + c.id + '">' +
        escapeHtml(c.nome) + ' <span class="notas-chip-count">' + count + '</span></button>';
    }).join('');
    if(semCategoria && cats.length){
      html += '<button type="button" class="notas-chip' + (visionFiltroCategoria === '__sem__' ? ' active' : '') + '" data-vision-cat="__sem__">' +
        'Sem categoria <span class="notas-chip-count">' + semCategoria + '</span></button>';
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-vision-cat]').forEach(btn => btn.addEventListener('click', () => {
      visionFiltroCategoria = btn.getAttribute('data-vision-cat') || null;
      visionManualSelectedId = null;
      visionRenderChips();
      paintVisionBoard();
      if(document.getElementById('visionLayersPanel').classList.contains('open')) renderVisionLayers();
    }));
  }
  function visionRenderCategoriasModal(){
    const list = document.getElementById('visionCategoriasList');
    const cats = Object.values(visionCategorias).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if(!cats.length){
      list.innerHTML = '<p class="catcfg-vazio">Nenhuma categoria ainda — crie a primeira abaixo.</p>';
      return;
    }
    list.innerHTML = cats.map(c => {
      const count = Object.values(visionData).filter(v => v.categoria === c.id).length;
      return '<div class="catcfg-row" data-cat-row="' + c.id + '">' +
        '<input class="catcfg-nome" data-nome-cat="' + c.id + '" value="' + escapeHtml(c.nome) + '">' +
        '<span class="catcfg-count">' + count + (count === 1 ? ' foto' : ' fotos') + '</span>' +
        '<button type="button" class="catcfg-del" data-excluir-cat="' + c.id + '" title="Excluir">🗑</button>' +
        '</div>';
    }).join('');
    list.querySelectorAll('[data-nome-cat]').forEach(inp => {
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-nome-cat');
        const nome = inp.value.trim();
        if(!nome){ inp.value = visionCategorias[id].nome; return; }
        if(nome === visionCategorias[id].nome) return;
        await visionUpdateCategoria(id, { nome });
        visionRenderChips();
      });
      inp.addEventListener('keydown', (e) => { if(e.key === 'Enter') inp.blur(); });
    });
    list.querySelectorAll('[data-excluir-cat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-excluir-cat');
        const cat = visionCategorias[id];
        const presas = Object.entries(visionData).filter(([, v]) => v.categoria === id);
        if(presas.length){
          if(!await showConfirm(presas.length + ' foto(s) usam "' + cat.nome + '" — excluir mesmo assim? Elas ficam sem categoria.')) return;
          await Promise.all(presas.map(([pid]) => dbPatchSilent(userPath('/VisionBoard/' + pid), { categoria: null })));
          presas.forEach(([pid]) => { visionData[pid] = { ...visionData[pid], categoria: null }; });
        } else if(!await showConfirm('Excluir "' + cat.nome + '"?')){
          return;
        }
        await visionDeleteCategoria(id);
        if(visionFiltroCategoria === id) visionFiltroCategoria = null;
        visionRenderCategoriasModal();
        visionRenderChips();
        paintVisionBoard();
      });
    });
  }
  document.getElementById('visionCategoriasBtn').addEventListener('click', () => {
    visionRenderCategoriasModal();
    document.getElementById('visionCategoriasModal').classList.add('active');
  });
  document.getElementById('visionCategoriasFecharBtn').addEventListener('click', () => {
    document.getElementById('visionCategoriasModal').classList.remove('active');
  });
  document.getElementById('visionCategoriasModal').addEventListener('click', (e) => {
    if(e.target.id === 'visionCategoriasModal') document.getElementById('visionCategoriasModal').classList.remove('active');
  });
  document.getElementById('visionCategoriasAddBtn').addEventListener('click', async () => {
    await visionCreateCategoria('Nova categoria');
    visionRenderCategoriasModal();
    visionRenderChips();
  });

  function visionShowShuffleBar(show){
    document.getElementById('visionShuffleBar').classList.toggle('active', show);
    document.getElementById('visionLayersBtn').disabled = show;
    document.getElementById('visionAddOpenBtn').disabled = show;
  }
  async function shuffleVisionBoard(){
    visionData = await dbGet(userPath('/VisionBoard')) || {};
    // Embaralha só o que está visível agora — dentro de uma categoria, mexe
    // só nela; as outras fotos ficam onde estavam.
    const entries = visionEntriesVisiveis(visionData);
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
  // Altura disponível da tela a partir de onde a lousa começa, com uma folga
  // embaixo — é o piso real (a lousa preenche a tela toda de altura), que só
  // cresce além disso quando o conteúdo (muitas fotos) pede mais espaço.
  function visionAlturaDisponivel(el){
    const top = el.getBoundingClientRect().top;
    return Math.max(460, Math.round(window.innerHeight - top - 28));
  }
  function paintVisionBoard(){
    const el = document.getElementById('visionBoard');
    if(!el) return;
    const entries = visionEntriesVisiveis(visionData).map(([id, v]) => {
      const override = visionPendingShuffle && visionPendingShuffle[id];
      return [id, override ? { ...v, ...override } : v];
    });
    if(!entries.length){
      el.style.minHeight = visionAlturaDisponivel(el) + 'px';
      el.innerHTML = '<p class="empty-state" style="padding:40px;">' +
        (visionFiltroCategoria == null
          ? 'Seu Vision Board está vazio. Clique em "Gerenciar imagens" pra começar a montar.'
          : 'Nenhuma foto nesta categoria ainda.') +
        '</p>';
      return;
    }
    // A posição de cada foto é uma % da altura do board — se o board for mais
    // alto que o necessário pro conteúdo, essa % estica e as fotos ficam com
    // vão enorme entre si. Por isso a altura aqui segue só a quantidade de
    // fotos (empacotamento real), nunca a altura da tela: encher a tela é bom
    // só quando o board está vazio (ver acima), não quando já tem conteúdo.
    el.style.minHeight = Math.min(1100, Math.max(360, 130 + entries.length * 110)) + 'px';
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
        ${v.tipoVideo ? `<button type="button" class="vision-play-btn" data-vision-play="${id}" title="Assistir vídeo">▶</button>` : ''}
        ${id === visionManualSelectedId ? handlesHtml : ''}
      </div>`).join('');
    el.querySelectorAll('[data-vision-play]').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-vision-play');
        const v = visionData[id];
        if(v && v.embedSrc) abrirVisionVideo(v.embedSrc);
      });
    });
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
    const [dados, categorias] = await Promise.all([
      dbGet(userPath('/VisionBoard')),
      dbGet(userPath('/VisionCategorias'))
    ]);
    visionData = dados || {};
    visionCategorias = categorias || {};
    visionPendingShuffle = null;
    visionManualSelectedId = null;
    visionShowShuffleBar(false);
    visionRenderChips();
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
    const entries = visionEntriesVisiveis(visionData);
    if(!entries.length){
      list.innerHTML = '<p class="empty-state" style="margin:0;">Nenhuma imagem no quadro ainda — adicione fotos em "Gerenciar imagens" pra ver as camadas aqui.</p>';
      return;
    }
    const cats = Object.values(visionCategorias).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    // topo da lista = maior z-index (mais na frente), como nas Camadas do Canva
    const byZDesc = [...entries].sort((a, b) => (b[1].z || 0) - (a[1].z || 0));
    list.innerHTML = byZDesc.map(([id, v]) => `
      <li class="vision-layer-row${id === visionManualSelectedId ? ' selected' : ''}${v.hidden ? ' vision-layer-hidden' : ''}" data-vision-id="${id}">
        <span class="vision-layer-drag" draggable="true">⠿</span>
        <img class="vision-layer-thumb" src="${escapeHtml(v.src)}" alt="" draggable="false">
        <button type="button" class="vision-layer-eye" data-vision-eye="${id}" title="${v.hidden ? 'Mostrar foto' : 'Esconder foto'}">${v.hidden ? '🚫' : '👁'}</button>
        ${cats.length ? `<select class="vision-layer-cat" data-vision-cat-select="${id}" title="Categoria desta foto">
          <option value="">Sem categoria</option>
          ${cats.map(c => `<option value="${c.id}"${v.categoria === c.id ? ' selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
        </select>` : ''}
      </li>`).join('');
    // Clicar em qualquer parte da linha (menos a alça, o olho e o seletor) seleciona a foto
    list.querySelectorAll('.vision-layer-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if(e.target.closest('.vision-layer-drag') || e.target.closest('.vision-layer-eye') || e.target.closest('.vision-layer-cat')) return;
        const id = row.getAttribute('data-vision-id');
        visionManualSelectedId = visionManualSelectedId === id ? null : id;
        paintVisionBoard();
        renderVisionLayers();
      });
    });
    list.querySelectorAll('[data-vision-cat-select]').forEach(sel => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', async () => {
        const id = sel.getAttribute('data-vision-cat-select');
        const categoria = sel.value || null;
        visionData[id] = { ...visionData[id], categoria };
        await dbPatchSilent(userPath('/VisionBoard/' + id), { categoria });
        visionRenderChips();
        // Mudar a categoria pode tirar a foto do filtro atual — repinta tudo.
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
    // Só restaura o que está visível agora — dentro de uma categoria, as fotos
    // das outras categorias não são tocadas (por isso funde no visionData
    // inteiro em vez de sobrescrever o nó todo com só o subconjunto filtrado).
    const entries = visionEntriesVisiveis(visionData);
    if(!entries.length) return;
    const msg = visionFiltroCategoria == null
      ? 'Isso restaura o tamanho e a posição de TODAS as fotos pro arranjo automático, desfazendo ajustes manuais. Continuar?'
      : 'Isso restaura o tamanho e a posição das fotos DESTA CATEGORIA pro arranjo automático, desfazendo ajustes manuais. Continuar?';
    if(!await showConfirm(msg)) return;
    const layout = await visionBoardAutoLayout(entries.map(([, v]) => v.src));
    const updates = { ...visionData };
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

  // Testa se um link realmente carrega como imagem (link de página, não do arquivo,
  // é o motivo mais comum de "colei o link e não apareceu nada").
  function testarUrlImagem(url){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }
  // Igual, mas devolve o tamanho da imagem — usado pra distinguir a thumbnail
  // de verdade da imagem-placeholder cinza que o YouTube devolve (com HTTP 200
  // normal, sem erro nenhum) quando o vídeo foi removido ou é privado.
  function testarUrlImagemComTamanho(url){
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ ok:true, w:img.naturalWidth, h:img.naturalHeight });
      img.onerror = () => resolve({ ok:false, w:0, h:0 });
      img.src = url;
    });
  }

  /* Vídeo do YouTube/Instagram no Vision Board: mostra só a thumb no card, com um
     botão de play que abre o vídeo de verdade num lightbox — sem baixar/hospedar
     nada, só embutindo o player oficial de cada plataforma. */
  const VISION_YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i;
  // O link de um reel/post pode vir com o @usuário no meio (ex: instagram.com/fulano/reel/XYZ/),
  // não só na forma "curta" instagram.com/reel/XYZ/ — o grupo de usuário é opcional.
  const VISION_INSTAGRAM_RE = /instagram\.com\/(?:[a-zA-Z0-9_.]+\/)?(p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i;
  // Instagram não tem uma API pública de thumbnail sem token — em vez de tentar
  // buscar e falhar silenciosamente, usa um cartão-placeholder identificável (o
  // play visível já deixa claro que é um vídeo a abrir).
  const VISION_INSTAGRAM_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
    '<defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#4f5bd5"/><stop offset="0.5" stop-color="#c13584"/><stop offset="1" stop-color="#f77737"/>' +
    '</linearGradient></defs>' +
    '<rect width="400" height="500" fill="url(#ig)"/>' +
    '<rect x="120" y="160" width="160" height="160" rx="36" fill="none" stroke="#fff" stroke-width="10"/>' +
    '<circle cx="200" cy="240" r="42" fill="none" stroke="#fff" stroke-width="10"/>' +
    '<circle cx="255" cy="188" r="8" fill="#fff"/>' +
    '</svg>'
  );
  // Busca a imagem de capa de verdade de um post/reel do Instagram, lendo o
  // og:image (metadado público que o próprio Instagram expõe pra qualquer
  // link-preview — o mesmo que WhatsApp/Slack/Discord usam) via um serviço
  // gratuito de unfurling, já que o navegador não pode ler isso direto
  // (CORS bloqueia um fetch cru pro instagram.com). Sem login, sem token.
  // Se o serviço estiver fora do ar ou o post não tiver preview, tenta o
  // atalho antigo como plano B; se os dois falharem, quem chamou usa o
  // cartão-placeholder.
  async function buscarThumbInstagram(url){
    try{
      const res = await fetchWithTimeout('https://api.microlink.io/?url=' + encodeURIComponent(url), undefined, 7000);
      if(res.ok){
        const json = await res.json();
        const img = json && json.data && json.data.image && json.data.image.url;
        if(img && await testarUrlImagem(img)) return img;
      }
    }catch(err){ /* segue pro plano B */ }
    const ig = url.match(VISION_INSTAGRAM_RE);
    if(ig){
      const tipo = ig[1].toLowerCase() === 'reels' ? 'reel' : ig[1].toLowerCase();
      const thumbReal = 'https://www.instagram.com/' + tipo + '/' + ig[2] + '/media/?size=l';
      if(await testarUrlImagem(thumbReal)) return thumbReal;
    }
    return null;
  }
  // Devolve null quando não dá pra confirmar que o vídeo existe de verdade —
  // nesse caso quem chama trata o link como inválido e não adiciona nada
  // (pedido explícito: vídeo removido/privado não deve virar card nenhum).
  async function detectarVisionVideo(url){
    const yt = url.match(VISION_YOUTUBE_RE);
    if(yt){
      const thumb = 'https://img.youtube.com/vi/' + yt[1] + '/hqdefault.jpg';
      const teste = await testarUrlImagemComTamanho(thumb);
      // Vídeo removido/privado: o YouTube devolve 200 OK com uma imagem cinza
      // de exatamente 120×90 em vez de um erro HTTP — os vídeos de verdade
      // vêm em 480×360 (ou maiores).
      if(!teste.ok || (teste.w === 120 && teste.h === 90)) return null;
      return {
        tipoVideo: 'youtube',
        embedSrc: 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1',
        thumb
      };
    }
    const ig = url.match(VISION_INSTAGRAM_RE);
    if(ig){
      const tipo = ig[1].toLowerCase() === 'reels' ? 'reel' : ig[1].toLowerCase(); // embed só aceita a forma singular
      const thumb = await buscarThumbInstagram(url);
      if(!thumb) return null; // não deu pra confirmar uma thumbnail real
      return {
        tipoVideo: 'instagram',
        embedSrc: 'https://www.instagram.com/' + tipo + '/' + ig[2] + '/embed',
        thumb
      };
    }
    return null;
  }
  function abrirVisionVideo(embedSrc){
    document.getElementById('visionVideoFrame').innerHTML =
      '<iframe src="' + escapeHtml(embedSrc) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen frameborder="0"></iframe>';
    document.getElementById('visionVideoModal').classList.add('active');
  }
  function fecharVisionVideo(){
    document.getElementById('visionVideoModal').classList.remove('active');
    document.getElementById('visionVideoFrame').innerHTML = ''; // limpa o iframe pra parar o vídeo
  }
  document.getElementById('visionVideoCloseBtn').addEventListener('click', fecharVisionVideo);
  document.getElementById('visionVideoModal').addEventListener('click', (e) => {
    if(e.target.id === 'visionVideoModal') fecharVisionVideo();
  });

  /* Modal "Gerenciar imagens": lista tudo que já está no board (com seleção múltipla pra
     excluir em lote) e permite adicionar várias imagens de uma vez, por link ou upload. */
  const visionManageSelecionadas = new Set();
  function renderVisionManageBar(){
    const bar = document.getElementById('visionManageBar');
    const total = document.getElementById('visionManageList').querySelectorAll('.vision-manage-item').length;
    bar.style.display = total ? 'flex' : 'none';
    document.getElementById('visionManageSelectedCount').textContent = visionManageSelecionadas.size;
    document.getElementById('visionManageDeleteBtn').disabled = !visionManageSelecionadas.size;
    document.getElementById('visionManageSelectAll').checked = total > 0 && visionManageSelecionadas.size === total;
  }
  async function renderVisionManageList(){
    const wrap = document.getElementById('visionManageList');
    const data = await dbGet(userPath('/VisionBoard')) || {};
    const entries = Object.entries(data).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
    const idsValidos = new Set(entries.map(([id]) => id));
    Array.from(visionManageSelecionadas).forEach(id => { if(!idsValidos.has(id)) visionManageSelecionadas.delete(id); });
    if(!entries.length){
      wrap.innerHTML = '<p class="empty-state" style="margin:0 0 8px;">Nenhuma imagem no Vision Board ainda. Cole links de imagens ou vídeo abaixo pra começar a montar.</p>';
      renderVisionManageBar();
      return;
    }
    const itemHtml = ([id, v]) => `
      <div class="vision-manage-item${visionManageSelecionadas.has(id) ? ' selected' : ''}" data-manage-id="${id}">
        <input type="checkbox" class="vision-manage-check" data-check-vision="${id}"${visionManageSelecionadas.has(id) ? ' checked' : ''}>
        <img src="${escapeHtml(v.src)}" alt="" loading="lazy">
        ${v.tipoVideo ? '<span class="vision-manage-play">▶</span>' : ''}
        <button type="button" data-del-vision="${id}" title="Remover">×</button>
      </div>`;
    const cats = Object.values(visionCategorias).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    if(!cats.length){
      // Sem categorias criadas ainda: um grid só, sem títulos de grupo.
      wrap.innerHTML = '<div class="vision-manage-grid">' + entries.map(itemHtml).join('') + '</div>';
    }else{
      const grupos = cats.map(c => ({ id: c.id, nome: c.nome, itens: [] }));
      const semCategoria = { id: null, nome: 'Sem categoria', itens: [] };
      entries.forEach(([id, v]) => {
        const grupo = v.categoria && grupos.find(g => g.id === v.categoria);
        (grupo || semCategoria).itens.push([id, v]);
      });
      wrap.innerHTML = [...grupos, semCategoria].filter(g => g.itens.length).map(g => `
        <div class="vision-manage-grupo">
          <p class="vision-manage-grupo-titulo">${escapeHtml(g.nome)} <span>${g.itens.length}</span></p>
          <div class="vision-manage-grid">${g.itens.map(itemHtml).join('')}</div>
        </div>`).join('');
    }
    wrap.querySelectorAll('img').forEach(img => {
      img.addEventListener('error', () => img.closest('.vision-manage-item').classList.add('broken'), { once: true });
    });
    wrap.querySelectorAll('[data-check-vision]').forEach(chk => chk.addEventListener('change', () => {
      const id = chk.getAttribute('data-check-vision');
      if(chk.checked) visionManageSelecionadas.add(id); else visionManageSelecionadas.delete(id);
      chk.closest('.vision-manage-item').classList.toggle('selected', chk.checked);
      renderVisionManageBar();
    }));
    wrap.querySelectorAll('[data-del-vision]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-vision');
      visionManageSelecionadas.delete(id);
      await dbDeleteSilent(userPath('/VisionBoard/' + id));
      await renderVisionManageList();
      await renderVisionBoard();
    }));
    renderVisionManageBar();
  }
  async function renderVisionLinksQuebrados(){
    const wrap = document.getElementById('visionLinksQuebradosWrap');
    const list = document.getElementById('visionLinksQuebradosList');
    const data = await dbGet(userPath('/VisionLinksQuebrados')) || {};
    const entries = Object.values(data).sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''));
    wrap.style.display = entries.length ? '' : 'none';
    if(!entries.length) return;
    list.innerHTML = entries.map(l => `
      <div class="vision-broken-item" data-broken-id="${l.id}">
        <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.url)}</a>
        <button type="button" data-del-broken="${l.id}" title="Remover da lista">×</button>
      </div>`).join('');
    list.querySelectorAll('[data-del-broken]').forEach(btn => btn.addEventListener('click', async () => {
      await dbDeleteSilent(userPath('/VisionLinksQuebrados/' + btn.getAttribute('data-del-broken')));
      await renderVisionLinksQuebrados();
    }));
  }
  document.getElementById('visionManageSelectAll').addEventListener('change', (e) => {
    const ids = Array.from(document.querySelectorAll('#visionManageList [data-manage-id]')).map(el => el.getAttribute('data-manage-id'));
    if(e.target.checked) ids.forEach(id => visionManageSelecionadas.add(id));
    else visionManageSelecionadas.clear();
    document.querySelectorAll('#visionManageList .vision-manage-item').forEach(el => {
      const sel = visionManageSelecionadas.has(el.getAttribute('data-manage-id'));
      el.classList.toggle('selected', sel);
      el.querySelector('[data-check-vision]').checked = sel;
    });
    renderVisionManageBar();
  });
  document.getElementById('visionManageDeleteBtn').addEventListener('click', async () => {
    const ids = Array.from(visionManageSelecionadas);
    if(!ids.length) return;
    if(!await showConfirm(`Excluir ${ids.length} foto(s) do Vision Board? Essa ação não pode ser desfeita.`)) return;
    await Promise.all(ids.map(id => dbDeleteSilent(userPath('/VisionBoard/' + id))));
    visionManageSelecionadas.clear();
    await renderVisionManageList();
    await renderVisionBoard();
  });
  // Fotos de Instagram adicionadas ANTES do fix de thumbnail real ficaram com
  // o placeholder genérico gravado pra sempre no banco — esse botão tenta de
  // novo só as que ainda estão presas no placeholder, sem precisar excluir e
  // colar tudo de novo. Reconstrói o link original a partir do embedSrc
  // salvo (tira o "/embed" do fim).
  document.getElementById('visionRefreshThumbsBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const data = await dbGet(userPath('/VisionBoard'), { fresh:true }) || {};
    const pendentes = Object.entries(data).filter(([, v]) => v.tipoVideo === 'instagram' && v.src === VISION_INSTAGRAM_PLACEHOLDER && v.embedSrc);
    if(!pendentes.length){ showAppMessage('Nenhuma foto do Instagram presa no placeholder.', 'info'); return; }
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = `Atualizando 0/${pendentes.length}...`;
    let atualizadas = 0;
    for(let i = 0; i < pendentes.length; i++){
      const [id, v] = pendentes[i];
      const urlOriginal = v.embedSrc.replace(/\/embed$/, '/');
      const novoThumb = await buscarThumbInstagram(urlOriginal);
      if(novoThumb && novoThumb !== VISION_INSTAGRAM_PLACEHOLDER){
        await dbPatchSilent(userPath('/VisionBoard/' + id), { src: novoThumb });
        atualizadas++;
      }
      btn.textContent = `Atualizando ${i + 1}/${pendentes.length}...`;
    }
    btn.disabled = false;
    btn.textContent = textoOriginal;
    showAppMessage(`${atualizadas} de ${pendentes.length} thumbnail(s) atualizada(s).`, atualizadas ? 'success' : 'info');
    await renderVisionManageList();
    await renderVisionBoard();
  });
  document.getElementById('visionShuffleBtn').addEventListener('click', shuffleVisionBoard);
  document.getElementById('visionAddOpenBtn').addEventListener('click', async () => {
    document.getElementById('visionUrlInput').value = '';
    document.getElementById('visionUploadInput').value = '';
    document.getElementById('visionAddError').style.display = 'none';
    visionManageSelecionadas.clear();
    await renderVisionManageList();
    await renderVisionLinksQuebrados();
    document.getElementById('visionAddModal').classList.add('active');
  });
  document.getElementById('visionAddCancelBtn').addEventListener('click', () => {
    document.getElementById('visionAddModal').classList.remove('active');
  });
  document.getElementById('visionAddOkBtn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const errorEl = document.getElementById('visionAddError');
    errorEl.style.display = 'none';
    const urlsDigitadas = document.getElementById('visionUrlInput').value.split('\n').map(s => s.trim()).filter(Boolean);
    const files = Array.from(document.getElementById('visionUploadInput').files || []);
    if(!urlsDigitadas.length && !files.length){
      errorEl.textContent = 'Cole ao menos um link ou escolha ao menos um arquivo de imagem.';
      errorEl.style.display = 'block';
      return;
    }
    // Testar cada link (imagem, YouTube, Instagram) é uma sequência de chamadas
    // de rede que pode levar alguns segundos com vários links de uma vez — sem
    // um estado de carregamento, o clique parecia não ter feito nada.
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Adicionando...';
    try{
      // Links de vídeo (YouTube/Instagram) usam a thumb oficial direto, sem passar
      // pelo teste de <img> — só o resto (link de imagem de verdade) precisa provar
      // que carrega antes de entrar, porque um link de página (ex: post do
      // Instagram/Pinterest em vez do arquivo) não carrega como <img> e a foto
      // nunca aparecia no board, sem aviso nenhum.
      const avisos = [];
      const novosItens = [];
      const urlsParaTestar = [];
      for(const url of urlsDigitadas){
        const video = await detectarVisionVideo(url);
        if(video) novosItens.push({ src: video.thumb, tipoVideo: video.tipoVideo, embedSrc: video.embedSrc });
        else urlsParaTestar.push(url);
      }
      if(urlsParaTestar.length){
        const testesUrl = await Promise.all(urlsParaTestar.map(async (url) => ({ url, ok: await testarUrlImagem(url) })));
        testesUrl.filter(t => t.ok).forEach(t => novosItens.push({ src: t.url, tipoVideo: null, embedSrc: null }));
        const urlsInvalidas = testesUrl.filter(t => !t.ok).map(t => t.url);
        if(urlsInvalidas.length){
          avisos.push(`${urlsInvalidas.length} link(s) não carregaram como imagem e não viraram card — confira se é o link direto do ARQUIVO da imagem, não da página onde ela aparece (ex: no Instagram, abra a foto e use "Copiar endereço da imagem", não o link do post). Se for um vídeo do YouTube/Instagram, também pode ser que ele tenha sido removido ou esteja privado. Eles ficam listados em "Links que não abriram", embaixo, pra você conferir.`);
          // O link em si não vira card, mas não desaparece — fica guardado
          // aqui pra você poder abrir e checar depois, sem precisar colar de novo.
          await Promise.all(urlsInvalidas.map(url => {
            const id = newId();
            return dbPutSilent(userPath('/VisionLinksQuebrados/' + id), { id, url, criadoEm: new Date().toISOString() });
          }));
        }
      }
      for(const file of files){
        try{
          novosItens.push({ src: await resizeImageDataUrl(file, 900), tipoVideo: null, embedSrc: null });
        } catch(err){
          avisos.push('Não consegui ler um dos arquivos enviados. Os demais foram adicionados.');
        }
      }
      if(!novosItens.length){
        errorEl.textContent = avisos.join(' ') || 'Nenhuma imagem válida pra adicionar.';
        errorEl.style.display = 'block';
        await renderVisionLinksQuebrados();
        return;
      }
      const data = await dbGet(userPath('/VisionBoard')) || {};
      // Reempacota só o que está visível agora — dentro de uma categoria, as
      // fotos novas entram (e reorganizam) só ela, sem tocar nas outras.
      const existingEntries = visionEntriesVisiveis(data);
      const categoriaAlvo = (visionFiltroCategoria && visionFiltroCategoria !== '__sem__') ? visionFiltroCategoria : null;
      const allSrcs = existingEntries.map(([, v]) => v.src).concat(novosItens.map(it => it.src));
      const layout = await visionBoardAutoLayout(allSrcs);
      const updates = {};
      existingEntries.forEach(([id], i) => { updates[id] = { ...data[id], ...layout[i] }; });
      const novasEntries = novosItens.map((it, i) => {
        const pos = layout[existingEntries.length + i];
        return [newId(), { ...it, order: existingEntries.length + i, categoria: categoriaAlvo, criadoEm: new Date().toISOString(), ...pos }];
      });
      novasEntries.forEach(([id, v]) => { updates[id] = v; });
      await Promise.all(Object.entries(updates).map(([id, v]) => dbPutSilent(userPath('/VisionBoard/' + id), v)));
      document.getElementById('visionUrlInput').value = '';
      document.getElementById('visionUploadInput').value = '';
      if(avisos.length){
        errorEl.textContent = avisos.join(' ');
        errorEl.style.display = 'block';
      }
      await renderVisionManageList();
      await renderVisionLinksQuebrados();
      await renderVisionBoard();
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });

