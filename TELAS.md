# Life OS — Mapa de Telas

Documentação de todas as telas do app e o que cada uma faz. Não é carregado
automaticamente pelo Claude Code — é referência sob demanda, pode ser detalhado
sem preocupação com custo de contexto (ao contrário do CLAUDE.md).

> **Quadro compartilhado**: Guilherme é dono, Júlia é membro com acesso a
> todas as telas listadas em `BOARD_VIEW_OPTIONS` (praticamente tudo, exceto
> as telas "em breve" recém-criadas que ainda não têm conteúdo pra valer a
> pena listar, Busca e Config — essas duas ficam sempre visíveis pra
> qualquer um, dono ou membro, por serem utilitários da própria conta).

---

## Navegação global (presente em todas as telas)

- **Sidebar** com grupos: Executar (Hoje), Organizar (Notas, Tarefas, Agenda, Rotina, Casa, Finanças, Decisões, Perguntar), Evoluir (Fluência, Academia, Diário, Plano Alimentar, Objetivos, Timeline, Vision Board), Em breve (Bateria e Planejamento — uso ocasional, já funcionam de verdade; Supermercado, Cálculos, Empreendedorismo, Ápice — ainda sem conteúdo), e Configurações/Sair no rodapé.
- **Pesquisa global** (Ctrl/Cmd+K): busca em objetivos, tarefas, planejamento, diário, decisões e mais, ao mesmo tempo — e funciona como comando de navegação pra qualquer tela.
- **Captura rápida**: modal de texto livre acessível de qualquer tela, cria uma nova Nota.
- **Loading global**, **toasts** de notificação e **modal de confirmação** substituem os diálogos nativos do navegador em toda a aplicação.

---

## Hoje (`view-hoje`)

Tela inicial — só o que importa para o dia de hoje. Três sub-abas: **Dia**, **Corpo**, **Mente**.

- **Hero card**: a próxima atividade da fila (tarefa, treino ou combinado da Casa), com botão para concluir.
- **Depois disso**: fila combinada de tarefas + treino de hoje + atividades pendentes da Casa (por frequência — ver `casaAtividadeStatus()`), na ordem em que devem ser feitos.
- **Minha rotina hoje**: timeline de 24h mostrando os blocos da Rotina, estatísticas de "agora" e horas livres.
- **Eventos**: eventos de hoje da Agenda.
- **Água & creatina hoje**: consumo do dia vs. metas definidas em Academia.
- **Plano alimentar hoje**: próxima refeição pendente, com "Fiz essa refeição" / "Não fiz" / "Fiz outra refeição", e o painel de Insulina.
- **Fluência hoje**: progresso de cards estudados hoje vs. meta, sequência de dias.
- **Objetivos**: resumo dos objetivos de maior prioridade com barra de progresso.

---

## Notas (`view-storage`)

Mural de notas (substituiu o antigo modelo "Arquivo" de Gavetas/Capturas/Revisão IA).

- Notas soltas num board, organizáveis em **categorias** (chips no topo, gerenciadas em "🗂️ Categorias" — nome + cor, igual ao padrão usado no Vision Board).
- **Ver/Editar**: um único botão-toggle (não dois botões separados) alterna entre visualizar e editar o conteúdo das notas.
- **Selecionar**: modo de seleção múltipla pra mover/excluir em lote.
- **Captura**: barra fixa no fim da tela — Enter cria uma nota, "Dividir em várias" separa por parágrafo (linha em branco) em notas distintas.
- **Exportar/Importar** em JSON — compatível com o projeto Organizer, de onde essa feature foi portada.
- Cada nota pode ter um ícone próprio (clicável, paleta de emojis).

---

## Tarefas (`view-tarefas`)

- Tarefas organizadas em **grupos** nomeados, cada grupo em tabela (Prazo, Tarefa, Status, Excluir), ordenadas por data.
- Toggle de status direto na tabela. Suporta recorrência.
- "+ Nova tarefa", "+ Novo grupo", "Maximizar/Minimizar todos".

---

## Agenda (`view-agenda`)

- Eventos futuros em ordem cronológica, agrupados por semana e depois por mês.
- "+ Novo evento" e **importação de .ics** (exportado do Google Calendar).

## Rotina (`view-rotina`)

- Grade semanal (um card por dia) com blocos de horário e o que fazer em cada um.
- Alimenta a timeline de 24h e o cálculo de "horas livres" da tela Hoje.
- Salvar/Cancelar com indicador de status.

## Casa (`view-casa`)

Compartilhada com quem mora com você, em 3 abas:

- **Atividades**: tarefas rotineiras (frequência diária/semanal/quinzenal/mensal + responsável).
- **Regras da casa**: combinados gerais, com responsável opcional.
- **Erros**: registro neutro de quando alguém deixou de cumprir algo combinado — permite foto, botão "✓ corrigido" (some da lista principal, fica em "Ver erros já corrigidos" com opção de reabrir).

As pessoas da casa (dropdowns de responsável/quem) são gerenciadas em Configurações.

---

## Finanças (`view-financas`)

Tela nativa, modelada na aba **Financeiro** da planilha. Dados em `/users/{uid}/FinancasPlano`. **Salvar/Cancelar** (não autossalva) — qualquer edição marca "Alterações não salvas" e libera os dois botões; Cancelar volta pro último estado gravado. Quatro abas:

- **Meses**: um cartão por mês, lado a lado (scroll horizontal — Shift+roda do mouse rola direto, sem depender do navegador). Cada mês tem **Dia 10**, **Dia 20**, **Mercado Pago** e **Cartão Santander** (Estimativas / Renovação automática / Parcelas / Compras / **Aleatórios**, com barra de teto de gasto), mais Ganhos/Gastos/Sobra no rodapé. Os blocos internos (Dia 10, Dia 20, Mercado Pago, Cartão) têm faixa de cor própria pra identificar de longe.
  - Os meses se criam sozinhos: sempre há 12 meses a partir do atual; quando um termina, o próximo já está lá na próxima abertura. Contas repetidas vêm junto, parcelas andam uma casa e somem quando acabam, compras ficam pra trás.
- **Dá pra comprar?**: simulador — quanto, quantas vezes, em que mês → veredito ("Dá" / "Dá, mas estoura" / "Não dá") + quanto sobra do teto de aleatórios. "Registrar" lança a compra de verdade.
- **Valores**: números que se repetem todo mês (salário, vale, Alelo, aluguel...) — os meses apontam pra eles (`=$U$14` da planilha); editar aqui muda em todos.
- **Custo de vida**: listas *base* (mínimo pra viver) e *real* (com academia/suplementos/imprevistos), lado a lado.

## Decisões (`view-decisoes`)

Registro de decisões importantes com contexto, opções e critérios. Status: Em análise, Decidida, Cancelada. Importância: Alta, Média, Baixa. Botão **"✦ Padrões com IA"** analisa as decisões registradas e aponta padrões (usa a `iaProxy`).

## Perguntar ao LifeOS (`view-busca`)

Chat com IA (Claude, via `iaProxy`) que responde sobre os dados do app — tarefas, notas, objetivos, diário, agenda, decisões, finanças (resumo dos próximos meses + custo de vida), rotina semanal, atividades e regras da Casa (sem os Erros — registro de falha entre vocês, não organização), plano alimentar da semana e Timeline de Objetivos — em linguagem natural. Ex: "O que estou esquecendo?", "Dá pra comprar algo de R$500 em dezembro?", "Quem lava a louça essa semana?". Mantém as últimas perguntas e respostas da sessão como contexto curto pra perguntas de seguimento ("e em fevereiro?") — só na memória do navegador, não é salvo no Firebase.

---

## Fluência (`view-fluencia`) e Bateria (`view-bateria`)

Apps externos (fluencia.guilherme-oliveira.com e drum.guilherme-oliveira.com) embutidos via iframe, com botão "Abrir em nova aba". O painel "Fluência hoje" na tela Hoje consome `/Cards` direto, sem precisar abrir a tela.

## Academia (`view-academia`)

- **Metas diárias**: água (ml) e creatina (g) — aparecem na tela Hoje.
- **Cronograma semanal**: card por dia, ativar/desativar, lista de exercícios.
- Salvar/Cancelar com indicador de status.

## Diário (`view-diario`)

Livro aberto (duas páginas, papel pautado): página esquerda escreve a entrada de hoje (seletor de humor + texto), direita mostra entradas anteriores. 5 temas de cor (Papel, Rosa, Céu, Noturno, Meia-noite). Sem "padrões da IA" — só o que a pessoa escreveu.

## Plano Alimentar (`view-planoalimentar`)

- **Insulina por refeição**: dose (UI) configurável, aparece na Hoje.
- **Semana**: grade com refeições de cada dia (nome, horário, alimentos e quantidades).
- Salvar/Cancelar com indicador de status.

## Objetivos (`view-objetivos`)

- Cada objetivo: nome, descrição, categoria (emoji/cor), prioridade, prazo opcional, anel de progresso.
- Pontos (sub-metas) com progresso manual, automático (ligado a ações reais: Fluência, Academia, tarefas, Diário, Planejamento), automático referenciando outro objetivo inteiro, ou dependência de outro ponto.

## Timeline de Objetivos (`view-timelineobjetivos`)

Marcos em ordem, editáveis: nome, prazo (texto livre), valor (opcional, alterna entre "paga"/"recebe"), arraste pra reordenar. Dados em `/TimelineMarcos`. "+ Novo marco" pra adicionar.

## Vision Board (`view-visionboard`)

Colagem de imagens que representam onde você quer chegar.

- **Categorias** — quadros à parte: cada foto entra em no máximo uma categoria; **Geral** sempre mostra tudo junto. Gerencia em "🗂️ Categorias"; filtra pelos chips no topo da tela. Embaralhar/Restaurar tudo/adicionar fotos afetam só o que está visível no filtro atual.
- **Layout automático** tipo mural (masonry), baseado na proporção real de cada imagem.
- **Gerenciar imagens**: adicionar por link ou upload, excluir, agrupado por categoria. Links que não carregam como imagem não viram card, mas ficam listados em "Links que não abriram" (clicáveis, com botão de remover) em vez de simplesmente sumir.
- **Embaralhar** (pré-visualização, só salva com confirmação), **Restaurar tudo**, painel de **Camadas** (reordenar/esconder/mostrar/atribuir categoria por foto), foto selecionada ganha alças de escalar/girar direto na imagem.

---

## Em breve

Dois grupos diferentes no mesmo lugar da sidebar: **Bateria e Planejamento** já
funcionam de verdade, só ainda sem um bom uso encontrado no dia a dia; as
outras quatro é que não têm conteúdo nenhum.

- **Bateria** (`view-bateria`) — app externo (drum.guilherme-oliveira.com) embutido via iframe. Ver Fluência/Bateria acima.
- **Planejamento** (`view-monday`) — board estilo Monday.com/Trello, portado do projeto Apice: **grupos → elementos → subelementos**, cada um com status (Backlog, To Do, Em andamento, Bloqueado, Concluído, Adiado, Cancelado), prioridade, responsável e prazo. Arraste pra reorganizar. "Selecionar" pra ações em lote. Cobre um espaço parecido com Tarefas e com Atividades da Casa — as três continuam existindo, sem fronteira formal entre elas ainda.
- **Supermercado** (`view-supermercado`) — sem conteúdo. Lista de compras a partir do cardápio do Plano Alimentar.
- **Cálculos** (`view-calculos`) — sem conteúdo. Calculadoras do dia a dia; já tem a aba **Rescisão** criada dentro (vazia).
- **Empreendedorismo** (`view-empreendedorismo`) — sem conteúdo definido.
- **Ápice** (`view-apice`) — sem conteúdo além do botão "Abrir Ápice ↗", que já funciona, pra apicesolucoesdigitais.com.br.

---

## Despertadores, Lembretes e Acordar

Configurados em **Configurações → Despertadores** / **Lembretes**. Mesma coleção (`/Despertadores`, campo `tipo`), dois comportamentos:

- **Despertadores**: hora + dias da semana. Ao disparar, toca um som (sintetizado, sem depender de arquivo de áudio) e abre a tela **Acordar** (`view-acordar`, sem entrada na sidebar) com uma checklist pós-acordar editável em Configurações (pré-preenchida: café, banho, escovar os dentes, marmita, lanche da tarde, headset, água, cabos).
- **Lembretes**: mesma coisa, mas só notifica — sem som, sem sequestrar a tela. Vêm com três horários prontos (08h, 12h, 18h, todo dia).
- Com **Configurações → Notificações** ativado, os dois chegam por push mesmo com o app fechado ou o celular bloqueado (Firebase Cloud Messaging + Cloud Function agendada a cada minuto). Sem isso, só funcionam com o app aberto. Em ambos os casos é uma notificação — não um alarme que ignora o modo silencioso (isso só com app nativo).

---

## Configurações (`view-config`)

- **Conta**: nome de exibição, e-mail (somente leitura).
- **Aparência**: tema (claro/escuro/sistema), cor principal (16 predefinidas + "Restaurar verde").
- **Notificações**: ativa avisos locais (rotina, refeição com insulina) e registra o dispositivo pra push de despertadores/lembretes.
- **Despertadores** / **Lembretes**: ver seção acima.
- **Quadro**: trocar de Quadro, renomear o seu, convidar alguém (checklist de quais telas a pessoa vê).
- **Casa**: gerenciar as pessoas da casa, usadas nos dropdowns de responsável/quem.
