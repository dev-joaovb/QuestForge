# QuestForge — Documentação Técnica da Sprint 10.5
## Auditoria Final, Consolidação Documental e Handoff para a Sprint 11

* **Data de Fechamento:** 10 de novembro de 2026
* **Status:** Homologado e Concluído com Sucesso
* **Papel:** Engenheiro de Software Sênior, Arquiteto de Sistemas e Auditor de Qualidade
* **Marco de Transição:** Esta sprint encerra o ciclo de preparação, engenharia e auditoria estritamente hermética com o Gemini. A Sprint 11 será conduzida pelo usuário no ambiente Debian com ChatGPT para a subida da infraestrutura real.

---

### 1. Resumo Executivo e Estado Final do Repositório

A **Sprint 10.5** consolida o ciclo de engenharia do QuestForge, encerrando todas as pendências arquiteturais, documentais e de acoplamento de testes identificadas nas sprints anteriores.

- **Status da Suíte Global:** **864 testes aprovados**, **4 testes de integração real ignorados** (`.skip()`), totalizando 868 testes em 53 arquivos. *(Nota de Auditoria: Na Sprint 10.4, a contagem reportada era 886 devido à execução colateral duplicada dos 22 testes de `pdf-document.service.test.ts`; com a extração de `backend/tests/helpers/pdf-test.helper.ts` na Sprint 10.5, a duplicata foi eliminada, consolidando 864 testes únicos aprovados).*
- **Tipagem e Linter:** 100% aprovado (`tsc --noEmit`), zero erros ou avisos.
- **Build de Produção:** 100% aprovado (`prisma generate && vite build`).
- **Isolamento Hermético:** Nenhuma infraestrutura real (PostgreSQL, MinIO, Ollama ou Docker) foi iniciada no ambiente de sandbox. Todos os contratos foram validados hermeticamente.

---

### 2. Resolução dos Achados da Auditoria da Sprint 10.4

#### 2.1 ACH-TEST-01: Desacoplamento do Helper Binário de PDFs
- **Problema Identificado:** O arquivo `backend/tests/simulated-cross-flows.test.ts` importava a função auxiliar `buildRealPdfBuffer` diretamente de `backend/tests/pdf-document.service.test.ts`. Quando o Vitest executava o arquivo de cross-flows isoladamente, ele carregava o arquivo irmão e disparava seus 22 testes unitários adicionais em cascata (executando 36 testes em vez de apenas seus 14 próprios).
- **Ação Executada:**
  - Criação do módulo utilitário dedicado `backend/tests/helpers/pdf-test.helper.ts`, contendo `buildRealPdfBuffer` e a interface `BuildRealPdfBufferOptions`.
  - Refatoração de `backend/tests/pdf-document.service.test.ts` para consumir o helper e reexportá-lo com tipagem retrocompatível.
  - Atualização dos arquivos `backend/tests/simulated-cross-flows.test.ts`, `backend/tests/pdf-document.routes.test.ts` e `backend/tests/ocr-pipeline.test.ts`.
- **Validação Isolada:**
  - `simulated-cross-flows.test.ts`: executado isoladamente, reporta **exatamente 14 testes aprovados** (zero execução em cascata).
  - `pdf-document.service.test.ts`: executado isoladamente, reporta **exatamente 22 testes aprovados**.
  - Suíte global: soma estrita de **864 testes únicos aprovados** (eliminando os 22 testes duplicados que geravam os 886 reportados na Sprint 10.4).

#### 2.2 ACH-SEC-02: Precisão da Documentação sobre Defesa contra Prompt Injection
- **Problema Identificado:** Declarações que sugeriam "eliminação completa" ou "imunidade absoluta" a injeções de prompt em LLMs eram tecnicamente imprecisas, pois modelos de linguagem não são determinísticos por natureza.
- **Ação Executada:**
  - Atualização de `docs/sprints/sprint-10.4-regressao-seguranca.md` na Seção 5 (item 4).
  - Descrição técnica da defesa em profundidade:
    1. **Entrada:** Sanitização léxica de parâmetros de consulta, exclusão rigorosa de PII/credenciais, e encapsulamento de textos em `untrustedDocumentPayload` com `JSON.stringify`.
    2. **Saída:** Validação determinística estrita via Zod (`.parse()`), reconciliação cruzada de totais matemáticos de questões, e fallback determinístico imediato (`source: 'DETERMINISTIC_FALLBACK'`) com HTTP 200 caso o modelo alucine ou retorne payload fora dos limites esperados.

#### 2.3 ACH-TEST-02: Taxonomia Explícita da Suíte de Testes
- **Problema Identificado:** Documentação anterior não explicitava formalmente as diferenças de escopo entre testes unitários, testes HTTP de controllers e testes de integração com repositórios em memória.
- **Ação Executada:**
  - Inclusão da Seção 6 em `docs/sprints/sprint-10.4-regressao-seguranca.md` com a classificação quadripartite:
    1. *Testes Unitários Puros:* Regras de negócio, cálculos matemáticos e validadores.
    2. *Testes HTTP Herméticos:* Rotas Express via `supertest` com mocks nos controllers.
    3. *Testes de Integração Hermética Multicamada:* Serviços e fluxos cruzados orquestrados com repositórios em memória.
    4. *Testes de Integração Real:* 4 testes com `.skip()` para serem executados com PostgreSQL, MinIO e Ollama reais na Sprint 11.

---

### 3. Matriz Consolidada de Contratos Técnicos

| Domínio | Especificação Canônica | Arquivo Fonte / Implementação | Comportamento em Falha |
|---|---|---|---|
| **Sessão** | Cookie `qf_session`, `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, host-only | `backend/src/utils/cookies.ts` | Rejeição HTTP 401 `Unauthorized` |
| **CSRF** | Header `X-Requested-With: QuestForge-Client` + validação de Origin/Referer | `backend/src/middlewares/csrf.middleware.ts` | Rejeição HTTP 403 `CsrfValidationFailed` |
| **Parsing** | JSON parser com captura de `SyntaxError` (400) e `entity.too.large` (413) | `backend/src/middlewares/error.middleware.ts` | HTTP 400 sem stack trace / HTTP 413 |
| **Liveness** | `GET /api/live` (ou `/api/health/live`) | `backend/src/controllers/health.controller.ts` | HTTP 200 `{ status: 'alive' }` |
| **Readiness** | `GET /api/ready` (ou `/api/health/ready`) com timeouts assíncronos e isolamento | `backend/src/controllers/health.controller.ts` | HTTP 503 se PostgreSQL cair; HTTP 200 `ready_degraded` se MinIO cair |
| **Banco** | Prisma ORM, 13 models relacionais, 11 enums, 5 migrações aplicadas | `prisma/schema.prisma`<br>`prisma/migrations/` | Falha imediata na inicialização do backend |
| **Storage** | MinIO via S3 SDK, chave privada `users/{userId}/pdf/{docId}.pdf` | `backend/src/services/storage.service.ts` | HTTP 500 encapsulado em upload; degradação em readiness |
| **IA** | Ollama local via HTTP, timeout com `AbortController`, fallback determinístico | `backend/src/services/educational-ai.service.ts` | HTTP 200 com `source: 'DETERMINISTIC_FALLBACK'` |
| **OCR** | Extração digital de texto (`pdfjs-dist`); fallback honesto para imagens | `backend/src/services/ocr.service.ts` | HTTP 503 `OCR_UNAVAILABLE` quando não configurado |

---

### 4. Inventário Oficial do Banco de Dados e Migrations

- **Models (13):**
  1. `User` (autenticação, perfil, credenciais)
  2. `UserSession` (sessões de login com expiração)
  3. `Exam` (concursos, bancas e órgãos)
  4. `PdfDocument` (documentos carregados e metadados)
  5. `Question` (enunciados, classificação, anulações)
  6. `Alternative` (opções de resposta A-E)
  7. `OfficialAnswerKey` (gabaritos oficiais publicados por bancas)
  8. `OfficialAnswerKeyItem` (itens de gabarito com anulação e alteração)
  9. `Simulation` (simulados instanciados por alunos)
  10. `SimulationQuestion` (questões vinculadas ao simulado com ordem)
  11. `QuestionAttempt` (respostas submetidas pelo aluno e pontuação)
  12. `StudyActivity` (eventos diários de estudo)
  13. `UserStreak` (contagem de ofensiva em UTC com recorde)

- **Enums (11):**
  `DocumentType`, `AnswerKeyType`, `AnswerKeyStatus`, `AnswerKeyItemStatus`, `QuestionType`, `QuestionDifficulty`, `QuestionStatus`, `DocumentProcessingStatus`, `SimulationStatus`, `AnswerKeySource`, `StudyActivityType`.

- **Migrations Versionadas (5):**
  1. `20261014120000_init`
  2. `20261014150000_add_official_answer_keys`
  3. `20261015120000_add_simulations_engine`
  4. `20261021140000_prevent_cascade_delete_on_simulation_questions`
  5. `20261027120000_add_study_activity_and_streak`

- **Comando Canônico de Implantação no Debian:**
  ```bash
  npx prisma migrate deploy
  ```
  *(Proibido executar `prisma migrate dev` em ambientes de implantação/staging/produção).*

---

### 5. Guia de Transição para o ChatGPT na Sprint 11

O documento [`docs/SPRINT_11_HANDOFF.md`](../SPRINT_11_HANDOFF.md) foi concebido como a peça central de transição.

O ChatGPT e o usuário devem seguir o fluxo em 10 fases ordenadas:
1. **Fase 1:** Verificação prévia do ambiente Debian (Docker, Docker Compose v2, portas 3333, 5173, 5432, 9000, 9001, 11434).
2. **Fase 2:** Configuração do arquivo `.env` a partir de `.env.example` com segredos fortes.
3. **Fase 3:** Subida inicial da infraestrutura de dados (`docker compose up -d postgresql minio`).
4. **Fase 4:** Verificação de saúde dos containers de dados e execução do `npx prisma migrate deploy`.
5. **Fase 5:** Inicialização e teste do Ollama (`docker compose up -d ollama`).
6. **Fase 6:** Subida do Backend (`docker compose up -d backend`) e conferência do `/api/health`.
7. **Fase 7:** Subida do Frontend (`docker compose up -d frontend`) e teste de integração proxy.
8. **Fase 8:** Execução e reativação dos 4 testes de integração real (`backend/tests/*.integration.test.ts`).
9. **Fase 9:** Teste manual do fluxo ponta a ponta (login, upload PDF, simulado, pontuação pedagógica de anulação e streak).
10. **Fase 10:** Checklist operacional de encerramento e emissão do termo de aceitação da Sprint 11.

---

### 6. Declaração Formal de Conclusão e Autorização

Com a conclusão da Sprint 10.5:
1. **Todas as sprints preparatórias (10.0 a 10.5) estão formalmente concluídas e aprovadas.**
2. **A base de código está 100% hermética, sem erros de compilação ou linter, e pronta para execução no host.**
3. **A Sprint 11 está formalmente AUTORIZADA para ser iniciada no ambiente Debian com ChatGPT.**
