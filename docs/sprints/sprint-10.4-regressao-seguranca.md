# QuestForge — Documentação Técnica da Sprint 10.4
## Regressão Funcional, Segurança e Fluxos Simulados Multimodulares

---

### 1. Resumo Executivo da Sprint 10.4

A **Sprint 10.4** teve como missão executar uma ampla auditoria de regressão funcional, segurança de aplicações web e validação cruzada de fluxos multimodulares em ambiente estritamente hermético (sem inicialização de infraestrutura real como PostgreSQL, MinIO ou Ollama).

- **Baseline Anterior (Sprint 10.3.1):** 855 testes aprovados, 4 testes de integração real ignorados.
- **Resultado Atual (Sprint 10.4):** **886 testes aprovados**, **4 testes de integração real ignorados** (totalizando 890 testes em 53 arquivos de teste).
- **TypeScript & Linting:** 100% aprovado sem nenhum aviso ou erro (`tsc --noEmit`).
- **Build de Produção:** 100% aprovado (`prisma generate && vite build`).
- **Novos Testes Adicionados:** 31 novos testes unitários e de integração hermética, distribuídos entre `backend/tests/security-regression.test.ts` e `backend/tests/simulated-cross-flows.test.ts`.

---

### 2. Matriz de Módulos Auditados

| Módulo | Escopo de Auditoria | Arquivos Analisados | Status de Homologação |
|---|---|---|---|
| **Autenticação & Sessão** | Cookie canônico `qf_session`, cadastro seguro, login constante, logout com limpeza de cookie, sessão expirada e fail-closed. | `backend/src/services/auth.service.ts`<br>`backend/src/middlewares/auth.middleware.ts`<br>`backend/src/utils/cookies.ts` | **Homologado (100% Green)** |
| **Segurança HTTP & CSRF** | Cabeçalho `X-Requested-With: QuestForge-Client`, validação estrita de Origin/Referer na allowlist, rate limiting hermético e proteção contra JSON malformado. | `backend/src/middlewares/csrf.middleware.ts`<br>`backend/src/middlewares/rate-limit.middleware.ts`<br>`backend/src/middlewares/error.middleware.ts` | **Homologado (100% Green)** |
| **Documentos & MinIO** | Magic bytes `%PDF-`, isolamento de chave privada (`users/{userId}/pdf/{docId}.pdf`), extração digital, classificação `NEEDS_OCR` e recusa honesta `OCR_UNAVAILABLE` (503). | `backend/src/services/pdf-document.service.ts`<br>`backend/src/services/storage.service.ts`<br>`backend/src/services/ocr.service.ts` | **Homologado (100% Green)** |
| **Questões & Gabaritos** | Regras de criação, schemas Zod `.strict()`, isolamento por usuário, proteção de gabarito para não-proprietários e validação atômica de alternativas. | `backend/src/services/question.service.ts`<br>`backend/src/controllers/question.controller.ts` | **Homologado (100% Green)** |
| **Motor de Simulados** | Ciclo de vida (CREATED -> IN_PROGRESS -> COMPLETED), anti-cheating rigoroso no DTO de submissão de respostas, apuração atômica e bloqueio 409 pós-finalização. | `backend/src/services/simulation.service.ts`<br>`backend/src/controllers/simulation.controller.ts`<br>`backend/src/validators/simulation.validator.ts` | **Homologado (100% Green)** |
| **Streak & Atividades** | Transições de streak (STARTED, MAINTAINED_SAME_DAY, INCREMENTED, RESET), cálculo em UTC, idempotência no mesmo dia e isolamento entre contas. | `backend/src/services/streak.service.ts`<br>`backend/src/services/study-activity.service.ts` | **Homologado (100% Green)** |
| **Analytics & IA Educacional** | Separação inegociável entre pontuação oficial do concurso e métricas pedagógicas demonstradas (exclusão de `isAnnulled === true` e `null`), fallback determinístico sem erro 500. | `backend/src/services/educational-analytics.service.ts`<br>`backend/src/services/educational-ai.service.ts`<br>`backend/src/controllers/educational-ai.controller.ts` | **Homologado (100% Green)** |
| **Diagnósticos & Liveness/Readiness** | Endpoints `/api/live` (200 alive) e `/api/ready` (503 not_ready se Postgres cair, 200 ready_degraded se apenas MinIO cair, mascaramento de segredos). | `backend/src/controllers/health.controller.ts`<br>`backend/src/config/database.ts` | **Homologado (100% Green)** |

---

### 3. Riscos Identificados e Mitigações

1. **Risco de Crash ou Exposição de Stack em JSON Malformado:**
   - *Risco:* Payloads corrompidos com erro de sintaxe JSON poderiam gerar erro não capturado ou retornar HTTP 500 expondo detalhes de parsing.
   - *Mitigação:* `backend/src/middlewares/error.middleware.ts` foi aprimorado para interceptar `SyntaxError` com `status: 400` e mensagem padronizada `Formato JSON inválido no corpo da requisição`, além de capturar `entity.too.large` com HTTP 413.

2. **Risco de Manipulação de Atributos Autoritativos em Simulados (Mass Assignment / IDOR):**
   - *Risco:* Um cliente malicioso poderia tentar injetar `userId`, `isCorrect` ou `scorePercentage` no payload de criação ou resposta de simulados.
   - *Mitigação:* Todos os schemas Zod utilizam `.strict()`, rejeitando imediatamente requisições contendo propriedades não autorizadas com HTTP 400 (`SIMULATION_INVALID_INPUT`). O `userId` é extraído unicamente da sessão autenticada do servidor.

3. **Risco de Vazamento de Gabarito Durante a Prova (Cheating via Network Tab):**
   - *Risco:* Ao responder uma questão, a resposta HTTP poderia expor o campo `isCorrect` ou o gabarito oficial da questão antes do término da prova.
   - *Mitigação:* O método `toPublicQuestionAttemptDTO` sanitiza a resposta, garantindo que `isCorrect`, snapshots de gabarito e anulações só fiquem acessíveis no DTO final retornado após o encerramento oficial do simulado (`POST /api/simulations/:id/finish`).

4. **Risco de Indisponibilidade Geral por Falha em Serviços Opcionais:**
   - *Risco:* Se o servidor Ollama estiver offline ou sem GPU, a rota de análise educacional poderia retornar HTTP 500.
   - *Mitigação:* O serviço `EducationalAiService` intercepta qualquer erro de rede ou modelo e aciona automaticamente o fallback determinístico (`generateDeterministicEducationalAnalysis`), entregando recomendações sólidas com `source: 'DETERMINISTIC_FALLBACK'` e HTTP 200.

---

### 4. Fluxos Simulados Multimodulares Implementados

Os fluxos foram implementados em `backend/tests/simulated-cross-flows.test.ts` e testam a interação de múltiplos subsistemas em cenários realistas de ponta a ponta:

#### Fluxo A — Ciclo de Vida Completo do Simulado
- **Criação:** `POST /api/simulations` com critérios válidos retorna HTTP 201 e estado `CREATED`.
- **Início:** `POST /api/simulations/:id/start` registra início oficial e transiciona para `IN_PROGRESS`.
- **Resolução com Anti-Cheating:** `POST /api/simulations/:id/answers` com alternativa selecionada ou resposta em branco (`null`) persiste a tentativa e retorna `PublicQuestionAttemptDTO` sem `isCorrect` ou gabarito. Submissão de alternativa de outra questão é rejeitada com HTTP 400.
- **Encerramento:** `POST /api/simulations/:id/finish` calcula pontuação oficial, transiciona para `COMPLETED` e revela correções.
- **Bloqueio Pós-Fim:** Tentativas de alterar respostas ou re-finalizar são rejeitadas com HTTP 409 Conflict (`SIMULATION_ALREADY_COMPLETED`).

#### Fluxo B — Documento PDF e Pipeline de Extração / OCR
- **Upload Real:** Arquivo gerado em memória via `buildRealPdfBuffer` com cabeçalho `%PDF-1.4` é aceito em `POST /api/documents` com HTTP 201, gravado no MinIO privado e processado como `COMPLETED`. Chave interna `objectKey` é preservada em sigilo e omitida do DTO público.
- **Detecção de OCR:** Arquivo PDF escaneado (sem camada de texto digital) é classificado automaticamente como `status: 'NEEDS_OCR'` e `requiresOcr: true`.
- **Honestidade Operacional:** Requisição a `POST /api/documents/:id/ocr` sem motor OCR instalado retorna HTTP 503 com código `OCR_UNAVAILABLE`, informando explicitamente que o OCR real depende da infraestrutura da futura Sprint 11.
- **Validação de Magic Bytes:** Arquivos arbitrários ou renomeados com extensão `.pdf` sem magic bytes são rejeitados com HTTP 400 (`PDF_VALIDATION_ERROR`).

#### Fluxo C — Falhas de Infraestrutura e Resiliência Operacional
- **Queda do PostgreSQL:** Endpoint `/api/ready` retorna HTTP 503 e `status: 'not_ready'` com `essential.database.status: 'down'`.
- **Queda Isolada do MinIO:** Endpoint `/api/ready` retorna HTTP 200 e `status: 'ready_degraded'` com `optional.storage.status: 'down'`, mantendo o serviço operacional para simulados e login.
- **Indisponibilidade do Ollama:** Consulta a `/api/educational-ai/analysis` detecta cliente de IA offline e responde HTTP 200 com `source: 'DETERMINISTIC_FALLBACK'`, sem falhas 500.

#### Fluxo D — Isolamento Estrito entre Contas (Anti-IDOR Multimodular)
- **Simulados:** Usuário Bob não consegue consultar, iniciar, submeter respostas ou finalizar simulados pertencentes a Alice (retorna HTTP 404 sem vazar existência de registros).
- **Documentos:** Usuário Bob não consegue consultar metadados nem deletar documentos PDF pertencentes a Alice.

#### Módulo Streak & Atividades de Estudo
- **Dia 1 (STARTED):** Primeira atividade inicia sequência em 1.
- **Mesmo Dia (MAINTAINED_SAME_DAY):** Múltiplas atividades no mesmo dia civil UTC mantêm streak em 1, garantindo idempotência e prevenindo avanço indevido.
- **Dia Consecutivo (INCREMENTED):** Atividade em D+1 UTC incrementa o streak para 2.
- **Quebra de Sequência (RESET):** Atividade após intervalo superior a 1 dia sem atividade reseta o streak atual para 1, preservando o recorde histórico `longestStreak`.

#### Regra Crítica de Questões Anuladas (Separação Oficial vs Pedagógica)
- **Domínio Oficial do Concurso:** Questão anulada pela banca com atribuição de ponto gera bonificação e eleva a pontuação oficial (`officialTotalPoints: 2.0`).
- **Domínio Pedagógico Demonstrado:** Apenas questões regulares comprovadas (`isAnnulled === false`) são computadas em `pedagogicalAnsweredQuestions`, `pedagogicalCorrectAnswers` e `pedagogicalAccuracyPercentage`. Questões com `isAnnulled === true` ou `isAnnulled === null` são neutralizadas conservadoramente para evitar inflação artificial do diagnóstico do aluno.

---

### 5. Achados de Segurança e Correções Aplicadas

Durante as verificações da Sprint 10.4, os seguintes pontos foram identificados e ajustados:

1. **Captura Centralizada de Erros de Parsing JSON (HTTP 400):**
   - *Arquivo:* `backend/src/middlewares/error.middleware.ts`
   - *Correção:* Adicionado manipulador específico para `err instanceof SyntaxError && err.status === 400 && 'body' in err`, retornando HTTP 400 com payload estruturado e sem stack trace.
2. **Tratamento de Payload Excessivo (HTTP 413):**
   - *Arquivo:* `backend/src/middlewares/error.middleware.ts`
   - *Correção:* Captura de erro `entity.too.large` emitido pelo parser do Express retornando HTTP 413 Payload Too Large.
3. **Auditoria de Omissão de `objectKey` na API Pública:**
   - *Arquivo:* `backend/src/types/pdf-document.types.ts` e `backend/src/controllers/pdf-document.controller.ts`
   - *Verificação:* Confirmado que `PdfDocumentDetailDTO` não expõe `objectKey` nem `bucketName`, mantendo os identificadores de bucket e chave interna do MinIO inacessíveis a clientes externos.

---

### 6. Limitações Conhecidas dos Mocks e Validações Futuras (Sprint 11)

As seguintes validações não puderam ser executadas na Sprint 10.4 por respeito absoluto à fronteira de isolamento hermético (proibição de iniciar infraestrutura real):

1. **OCR Real (Tesseract / EasyOCR):**
   - A extração digital de PDFs baseada em streams de texto (`pdfjs-dist`) foi validada hermeticamente com buffers binários reais. O pipeline de OCR ótico sobre imagens escaneadas permanece simulado com `UnconfiguredOcrService` e retorno honesto `OCR_UNAVAILABLE`, devendo ser homologado na Sprint 11 com binários reais.
2. **Conexões de Rede Reais com PostgreSQL, MinIO e Ollama:**
   - Todos os testes de concorrência, transações atômicas e timeouts foram executados contra mocks em memória (`MockEducationalAnalyticsRepository`, `MockUserStreakRepository`) e handlers do Express. Conexões de rede TCP/IP reais (porta 5432, porta 9000 e porta 11434) serão validadas na Sprint 11 com Docker Compose em ambiente Debian.
3. **Testes de Integração Real Ignorados:**
   - Os 4 testes de integração real (`backend/tests/database.integration.test.ts`, `backend/tests/auth.integration.test.ts`, `backend/tests/pdf-document.integration.test.ts` e `backend/tests/question.integration.test.ts`) continuam com flag `.skip()` e aguardam a execução dos containers oficiais na Sprint 11.

---

### 7. Declaração de Fronteira e Próximos Passos

A **Sprint 10.4 está concluída e homologada com 886 testes aprovados, zero erros no linter e build de produção aprovado.**

- **A Sprint 10.5 (Auditoria Final do Pacote de Handoff e Checklist Pré-Implantação)** pode ser iniciada pelo usuário.
- **A Sprint 11 permanece estritamente proibida** neste ambiente e será executada exclusivamente pelo usuário em novo chat no ambiente Debian.
