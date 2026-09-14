/* =============================================================================
   PROXY DE IA — Cloud Function (Claude / Anthropic)

   Problema que isto resolve: antes o app lia a chave da IA de /openAiKey no
   Firebase e chamava a API direto do navegador. Qualquer pessoa logada abria o
   DevTools, copiava a chave e usava a cota.

   Aqui a chave fica no servidor, como secret. O cliente manda o idToken do
   Firebase; a função valida, chama o Claude e devolve só o texto da resposta.

   Modelo: Claude Sonnet 5 com esforço alto.

   ---------------------------------------------------------------------------
   PUBLICADA em 14/09/2026 — secret ANTHROPIC_API_KEY setado, função no ar em
   basehub-135f5, URL já em IA_PROXY_URL (js/app.js). Precisa validar o
   idToken contra o anki-71f4f (getAnkiApp() abaixo), não contra o Admin SDK
   padrão — sem isso toda chamada seria recusada por token de projeto errado.

   Pra publicar de novo depois de mexer no código:
     cd functions && firebase deploy --only functions:iaProxy --project basehub-135f5

   Ainda pendente, sem urgência: apagar o nó /openAiKey do Realtime Database
   e revogar a chave antiga da OpenAI (já circulou por navegadores antes
   desta function existir).
   ---------------------------------------------------------------------------
   ============================================================================= */

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();

/* Projeto cruzado: os dados de verdade (usuários, Despertadores, tokens de
   notificação) vivem no projeto anki-71f4f, não neste projeto (basehub-135f5,
   onde o Blaze já está ativo e onde as functions rodam). Por isso qualquer
   função que precise validar login ou ler/escrever dados do app usa este app
   secundário do Admin SDK, autenticado com uma conta de serviço DO anki-71f4f
   — só assim ela enxerga aquele projeto (o Admin SDK padrão só enxerga o
   projeto onde a function está publicada).

   Secret ANKI_SERVICE_ACCOUNT já setado (14/09/2026), com a conta de serviço
   gerada em console.firebase.google.com/project/anki-71f4f/settings/serviceaccounts/adminsdk.
   Se precisar trocar a chave: firebase functions:secrets:set ANKI_SERVICE_ACCOUNT --project basehub-135f5 */
const ANKI_SERVICE_ACCOUNT = defineSecret('ANKI_SERVICE_ACCOUNT');
const ANKI_DATABASE_URL = 'https://anki-71f4f-default-rtdb.firebaseio.com';

let ankiApp = null;
function getAnkiApp(){
  if(ankiApp) return ankiApp;
  const cred = JSON.parse(ANKI_SERVICE_ACCOUNT.value());
  ankiApp = admin.initializeApp(
    { credential: admin.credential.cert(cred), databaseURL: ANKI_DATABASE_URL },
    'anki'
  );
  return ankiApp;
}

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Só estes domínios podem chamar a função: os dois do Firebase Hosting e as
// portas de desenvolvimento local (4173 = servidor estático, 5000 = emulador).
const ORIGENS_PERMITIDAS = [
  'https://thurgh-lifeos.web.app',
  'https://thurgh-lifeos.firebaseapp.com',
  'http://localhost:4173',
  'http://localhost:5000'
];

// Modelo, esforço e teto de tokens ficam no servidor: o cliente não escolhe,
// então não dá pra pedir um modelo caro ou esforço máximo por conta própria.
const MODELO = 'claude-sonnet-5';
const ESFORCO = 'high';
const MAX_TOKENS = 16000;

function aplicarCors(req, res){
  const origem = req.get('origin');
  if(ORIGENS_PERMITIDAS.includes(origem)){
    res.set('Access-Control-Allow-Origin', origem);
  }
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
}

exports.iaProxy = onRequest(
  { secrets: [ANTHROPIC_API_KEY, ANKI_SERVICE_ACCOUNT], region: 'southamerica-east1', maxInstances: 5, timeoutSeconds: 120 },
  async (req, res) => {
    aplicarCors(req, res);
    if(req.method === 'OPTIONS'){ res.status(204).send(''); return; }
    if(req.method !== 'POST'){ res.status(405).json({ error: 'Use POST.' }); return; }

    // 1) Autenticação: sem idToken válido do Firebase, não passa. O token é
    //    emitido pelo anki-71f4f (onde vive a Auth de verdade, não o projeto
    //    onde esta função roda) — por isso valida no app secundário, não no
    //    app padrão do Admin SDK. Ver getAnkiApp() no topo do arquivo.
    const header = req.get('authorization') || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if(!idToken){ res.status(401).json({ error: 'Faltou o token de autenticação.' }); return; }

    let uid;
    try{
      const decoded = await getAnkiApp().auth().verifyIdToken(idToken);
      uid = decoded.uid;
    }catch(err){
      res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
      return;
    }

    // 2) Validação da entrada. O Claude separa system de messages: as instruções
    //    vão no campo `system`, e `messages` só aceita user/assistant.
    const system = typeof req.body?.system === 'string' ? req.body.system : '';
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
    if(!system && !prompt){
      res.status(400).json({ error: 'Envie "system" e/ou "prompt".' });
      return;
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    try{
      const resposta = await client.messages.create({
        model: MODELO,
        max_tokens: MAX_TOKENS,
        // Sonnet 5 usa thinking adaptativo; temperature/top_p/top_k foram
        // removidos deste modelo e retornam 400 se enviados.
        thinking: { type: 'adaptive' },
        output_config: { effort: ESFORCO },
        system: system || undefined,
        messages: [{ role: 'user', content: prompt || 'Prossiga conforme as instruções.' }]
      });

      // Uma recusa por política volta com HTTP 200 — precisa ser checada antes
      // de ler o conteúdo, senão vira "resposta vazia" silenciosa.
      if(resposta.stop_reason === 'refusal'){
        console.warn('Recusa para o uid ' + uid + ':', resposta.stop_details);
        res.status(422).json({ error: 'A IA recusou esta solicitação.' });
        return;
      }

      // content é uma união: blocos de thinking vêm junto com os de texto.
      const texto = resposta.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')
        .trim();

      if(!texto){
        res.status(502).json({ error: 'A IA respondeu vazio. Tente de novo.' });
        return;
      }

      res.status(200).json({
        text: texto,
        stop_reason: resposta.stop_reason,
        usage: resposta.usage
      });

    }catch(err){
      // Classes tipadas, da mais específica pra mais genérica.
      if(err instanceof Anthropic.AuthenticationError){
        console.error('Chave da Anthropic inválida:', err.message);
        res.status(500).json({ error: 'A IA está mal configurada no servidor.' });
      }else if(err instanceof Anthropic.RateLimitError){
        res.status(429).json({ error: 'Muitas chamadas seguidas. Espere um pouco e tente de novo.' });
      }else if(err instanceof Anthropic.BadRequestError){
        console.error('Requisição inválida para a Anthropic:', err.message);
        res.status(400).json({ error: 'A solicitação à IA era inválida.' });
      }else if(err instanceof Anthropic.APIError){
        console.error('Erro da API Anthropic (' + err.status + ') para o uid ' + uid + ':', err.message);
        res.status(502).json({ error: 'A IA não respondeu. Tente de novo em instantes.' });
      }else{
        console.error('Falha inesperada ao chamar a Anthropic:', err);
        res.status(502).json({ error: 'A IA não respondeu. Tente de novo em instantes.' });
      }
    }
  }
);

/* =============================================================================
   DESPERTADORES — Cloud Function agendada (roda a cada minuto)

   Problema que isto resolve: o app só conseguia tocar o alarme com a aba
   aberta. Esta função dispara notificações push (Firebase Cloud Messaging)
   que chegam mesmo com o app fechado ou o celular bloqueado.

   Usa o mesmo app secundário getAnkiApp() definido no topo do arquivo — ver
   o comentário lá pra explicação do projeto cruzado.
   ============================================================================= */

// A função roda em UTC por padrão — os horários configurados pelo usuário são
// em horário de Brasília, então a hora "agora" precisa ser recalculada nesse
// fuso (Intl já cuida do horário de verão, se algum dia voltar a existir).
function agoraEmSaoPaulo(){
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', hour12: false,
    hour: '2-digit', minute: '2-digit', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const partes = {};
  fmt.formatToParts(new Date()).forEach(p => { if(p.type !== 'literal') partes[p.type] = p.value; });
  const DIAS = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return {
    hhmm: partes.hour + ':' + partes.minute,
    diaSemana: DIAS[partes.weekday],
    dataStr: partes.year + '-' + partes.month + '-' + partes.day
  };
}

async function dispararParaUsuario(db, messaging, uid, despertador, dataStr){
  // Marca como disparado ANTES de mandar — evita reenviar se o push falhar
  // no meio (melhor perder um push do que mandar em duplicidade).
  await db.ref('/users/' + uid + '/Despertadores/' + despertador.id + '/ultimoDisparo').set(dataStr);

  const tokensSnap = await db.ref('/users/' + uid + '/FcmTokens').once('value');
  const tokens = Object.keys(tokensSnap.val() || {});
  if(!tokens.length) return;

  // Lembrete é a mesma coleção, com tipo diferente: notificação só de aviso,
  // sem o som/checklist do despertador (ver dispararLembrete em js/app.js e
  // o notificationclick em sw.js, que decide pra onde o toque leva).
  const ehLembrete = despertador.tipo === 'lembrete';

  // Só "data": deixa o service worker decidir como mostrar (evita a exibição
  // automática do navegador, que não dá pra tratar o clique do jeito que
  // a gente quer — abrir direto na tela Acordar, só quando for despertador).
  const resp = await messaging.sendEachForMulticast({
    tokens,
    data: {
      tipo: ehLembrete ? 'lembrete' : 'despertador',
      despertadorId: despertador.id,
      titulo: ehLembrete ? 'Life OS' : 'Hora de acordar! ⏰',
      corpo: ehLembrete ? 'Hora de dar uma olhada na plataforma.' : 'Toque para abrir a checklist do Life OS.'
    }
  });
  const mortos = [];
  resp.responses.forEach((r, i) => {
    const codigo = r.error && r.error.code;
    if(!r.success && (codigo === 'messaging/registration-token-not-registered' || codigo === 'messaging/invalid-registration-token')){
      mortos.push(db.ref('/users/' + uid + '/FcmTokens/' + tokens[i]).remove());
    }
  });
  await Promise.allSettled(mortos);
}

exports.checarDespertadores = onSchedule(
  { schedule: 'every 1 minutes', secrets: [ANKI_SERVICE_ACCOUNT], region: 'southamerica-east1', timeoutSeconds: 60 },
  async () => {
    const app = getAnkiApp();
    const db = app.database();
    const messaging = app.messaging();
    const { hhmm, diaSemana, dataStr } = agoraEmSaoPaulo();

    const usersSnap = await db.ref('/users').once('value');
    const users = usersSnap.val() || {};

    const disparos = [];
    for(const [uid, dadosUser] of Object.entries(users)){
      const despertadores = (dadosUser && dadosUser.Despertadores) || {};
      for(const d of Object.values(despertadores)){
        if(d.ativo === false || d.hora !== hhmm) continue;
        if(d.dias && d.dias.length && !d.dias.includes(diaSemana)) continue;
        if(d.ultimoDisparo === dataStr) continue; // já tocou hoje
        disparos.push(dispararParaUsuario(db, messaging, uid, d, dataStr).catch(err =>
          console.error('Falha ao disparar despertador ' + d.id + ' do uid ' + uid + ':', err)
        ));
      }
    }
    await Promise.allSettled(disparos);
  }
);
