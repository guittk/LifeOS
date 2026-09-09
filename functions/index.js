/* =============================================================================
   PROXY DE IA — Cloud Function (Claude / Anthropic)

   Problema que isto resolve: antes o app lia a chave da IA de /openAiKey no
   Firebase e chamava a API direto do navegador. Qualquer pessoa logada abria o
   DevTools, copiava a chave e usava a cota.

   Aqui a chave fica no servidor, como secret. O cliente manda o idToken do
   Firebase; a função valida, chama o Claude e devolve só o texto da resposta.

   Modelo: Claude Sonnet 5 com esforço alto.

   ---------------------------------------------------------------------------
   COMO PUBLICAR (precisa ser você — envolve a sua conta e o plano de billing):

     cd functions
     npm install
     firebase functions:secrets:set ANTHROPIC_API_KEY   # cola a chave aqui
     firebase deploy --only functions

   Depois de publicar:
     1. copie a URL que o deploy imprime;
     2. cole em IA_PROXY_URL no js/app.js;
     3. apague o nó /openAiKey do Realtime Database;
     4. revogue a chave antiga da OpenAI — ela já circulou por navegadores.

   Cloud Functions exige o plano Blaze (pago por uso).
   ---------------------------------------------------------------------------
   ============================================================================= */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();

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
  { secrets: [ANTHROPIC_API_KEY], region: 'southamerica-east1', maxInstances: 5, timeoutSeconds: 120 },
  async (req, res) => {
    aplicarCors(req, res);
    if(req.method === 'OPTIONS'){ res.status(204).send(''); return; }
    if(req.method !== 'POST'){ res.status(405).json({ error: 'Use POST.' }); return; }

    // 1) Autenticação: sem idToken válido do Firebase, não passa.
    const header = req.get('authorization') || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if(!idToken){ res.status(401).json({ error: 'Faltou o token de autenticação.' }); return; }

    let uid;
    try{
      const decoded = await admin.auth().verifyIdToken(idToken);
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
