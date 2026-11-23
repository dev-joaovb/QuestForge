import '../landing.css';
import { LandingDashboardPreview } from '../components/landing/LandingDashboardPreview';
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
    title: 'Envie suas provas',
    detail: 'Reúna provas anteriores e gabaritos em PDF para organizar seu material de estudo.',
    sprint: 'Organização',
  },
  {
    step: '02',
    title: 'Organize suas questões',
    detail: 'Transforme documentos em questões estruturadas, com apoio de extração de texto e IA.',
    sprint: 'Preparação',
  },
  {
    step: '03',
    title: 'Pratique com simulados',
    detail: 'Monte sessões de estudo e resolva questões com foco nas disciplinas que deseja melhorar.',
    sprint: 'Prática',
  },
  {
    step: '04',
    title: 'Acompanhe sua evolução',
    detail: 'Consulte seu histórico, identifique pontos de melhoria e mantenha a consistência nos estudos.',
    sprint: 'Evolução',
  },
];

const PLATFORM_FEATURES = [
  {
    name: 'Uma plataforma para organizar seus estudos',
    description:
      'Centralize sua preparação em um ambiente pensado para reunir materiais, questões e informações sobre sua evolução.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Sua conta, seu espaço de estudos',
    description:
      'Acesse sua área pessoal e mantenha suas atividades vinculadas à sua conta, com mecanismos de proteção de sessão.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Organize provas e gabaritos',
    description:
      'Reúna provas anteriores e gabaritos em PDF, organizados por instituição, banca, ano e cargo.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Transforme PDFs em material de estudo',
    description:
      'Extraia textos de provas digitais ou digitalizadas e prepare suas questões para uma experiência de estudo mais prática.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Inteligência artificial para organizar questões',
    description:
      'Utilize recursos de inteligência artificial para estruturar questões extraídas dos documentos, com etapas de validação.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Respostas baseadas no gabarito oficial',
    description:
      'Associe as alternativas corretas ao gabarito oficial da prova, sem depender de respostas inventadas pela IA.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Simulados do seu jeito',
    description:
      'Personalize seus treinos por disciplina, banca, dificuldade e duração para praticar de acordo com seus objetivos.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Construa uma rotina consistente',
    description:
      'Acompanhe seus dias de estudo e consulte suas atividades anteriores para manter a constância na preparação.',
    status: 'Implementado — requer validação local',
    isAvailableNow: false,
  },
  {
    name: 'Entenda sua evolução',
    description:
      'Visualize acertos, tempo de resolução e desempenho por disciplina, com análises para orientar seus próximos estudos.',
    status: 'Implementado — requer validação local',
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
    <div className="qf-landing min-h-screen flex flex-col">
      {/* 1. NAVBAR */}
      <Navbar />

      <main className="flex-1">
        {/* 2. HERO SECTION */}
        <section className="border-b border-neutral-800 py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
              <div className="lg:col-span-7 qf-animate-in">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-200">
                  <CheckCircle2 className="h-4 w-4 text-sky-400" />
                  Sua jornada de estudos começa aqui
                </div>

                <h1
                  className="mt-7 max-w-3xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.12]"
                  style={{ textWrap: 'balance' }}
                >
                  Transforme seus estudos em{' '}
                  <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">
                    resultados reais.
                  </span>
                </h1>

                <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                  Organize suas questões, pratique com simulados e acompanhe sua evolução
                  em uma única plataforma. Estude com mais clareza, consistência e foco
                  no que realmente importa.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-4">
                  <Link to="/register" className="qf-landing-button-primary">
                    Começar gratuitamente
                    <ArrowRight className="h-4 w-4" />
                  </Link>

                  <a href="#funcionamento" className="qf-landing-button-secondary">
                    Conhecer a plataforma
                  </a>
                </div>

                <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sky-400" />
                    Questões organizadas
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sky-400" />
                    Simulados para praticar
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sky-400" />
                    Evolução acompanhada
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 qf-animate-in">
                <LandingDashboardPreview />
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Diagnóstico técnico da plataforma" className="border-b border-neutral-800 py-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

              <div
                id="status-fundacao"
                className="rounded-xl border border-neutral-800 bg-neutral-950 p-6"
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
              <p className="text-xs font-mono text-neutral-400">02. Sua jornada de aprendizado</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Do material de estudo à sua próxima conquista
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                Uma experiência pensada para simplificar sua preparação. Organize seus materiais,
                pratique com propósito e acompanhe sua evolução em cada etapa da jornada.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="qf-landing-card flex flex-col justify-between p-6"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                      <span className="font-semibold text-sky-400 tabular-nums">Etapa {item.step}</span>
                      <span>{item.sprint}</span>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.detail}</p>
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
                03. Tudo para estudar com mais eficiência
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Uma plataforma completa para sua preparação
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                Do gerenciamento de questões aos simulados e indicadores de desempenho,
                conheça os recursos desenvolvidos para tornar sua rotina de estudos
                mais organizada, prática e orientada à evolução contínua.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {PLATFORM_FEATURES.map((feature) => (
                <div
                  key={feature.name}
                  className="qf-landing-card flex flex-col justify-between p-6 sm:p-7"
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
                    <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">{feature.name}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-400">
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
                  04. Inteligência artificial a favor dos seus estudos
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Estude com mais inteligência, não apenas por mais tempo
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-neutral-300 sm:text-base">
                  A inteligência artificial do QuestForge foi desenvolvida para ajudar a organizar
                  questões e interpretar indicadores de desempenho. Os resultados passam por
                  etapas de validação, e as respostas corretas continuam vinculadas ao
                  gabarito oficial da prova.
                </p>

                <ul className="mt-6 space-y-4 text-sm text-neutral-300">
                  <li className="border-l-2 border-[#2563EB] pl-4">
                    <strong className="text-white">1. IA para organização de questões:</strong>{' '}
                    identifica enunciados, alternativas e páginas de origem a partir do texto
                    extraído do PDF/OCR, sem inventar questões, sem alterar o texto original e sem
                    resolver a prova por conta própria.
                  </li>
                  <li className="border-l-2 border-neutral-700 pl-4">
                    <strong className="text-white">2. IA para análise de desempenho:</strong> recebe
                    exclusivamente estatísticas agregadas de desempenho (percentual de acertos e
                    volume por matéria) para apontar pontos fortes, pontos de atenção e prioridades
                    de estudo.
                  </li>
                </ul>
              </div>

              <div className="qf-landing-card lg:col-span-6 p-6 sm:p-8">
                <h3 className="text-lg font-semibold tracking-tight text-white">
                  Segurança e validação dos resultados da IA
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  Antes de integrar questões ao seu material de estudo, o sistema aplica
                  etapas de processamento e validação para reduzir inconsistências.
                </p>

                <div className="mt-6 space-y-3 text-sm">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-slate-300">
                    01. Leitura do documento e extração do conteúdo
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-slate-300">
                    02. Organização das informações com apoio da IA
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-slate-300">
                    03. Registro intermediário para conferência dos resultados
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-slate-300">
                    04. Verificação de alternativas, páginas e possíveis duplicidades
                  </div>
                  <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 font-medium text-blue-100">
                    05. Estruturação das questões e associação ao gabarito oficial
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
                <p className="text-xs font-medium text-slate-400">
                  05. Simulados personalizados
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Simulados personalizados para você evoluir
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-neutral-400 sm:text-base">
                  Prepare-se com simulados adaptados aos seus objetivos. Escolha disciplinas,
                  assuntos, bancas e níveis de dificuldade para concentrar seus esforços
                  no que realmente importa para sua preparação.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                  Defina a quantidade de questões e o tempo disponível para cada sessão.
                  O sistema foi desenvolvido para registrar o andamento do simulado
                  e controlar o tempo pelo servidor, mesmo após atualizar a página.
                </p>
              </div>

              <div className="qf-landing-card lg:col-span-7 p-6 sm:p-8">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                  <span className="text-xs font-medium text-slate-400">
                    Configure seu próximo simulado
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    Prévia ilustrativa
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <span className="text-neutral-400">Escolha sua prova</span>
                    <p className="mt-1 font-medium text-white">Concurso / Exame · Banca · Ano</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <span className="text-neutral-400">Selecione os conteúdos</span>
                    <p className="mt-1 font-medium text-white">Disciplina · Assunto · Subtópico</p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <span className="text-neutral-400">Personalize o desafio</span>
                    <p className="mt-1 font-medium text-white tabular-nums">
                      Dificuldade · Quantidade de questões
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <span className="text-neutral-400">Defina seu tempo</span>
                    <p className="mt-1 font-medium text-white tabular-nums">
                      Duração personalizada com controle de tempo
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-neutral-400">
                  Suas respostas são verificadas pelo sistema com base no gabarito oficial.
                  A correção e o resultado final são calculados no servidor, ajudando
                  a preservar a integridade de cada simulado.
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
                06. Acompanhe seu desempenho
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Acompanhe sua evolução e descubra onde melhorar
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400 sm:text-base">
                Entenda como você está evoluindo a cada sessão de estudo. Acompanhe seus acertos,
                identifique as disciplinas que precisam de mais atenção e visualize seu
                progresso ao longo do tempo. Tudo organizado para ajudar você a estudar
                com mais estratégia.
              </p>
            </div>

            <div className="qf-landing-card mt-8 p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-4">
                <span className="text-xs font-mono text-neutral-400">
                  Prévia ilustrativa do seu painel de desempenho
                </span>
                <span className="text-xs font-mono text-[#2563EB]">
                  Seus estudos, sua evolução
                </span>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 transition-colors hover:border-blue-500/40">
                  <p className="text-xs text-neutral-400">Seu aproveitamento</p>
                  <p className="mt-3 text-base font-semibold tracking-tight text-white">
                    Percentual de acertos
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Entenda quantas questões você acertou e onde pode melhorar
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 transition-colors hover:border-blue-500/40">
                  <p className="text-xs text-neutral-400">Tempo dedicado aos estudos</p>
                  <p className="mt-3 text-base font-semibold tracking-tight text-white">
                    Seu tempo de preparação
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Acompanhe o tempo investido em questões e simulados
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 transition-colors hover:border-blue-500/40">
                  <p className="text-xs text-neutral-400">Desempenho por disciplina</p>
                  <p className="mt-3 text-base font-semibold tracking-tight text-white">
                    Seus pontos fortes e desafios
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Descubra quais matérias precisam de mais atenção
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 transition-colors hover:border-blue-500/40">
                  <p className="text-xs text-neutral-400">Sua evolução</p>
                  <p className="mt-3 text-base font-semibold tracking-tight text-white">
                    Progresso ao longo do tempo
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Visualize sua evolução a cada simulado realizado
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
              <div className="qf-landing-card p-6 sm:p-8">
                <p className="text-xs font-mono text-neutral-400">
                  07. Mantenha a consistência
                </p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Crie uma rotina de estudos que gera resultados
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  Cada dia de dedicação faz diferença. O QuestForge acompanha sua
                  sequência de estudos com base em atividades realizadas,
                  incentivando a constância e a construção de bons hábitos.
                </p>
                <ul className="mt-5 space-y-2 text-xs text-neutral-400">
                  <li>· Acompanhe seus dias consecutivos de estudo;</li>
                  <li>· Mantenha sua sequência realizando atividades diariamente;</li>
                  <li>· Visualize seu recorde de consistência nos estudos;</li>
                  <li>· Sua sequência considera atividades reais, não apenas acessos à plataforma.</li>
                </ul>
              </div>

              {/* 10. Histórico */}
              <div className="qf-landing-card p-6 sm:p-8">
                <p className="text-xs font-mono text-neutral-400">
                  08. Seu histórico de estudos
                </p>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Toda a sua jornada de estudos em um só lugar
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  Consulte suas atividades anteriores, acompanhe os resultados
                  dos simulados e revisite questões respondidas. Seu histórico
                  ajuda a entender sua evolução e planejar os próximos estudos.
                </p>
                <ul className="mt-5 space-y-2 text-xs text-neutral-400">
                  <li>· Revisão de simulados realizados e notas obtidas;</li>
                  <li>· Consulte suas respostas e identifique oportunidades de revisão;</li>
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
                  A plataforma foi pensada para diferentes jornadas de preparação, utilizando
                  questões, provas anteriores e gabaritos:
                </p>
                <ul className="mt-5 space-y-3 text-sm text-neutral-300">
                  <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <strong className="text-white">Candidatos de concursos públicos:</strong>{' '}
                    organização por banca examinadora, órgão, cargo e ano.
                  </li>
                  <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <strong className="text-white">Estudantes de vestibulares e exames nacionais:</strong>{' '}
                    treinamento cronometrado e revisão de disciplinas com menor taxa de acerto.
                  </li>
                  <li className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
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
                  Sua experiência de estudo foi projetada com atenção à proteção das informações:
                </p>
                <div className="mt-5 space-y-3 text-sm text-neutral-300">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <strong className="text-white">Proteção das informações:</strong>{' '}
                    cuidados para reduzir a exposição de informações sensíveis
                    durante o funcionamento da plataforma.
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <strong className="text-white">Acesso protegido à sua conta:</strong>{' '}
                    mecanismos de autenticação e proteção das credenciais
                    ajudam a manter sua experiência mais segura.
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition-colors hover:border-blue-500/40">
                    <strong className="text-white">Tratamento cuidadoso dos documentos:</strong>{' '}
                    os arquivos enviados passam por verificações antes de serem
                    processados para apoiar sua preparação.
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
              Seu próximo grande resultado começa com um passo.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base">
              Organize seus estudos, pratique com simulados personalizados
              e acompanhe sua evolução em uma experiência pensada para
              ajudar você a alcançar seus objetivos.
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
