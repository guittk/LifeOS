# Life OS — Mapa de Telas

Documentação de todas as telas do app e o que cada uma faz. Gerado a partir do estado atual de `index.html` / `js/app.js` / `css/style.css`.

> Nota sobre permissões: quando você compartilha seu Quadro com outra pessoa (Configurações → Quadro → Convidar), só as telas marcadas no convite ficam visíveis pra ela. Finanças, Bateria e Configurações ainda não fazem parte dessa lista de permissões — só o dono do Quadro as vê.

---

## Navegação global (presente em todas as telas)

- **Sidebar** com 3 grupos: Executar (Hoje), Organizar (Arquivo, Tarefas, Monday, Agenda, Rotina, Casa, Finanças) e Evoluir (Fluência, Bateria, Academia, Diário, Plano Alimentar, Objetivos, Vision Board), mais Configurações e Sair no rodapé.
- **Pesquisa global** (Ctrl/Cmd+K): busca em objetivos, projetos, tarefas, notas e diário ao mesmo tempo.
- **Captura rápida**: modal de texto livre acessível de qualquer tela. Se o texto parecer um relato pessoal do dia (ex: "hoje eu...", "me senti...", "estou triste"), o app pergunta se você quer mandar direto pro Diário em vez de guardar como uma Captura no Arquivo.
- **Loading global**, **toasts** de notificação e **modal de confirmação** substituem os diálogos nativos do navegador em toda a aplicação.

---

## Hoje (`view-hoje`)

Tela inicial — só o que importa para o dia de hoje.

- **Hero card**: a próxima atividade da fila (tarefa ou treino), com botão para concluir.
- **Minha rotina hoje**: timeline de 24h mostrando os blocos da Rotina, mais estatísticas de "agora", horas livres no total e horas livres a partir de agora, e a lista do que ainda falta no dia.
- **Sequência de execução**: fila combinada de tarefas + treino de hoje, na ordem em que devem ser feitos.
- **Objetivos**: resumo dos 4 objetivos de maior prioridade com barra de progresso (calculado automaticamente — ver seção Objetivos), com link "ver todos".
- **Avisos & eventos**: avisos ativos da Casa + eventos de hoje da Agenda, num único bloco.
- **Fluência hoje**: anel de progresso de cards estudados hoje vs. meta, sequência (streak) de dias, e mini-calendário da semana.
- **Água & creatina hoje**: consumo do dia vs. metas definidas em Academia.
- **Plano alimentar hoje**: próxima refeição pendente do dia, com botões "Fiz essa refeição" / "Não fiz" / "Fiz outra refeição", e o painel de Insulina (marcar doses tomadas por refeição).

---

## Arquivo (`view-storage`)

Captura sem fricção + organização assistida por IA, em 3 abas:

- **Gavetas**: agrupamentos de informação por assunto. Reordenar, editar, minimizar/maximizar (individualmente ou "Maximizar/Minimizar todos"), excluir. Botão "Analisar Gavetas com IA" sugere reorganizações — nada muda até você aprovar.
- **Capturas**: itens capturados ainda não organizados. "+ Nova captura" e "Organizar Capturas com IA" (agrupa as capturas dentro das Gavetas existentes).
- **Revisão IA**: mostra as propostas de organização geradas pela IA no modelo "Pull Request" — você aprova ou rejeita cada mudança antes que ela seja aplicada às Gavetas.

---

## Tarefas (`view-tarefas`)

- Tarefas organizadas em **grupos** nomeados (como as Gavetas), cada grupo mostra suas tarefas em tabela (Prazo, Tarefa, Status, Excluir), ordenadas por data.
- "+ Nova tarefa", "+ Novo grupo", "Maximizar/Minimizar todos" (sem loading global, é instantâneo).
- Toggle de status direto na tabela (a fazer / concluído).

---

## Monday (`view-monday`)

Board de execução com cronômetro:

- Cada task tem responsável, status e um histórico completo de sessões de início/parada (dar play ao começar, pausa ao parar).
- Tempo total por task é somado automaticamente a partir do histórico de sessões.
- "+ Nova task".

---

## Agenda (`view-agenda`)

- Eventos futuros em ordem cronológica, agrupados por semana e depois por mês.
- "+ Novo evento" e **importação de .ics** (exportado do Google Calendar), pra trazer todos os eventos de uma vez.

---

## Rotina (`view-rotina`)

- Grade semanal (um card por dia) onde você define blocos de horário e o que faz em cada um.
- Alimenta a timeline de 24h e o cálculo de "horas livres" da tela Hoje.
- Salvar/Cancelar com indicador de "Tudo salvo" / alterações pendentes.

---

## Casa (`view-casa`)

Compartilhada com quem mora com você (via Quadro), em 3 abas:

- **Atividades**: tarefas rotineiras da casa (lavar louça, banheiro...), com frequência (diária/semanal/quinzenal/mensal) e responsável.
- **Regras da casa**: combinados gerais, com responsável opcional.
- **Erros**: registro neutro ("sem acusação, só registro") de quando alguém deixou de cumprir algo combinado.
  - Campo "Quem" é um dropdown com as pessoas cadastradas em Configurações → Casa.
  - Permite anexar uma foto (upload ou tirar foto direto pelo celular).
  - Botão **"✓ corrigido"** marca o erro como resolvido — ele some da lista principal mas fica disponível numa seção recolhível **"Ver erros já corrigidos"**, com opção de "reabrir".

As pessoas da casa (usadas nos dropdowns de responsável/quem) são gerenciadas em Configurações.

---

## Finanças (`view-financas`)

Agora é um **app separado**, embutido via iframe (mesmo padrão da Fluência e da Bateria) — código-fonte vive em outra pasta (`Finanças/`, fora do Life OS) e será publicado em `financas.guilherme-oliveira.com`. Usa a mesma conta/dados do Life OS (`/users/{uid}/Financas`).

Funcionalidade da planilha (no app separado):
- Planilha estilo Excel: células endereçáveis (A1, B2...), fórmulas com `=`, `SUM(range)`, `AVG(range)` e operadores matemáticos.
- Formatação por célula: negrito, moeda (R$), cor de fundo (8 opções), + linha / + coluna.
- Modelo padrão pré-preenchido com a estrutura real do usuário: **Dia 10** (contas fixas), **Dia 20** (entradas), **Cartão Santander** (Estimativas / Renovação Automática / Parcelas / Compras), **Mercado Pago**, resumo de **sobra/falta do mês**, e uma tabela simples de valores fixos. Botão "Recarregar modelo" restaura esse padrão.
- Autossalva com indicador de status ("Salvando..." / "Tudo salvo").

---

## Fluência (`view-fluencia`) e Bateria (`view-bateria`)

Apps externos (fluencia.guilherme-oliveira.com e drum.guilherme-oliveira.com) embutidos via iframe, com botão "Abrir em nova aba" caso o embed seja bloqueado. O painel "Fluência hoje" na tela Hoje também consome os dados de estudo desse app (`/Cards`) pra mostrar o progresso sem precisar abrir a tela.

---

## Academia (`view-academia`)

- **Metas diárias**: água (ml) e creatina (g) — aparecem todo dia na tela Hoje pra acompanhar o consumo.
- **Cronograma semanal**: um card por dia da semana, ativar/desativar o dia, lista de exercícios (adicionar/remover/reordenar).
- O que estiver marcado pra hoje entra na fila de execução e na % de conclusão do dia.
- Salvar/Cancelar com indicador de status.

---

## Diário (`view-diario`)

Redesenhado como um **livro aberto** (duas páginas, papel pautado, lombada central):

- **Página esquerda**: escrever a entrada de hoje — seletor de humor (5 opções) + textarea. As linhas do papel ficam alinhadas com o texto digitado (não é só decoração).
- **Página direita**: entradas anteriores, com o mesmo alinhamento de linha por texto.
- **5 temas de cor** pro livro (Papel, Rosa, Céu, Noturno, Meia-noite — as duas últimas escuras, Meia-noite é o padrão), selecionáveis por um seletor de cores acima do livro, salvos por conta.
- O livro ocupa a altura toda da tela (sem sobra de espaço embaixo).
- Sem "padrões da IA" — é só o que a pessoa escreveu, sem nenhuma análise ou reescrita automática.

---

## Plano Alimentar (`view-planoalimentar`)

- **Insulina por refeição**: dose (UI) configurável por refeição que precisa (Café/Almoço/Jantar) — aparece na tela Hoje pra marcar o que já foi tomado.
- **Semana**: grade com as refeições de cada dia (nome, horário, alimentos e quantidades).
- Salvar/Cancelar com indicador de status.

---

## Objetivos (`view-objetivos`)

- Cada **objetivo** tem nome, descrição, categoria (com emoji/cor), prioridade e prazo opcional, com um anel de progresso.
- Cada objetivo se divide em **pontos** (sub-metas), que podem ter:
  - Progresso manual (arrastar 0–100%);
  - Progresso automático ligado a ações reais na plataforma: cards de Fluência estudados, exercícios concluídos na Academia, tarefas concluídas, entradas no Diário, ou tarefas concluídas no Monday (define uma meta de "quantas ações a partir de agora = 100%");
  - **Progresso automático referenciando outro objetivo** — um ponto pode "puxar" o progresso de outro objetivo inteiro (com proteção contra referência circular).
  - Dependência de outro ponto do mesmo objetivo (fica marcado como bloqueado até o outro ser concluído).
  - Prazo próprio, com aviso visual de atraso.
- "+ Novo objetivo" e "+ Adicionar ponto" dentro de cada card.

---

## Vision Board (`view-visionboard`)

Colagem de imagens que representam onde você quer chegar.

- **Layout automático**: empacotamento tipo mural (masonry) baseado na proporção real de cada imagem — preenche o espaço sem deixar vãos grandes nem uma foto cobrindo a outra.
- **Gerenciar imagens**: adicionar por link ou upload (várias de uma vez), excluir.
- **Embaralhar**: gera um novo arranjo automático em modo de pré-visualização — só é salvo se você clicar em "Salvar" (ou descartado em "Cancelar").
- **Restaurar tudo**: repõe tamanho e posição de todas as fotos pro arranjo automático (com confirmação).
- **Painel de Camadas** (estilo Canva): lista as fotos da frente pra trás; arrastar pela alça (⠿) reordena (define o z-index); esconder/mostrar foto individualmente (👁); clicar numa foto (no board ou na lista) seleciona ela.
- **Foto selecionada**: aparecem alças diretamente na imagem — 4 cantos pra escalar (arrastar pra fora/dentro) e uma alça no topo pra girar (arrastar em volta do centro), mais um botão "Restaurar esta foto" (tamanho e rotação padrão).
- Ao arrastar uma foto pelo corpo dela, o movimento respeita o ponto exato onde você clicou (sem "pular" o centro pro cursor).

---

## Configurações (`view-config`)

- **Conta**: nome de exibição (usado nas saudações da tela Hoje) e e-mail (somente leitura).
- **Aparência**: cor principal da plataforma — botão circular que abre um seletor com 16 cores predefinidas, mais "Restaurar verde".
- **Quadro**: trocar de Quadro (próprio ou compartilhado), renomear o seu Quadro, convidar alguém por e-mail (com checklist de quais telas essa pessoa vai poder ver).
- **Casa**: gerenciar as pessoas da casa, usadas nos dropdowns de responsável/quem em Atividades, Regras e Erros.
