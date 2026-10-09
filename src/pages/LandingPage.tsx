import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';
import { Navbar } from '../components/Navbar.tsx';
import { Footer } from '../components/Footer.tsx';
import { fetchFoundationHealth } from '../services/api.ts';
import type { HealthFetchState } from '../types/index.ts';

const PROBLEMS = [
  {
    index: '01',
    title: 'Provas e gabaritos espalhados em dezenas de PDFs',
    description:
      'Cadernos de prova e gabaritos oficiais ficam dispersos em pastas locais sem padronização, dificultando localizar questões por disciplina ou assunto.',
  },
  {
    index: '02',
    title: 'Dificuldade para organizar materiais e questões',
    description:
      'Resolver provas inteiras no papel ou em visualizadores de PDF não transforma as questões em um banco pesquisável e reutilizável.',
  },
  {
    index: '03',
    title: 'Ausência de medição objetiva de desempenho',
    description:
      'Sem registro estruturado de tentativas e tempo por questão, o estudante depende apenas de percepção subjetiva sobre sua evolução.',
  },
  {
    index: '04',
    title: 'Baixa visibilidade sobre disciplinas críticas',
    description:
      'Erros recorrentes em tópicos específicos passam despercebidos quando não há consolidação histórica por matéria, banca e nível de dificuldade.',
  },
  {
    index: '05',
    title: 'Simulados pouco personalizados',
    description:
      'Repetir provas antigas sempre na mesma ordem não permite montar treinos focados nas bancas, anos e assuntos que exigem reforço.',
  },
  {
    index: '06',
    title: 'Quebra de consistência na rotina de estudos',
    description:
      'Sem acompanhamento claro de atividades reais concluídas por dia, torna-se difícil sustentar o ritmo de resolução ao longo das semanas.',
  },
];

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Provas anteriores e gabaritos',
    detail: 'Seleção dos cadernos de prova e gabaritos oficiais em formato PDF.',
    sprint: 'Sprint 2 / Sprint 5',
  },
  {
    step: '02',
    title: 'Upload validado do documento',
    detail: 'Verificação de MIME, extensão, tamanho e armazenamento seguro no MinIO.',
    sprint: 'Sprint 3',
  },
  {
    step: '03',
    title: 'Extração de texto via PDF Parser ou OCR',
    detail: 'Detecção automática de camada textual nativa ou aplicação de OCR página a página.',
    sprint: 'Sprint 3',
  },
  {
    step: '04',
    title: 'Normalização e estruturação assistida por IA local',
    detail: 'Limpeza de artefatos de OCR e segmentação via OllamaProvider com prompts versionados.',
    sprint: 'Sprint 4',
  },
  {
    step: '05',
    title: 'Validação estrita (Zod + regras de negócio)',
    detail: 'Registro intermediário em AIExtraction antes de aprovar qualquer questão.',
    sprint: 'Sprint 4',
  },
  {
    step: '06',
    title: 'Banco de questões persistido no PostgreSQL',
    detail: 'Questões, alternativas e gabarito oficial associados e indexados via Prisma ORM.',
    sprint: 'Sprint 4 / Sprint 5',
  },
  {
    step: '07',
    title: 'Simulados personalizados com cronômetro oficial',
    detail: 'Seleção e randomização no backend com controle de tempo baseado em startedAt.',
    sprint: 'Sprint 6',
  },
  {
    step: '08',
    title: 'Desempenho, histórico, streak e recomendações',
    detail: 'Métricas agregadas no banco de dados e análises baseadas em estatísticas reais.',
    sprint: 'Sprint 7 a Sprint 9',
  },
];

const PLATFORM_FEATURES = [
  {
    name: 'Fundação Full-Stack, Health Check e Docker',
    description:
      'Arquitetura React + Vite + Express + Prisma + PostgreSQL com verificação real de dependências em GET /api/health e orquestração Docker Compose.',
    status: 'Ativo na Sprint 0',
    isAvailableNow: true,
  },
  {
    name: 'Cadastro, Login e Sessão com Cookie HttpOnly',
    description:
      'Autenticação própria no backend com senhas em hash scrypt, proteção CSRF e sessões em UserSession (persistência real requer PostgreSQL ativo).',
    status: 'Ativo na Sprint 1 (Requer PostgreSQL ativo)',
    isAvailableNow: true,
  },
  {
    name: 'Banco de Provas e Upload de PDFs (MinIO)',
    description:
      'Cadastro de provas por instituição, banca, ano e cargo, com upload validado de cadernos de prova e gabaritos.',
    status: 'Planejado — Sprints 2 e 3',
    isAvailableNow: false,
  },
  {
    name: 'Pipeline PDF Parser + OCR para Provas Digitalizadas',
    description:
      'Extração textual direta ou OCR local para documentos escaneados, preservando a página de origem e normalizando quebras e hifenizações.',
    status: 'Planejado — Sprint 3',
    isAvailableNow: false,
  },
  {
    name: 'Estruturação de Questões por IA Local + Validação',
    description:
      'Extração via Ollama com schema estrito, proteção contra prompt injection em PDFs e validação em AIExtraction antes da tabela Question.',
    status: 'Planejado — Sprint 4',
    isAvailableNow: false,
  },
  {
    name: 'Associação de Gabarito Oficial',
    description:
      'Processamento dedicado do gabarito oficial para definir a alternativa correta sem permitir que a IA invente respostas.',
    status: 'Planejado — Sprint 5',
    isAvailableNow: false,
  },
  {
    name: 'Simulados Personalizados com Cronômetro no Backend',
    description:
      'Filtros por prova, banca, ano, disciplina, assunto, dificuldade, quantidade e tempo, com ordem persistida e cronômetro auditado pelo servidor.',
    status: 'Planejado — Sprint 6',
    isAvailableNow: false,
  },
  {
    name: 'Sequência de Estudos (Streak) e Histórico Paginado',
    description:
      'Contabilização determinística de dias ativos apenas mediante atividade real de estudo e histórico paginado no PostgreSQL.',
    status: 'Planejado — Sprint 7',
    isAvailableNow: false,
  },
  {
    name: 'Dashboard Analítico e IA Educacional',
    description:
      'Agregações SQL de acertos, tempo e evolução por matéria, acompanhadas de recomendações geradas sobre estatísticas consolidadas.',
    status: 'Planejado — Sprints 8 e 9',
    isAvailableNow: false,
  },
];

export function LandingPage() {
  const [healthState, setHealthState] = useState<HealthFetchState>({ state: 'loading' });

  const loadHealth = async (signal?: AbortSignal) => {
    setHealthState({ state: 'loading' });
    try {
      const result = await fetchFoundationHealth(signal);
      setHealthState({
        state: 'loaded',
        data: result.data,
        httpStatus: result.httpStatus,
      });
    } catch (error) {
      if (signal?.aborted) return;
      setHealthState({
        state: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível consultar GET /api/health no momento.',
      });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadHealth(controller.signal);
    return () => controller.abort();
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#FAFAFA] flex flex-col">
      {/* 1. NAVBAR */}
      <Navbar />

      <main className="flex-1">
        {/* 2. HERO SECTION */}
        <section className="border-b border-neutral-800 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
              <div className="lg:col-span-7 qf-animate-in">
                <p className="text-xs font-mono text-neutral-400">
                  QuestForge · Engenharia de Estudos · Fundação Sprint 0 Ativa
                </p>

                <h1
                  className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl lg:leading-[1.12]"
                  style={{ textWrap: 'balance' }}
                >
                  Transforme provas anteriores em um plano de estudos orientado por desempenho.
                </h1>

                <p className="mt-6 max-w-2xl text-base leading-relaxed text-neutral-300 sm:text-lg">
                  O QuestForge é uma plataforma full-stack para organizar provas em PDF, extrair e
                  validar questões com auxílio de OCR e IA local, executar simulados cronometrados e
                  acompanhar sua evolução real por disciplina, assunto e banca no PostgreSQL.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[#2563EB] px-5 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                  >
                    Criar conta
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#funcionamento"
                    className="inline-flex items-center whitespace-nowrap rounded-md border border-neutral-800 bg-neutral-950 px-5 py-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:border-neutral-700 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                  >
                    Conhecer a arquitetura e o fluxo
                  </a>
                </div>

                <div className="mt-8 border-t border-neutral-900 pt-6 text-xs text-neutral-400">
                  <span>Persistência Oficial: PostgreSQL + Prisma ORM</span>
                  <span aria-hidden="true"> · </span>
                  <span>Processamento Documental: PDF / OCR / MinIO</span>
                  <span aria-hidden="true"> · </span>
                  <span>IA Local Auditada: Ollama + Zod</span>
                </div>
              </div>

              {/* Elemento Visual: Arquitetura Operacional + Status Real da Fundação (/api/health) */}
              <div
                id="status-fundacao"
                className="lg:col-span-5 rounded-lg border border-neutral-800 bg-neutral-950 p-6 qf-animate-in"
              >
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      Diagnóstico em Tempo Real da Fundação
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Consulta direta ao endpoint <code>GET /api/health</code>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadHealth()}
                    aria-label="Atualizar status da API"
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-white focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Verificar
                  </button>
                </div>

                {healthState.state === 'loading' && (
                  <div className="py-8 text-xs font-mono text-neutral-400" role="status">
                    Consultando estado real do backend e das dependências...
                  </div>
                )}

                {healthState.state === 'error' && (
                  <div
                    className="mt-4 rounded-md border border-red-900/60 bg-red-950/20 p-4 text-xs text-red-200"
                    role="alert"
                  >
                    <div className="flex items-center gap-2 font-semibold text-red-300">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>API de Health Check indisponível</span>
                    </div>
                    <p className="mt-1.5 text-neutral-300">{healthState.message}</p>
                  </div>
                )}

                {healthState.state === 'loaded' && (
                  <div className="mt-4 space-y-4 text-xs">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                      <span className="text-neutral-400">Estado Geral do Serviço</span>
                      <span className="font-mono font-medium text-white tabular-nums">
                        {healthState.data.status === 'healthy'
                          ? 'HEALTHY (HTTP 200)'
                          : `DEGRADED (HTTP ${healthState.httpStatus})`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                      <span className="text-neutral-400">Servidor Express ({healthState.data.app.name})</span>
                      <span className="inline-flex items-center gap-1.5 font-mono text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {healthState.data.app.status.toUpperCase()} ({healthState.data.app.environment})
                      </span>
                    </div>

                    <div className="border-b border-neutral-900 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Dependência: PostgreSQL (Prisma)</span>
                        {healthState.data.dependencies.database.status === 'up' ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-emerald-400 tabular-nums">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            UP ({healthState.data.dependencies.database.latencyMs ?? 0}ms)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-mono text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {healthState.data.dependencies.database.status.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-neutral-400">
                        {healthState.data.dependencies.database.message}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Variáveis de Ambiente (.env)</span>
                        <span className="font-mono text-neutral-200 tabular-nums">
                          {healthState.data.dependencies.environment.status === 'configured'
                            ? 'CONFIGURED'
                            : `INCOMPLETE (${healthState.data.dependencies.environment.missingOrInvalidCount} pendentes)`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-5 border-t border-neutral-800 pt-4 text-[11px] leading-relaxed text-neutral-400">
                  Nota de transparência: este painel reflete o estado real do backend sem mocks.
                  Quando o PostgreSQL não está configurado no ambiente atual, a API reporta{' '}
                  <code>degraded / unconfigured</code> de forma explícita.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. O PROBLEMA */}
        <section id="problema" className="border-b border-neutral-800 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-mono text-neutral-400">01. Diagnóstico do Estudo Tradicional</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Por que resolver provas soltas em PDF limita sua evolução
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                Estudantes que utilizam provas anteriores enfrentam gargalos operacionais quando os
                cadernos de prova, os gabaritos e o histórico de tentativas não estão integrados em
                uma estrutura única de dados.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROBLEMS.map((item) => (
                <article
                  key={item.index}
                  className="rounded-lg border border-neutral-800 bg-neutral-950 p-6"
                >
                  <span className="font-mono text-xs text-[#2563EB] tabular-nums">{item.index}.</span>
                  <h3 className="mt-2 text-base font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 4. COMO O QUESTFORGE FUNCIONA (PIPELINE) */}
        <section id="funcionamento" className="border-b border-neutral-800 bg-neutral-950/50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-mono text-neutral-400">02. Arquitetura de Processamento</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Como o QuestForge transforma documentos brutos em estudo orientado por dados
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                O sistema não é apenas um leitor de perguntas. Ele foi arquitetado em torno de uma
                pipeline verificável que separa ingestão de PDFs, extração de texto/OCR, estruturação
                por IA local, validação de schema e persistência relacional.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-[#0A0A0A] p-5"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                      <span className="text-[#2563EB] tabular-nums">Etapa {item.step}</span>
                      <span>{item.sprint}</span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-neutral-400">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. RECURSOS PRINCIPAIS & TRANSPARÊNCIA DE SPRINTS */}
        <section id="recursos" className="border-b border-neutral-800 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-mono text-neutral-400">
                03. Recursos Principais e Cronograma de Engenharia
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Módulos do sistema: o que já está ativo na Sprint 0 e o que será entregue a seguir
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                O desenvolvimento do QuestForge segue Sprints incrementais auditáveis. Nenhuma
                funcionalidade futura é simulada com mocks: abaixo você confere exatamente o que já
                está operacional na fundação e o que está em implementação nas próximas Sprints.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {PLATFORM_FEATURES.map((feature) => (
                <div
                  key={feature.name}
                  className="flex flex-col justify-between rounded-lg border border-neutral-800 bg-neutral-950 p-6"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      {feature.isAvailableNow ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-[#2563EB]" />
                          <span className="font-semibold text-white">{feature.status}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-neutral-500" />
                          <span className="text-neutral-400">{feature.status}</span>
                        </>
                      )}
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-white">{feature.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. INTELIGÊNCIA ARTIFICIAL APLICADA AO ESTUDO */}
        <section id="ia-aplicada" className="border-b border-neutral-800 bg-neutral-950/50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <p className="text-xs font-mono text-neutral-400">
                  04. Engenharia de IA Aplicada com Responsabilidade
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  IA local para estruturar documentos e analisar métricas — sempre sob validação
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-neutral-300 sm:text-base">
                  No QuestForge, a inteligência artificial não substitui o gabarito oficial nem opera
                  como caixa-preta. A camada <code>AIProvider</code> (integrada ao{' '}
                  <code>OllamaProvider</code>) atua em dois momentos distintos e auditáveis:
                </p>

                <ul className="mt-6 space-y-4 text-sm text-neutral-300">
                  <li className="border-l-2 border-[#2563EB] pl-4">
                    <strong className="text-white">1. IA de Extração Documental (Sprint 4):</strong>{' '}
                    identifica enunciados, alternativas e páginas de origem a partir do texto
                    extraído do PDF/OCR, sem inventar questões, sem alterar o texto original e sem
                    resolver a prova por conta própria.
                  </li>
                  <li className="border-l-2 border-neutral-700 pl-4">
                    <strong className="text-white">2. IA Educacional (Sprint 9):</strong> recebe
                    exclusivamente estatísticas agregadas de desempenho (percentual de acertos e
                    volume por matéria) para apontar pontos fortes, pontos de atenção e prioridades
                    de estudo.
                  </li>
                </ul>
              </div>

              <div className="lg:col-span-6 rounded-lg border border-neutral-800 bg-[#0A0A0A] p-6">
                <h3 className="text-sm font-semibold text-white">
                  Regras de Segurança e Validação do Pipeline de IA (Planejado — Sprints 4 e 9)
                </h3>
                <p className="mt-1 text-xs text-neutral-400">
                  Nenhum resultado da IA é gravado diretamente na tabela oficial{' '}
                  <code>Question</code> sem passar pelo validador estrutural:
                </p>

                <div className="mt-5 space-y-3 font-mono text-xs">
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-300">
                    1. Documento PDF/OCR (tratado como conteúdo não confiável contra Prompt Injection)
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-300">
                    2. Execução do Job com prompt versionado (ex.: question-extraction.v1)
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-300">
                    3. Persistência intermediária em AIExtraction (rawResponse + parsedData)
                  </div>
                  <div className="rounded border border-neutral-800 bg-neutral-950 p-3 text-neutral-300">
                    4. Validação Zod + Regras de Negócio (alternativas, letras, páginas, duplicidades)
                  </div>
                  <div className="rounded border border-[#2563EB]/50 bg-neutral-950 p-3 text-white">
                    5. Aprovação para o banco oficial Question + Associação ao Gabarito Oficial
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. SIMULADOS PERSONALIZADOS */}
        <section id="simulados" className="border-b border-neutral-800 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <p className="text-xs font-mono text-neutral-400">
                  05. Simulados sob Medida (Planejado — Sprint 6)
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Treine com recorte preciso e cronômetro controlado pelo servidor
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-neutral-400 sm:text-base">
                  Em vez de refazer provas sempre na mesma sequência estática, o módulo de simulados
                  permitirá configurar baterias personalizadas selecionadas e randomizadas no
                  backend.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  A posição de cada questão (<code>SimulationQuestion.position</code>) e o horário de
                  início (<code>startedAt</code>) são mantidos no PostgreSQL, garantindo que a
                  contagem de tempo permaneça exata mesmo se você atualizar a página.
                </p>
              </div>

              <div className="lg:col-span-7 rounded-lg border border-neutral-800 bg-neutral-950 p-6">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <span className="text-xs font-mono text-neutral-400">
                    Especificação da Interface · Configurador de Simulado (Sprint 6)
                  </span>
                  <span className="text-xs font-mono text-neutral-400">
                    Fonte de verdade: Backend + PostgreSQL
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <span className="text-neutral-400">Critérios de Origem</span>
                    <p className="mt-1 font-medium text-white">Concurso / Exame · Banca · Ano</p>
                  </div>
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <span className="text-neutral-400">Recorte de Conteúdo</span>
                    <p className="mt-1 font-medium text-white">Disciplina · Assunto · Subtópico</p>
                  </div>
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <span className="text-neutral-400">Calibragem</span>
                    <p className="mt-1 font-medium text-white tabular-nums">
                      Dificuldade · Quantidade de questões
                    </p>
                  </div>
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <span className="text-neutral-400">Controle de Tempo</span>
                    <p className="mt-1 font-medium text-white tabular-nums">
                      startedAt + timeLimitSeconds (Expiração automática)
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-neutral-400">
                  Verificação de integridade: o frontend envia apenas{' '}
                  <code>selectedAlternativeId</code>. O cálculo de acerto (<code>isCorrect</code>) e
                  a nota final são apurados exclusivamente pelo backend confrontando o gabarito
                  oficial.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 8. DESEMPENHO E EVOLUÇÃO */}
        <section id="desempenho" className="border-b border-neutral-800 bg-neutral-950/50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-xs font-mono text-neutral-400">
                06. Dashboard Analítico (Planejado — Sprint 8)
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Acompanhamento de desempenho calculado por agregações SQL no PostgreSQL
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                O dashboard foi projetado para responder perguntas concretas sobre o seu estudo sem
                poluição visual. Abaixo está a representação estrutural das dimensões que serão
                calculadas pela API sobre as tentativas reais de cada conta:
              </p>
            </div>

            <div className="mt-8 rounded-lg border border-neutral-800 bg-[#0A0A0A] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-4">
                <span className="text-xs font-mono text-neutral-400">
                  Exemplo Conceitual da Estrutura do Dashboard (Sem dados fictícios de produção)
                </span>
                <span className="text-xs font-mono text-[#2563EB]">
                  Hierarquia: Resumo → Streak → Desempenho por Matéria → Evolução → Atividades
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs text-neutral-400">Taxa de Aproveitamento</p>
                  <p className="mt-2 font-mono text-sm text-white tabular-nums">
                    Acertos ÷ Questões Respondidas
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Diferencia questões erradas de questões em branco
                  </p>
                </div>
                <div className="rounded border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs text-neutral-400">Volume e Tempo de Estudo</p>
                  <p className="mt-2 font-mono text-sm text-white tabular-nums">
                    Soma de timeSpentSeconds
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Consolidado por questão e por simulado finalizado
                  </p>
                </div>
                <div className="rounded border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs text-neutral-400">Rendimento por Disciplina</p>
                  <p className="mt-2 font-mono text-sm text-white tabular-nums">
                    Agrupamento por subject e topic
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Identificação imediata de pontos fortes e críticos
                  </p>
                </div>
                <div className="rounded border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-xs text-neutral-400">Evolução Temporal</p>
                  <p className="mt-2 font-mono text-sm text-white tabular-nums">
                    Série histórica por período
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Progresso de acertos ao longo dos simulados
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 9. STREAK / SEQUÊNCIA DE ESTUDOS & 10. HISTÓRICO */}
        <section id="streak-historico" className="border-b border-neutral-800 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* 9. Streak */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
                <p className="text-xs font-mono text-neutral-400">
                  07. Consistência Real (Planejado — Sprint 7)
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
                  Sequência de estudos (Streak) baseada em atividade real
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  O QuestForge não contabiliza simples logins, aberturas de dashboard ou
                  atualizações de página como dia estudado. A sequência só avança quando você
                  executa pelo menos uma atividade válida de estudo (<code>QUESTION</code>,{' '}
                  <code>SIMULATION</code> ou <code>EXAM</code>).
                </p>
                <ul className="mt-5 space-y-2 text-xs text-neutral-400">
                  <li>· Incrementa em dias consecutivos com atividade concluída;</li>
                  <li>· Múltiplas atividades no mesmo dia contam como um único dia ativo;</li>
                  <li>· Preserva o recorde histórico (<code>longestStreak</code>) no PostgreSQL;</li>
                  <li>· Regra determinística avaliada no backend, imune a refresh no navegador.</li>
                </ul>
              </div>

              {/* 10. Histórico */}
              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-6 sm:p-8">
                <p className="text-xs font-mono text-neutral-400">
                  08. Memória de Longo Prazo (Planejado — Sprint 7)
                </p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
                  Histórico persistente e paginado associado à sua conta
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  Todas as questões respondidas, simulados concluídos, percentuais de acerto e
                  tempos de resolução ficam gravados no PostgreSQL e podem ser consultados com
                  paginação eficiente (<code>GET /api/history?page=1&amp;limit=20</code>).
                </p>
                <ul className="mt-5 space-y-2 text-xs text-neutral-400">
                  <li>· Revisão de simulados realizados e notas obtidas;</li>
                  <li>· Registro individual de tentativas (<code>QuestionAttempt</code>);</li>
                  <li>· Acompanhamento da duração de cada sessão de estudo;</li>
                  <li>· Dados vinculados exclusivamente ao usuário autenticado.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 11. PARA QUEM É O QUESTFORGE & 12. PRIVACIDADE E CONFIABILIDADE */}
        <section id="privacidade" className="border-b border-neutral-800 bg-neutral-950/50 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
              {/* 11. Para quem é */}
              <div className="lg:col-span-6">
                <p className="text-xs font-mono text-neutral-400">09. Público-Alvo</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
                  Para quem o QuestForge foi projetado
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  A arquitetura é flexível para qualquer avaliação objetiva baseada em cadernos de
                  prova e gabaritos:
                </p>
                <ul className="mt-5 space-y-3 text-sm text-neutral-300">
                  <li className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <strong className="text-white">Candidatos de concursos públicos:</strong>{' '}
                    organização por banca examinadora, órgão, cargo e ano.
                  </li>
                  <li className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <strong className="text-white">Estudantes de vestibulares e exames nacionais:</strong>{' '}
                    treinamento cronometrado e revisão de disciplinas com menor taxa de acerto.
                  </li>
                  <li className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <strong className="text-white">Profissionais em busca de certificações técnicas:</strong>{' '}
                    transformação de simulados e provas anteriores em banco estruturado de revisão.
                  </li>
                </ul>
              </div>

              {/* 12. Privacidade e Confiabilidade */}
              <div className="lg:col-span-6">
                <p className="text-xs font-mono text-neutral-400">10. Segurança e Confiabilidade</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
                  Princípios de privacidade e integridade dos dados
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  Construído sob diretrizes estritas de engenharia de software e segurança:
                </p>
                <div className="mt-5 space-y-3 text-sm text-neutral-300">
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <strong className="text-white">Zero credenciais expostas e logs higienizados:</strong>{' '}
                    validação de variáveis de ambiente no boot e redaction automático de dados
                    sensíveis nos logs (Ativo na Sprint 0).
                  </div>
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <strong className="text-white">Autenticação por sessão HttpOnly e hash de senha:</strong>{' '}
                    nenhum dado sensível ou progresso é salvo em <code>localStorage</code> (Sprint 1).
                  </div>
                  <div className="rounded border border-neutral-800 bg-[#0A0A0A] p-3.5">
                    <strong className="text-white">Isolamento de conteúdo em PDFs:</strong>{' '}
                    documentos enviados passam por validação de MIME/tamanho e têm seu texto
                    isolado das instruções do sistema ao interagir com o modelo local (Sprints 3 e 4).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 13. CTA FINAL */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2
              className="text-2xl font-bold tracking-tight text-white sm:text-4xl"
              style={{ textWrap: 'balance' }}
            >
              Comece a transformar suas provas em evolução estruturada.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base">
              Acesse as rotas de conta da plataforma ou acompanhe o diagnóstico da fundação técnica
              enquanto avançamos incrementalmente pelas Sprints do QuestForge.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[#2563EB] px-6 py-3 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Criar minha conta
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center whitespace-nowrap rounded-md border border-neutral-800 bg-neutral-950 px-6 py-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:border-neutral-700 hover:bg-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                Entrar na plataforma
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* 14. FOOTER */}
      <Footer />
    </div>
  );
}
