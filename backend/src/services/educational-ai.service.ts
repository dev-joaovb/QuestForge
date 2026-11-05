import {
  type EducationalAnalysisResponseDTO,
  type EducationalPromptPayload,
  type IEducationalAiClient,
  type RawAiEducationalAnalysis,
  type StrengthItemDTO,
  type WeaknessItemDTO,
  type StudyPriorityDTO,
  type RecommendationItemDTO,
  type ConfidenceLevel,
  EducationalAiDomainError,
  rawAiEducationalAnalysisSchema,
} from '../types/educational-ai.types.ts';
import {
  type EducationalStudentStatsDTO,
  normalizeSubjectKey,
} from '../types/educational-analytics.types.ts';
import { EducationalAnalyticsService } from './educational-analytics.service.ts';
import { EducationalAiClient } from './educational-ai-client.service.ts';
import { logger } from '../utils/logger.ts';

export interface EducationalAiServiceDependencies {
  educationalAnalyticsService?: EducationalAnalyticsService;
  educationalAiClient?: IEducationalAiClient;
  modelName?: string;
  timeoutMs?: number;
}

/**
 * Sanitiza valores textuais para prevenir prompt injection através de nomes de disciplinas
 * ou entradas cadastradas por usuários.
 */
export function sanitizePromptText(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[`"'{}\[\];:]/g, '')
    .replace(/\b(system|human|assistant|ignore previous instructions|prompt injection)\b/gi, '')
    .trim()
    .slice(0, 80);
}

/**
 * Constrói o prompt educacional estruturado em português brasileiro (Sprint 9.2).
 *
 * Regras estritas:
 * - Não envia nenhum PII (userId, nome, e-mail, tokens).
 * - Utiliza estritamente os agregados matemáticos calculados pelo EducationalAnalyticsService.
 * - Trata nomes de disciplinas como dados sanitizados, não como instruções.
 * - Registra limitação de cautela sobre questões anuladas.
 */
export function buildEducationalPrompt(stats: EducationalStudentStatsDTO): EducationalPromptPayload {
  const sanitizedSubjects = stats.subjectPerformance.map((s) => ({
    subject: sanitizePromptText(s.subject),
    totalAnswered: s.totalAnswered,
    correctCount: s.correctCount,
    accuracyPercentage: s.accuracyPercentage,
    averageTimeSpentSeconds: s.averageTimeSpentSeconds,
    isReliable: s.isReliable,
  }));

  const sanitizedDifficulties = stats.difficultyPerformance.map((d) => ({
    difficulty: d.difficulty,
    totalAnswered: d.totalAnswered,
    correctCount: d.correctCount,
    accuracyPercentage: d.accuracyPercentage,
  }));

  const systemPrompt = `Você é o tutor e analista pedagógico de inteligência artificial do QuestForge.
Sua missão é fornecer uma avaliação consultiva, equilibrada e altamente prática sobre o histórico de estudos do aluno em concursos públicos e exames.

REGRAS INEGOCIÁVEIS:
1. Baseie-se ESTRITAMENTE nos dados estatísticos fornecidos no JSON do usuário.
2. NÃO INVENTE disciplinas, notas, simulados, tendências ou metas históricas inexistentes.
3. As disciplinas mencionadas em pontos fortes, pontos fracos e prioridades DEVEM pertencer EXCLUSIVAMENTE à lista de disciplinas fornecida.
4. Respeite OBRIGATORIAMENTE a classificação de tendência temporal fornecida: "${stats.temporalTrend.direction}".
5. Cautela com questões anuladas: em concursos, questões anuladas atribuem pontuação oficial por regra de edital, o que pode elevar artificialmente as notas. Não afirme que todo acerto reflete domínio pedagógico absoluto sem ressalvas quando a amostra for modesta.
6. Não prometa aprovação em concursos nem faça estimativas de notas futuras sem respaldo estatístico.
7. Se os dados forem preliminares ou insuficientes, mencione isso no resumo e no campo insufficientDataNotice de forma transparente.
8. Responda ESTRITAMENTE no formato JSON com as chaves: summary, strengths, weaknesses, trend, recommendations, priorities, confidenceLevel, insufficientDataNotice.`;

  const userStatsContext = {
    globalStats: {
      completedSimulationsCount: stats.globalStats.completedSimulationsCount,
      pedagogicalAnsweredQuestions: stats.globalStats.pedagogicalAnsweredQuestions,
      pedagogicalCorrectAnswers: stats.globalStats.pedagogicalCorrectAnswers,
      pedagogicalAccuracyPercentage: stats.globalStats.pedagogicalAccuracyPercentage,
      averageSimulationScore: stats.globalStats.averageSimulationScore,
      officialTotalPoints: stats.globalStats.officialTotalPoints,
      averageTimeSpentPerQuestionSeconds: stats.globalStats.averageTimeSpentPerQuestionSeconds,
    },
    subjectPerformance: sanitizedSubjects,
    difficultyPerformance: sanitizedDifficulties,
    temporalTrend: {
      direction: stats.temporalTrend.direction,
      deltaPercentage: stats.temporalTrend.deltaPercentage,
      recentAverageScore: stats.temporalTrend.recentAverageScore,
      historicalAverageScore: stats.temporalTrend.historicalAverageScore,
      completedSimulationsEvaluated: stats.temporalTrend.completedSimulationsEvaluated,
    },
    sampleSufficiency: {
      hasMinQuestionsForDescriptiveStats: stats.sampleSufficiency.hasMinQuestionsForDescriptiveStats,
      hasMinSimulationsForTrend: stats.sampleSufficiency.hasMinSimulationsForTrend,
      isSufficientForDeepAnalysis: stats.sampleSufficiency.isSufficientForDeepAnalysis,
      insufficientDataReasons: stats.sampleSufficiency.insufficientDataReasons,
    },
    consistency: {
      currentStreak: stats.consistency.currentStreak,
      totalStudyActivitiesCount: stats.consistency.totalStudyActivitiesCount,
    },
  };

  const userPrompt = `Analise os seguintes dados estatísticos consolidados do estudante e retorne a avaliação educacional no formato JSON especificado:

\`\`\`json
${JSON.stringify(userStatsContext, null, 2)}
\`\`\``;

  return {
    systemPrompt,
    userPrompt,
    sanitizedStats: stats,
  };
}

/**
 * Mapeamento canônico de numerais por extenso em português para verificação quantitativa (R-02).
 */
export const PORTUGUESE_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
};

function parsePortugueseQuantity(rawWordOrDigits: string): number | null {
  const clean = rawWordOrDigits.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PORTUGUESE_NUMBER_WORDS, clean)) {
    return PORTUGUESE_NUMBER_WORDS[clean];
  }
  const parsed = Number(clean.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * R-02: Validador semântico de afirmações quantitativas em textos livres gerados pelo LLM.
 *
 * Rejeita qualquer texto que cite quantidades de simulados, percentuais, acertos ou
 * questões divergentes dos dados consolidados pelo EducationalAnalyticsService.
 */
export function validateQuantitativeClaimsInText(
  text: string,
  stats: EducationalStudentStatsDTO,
  contextName: string
): void {
  if (!text || typeof text !== 'string') return;

  // 1. Verificação de menções a quantidades de simulados (dígitos ou por extenso)
  const simulationRegex =
    /\b(?:realizou|concluiu|completou|fez|foram\s+realizados|baseado\s+em|total\s+de|em|nos|com)?\s*(\d+|zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)\s+(?:simulados?|provas?|avaliaç(?:ão|ões))\b/gi;

  let simMatch: RegExpExecArray | null;
  while ((simMatch = simulationRegex.exec(text)) !== null) {
    const claimedQuantity = parsePortugueseQuantity(simMatch[1]);
    if (claimedQuantity !== null) {
      const validSimCounts = [
        stats.globalStats.completedSimulationsCount,
        stats.temporalTrend.completedSimulationsEvaluated,
      ];
      if (!validSimCounts.includes(claimedQuantity)) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_INVALID_OUTPUT',
          `Afirmação quantitativa incorreta em ${contextName}: modelo citou ${claimedQuantity} simulado(s), mas o histórico real registra ${stats.globalStats.completedSimulationsCount}.`,
          422
        );
      }
    }
  }

  // 2. Verificação de menções a percentuais (dígitos ou por extenso com % ou 'por cento')
  const percentRegex =
    /\b(\d+(?:[.,]\d+)?|zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)\s*(?:%|por\s+cento)\b/gi;

  const validPercentages: number[] = [
    stats.globalStats.pedagogicalAccuracyPercentage,
    stats.globalStats.globalAccuracyPercentage,
  ];
  if (stats.globalStats.averageSimulationScore !== null) {
    validPercentages.push(stats.globalStats.averageSimulationScore);
  }
  if (stats.temporalTrend.deltaPercentage !== null) {
    validPercentages.push(Math.abs(stats.temporalTrend.deltaPercentage));
    validPercentages.push(stats.temporalTrend.deltaPercentage);
  }
  if (stats.temporalTrend.recentAverageScore !== null) {
    validPercentages.push(stats.temporalTrend.recentAverageScore);
  }
  if (stats.temporalTrend.historicalAverageScore !== null) {
    validPercentages.push(stats.temporalTrend.historicalAverageScore);
  }
  for (const s of stats.subjectPerformance) {
    validPercentages.push(s.accuracyPercentage);
  }
  for (const d of stats.difficultyPerformance) {
    validPercentages.push(d.accuracyPercentage);
  }

  let pctMatch: RegExpExecArray | null;
  while ((pctMatch = percentRegex.exec(text)) !== null) {
    const claimedPct = parsePortugueseQuantity(pctMatch[1]);
    if (claimedPct !== null) {
      const isMatch = validPercentages.some((vp) => Math.abs(vp - claimedPct) <= 1.5);
      if (!isMatch) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_INVALID_OUTPUT',
          `Percentual não verificado em ${contextName}: modelo citou ${claimedPct}%, que não corresponde a nenhuma métrica apurada pelo analytics.`,
          422
        );
      }
    }
  }

  // 3. Verificação de menções a questões respondidas (reivindicações históricas de volume)
  const questionsRegex =
    /\b(?:com|em|de|totalizando|total\s+de|resolveu|respondeu|acertou|errou)\s+(\d+|zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem)\s+quest(?:ão|ões)\b/gi;

  const validQuestionCounts: number[] = [
    stats.globalStats.pedagogicalAnsweredQuestions,
    stats.globalStats.totalAnsweredQuestions,
    ...stats.subjectPerformance.map((s) => s.totalAnswered),
  ];

  let qMatch: RegExpExecArray | null;
  while ((qMatch = questionsRegex.exec(text)) !== null) {
    const claimedQ = parsePortugueseQuantity(qMatch[1]);
    if (claimedQ !== null && !validQuestionCounts.includes(claimedQ)) {
      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_INVALID_OUTPUT',
        `Volume de questões incorreto em ${contextName}: modelo citou ${claimedQ} questões, mas não coincide com o histórico apurado.`,
        422
      );
    }
  }
}

/**
 * Validador e normalizador da resposta bruta do modelo com checagem cruzada semântica e quantitativa (R-02).
 * Rejeita alucinações (disciplinas inventadas, números falsos ou tendências contraditórias).
 */
export function validateAndSanitizeAiResponse(
  rawJson: string,
  stats: EducationalStudentStatsDTO
): EducationalAnalysisResponseDTO {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new EducationalAiDomainError(
      'EDUCATIONAL_AI_INVALID_OUTPUT',
      'Resposta do modelo não pôde ser interpretada como JSON.',
      422,
      { error: String(err) }
    );
  }

  const parseResult = rawAiEducationalAnalysisSchema.safeParse(parsed);
  if (!parseResult.success) {
    throw new EducationalAiDomainError(
      'EDUCATIONAL_AI_INVALID_OUTPUT',
      'A resposta do modelo não atende ao contrato de dados educacionais.',
      422,
      { errors: parseResult.error.issues }
    );
  }

  const data: RawAiEducationalAnalysis = parseResult.data;

  // 1. Verificação semântica: direção da tendência temporal
  if (data.trend.direction !== stats.temporalTrend.direction) {
    throw new EducationalAiDomainError(
      'EDUCATIONAL_AI_INVALID_OUTPUT',
      `Direção da tendência contraditória: modelo indicou '${data.trend.direction}', mas o analytics determinou '${stats.temporalTrend.direction}'.`,
      422
    );
  }

  // R-02: Verificação do delta da tendência temporal se fornecido
  if (stats.temporalTrend.deltaPercentage !== null && data.trend.deltaPercentage !== null) {
    if (Math.abs(data.trend.deltaPercentage - stats.temporalTrend.deltaPercentage) > 1.5) {
      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_INVALID_OUTPUT',
        `Variação da tendência divergente: modelo indicou ${data.trend.deltaPercentage}%, mas analytics apurou ${stats.temporalTrend.deltaPercentage}%.`,
        422
      );
    }
  }

  // 2. Verificação semântica: disciplinas inventadas e acurácia estruturada
  const subjectMap = new Map<string, (typeof stats.subjectPerformance)[0]>();
  for (const s of stats.subjectPerformance) {
    subjectMap.set(normalizeSubjectKey(s.subject).normalizedKey, s);
  }

  // Valida e ancora pontos fortes
  for (const item of data.strengths) {
    const itemKey = normalizeSubjectKey(item.subject).normalizedKey;
    const realSubject = subjectMap.get(itemKey);
    if (!realSubject && subjectMap.size > 0) {
      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_INVALID_OUTPUT',
        `Disciplina '${item.subject}' não consta no histórico do estudante (rejeição por alucinação).`,
        422
      );
    }
    if (realSubject) {
      if (Math.abs(item.accuracyPercentage - realSubject.accuracyPercentage) > 1.5) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_INVALID_OUTPUT',
          `Acurácia divergente em ponto forte para '${item.subject}': modelo indicou ${item.accuracyPercentage}%, mas analytics apurou ${realSubject.accuracyPercentage}%.`,
          422
        );
      }
      item.accuracyPercentage = realSubject.accuracyPercentage;
    }
    validateQuantitativeClaimsInText(item.description, stats, `ponto forte '${item.subject}'`);
  }

  // Valida e ancora pontos fracos
  for (const item of data.weaknesses) {
    const itemKey = normalizeSubjectKey(item.subject).normalizedKey;
    const realSubject = subjectMap.get(itemKey);
    if (!realSubject && subjectMap.size > 0) {
      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_INVALID_OUTPUT',
        `Disciplina '${item.subject}' não consta no histórico do estudante (rejeição por alucinação).`,
        422
      );
    }
    if (realSubject) {
      if (Math.abs(item.accuracyPercentage - realSubject.accuracyPercentage) > 1.5) {
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_INVALID_OUTPUT',
          `Acurácia divergente em ponto fraco para '${item.subject}': modelo indicou ${item.accuracyPercentage}%, mas analytics apurou ${realSubject.accuracyPercentage}%.`,
          422
        );
      }
      item.accuracyPercentage = realSubject.accuracyPercentage;
    }
    validateQuantitativeClaimsInText(item.description, stats, `ponto fraco '${item.subject}'`);
  }

  // Valida prioridades
  for (const item of data.priorities) {
    const itemKey = normalizeSubjectKey(item.subject).normalizedKey;
    if (!subjectMap.has(itemKey) && subjectMap.size > 0) {
      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_INVALID_OUTPUT',
        `Disciplina prioritária '${item.subject}' não consta no histórico do estudante (rejeição por alucinação).`,
        422
      );
    }
    validateQuantitativeClaimsInText(item.reason, stats, `prioridade '${item.subject}'`);
  }

  // R-02: Valida textos livres do resumo, tendência e recomendações
  validateQuantitativeClaimsInText(data.summary, stats, 'resumo');
  validateQuantitativeClaimsInText(data.trend.description, stats, 'descrição da tendência');
  for (const rec of data.recommendations) {
    validateQuantitativeClaimsInText(rec.description, stats, `recomendação '${rec.title}'`);
  }

  return {
    summary: data.summary,
    strengths: data.strengths,
    weaknesses: data.weaknesses,
    trend: {
      direction: stats.temporalTrend.direction,
      description: data.trend.description,
      deltaPercentage: stats.temporalTrend.deltaPercentage,
    },
    recommendations: data.recommendations,
    priorities: data.priorities,
    confidenceLevel: data.confidenceLevel,
    insufficientDataNotice: data.insufficientDataNotice ?? null,
    source: 'AI_INFERENCE',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Motor determinístico de análise educacional (Fallback sem inferência).
 *
 * Implementa regras analíticas puras baseadas exclusivamente em estatística aplicada,
 * sem invenção de dados e totalmente desacoplado de dependências HTTP externas.
 */
export function generateDeterministicEducationalAnalysis(
  stats: EducationalStudentStatsDTO
): EducationalAnalysisResponseDTO {
  const { globalStats, subjectPerformance, temporalTrend, sampleSufficiency, consistency } = stats;

  const insufficientDataNotice =
    sampleSufficiency.insufficientDataReasons.length > 0
      ? sampleSufficiency.insufficientDataReasons.join(' ')
      : null;

  // 1. Cenário: Usuário sem nenhum histórico ou com volume abaixo do mínimo
  if (globalStats.totalAnsweredQuestions === 0) {
    return {
      summary:
        'Nenhum simulado concluído ou atividade de estudo foi registrado até o momento. ' +
        'Para obter diagnósticos de desempenho, pontos fortes e recomendações personalizadas, ' +
        'realize o seu primeiro simulado no QuestForge.',
      strengths: [],
      weaknesses: [],
      trend: {
        direction: 'INSUFFICIENT_DATA',
        description: 'Não há dados históricos suficientes para estabelecer uma curva de evolução.',
        deltaPercentage: null,
      },
      recommendations: [
        {
          title: 'Realizar o primeiro simulado diagnóstico',
          description:
            'Um simulado inicial com 10 a 20 questões permite mapear as disciplinas prioritárias e a linha de base de acertos.',
          actionableStep: 'Acesse o menu de Simulados e inicie uma nova avaliação.',
        },
      ],
      priorities: [],
      confidenceLevel: 'LOW',
      insufficientDataNotice:
        insufficientDataNotice ?? 'Nenhuma questão ou simulado concluído registrado.',
      source: 'DETERMINISTIC_FALLBACK',
      generatedAt: new Date().toISOString(),
    };
  }

  // 2. Pontos Fortes e Pontos Fracos por disciplina
  const strengths: StrengthItemDTO[] = [];
  const weaknesses: WeaknessItemDTO[] = [];
  const priorities: StudyPriorityDTO[] = [];

  // Disciplinas ordenadas por taxa de acerto
  for (const s of subjectPerformance) {
    if (s.accuracyPercentage >= 75.0 && strengths.length < 3) {
      strengths.push({
        subject: s.subject,
        accuracyPercentage: s.accuracyPercentage,
        description: `Domínio sólido demonstrado com ${s.accuracyPercentage}% de acertos em ${s.totalAnswered} questões.${
          !s.isReliable ? ' (Amostra preliminar: menos de 5 questões).' : ''
        }`,
      });
    } else if (s.accuracyPercentage < 60.0 && weaknesses.length < 3) {
      weaknesses.push({
        subject: s.subject,
        accuracyPercentage: s.accuracyPercentage,
        description: `Rendimento de ${s.accuracyPercentage}% em ${s.totalAnswered} questões, indicando oportunidade de revisão conceitual e prática guiada.`,
      });
    }

    // Atribuição determinística de prioridades
    let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    let reason = `Precisão intermediária de ${s.accuracyPercentage}%.`;
    if (s.accuracyPercentage < 60.0) {
      priority = 'HIGH';
      reason = `Acurácia abaixo de 60% (${s.accuracyPercentage}%), demandando reforço imediato de teoria e exercícios.`;
    } else if (s.accuracyPercentage >= 75.0) {
      priority = 'LOW';
      reason = `Bom domínio demonstrado (${s.accuracyPercentage}%). Priorizar manutenção periódica.`;
    }

    priorities.push({
      subject: s.subject,
      priority,
      reason,
      targetAccuracyPercentage: Math.min(85, Math.max(70, Math.round(s.accuracyPercentage + 15))),
    });
  }

  // Ordena prioridades: HIGH primeiro, depois MEDIUM, depois LOW
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  priorities.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // 3. Descrição contextual da tendência
  let trendDescription = 'O desempenho em simulados permaneceu estável dentro da margem de variação.';
  if (temporalTrend.direction === 'IMPROVING') {
    trendDescription = `Tendência de alta observada, com evolução de +${temporalTrend.deltaPercentage}% entre a janela recente e o histórico anterior.`;
  } else if (temporalTrend.direction === 'DECLINING') {
    trendDescription = `Tendência de queda de ${temporalTrend.deltaPercentage}% na janela recente, recomendando ajuste no ritmo e revisão de erros.`;
  } else if (temporalTrend.direction === 'INSUFFICIENT_DATA') {
    trendDescription = 'Amostra temporal insuficiente para calcular evolução (mínimo de 2 simulados concluídos).';
  }

  // 4. Recomendações determinísticas práticas
  const recommendations: RecommendationItemDTO[] = [];

  if (weaknesses.length > 0) {
    recommendations.push({
      title: `Foco de reforço em ${weaknesses[0].subject}`,
      description: `Esta disciplina apresentou o menor percentual de acertos (${weaknesses[0].accuracyPercentage}%). Dedique sessões específicas para revisar os tópicos mais errados.`,
      actionableStep: `Resolva blocos de 10 a 15 questões focadas exclusivamente em ${weaknesses[0].subject}.`,
    });
  }

  if (consistency.currentStreak === 0) {
    recommendations.push({
      title: 'Restabelecer consistência de estudos',
      description: 'Estudar diariamente, mesmo em blocos curtos de 20 minutos, constrói retenção de longo prazo.',
      actionableStep: 'Complete ao menos uma atividade de estudo hoje para iniciar sua sequência de dias consecutivos.',
    });
  } else {
    recommendations.push({
      title: `Manter a sequência ativa (${consistency.currentStreak} dias)`,
      description: 'A consistência diária é o fator de maior impacto na aprovação em concursos públicos.',
      actionableStep: 'Continue respondendo pelo menos 10 questões por dia para proteger seu streak.',
    });
  }

  if (recommendations.length < 2) {
    recommendations.push({
      title: 'Revisão ativa e simulação cronometrada',
      description: 'A prática com controle de tempo aproxima o estudante das condições reais da prova.',
      actionableStep: 'Configure simulados com limite de tempo por questão.',
    });
  }

  // 5. Nível de confiança
  let confidenceLevel: ConfidenceLevel = 'LOW';
  if (sampleSufficiency.isSufficientForDeepAnalysis) {
    confidenceLevel = 'HIGH';
  } else if (sampleSufficiency.hasMinQuestionsForDescriptiveStats) {
    confidenceLevel = 'MEDIUM';
  }

  // 6. Resumo geral
  const accuracyStr = `${globalStats.pedagogicalAccuracyPercentage}%`;
  const summary =
    `Desempenho geral apurado em ${globalStats.pedagogicalAnsweredQuestions} questões respondidas ` +
    `com taxa de acertos de ${accuracyStr} em ${globalStats.completedSimulationsCount} simulado(s) concluído(s). ` +
    (strengths.length > 0 ? `Destaque positivo para ${strengths.map((s) => s.subject).join(', ')}. ` : '') +
    (weaknesses.length > 0 ? `Atenção prioritária recomendada para ${weaknesses.map((w) => w.subject).join(', ')}. ` : '') +
    (insufficientDataNotice ? `(Nota: ${insufficientDataNotice}) ` : '') +
    'Ressalva pedagógica: acertos oficiais de concursos podem conter pontuação por anulações concedidas.';

  return {
    summary: summary.trim(),
    strengths,
    weaknesses,
    trend: {
      direction: temporalTrend.direction,
      description: trendDescription,
      deltaPercentage: temporalTrend.deltaPercentage,
    },
    recommendations,
    priorities,
    confidenceLevel,
    insufficientDataNotice,
    source: 'DETERMINISTIC_FALLBACK',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Serviço de IA Educacional do QuestForge (Sprint 9.2).
 *
 * Responsável por orquestrar a geração de análises e recomendações de estudo,
 * integrando analytics real, cliente de IA desacoplado e fallback determinístico robusto.
 */
export class EducationalAiService {
  private readonly analyticsService: EducationalAnalyticsService;
  private readonly aiClient?: IEducationalAiClient;
  private readonly modelName?: string;
  private readonly timeoutMs?: number;

  constructor(deps: EducationalAiServiceDependencies = {}) {
    this.analyticsService =
      deps.educationalAnalyticsService ?? new EducationalAnalyticsService();
    this.aiClient = deps.educationalAiClient ?? new EducationalAiClient();
    this.modelName = deps.modelName;
    this.timeoutMs = deps.timeoutMs;
  }

  /**
   * Produz a análise educacional consultiva para o usuário autenticado.
   *
   * @param userId Identificador único do estudante.
   * @param options Opções de execução (forçar fallback determinístico ou AbortSignal).
   */
  async getEducationalAnalysis(
    userId: string,
    options: { forceFallback?: boolean; signal?: AbortSignal } = {}
  ): Promise<EducationalAnalysisResponseDTO> {
    const cleanId = userId?.trim();
    if (!cleanId) {
      throw new EducationalAiDomainError(
        'INVALID_USER_ID',
        'Identificador de usuário obrigatório para consulta de IA educacional.',
        400
      );
    }

    // R-03: Propaga imediatamente o cancelamento se o sinal já foi abortado pelo chamador
    if (options.signal?.aborted) {
      throw new EducationalAiDomainError(
        'EDUCATIONAL_AI_CANCELLED',
        'Operação cancelada pelo chamador.',
        499,
        { reason: options.signal.reason }
      );
    }

    // 1. Obtém as estatísticas reais do estudante via EducationalAnalyticsService
    const stats = await this.analyticsService.getStudentAnalytics(cleanId);

    // 2. Se fallback explícito for solicitado ou não houver cliente configurado
    if (options.forceFallback || !this.aiClient) {
      return generateDeterministicEducationalAnalysis(stats);
    }

    // 3. Constrói o prompt seguro e sanitizado
    const promptPayload = buildEducationalPrompt(stats);

    // 4. Tentativa de inferência via cliente desacoplado com fallback automático
    try {
      const rawResponse = await this.aiClient.generateAnalysis(promptPayload, {
        modelName: this.modelName,
        timeoutMs: this.timeoutMs,
        signal: options.signal,
      });

      // 5. Validação estrutural, semântica e quantitativa da resposta (R-02)
      return validateAndSanitizeAiResponse(rawResponse, stats);
    } catch (err: unknown) {
      // R-03: Se o chamador cancelou explicitamente, propaga o erro e NÃO aciona fallback
      if (
        options.signal?.aborted ||
        (err instanceof EducationalAiDomainError && err.code === 'EDUCATIONAL_AI_CANCELLED')
      ) {
        if (err instanceof EducationalAiDomainError) {
          throw err;
        }
        throw new EducationalAiDomainError(
          'EDUCATIONAL_AI_CANCELLED',
          'Operação cancelada pelo chamador.',
          499,
          { reason: options.signal?.reason }
        );
      }

      logger.warn('educational_ai_fallback_triggered', {
        userId: cleanId,
        reason: String(err),
      });

      // Ativação elegante do fallback determinístico em caso de falha de IA
      return generateDeterministicEducationalAnalysis(stats);
    }
  }
}
