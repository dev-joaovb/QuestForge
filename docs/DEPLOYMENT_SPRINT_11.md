# QuestForge — Manual Técnico de Implantação e Operação (Sprint 11)
## Guia de Preparação e Execução em Ambiente Debian / Linux

* **Documento de Referência:** `docs/DEPLOYMENT_SPRINT_11.md`
* **Sprint de Preparação:** Sprint 10.2 / 10.2.1 (Auditoria de Contratos e Robustez de Implantação)
* **Destino Operacional:** Sprint 11 (Execução futura e exclusiva pelo usuário com ChatGPT no ambiente Debian)
* **Compatibilidade Homologada:** Debian 12 (Bookworm) / Debian 11 (Bullseye) / Ubuntu 22.04+ LTS

> **AVISO IMPORTANTE DE PLANEJAMENTO E FRONTEIRAS DE ENGENHARIA:**  
> A Sprint 11 **NÃO** está autorizada a ser executada imediatamente. Este manual possui caráter estritamente preparatório. A sequência obrigatória do projeto estabelece:
> 1. **Sprint 10.2.1:** Correções documentais e robustez do Docker Compose (Concluída).
> 2. **Sprint 10.3:** Diagnósticos e readiness com mocks (pendente).
> 3. **Sprint 10.4:** Regressão, segurança e fluxos simulados (pendente).
> 4. **Sprint 10.5:** Auditoria final e handoff formal (pendente).
> 5. **Sprint 11:** Configuração e execução operacional real no ambiente Debian.

---

## 1. Visão Geral da Arquitetura e Contratos Técnicos

O QuestForge opera 5 componentes coordenados na rede interna `questforge-net` (bridge):

```text
                                       +-------------------------------------------------+
                                       |              Rede questforge-net                |
                                       |                                                 |
  Navegador Web (Porta 5173 / 3000)    |                                                 |
         │                             |                                                 |
         ▼                             |                                                 |
  [ questforge-frontend ] ─────────────┼──────────────┐                                  |
  (React 19 + Vite + Tailwind)         |              │                                  |
         │                             |              ▼                                  |
         │ Proxy /api                  |   [ questforge-backend ]                        |
         └─────────────────────────────┼─► (Node.js 22 + Express + Prisma)               |
                                       |      │               │              │           |
                                       |      ▼               ▼              ▼           |
                                       | [ postgresql ]   [ minio ]      [ ollama ]      |
                                       | (Postgres 16)   (Obj Storage)  (LLM Local)      |
                                       |  Porta 5432      Portas 9000    Porta 11434     |
                                       |                  e 9001 (Web)                   |
                                       +────────────────────────────────────────────────-+
```

### 1.1 Contratos Técnicos dos Serviços

| Serviço | Container | Imagem Base | Porta Interna | Porta Exposta no Host | Protocolo / Contrato |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **PostgreSQL** | `questforge-postgresql` | `postgres:16-alpine` | `5432` | `5432` | PostgreSQL Wire Protocol. Schema `public`, 13 modelos relacionais, 11 enums, 5 migrações aplicadas. Healthcheck: `pg_isready`. |
| **MinIO** | `questforge-minio` | `minio/minio:latest` | `9000` / `9001` | `9000` (API) / `9001` (Console) | S3-Compatible API. Bucket privado padrão: `questforge-documents`. Chaves `users/<userId>/pdf/<docId>.pdf`. Healthcheck HTTP: `/minio/health/live`. |
| **Ollama** | `questforge-ollama` | `ollama/ollama:latest` | `11434` | `11434` | REST HTTP API (`/api/chat`, `/api/tags`). Modelo padrão: `llama3.1:8b`. Healthcheck: `ollama list`. |
| **Backend** | `questforge-backend` | `Dockerfile.backend` (Node 22) | `3333` | `3333` | REST JSON API, autenticação por cookies HttpOnly (`qf_session`), proteção CSRF (`X-Requested-With: QuestForge-Client`). Healthcheck: `GET /api/health`. |
| **Frontend** | `questforge-frontend` | `Dockerfile.frontend` (Node 22) | `5173` | `5173` | React 19 SPA, Tailwind CSS v4, proxy reverso Vite para `/api`. |

### 1.2 Inventário do Prisma ORM (`prisma/schema.prisma`)
* **13 Modelos Relacionais:** `User`, `UserSession`, `Exam`, `PdfDocument`, `Question`, `Alternative`, `OfficialAnswerKey`, `OfficialAnswerKeyItem`, `Simulation`, `SimulationQuestion`, `QuestionAttempt`, `StudyActivity`, `UserStreak`.
* **11 Enums Sincronizados:** `DocumentType`, `AnswerKeyType`, `AnswerKeyStatus`, `AnswerKeyItemStatus`, `QuestionType`, `QuestionDifficulty`, `QuestionStatus`, `DocumentProcessingStatus`, `SimulationStatus`, `AnswerKeySource`, `StudyActivityType`.
* **5 Diretórios de Migração (`prisma/migrations/`):**
  1. `20261014120000_init`
  2. `20261014150000_add_official_answer_keys`
  3. `20261015120000_add_simulations_engine`
  4. `20261021140000_prevent_cascade_delete_on_simulation_questions`
  5. `20261027120000_add_study_activity_and_streak`
  * Arquivo de controle: `migration_lock.toml`.

### 1.3 Estado Real do OCR (Reconhecimento Óptico de Caracteres)
* **Extração Digital de Texto:** Totalmente operacional via `pdfjs-dist` para documentos com camada de texto selecionável.
* **Detecção de Scans:** PDFs escaneados ou sem texto legível são classificados como `SCANNED_NEEDS_OCR` e recebem o status `NEEDS_OCR`.
* **Contrato de OCR (`IOcrService`):** A implementação padrão no backend é `UnconfiguredOcrService`, que retorna `isAvailable(): false` e responde com HTTP 503 `OCR_UNAVAILABLE` para chamadas a `POST /api/documents/:id/ocr`.
* **Pendência Técnica:** O reconhecimento por OCR **não** está funcional de fábrica. A integração de um motor real (ex: Tesseract OCR local ou serviço OCR dedicado) é uma pendência de arquitetura para implementação e validação posterior, não sendo suprida apenas por subida de containers.

---

## 2. Pré-requisitos de Sistema no Debian

Antes de iniciar a futura Sprint 11 no servidor Debian, certifique-se de que os pacotes essenciais estejam instalados:

```bash
# 1. Atualizar repositórios do sistema
sudo apt update && sudo apt upgrade -y

# 2. Instalar dependências básicas
sudo apt install -y curl wget git openssl ca-certificates gnupg lsb-release

# 3. Instalar Docker Engine e Docker Compose v2 (se ainda não estiver instalado)
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 4. Habilitar e iniciar o serviço Docker
sudo systemctl enable docker
sudo systemctl start docker

# 5. Adicionar o usuário atual ao grupo docker (evita uso de sudo)
sudo usermod -aG docker $USER
newgrp docker

# 6. Instalar Node.js 22 LTS (necessário para execução local de scripts e Prisma CLI)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 3. Preparação das Variáveis de Ambiente (`.env`)

O QuestForge adota uma política rigorosa de segurança: **nenhuma credencial padrão ou senha fraca é admitida em ambiente produtivo.**

### 3.1 Criação do Arquivo `.env`

Na raiz do projeto Debian:

```bash
cp .env.example .env
```

### 3.2 Geração Automática de Credenciais Seguras

Execute os comandos abaixo para gerar segredos de alta entropia:

```bash
# Gerar segredos randômicos seguros
PG_PASS=$(openssl rand -hex 24)
MINIO_SEC=$(openssl rand -hex 24)
SESS_SEC=$(openssl rand -hex 32)

# Atualizar o arquivo .env
sed -i "s/POSTGRES_USER=.*/POSTGRES_USER=\"questforge_admin\"/" .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=\"$PG_PASS\"/" .env
sed -i "s/POSTGRES_DB=.*/POSTGRES_DB=\"questforge\"/" .env

sed -i "s/MINIO_ACCESS_KEY=.*/MINIO_ACCESS_KEY=\"minio_admin\"/" .env
sed -i "s/MINIO_SECRET_KEY=.*/MINIO_SECRET_KEY=\"$MINIO_SEC\"/" .env

sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=\"$SESS_SEC\"/" .env
sed -i "s/OLLAMA_MODEL=.*/OLLAMA_MODEL=\"llama3.1:8b\"/" .env
```

### 3.3 Matriz de Configuração: Host Local vs Containers Docker

O QuestForge suporta dois modos operacionais em Debian:

#### Modo A: Execução Híbrida (Containers para Infraestrutura + Node.js no Host)
Ideal para desenvolvimento interativo e execução de testes:
* `DATABASE_URL="postgresql://questforge_admin:${PG_PASS}@localhost:5432/questforge?schema=public"`
* `MINIO_ENDPOINT="localhost"`
* `OLLAMA_BASE_URL="http://localhost:11434"`

#### Modo B: Execução 100% em Containers (Docker Compose Completo)
Ideal para homologação e implantação:
* O `docker-compose.yml` faz a resolução interna dos nomes de serviço automaticamente:
  * Backend conecta ao banco via `postgresql:5432`
  * Backend conecta ao MinIO via `minio:9000`
  * Backend conecta ao Ollama via `ollama:11434`
  * Frontend consome o Backend via `http://backend:3333`

---

## 4. Roteiro Passo a Passo de Implantação (Sprint 11)

### Passo 1 — Subir os Serviços de Infraestrutura
Inicie os serviços de armazenamento e inferência em background:

```bash
docker compose up -d postgresql minio ollama
```

Verifique a integridade e healthcheck dos containers:
```bash
docker compose ps
```
Aguarde até que `questforge-postgresql` e `questforge-minio` estejam com status `(healthy)`.

---

### Passo 2 — Aplicar Migrações do Banco de Dados (Prisma)
Com o PostgreSQL ativo e saudável:

```bash
# 1. Instalar dependências locais caso ainda não tenham sido instaladas
npm install

# 2. Gerar o Prisma Client tipado
npm run prisma:generate

# 3. Aplicar todas as 5 migrações SQL versionadas de forma idempotente e não interativa
npx prisma migrate deploy
```

> **Diferença Crucial de Comandos:**
> - `npm run prisma:migrate` (`prisma migrate dev`): Destinado exclusivamente ao desenvolvimento local para criação interativa de novas migrações.
> - `npx prisma migrate deploy`: Comando canônico de implantação/produção. Aplica as migrações já versionadas sem criar arquivos nem exigir confirmação no terminal.

---

### Passo 3 — Baixar e Validar o Modelo no Ollama
O daemon Ollama sobe leve e não realiza downloads de modelos automaticamente:

```bash
# Baixar o modelo de inferência configurado (ex: llama3.1:8b)
docker exec -it questforge-ollama ollama pull llama3.1:8b

# Confirmar que o modelo está presente localmente
docker exec -it questforge-ollama ollama list
```

---

### Passo 4 — Subir a Aplicação Completa (Backend + Frontend)
Inicie os containers da aplicação:

```bash
docker compose up --build -d backend frontend
```

Verifique o status de todos os 5 containers:
```bash
docker compose ps
```

---

### Passo 5 — Validação Unificada de Saúde (Health Check)
Consulte o endpoint de saúde do Backend:

```bash
curl -s http://localhost:3333/api/health | jq .
```

**Resposta esperada (HTTP 200 Healthy):**
```json
{
  "status": "healthy",
  "app": {
    "name": "QuestForge API",
    "status": "up",
    "environment": "development"
  },
  "dependencies": {
    "database": {
      "provider": "postgresql",
      "status": "up",
      "latencyMs": 4,
      "message": "Conectividade com PostgreSQL verificada com sucesso."
    },
    "environment": {
      "status": "configured",
      "missingOrInvalidCount": 0,
      "issues": []
    }
  }
}
```

#### Teste Manual de Chamadas Mutáveis com Autenticação e CSRF
Caso queira testar rotas autenticadas (`POST`, `PUT`, `DELETE`) via `curl`, os contratos reais exigem:
```bash
# 1. Login e captura do cookie de sessão 'qf_session'
curl -c cookies.txt -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: QuestForge-Client" \
  -d '{"email":"usuario@teste.com","password":"SenhaSegura123!"}'

# 2. Requisição mutável utilizando o cookie e o cabeçalho CSRF obrigatório
curl -b cookies.txt -X POST http://localhost:3333/api/questions \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: QuestForge-Client" \
  -d '{"statement":"Qual a capital do Brasil?","subject":"Geografia","type":"MULTIPLE_CHOICE"}'
```

---

### Passo 6 — Execução dos Testes de Integração Real
Execute a suíte completa de testes de integração com banco de dados real:

```bash
RUN_DB_INTEGRATION=true npm run test:integration
```

Todos os testes de integração (`database.integration.test.ts`, `auth.integration.test.ts`, etc.) devem passar sem nenhum teste ignorado.

---

## 5. Playbook de Diagnóstico e Resolução de Problemas (Troubleshooting)

### Problema 1: `database_health_check_failed` ou `DATABASE_URL` inacessível
* **Sintoma:** O health check retorna HTTP 503 com `database.status: "down"`.
* **Causa Comum:** Container do PostgreSQL não iniciou, porta 5432 ocupada no host por outro postgres nativo, ou credenciais divergentes no `.env`.
* **Solução:**
  ```bash
  docker logs questforge-postgresql
  # Verificar se a porta 5432 está em uso no host Debian:
  sudo ss -tulpn | grep 5432
  # Testar conectividade manual via psql:
  docker exec -it questforge-postgresql pg_isready -U questforge_admin -d questforge
  ```

### Problema 2: Diagnóstico do Healthcheck do MinIO (ACH-OPS-01)
* **Sintoma:** O container `questforge-minio` fica em status `starting` ou `unhealthy`.
* **Causa Comum:** Versões da imagem `minio/minio:latest` podem variar as ferramentas empacotadas (`curl` vs `mc`). O comando atual do `docker-compose.yml` testa dinamicamente `curl` na rota `/minio/health/live` e faz fallback para `mc ready local`.
* **Diagnóstico no Debian:**
  ```bash
  # Verificar qual ferramenta está presente na imagem MinIO baixada:
  docker exec questforge-minio which curl || docker exec questforge-minio which mc
  ```
* **Solução de Contorno (se nenhuma ferramenta estiver presente na imagem minimalista):**
  Se a imagem oficial baixada for ultra-minimalista sem `curl` nem `mc`, ajuste temporariamente a dependência no `docker-compose.yml` para `condition: service_started` em vez de `condition: service_healthy` para o MinIO, permitindo que a aplicação inicie enquanto o MinIO estiver em execução.

### Problema 3: Timeout na Inferência do Ollama (HTTP 504 / `AI_EXTRACTION_TIMEOUT`)
* **Sintoma:** O processamento de PDFs complexos ou análise educacional atinge o tempo limite.
* **Causa Comum:** Execução em CPU sem GPU dedicada no servidor Debian, exigindo mais tempo de inferência.
* **Solução:** Aumentar o tempo limite no `.env`:
  ```bash
  OLLAMA_TIMEOUT_MS="120000" # 2 minutos
  ```
  Reiniciar o container backend: `docker compose restart backend`.

### Problema 4: Falha de Permissão em Volumes Docker no Debian
* **Sintoma:** Erro de escrita em volumes (`EACCES` ou `permission denied`).
* **Causa Comum:** Permissões de usuário no diretório de dados do Docker (`/var/lib/docker/volumes`).
* **Solução:** Verificar o espaço em disco (`df -h`) e reiniciar o serviço Docker:
  ```bash
  sudo systemctl restart docker
  ```

---

## 6. Checklist de Validação Final da Implantação

- [ ] Sprints 10.3, 10.4 e 10.5 concluídas e auditadas com aprovação prévia.
- [ ] 5 containers em execução e saudáveis (`docker compose ps`).
- [ ] Migrações do Prisma aplicadas via `npx prisma migrate deploy` (`npx prisma migrate status`).
- [ ] Modelo Ollama baixado e listado (`docker exec -it questforge-ollama ollama list`).
- [ ] Endpoint `GET /api/health` respondendo HTTP 200 com status `healthy`.
- [ ] Bucket `questforge-documents` acessível no MinIO.
- [ ] Interface Web acessível no navegador (`http://<ip-servidor>:5173` ou `http://<ip-servidor>:3000`).
- [ ] Suíte de testes com integração real aprovada (`RUN_DB_INTEGRATION=true npm run test:integration`).
