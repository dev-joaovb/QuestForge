# QuestForge — Registro de Implementação da Sprint 10.3
## Diagnósticos Operacionais, Health Checks e Readiness com Mocks

* **Data do Registro:** 07 de novembro de 2026
* **Status:** Concluído com Sucesso e Aprovado
* **Sprint de Referência:** Sprint 10.3 (Diagnósticos e Readiness)
* **Sequência do Projeto:** Sprint 10.2.1 (Concluída) -> Sprint 10.3 (Atual) -> Sprint 10.4 (Pendente) -> Sprint 10.5 (Pendente) -> Sprint 11 (Pendente)

---

## 1. Visão Geral da Arquitetura de Diagnósticos

A Sprint 10.3 introduziu a separação formal entre **Liveness** (processo backend ativo e responsivo) e **Readiness** (prontidão operacional da aplicação para executar tarefas de negócio), preservando 100% de compatibilidade retroativa com o endpoint original de saúde (`GET /api/health`).

```text
                                  +---------------------------------------+
                                  |     Express API Diagnostics Router    |
                                  +---------------------------------------+
                                            │                 │
                        ┌───────────────────┴───┐         ┌───┴───────────────────┐
                        ▼                       ▼         ▼                       ▼
                  GET /api/live           GET /api/health  GET /api/ready  GET /api/health/ready
                  (Liveness Probe)        (General Health) (Readiness Probe)
                        │                       │                 │
                        │                       │                 ├── [Essenciais] (Hard)
                 [Processo Node]         [PostgreSQL DB]          │   ├── PostgreSQL (SELECT 1)
                 (Status HTTP 200)       [Environment]            │   └── Environment (Zod)
                                         (HTTP 200 / 503)         │
                                                                  └── [Opcionais] (Soft)
                                                                      ├── MinIO (checkStorage)
                                                                      ├── Ollama (checkAvailability)
                                                                      └── OCR (UnconfiguredOcr)
```

---

## 2. Contratos de Endpoints HTTP

### 2.1 Liveness Probe (`GET /api/live` e `GET /api/health/live`)
* **Propósito:** Validação rápida de processo ativo para orquestradores (Docker Compose, Kubernetes).
* **Comportamento:** Retorna imediatamente sem consultar dependências de rede ou banco de dados.
* **Status HTTP:** Sempre `200 OK`.
* **Payload de Resposta:**
  ```json
  {
    "status": "alive",
    "timestamp": "2026-11-07T14:22:36.000Z",
    "app": {
      "name": "QuestForge API",
      "status": "up",
      "environment": "development"
    }
  }
  ```

### 2.2 Health Check Canônico (`GET /api/health`)
* **Propósito:** Monitoramento geral e compatibilidade total com Sprints 0 a 10.2 e o healthcheck do `docker-compose.yml`.
* **Comportamento:** Consulta `checkDatabaseHealth()` e `validateEnv()`.
* **Status HTTP:**
  * `200 OK`: quando o PostgreSQL está `up`.
  * `503 Service Unavailable`: quando o PostgreSQL está `down` ou `unconfigured`.
* **Payload de Resposta:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-07T14:22:36.000Z",
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

### 2.3 Readiness Probe (`GET /api/ready` e `GET /api/health/ready`)
* **Propósito:** Diagnóstico de prontidão operacional antes de encaminhar tráfego de usuários.
* **Comportamento:** Executa concurrentemente verificações com timeout em todas as dependências, discriminando componentes **essenciais** e **opcionais**.
* **Status HTTP:**
  * `200 OK`: quando todas as dependências essenciais estão ativas (`ready: true`).
    * `status: "ready"`: dependências opcionais configuradas e disponíveis.
    * `status: "ready_degraded"`: dependências essenciais ativas, porém dependências opcionais (MinIO, Ollama) indisponíveis ou degradadas.
  * `503 Service Unavailable`: quando qualquer dependência essencial (PostgreSQL ou Environment) falhar (`ready: false`, `status: "not_ready"`).
* **Payload de Resposta Sanitizada (Exemplo: Todas Ativas):**
  ```json
  {
    "ready": true,
    "status": "ready",
    "timestamp": "2026-11-07T14:22:36.000Z",
    "app": {
      "name": "QuestForge API",
      "status": "up",
      "environment": "development"
    },
    "essential": {
      "database": {
        "provider": "postgresql",
        "status": "up",
        "latencyMs": 3,
        "message": "Conectividade com PostgreSQL verificada com sucesso."
      },
      "environment": {
        "status": "configured",
        "missingOrInvalidCount": 0,
        "issues": []
      }
    },
    "optional": {
      "storage": {
        "provider": "minio",
        "status": "up",
        "bucket": "questforge-documents",
        "message": "Conectividade com MinIO verificada com sucesso."
      },
      "ai": {
        "provider": "ollama",
        "status": "up",
        "model": "llama3.1:8b",
        "message": "Servidor Ollama ativo e modelo disponível."
      },
      "ocr": {
        "status": "unconfigured",
        "provider": "unconfigured",
        "message": "Processamento de OCR indisponível: nenhum provedor de OCR concreto está configurado no servidor."
      }
    }
  }
  ```

---

## 3. Política de Disponibilidade: Essenciais vs. Opcionais

| Componente | Categoria | Impacto de Indisponibilidade | Comportamento no `/api/ready` |
| :--- | :---: | :--- | :---: |
| **PostgreSQL** | **Essencial** | Paralisa toda a aplicação (autenticação, simulados, banco de questões, atividades, streak). | **HTTP 503 `not_ready`** (`ready: false`) |
| **Environment** | **Essencial** | Invalida sessões criptográficas (`SESSION_SECRET`) ou banco (`DATABASE_URL`). | **HTTP 503 `not_ready`** (`ready: false`) |
| **MinIO** | **Opcional** | Impede upload de novos PDFs, mas não afeta questões cadastradas, simulados ou estatísticas. | **HTTP 200 `ready_degraded`** (`ready: true`) |
| **Ollama** | **Opcional** | Impede extração automática de IA e diagnóstico pedagógico de IA, sem afetar simulados. | **HTTP 200 `ready_degraded`** (`ready: true`) |
| **OCR** | **Opcional** | Impede extração de PDFs digitalizados sem texto selecionável. | **HTTP 200 `ready`** (`ready: true`) |

---

## 4. Medidas de Segurança e Observabilidade

1. **Proteção Rigorosa contra Vazamento de Segredos:**
   * Nenhuma string de conexão (`DATABASE_URL`), senha de banco, segredo de sessão (`SESSION_SECRET`) ou chave S3 (`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) é exibida no JSON ou registrada nos logs.
2. **Proteção contra DoS e Timeouts Curtos:**
   * `checkDatabaseHealth` suporta temporizador dedicado (`timeoutMs`, padrão 3000ms via `Promise.race`) para evitar que conexões travadas esgotem recursos.
   * `checkAvailability` do Ollama opera com timeout curto dedicado de 2500ms via `AbortSignal`.
   * `checkStorageHealth` do MinIO opera sem gravação ou criação de buckets, apenas verificando existência com cliente isolado.
3. **Ausência de Stack Traces:** Erros internos são mascarados como mensagens padronizadas em português, com logging estruturado interno no backend.

---

## 5. Limitações dos Mocks e Verificações Pendentes para a Sprint 11

A aprovação da Sprint 10.3 baseia-se em **testes herméticos com injeção controlada de dependências (mocks)**.

> **ALERTA ARQUITETURAL:**  
> A aprovação dos testes unitários desta sprint atesta a robustez do código e a correção dos contratos HTTP, mas **não substitui** a validação com infraestrutura real no Debian (Sprint 11).

As seguintes validações permanecem pendentes e devem ser conduzidas na Sprint 11:
1. Conectividade real com PostgreSQL via socket/TCP na porta 5432 do container `questforge-postgresql`.
2. Conectividade real S3 com `questforge-minio` na porta 9000 e confirmação do bucket `questforge-documents`.
3. Verificação de tags reais no `questforge-ollama` na porta 11434 com o modelo `llama3.1:8b` baixado.
4. Latência em hardware Debian e confirmação do tempo limite de inferência em CPU.

---

## 6. Cobertura de Testes Automatizados

A suíte de testes unitários herméticos em `backend/tests/health.unit.test.ts` conta com **25 testes**, cobrindo exaustivamente todos os cenários da Sprint 10.3 e o hardening da Sprint 10.3.1:
1. Backend ativo (`/api/live` e `/api/health/live`).
2. PostgreSQL disponível via mock (`/api/ready`).
3. PostgreSQL indisponível (`/api/ready` -> 503 `not_ready`).
4. PostgreSQL com timeout tratado (`checkDatabaseHealth` e `/api/ready` -> 503).
5. MinIO não configurado (`/api/ready` -> 200 `ready`).
6. MinIO configurado e indisponível (`/api/ready` -> 200 `ready_degraded`).
7. Ollama indisponível (`/api/ready` -> 200 `ready_degraded`).
8. Modelo Ollama ausente no servidor (`/api/ready` -> 200 `ready_degraded`).
9. OCR não configurado informado sem erro global (`/api/ready` -> 200 `ready`).
10. Falha simultânea de todas as dependências opcionais mantendo prontidão essencial (`/api/ready` -> 200 `ready_degraded`).
11. Ausência estrita de vazamento de credenciais no payload.
12. Preservação integral do contrato original de `/api/health`.
13. Validação do contrato estrutural de `/api/ready`.
14. Isolamento de exceção inesperada em checker opcional (storage) sem causar HTTP 500.
15. Isolamento de exceção inesperada em checker essencial (database) sem causar HTTP 500.
16. MinIO com Promise pendente indefinida tratado via timeout configurável (30ms).
17. MinIO com timeout tratado em `checkStorageHealth` quando cliente rejeita tardiamente.
18. Falha catastrófica simultânea de todos os checkers tratada com HTTP 503 e payload higienizado.
19. Preservação dos códigos HTTP de todos os 5 endpoints em cenários saudáveis e degradados.
20. Ausência estrita de vazamento de credenciais em mensagens de erro rejeitadas com segredos.
21. Reutilização de verificação em andamento (*in-flight request coalescing*) para o mesmo cliente Prisma.
22. Preservação do contrato histórico de `/api/health` diante de exceções não capturadas no banco.

---

## 7. Hardening da Sprint 10.3.1 — Resolução dos Achados da Auditoria

### 7.1 Isolamento de Falhas Assíncronas (ACH-HEALTH-02)
* **Abordagem Adotada:** Orquestração com `Promise.allSettled` combinada com wrappers defensivos individuais em cada função de verificação (`runDbCheck`, `runStorageCheck`, `runAiCheck`, `runOcrCheck`).
* **Comportamento Garantido:**
  * Rejeições inesperadas em checkers opcionais (MinIO, Ollama, OCR) são convertidas em status `down` ou `unconfigured`, retornando `ready_degraded` (HTTP 200) se o núcleo essencial estiver são.
  * Rejeições inesperadas em checkers essenciais (PostgreSQL, Environment) resultam em status `not_ready` (HTTP 503) com estrutura JSON padronizada.
  * O controller possui bloco `catch` de último nível retornando JSON formatado (HTTP 503), eliminando qualquer risco de resposta genérica HTML ou crash HTTP 500 do Express.

### 7.2 Timeout Explícito do MinIO (ACH-HEALTH-03)
* **Abordagem Adotada:**
  * O método `MinioObjectStorageService.checkStorageHealth({ timeoutMs = 2500 })` opera com temporizador via `Promise.race` e limpeza garantida (`clearTimeout`) em bloco `finally`.
  * O controller `createReadyController` também encapsula a verificação de armazenamento com limite de tempo defensivo (`storageTimeoutMs`, padrão 2500ms), prevenindo travamento do readiness mesmo se uma dependência injetada for uma Promise que nunca resolve (*hanging promise*).
* **Limitação Técnica de Cancelamento:**
  * O cliente MinIO oficial (`minio` v8) não oferece suporte a `AbortSignal` no método `bucketExists`.
  * Portanto, o `Promise.race` impõe a liberação rápida do endpoint HTTP na camada da aplicação, mas a operação de socket TCP subjacente continua ativa até ser concluída ou encerrada pelo sistema operacional.

### 7.3 Concorrência no PostgreSQL e Limitações de Cancelamento SQL (ACH-HEALTH-01)
* **Mitigação Implementada:** *In-flight Request Coalescing* seguro via `WeakMap<object, Promise<DatabaseHealthStatus>>`.
  * Requisições concorrentes disparadas durante a execução de uma checagem em andamento para a mesma instância do cliente Prisma reutilizam a mesma Promise pendente.
  * Isso impede avalanche de queries `SELECT 1` (*stampede*) no pool de conexões do Prisma.
  * Ao término da execução, o registro no `WeakMap` é imediatamente excluído via bloco `finally`, garantindo que não haja cache estático ou dados desatualizados em chamadas subsequentes.
  * O uso de `WeakMap` garante que diferentes instâncias (e mocks de testes) fiquem estritamente isoladas, sem risco de vazamento de memória ou contaminação cruzada.
* **Limitação Técnica de Cancelamento SQL:**
  * O `Promise.race` no Node.js encerra a espera do endpoint, mas **não cancela** a query SQL em execução no motor Prisma ou no PostgreSQL.
  * A mitigação por coalescência reduz substancialmente o impacto de rajadas de probes, mas o cancelamento no nível do banco requer cancelamento de socket ou `statement_timeout` configurado no PostgreSQL.

### 7.4 Riscos Operacionais Reservados para a Sprint 11
1. **Comportamento Real do MinIO com Docker Compose:** Validar a latência do probe `bucketExists` contra o container `questforge-minio`.
2. **Tempo de Resposta do Ollama Real:** Testar o tempo de resposta do endpoint `/api/tags` sob carga com o container `questforge-ollama`.
3. **Esgotamento Extremo do Connection Pool Prisma:** Validar o comportamento sob contenção massiva de banco real com concorrência alta.
4. **Configuração de `statement_timeout` no PostgreSQL:** Avaliar na Sprint 11 a definição de timeout de query no nível de conexão PostgreSQL para garantir o encerramento do lado do servidor de queries demoradas.
