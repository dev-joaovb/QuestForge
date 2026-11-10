# QuestForge — Registro de Preparação e Transição para a Sprint 11
## Auditoria de Contratos, Configuração e Roteiro de Implantação (Sprint 10.2.1)

* **Data do Registro:** 07 de novembro de 2026
* **Status:** Preparatório e Condicionado (Sprint 11 NÃO autorizada até a conclusão das Sprints 10.3 a 10.5)
* **Sprint de Origem:** Sprint 10.2.1 (Correções de Contratos Documentais e Robustez do Docker Compose)
* **Sprint de Destino:** Sprint 11 (Execução futura no ambiente Debian exclusivamente com ChatGPT e usuário)
* **Manual Técnico Completo:** Consulte [`docs/DEPLOYMENT_SPRINT_11.md`](../DEPLOYMENT_SPRINT_11.md)

---

## 1. Fronteiras de Engenharia e Sequência do Projeto

A Sprint 10.2.1 **NÃO** encerra a fase de engenharia e **NÃO** autoriza a execução imediata da infraestrutura real. A documentação da Sprint 11 possui caráter estritamente preparatório.

A sequência canônica obrigatória do projeto estabelece:
1. **Sprint 10.2.1 (Atual):** Correções documentais de contratos (Cookie, CSRF, Prisma, OCR) e robustez do healthcheck do MinIO.
2. **Sprint 10.3:** Diagnósticos e readiness com mocks (verificação estática e diagnósticos de prontidão sem infraestrutura real).
3. **Sprint 10.4:** Regressão, segurança e fluxos simulados (garantia de estabilidade e integridade dos módulos).
4. **Sprint 10.5:** Auditoria final e handoff formal do repositório.
5. **Sprint 11:** Configuração, subida de containers e validação operacional real no ambiente Debian, conduzida exclusivamente pelo usuário com ChatGPT em um novo chat.

---

## 2. Mapa dos Contratos Técnicos Auditados e Confirmados

### 2.1 Autenticação e Proteção CSRF
* **Cookie de Sessão Real:** `qf_session` (definido em `backend/src/utils/cookies.ts:3`).
  * Atributos: `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure: process.env.NODE_ENV === 'production'`.
  * Escopo: host-only (sem diretiva `Domain`, mitigando vazamentos entre subdomínios).
* **Cabeçalho de Proteção CSRF Real:** `X-Requested-With: QuestForge-Client` (definido em `backend/src/middlewares/csrf.middleware.ts:4-5` e `src/services/api.ts:41-42`).
  * Exigido para todos os métodos mutáveis (`POST`, `PUT`, `DELETE`, `PATCH`).
  * Qualquer requisição com cabeçalho ausente, incorreto ou origem não autorizada é rejeitada com HTTP 403 `CsrfValidationFailed`.

### 2.2 Banco de Dados e Prisma ORM
* **Inventário do Schema (`prisma/schema.prisma`):**
  * **13 Modelos Relacionais:** `User`, `UserSession`, `Exam`, `PdfDocument`, `Question`, `Alternative`, `OfficialAnswerKey`, `OfficialAnswerKeyItem`, `Simulation`, `SimulationQuestion`, `QuestionAttempt`, `StudyActivity`, `UserStreak`.
  * **11 Enums Sincronizados:** `DocumentType`, `AnswerKeyType`, `AnswerKeyStatus`, `AnswerKeyItemStatus`, `QuestionType`, `QuestionDifficulty`, `QuestionStatus`, `DocumentProcessingStatus`, `SimulationStatus`, `AnswerKeySource`, `StudyActivityType`.
* **5 Diretórios de Migração (`prisma/migrations/`):**
  1. `20261014120000_init`
  2. `20261014150000_add_official_answer_keys`
  3. `20261015120000_add_simulations_engine`
  4. `20261021140000_prevent_cascade_delete_on_simulation_questions`
  5. `20261027120000_add_study_activity_and_streak`
  * Arquivo de controle: `migration_lock.toml`.
* **Comandos de Migração:**
  * *Desenvolvimento local:* `npm run prisma:migrate` (executa `prisma migrate dev` para criação iterativa de migrações).
  * *Implantação no Debian:* `npx prisma migrate deploy` (aplica as 5 migrações existentes de forma não interativa e idempotente, sem alterar arquivos).

### 2.3 Armazenamento de Objetos (MinIO)
* **Serviço:** `backend/src/services/storage.service.ts` (`MinioObjectStorageService`).
* **Isolamento Multi-inquilino:** Chaves estritas `users/${safeUser}/pdf/${safeDoc}.pdf` com sanitização contra Path Traversal.
* **Bucket Privado:** `questforge-documents` com metadado `X-Amz-Meta-Visibility: private`.
* **Healthcheck no Docker Compose:** Rota HTTP oficial `/minio/health/live` com detecção resiliente de ferramentas (`curl` ou `mc`) sem dependência de aliases não configurados.

### 2.4 Estado Real do OCR
* **Extração Digital de PDFs:** Implementada via `pdfjs-dist` em `backend/src/utils/pdf-extractor.ts`.
* **Detecção de Scans:** PDFs sem texto selecionável são classificados como `SCANNED_NEEDS_OCR` e recebem status `NEEDS_OCR`.
* **Contrato Arquitetural:** Interface `IOcrService` em `backend/src/services/ocr.service.ts`.
* **Motor Concreto Ausente:** A implementação padrão `UnconfiguredOcrService` retorna `isAvailable(): false` e responde honestamente com HTTP 503 `OCR_UNAVAILABLE`.
* **Pendência Técnica:** O OCR **não** está operacional de fábrica; a integração de um motor real (ex: Tesseract local ou OCR externo) é um item de backlog técnico para planejamento posterior e não será suprido apenas por configuração de infraestrutura.

### 2.5 Inteligência Artificial Local (Ollama)
* **Adaptadores:** `OllamaChatAdapter` (`POST /api/chat`, extração de questões) e `EducationalAiClient` (análise pedagógica).
* **Streaming e Buffer:** Leitura controlada via `getReader()`, limite seguro de 500.000 bytes e distinção estrita entre cancelamento voluntário (HTTP 499) e timeout interno (HTTP 504).
* **Modelo Padrão:** `llama3.1:8b` (a ser baixado via `docker exec -it questforge-ollama ollama pull llama3.1:8b` na Sprint 11).

---

## 3. Diretrizes Preparatórias para a Futura Sprint 11

Quando as Sprints 10.3 a 10.5 forem integralmente concluídas e auditadas, o usuário iniciará a Sprint 11 no Debian seguindo o manual [`docs/DEPLOYMENT_SPRINT_11.md`](../DEPLOYMENT_SPRINT_11.md):
1. Provisionamento de `.env` com segredos de alta entropia (`openssl rand`).
2. Subida dos containers de apoio via `docker compose up -d postgresql minio ollama`.
3. Aplicação das migrações via `npx prisma migrate deploy`.
4. Carga do modelo via `docker exec -it questforge-ollama ollama pull llama3.1:8b`.
5. Subida da aplicação completa (`backend` + `frontend`).
6. Verificação de integridade via `GET /api/health` e testes reais via `RUN_DB_INTEGRATION=true npm run test:integration`.
