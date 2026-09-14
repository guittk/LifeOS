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
      showAppMessage(events.length + ' evento(s) importado(s) do .ics.', 'success');
    }catch(err){
      showAppMessage('Erro ao importar .ics: ' + err.message, 'error');
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

  /* ---------- Interpretador de texto de tarefa ----------
     "amanhã 14h ligar pro dentista" deveria virar uma tarefa com data, hora e
     nome — não três campos para você preencher. Cada padrão reconhecido é
     removido do nome, então sobra só a ação.

     Deliberadamente conservador: na dúvida, não interpreta. Uma data errada
     silenciosamente é pior que nenhuma data. */
  const DIAS_SEMANA_PT = {
    domingo:0, dom:0, segunda:1, seg:1, 'terça':2, terca:2, ter:2,
    quarta:3, qua:3, quinta:4, qui:4, sexta:5, sex:5, 'sábado':6, sabado:6, sab:6
  };

  function dataMaisDias(n){
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function proximoDiaDaSemana(alvo){
    const hoje = new Date().getDay();
    let delta = (alvo - hoje + 7) % 7;
    if(delta === 0) delta = 7; // "na segunda" dito numa segunda significa a próxima
    return dataMaisDias(delta);
  }

  function interpretarTexto(texto){
    let nome = String(texto || '').trim();
    let date = '', horario = '', recorrencia = '';
    const achados = [];
    // Remove o trecho reconhecido e registra o que foi entendido.
    const consumir = (regex, fn) => {
      const m = nome.match(regex);
      if(!m) return false;
      if(fn(m) === false) return false;
      nome = (nome.slice(0, m.index) + ' ' + nome.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').trim();
      return true;
    };

    // Atenção com acentos: \b se apoia em \w, e "ã"/"ê"/"á" NÃO são \w. Um
    // /\bamanhã\b/ nunca casa, porque não existe fronteira entre "ã" e o espaço
    // seguinte. Por isso os padrões com acento usam (^|\s) e (?=\s|$).
    const B = '(?:^|\\s)';   // início de palavra tolerante a acento
    const E = '(?=\\s|$|[,.;])';

    // 1) Recorrência primeiro: "toda segunda" não pode virar data única.
    consumir(new RegExp(B + '(todo dia|todos os dias|diariamente)' + E, 'i'), () => { recorrencia = 'diaria'; achados.push('todo dia'); });
    if(!recorrencia) consumir(new RegExp(B + '(dias [úu]teis|todo dia [úu]til)' + E, 'i'), () => { recorrencia = 'uteis'; achados.push('dias úteis'); });
    if(!recorrencia) consumir(new RegExp(B + 'tod[ao]s?\\s+(?:as\\s+|os\\s+)?(semanas?|segundas?|ter[çc]as?|quartas?|quintas?|sextas?|s[áa]bados?|domingos?)' + E, 'i'), (m) => {
      recorrencia = 'semanal'; achados.push('toda semana');
      const dia = m[1].toLowerCase().replace(/s$/, '').replace('ç','c').replace(/[áâ]/g,'a');
      const chave = Object.keys(DIAS_SEMANA_PT).find(k => k.length > 3 && dia.startsWith(k.slice(0,3)));
      if(chave) date = proximoDiaDaSemana(DIAS_SEMANA_PT[chave]);
    });
    if(!recorrencia) consumir(new RegExp(B + '(todo m[êe]s|mensalmente)' + E, 'i'), () => { recorrencia = 'mensal'; achados.push('todo mês'); });

    // 2) Data
    if(!date){
      consumir(new RegExp(B + 'depois de amanh[ãa]' + E, 'i'), () => { date = dataMaisDias(2); achados.push('depois de amanhã'); }) ||
      consumir(new RegExp(B + 'amanh[ãa]' + E, 'i'),           () => { date = dataMaisDias(1); achados.push('amanhã'); }) ||
      consumir(new RegExp(B + 'hoje' + E, 'i'),                () => { date = dataMaisDias(0); achados.push('hoje'); }) ||
      consumir(/\bem (\d{1,2}) dias?\b/i,  (m) => { date = dataMaisDias(parseInt(m[1],10)); achados.push('em ' + m[1] + ' dias'); }) ||
      consumir(new RegExp(B + '(?:na\\s+|no\\s+)?(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:-feira)?' + E, 'i'), (m) => {
        const k = m[1].toLowerCase().replace('ç','c').replace(/[áâ]/g,'a');
        const alvo = DIAS_SEMANA_PT[k] ?? DIAS_SEMANA_PT[k.slice(0,3)];
        if(alvo == null) return false;
        date = proximoDiaDaSemana(alvo);
        achados.push(m[1]);
      }) ||
      consumir(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, (m) => {
        const dia = parseInt(m[1],10), mes = parseInt(m[2],10);
        if(dia < 1 || dia > 31 || mes < 1 || mes > 12) return false;
        let ano = m[3] ? parseInt(m[3],10) : new Date().getFullYear();
        if(ano < 100) ano += 2000;
        const iso = ano + '-' + String(mes).padStart(2,'0') + '-' + String(dia).padStart(2,'0');
        // Sem ano explícito e já passou: assume o ano que vem.
        date = (!m[3] && iso < todayStr()) ? (ano+1) + iso.slice(4) : iso;
        achados.push(m[0]);
      });
    }

    // 3) Horário — "14h", "14:30", "9h30", "às 9"
    consumir(/\b(?:[àa]s\s+)?(\d{1,2})[h:](\d{2})\b/i, (m) => {
      const h = parseInt(m[1],10), min = parseInt(m[2],10);
      if(h > 23 || min > 59) return false;
      horario = String(h).padStart(2,'0') + ':' + String(min).padStart(2,'0');
      achados.push(horario);
    }) ||
    consumir(/\b(?:[àa]s\s+)?(\d{1,2})\s?h\b/i, (m) => {
      const h = parseInt(m[1],10);
      if(h > 23) return false;
      horario = String(h).padStart(2,'0') + ':00';
      achados.push(horario);
    });

    // Limpa preposições órfãs deixadas pela remoção ("ligar pro dentista às" → sem o "às")
    nome = nome.replace(/\s+(às|as|de|da|do|em|na|no|pra|para)\s*$/i, '')
               .replace(/^\s*(às|as|de|da|do|em|na|no)\s+/i, '')
               .replace(/\s{2,}/g, ' ')
               .trim();

    return { nome, date, horario, recorrencia, achados };
  }

  /* Enquanto você digita, mostra o que foi entendido e preenche os campos.
     O preenchimento é visível e editável: se o palpite estiver errado, dá pra
     corrigir antes de salvar. */
  const newTaskNameInput = document.getElementById('newTaskNameInput');
  const newTaskParseHint = document.getElementById('newTaskParseHint');
  const newTaskRecorrenciaSelect = document.getElementById('newTaskRecorrenciaSelect');
  let parseHintTimer = null;

  function atualizarParseHint(){
    if(!newTaskParseHint) return;
    const p = interpretarTexto(newTaskNameInput.value);
    if(!p.achados.length){
      newTaskParseHint.textContent = '';
      newTaskParseHint.classList.remove('active');
      return;
    }
    if(p.date){
      newTaskDateInput.value = p.date;
      newTaskNoDateToggle.classList.remove('active');
    }
    if(p.horario) document.getElementById('newTaskHorarioInput').value = p.horario;
    if(p.recorrencia) newTaskRecorrenciaSelect.value = p.recorrencia;

    const partes = [];
    if(p.date) partes.push(fmtShortDate(p.date));
    if(p.horario) partes.push(p.horario);
    if(p.recorrencia) partes.push(TAREFA_RECORRENCIA_LABEL[p.recorrencia] || p.recorrencia);
    newTaskParseHint.textContent = 'Entendi: ' + partes.join(' · ') + ' — "' + (p.nome || '(sem nome)') + '"';
    newTaskParseHint.classList.add('active');
  }
  if(newTaskNameInput){
    newTaskNameInput.addEventListener('input', () => {
      clearTimeout(parseHintTimer);
      parseHintTimer = setTimeout(atualizarParseHint, 220);
    });
  }

  const TAREFA_RECORRENCIA_LABEL = {
    diaria: 'todo dia', uteis: 'dias úteis', semanal: 'toda semana',
    quinzenal: 'a cada 15 dias', mensal: 'todo mês'
  };

  document.getElementById('newTaskCreateBtn').addEventListener('click', async () => {
    const bruto = newTaskNameInput.value.trim();
    if(!bruto) return;
    // O nome salvo é o texto já sem os trechos de data/hora reconhecidos.
    const p = interpretarTexto(bruto);
    const name = p.nome || bruto;
    const noDate = newTaskNoDateToggle.classList.contains('active');
    const date = noDate ? '' : (newTaskDateInput.value || p.date || '');
    const group = document.getElementById('newTaskGroupSelect').value;
    const horario = document.getElementById('newTaskHorarioInput').value || p.horario || '';
    const recorrencia = newTaskRecorrenciaSelect ? newTaskRecorrenciaSelect.value : '';
    const id = newId();
    await dbPut(userPath('/Tasks/' + id), {
      name, date, group, horario, recorrencia,
      done:false, createdAt: new Date().toISOString()
    });
    closeTaskModal();
    if(newTaskParseHint){ newTaskParseHint.textContent = ''; newTaskParseHint.classList.remove('active'); }
    if(newTaskRecorrenciaSelect) newTaskRecorrenciaSelect.value = '';
    await renderTasks(); await renderTaskGroups(); await renderHojeQueue();
  });

  /* ---------- Recorrência ----------
     Uma tarefa que repete não vira várias linhas no banco: ao ser concluída,
     ela avança para a próxima data e volta a ficar pendente. Isso mantém o
     histórico enxuto e evita a lista encher de ocorrências futuras. */
  function proximaDataRecorrencia(dataBase, recorrencia){
    const base = new Date((dataBase || todayStr()) + 'T00:00:00');
    if(isNaN(base)) return '';
    const avancar = (d) => { base.setDate(base.getDate() + d); };
    switch(recorrencia){
      case 'diaria':    avancar(1); break;
      case 'uteis':     do { avancar(1); } while(base.getDay() === 0 || base.getDay() === 6); break;
      case 'semanal':   avancar(7); break;
      case 'quinzenal': avancar(14); break;
      case 'mensal':    base.setMonth(base.getMonth() + 1); break;
      default: return '';
    }
    // Se a tarefa ficou parada por vários ciclos, pula pro próximo à frente de hoje.
    let guarda = 0;
    while(base.toISOString().slice(0,10) < todayStr() && guarda++ < 400){
      if(recorrencia === 'mensal') base.setMonth(base.getMonth() + 1);
      else if(recorrencia === 'uteis'){ do { avancar(1); } while(base.getDay() === 0 || base.getDay() === 6); }
      else avancar(recorrencia === 'diaria' ? 1 : recorrencia === 'semanal' ? 7 : 14);
    }
    return base.getFullYear() + '-' + String(base.getMonth()+1).padStart(2,'0') + '-' + String(base.getDate()).padStart(2,'0');
  }

  async function toggleTaskDone(id, done){
    const t = await dbGet(userPath('/Tasks/' + id)) || {};
    if(done && t.recorrencia){
      // Mesmo tratamento da fila de Hoje: avança o ciclo em vez de encerrar.
      const dataFeita = t.date || todayStr();
      await dbPatch(userPath('/Tasks/' + id), {
        date: proximaDataRecorrencia(dataFeita, t.recorrencia), done:false, ultimaFeita: dataFeita
      });
    }else{
      await dbPatch(userPath('/Tasks/' + id), { done });
    }
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
      dbGet(userPath('/TaskGroups')),
      dbGet(userPath('/Tasks'))
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
          </table>` : '<p class="gaveta-empty">Nenhuma tarefa neste grupo ainda. Use "+ Nova tarefa" e escolha este grupo.</p>'}
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

  /* ---------- PLANEJAMENTO (portado do projeto Apice) ----------
     Quadro estilo Monday.com: grupos coloridos → elementos → subelementos (só 2
     níveis), cada um com status, prioridade, responsável e prazo. Substitui o
     board simples de "sessões de início/parada" que existia antes — dados
     antigos em /MondayTasks ficam intocados no banco, só não são mais lidos
     por nenhuma tela (ver conversa: troca pedida explicitamente pelo usuário).
     Escopo combinado: só o quadro principal — sem Timeline/Gantt, Kanban de
     Task nem Aprovação por votação, que existem no Apice mas ficam de fora. */

  const PLAN_STATUS_ORDER = ['backlog', 'todo', 'doing', 'blocked', 'done', 'moved', 'canceled'];
  const PLAN_STATUS_LABEL = { backlog:'Backlog', todo:'To Do', doing:'Em andamento', blocked:'Bloqueado', done:'Concluído', moved:'Adiado', canceled:'Cancelado' };
  const PLAN_STATUS_COLOR = { backlog:'#707588', todo:'#79AFFD', doing:'#FDBC64', blocked:'#E8697D', done:'#33D391', moved:'#359970', canceled:'#5C5C5C' };
  const PLAN_STATUS_TEXTO_ESCURO = new Set(['todo', 'doing', 'done']);
  const PLAN_GROUP_COLORS = ['#00b7c4', '#ffa800', '#6c8cff', '#e5484d', '#8b5cf6', '#f5b301', '#60519b', '#0a7386'];

  let planState = { grupos:{}, itens:{}, loaded:false };
  async function planCarregarEstado(){
    const [grupos, itens] = await Promise.all([dbGet(userPath('/PlanGrupos')), dbGet(userPath('/PlanItens'))]);
    planState = { grupos: grupos || {}, itens: itens || {}, loaded:true };
    return planState;
  }
  function planGruposOrdenados(){ return Object.values(planState.grupos).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)); }
  function planItensDe(groupId, parentId){
    return Object.values(planState.itens)
      .filter(i => i.groupId === groupId && (i.parentId || null) === (parentId || null))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }
  function planContarNoGrupo(groupId){ return Object.values(planState.itens).filter(i => i.groupId === groupId).length; }

  async function planCreateGrupo(nome){
    const grupos = planGruposOrdenados();
    const grupo = { id:newId(), nome: nome || 'Novo grupo', cor: PLAN_GROUP_COLORS[grupos.length % PLAN_GROUP_COLORS.length], ordem: grupos.length, colapsado:false, criadoEm:new Date().toISOString() };
    planState.grupos[grupo.id] = grupo;
    await dbPutSilent(userPath('/PlanGrupos/' + grupo.id), grupo);
    return grupo;
  }
  async function planUpdateGrupo(id, patch){
    if(!planState.grupos[id]) return;
    planState.grupos[id] = { ...planState.grupos[id], ...patch };
    await dbPatchSilent(userPath('/PlanGrupos/' + id), patch);
  }
  async function planDeleteGrupo(id){
    const itensDoGrupo = Object.values(planState.itens).filter(i => i.groupId === id);
    delete planState.grupos[id];
    itensDoGrupo.forEach(i => delete planState.itens[i.id]);
    await Promise.all([dbDeleteSilent(userPath('/PlanGrupos/' + id)), ...itensDoGrupo.map(i => dbDeleteSilent(userPath('/PlanItens/' + i.id)))]);
  }
  async function planCreateItem(groupId, parentId, nome){
    const irmaos = planItensDe(groupId, parentId);
    const item = {
      id:newId(), groupId, parentId: parentId || null, nome: nome || '', descricao:'', responsavel:'',
      status:'backlog', prioridade:0, dueDate:null, ordem: irmaos.length, criadoEm:new Date().toISOString()
    };
    planState.itens[item.id] = item;
    await dbPutSilent(userPath('/PlanItens/' + item.id), item);
    return item;
  }
  async function planUpdateItem(id, patch){
    if(!planState.itens[id]) return;
    planState.itens[id] = { ...planState.itens[id], ...patch };
    await dbPatchSilent(userPath('/PlanItens/' + id), patch);
  }
  async function planDeleteItem(id){
    const filhos = Object.values(planState.itens).filter(i => i.parentId === id);
    delete planState.itens[id];
    filhos.forEach(f => delete planState.itens[f.id]);
    await Promise.all([dbDeleteSilent(userPath('/PlanItens/' + id)), ...filhos.map(f => dbDeleteSilent(userPath('/PlanItens/' + f.id)))]);
  }
  // Move (ou só reordena) um item pra logo antes de `antesDeId` dentro do escopo
  // (groupId, parentId) informado — cobre reordenar, mudar de grupo e promover/
  // aninhar como subitem, tudo com a mesma conta de "ordem" fracionária.
  async function planMoverItem(itemId, { groupId, parentId, antesDeId }){
    const item = planState.itens[itemId];
    if(!item) return;
    const irmaos = planItensDe(groupId, parentId).filter(i => i.id !== itemId);
    const idx = antesDeId ? irmaos.findIndex(i => i.id === antesDeId) : irmaos.length;
    const anterior = idx > 0 ? irmaos[idx - 1] : null;
    const seguinte = idx >= 0 && idx < irmaos.length ? irmaos[idx] : null;
    const ordemAnterior = anterior ? (anterior.ordem || 0) : -1;
    const ordemSeguinte = seguinte ? (seguinte.ordem || 0) : (anterior ? anterior.ordem + 2 : 1);
    await planUpdateItem(itemId, { groupId, parentId: parentId || null, ordem: (ordemAnterior + ordemSeguinte) / 2 });
  }
  async function planReordenarGrupo(idArrastado, idAlvo){
    const grupos = planGruposOrdenados().filter(g => g.id !== idArrastado);
    const idx = idAlvo ? grupos.findIndex(g => g.id === idAlvo) : grupos.length;
    const anterior = idx > 0 ? grupos[idx - 1] : null;
    const seguinte = idx >= 0 && idx < grupos.length ? grupos[idx] : null;
    const ordemAnterior = anterior ? (anterior.ordem || 0) : -1;
    const ordemSeguinte = seguinte ? (seguinte.ordem || 0) : (anterior ? anterior.ordem + 2 : 1);
    await planUpdateGrupo(idArrastado, { ordem: (ordemAnterior + ordemSeguinte) / 2 });
  }

  /* ---------- UI ---------- */
  let planContainerEl = null;
  let planModoSelecao = false;
  const planSelecionados = new Set();
  let planItemDragId = null;
  let planGrupoDragId = null;
  let planResponsavelAlvo = null; // id (string) ou array de ids, definido antes de abrir o modal

  function planFecharPops(){ document.querySelectorAll('.board-card-pop, .color-picker').forEach(el => el.remove()); }

  function planAbrirStatusPopover(anchorEl, onEscolher){
    planFecharPops();
    const pop = document.createElement('div');
    pop.className = 'board-card-pop';
    pop.innerHTML = PLAN_STATUS_ORDER.map(st =>
      `<div class="cat-item" data-status="${st}"><span class="dot" style="background:${PLAN_STATUS_COLOR[st]}"></span>${PLAN_STATUS_LABEL[st]}</div>`
    ).join('');
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 190) + 'px';
    pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    function fechar(){ pop.remove(); document.removeEventListener('click', onDoc); }
    function onDoc(e){ if(!pop.contains(e.target) && e.target !== anchorEl) fechar(); }
    pop.querySelectorAll('[data-status]').forEach(el => el.addEventListener('click', () => { fechar(); onEscolher(el.getAttribute('data-status')); }));
    setTimeout(() => document.addEventListener('click', onDoc), 10);
  }
  function planStarsHtml(prioridade, tamanho){
    const p = prioridade || 0;
    return Array.from({ length:5 }).map((_, i) =>
      `<span class="plan-star${i < p ? ' on' : ''}" data-star="${i + 1}" style="font-size:${tamanho || 13}px">★</span>`
    ).join('');
  }
  function planWireStars(el, onEscolher){
    el.querySelectorAll('[data-star]').forEach(star => {
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        const v = parseInt(star.getAttribute('data-star'), 10);
        const atual = el.querySelectorAll('.plan-star.on').length;
        onEscolher(v === atual ? 0 : v);
      });
    });
  }
  function planStatusPillHtml(status){
    const dark = PLAN_STATUS_TEXTO_ESCURO.has(status);
    return `<span class="plan-status-pill" style="background:${PLAN_STATUS_COLOR[status]}; color:${dark ? '#14141e' : '#fff'}">${PLAN_STATUS_LABEL[status]}</span>`;
  }
  function planPrazoAtrasado(item){
    if(!item.dueDate || ['done', 'moved', 'canceled'].includes(item.status)) return false;
    return item.dueDate < todayStr();
  }

  function planRowHtml(item, isSub){
    const sel = planSelecionados.has(item.id);
    return `
      <div class="plan-row${isSub ? ' plan-row-sub' : ''}${sel ? ' selecionado' : ''}" data-item-id="${item.id}" draggable="${!planModoSelecao}">
        ${planModoSelecao ? `<input type="checkbox" class="plan-check" data-select-item="${item.id}"${sel ? ' checked' : ''}>` : '<span class="plan-drag">⠿</span>'}
        <input type="text" class="plan-row-nome" data-nome-item="${item.id}" value="${escapeHtml(item.nome || '')}" placeholder="Sem nome">
        <button type="button" class="plan-row-resp" data-resp-item="${item.id}">${item.responsavel ? escapeHtml(item.responsavel) : '+ resp.'}</button>
        <button type="button" class="plan-row-status-btn" data-status-item="${item.id}">${planStatusPillHtml(item.status)}</button>
        <div class="plan-stars" data-stars-item="${item.id}">${planStarsHtml(item.prioridade)}</div>
        <input type="date" class="plan-row-prazo${planPrazoAtrasado(item) ? ' atrasado' : ''}" data-prazo-item="${item.id}" value="${item.dueDate || ''}">
        <button type="button" class="plan-row-icon" data-detail-item="${item.id}" title="Abrir detalhes">⤢</button>
        <button type="button" class="plan-row-icon plan-row-del" data-del-item="${item.id}" title="Excluir">🗑</button>
      </div>`;
  }

  function planGrupoHtml(grupo){
    const raizes = planItensDe(grupo.id, null);
    const total = planContarNoGrupo(grupo.id);
    const linhas = raizes.map(raiz => {
      const subs = planItensDe(grupo.id, raiz.id);
      return planRowHtml(raiz, false) + subs.map(s => planRowHtml(s, true)).join('') +
        `<div class="plan-add-row plan-add-sub" data-add-sub-de="${raiz.id}"><input type="text" placeholder="+ Adicionar sub elemento" data-add-sub-input="${raiz.id}"></div>`;
    }).join('');
    return `
      <div class="plan-group" data-group-id="${grupo.id}" style="--group-cor:${grupo.cor}">
        <div class="plan-group-head" draggable="true">
          <span class="plan-drag">⠿</span>
          <button type="button" class="plan-group-chevron" data-toggle-grupo="${grupo.id}">${grupo.colapsado ? '▸' : '▾'}</button>
          <button type="button" class="plan-group-swatch" data-abrir-cor-grupo="${grupo.id}" style="background:${grupo.cor}"></button>
          <input type="text" class="plan-group-nome" data-nome-grupo="${grupo.id}" value="${escapeHtml(grupo.nome)}">
          <span class="plan-group-count">${total} elemento${total === 1 ? '' : 's'}</span>
          <button type="button" class="plan-row-icon plan-row-del" data-del-grupo="${grupo.id}" title="Excluir grupo">🗑</button>
        </div>
        <div class="plan-group-body" data-group-body="${grupo.id}" style="display:${grupo.colapsado ? 'none' : 'block'}">
          ${linhas}
          <div class="plan-add-row" data-add-de="${grupo.id}"><input type="text" placeholder="+ Adicionar elemento" data-add-input="${grupo.id}"></div>
        </div>
      </div>`;
  }

  function planSelecaoBarHtml(){
    const grupos = planGruposOrdenados();
    return `
      <span>${planSelecionados.size} selecionado${planSelecionados.size === 1 ? '' : 's'}</span>
      <button type="button" data-act="status">Status</button>
      <button type="button" data-act="prioridade">Prioridade</button>
      <button type="button" data-act="responsavel">Responsável</button>
      <input type="date" id="planBulkPrazo" title="Definir prazo pra todos os selecionados">
      <select id="planBulkGrupo" class="plan-bulk-select"><option value="">Mover pra grupo...</option>${grupos.map(g => `<option value="${g.id}">${escapeHtml(g.nome)}</option>`).join('')}</select>
      <button type="button" data-act="excluir" style="color:var(--coral);">Excluir</button>
      <button type="button" data-act="cancelar">Cancelar</button>`;
  }

  async function planRender(){
    if(!planContainerEl) return;
    if(!planState.loaded){ planContainerEl.innerHTML = '<p class="empty-state">Carregando...</p>'; return; }
    planFecharPops();
    const grupos = planGruposOrdenados();
    const barEl = document.getElementById('planSelecaoBar');
    if(planSelecionados.size){
      barEl.style.display = 'flex';
      barEl.innerHTML = planSelecaoBarHtml();
      planWireSelecaoBar();
    } else {
      barEl.style.display = 'none';
      barEl.innerHTML = '';
    }
    if(!grupos.length){
      planContainerEl.innerHTML = '<p class="empty-state">Nenhum grupo ainda. Clique em "+ Novo grupo" pra começar.</p>';
      return;
    }
    planContainerEl.innerHTML = grupos.map(g => planGrupoHtml(g)).join('');
    planWireGrupos();
  }

  function planWireSelecaoBar(){
    const bar = document.getElementById('planSelecaoBar');
    bar.querySelector('[data-act="cancelar"]').addEventListener('click', () => { planSelecionados.clear(); planModoSelecao = false; planRender(); });
    bar.querySelector('[data-act="excluir"]').addEventListener('click', async () => {
      const n = planSelecionados.size;
      if(!await showConfirm(`Excluir ${n} elemento(s) selecionado(s)? Subelementos deles também são excluídos.`)) return;
      await Promise.all(Array.from(planSelecionados).map(id => planDeleteItem(id)));
      planSelecionados.clear();
      planRender();
    });
    bar.querySelector('[data-act="status"]').addEventListener('click', (e) => {
      planAbrirStatusPopover(e.currentTarget, async (status) => {
        await Promise.all(Array.from(planSelecionados).map(id => planUpdateItem(id, { status })));
        planRender();
      });
    });
    bar.querySelector('[data-act="prioridade"]').addEventListener('click', (e) => {
      planFecharPops();
      const pop = document.createElement('div');
      pop.className = 'board-card-pop';
      pop.innerHTML = '<div class="plan-stars" style="padding:6px 9px;">' + planStarsHtml(0, 18) + '</div>';
      document.body.appendChild(pop);
      const rect = e.currentTarget.getBoundingClientRect();
      pop.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 190) + 'px';
      pop.style.top = (rect.bottom + window.scrollY + 4) + 'px';
      planWireStars(pop, async (prioridade) => {
        pop.remove();
        await Promise.all(Array.from(planSelecionados).map(id => planUpdateItem(id, { prioridade })));
        planRender();
      });
      function onDoc(ev){ if(!pop.contains(ev.target)){ pop.remove(); document.removeEventListener('click', onDoc); } }
      setTimeout(() => document.addEventListener('click', onDoc), 10);
    });
    bar.querySelector('[data-act="responsavel"]').addEventListener('click', () => {
      planResponsavelAlvo = Array.from(planSelecionados);
      document.getElementById('planResponsavelModalInput').value = '';
      document.getElementById('planResponsavelModal').classList.add('active');
    });
    bar.querySelector('#planBulkPrazo').addEventListener('change', async (e) => {
      const dueDate = e.target.value || null;
      await Promise.all(Array.from(planSelecionados).map(id => planUpdateItem(id, { dueDate })));
      planRender();
    });
    bar.querySelector('#planBulkGrupo').addEventListener('change', async (e) => {
      const groupId = e.target.value;
      if(!groupId) return;
      await Promise.all(Array.from(planSelecionados).map(id => planUpdateItem(id, { groupId, parentId:null })));
      planSelecionados.clear();
      planRender();
    });
  }

  function planWireGrupos(){
    planContainerEl.querySelectorAll('[data-toggle-grupo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-toggle-grupo');
        await planUpdateGrupo(id, { colapsado: !planState.grupos[id].colapsado });
        planRender();
      });
    });
    planContainerEl.querySelectorAll('[data-abrir-cor-grupo]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-abrir-cor-grupo');
        notasAbrirColorPicker(btn, planState.grupos[id].cor, async (cor) => {
          btn.style.background = cor;
          await planUpdateGrupo(id, { cor });
          planRender();
        });
      });
    });
    planContainerEl.querySelectorAll('[data-nome-grupo]').forEach(inp => {
      inp.addEventListener('click', (e) => e.stopPropagation());
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-nome-grupo');
        const nome = inp.value.trim() || 'Sem nome';
        if(nome !== planState.grupos[id].nome) await planUpdateGrupo(id, { nome });
      });
      inp.addEventListener('keydown', (e) => { if(e.key === 'Enter') inp.blur(); });
    });
    planContainerEl.querySelectorAll('[data-del-grupo]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-del-grupo');
        const total = planContarNoGrupo(id);
        if(!await showConfirm(`Excluir o grupo "${planState.grupos[id].nome}"${total ? ` e seus ${total} elemento(s)` : ''}? Essa ação não pode ser desfeita.`)) return;
        await planDeleteGrupo(id);
        planRender();
      });
    });
    planContainerEl.querySelectorAll('[data-add-input]').forEach(inp => {
      inp.addEventListener('keydown', async (e) => {
        if(e.key !== 'Enter' || !inp.value.trim()) return;
        const groupId = inp.getAttribute('data-add-input');
        await planCreateItem(groupId, null, inp.value.trim());
        planRender();
      });
    });
    planContainerEl.querySelectorAll('[data-add-sub-input]').forEach(inp => {
      inp.addEventListener('keydown', async (e) => {
        if(e.key !== 'Enter' || !inp.value.trim()) return;
        const raizId = inp.getAttribute('data-add-sub-input');
        const raiz = planState.itens[raizId];
        await planCreateItem(raiz.groupId, raizId, inp.value.trim());
        planRender();
      });
    });
    // Grupo: arrastar pela alça do header reordena grupos entre si.
    planContainerEl.querySelectorAll('.plan-group-head').forEach(head => {
      const groupEl = head.closest('.plan-group');
      const groupId = groupEl.getAttribute('data-group-id');
      head.addEventListener('dragstart', (e) => {
        if(e.target.closest('input, button')){ e.preventDefault(); return; }
        planGrupoDragId = groupId;
        groupEl.classList.add('arrastando');
        e.dataTransfer.setData('text/plan-grupo-id', groupId);
        e.dataTransfer.effectAllowed = 'move';
      });
      head.addEventListener('dragend', () => groupEl.classList.remove('arrastando'));
    });
    planContainerEl.querySelectorAll('.plan-group').forEach(groupEl => {
      const groupId = groupEl.getAttribute('data-group-id');
      groupEl.addEventListener('dragover', (e) => { if(planGrupoDragId) e.preventDefault(); });
      groupEl.addEventListener('drop', async (e) => {
        if(!planGrupoDragId || planGrupoDragId === groupId) return;
        e.preventDefault();
        e.stopPropagation();
        await planReordenarGrupo(planGrupoDragId, groupId);
        planGrupoDragId = null;
        planRender();
      });
    });
    planWireRows();
  }

  function planWireRows(){
    planContainerEl.querySelectorAll('.plan-row').forEach(row => {
      const itemId = row.getAttribute('data-item-id');
      const item = planState.itens[itemId];
      if(!item) return;

      const checkbox = row.querySelector('[data-select-item]');
      if(checkbox) checkbox.addEventListener('change', () => {
        if(checkbox.checked) planSelecionados.add(itemId); else planSelecionados.delete(itemId);
        planRender();
      });

      const nomeInp = row.querySelector('[data-nome-item]');
      nomeInp.addEventListener('click', (e) => e.stopPropagation());
      nomeInp.addEventListener('blur', async () => {
        if(nomeInp.value.trim() !== (item.nome || '')) await planUpdateItem(itemId, { nome: nomeInp.value.trim() });
      });
      nomeInp.addEventListener('keydown', (e) => { if(e.key === 'Enter') nomeInp.blur(); });

      const respBtn = row.querySelector('[data-resp-item]');
      respBtn.addEventListener('click', () => {
        planResponsavelAlvo = itemId;
        document.getElementById('planResponsavelModalInput').value = item.responsavel || '';
        document.getElementById('planResponsavelModal').classList.add('active');
      });

      const statusBtn = row.querySelector('[data-status-item]');
      statusBtn.addEventListener('click', () => {
        planAbrirStatusPopover(statusBtn, async (status) => { await planUpdateItem(itemId, { status }); planRender(); });
      });

      planWireStars(row.querySelector('[data-stars-item]'), async (prioridade) => { await planUpdateItem(itemId, { prioridade }); planRender(); });

      const prazoInp = row.querySelector('[data-prazo-item]');
      prazoInp.addEventListener('click', (e) => e.stopPropagation());
      prazoInp.addEventListener('change', async () => { await planUpdateItem(itemId, { dueDate: prazoInp.value || null }); planRender(); });

      row.querySelector('[data-detail-item]').addEventListener('click', (e) => { e.stopPropagation(); planAbrirDetalhe(itemId); });
      row.querySelector('[data-del-item]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if(!await showConfirm(`Excluir "${item.nome || 'sem nome'}"?`)) return;
        await planDeleteItem(itemId);
        planRender();
      });

      if(planModoSelecao){
        row.addEventListener('click', (e) => {
          if(e.target.closest('input, button')) return;
          if(checkbox){ checkbox.checked = !checkbox.checked; checkbox.dispatchEvent(new Event('change')); }
        });
      } else {
        row.addEventListener('dragstart', (e) => {
          if(e.target.closest('input, button')){ e.preventDefault(); return; }
          planItemDragId = itemId;
          row.classList.add('arrastando');
          e.dataTransfer.setData('text/plan-item-id', itemId);
          e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => row.classList.remove('arrastando'));
        row.addEventListener('dragover', (e) => { if(planItemDragId) { e.preventDefault(); e.stopPropagation(); row.classList.add('alvo-drop'); } });
        row.addEventListener('dragleave', () => row.classList.remove('alvo-drop'));
        row.addEventListener('drop', async (e) => {
          if(!planItemDragId || planItemDragId === itemId) return;
          e.preventDefault();
          e.stopPropagation();
          row.classList.remove('alvo-drop');
          // Soltar sobre uma linha insere o arrastado logo antes dela, no mesmo
          // grupo/pai — vira reordenar, promover a raiz, virar irmão de um
          // subitem ou mudar de grupo, tudo com a mesma regra.
          await planMoverItem(planItemDragId, { groupId: item.groupId, parentId: item.parentId || null, antesDeId: itemId });
          planItemDragId = null;
          planRender();
        });
      }
    });
    // Soltar na área vazia do corpo do grupo (fora de qualquer linha) manda o
    // item pro fim daquele grupo, como raiz.
    planContainerEl.querySelectorAll('[data-group-body]').forEach(body => {
      const groupId = body.getAttribute('data-group-body');
      body.addEventListener('dragover', (e) => { if(planItemDragId && e.target === body) e.preventDefault(); });
      body.addEventListener('drop', async (e) => {
        if(!planItemDragId || e.target !== body) return;
        e.preventDefault();
        await planMoverItem(planItemDragId, { groupId, parentId:null, antesDeId:null });
        planItemDragId = null;
        planRender();
      });
    });
  }

  /* ---------- Modal de detalhe do elemento ---------- */
  let planDetalheId = null;
  function planRenderSubsNoModal(){
    const raiz = planState.itens[planDetalheId];
    const wrap = document.getElementById('planItemSubsWrap');
    if(!raiz || raiz.parentId){ wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    const subs = planItensDe(raiz.groupId, raiz.id);
    document.getElementById('planItemSubsList').innerHTML = subs.map(s => `
      <div class="plan-modal-sub-row" data-sub-row="${s.id}">
        <input type="text" data-sub-nome="${s.id}" value="${escapeHtml(s.nome || '')}">
        <button type="button" data-sub-del="${s.id}" title="Excluir">×</button>
      </div>`).join('') || '<p class="empty-state" style="margin:6px 0;">Nenhum subelemento ainda. Adicione abaixo pra quebrar este item em passos menores.</p>';
    document.querySelectorAll('#planItemSubsList [data-sub-nome]').forEach(inp => {
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-sub-nome');
        if(inp.value.trim() !== (planState.itens[id].nome || '')) await planUpdateItem(id, { nome: inp.value.trim() });
        planRender();
      });
    });
    document.querySelectorAll('#planItemSubsList [data-sub-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await planDeleteItem(btn.getAttribute('data-sub-del'));
        planRenderSubsNoModal();
        planRender();
      });
    });
  }
  function planWireModalPrioridadeStars(itemId){
    const el = document.getElementById('planItemPrioridade');
    planWireStars(el, async (prioridade) => {
      await planUpdateItem(itemId, { prioridade });
      el.innerHTML = planStarsHtml(prioridade, 18);
      planWireModalPrioridadeStars(itemId);
      planRender();
    });
  }
  function planAbrirDetalhe(itemId){
    const item = planState.itens[itemId];
    if(!item) return;
    planDetalheId = itemId;
    document.getElementById('planItemNomeInput').value = item.nome || '';
    document.getElementById('planItemPrazoInput').value = item.dueDate || '';
    document.getElementById('planItemDescricaoInput').value = item.descricao || '';
    document.getElementById('planItemResponsavelBtn').textContent = item.responsavel || 'Ninguém específico';
    document.getElementById('planItemStatusBtn').innerHTML = planStatusPillHtml(item.status);
    document.getElementById('planItemPrioridade').innerHTML = planStarsHtml(item.prioridade, 18);
    planWireModalPrioridadeStars(itemId);
    planRenderSubsNoModal();
    document.getElementById('planItemModal').classList.add('active');
  }
  document.getElementById('planItemNomeInput').addEventListener('blur', async (e) => {
    if(!planDetalheId) return;
    const nome = e.target.value.trim();
    if(nome !== (planState.itens[planDetalheId].nome || '')){ await planUpdateItem(planDetalheId, { nome }); planRender(); }
  });
  document.getElementById('planItemPrazoInput').addEventListener('change', async (e) => {
    if(!planDetalheId) return;
    await planUpdateItem(planDetalheId, { dueDate: e.target.value || null });
    planRender();
  });
  document.getElementById('planItemDescricaoInput').addEventListener('blur', async (e) => {
    if(!planDetalheId) return;
    await planUpdateItem(planDetalheId, { descricao: e.target.value });
  });
  document.getElementById('planItemStatusBtn').addEventListener('click', (e) => {
    if(!planDetalheId) return;
    planAbrirStatusPopover(e.currentTarget, async (status) => {
      await planUpdateItem(planDetalheId, { status });
      document.getElementById('planItemStatusBtn').innerHTML = planStatusPillHtml(status);
      planRender();
    });
  });
  document.getElementById('planItemResponsavelBtn').addEventListener('click', () => {
    if(!planDetalheId) return;
    planResponsavelAlvo = planDetalheId;
    document.getElementById('planResponsavelModalInput').value = planState.itens[planDetalheId].responsavel || '';
    document.getElementById('planResponsavelModal').classList.add('active');
  });
  document.getElementById('planItemNovoSubInput').addEventListener('keydown', async (e) => {
    if(e.key !== 'Enter' || !e.target.value.trim() || !planDetalheId) return;
    const raiz = planState.itens[planDetalheId];
    await planCreateItem(raiz.groupId, planDetalheId, e.target.value.trim());
    e.target.value = '';
    planRenderSubsNoModal();
    planRender();
  });
  document.getElementById('planItemExcluirBtn').addEventListener('click', async () => {
    if(!planDetalheId) return;
    if(!await showConfirm('Excluir este elemento e seus subelementos?')) return;
    await planDeleteItem(planDetalheId);
    document.getElementById('planItemModal').classList.remove('active');
    planDetalheId = null;
    planRender();
  });
  document.getElementById('planItemFecharBtn').addEventListener('click', () => {
    document.getElementById('planItemModal').classList.remove('active');
    planDetalheId = null;
  });
  document.getElementById('planItemModal').addEventListener('click', (e) => {
    if(e.target.id === 'planItemModal'){ document.getElementById('planItemModal').classList.remove('active'); planDetalheId = null; }
  });

  /* ---------- Modal de responsável (compartilhado: linha isolada, lote, ou pelo detalhe) ---------- */
  document.getElementById('planResponsavelModalCancelBtn').addEventListener('click', () => {
    document.getElementById('planResponsavelModal').classList.remove('active');
    planResponsavelAlvo = null;
  });
  document.getElementById('planResponsavelModal').addEventListener('click', (e) => {
    if(e.target.id === 'planResponsavelModal'){ document.getElementById('planResponsavelModal').classList.remove('active'); planResponsavelAlvo = null; }
  });
  document.getElementById('planResponsavelModalOkBtn').addEventListener('click', async () => {
    const responsavel = document.getElementById('planResponsavelModalInput').value;
    const alvo = planResponsavelAlvo;
    document.getElementById('planResponsavelModal').classList.remove('active');
    planResponsavelAlvo = null;
    if(!alvo) return;
    if(Array.isArray(alvo)) await Promise.all(alvo.map(id => planUpdateItem(id, { responsavel })));
    else await planUpdateItem(alvo, { responsavel });
    if(planDetalheId === alvo) document.getElementById('planItemResponsavelBtn').textContent = responsavel || 'Ninguém específico';
    planRender();
  });

  /* ---------- Toolbar da view ---------- */
  document.getElementById('planNovoGrupoBtn').addEventListener('click', async () => {
    const grupo = await planCreateGrupo('Novo grupo');
    planRender();
    const inp = planContainerEl.querySelector(`[data-nome-grupo="${grupo.id}"]`);
    if(inp){ inp.focus(); inp.select(); }
  });
  document.getElementById('planSelecionarBtn').addEventListener('click', () => {
    planModoSelecao = !planModoSelecao;
    document.getElementById('planSelecionarBtn').classList.toggle('btn-primary', planModoSelecao);
    if(!planModoSelecao) planSelecionados.clear();
    planRender();
  });

  async function renderPlanejamento(){
    if(!document.getElementById('planGruposList')) return;
    await planCarregarEstado();
    planContainerEl = document.getElementById('planGruposList');
    planRender();
  }

