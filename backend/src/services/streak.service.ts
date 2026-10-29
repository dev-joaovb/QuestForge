import type { UserStreak } from '@prisma/client';
import {
  type IUserStreakRepository,
  type StreakTransitionResult,
  type UserStreakDTO,
  StudyActivityDomainError,
} from '../types/activity.types.ts';
import {
  calendarDaysBetween,
  getCalendarDateUTC,
} from '../utils/date.utils.ts';
import { PrismaUserStreakRepository } from '../repositories/user-streak.repository.ts';
import { logger } from '../utils/logger.ts';

export class StreakService {
  private readonly userStreakRepository: IUserStreakRepository;

  constructor(userStreakRepository?: IUserStreakRepository) {
    this.userStreakRepository =
      userStreakRepository ?? new PrismaUserStreakRepository();
  }

  /**
   * Função pura que calcula a transição de streak conforme a data de conclusão da atividade (UTC).
   * Não possui efeitos colaterais e pode ser testada isoladamente com qualquer data de referência.
   */
  public calculateStreakTransition(
    currentRecord: UserStreak | null,
    completedAt: Date
  ): StreakTransitionResult {
    const targetDate = getCalendarDateUTC(completedAt);
    const prevCurrent = currentRecord?.currentStreak ?? 0;
    const prevLongest = currentRecord?.longestStreak ?? 0;
    const prevDate = currentRecord?.lastActivityDate ?? null;

    // Caso 1: Primeira atividade da conta
    if (!prevDate) {
      const newCurrent = 1;
      const newLongest = Math.max(prevLongest, 1);
      return {
        previousCurrentStreak: prevCurrent,
        previousLongestStreak: prevLongest,
        previousLastActivityDate: null,
        currentStreak: newCurrent,
        longestStreak: newLongest,
        lastActivityDate: targetDate,
        deltaDays: null,
        action: 'STARTED',
        isNewRecord: newLongest > prevLongest,
      };
    }

    const deltaDays = calendarDaysBetween(prevDate, targetDate);

    // Caso 2: Mesmo dia de calendário (UTC)
    if (deltaDays === 0) {
      return {
        previousCurrentStreak: prevCurrent,
        previousLongestStreak: prevLongest,
        previousLastActivityDate: prevDate,
        currentStreak: prevCurrent,
        longestStreak: prevLongest,
        lastActivityDate: prevDate,
        deltaDays: 0,
        action: 'MAINTAINED_SAME_DAY',
        isNewRecord: false,
      };
    }

    // Caso 3: Dia imediatamente consecutivo (UTC)
    if (deltaDays === 1) {
      const newCurrent = prevCurrent + 1;
      const newLongest = Math.max(prevLongest, newCurrent);
      return {
        previousCurrentStreak: prevCurrent,
        previousLongestStreak: prevLongest,
        previousLastActivityDate: prevDate,
        currentStreak: newCurrent,
        longestStreak: newLongest,
        lastActivityDate: targetDate,
        deltaDays: 1,
        action: 'INCREMENTED',
        isNewRecord: newLongest > prevLongest,
      };
    }

    // Caso 4: Intervalo de dias (quebra de sequência)
    if (deltaDays > 1) {
      const newCurrent = 1;
      const newLongest = Math.max(prevLongest, 1);
      return {
        previousCurrentStreak: prevCurrent,
        previousLongestStreak: prevLongest,
        previousLastActivityDate: prevDate,
        currentStreak: newCurrent,
        longestStreak: newLongest,
        lastActivityDate: targetDate,
        deltaDays,
        action: 'RESET',
        isNewRecord: false,
      };
    }

    // Caso 5: Evento retroativo (deltaDays < 0, targetDate < prevDate)
    // Política forward-only: a atividade é persistida no histórico, mas o streak
    // não é recalculado para trás nem reduzido retrospectivamente.
    return {
      previousCurrentStreak: prevCurrent,
      previousLongestStreak: prevLongest,
      previousLastActivityDate: prevDate,
      currentStreak: prevCurrent,
      longestStreak: prevLongest,
      lastActivityDate: prevDate,
      deltaDays,
      action: 'IGNORED_RETROACTIVE',
      isNewRecord: false,
    };
  }

  /**
   * Atualiza atomicamente o streak do usuário no repositório fornecido sob row lock exclusivo.
   */
  public async advanceStreakAtomic(
    userId: string,
    completedAt: Date,
    customRepo?: IUserStreakRepository
  ): Promise<{ streak: UserStreak; transition: StreakTransitionResult }> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new StudyActivityDomainError(
        'INVALID_USER_ID',
        'Identificador de usuário obrigatório para atualização de streak.',
        400
      );
    }

    const repo = customRepo ?? this.userStreakRepository;

    // 1. Adquire bloqueio exclusivo sobre o usuário no PostgreSQL
    await repo.acquireUserLock(userId);

    // 2. Lê o estado atual do streak
    const current = await repo.findByUserId(userId);

    // 3. Calcula a transição determinística
    const transition = this.calculateStreakTransition(current, completedAt);

    // 4. Se a ação não exige alteração no banco e o registro já existe, preserva o registro
    if (
      current &&
      (transition.action === 'MAINTAINED_SAME_DAY' ||
        transition.action === 'IGNORED_RETROACTIVE')
    ) {
      logger.info('streak_unchanged', {
        userId,
        action: transition.action,
        currentStreak: current.currentStreak,
        lastActivityDate: current.lastActivityDate,
      });
      return { streak: current, transition };
    }

    // 5. Persiste a nova transição via upsert atômico
    const updated = await repo.upsert(userId, {
      currentStreak: transition.currentStreak,
      longestStreak: transition.longestStreak,
      lastActivityDate: transition.lastActivityDate,
    });

    logger.info('streak_advanced', {
      userId,
      action: transition.action,
      previousStreak: transition.previousCurrentStreak,
      currentStreak: updated.currentStreak,
      longestStreak: updated.longestStreak,
      lastActivityDate: updated.lastActivityDate,
      isNewRecord: transition.isNewRecord,
    });

    return { streak: updated, transition };
  }

  /**
   * Consulta o streak atual do usuário.
   * Se o usuário ainda não possuir atividades, retorna HTTP 200 com zeros estruturados.
   */
  public async getUserStreak(userId: string): Promise<UserStreakDTO> {
    const cleanId = userId?.trim();
    if (!cleanId) {
      throw new StudyActivityDomainError(
        'INVALID_USER_ID',
        'Identificador de usuário obrigatório para consulta de streak.',
        400
      );
    }

    const record = await this.userStreakRepository.findByUserId(cleanId);
    if (!record) {
      const now = new Date();
      return {
        id: '',
        userId: cleanId,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        createdAt: now,
        updatedAt: now,
      };
    }

    return {
      id: record.id,
      userId: record.userId,
      currentStreak: record.currentStreak,
      longestStreak: record.longestStreak,
      lastActivityDate: record.lastActivityDate,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
