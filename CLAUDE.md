# Life OS

App pessoal de organização/produtividade (tarefas, agenda, rotina, hábitos, diário,
plano alimentar, academia, vision board etc.), em português. Front-end puro
(HTML/CSS/JS vanilla, sem build system, sem framework, sem npm). Abra `index.html`
direto no navegador para rodar.

## Estrutura

```
index.html      Markup: tela de login + shell do app (sidebar + uma <section class="view"> por página)
css/style.css    Todo o CSS, em blocos comentados por área
js/app.js        Toda a lógica JS, em blocos comentados por área (sem módulos — escopo global, ordem de carregamento importa)
```

Não há bundler/transpiler. Editar os arquivos já edita o app — só dar refresh no navegador.

## Backend

Sem servidor próprio. O app fala direto com APIs externas do navegador:

- **Firebase Realtime Database** (REST, via `dbGet`/`dbSet` etc. em `js/app.js`) — todos os dados do usuário (tarefas, agenda, diário...).
- **Firebase Identity Toolkit** (REST) — login/cadastro/senha.
- **OpenAI Chat Completions** — usada nas features de IA (organizar Gavetas/Capturas em Storage, Revisão IA). A chave da OpenAI é lida do próprio Firebase (`/openAiKey`) depois do login e fica em memória no cliente.

⚠️ Nota de segurança: a `FIREBASE_API_KEY` está hardcoded em `js/app.js` (linha ~218) — normal para Firebase (a segurança real vem das Database Rules, não da chave). Já a chave da OpenAI trafega para o navegador do usuário depois do login, o que a expõe a quem abrir o DevTools — vale revisar se isso é aceitável antes de expor o app publicamente.

⚠️ **Dois projetos Firebase diferentes — não confundir:**
- **Dados reais do app** (Realtime Database + Identity Toolkit/Auth): projeto **`anki-71f4f`** (nome de exibição "LifeOS", apesar do app registrado lá dentro se chamar "Anki" — sobra de uso anterior do projeto). É pra onde `FIREBASE_DB_URL`/`FIREBASE_API_KEY` em `js/app.js` apontam. **`database.rules.json` tem que ir pra cá**: `firebase deploy --only database --project anki-71f4f` (ou `--project dados`, alias em `.firebaserc`).
- **Hosting do site** (`thurgh-lifeos.web.app`) e as Cloud Functions existentes (`api`, `mapearColunasIA`): projeto **`basehub-135f5`** (nome de exibição "Hube") — é o alias `default` do `.firebaserc`, usado por `firebase deploy --only hosting`.

Ou seja: `firebase deploy --only hosting` (sem `--project`) está certo — vai pro `default` (`basehub-135f5`), que é onde o site é servido de fato. Mas qualquer deploy de **database rules** sem `--project anki-71f4f` vai pro projeto errado e não protege nada.

Cloud Functions rodam em `basehub-135f5` (onde o Blaze já está ativo — `anki-71f4f` não tem Cloud Functions habilitado). Uma função que precise ler/escrever os dados reais (ex: `checarDespertadores` em `functions/index.js`) usa um **app secundário do Admin SDK**, autenticado com uma conta de serviço gerada EM `anki-71f4f` (guardada como secret `ANKI_SERVICE_ACCOUNT`) — só assim ela enxerga aquele Realtime Database e consegue mandar push pros tokens FCM registrados lá. Ver o cabeçalho de `functions/index.js` pro passo a passo de publicação.

## Mapa de `js/app.js` (~4000 linhas)

Cada bloco já vem marcado com um comentário `/* ---------- Nome ---------- */`. Ao pedir uma
mudança numa feature específica, ir direto na faixa de linha evita reler o arquivo inteiro.

| Linhas | Bloco |
|---|---|
| 1–19 | Aparência: cor principal customizável |
| 20–41 | Navegação principal (troca de view) |
| 42–54 | Sub-abas (Tarefas: Hoje/Semana/Lista/Kanban) |
| 55–77 | Pesquisa global (Ctrl/Cmd+K) |
| 78–191 | Fila de hoje (concluir tarefas/treino) |
| 192–250 | Diário: seletor de humor + captura |
| 251–263 | Sessão |
| 264–352 | Loading global (IA / operações assíncronas) |
| 353–435 | Firebase Realtime Database (camada REST: dbGet/dbSet) |
| 436–620 | Quadros (Grupos/Famílias) |
| 621–632 | Config: renomear o Quadro |
| 633–691 | Config: pessoas da casa |
| 692–728 | Timeline "Minha rotina hoje": tooltip |
| 729–843 | Casa (atividades, regras, erros) |
| 844–1107 | Objetivos |
| 1108–1256 | Vision Board |
| 1257–1305 | Autenticação (Identity Toolkit) |
| 1306–1442 | Formulário de login/cadastro |
| 1443–1503 | Inbox |
| 1504–1735 | Revisão IA (organização via OpenAI, modelo Pull Request) |
| 1736–1745 | Storage (Gavetas) |
| 1746–2030 | Reorganização de Gavetas via IA (modelo Pull Request) |
| 2031–2092 | Diário (registro pessoal) |
| 2093–2161 | Hoje — painel "Plano alimentar hoje" |
| 2162–2174 | Hoje — painel "Diário hoje" |
| 2175–2336 | Academia (cronograma semanal) |
| 2337–2580 | Plano Alimentar (refeições + alimentos por dia) |
| 2581–2794 | Rotina (blocos de horário por dia da semana) |
| 2795–2813 | Rotina hoje (comparação no TODAY) |
| 2814–2914 | Timeline 24h da Hoje |
| 2915–3062 | Agenda (eventos + importação .ics) |
| 3063–3126 | Sidebar — data de hoje |
| 3127–3192 | Tarefas |
| 3193–3340 | Grupos de tarefas |
| 3341–3579 | Monday (board com sessões de início/parada) |
| 3580–3603 | Hoje (fila combinada: tarefas + treino/hábitos) |
| 3604–3678 | Hoje — painel "Água & creatina" |
| 3679–3730 | Hoje — painel "Insulina" |
| 3731–3768 | Hoje — painel "Avisos & eventos" |
| 3769–3859 | Fluência — cards respondidos hoje |
| 3860–3898 | Fluência (view completa / iframe) |
| 3899–3991 | Boot (inicialização do app) |

## Mapa de `css/style.css` (~1070 linhas)

Também em blocos comentados; principais áreas:

| Linhas | Bloco |
|---|---|
| 1–49 | Variáveis globais (`:root`), reset, `body` |
| 50–120 | Sidebar |
| 121–136 | Main |
| 137–298 | Hoje / Agenda (bloco de dia) / missão / progresso |
| 299–338 | Organizar / Inbox / Revisão IA |
| 339–498 | Evoluir / Dashboard / Diário / Hábitos / Estatísticas / Configurações / Sub-tabs |
| 509–650 | Quadros / Tarefas (linha completa & kanban) / Cards |
| 660–789 | Busca global / Loading global / Notificações / Modal de confirmação / Login |
| 789–928 | Academia / Plano Alimentar / Rotina |
| 928–1070 | Timeline 24h / Storage (Gavetas) / forms / Fluência |

## Views (em `index.html`, `id="view-*"`)

`hoje`, `storage`, `tarefas`, `monday`, `agenda`, `rotina`, `casa`, `objetivos`,
`visionboard`, `fluencia`, `academia`, `diario`, `planoalimentar`, `config`.

O nome da view (`data-view` na sidebar) é o mesmo sufixo usado no id da `<section>` e,
em geral, no nome do bloco correspondente em `app.js`/`style.css` — buscar por esse
nome nos comentários dos blocos é o caminho mais rápido para achar o código de uma
feature específica.
