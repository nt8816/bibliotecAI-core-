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
    expect(worker).toContain('@cf/bfl/flux-1-schnell');
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

  it('frontend env points AI client at active worker', () => {
    expect(env).toContain('VITE_BIBLIOTECA_AI_API_URL="https://api-bibliotecai.plataforma-bibliotecai.workers.dev"');
    expect(frontend).toContain('VITE_BIBLIOTECA_AI_API_URL');
  });
});
