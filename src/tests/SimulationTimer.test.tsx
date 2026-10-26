import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SimulationTimer } from '../components/simulations/SimulationTimer.tsx';

describe('SimulationTimer (src/tests/SimulationTimer.test.tsx)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. deve exibir "Sem limite de tempo" quando initialSeconds for null', () => {
    render(<SimulationTimer initialSeconds={null} />);
    expect(screen.getByText('Sem limite de tempo')).toBeInTheDocument();
  });

  it('2. deve formatar tempo com MM:SS quando inferior a 1 hora', () => {
    render(<SimulationTimer initialSeconds={125} />);
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('3. deve formatar tempo com HH:MM:SS quando igual ou superior a 1 hora', () => {
    render(<SimulationTimer initialSeconds={3665} />);
    expect(screen.getByText('01:01:05')).toBeInTheDocument();
  });

  it('4. deve decrementar o tempo a cada segundo', () => {
    render(<SimulationTimer initialSeconds={60} />);
    expect(screen.getByText('01:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('00:57')).toBeInTheDocument();
  });

  it('5. deve disparar onExpire quando o tempo zerar', () => {
    const onExpireMock = vi.fn();
    render(<SimulationTimer initialSeconds={2} onExpire={onExpireMock} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onExpireMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  it('6. não deve decrementar se disabled for true', () => {
    render(<SimulationTimer initialSeconds={50} disabled={true} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('00:50')).toBeInTheDocument();
  });
});
