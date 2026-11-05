import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiHttpError, getEducationalAnalysis } from '../services/api.ts';
import type { EducationalAnalysisResponseDTO } from '../types/index.ts';

export interface UseEducationalAnalysisResult {
  analysis: EducationalAnalysisResponseDTO | null;
  isLoading: boolean;
  error: Error | ApiHttpError | null;
  errorMessage: string | null;
  httpStatus: number | null;
  refetch: () => Promise<void>;
}

/**
 * Hook para carregamento reativo da análise educacional do estudante (Sprint 9.4).
 *
 * Características:
 * - Não persiste dados em localStorage/sessionStorage.
 * - Gerencia cancelamento via AbortController no desmonte do componente.
 * - Trata especificamente erros 401, 429 e 503.
 * - Suporta retry manual sem loop.
 */
export function useEducationalAnalysis(
  enabled: boolean = true
): UseEducationalAnalysisResult {
  const [analysis, setAnalysis] = useState<EducationalAnalysisResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | ApiHttpError | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  // Evita concorrência e vazamentos de requisições pendentes
  const activeControllerRef = useRef<AbortController | null>(null);

  const fetchAnalysis = useCallback(async () => {
    // Aborta qualquer requisição anterior ainda em andamento
    if (activeControllerRef.current) {
      activeControllerRef.current.abort();
    }

    const controller = new AbortController();
    activeControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setErrorMessage(null);
    setHttpStatus(null);

    try {
      const data = await getEducationalAnalysis(controller.signal);
      if (!controller.signal.aborted) {
        setAnalysis(data);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        // Ignora cancelamento voluntário no unmount
        return;
      }

      if (err instanceof ApiHttpError) {
        setError(err);
        setHttpStatus(err.status);
        if (err.status === 401) {
          setErrorMessage('Sua sessão expirou. Por favor, autentique-se novamente.');
        } else if (err.status === 429) {
          setErrorMessage(
            'Muitas requisições em curto intervalo. Aguarde alguns instantes antes de tentar novamente.'
          );
        } else if (err.status === 503) {
          setErrorMessage(
            'Serviço de análise educacional temporariamente indisponível. Tente novamente mais tarde.'
          );
        } else {
          setErrorMessage(err.message || 'Erro ao carregar análise educacional.');
        }
      } else if (err instanceof Error) {
        setError(err);
        setErrorMessage(err.message || 'Erro de comunicação ao carregar análise.');
      } else {
        const fallbackErr = new Error('Erro inesperado ao consultar análise educacional.');
        setError(fallbackErr);
        setErrorMessage('Erro inesperado ao consultar análise educacional.');
      }
    } finally {
      if (activeControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    void fetchAnalysis();

    return () => {
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, [enabled, fetchAnalysis]);

  return {
    analysis,
    isLoading,
    error,
    errorMessage,
    httpStatus,
    refetch: fetchAnalysis,
  };
}
