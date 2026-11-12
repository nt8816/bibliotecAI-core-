import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway from '../../cloudflare/api-gateway/src/index.ts';
import { contactNotification, customerEmail } from '../../cloudflare/api-gateway/src/contactEmail.ts';

const env = { SUPABASE_URL: 'https://supabase.test', SUPABASE_PUBLISHABLE_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
const data = { nome: 'Ana', email: 'ana@example.com', escola: 'Escola', assunto: 'Duvidas', mensagem: 'Olá!' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const request = (body = data) => new Request('https://api.test/v1/contato', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllGlobals());

describe('contato público', () => {
  it('protege os modelos HTML contra conteúdo inserido pelos visitantes', () => {
    const content = '<img src=x onerror=alert(1)>';
    const notice = contactNotification({ ...data, nome: content, mensagem: content });
    expect(notice.html).not.toContain(content);
    expect(notice.html).toContain('&lt;img');
    expect(notice.text).toContain(content);
    const reply = customerEmail(content, content, 'Retorno BibliotecAI');
    expect(reply.html).not.toContain(content);
    expect(reply.html).toContain('&lt;img');
    expect(reply.text).toContain(content);
  });
  it('valida campos antes de acessar o banco', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect((await gateway.fetch(request({ ...data, email: 'inválido' }), env)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('grava e envia a notificação com endereço de resposta do visitante', async () => {
    const fetchMock = vi.fn(async (url) => url.includes('/rpc/') ? json('123') : json(null));
    vi.stubGlobal('fetch', fetchMock);
    const send = vi.fn().mockResolvedValue({ messageId: '1' });
    const response = await gateway.fetch(request(), { ...env, CONTACT_EMAIL: { send } });
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'plataforma.bibliotecai@gmail.com', replyTo: data.email, text: expect.stringContaining(data.mensagem) }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email_status: 'enviado' });
  });
  it('preserva a mensagem e registra falha quando o email falha', async () => {
    const fetchMock = vi.fn(async (url) => url.includes('/rpc/') ? json('123') : json(null));
    vi.stubGlobal('fetch', fetchMock);
    const response = await gateway.fetch(request(), { ...env, CONTACT_EMAIL: { send: vi.fn().mockRejectedValue(new Error('offline')) } });
    expect(response.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ email_status: 'falhou' });
  });
  it('limita tentativas sem enviar email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(null)));
    const send = vi.fn();
    expect((await gateway.fetch(request(), { ...env, CONTACT_EMAIL: { send } })).status).toBe(429);
    expect(send).not.toHaveBeenCalled();
  });
  it('nega acesso anônimo à lista administrativa', async () => {
    expect((await gateway.fetch(new Request('https://api.test/v1/admin/contatos'), env)).status).toBe(403);
  });
});
