import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchCurrentSession,
  loginUser,
  logoutUser,
  registerUser,
} from '../services/api.ts';
import type {
  AuthSessionInfo,
  AuthSessionResponse,
  AuthUser,
  LoginRequestPayload,
  RegisterRequestPayload,
} from '../types/index.ts';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSessionInfo | null;
  sessionCheckError: string | null;
  login: (payload: LoginRequestPayload) => Promise<AuthSessionResponse>;
  register: (payload: RegisterRequestPayload) => Promise<AuthSessionResponse>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provedor de Autenticação do QuestForge.
 *
 * Regras absolutas:
 * - Consulta `GET /api/auth/me` com `credentials: 'include'` (cookie HttpOnly).
 * - NUNCA utiliza `localStorage`, `sessionStorage` ou `IndexedDB`.
 * - Só atualiza o estado para `authenticated` ou `unauthenticated` após confirmação real do backend.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSessionInfo | null>(null);
  const [sessionCheckError, setSessionCheckError] = useState<string | null>(null);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    setSessionCheckError(null);

    try {
      const current = await fetchCurrentSession(signal);
      if (signal?.aborted) return;

      if (current) {
        setUser(current.user);
        setSession(current.session);
        setStatus('authenticated');
      } else {
        setUser(null);
        setSession(null);
        setStatus('unauthenticated');
      }
    } catch (error) {
      if (signal?.aborted) return;
      setUser(null);
      setSession(null);
      setStatus('unauthenticated');
      setSessionCheckError(
        error instanceof Error
          ? error.message
          : 'Não foi possível verificar o estado da sessão no servidor.'
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  const login = useCallback(async (payload: LoginRequestPayload): Promise<AuthSessionResponse> => {
    const result = await loginUser(payload);
    setUser(result.user);
    setSession(result.session);
    setSessionCheckError(null);
    setStatus('authenticated');
    return result;
  }, []);

  const register = useCallback(
    async (payload: RegisterRequestPayload): Promise<AuthSessionResponse> => {
      const result = await registerUser(payload);
      setUser(result.user);
      setSession(result.session);
      setSessionCheckError(null);
      setStatus('authenticated');
      return result;
    },
    []
  );

  const logout = useCallback(async (): Promise<void> => {
    await logoutUser();
    setUser(null);
    setSession(null);
    setSessionCheckError(null);
    setStatus('unauthenticated');
  }, []);

  const refreshSession = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        session,
        sessionCheckError,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  }
  return context;
}
