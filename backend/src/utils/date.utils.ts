/**
 * Utilitários para cálculos determinísticos de datas baseados estritamente em UTC.
 * Evita desvios provocados por fuso horário local e horário de verão (DST).
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Converte um objeto Date em uma string no formato de calendário "YYYY-MM-DD" em UTC.
 */
export function getCalendarDateUTC(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converte uma string "YYYY-MM-DD" em um objeto Date configurado exatamente para 00:00:00.000 UTC.
 */
export function parseCalendarDateUTC(dateStr: string): Date {
  if (!dateStr || !DATE_REGEX.test(dateStr)) {
    throw new Error(`Data inválida para conversão UTC: "${dateStr}". Formato esperado: YYYY-MM-DD.`);
  }

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

  // Validação de overflow de calendário (ex: 2026-02-30 ou 2026-04-31)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Data de calendário inválida: "${dateStr}".`);
  }

  return date;
}

/**
 * Calcula a diferença em dias de calendário inteiros entre duas datas UTC (to - from).
 * Retorna:
 *  0 se as datas forem o mesmo dia
 *  1 se to for o dia imediatamente posterior a from (consecutivo)
 * >1 se houver intervalo (quebra de sequência)
 * <0 se to for anterior a from (evento retroativo)
 */
export function calendarDaysBetween(fromUTC: string, toUTC: string): number {
  const fromDate = parseCalendarDateUTC(fromUTC);
  const toDate = parseCalendarDateUTC(toUTC);

  const diffMs = toDate.getTime() - fromDate.getTime();
  return Math.round(diffMs / MS_PER_DAY);
}

/**
 * Adiciona ou subtrai um número inteiro de dias de calendário a uma data "YYYY-MM-DD" em UTC.
 */
export function addCalendarDaysUTC(dateStr: string, days: number): string {
  const date = parseCalendarDateUTC(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return getCalendarDateUTC(date);
}

/**
 * Verifica se a data atual é exatamente o dia seguinte à data anterior em UTC.
 */
export function isConsecutiveDayUTC(previousDateStr: string, currentDateStr: string): boolean {
  return calendarDaysBetween(previousDateStr, currentDateStr) === 1;
}

/**
 * Verifica se duas datas correspondem ao mesmo dia de calendário em UTC.
 */
export function isSameDayUTC(date1Str: string, date2Str: string): boolean {
  return date1Str === date2Str;
}
