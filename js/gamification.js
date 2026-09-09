/* =============================================================================
   GAMIFICAÇÃO — Life OS

   Camada em cima do que o app já grava. Nenhuma feature nova de dados: cada
   ação que já era registrada no Firebase (tarefa concluída, exercício feito,
   card estudado, refeição, página de diário, decisão) vira XP de um atributo.

   Carregado ANTES do app.js. Só define funções — nada roda no topo — então as
   chamadas a dbGet/dbPatchSilent/userPath (que vivem no app.js) só acontecem
   em tempo de execução, quando os dois arquivos já carregaram.

   Estado persistido em /users/{uid}/Progresso.
   ============================================================================= */

/* ---------- Atributos ---------- */
var GAM_ATRIBUTOS = {
  corpo: { nome: 'CORPO', glifo: '⚡', cor: 'var(--purple)', fontes: 'Academia, Água, Plano Alimentar' },
  mente: { nome: 'MENTE', glifo: '◈', cor: 'var(--blue)',   fontes: 'Fluência, Diário, Decisões' },
  ordem: { nome: 'ORDEM', glifo: '▣', cor: 'var(--sage)',   fontes: 'Tarefas, Monday, Casa, Arquivo' },
  visao: { nome: 'VISÃO', glifo: '✦', cor: 'var(--gold)',   fontes: 'Objetivos, Vision Board' }
};

/* ---------- Tabela de XP ----------
   Calibrada por atrito: o que custa mais esforço paga mais. Ajustar os números
   é seguro; o que importa é a proporção entre eles. */
var GAM_EVENTOS = {
  tarefa:             { xp: 10,  attr: 'ordem', label: 'Tarefa concluída' },
  tarefa_no_prazo:    { xp: 5,   attr: 'ordem', label: 'Entregue no prazo' },
  exercicio:          { xp: 12,  attr: 'corpo', label: 'Exercício concluído' },
  treino_completo:    { xp: 40,  attr: 'corpo', label: 'Treino do dia completo' },
  agua_meta:          { xp: 20,  attr: 'corpo', label: 'Meta de água batida' },
  refeicao:           { xp: 8,   attr: 'corpo', label: 'Refeição registrada' },
  insulina:           { xp: 5,   attr: 'corpo', label: 'Insulina registrada' },
  card_fluencia:      { xp: 2,   attr: 'mente', label: 'Card estudado' },
  fluencia_meta:      { xp: 25,  attr: 'mente', label: 'Meta de cards do dia' },
  diario:             { xp: 25,  attr: 'mente', label: 'Página escrita' },
  decisao:            { xp: 30,  attr: 'mente', label: 'Decisão registrada' },
  decisao_revisao:    { xp: 40,  attr: 'mente', label: 'Revisão preenchida' },
  captura_organizada: { xp: 5,   attr: 'ordem', label: 'Captura organizada' },
  casa_atividade:     { xp: 15,  attr: 'ordem', label: 'Atividade da casa' },
  ponto_objetivo:     { xp: 75,  attr: 'visao', label: 'Ponto conquistado' },
  objetivo:           { xp: 500, attr: 'visao', label: 'OBJETIVO CONCLUÍDO' }
};

/* ---------- Curva de nível ----------
   XP acumulado para chegar ao nível n = 100 · n^1.6.
   Os primeiros níveis vêm rápido (o retorno precisa chegar na primeira semana)
   e depois abrem, pra nível alto significar alguma coisa. */
var GAM_CURVA_BASE = 100;
var GAM_CURVA_EXP = 1.6;

function gamXpDoNivel(n){
  if(n <= 1) return 0;
  return Math.round(GAM_CURVA_BASE * Math.pow(n, GAM_CURVA_EXP));
}
function gamNivelPorXp(xp){
  var n = 1;
  while(gamXpDoNivel(n + 1) <= xp && n < 999) n++;
  return n;
}
// Quanto falta e quanto já andou dentro do nível atual — é o que a barra mostra.
function gamProgressoNivel(xp){
  var nivel = gamNivelPorXp(xp);
  var base = gamXpDoNivel(nivel);
  var proximo = gamXpDoNivel(nivel + 1);
  var faixa = Math.max(1, proximo - base);
  return {
    nivel: nivel,
    dentro: Math.max(0, xp - base),
    faixa: faixa,
    pct: Math.max(0, Math.min(100, ((xp - base) / faixa) * 100)),
    proximo: proximo
  };
}

/* ---------- Sequência (streak) ----------
   Um dia "conta" quando você fecha 80% da fila de hoje. O multiplicador incide
   sobre todo XP ganho — é ele que faz voltar amanhã. */
var GAM_STREAK_ESCADA = [
  { dias: 100, mult: 2.00 },
  { dias: 60,  mult: 1.75 },
  { dias: 30,  mult: 1.50 },
  { dias: 14,  mult: 1.35 },
  { dias: 7,   mult: 1.20 }
];
function gamMultiplicador(streak){
  for(var i = 0; i < GAM_STREAK_ESCADA.length; i++){
    if(streak >= GAM_STREAK_ESCADA[i].dias) return GAM_STREAK_ESCADA[i].mult;
  }
  return 1;
}

/* ---------- Conquistas ---------- */
var GAM_CONQUISTAS = [
  { id:'primeira_pagina', nome:'Primeira Página', desc:'Escreveu a primeira entrada no Diário',
    teste: function(p){ return (p.contadores.diario || 0) >= 1; } },
  { id:'centuriao', nome:'Centurião', desc:'100 tarefas concluídas',
    teste: function(p){ return (p.contadores.tarefas || 0) >= 100; } },
  { id:'maquina', nome:'Máquina', desc:'30 dias seguidos de sequência',
    teste: function(p){ return (p.streak.melhor || 0) >= 30; } },
  { id:'poliglota', nome:'Poliglota', desc:'1.000 cards de Fluência',
    teste: function(p){ return (p.contadores.cards || 0) >= 1000; } },
  { id:'arquiteto', nome:'Arquiteto', desc:'Primeiro objetivo em 100%',
    teste: function(p){ return (p.contadores.objetivos || 0) >= 1; } },
  { id:'ferro', nome:'Ferro', desc:'50 treinos completos',
    teste: function(p){ return (p.contadores.treinos || 0) >= 50; } },
  { id:'nivel10', nome:'Veterano', desc:'Nível 10 em qualquer atributo',
    teste: function(p){
      return Object.keys(p.xp).some(function(a){ return gamNivelPorXp(p.xp[a]) >= 10; });
    } }
];

/* ---------- Estado ---------- */
var gamProgresso = null;      // cache em memória do nó /Progresso
var gamSalvarTimer = null;

function gamEstadoVazio(){
  return {
    xp: { corpo: 0, mente: 0, ordem: 0, visao: 0 },
    streak: { atual: 0, melhor: 0, ultimoDia: '', escudos: 1, escudoMes: '' },
    contadores: { tarefas: 0, exercicios: 0, treinos: 0, cards: 0, diario: 0, decisoes: 0, objetivos: 0 },
    conquistas: {},
    eventos: {},       // ledger de idempotência
    historico: {},     // { 'YYYY-MM-DD': xp do dia }
    diasFechados: {},  // { 'YYYY-MM-DD': { humor, em } }
    avisos: {}         // notificações já disparadas, por dia — evita repetir
  };
}
// Normaliza o que vem do banco: um nó parcial (ou ausente) não pode quebrar nada.
function gamNormalizar(raw){
  var vazio = gamEstadoVazio();
  if(!raw || typeof raw !== 'object') return vazio;
  return {
    xp:           Object.assign(vazio.xp, raw.xp || {}),
    streak:       Object.assign(vazio.streak, raw.streak || {}),
    contadores:   Object.assign(vazio.contadores, raw.contadores || {}),
    conquistas:   raw.conquistas || {},
    eventos:      raw.eventos || {},
    historico:    raw.historico || {},
    diasFechados: raw.diasFechados || {},
    avisos:       raw.avisos || {}
  };
}

async function gamCarregar(){
  try{
    var raw = await dbGet(userPath('/Progresso'));
    gamProgresso = gamNormalizar(raw);
  }catch(e){
    console.error('Falha ao carregar o progresso:', e);
    gamProgresso = gamEstadoVazio();
  }
  gamAvaliarStreak();
  return gamProgresso;
}

// Grava com atraso: concluir 5 itens seguidos vira uma escrita só, não cinco.
function gamAgendarSalvar(){
  clearTimeout(gamSalvarTimer);
  gamSalvarTimer = setTimeout(function(){
    if(!gamProgresso) return;
    dbPatchSilent(userPath('/Progresso'), gamProgresso)
      .catch(function(err){ console.error('Falha ao salvar o progresso:', err); });
  }, 900);
}

function gamXpTotal(){
  if(!gamProgresso) return 0;
  var x = gamProgresso.xp;
  return (x.corpo || 0) + (x.mente || 0) + (x.ordem || 0) + (x.visao || 0);
}

/* ---------- Concessão de XP ----------
   `chave` torna o evento idempotente: sem ela, desmarcar e remarcar uma tarefa
   daria XP de novo toda vez. Com ela, o mesmo evento só paga uma vez. */
async function grantXp(tipo, opts){
  opts = opts || {};
  var ev = GAM_EVENTOS[tipo];
  if(!ev) { console.warn('Evento de XP desconhecido:', tipo); return null; }
  if(!gamProgresso) await gamCarregar();

  var chave = opts.chave || null;
  if(chave){
    if(gamProgresso.eventos[chave]) return null; // já pago
    gamProgresso.eventos[chave] = 1;
  }

  var mult = gamMultiplicador(gamProgresso.streak.atual || 0);
  var ganho = Math.round(ev.xp * mult);
  var nivelAntes = gamNivelPorXp(gamProgresso.xp[ev.attr] || 0);

  gamProgresso.xp[ev.attr] = (gamProgresso.xp[ev.attr] || 0) + ganho;

  var hoje = todayStr();
  gamProgresso.historico[hoje] = (gamProgresso.historico[hoje] || 0) + ganho;

  if(opts.contador){
    gamProgresso.contadores[opts.contador] = (gamProgresso.contadores[opts.contador] || 0) + 1;
  }

  var nivelDepois = gamNivelPorXp(gamProgresso.xp[ev.attr]);
  var subiu = nivelDepois > nivelAntes;

  gamAgendarSalvar();
  gamAnimarGanho(ganho, ev, mult, opts.origem);
  if(subiu) gamAnimarLevelUp(ev.attr, nivelDepois);
  gamVerificarConquistas();
  gamRenderHud();

  return { ganho: ganho, atributo: ev.attr, subiuNivel: subiu, nivel: nivelDepois };
}

/* ---------- Sequência ---------- */
function gamDiasEntre(a, b){
  if(!a || !b) return 999;
  var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}
// Roda no boot: decide se a sequência continua, gasta um escudo ou zera.
function gamAvaliarStreak(){
  if(!gamProgresso) return;
  var s = gamProgresso.streak;
  var hoje = todayStr();
  if(!s.ultimoDia) return;
  var gap = gamDiasEntre(s.ultimoDia, hoje);
  if(gap <= 1) return;              // ontem ou hoje: sequência intacta
  if(gap === 2 && (s.escudos || 0) > 0){
    // Um dia perdido: gasta o escudo em vez de zerar 40 dias por uma gripe.
    s.escudos = (s.escudos || 0) - 1;
    s.ultimoDia = hoje;
    gamAgendarSalvar();
    return;
  }
  s.atual = 0;
  gamAgendarSalvar();
}
// Chamada quando a fila de hoje passa de 80% concluída.
function gamFecharDia(){
  if(!gamProgresso) return false;
  var s = gamProgresso.streak;
  var hoje = todayStr();
  if(s.ultimoDia === hoje) return false;    // já contou hoje
  var gap = gamDiasEntre(s.ultimoDia, hoje);
  s.atual = (gap === 1 || gap === 2) ? (s.atual || 0) + 1 : 1;
  s.ultimoDia = hoje;
  s.melhor = Math.max(s.melhor || 0, s.atual);
  // Recompõe um escudo por mês.
  var mes = hoje.slice(0, 7);
  if(s.escudoMes !== mes){ s.escudoMes = mes; s.escudos = Math.min(1, (s.escudos || 0) + 1); }
  gamAgendarSalvar();
  gamRenderHud();
  return true;
}

/* ---------- Conquistas ---------- */
function gamVerificarConquistas(){
  if(!gamProgresso) return;
  GAM_CONQUISTAS.forEach(function(c){
    if(gamProgresso.conquistas[c.id]) return;
    var ok = false;
    try{ ok = c.teste(gamProgresso); }catch(e){ ok = false; }
    if(ok){
      gamProgresso.conquistas[c.id] = todayStr();
      gamAgendarSalvar();
      gamRenderTrofeus();
      if(typeof showAppMessage === 'function'){
        showAppMessage('🏆 Conquista desbloqueada: ' + c.nome, 'success');
      }
    }
  });
}

/* ---------- Missões do dia ----------
   Geradas dos dados reais: se hoje não é dia de treino no cronograma, não
   aparece missão de treino. Missão genérica é ruído. */
async function gamMissoesDoDia(){
  var missoes = [];
  var hoje = todayStr();
  var dow = new Date().getDay();
  try{
    var res = await Promise.all([
      dbGet(userPath('/Tasks')),
      dbGet(userPath('/AcademiaDias')),
      dbGet(userPath('/AcademiaMetas')),
      dbGet(userPath('/AcademiaConsumo/' + hoje)),
      dbGet(userPath('/DiarioEntradas'))
    ]);
    var tasks = res[0] || {}, dias = res[1] || {}, metas = res[2] || {},
        consumo = res[3] || {}, diario = res[4] || {};

    var doHoje = Object.values(tasks).filter(function(t){ return t.date === hoje; });
    if(doHoje.length){
      var feitas = doHoje.filter(function(t){ return t.done; }).length;
      missoes.push({ id:'fila', texto:'Zerar a fila de hoje', xp:50,
                     feito: feitas >= doHoje.length, progresso: feitas + '/' + doHoje.length });
    }

    var dia = dias[dow];
    if(dia && dia.ativo){
      var ex = Object.values(dia.exercicios || {});
      var ok = ex.filter(function(e){ return e.doneDates && e.doneDates[hoje]; }).length;
      missoes.push({ id:'treino', texto:'Completar o treino de hoje', xp:40,
                     feito: ex.length > 0 && ok >= ex.length, progresso: ok + '/' + ex.length });
    }

    var metaAgua = Number(metas.aguaMl) || 0;
    if(metaAgua > 0){
      var atual = Number(consumo.aguaMl) || 0;
      missoes.push({ id:'agua', texto:'Bater os ' + metaAgua + ' ml de água', xp:20,
                     feito: atual >= metaAgua, progresso: atual + '/' + metaAgua + ' ml' });
    }

    var escreveuHoje = Object.values(diario).some(function(e){
      return (e.createdAt || '').slice(0,10) === hoje;
    });
    missoes.push({ id:'diario', texto:'Escrever no Diário', xp:25, feito: escreveuHoje, progresso: escreveuHoje ? '1/1' : '0/1' });
  }catch(e){
    console.error('Falha ao montar as missões do dia:', e);
  }
  return missoes.slice(0, 4);
}

/* ---------- Animações ---------- */
function gamAnimarGanho(ganho, ev, mult, origem){
  var host = document.getElementById('gamXpPops');
  if(!host) return;
  var el = document.createElement('div');
  el.className = 'gam-xp-pop';
  el.innerHTML = '+' + ganho + ' XP' +
    '<span class="gam-xp-pop-attr">' + GAM_ATRIBUTOS[ev.attr].glifo + ' ' + GAM_ATRIBUTOS[ev.attr].nome + '</span>' +
    (mult > 1 ? '<span class="gam-xp-pop-mult">×' + mult.toFixed(2) + '</span>' : '');
  host.appendChild(el);
  setTimeout(function(){ el.remove(); }, 1400);
}

function gamAnimarLevelUp(attr, nivel){
  var host = document.getElementById('gamLevelUp');
  if(!host) return;
  var a = GAM_ATRIBUTOS[attr];
  host.innerHTML =
    '<div class="gam-levelup-card" style="--attr-cor:' + a.cor + ';">' +
      '<p class="gam-levelup-kicker">// nível alcançado</p>' +
      '<p class="gam-levelup-glifo">' + a.glifo + '</p>' +
      '<h2 class="gam-levelup-nome">' + a.nome + '</h2>' +
      '<p class="gam-levelup-nivel">NÍVEL ' + nivel + '</p>' +
    '</div>';
  host.classList.add('active');
  setTimeout(function(){ host.classList.remove('active'); host.innerHTML = ''; }, 2600);
}

/* ---------- HUD ---------- */
function gamRenderHud(){
  if(!gamProgresso) return;
  var hud = document.getElementById('gamHud');
  if(!hud) return;

  var total = gamXpTotal();
  var p = gamProgressoNivel(total);
  var s = gamProgresso.streak;
  var mult = gamMultiplicador(s.atual || 0);
  var hojeXp = gamProgresso.historico[todayStr()] || 0;

  var elNivel = document.getElementById('gamNivel');
  var elXpTexto = document.getElementById('gamXpTexto');
  var elBarra = document.getElementById('gamXpBarra');
  var elStreak = document.getElementById('gamStreak');
  var elHojeXp = document.getElementById('gamHojeXp');

  if(elNivel) elNivel.textContent = p.nivel;
  if(elXpTexto) elXpTexto.textContent = p.dentro.toLocaleString('pt-BR') + ' / ' + p.faixa.toLocaleString('pt-BR') + ' XP';
  if(elBarra) elBarra.style.width = p.pct.toFixed(1) + '%';
  if(elHojeXp) elHojeXp.textContent = '+' + hojeXp + ' hoje';
  if(elStreak){
    var txt = (s.atual || 0) + (s.atual === 1 ? ' dia' : ' dias');
    if(mult > 1) txt += ' · ×' + mult.toFixed(2);
    elStreak.textContent = txt;
    elStreak.parentElement.classList.toggle('gam-streak-ativa', (s.atual || 0) > 0);
  }

  var grid = document.getElementById('gamAtributos');
  if(grid){
    grid.innerHTML = Object.keys(GAM_ATRIBUTOS).map(function(k){
      var a = GAM_ATRIBUTOS[k];
      var xp = gamProgresso.xp[k] || 0;
      var pr = gamProgressoNivel(xp);
      return '' +
        '<div class="gam-attr gam-attr-' + k + '" title="' + a.fontes + '">' +
          '<div class="gam-attr-top">' +
            '<span class="gam-attr-glifo">' + a.glifo + '</span>' +
            '<span class="gam-attr-nome">' + a.nome + '</span>' +
            '<span class="gam-attr-nivel">NV ' + pr.nivel + '</span>' +
          '</div>' +
          '<div class="gam-attr-barra"><i style="width:' + pr.pct.toFixed(1) + '%"></i></div>' +
        '</div>';
    }).join('');
  }
}

/* ---------- Painel de missões ---------- */
async function gamRenderMissoes(){
  var el = document.getElementById('gamMissoesList');
  if(!el) return;
  var missoes = await gamMissoesDoDia();
  if(!missoes.length){
    el.innerHTML = '<p class="empty-state">Sem missões hoje — configure Tarefas, Academia ou Água pra elas aparecerem.</p>';
    return;
  }
  el.innerHTML = missoes.map(function(m){
    return '' +
      '<div class="gam-missao' + (m.feito ? ' feita' : '') + '">' +
        '<span class="gam-missao-check">' + (m.feito ? '✓' : '') + '</span>' +
        '<span class="gam-missao-texto">' + escapeHtml(m.texto) + '</span>' +
        '<span class="gam-missao-prog">' + escapeHtml(m.progresso) + '</span>' +
        '<span class="tag gam-missao-xp">+' + m.xp + ' XP</span>' +
      '</div>';
  }).join('');
}

/* ---------- Salão de troféus ----------
   As conquistas ainda bloqueadas aparecem apagadas, com a condição visível: o
   que dá vontade de continuar é saber o que falta, não descobrir depois. */
function gamRenderTrofeus(){
  var grid = document.getElementById('trofeusGrid');
  if(!grid) return;
  var conquistadas = (gamProgresso && gamProgresso.conquistas) || {};
  var ganhas = 0;

  grid.innerHTML = GAM_CONQUISTAS.map(function(c){
    var em = conquistadas[c.id];
    if(em) ganhas++;
    return '' +
      '<div class="trofeu' + (em ? ' ganho' : '') + '">' +
        '<span class="trofeu-icone">' + (em ? '🏆' : '🔒') + '</span>' +
        '<span class="trofeu-nome">' + escapeHtml(c.nome) + '</span>' +
        '<span class="trofeu-desc">' + escapeHtml(c.desc) + '</span>' +
        (em ? '<span class="trofeu-data">' + escapeHtml(fmtShortDate(em)) + '</span>' : '') +
      '</div>';
  }).join('');

  var contador = document.getElementById('trofeusCount');
  if(contador) contador.textContent = ganhas + ' / ' + GAM_CONQUISTAS.length;
}

/* ============================================================================
   FECHAMENTO DO DIA
   O dia nunca terminava: o que ficou por fazer não era revisto, e a sequência
   avançava em silêncio. Este ritual de 30 segundos mostra o que foi feito, o
   que rola pra amanhã, e captura uma linha sobre o dia direto no Diário.
   ============================================================================ */
var fechHumor = '🙂';

function fechDiaJaFechado(){
  return !!(gamProgresso && gamProgresso.diasFechados && gamProgresso.diasFechados[todayStr()]);
}

async function abrirFechamento(){
  var modal = document.getElementById('fechamentoModal');
  if(!modal) return;
  if(!gamProgresso) await gamCarregar();

  var hoje = todayStr();
  // `activities` é montado por renderHojeQueue e reflete a fila real de hoje.
  var fila = (typeof activities !== 'undefined' && Array.isArray(activities)) ? activities : [];
  var feitas = fila.filter(function(a){ return a.done; });
  var pendentes = fila.filter(function(a){ return !a.done && !a.skipped; });
  var xpHoje = (gamProgresso.historico && gamProgresso.historico[hoje]) || 0;

  var titulo = document.getElementById('fechTitulo');
  if(titulo){
    titulo.textContent = feitas.length && !pendentes.length ? 'Dia zerado.'
      : feitas.length ? 'Como foi hoje?'
      : 'Dia difícil?';
  }

  var resumo = document.getElementById('fechResumo');
  if(resumo){
    var pct = fila.length ? Math.round((feitas.length / fila.length) * 100) : 0;
    resumo.innerHTML =
      '<div class="fech-stat"><b>' + feitas.length + '/' + fila.length + '</b><span>concluídas</span></div>' +
      '<div class="fech-stat"><b>' + pct + '%</b><span>do dia</span></div>' +
      '<div class="fech-stat"><b class="fech-xp">+' + xpHoje + '</b><span>XP hoje</span></div>' +
      '<div class="fech-stat"><b>' + ((gamProgresso.streak && gamProgresso.streak.atual) || 0) + '</b><span>dias seguidos</span></div>';
  }

  var listaHtml = function(itens, vazio){
    if(!itens.length) return '<p class="empty-state">' + vazio + '</p>';
    return itens.map(function(a){
      return '<div class="fech-item">' + escapeHtml(a.name) +
             (a.atraso ? '<span class="tag flow-atraso">' + a.atraso + 'd</span>' : '') + '</div>';
    }).join('');
  };
  var elFeitas = document.getElementById('fechFeitas');
  var elPend = document.getElementById('fechPendentes');
  if(elFeitas) elFeitas.innerHTML = listaHtml(feitas, 'Nada concluído hoje.');
  if(elPend) elPend.innerHTML = listaHtml(pendentes, 'Nada pendente — dia limpo.');

  var texto = document.getElementById('fechTexto');
  if(texto) texto.value = '';
  fechHumor = '🙂';
  document.querySelectorAll('#fechMoodRow .mood-chip').forEach(function(c){
    c.classList.toggle('active', c.getAttribute('data-mood') === fechHumor);
  });

  modal.classList.add('active');
}

async function confirmarFechamento(){
  var hoje = todayStr();
  var texto = document.getElementById('fechTexto');
  var conteudo = texto ? texto.value.trim() : '';

  // A linha sobre o dia vira uma entrada de Diário de verdade — não um campo
  // solto. Assim ela conta para os objetivos e para o atributo Mente.
  if(conteudo){
    var id = newId();
    await dbPut(userPath('/DiarioEntradas/' + id), {
      mood: fechHumor, text: conteudo, createdAt: new Date().toISOString()
    });
    await grantXp('diario', { chave: 'diario_' + id, contador: 'diario' });
  }

  if(!gamProgresso) await gamCarregar();
  if(!gamProgresso.diasFechados) gamProgresso.diasFechados = {};
  gamProgresso.diasFechados[hoje] = { humor: fechHumor, em: new Date().toISOString() };
  gamFecharDia();          // conta o dia na sequência
  gamAgendarSalvar();

  document.getElementById('fechamentoModal').classList.remove('active');
  showAppMessage('Dia fechado. Até amanhã.', 'success');
  if(typeof renderDiario === 'function') await renderDiario();
  gamRenderHud();

  // A IA organiza as capturas do dia aqui, no fechamento — não por um botão que
  // você precisa lembrar de clicar. O resultado espera na aba Revisão, para
  // você aprovar amanhã. Sem a Cloud Function publicada, isso simplesmente não
  // acontece e o fechamento segue normal.
  organizarCapturasNoFechamento();
}

async function organizarCapturasNoFechamento(){
  var btn = document.getElementById('runAiOrganizeBtn');
  if(!btn || btn.style.display === 'none') return;   // nada pendente para organizar
  if(typeof IA_PROXY_URL === 'undefined' || !IA_PROXY_URL) return;
  try{
    var inbox = await dbGet(userPath('/Inbox')) || {};
    var pendentes = Object.values(inbox).filter(function(i){
      return i.status !== 'processed' && i.status !== 'awaiting_review';
    });
    if(!pendentes.length) return;
    showAppMessage('Organizando ' + pendentes.length + ' captura(s) — o resultado espera em Revisão.', 'info');
    btn.click();
  }catch(err){
    console.warn('Falha ao organizar capturas no fechamento:', err);
  }
}

/* Ponto de entrada chamado pelo boot do app. */
async function gamInit(){
  await gamCarregar();
  gamRenderHud();
  gamRenderTrofeus();
  await gamRenderMissoes();
}
