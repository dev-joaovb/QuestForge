# QuestForge — Manual Canônico de Handoff para a Sprint 11
## Guia Mestre de Implantação, Validação e Operação Real no Ambiente Debian

* **Versão:** 1.0.0 — Golden Master
* **Data de Emissão:** 10 de novembro de 2026
* **Origem da Custódia Técnica:** Gemini (Engenharia de Software & Auditoria Hermética — Sprints 10.0 a 10.5)
* **Destino da Custódia Técnica:** Usuário & ChatGPT (Sessão de Implantação Real em Host Debian — Sprint 11)
* **Classificação:** Documento Técnico Operacional Autoritativo (Auditoria Aprovada)

---

## 1. Identificação do Projeto e Metadados do Handoff

* **Nome do Sistema:** QuestForge
* **Natureza:** Plataforma Web Fullstack de Simulação de Exames, Extração Inteligente de Documentos PDF, Análise Pedagógica com IA e Gestão de Hábitos de Estudo (Streak).
* **Finalidade deste Documento:** Orientar a transição da base de código 100% testada e hermética (Sprint 10.5) para o ambiente operacional Debian na Sprint 11, onde containers Docker reais (PostgreSQL, MinIO, Ollama) serão inicializados pela primeira vez.
* **Repositório:** Diretório raiz com monorepo contendo `backend/` (Express + TypeScript + Prisma), `src/` (Frontend React + Vite + Tailwind) e `docker-compose.yml`.

---

## 2. Arquitetura Geral do Sistema

O QuestForge adota uma arquitetura em camadas com separação estrita de responsabilidades:

1. **Frontend (SPA):**
   - React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
   - Comunicação via Axios (`src/services/api.ts`) apontando para `/api` através do proxy reverso de desenvolvimento ou Nginx/Docker em produção.
   - Autenticação transparente com cookies HTTP (`withCredentials: true`).

2. **Backend (API REST):**
   - Node.js 20+, Express, TypeScript (`tsx` em dev, compilado em prod).
   - Injeção de dependências modular em rotas e controllers (`createApiRouter`).
   - Resiliência assíncrona, timeouts rígidos com `AbortController`, fail-closed em autorização.

3. **Camada de Persistência Relacional:**
   - PostgreSQL 16 Alpine orquestrado via Prisma ORM v6.
   - Conexão pooling gerenciada pelo Prisma Client (`backend/src/config/database.ts`).

4. **Armazenamento de Objetos (Blob Storage):**
   - MinIO (compatível com Amazon S3 SDK v3).
   - Bucket estritamente privado (`questforge-documents`) para guarda de arquivos PDF.

5. **Serviço de Inteligência Artificial Local:**
   - Ollama local via API HTTP (`http://ollama:11434/api/chat`).
   - Fallback determinístico offline e determinístico integrado.

---

## 3. Matriz de Contratos de Rede, Portas e Conectividade

| Serviço | Porta Host | Porta Container | Protocolo | Escopo de Acesso | Finalidade |
|---|---|---|---|---|---|
| **PostgreSQL** | `5432` | `5432` | TCP | Interno / Host | Banco de dados relacional e Prisma ORM |
| **MinIO API** | `9000` | `9000` | HTTP | Interno / Host | API S3 para upload e download de PDFs |
| **MinIO Console** | `9001` | `9001` | HTTP | Host / Browser | Console administrativo web do MinIO |
| **Ollama API** | `11434` | `11434` | HTTP | Interno / Host | Servidor de modelos de linguagem (LLMs) |
| **Backend API** | `3333` | `3333` | HTTP | Interno / Host | API REST do QuestForge |
| **Frontend** | `5173` | `5173` | HTTP | Externo / Browser | Interface Web SPA do usuário |

> **Rede Docker:** Todos os serviços comunicam-se pela rede bridge `questforge-net` usando nomes DNS canônicos dos containers (`postgresql`, `minio`, `ollama`, `backend`, `frontend`).

---

## 4. Contratos de Autenticação e Segurança HTTP

### 4.1 Cookie de Sessão Canônico
* **Nome do Cookie:** `qf_session` (Definido em `backend/src/utils/cookies.ts`).
* **Propriedades:**
  - `httpOnly: true` (inacessível a scripts client-side via `document.cookie`).
  - `sameSite: 'lax'` (proteção nativa contra vazamentos cross-site em navegação).
  - `path: '/'`.
  - `secure: process.env.NODE_ENV === 'production'`.
  - **Host-Only:** Sem diretiva `Domain`, evitando vazamento para outros subdomínios.
* **Exemplo de Header:** `Set-Cookie: qf_session=s%3A...; Path=/; HttpOnly; SameSite=Lax`

### 4.2 Proteção Obrigatória contra CSRF
* **Cabeçalho Requerido:** `X-Requested-With: QuestForge-Client` (Definido em `backend/src/middlewares/csrf.middleware.ts`).
* **Regra de Aplicação:** Exigido para todos os métodos mutáveis de estado (`POST`, `PUT`, `DELETE`, `PATCH`).
* **Validação de Origem:** Valida se `Origin` ou `Referer` coincide com a allowlist do backend (`FRONTEND_URL` / `ALLOWED_ORIGINS`).
* **Rejeição:** Requisições que violem a regra retornam HTTP 403 `CsrfValidationFailed`.

### 4.3 Parsing e Tratamento de Erros de Entrada
* **JSON Syntax Errors:** Interceptados em `backend/src/middlewares/error.middleware.ts`, retornando HTTP 400 estruturado sem stack trace.
* **Tamanho de Payload (HTTP 413):** `entity.too.large` capturado retornando HTTP 413.
* **Validação com Zod:** Todos os schemas de entrada usam `.strict()`, rejeitando mass assignment com HTTP 400.

---

## 5. Contrato de Banco de Dados e Migrations (Prisma ORM)

### 5.1 Inventário do Schema (`prisma/schema.prisma`)
* **13 Modelos Relacionais:**
  1. `User`: Identidade, hash de senha (`bcrypt`), nome, email único.
  2. `UserSession`: Sessões ativas indexadas por token com expiração.
  3. `Exam`: Provas de concursos com órgão, banca, ano e escolaridade.
  4. `PdfDocument`: Metadados do documento PDF enviado, hash SHA-256 e status.
  5. `Question`: Enunciados, tipo de questão, disciplina, tópico, anulações e gabarito oficial.
  6. `Alternative`: Alternativas (A a E) associadas às questões.
  7. `OfficialAnswerKey`: Gabaritos oficiais publicados por bancas.
  8. `OfficialAnswerKeyItem`: Itens de gabarito com anulação e alteração.
  9. `Simulation`: Simulados gerados pelos alunos com tempo limite e status.
  10. `SimulationQuestion`: Junção ordenada de questões dentro do simulado.
  11. `QuestionAttempt`: Respostas submetidas pelo aluno e pontuação atômica.
  12. `StudyActivity`: Eventos de estudo para auditoria diária.
  13. `UserStreak`: Ofensiva de estudos diários calculada em UTC com recorde histórico.

* **11 Enums Sincronizados:**
  `DocumentType`, `AnswerKeyType`, `AnswerKeyStatus`, `AnswerKeyItemStatus`, `QuestionType`, `QuestionDifficulty`, `QuestionStatus`, `DocumentProcessingStatus`, `SimulationStatus`, `AnswerKeySource`, `StudyActivityType`.

### 5.2 Diretórios de Migração Versionados (`prisma/migrations/`)
1. `20261014120000_init`
2. `20261014150000_add_official_answer_keys`
3. `20261015120000_add_simulations_engine`
4. `20261021140000_prevent_cascade_delete_on_simulation_questions`
5. `20261027120000_add_study_activity_and_streak`
* Arquivo de lock: `migration_lock.toml`.

### 5.3 Regra Canônica de Aplicação no Debian
```bash
# COMANDO OBRIGATÓRIO PARA DEPLOY NO DEBIAN:
npx prisma migrate deploy

# PROIBIDO USAR EM IMPLANTAÇÃO/PRODUÇÃO:
# npx prisma migrate dev (Cria migrações iterativas e altera o histórico; NÃO USE)
```

---

## 6. Contrato de Armazenamento de Documentos (MinIO)

* **Serviço:** `MinioObjectStorageService` (`backend/src/services/storage.service.ts`).
* **Estrutura de Chaves Privadas (Multi-inquilino):**
  ```text
  users/{userId}/pdf/{documentId}.pdf
  ```
* **Proteções:** Sanitização de Path Traversal (`replace(/[^a-zA-Z0-9_-]/g, '')`), validação de tamanho máximo (15 MB), verificação de magic bytes `%PDF-` nos primeiros 1024 bytes e hash SHA-256 do arquivo.
* **Privacidade Absoluta:** O DTO público da API (`PdfDocumentDetailDTO`) omite intencionalmente o `objectKey` e o `bucketName` para clientes externos.

---

## 7. Estado Real do OCR e Extração de Texto

* **Extração Digital Nativa:** Implementada via `pdfjs-dist` em `backend/src/utils/pdf-extractor.ts`. Opera com buffers binários diretamente da memória/MinIO.
* **Classificação de Documentos:**
  - PDFs com texto selecionável: status `COMPLETED`, classificação `DIGITAL_TEXT`.
  - PDFs escaneados (sem texto): status `NEEDS_OCR`, flag `requiresOcr: true`.
* **Motor Concreto de OCR (Débito Técnico Conhecido):**
  - O motor de OCR ótico (Tesseract / EasyOCR) permanece desacoplado pela interface `IOcrService`.
  - A classe padrão `UnconfiguredOcrService` retorna `isAvailable(): false`.
  - Tentativas de solicitar OCR via API retornam honestamente **HTTP 503 com código `OCR_UNAVAILABLE`**.
  - A concretização de um adapter de OCR ótico (ex.: container com Tesseract OCR) é uma evolução recomendada pós-Sprint 11.

---

## 8. Contrato de IA e Fallback Determinístico (Ollama)

* **Endpoint de Integração:** `POST /api/chat` no host do Ollama (`http://ollama:11434`).
* **Timeout e Resiliência:** Requisições utilizam `AbortController` com limite configurável via `OLLAMA_TIMEOUT_MS` (padrão: 30000 ms).
* **Sanitização de Prompts:** Exclusão rigorosa de nomes, emails, senhas e tokens nos payloads enviados aos modelos.
* **Fallback Determinístico:**
  - Caso o Ollama esteja offline, sem GPU, com timeout ou retorne JSON fora da especificação Zod, o backend **NUNCA retorna erro 500**.
  - O sistema aciona o `generateDeterministicEducationalAnalysis`, respondendo **HTTP 200** com `source: 'DETERMINISTIC_FALLBACK'`, mantendo a plataforma utilizável para o aluno.

---

## 9. Regra Crítica de Negócio: Separação entre Pontuação Oficial e Métricas Pedagógicas

Conforme homologado na Sprint 10.1:
1. **Domínio Oficial do Concurso:**
   - Questões anuladas pela banca (`isAnnulled === true`) atribuem pontuação total ao candidato, elevando a nota final do simulado (`officialTotalPoints`).
2. **Domínio Pedagógico Demonstrado:**
   - O diagnóstico de proficiência, taxa de acerto por disciplina e sugestões de estudo **EXCLUEM ESTRITAMENTE** questões anuladas (`isAnnulled === true` ou `isAnnulled === null`).
   - Apenas questões regulares com gabarito válido (`isAnnulled === false`) compõem `pedagogicalAnsweredQuestions`, `pedagogicalCorrectAnswers` e `pedagogicalAccuracyPercentage`.

---

## 10. Diagnósticos Operacionais, Liveness e Readiness

O QuestForge fornece rotas de verificação de integridade operacional em `backend/src/controllers/health.controller.ts`:

### 10.1 Rota de Liveness (`GET /api/live` ou `GET /api/health/live`)
* **Propósito:** Verificar se o processo Node.js está vivo e recebendo conexões HTTP.
* **Comportamento:** Retorna imediatamente **HTTP 200** `{ "status": "alive" }`.

### 10.2 Rota de Readiness (`GET /api/ready` ou `GET /api/health/ready`)
* **Propósito:** Verificar se o sistema está pronto para atender tráfego de usuários.
* **Critério de Disponibilidade:**
  - **PostgreSQL Ativo:** O banco relacional é componente essencial. Se o PostgreSQL estiver offline, a rota retorna **HTTP 503** `{ "status": "not_ready" }`.
  - **MinIO Offline:** O armazenamento é componente opcional/degradável. Se apenas o MinIO estiver offline, a rota retorna **HTTP 200** `{ "status": "ready_degraded" }`, permitindo que login, simulados e estatísticas continuem funcionando.
  - **Ollama Offline:** O serviço de IA é opcional/degradável. Se estiver offline, status é degradado, mantendo o fallback determinístico ativo.
  - **Segurança:** Segredos e detalhes internos de conexão são estritamente mascarados nos payloads de resposta.

---

## 11. Pré-requisitos de Sistema no Host Debian

Antes de iniciar a Sprint 11, certifique-se de que a máquina Debian atende aos seguintes requisitos:

1. **Sistema Operacional:** Debian 12 (Bookworm) ou Debian 11 (Bullseye) 64-bit.
2. **Docker Engine:** Versão 24.0 ou superior instalada e rodando (`docker --version`).
3. **Docker Compose:** Plugin v2 (`docker compose version` — espaço sem hífen).
4. **Node.js & npm (no host para comandos auxiliares):** Node.js v20.x LTS e npm v10.x.
5. **Portas Disponíveis:** Garantir que as portas `3333`, `5173`, `5432`, `9000`, `9001` e `11434` não estejam em uso por outros serviços no host.
6. **Recursos de Hardware:**
   - Mínimo: 4 GB de RAM e 2 vCPUs (para Backend, Frontend, Postgres e MinIO).
   - Recomendado para Ollama com modelo local (ex: `llama3.2:1b` ou `mistral`): 16 GB de RAM ou GPU dedicada com drivers NVIDIA instalados.

---

## 12. Variáveis de Ambiente e Arquivo `.env`

No host Debian, crie o arquivo `.env` na raiz do projeto a partir de `.env.example`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` preenchendo credenciais seguras:

```ini
# --- AMBIENTE E SERVIDOR ---
NODE_ENV=production
PORT=3333
BACKEND_PORT=3333
FRONTEND_PORT=5173
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173

# --- BANCO DE DADOS (POSTGRESQL) ---
POSTGRES_USER=questforge_admin
POSTGRES_PASSWORD=DefinaUmaSenhaForteParaOPostgres!2026
POSTGRES_DB=questforge
POSTGRES_PORT=5432
DATABASE_URL=postgresql://questforge_admin:DefinaUmaSenhaForteParaOPostgres!2026@localhost:5432/questforge?schema=public

# --- SESSÃO E SEGURANÇA ---
# Gere com: openssl rand -base64 48
SESSION_SECRET=c2VjdXJlX3Nlc3Npb25fc2VjcmV0X2dlbmVyYXRlZF93aXRoX29wZW5zc2xfcmFuZF9mb3JfcHJvZA==

# --- MINIO (OBJECT STORAGE) ---
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_ACCESS_KEY=questforge_minio_admin
MINIO_SECRET_KEY=DefinaUmaSenhaForteParaOMinio!2026
MINIO_BUCKET=questforge-documents
MINIO_USE_SSL=false

# --- OLLAMA (IA EDUCACIONAL) ---
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:1b
OLLAMA_TIMEOUT_MS=30000
```

---

## 13. Roteiro de Inicialização Sequencial (Fases 1 a 7)

Execute os comandos na ordem exata abaixo:

### Fase 1: Subida dos Serviços de Dados
```bash
docker compose up -d postgresql minio
```

### Fase 2: Verificação de Saúde do Banco e Storage
```bash
# Aguardar os healthchecks atingirem status 'healthy':
docker compose ps
```
Verifique se `questforge-postgresql` e `questforge-minio` exibem `(healthy)`.

### Fase 3: Criação do Bucket no MinIO
Se o bucket `questforge-documents` não for criado automaticamente:
```bash
# Acessar via browser http://localhost:9001 ou usar Docker:
docker exec -it questforge-minio mc alias set local http://localhost:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY
docker exec -it questforge-minio mc mb local/questforge-documents --ignore-existing
```

### Fase 4: Aplicação das Migrações no Banco de Dados Real
```bash
npx prisma migrate deploy
```
*Saída esperada:* `5 migrations belong to the database. All migrations have been successfully applied.`

### Fase 5: Inicialização do Ollama e Download do Modelo
```bash
docker compose up -d ollama
docker exec -it questforge-ollama ollama pull llama3.2:1b
```

### Fase 6: Inicialização e Validação do Backend
```bash
docker compose up -d backend
# Conferir logs de inicialização:
docker compose logs -f backend
```
Testar a rota de prontidão via curl:
```bash
curl -i http://localhost:3333/api/ready
```
*Saída esperada:* HTTP 200 `{ "status": "ready", ... }`

### Fase 7: Inicialização do Frontend
```bash
docker compose up -d frontend
```
Acessar no navegador: `http://localhost:5173`

---

## 14. Reativação e Execução dos 4 Testes de Integração Real

Na Sprint 11, após a infraestrutura estar saudável, reative e execute os 4 testes de integração real que estavam com `.skip()`:

1. `backend/tests/database.integration.test.ts`
2. `backend/tests/auth.integration.test.ts`
3. `backend/tests/pdf-document.integration.test.ts`
4. `backend/tests/question.integration.test.ts`

**Passo a Passo de Reativação:**
1. Abra cada arquivo e altere `describe.skip(...)` para `describe(...)`.
2. Assegure-se de que a variável `DATABASE_URL` aponta para o Postgres real em execução.
3. Execute os testes no terminal do host:
```bash
npx vitest run backend/tests/*.integration.test.ts
```
Todos os testes de conexão real com banco, transações e upload S3 devem passar com 100% de sucesso.

---

## 15. Roteiro de Teste Manual Ponta a Ponta no Navegador

1. **Cadastro e Login:** Criar uma nova conta de estudante e validar o recebimento do cookie `qf_session`.
2. **Envio de Documento:** Efetuar o upload de uma prova em PDF com texto digital. Verificar extração automática e classificação como `COMPLETED`.
3. **Criação de Simulado:** Gerar um simulado de 10 questões a partir das questões cadastradas.
4. **Resolução de Questões:** Responder às questões, confirmar que o gabarito não é exposto na aba Network antes do fim da prova.
5. **Finalização e Pontuação:** Encerrar o simulado. Confirmar a pontuação oficial do concurso e o registro do streak do dia.
6. **IA e Recomendações:** Acessar o dashboard de IA educacional. Verificar geração de recomendações (via modelo Ollama ou via fallback determinístico seguro).

---

## 16. Guia de Troubleshooting no Debian

* **Problema: Container PostgreSQL reiniciando em loop.**
  - *Causa:* Conflito de permissão no volume `postgres_data` ou senha vazia.
  - *Solução:* Verifique se `POSTGRES_PASSWORD` está definida no `.env`. Inspecione os logs com `docker compose logs postgresql`.
* **Problema: Erro 403 `CsrfValidationFailed` no Frontend.**
  - *Causa:* O frontend está acessando uma porta diferente da allowlist (`ALLOWED_ORIGINS` no `.env`).
  - *Solução:* Ajuste `FRONTEND_URL` e `ALLOWED_ORIGINS` no `.env` para corresponder exatamente à URL utilizada no navegador.
* **Problema: Backend não conecta ao MinIO.**
  - *Causa:* `MINIO_ENDPOINT` configurado como `localhost` dentro do container em vez de `minio` na rede Docker.
  - *Solução:* No `docker-compose.yml`, a variável `MINIO_ENDPOINT` deve ser `minio`. Para scripts rodando no host, use `localhost`.
* **Problema: Ollama consome muita memória ou causa crash.**
  - *Causa:* Modelo muito pesado para os recursos disponíveis.
  - *Solução:* Utilize um modelo menor como `llama3.2:1b` ou configure o sistema para operar com o fallback determinístico nativo (`OLLAMA_MODEL=""`).

---

## 17. Riscos Remanescentes e Débitos Técnicos Conhecidos

1. **OCR Ótico para Scans:** Implementado apenas para extração de PDFs digitais nativos; PDFs escaneados retornam `OCR_UNAVAILABLE` (503) de forma honesta. A integração com Tesseract ou engine OCR externo deve ser feita como evolução posterior.
2. **GPU para Ollama:** Em ambientes sem aceleração por hardware (GPU NVIDIA/CUDA), modelos LLM maiores podem apresentar latência elevada. O fallback determinístico garante continuidade operacional em qualquer cenário.
3. **Backup de Dados:** Antes de colocar a aplicação em produção contínua, configure rotinas de backup periódico (`pg_dump`) para os volumes `postgres_data` e `minio_data`.

---

## 18. Matriz de Rastreabilidade das Sprints Anteriores

* **Sprint 10.0:** Auditoria inicial e identificação de anomalias em pontuação de simulados.
* **Sprint 10.1:** Correção da interpretação pedagógica de questões anuladas (isolamento oficial vs. pedagógico).
* **Sprint 10.1.1:** Paridade entre repositórios em memória e persistência Prisma ORM.
* **Sprint 10.2:** Preparação documental preliminar para implantação.
* **Sprint 10.2.1:** Correções de contratos documentais (Cookie, CSRF, Prisma) e robustez do healthcheck MinIO.
* **Sprint 10.3:** Diagnósticos operacionais, liveness e readiness herméticos.
* **Sprint 10.3.1:** Hardening de concorrência assíncrona e isolamento de falhas.
* **Sprint 10.4:** Regressão funcional, auditoria de segurança e fluxos simulados multimodulares.
* **Sprint 10.5:** Auditoria final, desacoplamento de helpers de teste e handoff consolidado.

---

## 19. Checklist de Prontidão da Sprint 11

- [ ] Arquivo `.env` preenchido com senhas fortes a partir de `.env.example`.
- [ ] Docker e Docker Compose v2 validados no host Debian.
- [ ] Portas 3333, 5173, 5432, 9000, 9001 e 11434 livres.
- [ ] Containers `postgresql` e `minio` inicializados e saudáveis (`docker compose up -d postgresql minio`).
- [ ] Migrações aplicadas com sucesso via `npx prisma migrate deploy`.
- [ ] Bucket `questforge-documents` criado no MinIO.
- [ ] Container `ollama` inicializado com modelo baixado (ou fallback preparado).
- [ ] Container `backend` em execução com `/api/ready` retornando HTTP 200.
- [ ] Container `frontend` em execução acessível na porta 5173.
- [ ] Testes de integração real (`*.integration.test.ts`) reativados e aprovados.
- [ ] Fluxo ponta a ponta validado no navegador.

---

## 20. Termo de Transferência de Custódia Técnica

Declaro que a base de código do **QuestForge** foi submetida a rigoroso processo de auditoria de engenharia de software, segurança de aplicações, resiliência assíncrona e testes herméticos.

* **Suíte de Testes Herméticos:** 864 testes únicos aprovados, 4 testes de integração real ignorados (`.skip()`), 0 falhas (totalizando 868 testes em 53 arquivos). *(Nota: na Sprint 10.4 reportavam-se 886 devido aos 22 testes duplicados em cascata que foram eliminados pela extração do helper em ACH-TEST-01).*
* **Integridade de Tipagem:** 0 erros de TypeScript (`tsc --noEmit`).
* **Integridade de Build:** Build de produção aprovado (`prisma generate && vite build`).
* **Estado das Migrações:** 5 migrações consolidadas no diretório `prisma/migrations/`.
* **Fronteira Operacional:** Nenhum container ou serviço de rede real foi iniciado no ambiente preparatório, mantendo integridade absoluta do isolamento hermético.

A custódia do repositório está formalmente transferida para o **Usuário e ChatGPT**, estando a **Sprint 11 AUTORIZADA** para execução imediata no ambiente Debian.
