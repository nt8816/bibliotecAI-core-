import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');

describe('CSP headers', () => {
  it('allows Google Fonts stylesheets and font files', () => {
    expect(headers).toContain('https://fonts.googleapis.com');
    expect(headers).toContain('https://fonts.gstatic.com');
  });

  it('allows Cloudflare Insights beacon script', () => {
    expect(headers).toContain('https://static.cloudflareinsights.com');
  });

  it('keeps connect-src open to https and wss for Supabase', () => {
    expect(headers).toMatch(/connect-src[^;]*https:/);
    expect(headers).toMatch(/connect-src[^;]*wss:/);
  });
});
