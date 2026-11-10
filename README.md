# QuestForge

> Plataforma fullstack moderna para engenharia de estudos, simulados cronometrados de concursos e exames, processamento de provas em PDF e diagnósticos pedagógicos orientados por dados.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Vitest](https://img.shields.io/badge/Tests-864%20passed-22c55e?logo=vitest&logoColor=white)

---

## Sobre o Projeto

Preparar-se para concursos públicos e vestibulares de alta concorrência exige disciplina, resolução intensiva de questões e análise fria de desempenho. No entanto, candidatos frequentemente enfrentam desafios como:

- Provas e editais dispersos em arquivos PDF desestruturados.
- Dificuldade para simular condições reais de prova com cronômetro e gabarito protegido.
- Distorções nas estatísticas de estudo causadas por questões anuladas pelas bancas examinadoras.
- Falta de métricas pedagógicas acionáveis que indiquem claramente pontos fortes e fracos.

O **QuestForge** foi projetado para resolver esses problemas por meio de uma arquitetura limpa, estrita e centrada em dados, garantindo persistência relacional confiável no PostgreSQL, armazenamento privado de documentos no MinIO e geração de diagnósticos com inteligência artificial local.

---

## Principais Funcionalidades

### 🔐 Gestão de Contas e Segurança HTTP
- Autenticação com senhas criptografadas via `bcrypt`.
- Sessões protegidas por cookies `HttpOnly`, `SameSite=Lax` e escopo restrito (`qf_session`).
- Proteção nativa contra Cross-Site Request Forgery (CSRF) com verificação do cabeçalho customizado `X-Requested-With: QuestForge-Client` e validação estrita de origem.
- Isolamento multi-inquilino de dados (prevenção rigorosa contra vulnerabilidades de IDOR).

### 📄 Upload e Processamento de Documentos PDF
- Upload seguro com validação de assinatura binária (*magic bytes* `%PDF-1.4`) e limite configurável de tamanho.
- Armazenamento em repositório privado S3-compatible (MinIO), isolando arquivos por usuário (`users/{userId}/pdf/{docId}.pdf`).
- Extração de texto digital integrada diretamente no fluxo via biblioteca `pdfjs-dist`.
- Classificação inteligente: documentos escaneados (sem camada de texto) são catalogados com o status `NEEDS_OCR`.

### 📝 Banco de Questões e Gabaritos Oficiais
- Cadastro completo de enunciados, disciplinas, tópicos, níveis de dificuldade e alternativas (A a E).
- Política de proteção de gabarito: correções e explicações ficam restritas durante a prova e só são liberadas após o término.
- Gerenciamento e versionamento de gabaritos oficiais preliminares e definitivos publicados por bancas examinadoras, com suporte a anulações e alterações de alternativas.

### ⏱️ Motor de Simulados Cronometrados
- Geração de simulados customizados por disciplina, quantidade de questões e tempo limite.
- Ciclo de vida formal de prova: `CREATED` $\to$ `IN_PROGRESS` $\to$ `COMPLETED`.
- Mecanismo anti-fraude: gabaritos oficiais e status de acerto permanecem inacessíveis na aba de rede do navegador durante a resolução.
- Bloqueio de submissão e alteração de respostas após a conclusão oficial do simulado (HTTP 409 Conflict).

### 📊 Separação Rigorosa: Pontuação Oficial vs. Diagnóstico Pedagógico
- **Pontuação Oficial do Concurso:** Aplica as regras de edital das bancas, atribuindo ponto para questões anuladas (`officialTotalPoints`).
- **Diagnóstico Pedagógico Demonstrado:** Exclui estritamente questões anuladas (`isAnnulled === true` ou `null`) do cálculo de taxa de acerto e proficiência por tópico, evitando diagnósticos inflados artificialmente.

### 🔥 Hábitos de Estudo e Sistema de Streak
- Monitoramento contínuo de atividades de estudo com cálculo diário em UTC.
- Idempotência: múltiplas atividades no mesmo dia civil mantêm a sequência sem contagens duplicadas.
- Registro automático do recorde histórico (`longestStreak`) e recuperação de sequências perdidas.

### 🤖 IA Educacional com Fallback Determinístico
- Emissão de pareceres pedagógicos consultivos via modelos locais (Ollama, como `llama3.2:1b` ou `llama3.1:8b`).
- **Defesa em Profundidade:** Sanitização léxica na entrada, validação esquemática estrita com schemas Zod (`.parse()`) e checagem cruzada quantitativa e semântica na saída.
- **Continuidade Operacional:** Caso o servidor de IA esteja indisponível, offline ou com sobrecarga, o sistema aciona automaticamente o fallback determinístico offline (`source: 'DETERMINISTIC_FALLBACK'`), retornando HTTP 200 sem interromper o estudo do aluno.

---

## Tecnologias Utilizadas

| Camada | Tecnologias |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, React Router DOM v7 |
| **Backend** | Node.js 20+, Express, TypeScript (`tsx`), Zod (validação de schemas), Helmet, Cookie-Parser |
| **Persistência Relacional** | PostgreSQL 16, Prisma ORM v6 (13 modelos relacionais, 11 enums tipados, 5 migrações) |
| **Object Storage** | MinIO (protocolo S3 compatível com AWS SDK v3) |
| **Inteligência Artificial** | Ollama API HTTP local (`POST /api/chat`) |
| **Testes e Qualidade** | Vitest, Supertest, Testing Library, TypeScript Compiler (`tsc --noEmit`) |
| **Infraestrutura** | Docker Compose v2, Dockerfiles multi-stage para Backend e Frontend |

---

## Arquitetura do Sistema

O QuestForge adota uma arquitetura em camadas com baixo acoplamento e separação explícita entre lógica de negócios, transporte HTTP e armazenamento:

```text
┌────────────────────────────────────────────────────────┐
│                   Frontend (React SPA)                 │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / Cookies HttpOnly
┌───────────────────────────▼────────────────────────────┐
│                    API REST (Express)                  │
│                                                        │
│  [Middlewares] CSRF • Auth • Rate-Limit • ErrorHandler │
│  [Rotas]       Auth • Docs • Questions • Simulations   │
│  [Serviços]    Domain Logic • Analytics • IA Client    │
└───────────┬─────────────────┬───────────────────┬──────┘
            │                 │                   │
            ▼                 ▼                   ▼
    ┌───────────────┐ ┌───────────────┐   ┌───────────────┐
    │  Prisma ORM   │ │  MinIO Client │   │ Ollama Client │
    └───────┬───────┘ └───────┬───────┘   └───────┬───────┘
            ▼                 ▼                   ▼
     PostgreSQL 16          MinIO              Ollama
    (Dados & Estado)     (PDF Storage)      (IA Local)
```

---

## Como Executar

### Pré-requisitos
- **Node.js** >= 20.x e **npm**
- **Docker** e **Docker Compose** v2 (recomendado para a stack completa)

### 1. Clonar e Configurar o Ambiente
```bash
# Copiar o modelo de variáveis de ambiente
cp .env.example .env
```
Preencha no arquivo `.env` as senhas do PostgreSQL, chaves do MinIO e segredo de sessão (`SESSION_SECRET`).

### 2. Execução em Desenvolvimento (Local)
```bash
# Instalar dependências e gerar o cliente Prisma
npm install

# Iniciar o servidor de desenvolvimento unificado (porta 3000)
npm run dev
```
- Aplicação Web: `http://localhost:3000`
- Diagnóstico de Liveness: `http://localhost:3000/api/live`
- Diagnóstico de Readiness: `http://localhost:3000/api/ready`

### 3. Execução via Docker Compose
```bash
# Subir toda a infraestrutura em containers
docker compose up -d

# Aplicar as migrações do banco de dados relacional
npx prisma migrate deploy
```

> 📖 **Instruções Detalhadas de Implantação:** Consulte o guia mestre [`docs/SPRINT_11_HANDOFF.md`](docs/SPRINT_11_HANDOFF.md) e o manual operacional [`docs/DEPLOYMENT_SPRINT_11.md`](docs/DEPLOYMENT_SPRINT_11.md).

---

## Testes Automatizados e Qualidade

O QuestForge mantém uma rigorosa suíte de testes automatizados com cobertura hermética em todas as camadas da aplicação:

```bash
# Executar a suíte de testes completa (864 testes)
npm test

# Validação de tipagem e integridade estática
npm run lint

# Compilação e build de produção
npm run build
```

- **864 testes aprovados** (testes unitários, validações Zod, simulações de fluxo multimodulares e controladores HTTP).
- **4 testes de integração real** preservados com marcação `.skip()` para validação em ambiente com infraestrutura real ativa.
- **0 erros de TypeScript** em compilação estrita.

---

## Status do Projeto e Próximos Passos

- [x] **Arquitetura Base e Persistência:** Concluída com 13 modelos e 5 migrações no Prisma ORM.
- [x] **Motor de Simulados e Anti-Cheating:** Concluído e homologado contra manipulação de respostas.
- [x] **Motor de Streak e Atividades:** Concluído com cálculo determinístico diário em UTC.
- [x] **Analytics Educacional e IA Local:** Concluído com suporte a fallback determinístico offline.
- [x] **Testes Herméticos:** 100% aprovados sem dependência de serviços externos.
- [ ] **Implantação e Homologação Real (Sprint 11):** Fase de inicialização dos containers reais no ambiente hospedeiro Debian, reativação dos 4 testes de integração e validação ponta a ponta com tráfego real.
- [ ] **Motor Concreto de OCR Ótico:** Atualmente, a aplicação realiza a extração digital nativa via `pdfjs-dist` e identifica documentos escaneados (`NEEDS_OCR`). Documentos escaneados respondem honestamente com `503 OCR_UNAVAILABLE`; a integração de um motor como Tesseract/EasyOCR está planejada como evolução futura.

---

*QuestForge — Desenvolvido com foco em robustez técnica, privacidade de dados e eficácia nos estudos.*
