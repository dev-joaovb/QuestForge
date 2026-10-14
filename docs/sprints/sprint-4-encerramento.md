# QuestForge — Registro Formal de Encerramento da Sprint 4

* **Data do Registro:** 14 de outubro de 2026
* **Status:** Concluída com ressalvas operacionais de ambiente
* **Documento de Referência:** `docs/sprints/sprint-4-encerramento.md`

---

## 1. Objetivo da Sprint 4

O objetivo central da Sprint 4 foi a implementação ponta a ponta do pipeline de extração inteligente de questões e gabaritos a partir de documentos PDF elegíveis, utilizando inteligência artificial local (Ollama) acoplada de forma desacoplada, tipada e com rígidos controles de integridade, segurança e isolamento por usuário.

O pipeline foi projetado para retornar rascunhos estruturados para revisão humana obrigatória, garantindo que nenhuma questão seja automaticamente persistida no Banco de Questões sem validação explícita de um operador.

---

## 2. Escopo Entregue por Etapa

### Etapa 4.1 — Contratos de Domínio, Validações Estritas e Tratamento Seguro da IA
* **Tipos de Domínio (`backend/src/types/ai-extraction.types.ts`):** Definição das interfaces `ExtractedQuestionDraft`, `ExtractedAlternativeDraft`, `ExtractedExamMetadataDraft`, `AnswerKeyEntryDraft`, `ValidatedAiQuestionExtractionPayload` e `AiQuestionExtractionResult`.
* **Preservação de Revisão Humana:** Toda questão extraída recebe compulsoriamente `status: 'NEEDS_REVIEW'` (ou `'DRAFT'`) e `requiresHumanReview: true`. Campos ausentes ou vazios (`subject`, `correctAnswer`, `difficulty`, `explanation`, `board`, `year`) são preservados honestamente como `null` (nunca inventados ou alucinados), gerando alertas em `reviewWarnings`.
* **Validações Zod e Sanitização (`backend/src/validators/ai-extraction.validator.ts`):**
  * `parseRawAiJsonOutput`: faz o parse seguro aceitando JSON puro ou blocos delimitados por markdown (````json ... ````), com teto prévio de caracteres (`DEFAULT_MAX_RAW_AI_JSON_CHARS = 2_000_000`) para mitigar sobrecarga de memória.
  * `validateAndNormalizeAiExtractionPayload`: validação estrita com `.strict()`, proibindo campos não autorizados; normalização de letras de alternativas (`A` a `J`); reconciliação cruzada entre alternativas, gabarito da questão e tabela de gabarito (`answerKey`); validação de questões `TRUE_FALSE` e `MULTIPLE_CHOICE`.
  * Conversão segura via `toCreateQuestionInputFromDraft`: impede a transformação para o modelo `Question` se a disciplina (`subject`) não tiver sido informada ou se os critérios de persistência forem violados.
* **Serviço Desacoplado (`backend/src/services/ai-extraction.service.ts`):**
  * Interface `IAiQuestionExtractionService` com implementações `ConfigurableAiQuestionExtractionService` e `UnconfiguredAiQuestionExtractionService`.
  * Fábrica `createAiQuestionExtractionService`.
  * Construção de prompt mitigada (`buildQuestionExtractionPrompts`): instrui explicitamente o modelo de que o texto do PDF é um dado externo **não confiável**, encapsulando-o via `JSON.stringify` dentro de `untrustedDocumentPayload` para prevenir ataques de injeção de instruções indiretas.

### Etapa 4.2 — Adaptador de Comunicação HTTP com Ollama
* **Implementação Concreta (`backend/src/services/ollama-adapter.service.ts`):**
  * Classe **`OllamaChatAdapter`** e função fábrica **`createOllamaCompletionFn`**.
  * Comunicação com o endpoint `POST /api/chat` com `stream: false`, `format: 'json'` e propagação de `AbortSignal`.
  * **Validação em 3 Níveis:**
    1. *Nível 1 (Transporte HTTP):* Verificação do status code HTTP (502, 503, 504, 404).
    2. *Nível 2 (Envelope JSON):* Validação estrutural do corpo retornado pelo daemon Ollama (`response.json()`).
    3. *Nível 3 (Conteúdo Textual):* Verificação de presença e integridade de `message.content`.
  * **Tratamento e Mapeamento de Erros:**
    * Falha de conexão de rede ou modelo não encontrado (404 / *"model not found"*): `AI_EXTRACTION_UNAVAILABLE` (HTTP 503).
    * Timeout de comunicação ou abort de sinal: `AI_EXTRACTION_TIMEOUT` (HTTP 504).
    * Falha interna reportada pelo Ollama (HTTP 500, etc.): `AI_EXTRACTION_FAILED` (HTTP 502).
    * Envelope não-JSON, malformado ou `content` vazio: `AI_EXTRACTION_INVALID_OUTPUT` (HTTP 422).
  * **Verificação de Disponibilidade:** Método `checkAvailability` que consulta `GET /api/tags` com timeout curto dedicado para verificar conectividade e confirmar se o modelo configurado está instalado localmente.
  * **Proteção contra Vazamento de Dados:** Logs estruturados no logger com higienização de chaves sensíveis e sanitização de URLs para não registrar texto integral de PDFs nem prompts confidenciais.

### Etapa 4.3 — Endpoint Autenticado de Extração por IA
* **Validação de Entrada (`backend/src/validators/pdf-document.validator.ts`):**
  * Schema estrito `extractQuestionsBodySchema` via `.strict()`.
  * Aceita exclusivamente parâmetros contextuais opcionais: `defaultSubject`, `defaultBoard`, `defaultExamTitle`, `defaultYear` e `maxQuestions`.
  * **Rejeição de `timeoutMs`:** Rejeitado imediatamente com HTTP 400 (`PDF_VALIDATION_ERROR`). O cliente é proibido de definir o tempo limite da requisição; o servidor impõe `OLLAMA_TIMEOUT_MS`.
  * **Limite de Questões:** `maxQuestions` deve respeitar o valor de ambiente `AI_MAX_QUESTIONS_PER_DOCUMENT` e o teto absoluto `ABSOLUTE_MAX_EXTRACTED_QUESTIONS` (500).
* **Recuperação Segura do Documento (`backend/src/services/pdf-document.service.ts`):**
  * Método `getDocumentTextForAiExtraction(actorUserId, documentId)`.
  * Valida existência do documento (`DOCUMENT_NOT_FOUND`, HTTP 404).
  * Valida proprietário: rejeita acesso a documentos de terceiros com `DOCUMENT_FORBIDDEN` (HTTP 403).
  * Valida elegibilidade de status: rejeita documentos em `PROCESSING` ou `UPLOADED` (HTTP 409), documentos com pendência de OCR (`DOCUMENT_NEEDS_OCR`, HTTP 422), documentos com falha anterior (`PDF_EXTRACTION_FAILED`, HTTP 422) e documentos sem texto extraído utilizável (`DOCUMENT_NO_TEXT`, HTTP 422).
  * Omite campos internos de storage (`objectKey`, `storageBucket`) no retorno.
* **Controller e Roteamento (`backend/src/controllers/pdf-document.controller.ts` e `backend/src/routes/pdf-document.routes.ts`):**
  * Endpoint: **`POST /api/documents/:id/extract`**.
  * Proteção obrigatória com autenticação via sessão (`requireAuth`).
  * Proteção CSRF obrigatória via `createCsrfProtection` montado globalmente em `/api` (`app.ts`), exigindo o cabeçalho `X-CSRF-Token: 1`.
  * Gerenciamento seguro de ciclo de vida da requisição: registro e remoção de listener `close` no `finally`, prevenindo vazamento de listeners e evitando aborto acidental de inferência.
  * Formato padronizado de resposta HTTP 200: **`{ extraction: extractionResult }`**.
  * Ausência de persistência: as questões extraídas são retornadas estritamente no corpo da resposta HTTP. Nenhuma linha é inserida nas tabelas `Question` ou `Alternative`.

---

## 3. Configurações de Ambiente e Limites Operacionais

Conforme verificado em `backend/src/config/env.ts` e no serviço de extração:

| Variável / Parâmetro | Valor Padrão | Limite / Regra | Comportamento na Ausência |
| :--- | :---: | :---: | :--- |
| **`OLLAMA_BASE_URL`** | `http://localhost:11434` | URL HTTP válida | Usa o valor padrão ou `http://ollama:11434` no Docker Compose. |
| **`OLLAMA_MODEL`** | *(nenhum)* | String não vazia | Se ausente ou `"SEU_MODELO_AQUI"`, o serviço opera no modo `UnconfiguredAiQuestionExtractionService`, respondendo honestamente com **HTTP 503 `AI_EXTRACTION_UNAVAILABLE`**. Não há modelo fictício de fallback em produção. |
| **`OLLAMA_TIMEOUT_MS`** | `45000` (45s) | Máximo de `300000` (5 min) | Utiliza o timeout padrão do servidor. O cliente HTTP não pode sobrescrever este parâmetro. |
| **`AI_MAX_QUESTIONS_PER_DOCUMENT`** | `100` | Máximo de `500` | Se não configurado, adota 100 com teto absoluto de 500. |

---

## 4. Testes e Evidências de Validação

### 4.1 Resultado da Suíte Global Reportada
O encerramento da Sprint 4 sustenta-se sobre o último relatório de execução da suíte completa de testes automatizados do QuestForge:

* **Total de testes aprovados:** 177
* **Total de testes ignorados (skipped):** 4 *(testes de integração dependentes de banco de dados ativo sem container)*
* **Total de falhas:** 0
* **Arquivos de teste com status aprovado:** 19

### 4.2 Casos de Teste Declarados Identificados por Inspeção de Código
A inspeção estrita dos arquivos identificou **66 casos de teste declarados** dedicados especificamente aos contratos, adaptações e endpoints da Sprint 4:

1. **`backend/tests/ai-extraction.test.ts` (20 casos declarados):**
   * Cobertura da Etapa 4.1: normalização de letras, parse seguro de saídas brutas JSON/Markdown, sanitização de limites de entrada e saída, rejeição de `.strict()`, reconciliação com `answerKey`, proteção contra injeção de prompt e tolerância a `completionFn` assíncrona.
2. **`backend/tests/ollama-adapter.test.ts` (12 casos declarados):**
   * Cobertura da Etapa 4.2: construção de requisições `POST /api/chat`, validação em 3 níveis, isolamento de logs sem vazamento de prompts ou dados do PDF, propagação de `AbortSignal`, mapeamento de erros HTTP/rede e health-check `/api/tags`.
3. **`backend/tests/pdf-document.validator.test.ts` (10 casos declarados da Sprint 4):**
   * Cobertura da Etapa 4.3 (Passo 1): validação estrita de `extractQuestionsBodySchema`, rejeição de `timeoutMs`, validação de limites contextuais e códigos estendidos de erro.
4. **`backend/tests/pdf-document.service.test.ts` (12 casos declarados da Sprint 4, em 22 no total):**
   * Cobertura da Etapa 4.3 (Passo 2): bloco `Recuperação segura do texto do documento para IA`, validação de propriedade (`DOCUMENT_FORBIDDEN` 403), documento inexistente (404), bloqueio por estado (`PROCESSING`, `NEEDS_OCR`, `FAILED`), validação de conteúdo textual e omissão de credenciais de storage.
5. **`backend/tests/pdf-document.routes.test.ts` (12 casos declarados da Sprint 4, em 20 no total):**
   * Cobertura da Etapa 4.3 (Passo 3): bloco `Endpoint POST /api/documents/:id/extract`, autenticação, CSRF (`X-CSRF-Token: 1`), rejeição de parâmetros proibidos, isolamento multi-tenant (403), estados incompatíveis, envelope de retorno `{ extraction: ... }`, tratamento de indisponibilidade da IA (503/504) e gerenciamento de listeners de desconexão.

*(Nota: Os 18 testes restantes distribuídos em `pdf-document.service.test.ts` [10 testes] e `pdf-document.routes.test.ts` [8 testes] pertencem às funcionalidades de upload, paginação e exclusão desenvolvidas em sprints anteriores).*

---

## 5. Critérios de Aceite e Status de Atendimento

| Critério de Aceite | Status | Evidência / Mecanismo de Validação |
| :--- | :---: | :--- |
| Endpoint `POST /api/documents/:id/extract` implementado e registrado no roteador correto | **Atendido** | Roteador montado via `createPdfDocumentRouter` sob `/api/documents/:id/extract`. |
| Exigência de autenticação válida e isolamento multi-tenant | **Atendido** | `requireAuth` e validação de `existing.userId !== actorUserId` retornando HTTP 403 `DOCUMENT_FORBIDDEN`. |
| Proteção contra ataques CSRF | **Atendido** | Middleware `createCsrfProtection` no prefixo `/api` exigindo `X-CSRF-Token: 1`. |
| Validação estrita de entrada e proibição de `timeoutMs` pelo cliente | **Atendido** | Schema `extractQuestionsBodySchema` com `.strict()`, rejeitando propriedades não autorizadas com HTTP 400. |
| Injeção completa de dependências em todas as camadas | **Atendido** | `createAiQuestionExtractionService` injetado no controller, rotas e `createApp`. |
| Rascunhos de questões retornados no envelope `{ extraction: ... }` sem persistência no banco | **Atendido** | Controller responde com `{ extraction: extractionResult }`; nenhuma operação de escrita em `Question` ou `Alternative`. |
| Timeout estrito com cancelamento e descarte de processamento | **Atendido** | Propagação de `AbortSignal` com temporizador baseado em `OLLAMA_TIMEOUT_MS`. |
| Limpeza correta de listeners de desconexão HTTP | **Atendido** | Listener `close` removido no bloco `finally` via `req.off('close', onRequestClose)`. |
| Validação operacional com instâncias reais de PostgreSQL, MinIO e Ollama | **Pendente (Ressalva)** | A infraestrutura externa com containers ativos e modelos baixados requer validação operacional em ambiente de homologação/staging. |

---

## 6. Pendências Operacionais e Diretrizes de Implantação

As seguintes pendências são de natureza **operacional e de infraestrutura**, devendo ser executadas antes de disponibilizar o recurso para usuários finais:

1. **Subida dos Containers do Docker Compose:**
   * Executar os serviços reais via `docker-compose.yml`:
     * Serviço **`postgresql`** (container `questforge-postgresql`)
     * Serviço **`minio`** (container `questforge-minio`)
     * Serviço **`ollama`** (container `questforge-ollama`)
     * Serviços **`backend`** e **`frontend`**
2. **Aplicação de Migrações do Banco de Dados:**
   * Executar o comando padronizado do projeto:
     ```bash
     npm run prisma:migrate
     ```
3. **Carga do Modelo no Daemon Ollama:**
   * Baixar o modelo de inferência configurado no arquivo `.env` dentro do container Ollama:
     ```bash
     docker exec -it questforge-ollama ollama pull <OLLAMA_MODEL>
     ```
4. **Execução da Suíte de Testes de Integração:**
   * Executar os testes que demandam banco de dados real:
     ```bash
     npm run test:integration
     ```
   * *(Valida `database.integration.test.ts` e `auth.integration.test.ts`).*
5. **Avaliação de Latência e Hardware:**
   * Medir o tempo de resposta da inferência em PDFs extensos com o hardware real para aferir se o timeout padrão de 45 segundos necessita de ajuste no ambiente de produção.

---

## 7. Riscos Mapeados

* **Latência de Inferência Local:** Modelos de 7B/8B executados em CPU podem exceder o tempo limite padrão de 45 segundos em documentos extensos ou máquinas sem aceleração por GPU. *Mitigação:* `OLLAMA_TIMEOUT_MS` configurável no ambiente (teto de até 300 segundos).
* **Ausência do Modelo em Produção:** Se `OLLAMA_MODEL` não for configurado ou o modelo não estiver baixado, as chamadas falharão de forma segura com HTTP 503 `AI_EXTRACTION_UNAVAILABLE` sem gerar falhas silenciosas.

---

## 8. Veredito

**Sprint 4 encerrada com sucesso nos níveis de arquitetura, implementação e testes automatizados.**

Todos os contratos de tipos, schemas Zod, adaptadores de comunicação, serviços desacoplados, verificações de segurança, isolamento multi-tenant e endpoints foram concluídos e validados no nível de código. 

A transição para a próxima sprint (Sprint 5) está formalmente autorizada sob o ponto de vista de engenharia de software, mantendo-se a ressalva de que a homologação operacional com containers reais (PostgreSQL, MinIO e Ollama) deve ser realizada assim que o ambiente de execução estiver provisionado.
