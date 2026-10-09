# QuestForge

Plataforma full-stack de engenharia de estudos e preparação para concursos públicos, vestibulares, certificações e exames, integrando processamento de documentos PDF, OCR, estruturação assistida por IA local (Ollama), validação estrita de dados, simulados cronometrados e análise de desempenho persistida em PostgreSQL.

---

## 1. Arquitetura do Sistema

```text
React + TypeScript + Vite (Frontend)
          │
          │ HTTP / Cookies HttpOnly
          ▼
Node.js + Express + TypeScript (Backend)
          │
          ├── Controllers / Services / Repositories
          ├── Validação (Zod)
          ├── Processamento PDF / OCR (MinIO)
          ├── IA Local (AIProvider / OllamaProvider)
          ▼
       Prisma ORM
          │
          ▼
     PostgreSQL
```

### Princípios Arquiteturais
- **PostgreSQL como Fonte Oficial:** Nenhuma regra de negócio ou dado de usuário (contas, provas, questões, simulados, respostas, streak, histórico) é persistido em `localStorage`, `sessionStorage` ou mocks em memória.
- **Segurança de Credenciais:** Nenhum segredo ou senha é versionado no repositório. Todas as credenciais devem ser preenchidas localmente em `.env` a partir do modelo documentado em `.env.example`.
- **Observabilidade e Health Check Real:** O endpoint `GET /api/health` verifica a conectividade real com o PostgreSQL (`SELECT 1` via Prisma) e separa claramente o estado da aplicação HTTP (`app`) do estado das dependências (`dependencies.database` e `dependencies.environment`).

---

## 2. Pré-requisitos

- **Node.js** >= 22.x e **npm**
- **Docker** e **Docker Compose** (para execução containerizada de PostgreSQL, MinIO, Ollama, Backend e Frontend) ou instância PostgreSQL 16+ acessível localmente.

---

## 3. Configuração do Ambiente (`.env`)

1. Copie o arquivo `.env.example` para `.env` na raiz do projeto:

```bash
cp .env.example .env
```

2. Preencha manualmente os valores obrigatórios no seu `.env`:
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: Credenciais do banco PostgreSQL.
   - `DATABASE_URL`: URL de conexão com o PostgreSQL (ex.: `postgresql://SEU_USUARIO:SUA_SENHA@localhost:5432/questforge?schema=public`).
   - `SESSION_SECRET`: Chave aleatória com **no mínimo 32 caracteres** para assinatura de sessões seguras.
   - `MINIO_ACCESS_KEY` e `MINIO_SECRET_KEY`: Credenciais para o armazenamento de objetos MinIO.
   - `OLLAMA_BASE_URL` e `OLLAMA_MODEL`: Endereço do serviço Ollama e nome do modelo local (opcional durante a validação da fundação da Sprint 0).

---

## 4. Inicialização com Docker Compose

O arquivo `docker-compose.yml` orquestra os cinco serviços da arquitetura na rede interna `questforge-net`:

| Serviço | Nome DNS na Rede Docker | Porta Padrão (Host) | Descrição |
| :--- | :--- | :--- | :--- |
| `postgresql` | `postgresql` | `5432` | Banco de dados relacional PostgreSQL 16 com healthcheck `pg_isready` |
| `minio` | `minio` | `9000` / `9001` | Object Storage para PDFs de provas e gabaritos |
| `ollama` | `ollama` | `11434` | Runtime para execução de LLMs locais |
| `backend` | `backend` | `3333` | API Node.js + Express + Prisma conectada a `postgresql`, `minio` e `ollama` |
| `frontend` | `frontend` | `5173` | Interface React + Vite com proxy `/api` apontando para `http://backend:3333` |

### Subindo apenas a infraestrutura de apoio (desenvolvimento híbrido no host)
```bash
docker compose up -d postgresql minio ollama
```

### Subindo toda a stack em containers
```bash
docker compose up --build -d
```

> **Nota sobre o Ollama:** O container `ollama` sobe sem realizar o download automático de modelos pesados (que possuem vários gigabytes), permitindo validar toda a fundação básica rapidamente. Quando desejar testar extração ou análise via IA local nas Sprints correspondentes, execute manualmente:
> ```bash
> docker exec -it questforge-ollama ollama pull <nome-do-modelo>
> ```

---

## 5. Banco de Dados e Migrations (Prisma)

Com o PostgreSQL ativo e a variável `DATABASE_URL` configurada no `.env`:

```bash
# 1. Validar o schema do Prisma
npm run prisma:validate

# 2. Gerar o Prisma Client tipado
npm run prisma:generate

# 3. Executar e versionar migrations no PostgreSQL
npm run prisma:migrate
```

---

## 6. Execução em Desenvolvimento

Para iniciar o servidor unificado (Express + Vite Middleware na porta `3000`):

```bash
npm run dev
```

- **Aplicação Web:** `http://localhost:3000`
- **Health Check da API:** `http://localhost:3000/api/health`

---

## 7. Testes Automatizados e Verificação de Qualidade

O projeto separa estritamente **testes unitários** de **testes de integração real**:

### 7.1 Verificação de Tipos TypeScript e Build
```bash
npm run lint
npm run build
```

### 7.2 Testes Unitários (não exigem serviços externos ativos)
Validam regras de validação de ambiente, higienização de logs, contrato HTTP do `GET /api/health` (estados `up`, `down`, `unconfigured` com injeção controlada) e integridade da configuração Docker:
```bash
npm run test:unit
```

### 7.3 Testes de Integração com PostgreSQL Real (`database.integration.test.ts`)
Exercitam o `PrismaClient` e o endpoint `GET /api/health` **sem mocks**:
```bash
# Executa a suíte de integração (testes que exigem banco ativo ficam marcados como skipped se RUN_DB_INTEGRATION != true)
npm run test:integration
```

Para executar e validar o teste de conectividade real contra uma instância PostgreSQL ativa:
```bash
RUN_DB_INTEGRATION=true npm run test:integration
```

> **Critério de Validação:** A conectividade real com o PostgreSQL só é considerada validada quando `RUN_DB_INTEGRATION=true npm run test:integration` executa o teste `[REQUER POSTGRESQL ATIVO]` sem `skip` e retorna `status: "up"` (`HTTP 200`).
