import { describe, it, expect, beforeEach } from 'vitest';
import { StreakService } from '../src/services/streak.service.ts';
import { MockUserStreakRepository } from '../src/repositories/user-streak.repository.ts';
import {
  calendarDaysBetween,
  getCalendarDateUTC,
  parseCalendarDateUTC,
  addCalendarDaysUTC,
  isConsecutiveDayUTC,
  isSameDayUTC,
} from '../src/utils/date.utils.ts';
import type { UserStreak } from '@prisma/client';

describe('Streak Engine — Sprint 7.1', () => {
  describe('Date Utilities (Strict UTC)', () => {
    it('1. deve formatar corretamente Date para "YYYY-MM-DD" em UTC', () => {
      const date1 = new Date(Date.UTC(2026, 9, 28, 23, 59, 59)); // 2026-10-28 23:59:59 UTC
      expect(getCalendarDateUTC(date1)).toBe('2026-10-28');

      const date2 = new Date(Date.UTC(2026, 9, 29, 0, 0, 1)); // 2026-10-29 00:00:01 UTC
      expect(getCalendarDateUTC(date2)).toBe('2026-10-29');
    });

    it('2. deve converter "YYYY-MM-DD" para Date com hora 00:00:00.000 UTC', () => {
      const parsed = parseCalendarDateUTC('2026-10-28');
      expect(parsed.toISOString()).toBe('2026-10-28T00:00:00.000Z');
      expect(parsed.getUTCFullYear()).toBe(2026);
      expect(parsed.getUTCMonth()).toBe(9); // Outubro (0-indexed)
      expect(parsed.getUTCDate()).toBe(28);
    });

    it('3. deve rejeitar formatos de data inválidos ou datas impossíveis', () => {
      expect(() => parseCalendarDateUTC('2026-13-01')).toThrow();
      expect(() => parseCalendarDateUTC('2026-02-30')).toThrow();
      expect(() => parseCalendarDateUTC('invalid-date')).toThrow();
    });

    it('4. deve calcular a diferença correta em dias de calendário UTC', () => {
      expect(calendarDaysBetween('2026-10-28', '2026-10-28')).toBe(0);
      expect(calendarDaysBetween('2026-10-28', '2026-10-29')).toBe(1);
      expect(calendarDaysBetween('2026-10-28', '2026-10-31')).toBe(3);
      expect(calendarDaysBetween('2026-10-29', '2026-10-28')).toBe(-1);
    });

    it('5. deve suportar transições de ano bissexto (29 de fevereiro)', () => {
      expect(calendarDaysBetween('2024-02-28', '2024-02-29')).toBe(1);
      expect(calendarDaysBetween('2024-02-29', '2024-03-01')).toBe(1);
      expect(calendarDaysBetween('2024-02-28', '2024-03-01')).toBe(2);
    });

    it('6. deve suportar virada de ano civil (31/12 para 01/01)', () => {
      expect(calendarDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
      expect(isConsecutiveDayUTC('2026-12-31', '2027-01-01')).toBe(true);
      expect(addCalendarDaysUTC('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('7. deve verificar corretamente dias iguais e dias consecutivos', () => {
      expect(isSameDayUTC('2026-10-28', '2026-10-28')).toBe(true);
      expect(isSameDayUTC('2026-10-28', '2026-10-29')).toBe(false);
      expect(isConsecutiveDayUTC('2026-10-28', '2026-10-29')).toBe(true);
      expect(isConsecutiveDayUTC('2026-10-28', '2026-10-30')).toBe(false);
    });
  });

  describe('Streak Transitions (Pure Logic)', () => {
    let service: StreakService;

    beforeEach(() => {
      service = new StreakService(new MockUserStreakRepository());
    });

    it('8. Primeira atividade: inicia streak em 1 e define recorde em 1', () => {
      const completedAt = new Date('2026-10-28T14:00:00.000Z');
      const transition = service.calculateStreakTransition(null, completedAt);

      expect(transition.action).toBe('STARTED');
      expect(transition.currentStreak).toBe(1);
      expect(transition.longestStreak).toBe(1);
      expect(transition.lastActivityDate).toBe('2026-10-28');
      expect(transition.deltaDays).toBeNull();
      expect(transition.isNewRecord).toBe(true);
    });

    it('9. Mesmo dia (UTC): mantém streak atual e não incrementa novamente', () => {
      const existing: UserStreak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 3,
        longestStreak: 5,
        lastActivityDate: '2026-10-28',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedAt = new Date('2026-10-28T22:30:00.000Z');
      const transition = service.calculateStreakTransition(existing, completedAt);

      expect(transition.action).toBe('MAINTAINED_SAME_DAY');
      expect(transition.currentStreak).toBe(3);
      expect(transition.longestStreak).toBe(5);
      expect(transition.lastActivityDate).toBe('2026-10-28');
      expect(transition.deltaDays).toBe(0);
      expect(transition.isNewRecord).toBe(false);
    });

    it('10. Dia imediatamente consecutivo: incrementa streak e atualiza recorde se superado', () => {
      const existing: UserStreak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 4,
        longestStreak: 4,
        lastActivityDate: '2026-10-28',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedAt = new Date('2026-10-29T10:00:00.000Z');
      const transition = service.calculateStreakTransition(existing, completedAt);

      expect(transition.action).toBe('INCREMENTED');
      expect(transition.currentStreak).toBe(5);
      expect(transition.longestStreak).toBe(5);
      expect(transition.lastActivityDate).toBe('2026-10-29');
      expect(transition.deltaDays).toBe(1);
      expect(transition.isNewRecord).toBe(true);
    });

    it('11. Dia imediatamente consecutivo sem superar recorde: incrementa streak e preserva recorde histórico', () => {
      const existing: UserStreak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 2,
        longestStreak: 10,
        lastActivityDate: '2026-10-28',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedAt = new Date('2026-10-29T08:00:00.000Z');
      const transition = service.calculateStreakTransition(existing, completedAt);

      expect(transition.action).toBe('INCREMENTED');
      expect(transition.currentStreak).toBe(3);
      expect(transition.longestStreak).toBe(10);
      expect(transition.lastActivityDate).toBe('2026-10-29');
      expect(transition.deltaDays).toBe(1);
      expect(transition.isNewRecord).toBe(false);
    });

    it('12. Quebra de sequência (intervalo > 1 dia): reinicia streak em 1 e preserva recorde histórico', () => {
      const existing: UserStreak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 7,
        longestStreak: 12,
        lastActivityDate: '2026-10-25',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedAt = new Date('2026-10-28T16:00:00.000Z'); // 3 dias depois
      const transition = service.calculateStreakTransition(existing, completedAt);

      expect(transition.action).toBe('RESET');
      expect(transition.currentStreak).toBe(1);
      expect(transition.longestStreak).toBe(12);
      expect(transition.lastActivityDate).toBe('2026-10-28');
      expect(transition.deltaDays).toBe(3);
      expect(transition.isNewRecord).toBe(false);
    });

    it('13. Evento retroativo (deltaDays < 0): forward-only ignora alteração no streak', () => {
      const existing: UserStreak = {
        id: 'streak-1',
        userId: 'user-1',
        currentStreak: 5,
        longestStreak: 8,
        lastActivityDate: '2026-10-28',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const completedAt = new Date('2026-10-20T12:00:00.000Z'); // Passado
      const transition = service.calculateStreakTransition(existing, completedAt);

      expect(transition.action).toBe('IGNORED_RETROACTIVE');
      expect(transition.currentStreak).toBe(5);
      expect(transition.longestStreak).toBe(8);
      expect(transition.lastActivityDate).toBe('2026-10-28');
      expect(transition.deltaDays).toBeLessThan(0);
      expect(transition.isNewRecord).toBe(false);
    });

    it('14. Transição de meia-noite estrita em UTC: 23:59:59 para 00:00:01 é consecutivo', () => {
      const lateNight = new Date('2026-10-28T23:59:59.999Z');
      const earlyMorning = new Date('2026-10-29T00:00:01.000Z');

      const firstTransition = service.calculateStreakTransition(null, lateNight);
      expect(firstTransition.lastActivityDate).toBe('2026-10-28');

      const mockRecord: UserStreak = {
        id: 's-1',
        userId: 'u-1',
        currentStreak: firstTransition.currentStreak,
        longestStreak: firstTransition.longestStreak,
        lastActivityDate: firstTransition.lastActivityDate,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const secondTransition = service.calculateStreakTransition(mockRecord, earlyMorning);
      expect(secondTransition.action).toBe('INCREMENTED');
      expect(secondTransition.currentStreak).toBe(2);
      expect(secondTransition.lastActivityDate).toBe('2026-10-29');
    });
  });

  describe('advanceStreakAtomic (Repository Integration)', () => {
    it('15. deve persistir a primeira transição no repositório com lock do usuário', async () => {
      const mockRepo = new MockUserStreakRepository();
      const service = new StreakService(mockRepo);

      const res = await service.advanceStreakAtomic(
        'user-abc',
        new Date('2026-10-28T15:00:00.000Z')
      );

      expect(res.transition.action).toBe('STARTED');
      expect(res.streak.currentStreak).toBe(1);
      expect(res.streak.longestStreak).toBe(1);
      expect(res.streak.lastActivityDate).toBe('2026-10-28');

      const stored = await mockRepo.findByUserId('user-abc');
      expect(stored).not.toBeNull();
      expect(stored?.currentStreak).toBe(1);
    });

    it('16. não deve re-escrever no banco quando a atividade ocorrer no mesmo dia', async () => {
      const mockRepo = new MockUserStreakRepository();
      const service = new StreakService(mockRepo);

      // Dia 1
      await service.advanceStreakAtomic('user-abc', new Date('2026-10-28T10:00:00.000Z'));

      // Segunda atividade no mesmo dia
      const res = await service.advanceStreakAtomic(
        'user-abc',
        new Date('2026-10-28T18:00:00.000Z')
      );

      expect(res.transition.action).toBe('MAINTAINED_SAME_DAY');
      expect(res.streak.currentStreak).toBe(1);
    });

    it('17. deve avançar para dias consecutivos através do serviço', async () => {
      const mockRepo = new MockUserStreakRepository();
      const service = new StreakService(mockRepo);

      await service.advanceStreakAtomic('user-abc', new Date('2026-10-28T10:00:00.000Z'));
      const res = await service.advanceStreakAtomic(
        'user-abc',
        new Date('2026-10-29T10:00:00.000Z')
      );

      expect(res.transition.action).toBe('INCREMENTED');
      expect(res.streak.currentStreak).toBe(2);
      expect(res.streak.longestStreak).toBe(2);
    });
  });
});
