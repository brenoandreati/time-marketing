/** Cliente da API. Sempre via /api (proxy do Next.js) com o cookie de sessão httpOnly. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly fieldErrors?: Record<string, string>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...rest,
      credentials: 'same-origin',
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique sua conexão.', 0, 'network_error');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/entrar?next=${next}`;
    }
    throw new ApiError(body.message ?? `Erro ${res.status}`, res.status, body.code, body.fieldErrors, body);
  }
  return body as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);
