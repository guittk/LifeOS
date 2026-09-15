  /* ---------- HOJE (fila combinada: tarefas + treino/hábitos de hoje) ---------- */
  async function renderHojeQueue(){
    const today = todayStr();
    const dow = new Date().getDay(); // 0=domingo
    // Atenção: o default precisa vir DEPOIS do await. Escrever `dbGet(x) || {}`
    // aqui dentro aplicaria o `||` na Promise (sempre truthy), nunca no valor —
    // e o Firebase devolve null para caminhos vazios (conta nova).
    const [tasksRaw, academiaRaw, skipsRaw, casaRaw, academiaConcluidosRaw] = await Promise.all([
      dbGet(userPath('/Tasks')),
      dbGet(userPath('/AcademiaDias')),
      dbGet(userPath('/HojeSkips/' + today)),
      dbGet(userPath('/casa/atividades')),
      dbGet(userPath('/AcademiaConcluidos/' + today))
    ]);
    const tasksData = tasksRaw || {};
    const academiaDias = academiaRaw || {};
    const skips = skipsRaw || {};
    const casaData = casaRaw || {};
    const academiaConcluidosHoje = academiaConcluidosRaw || {};

    // Antes isto era `t.date === today`, e o efeito era grave: uma tarefa
    // atrasada de ontem — ou sem data nenhuma — sumia da tela Hoje. Ela seguia
    // existindo no banco e contando nos objetivos, mas desaparecia justo da
    // tela que deveria ser a única a olhar. Agora entram as três: de hoje,
    // atrasadas (com rollover pro topo) e sem data (no fim, "quando der").
    const todaysTasks = Object.entries(tasksData).filter(([id, t]) => {
      if(t.done) return t.date === today;   // concluídas: só as de hoje, pra registrar o progresso do dia
      return !t.date || t.date <= today;    // pendentes: hoje, atrasadas e sem data
    });
    const diaHoje = academiaDias[dow] || {};
    const exerciciosHoje = diaHoje.ativo ? Object.entries(diaHoje.exercicios || {}).sort((a,b) => (a[1].order||0) - (b[1].order||0)) : [];
    const treinoHorario = diaHoje.horario || '';

    // Combinados da casa (louça, lixo, faxina...) pendentes segundo a mesma
    // regra de frequência da tela Casa — mais a que foi feita hoje, só pra
    // aparecer riscada e contar no progresso do dia, igual tarefa e treino.
    const casaHoje = Object.entries(casaData).filter(([id, a]) => {
      return casaAtividadeStatus(a).pendente || a.feitaEm === today;
    });

    const janela = await calcularJanelaLivre();

    activities = [
      ...todaysTasks.map(([id,t]) => {
        const key = 'tarefa_' + id;
        const atraso = t.date && t.date < today ? diasEntreDatas(t.date, today) : 0;
        return {
          kind:'tarefa', obj: 'Tarefa', name: t.name, time: t.horario || '', done: !!t.done, skipped: !!skips[key],
          semData: !t.date, atraso: atraso, recorrencia: t.recorrencia || '',
          onComplete: async () => {
            const dataFeita = t.date || today;
            if(t.recorrencia){
              // Recorrente não "termina": avança para a próxima data e volta a
              // ficar pendente. Uma linha só no banco, sem ocorrências futuras.
              const proxima = proximaDataRecorrencia(dataFeita, t.recorrencia);
              await dbPatch(userPath('/Tasks/' + id), { date: proxima, done:false, ultimaFeita: dataFeita });
            }else{
              await dbPatch(userPath('/Tasks/' + id), { done:true });
            }
          },
          onSkip: async (skipped) => { await dbPatch(userPath('/HojeSkips/' + today), { [key]: skipped ? true : null }); }
        };
      }),
      ...exerciciosHoje.map(([eid,e]) => {
        const key = 'treino_' + eid;
        return {
          // A conclusão de cada exercício vai pra /AcademiaConcluidos/{data}, não
          // pra dentro do próprio exercício (ver migrarAcademiaConcluidos): o
          // exercício é o cadastro do cronograma, lido a cada abertura da Hoje —
          // não é onde um histórico que só cresce deveria morar.
          kind:'treino', obj: 'Academia', name: e.nome, time: treinoHorario, done: !!academiaConcluidosHoje[eid], skipped: !!skips[key],
          semData: false, atraso: 0,
          onComplete: async () => {
            await dbPatch(userPath('/AcademiaConcluidos/' + today), { [eid]: true });
          },
          onSkip: async (skipped) => { await dbPatch(userPath('/HojeSkips/' + today), { [key]: skipped ? true : null }); }
        };
      }),
      ...casaHoje.map(([id,a]) => {
        const key = 'casa_' + id;
        const doneHoje = a.feitaEm === today;
        return {
          kind:'casa', obj: 'Casa', name: a.nome, time: '', done: doneHoje, skipped: !!skips[key],
          semData: false, atraso: 0, responsavel: a.responsavel || '',
          casaFrequencia: a.frequencia, casaFeitaEm: a.feitaEm,
          onComplete: async () => { await dbPatch(userPath('/casa/atividades/' + id), { feitaEm: today }); },
          onSkip: async (skipped) => { await dbPatch(userPath('/HojeSkips/' + today), { [key]: skipped ? true : null }); }
        };
      })
    ];
    // Ordenar só por horário fazia a fila ignorar o que mais importa: o que está
    // atrasado e o que a janela livre comporta. Agora cada item recebe uma
    // pontuação de urgência e a razão da escolha, pra você não precisar
    // reconferir a lista inteira pra confiar na primeira linha.
    activities.forEach(a => Object.assign(a, pontuarUrgencia(a, janela)));
    activities.sort((a, b) => b.score - a.score);

    updateHeroCard(); updateDayProgress(); updateFlowUI();
  }

  /* ---------- Janela livre a partir de agora ----------
     Extraída de renderRotinaHoje pra que a fila também possa usar: é o que
     permite dizer "você tem 2h15 livres" ao justificar a escolha. */
  async function calcularJanelaLivre(){
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const diaData = await dbGet(userPath('/Rotina/' + now.getDay())) || {};
    const blocos = Object.entries(diaData.blocos || {})
      .map(([id, b]) => ({ id, nome: (b.nome || '').trim() || 'Sem nome', inicio: rotToMinutes(b.inicio), fim: rotToMinutes(b.fim) }))
      .filter(b => b.inicio != null && b.fim != null && b.fim > b.inicio)
      .sort((a, b) => a.inicio - b.inicio);

    let atual = null, ocupadoTotal = 0, ocupadoRestante = 0;
    blocos.forEach(b => {
      ocupadoTotal += (b.fim - b.inicio);
      if(nowMin >= b.inicio && nowMin < b.fim) atual = b;
      if(b.fim > nowMin) ocupadoRestante += Math.max(0, b.fim - Math.max(b.inicio, nowMin));
    });
    const restanteDia = Math.max(0, DAY_END_MIN - nowMin);
    return {
      nowMin, blocos, atual,
      livresTotalMin: Math.max(0, DAY_END_MIN - ocupadoTotal),
      livresRestanteMin: Math.max(0, restanteDia - ocupadoRestante),
      temRotina: blocos.length > 0
    };
  }

  function diasEntreDatas(de, ate){
    const a = new Date(de + 'T00:00:00'), b = new Date(ate + 'T00:00:00');
    if(isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  /* Pontuação de urgência + a frase que explica a escolha.
     Os pesos são deliberados: atraso domina tudo, horário vencido vem em
     seguida, e "sem data" é empurrado pro fim sem nunca sumir da tela. */
  /* Combinado da casa não tem hora nem data — tem frequência. A régua de
     atraso das tarefas não serve (dias desde a última vez pode ser Infinity,
     "nunca feita"), então ganha sua própria conta, calibrada pra ficar entre
     "é de hoje" (tarefa, 200) e "já passou da hora" (tarefa, 600+): um
     combinado nunca visto ou muito atrasado pode superar uma tarefa comum,
     mas não uma tarefa já vencida ou de verdade atrasada. */
  const CASA_QUEUE_BASE = 500;
  function pontuarCasa(a){
    if(a.done || a.skipped) return { score: -5000, porque: '' };
    const intervalo = CASA_FREQ_DIAS[a.casaFrequencia] || 1;
    const dias = casaDiasDesde(a.casaFeitaEm);
    if(dias === Infinity){
      return { score: CASA_QUEUE_BASE + 400, porque: 'Nunca foi feita — combinado da casa.' };
    }
    const diasAtraso = Math.max(0, dias - intervalo);
    if(diasAtraso > 0){
      return {
        score: CASA_QUEUE_BASE + Math.min(300, diasAtraso * 20),
        porque: diasAtraso === 1 ? 'Pendente há 1 dia — combinado da casa.' : 'Pendente há ' + diasAtraso + ' dias — combinado da casa.'
      };
    }
    return { score: CASA_QUEUE_BASE, porque: 'Pendente hoje — combinado da casa.' };
  }

  function pontuarUrgencia(a, janela){
    if(a.kind === 'casa') return pontuarCasa(a);
    const nowMin = janela.nowMin;
    const horaMin = a.time ? rotToMinutes(a.time) : null;
    let score = 0;
    let porque = '';

    if(a.atraso > 0){
      score += 1000 + a.atraso * 40;
      porque = a.atraso === 1 ? 'Ficou de ontem.' : 'Está ' + a.atraso + ' dias atrasada.';
    }

    if(horaMin != null){
      if(horaMin <= nowMin){
        score += 600 + Math.min(240, nowMin - horaMin);
        if(!porque) porque = 'Era para as ' + a.time + ' e já passou.';
      }else{
        const faltam = horaMin - nowMin;
        // Quanto mais perto do horário, mais urgente.
        score += 400 - Math.min(390, faltam);
        if(!porque){
          porque = faltam <= 60
            ? 'Começa às ' + a.time + ', daqui a pouco.'
            : 'Marcada para as ' + a.time + '.';
        }
      }
    }

    if(a.semData){
      score -= 900;
      porque = 'Sem data — quando sobrar tempo.';
    }else if(!porque){
      score += 200;
      porque = janela.temRotina && janela.livresRestanteMin > 0
        ? 'É de hoje e você tem ' + rotFmtHours(janela.livresRestanteMin) + ' livres.'
        : 'É de hoje.';
    }

    if(a.kind === 'treino') score += 50; // bloco físico: não dá pra empurrar indefinidamente
    if(a.done || a.skipped) score -= 5000; // saem do topo sem sumir da lista

    return { score, porque };
  }

  /* ---------- HOJE — painel "Água & creatina" ---------- */
  async function renderHojeHidratacao(){
    const el = document.getElementById('hojeHidratacaoList');
    const today = todayStr();
    const [metas, consumo] = await Promise.all([
      dbGet(userPath('/AcademiaMetas')),
      dbGet(userPath('/AcademiaConsumo/' + today))
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
      const novoTotal = aguaAtual + add;
      await dbPatch(userPath('/AcademiaConsumo/' + today), { aguaMl: novoTotal });
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
      dbGet(userPath('/PlanoAlimentarConfig')),
      dbGet(userPath('/AcademiaConsumo/' + today))
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


  /* ---------- HOJE — painel "Eventos" ----------
     Eventos de hoje, da Agenda. (Chamava-se "Avisos & eventos": o lado de
     avisos lia /Avisos, um caminho que nenhuma tela do app jamais escreve —
     o bloco nunca teve conteúdo pra mostrar. Removido; se voltar a fazer
     sentido um aviso avulso aqui, entra como feature nova, não como leitura
     de um caminho morto.) */
  async function renderHojeEventos(){
    const el = document.getElementById('hojeAvisosEventosList');
    const eventsData = await dbGet(userPath('/Events')) || {};
    const today = todayStr();
    const todaysEvents = Object.values(eventsData).filter(ev => ev.date === today).sort((a,b) => (a.time||'').localeCompare(b.time||''));

    if(!todaysEvents.length){
      el.innerHTML = '<p class="empty-state">Nenhum evento por hoje.</p>';
      return;
    }

    el.innerHTML = todaysEvents.map(ev => `<div class="event-row"><div class="event-time">${ev.allDay?'dia todo':(ev.time||'—')}</div><div class="event-title">${escapeHtml(ev.title)}</div></div>`).join('');
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
  /* ---------- Render sob demanda ----------
     Antes, bootApp() desenhava as 17 telas de uma vez: ~50 requisições HTTP no
     login para montar Vision Board, Decisões, Monday e Plano Alimentar que
     ninguém estava olhando — com o overlay global travado o tempo todo.

     Agora o boot desenha só "Hoje" e o que é global (o badge da Inbox na
     sidebar). Cada outra view desenha na primeira vez que é aberta. "Hoje"
     redesenha a cada visita, porque é a tela que precisa estar sempre correta —
     e com o cache de leitura isso quase nunca custa rede. */
  const VIEW_RENDERERS = {
    hoje: [
      [renderHojeQueue,          'a fila de hoje',              []],
      [renderHojeEventos,  'os eventos de hoje',          'hojeAvisosEventosList'],
      [renderHojeHidratacao,     'água & creatina',             'hojeHidratacaoList'],
      [renderHojePlanoAlimentar, 'o plano alimentar de hoje',   'hojePlanoAlimentarList'],
      [renderHojeInsulina,       'a insulina de hoje',          'hojeInsulinaList'],
      [renderHojeObjetivos,      'os objetivos de hoje',        'hojeObjetivosList'],
      [renderRotinaHoje,         'a rotina de hoje',            'rotinaHojeUpcoming'],
      [renderHojeTimeline,       'a linha do tempo de hoje',    'hojeTimeline24hTrack'],
      [renderFluenciaToday,      'o Fluência de hoje',          []]
    ],
    storage: [[renderArquivoNotas, 'as Notas', 'notasBoard']],
    tarefas: [
      [renderTasks,      'as Tarefas',            []],
      [renderTaskGroups, 'os grupos de tarefas',  'taskGroupsList']
    ],
    monday:         [[renderPlanejamento, 'o Planejamento', 'planGruposList']],
    agenda:         [[renderAgenda, 'a Agenda', 'agendaList']],
    rotina:         [[renderRotina, 'a Rotina', 'rotinaDaysGrid']],
    casa: [
      [renderCasaAtividades, 'as atividades da Casa', 'casaAtividadesList'],
      [renderCasaRegras,     'as regras da Casa',     'casaRegrasList'],
      [renderCasaErros,      'os erros da Casa',      'casaErrosList']
    ],
    financas:       [[renderFinancas, 'as Finanças', 'finMesesList']],
    objetivos:      [[renderObjetivos, 'os Objetivos', 'objetivosList']],
    decisoes:       [[renderDecisoes, 'as Decisões', 'decisoesList']],
    visionboard:    [[renderVisionBoard, 'o Vision Board', 'visionBoard']],
    fluencia:       [[renderFluencia, 'o Fluência', []]],
    bateria:        [[renderBateria, 'a Bateria', []]],
    academia:       [[renderAcademia, 'a Academia', 'academiaDaysGrid']],
    diario:         [[renderDiario, 'o Diário', 'diarioEntriesList']],
    planoalimentar: [[renderPlanoAlimentar, 'o Plano Alimentar', 'paDaysGrid']],
    busca:          [],
    timelineobjetivos: [[renderTimelineObjetivos, 'a Timeline', 'timelineList']],
    acordar:        [[renderAcordarChecklist, 'a checklist de Acordar', 'acordarChecklistList']],
    supermercado:   [],
    calculos:       [],
    empreendedorismo: [],
    apice:          [],
    config:         []
  };

  const viewsRendered = new Set();
  function markAllViewsStale(){ viewsRendered.clear(); }

  async function renderView(name){
    if(!session) return;
    const jobs = VIEW_RENDERERS[name];
    if(!jobs) return;
    // "hoje" sempre redesenha; as demais, só na primeira abertura.
    if(name !== 'hoje' && viewsRendered.has(name)) return;
    viewsRendered.add(name); // marca antes de aguardar: evita render duplo em clique rápido
    await Promise.allSettled(jobs.map(([fn, label, containers]) => guardRender(fn, label, containers)));
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
    // Este trecho roda antes do Promise.allSettled e não passa por guardRender:
    // qualquer exceção aqui matava o boot inteiro e deixava as 17 telas em
    // "Carregando..." para sempre. Cada passo agora falha sozinho.
    const preludio = [
      ['a migração do histórico da Academia', migrarAcademiaConcluidos],
      ['os membros da Casa', loadCasaMembros],
      ['a cor principal',    loadCorPrincipal],
      ['o tema do Diário',   loadDiarioTheme],
      ['a lista de pessoas', renderConfigCasaMembros],
      ['os campos de responsável', populateCasaResponsavelSelects],
      ['os despertadores', carregarDespertadores],
      ['a lista de despertadores', renderDespertadoresConfig],
      ['a lista de lembretes', renderLembretesConfig],
      ['a checklist de acordar', renderDespertadorChecklistConfig]
    ];
    for(const [rotulo, fn] of preludio){
      try{ await fn(); }
      catch(err){ console.error('Falha no boot ao carregar ' + rotulo + ':', err); }
    }
    await renderView('hoje');
    // Trava de segurança: garante que o overlay global de loading nunca fique
    // travado após o boot, independentemente de qualquer erro acima.
    loadingDepth = 0;
    globalLoadingEl.classList.remove('active');

    atualizarBotaoNotificacoes();
    if(notificacoesLigadas()){
      iniciarAgendadorDeAvisos();
      registrarTokenFcm(); // token pode ter girado desde o último login — reforça a cada boot
    }
    // Despertadores tocam independente do toggle de notificações — só
    // precisam da aba aberta, sem pedir permissão nenhuma pro som.
    iniciarChecagemDeDespertadores();

    // Veio de um toque numa notificação de despertador (app fechado/em
    // segundo plano) — abre direto na tela Acordar em vez do fluxo normal.
    if(new URLSearchParams(location.search).get('despertador')){
      abrirTelaAcordar(new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }));
      history.replaceState(null, '', location.pathname);
    }
  }

  (async function init(){
    const restored = loadSessionFromStorage();
    if(restored){
      session = restored;
      activeDataUid = session.uid;
      currentBoardId = session.uid;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appShell').style.display = '';
    document.body.classList.add('app-ativo');
        await initBoards();
      await bootApp();
      checkPendingInvites();
    }
  })();
