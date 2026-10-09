import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = process.cwd();
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('Workers AI models are not deprecated', () => {
  const worker = read('cloudflare/api-ia/src/index.ts');
  const proxy = read('supabase/functions/cloudflare-ai-proxy/index.ts');
  const frontend = read('src/lib/cloudflareAiApi.js');
  const env = read('.env');

  it('AI worker does not call deprecated infire-llama model', () => {
    // pickModel may mention the id only to reject/fallback it.
    expect(worker).not.toMatch(/AI\.run\(['"]@cf\/meta\/infire-llama/);
    expect(worker).toContain('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    expect(worker).toContain('@cf/black-forest-labs/flux-1-schnell');
    expect(worker).toContain('@cf/myshell-ai/melotts');
  });

  it('AI worker rejects deprecated model ids and falls back', () => {
    expect(worker).toContain("includes('infire-llama')");
    expect(worker).toContain('pickModel');
  });

  it('edge proxy points to active AI worker host', () => {
    expect(proxy).toContain('api-bibliotecai.plataforma-bibliotecai.workers.dev');
    expect(proxy).not.toContain('api-bibliotecai.ntn3223.workers.dev');
  });

  it('edge proxy fails open on rate-limit RPC errors', () => {
    expect(proxy.toLowerCase()).toContain('fail open');
  });

  it('frontend uses same-origin Platform AI routes first', () => {
    expect(frontend).toContain("'/text': '/v1/ai/text'");
    expect(frontend).toContain('requestPlatformApi');
    expect(frontend).toContain('failed to fetch');
  });

  it('gateway exposes same-origin AI routes', () => {
    const gateway = read('cloudflare/api-gateway/src/index.ts');
    expect(gateway).toContain("'POST /v1/ai/text'");
    expect(gateway).toContain("'POST /v1/ai/image'");
    expect(gateway).toContain("'POST /v1/ai/audio'");
    expect(gateway).toContain('api-bibliotecai.plataforma-bibliotecai.workers.dev');
  });

  it('AI worker CORS allows tenant bibliotecai.com.br subdomains', () => {
    expect(worker).toContain("endsWith('.bibliotecai.com.br')");
  });
});
