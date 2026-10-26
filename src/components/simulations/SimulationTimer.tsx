import { useEffect, useState, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface SimulationTimerProps {
  initialSeconds: number | null;
  onExpire?: () => void;
  disabled?: boolean;
}

export function SimulationTimer({
  initialSeconds,
  onExpire,
  disabled = false,
}: SimulationTimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(initialSeconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  // Atualiza se o valor inicial mudar (ex: ao carregar dados do servidor)
  useEffect(() => {
    setSecondsRemaining(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (disabled || secondsRemaining === null || secondsRemaining <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          if (onExpireRef.current) {
            onExpireRef.current();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [disabled, secondsRemaining === null]);

  if (secondsRemaining === null) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-xs font-mono text-neutral-400"
        title="Simulado sem limite de tempo"
      >
        <Clock className="h-3.5 w-3.5 text-neutral-500" />
        <span>Sem limite de tempo</span>
      </div>
    );
  }

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const formattedTime =
    hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isLowTime = secondsRemaining <= 300 && secondsRemaining > 0;
  const isExpired = secondsRemaining === 0;

  return (
    <div
      role="timer"
      aria-label={`Tempo restante: ${formattedTime}`}
      aria-live={isLowTime ? 'assertive' : 'off'}
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-mono font-medium transition-colors ${
        isExpired
          ? 'border-red-900/70 bg-red-950/40 text-red-300'
          : isLowTime
            ? 'border-amber-600/70 bg-amber-950/40 text-amber-300 animate-pulse'
            : 'border-neutral-800 bg-neutral-900/80 text-neutral-200'
      }`}
    >
      {isLowTime || isExpired ? (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      ) : (
        <Clock className="h-3.5 w-3.5 shrink-0 text-blue-400" />
      )}
      <span className="tabular-nums font-semibold tracking-wider">{formattedTime}</span>
    </div>
  );
}
