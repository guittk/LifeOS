# Life OS

App do casal (Guilherme e Júlia) pra organizar tarefas, agenda, rotina, hábitos,
diário, plano alimentar, academia, finanças, vision board etc., em português.
**Não é um SaaS** — uso pessoal dos dois, sem multi-tenant real. Front-end puro
(HTML/CSS/JS vanilla, sem build system, sem framework, sem npm). Abra
`index.html` direto no navegador pra rodar, ou publique com `firebase deploy`.

## Estrutura

```
index.html          Markup: tela de login + shell do app (sidebar + uma <section class="view"> por página)
css/style.css        Todo o CSS, em blocos comentados por área
js/app.js            Toda a lógica JS, em blocos comentados por área (sem módulos — escopo global, ordem de carregamento importa)
sw.js                Service worker: cache do shell (network-first) + push de despertadores/lembretes (Firebase Messaging)
functions/index.js   Cloud Functions: proxy de IA (iaProxy) + push agendado (checarDespertadores)
database.rules.json  Regras do Realtime Database — sempre deploy com --project anki-71f4f (ver seção Backend)
```

Não há bundler/transpiler. Editar os arquivos já edita o app — só dar refresh no navegador.

**Achar o código de uma feature**: cada bloco de `js/app.js` e `css/style.css` começa
com um comentário `/* ---------- Nome ---------- */`. Faça Grep pelo nome da feature
(ou pelo `data-view` da tela, que costuma bater com o nome do bloco) em vez de
navegar por número de linha — os arquivos crescem e números de linha ficam
errados rápido. Ex: procurando a Timeline? `grep -n "Timeline de Objetivos" js/app.js`.

## Backend

Sem servidor próprio pra dados/auth. O app fala direto com APIs externas:

- **Firebase Realtime Database** (REST, via `dbGet`/`dbPut`/`dbPatch`/`dbDelete` em `js/app.js`) — todos os dados do usuário.
- **Firebase Identity Toolkit** (REST) — login/cadastro/senha. Login restrito por whitelist (`AUTH_EMAILS_PERMITIDOS` no cliente + `auth.token.email` nas Database Rules) — só guittk@hotmail.com e julialealdecamargo@hotmail.com.
- **Firebase Cloud Messaging** — push dos despertadores/lembretes, mesmo com o app fechado/celular bloqueado (ver `sw.js` e `checarDespertadores` abaixo).
- **Claude (Anthropic)** via Cloud Function própria (`iaProxy`) — a chave nunca chega ao navegador.

⚠️ Pendência de segurança real, ainda em aberto: a chave `/openAiKey` que existia no Realtime Database (sobra de antes da `iaProxy`) circulou pelo navegador de qualquer pessoa logada antes de o node ser apagado (14/09/2026). O node já foi removido do banco, mas **a chave em si ainda não foi revogada em platform.openai.com** — isso só o dono da conta OpenAI pode fazer.

### ⚠️ Dois projetos Firebase diferentes — a armadilha mais recorrente deste repo

- **Dados reais** (Realtime Database + Identity Toolkit/Auth): projeto **`anki-71f4f`** (nome de exibição "LifeOS" — o app registrado lá dentro se chama "Anki", sobra de uso anterior do projeto). `FIREBASE_DB_URL`/`FIREBASE_API_KEY` em `js/app.js` apontam pra cá.
- **Hosting** (`thurgh-lifeos.web.app`) e **Cloud Functions**: projeto **`basehub-135f5`** (nome de exibição "Hube") — alias `default` no `.firebaserc`. É onde o Blaze está ativo; `anki-71f4f` não tem Cloud Functions habilitado.

Na prática:
- `firebase deploy --only hosting` — sem `--project`, já vai pro lugar certo (`basehub-135f5`).
- `firebase deploy --only database` — **precisa de `--project anki-71f4f`** (ou `--project dados`, alias já configurado), senão deploya regra em projeto que ninguém usa e não protege nada.
- Uma Cloud Function nova roda em `basehub-135f5`, mas se precisar ler/escrever dados reais ou mandar push, usa o app secundário do Admin SDK (`getAnkiApp()` em `functions/index.js`), autenticado com uma conta de serviço gerada EM `anki-71f4f` (secret `ANKI_SERVICE_ACCOUNT`) — só assim ela enxerga aquele projeto. Ver `checarDespertadores` e `iaProxy` em `functions/index.js` pros dois exemplos já funcionando.

## Convenções do código

- Português em tudo: nomes de variável/função, comentários, strings de UI.
- Comentários explicam o *porquê*, não o *o quê* — o código já diz o que faz.
- Padrão recorrente de CRUD simples (despertadores, categorias, grupos, etc.): estado em memória (`let algo = {}`) + `criarX`/`atualizarX`/`excluirX` que já escrevem no Firebase + `renderXConfig()` que redesenha a lista e liga os listeners a cada render.
- "Seed on first load": features que migraram de dado hardcoded (Finanças, Timeline, checklist de Acordar) semeiam um valor padrão só quando a coleção nunca existiu (`dbGet` retorna `null`) — não repetir isso se a coleção já existe mas está vazia.
- `Salvar`/`Cancelar` com indicador de status: padrão usado em Rotina, Academia, Plano Alimentar, Finanças — edita em memória, só grava quando confirma.
- Telas "em breve" (Supermercado, Cálculos, Empreendedorismo, Ápice): já têm nav-item, view e `VIEW_RENDERERS` vazio — é só preencher `renderX()` quando a feature for construída de verdade.

## Views (`index.html`, `id="view-*"`)

`hoje`, `storage` (Notas), `tarefas`, `monday` (Planejamento), `agenda`, `rotina`,
`casa`, `financas`, `decisoes`, `busca` (Perguntar ao LifeOS), `fluencia`, `academia`,
`diario`, `planoalimentar`, `objetivos`, `timelineobjetivos`, `visionboard`,
`bateria`, `acordar` (sem entrada na sidebar — só abre quando um despertador toca),
`supermercado`, `calculos`, `empreendedorismo`, `apice` (essas 4 últimas: em breve),
`config`.

O `data-view` na sidebar é o mesmo sufixo do id da `<section>` e, em geral, do nome
do bloco correspondente em `app.js`/`style.css`.

## Quadro compartilhado (casal)

Guilherme é dono do Quadro (`/boards/{uid-do-guilherme}`); Júlia é membro com todas
as permissões (`BOARD_VIEW_OPTIONS`). Quando ela loga sem preferência de Quadro
salva neste aparelho, o app abre direto no Quadro dele (não no dela, vazio) — ver
`initBoards()`. `config` e `busca` ficam sempre visíveis pra um membro, mesmo sem
permissão explícita — são utilitários da própria conta, não dados de um Quadro.

Aceitar convite (`checkPendingInvites`) grava a entrada do próprio convidado em
`/boards/{id}/members/{uid}` — as Database Rules permitem isso só se existir um
convite válido em `/boardInvites/{emailSanitizado}/{ownerUid}` (por isso o convite
é salvo com `ownerUid` como chave, não um id aleatório — a regra precisa achar o
convite sem iterar). Não testado de ponta a ponta com um convite real.
