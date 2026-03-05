import { describe, expect, it, vi, beforeEach } from 'vitest';

const getSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const functionsInvokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
      signOut: vi.fn(),
    },
    functions: {
      invoke: functionsInvokeMock,
    },
  },
}));

describe('invokeEdgeFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls edge function without JWT when requireAuth is false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { invokeEdgeFunction } = await import('./invokeEdgeFunction');
    const data = await invokeEdgeFunction('gerar-imagem-ia', {
      body: { prompt: 'Astronaut riding a horse' },
      requireAuth: false,
    });

    expect(data).toEqual({ ok: true });
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(refreshSessionMock).not.toHaveBeenCalled();
    expect(functionsInvokeMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/functions/v1/gerar-imagem-ia');
    expect(options.method).toBe('POST');
    expect(options.headers.apikey).toBeTruthy();
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.headers.authorization).toBeUndefined();
  });
});
