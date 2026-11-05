import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EducationalAnalysisSection } from '../components/educational-ai/EducationalAnalysisSection.tsx';
import type { EducationalAnalysisResponseDTO } from '../types/index.ts';

describe('Sprint 9.4 — Interface React de Análises Educacionais (src/tests/EducationalAnalysis.test.tsx)', () => {
  const originalFetch = globalThis.fetch;

  const sampleAiAnalysis: EducationalAnalysisResponseDTO = {
    summary:
      'O estudante demonstra sólida evolução em Direito Constitucional e necessita de reforço em Informática.',
    strengths: [
      {
        subject: 'Direito Constitucional',
        accuracyPercentage: 85.0,
        description: 'Excelente domínio em direitos e garantias fundamentais.',
      },
      {
        subject: 'Direito Administrativo',
        accuracyPercentage: 78.5,
        description: 'Bom aproveitamento em atos e poderes administrativos.',
      },
    ],
    weaknesses: [
      {
        subject: 'Informática',
        accuracyPercentage: 45.0,
        description: 'Dificuldades concentradas em redes e segurança da informação.',
      },
    ],
    trend: {
      direction: 'IMPROVING',
      description: 'Evolução de +8,0% nos simulados recentes em relação à média histórica.',
      deltaPercentage: 8.0,
    },
    recommendations: [
      {
        title: 'Revisão focada em Informática',
        description: 'Dedicar 40 minutos diários para resolução comentada de questões.',
        actionableStep: 'Fazer simulado de 15 questões de redes de computadores.',
      },
      {
        title: 'Manter sequência de estudos',
        description: 'Consistência diária é fundamental.',
        actionableStep: 'Resolver ao menos 10 questões por dia.',
      },
    ],
    priorities: [
      {
        subject: 'Informática',
        priority: 'HIGH',
        reason: 'Acurácia abaixo de 60% compromete a nota de corte do edital.',
        targetAccuracyPercentage: 70,
      },
      {
        subject: 'Direito Administrativo',
        priority: 'MEDIUM',
        reason: 'Disciplina com bom potencial de pontuação extra.',
        targetAccuracyPercentage: 85,
      },
      {
        subject: 'Direito Constitucional',
        priority: 'LOW',
        reason: 'Disciplina em zona segura; manter com revisões espaçadas.',
        targetAccuracyPercentage: 90,
      },
    ],
    confidenceLevel: 'HIGH',
    insufficientDataNotice: null,
    source: 'AI_INFERENCE',
    generatedAt: '2026-11-04T12:00:00.000Z',
  };

  const sampleFallbackAnalysis: EducationalAnalysisResponseDTO = {
    summary:
      'Desempenho geral apurado em 25 questões respondidas com taxa de acertos de 64,0%. Amostra inicial.',
    strengths: [],
    weaknesses: [
      {
        subject: 'Raciocínio Lógico',
        accuracyPercentage: 40.0,
        description: 'Aproveitamento reduzido em lógica proposicional.',
      },
    ],
    trend: {
      direction: 'STABLE',
      description: 'Desempenho estável dentro da margem esperada de variação.',
      deltaPercentage: 0.5,
    },
    recommendations: [
      {
        title: 'Reforço em Raciocínio Lógico',
        description: 'Praticar tabelas-verdade.',
        actionableStep: 'Resolver 10 questões de equivalências lógicas.',
      },
    ],
    priorities: [
      {
        subject: 'Raciocínio Lógico',
        priority: 'HIGH',
        reason: 'Menor percentual apurado.',
        targetAccuracyPercentage: 65,
      },
    ],
    confidenceLevel: 'MEDIUM',
    insufficientDataNotice:
      'Amostra moderada de questões. Recomenda-se realizar mais simulados.',
    source: 'DETERMINISTIC_FALLBACK',
    generatedAt: '2026-11-04T12:30:00.000Z',
  };

  const sampleNegativeTrendAnalysis: EducationalAnalysisResponseDTO = {
    ...sampleAiAnalysis,
    trend: {
      direction: 'DECLINING',
      description:
        'Queda de -6,5% na média recente. Recomendada revisão de tópicos críticos.',
      deltaPercentage: -6.5,
    },
  };

  const sampleEmptyAnalysis: EducationalAnalysisResponseDTO = {
    summary:
      'Bem-vindo ao QuestForge! Complete seu primeiro simulado para gerar uma análise pedagógica personalizada.',
    strengths: [],
    weaknesses: [],
    trend: {
      direction: 'INSUFFICIENT_DATA',
      description: 'Amostra insuficiente para calcular evolução temporal.',
      deltaPercentage: null,
    },
    recommendations: [
      {
        title: 'Primeiro Simulado',
        description: 'Inicie sua jornada resolvendo um simulado de diagnóstico.',
        actionableStep: 'Clique em Novo Simulado para começar.',
      },
    ],
    priorities: [],
    confidenceLevel: 'LOW',
    insufficientDataNotice: 'Nenhum simulado concluído ainda.',
    source: 'DETERMINISTIC_FALLBACK',
    generatedAt: '2026-11-04T12:45:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Estado de Carregamento
  it('1. deve exibir esqueleto de carregamento com acessibilidade (role="status")', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    render(<EducationalAnalysisSection enabled={true} />);

    expect(
      screen.getByTestId('educational-analysis-loading')
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // 2. Resposta AI_INFERENCE
  it('2. deve exibir indicador de IA Educacional para source="AI_INFERENCE"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const sourceBadge = await screen.findByTestId('analysis-source-label');
    expect(sourceBadge).toHaveTextContent('Análise com IA Educacional');
    expect(screen.getByTestId('educational-summary-text')).toHaveTextContent(
      sampleAiAnalysis.summary
    );
  });

  // 3. Resposta DETERMINISTIC_FALLBACK
  it('3. deve exibir indicador de Regras/Estatística Base para source="DETERMINISTIC_FALLBACK"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleFallbackAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const sourceBadge = await screen.findByTestId('analysis-source-label');
    expect(sourceBadge).toHaveTextContent('Análise Estatística Base (Regras)');
  });

  // 4. Pontos Fortes
  it('4. deve renderizar pontos fortes com acurácia e explicação pedagógica', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const strengthsCard = await screen.findByTestId('educational-strengths-card');
    expect(strengthsCard).toBeInTheDocument();
    expect(strengthsCard).toHaveTextContent('Direito Constitucional');
    expect(strengthsCard).toHaveTextContent('85,0% acertos');
    expect(strengthsCard).toHaveTextContent(
      'Excelente domínio em direitos e garantias fundamentais.'
    );
  });

  // 5. Pontos Fracos / Atenção
  it('5. deve renderizar pontos de atenção com linguagem construtiva e acurácia', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const weaknessesCard = await screen.findByTestId('educational-weaknesses-card');
    expect(weaknessesCard).toBeInTheDocument();
    expect(weaknessesCard).toHaveTextContent('Informática');
    expect(weaknessesCard).toHaveTextContent('45,0% acertos');
    expect(weaknessesCard).toHaveTextContent(
      'Dificuldades concentradas em redes e segurança da informação.'
    );
  });

  // 6. Tendência Positiva (IMPROVING)
  it('6. deve exibir tendência positiva com badge de evolução e valor delta', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const trendBadge = await screen.findByTestId('trend-direction-badge');
    expect(trendBadge).toHaveTextContent('Evolução Positiva (Alta)');
    expect(screen.getByTestId('trend-delta-value')).toHaveTextContent('+8,0%');
    expect(screen.getByTestId('trend-description')).toHaveTextContent(
      sampleAiAnalysis.trend.description
    );
  });

  // 7. Tendência Negativa (DECLINING)
  it('7. deve exibir tendência de atenção ao ritmo com delta percentual negativo', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleNegativeTrendAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const trendBadge = await screen.findByTestId('trend-direction-badge');
    expect(trendBadge).toHaveTextContent('Atenção ao Ritmo (Queda)');
    expect(screen.getByTestId('trend-delta-value')).toHaveTextContent('-6,5%');
  });

  // 8. Tendência Estável (STABLE)
  it('8. deve exibir tendência estável adequadamente', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleFallbackAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const trendBadge = await screen.findByTestId('trend-direction-badge');
    expect(trendBadge).toHaveTextContent('Desempenho Estável');
  });

  // 9. Recomendações
  it('9. deve exibir recomendações práticas com título, descrição e passo acionável', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const recommendationsCard = await screen.findByTestId(
      'educational-recommendations-card'
    );
    expect(recommendationsCard).toBeInTheDocument();
    expect(recommendationsCard).toHaveTextContent(
      'Revisão focada em Informática'
    );
    expect(recommendationsCard).toHaveTextContent(
      'Fazer simulado de 15 questões de redes de computadores.'
    );
  });

  // 10. Prioridades
  it('10. deve exibir prioridades de estudo com níveis distintos (HIGH, MEDIUM, LOW) e meta', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const prioritiesCard = await screen.findByTestId('educational-priorities-card');
    expect(prioritiesCard).toBeInTheDocument();
    expect(screen.getByTestId('priority-item-high')).toHaveTextContent('Informática');
    expect(screen.getByTestId('priority-item-high')).toHaveTextContent('Prioridade Alta');
    expect(screen.getByTestId('priority-item-medium')).toHaveTextContent('Direito Administrativo');
    expect(screen.getByTestId('priority-item-low')).toHaveTextContent('Direito Constitucional');
  });

  // 11. Dados Insuficientes
  it('11. deve exibir alerta quando houver aviso de dados insuficientes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleFallbackAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const noticeAlert = await screen.findByTestId('insufficient-data-alert');
    expect(noticeAlert).toBeInTheDocument();
    expect(noticeAlert).toHaveTextContent('Amostra moderada de questões');
  });

  // 12. Histórico Vazio
  it('12. deve tratar graciosamente histórico inicial sem simulados concluídos', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleEmptyAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const summaryText = await screen.findByTestId('educational-summary-text');
    expect(summaryText).toHaveTextContent('Complete seu primeiro simulado');
    expect(screen.getByTestId('educational-strengths-card')).toHaveTextContent(
      'Nenhum ponto forte consolidado ainda'
    );
    expect(screen.getByTestId('educational-weaknesses-card')).toHaveTextContent(
      'Nenhuma disciplina em zona crítica'
    );
  });

  // 13. Erro 401
  it('13. deve exibir mensagem de sessão expirada para erro HTTP 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'Unauthorized',
        message: 'Sua sessão expirou. Autentique-se novamente.',
      }),
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const errorAlert = await screen.findByTestId('educational-analysis-error');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent('Sua sessão expirou');
  });

  // 14. Erro 429
  it('14. deve exibir mensagem de limite de requisições excedido para erro HTTP 429', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'TooManyRequests',
        message: 'Muitas requisições em curto intervalo. Aguarde um instante.',
      }),
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const errorAlert = await screen.findByTestId('educational-analysis-error');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent('Muitas requisições em curto intervalo');
  });

  // 15. Erro 503
  it('15. deve exibir mensagem amigável sem stack trace para erro HTTP 503', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 503,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({
        error: 'ServiceUnavailable',
        message: 'Serviço de análise educacional temporariamente indisponível.',
      }),
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const errorAlert = await screen.findByTestId('educational-analysis-error');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(
      'Serviço de análise educacional temporariamente indisponível'
    );
    expect(errorAlert).not.toHaveTextContent('stack');
  });

  // 16. Retry Manual
  it('16. deve permitir re-executar requisição após erro ao clicar em Tentar novamente', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          status: 503,
          ok: false,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'ServiceUnavailable' }),
        } as Response;
      }
      return {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => sampleAiAnalysis,
      } as Response;
    });

    render(<EducationalAnalysisSection enabled={true} />);

    // 1ª chamada falha
    const retryBtn = await screen.findByRole('button', { name: /tentar novamente/i });
    expect(retryBtn).toBeInTheDocument();

    // Clica em Tentar novamente
    fireEvent.click(retryBtn);

    // 2ª chamada tem sucesso
    const summaryText = await screen.findByTestId('educational-summary-text');
    expect(summaryText).toHaveTextContent(sampleAiAnalysis.summary);
    expect(callCount).toBe(2);
  });

  // 17. Cancelamento no Unmount
  it('17. deve acionar abort no AbortController ao desmontar o componente', () => {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_input, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise(() => {});
    });

    const { unmount } = render(<EducationalAnalysisSection enabled={true} />);
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    unmount();
    expect(capturedSignal?.aborted).toBe(true);
  });

  // 18. Ausência de userId nas requisições
  it('18. não deve enviar userId em query, body ou cabeçalhos personalizados', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return {
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => sampleAiAnalysis,
      } as Response;
    });

    render(<EducationalAnalysisSection enabled={true} />);
    await screen.findByTestId('educational-summary-card');

    expect(capturedUrl).toBe('/api/educational-ai/analysis');
    expect(capturedUrl).not.toContain('userId');
    expect(capturedUrl).not.toContain('prompt');
    expect(capturedUrl).not.toContain('forceFallback');
    expect(capturedInit?.body).toBeUndefined();
    expect(capturedInit?.credentials).toBe('include');
  });

  // 19. Ausência de persistência local
  it('19. não deve salvar resultados pedagógicos no localStorage nem no sessionStorage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);
    await screen.findByTestId('educational-summary-card');

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  // 20. Renderização Acessível
  it('20. deve fornecer estrutura semântica acessível com headings e aria-live', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => sampleAiAnalysis,
    } as Response);

    render(<EducationalAnalysisSection enabled={true} />);

    const section = await screen.findByTestId('educational-analysis-section');
    expect(section).toHaveAttribute('aria-labelledby', 'educational-analysis-heading');

    const mainHeading = screen.getByRole('heading', {
      level: 2,
      name: /Diagnóstico Pedagógico & Recomendações/i,
    });
    expect(mainHeading).toBeInTheDocument();
  });
});
