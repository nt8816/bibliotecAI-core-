const LEGACY_DOMAIN_NAME = process.env.LEGACY_DOMAIN_NAME || 'bibliotec-ai-core.vercel.app';
const LEGACY_DOMAIN_DISABLE_AFTER = process.env.LEGACY_DOMAIN_DISABLE_AFTER || '2026-04-11T03:00:00.000Z';
const LEGACY_DOMAIN_PROJECT_ID = process.env.LEGACY_DOMAIN_PROJECT_ID || process.env.VERCEL_PROJECT_ID || '';
const LEGACY_DOMAIN_TEAM_ID = process.env.LEGACY_DOMAIN_TEAM_ID || '';
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function removeLegacyDomain() {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(LEGACY_DOMAIN_PROJECT_ID)}/domains/${encodeURIComponent(LEGACY_DOMAIN_NAME)}`);
  if (LEGACY_DOMAIN_TEAM_ID) {
    url.searchParams.set('teamId', LEGACY_DOMAIN_TEAM_ID);
  }

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${VERCEL_ACCESS_TOKEN}`,
    },
  });

  if (response.ok) {
    return { removed: true, status: response.status };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = await response.text();
  }

  const code = payload?.error?.code || payload?.code || '';
  if (response.status === 404 || code === 'not_found') {
    return { removed: false, alreadyMissing: true, status: response.status, payload };
  }

  const error = new Error(payload?.error?.message || payload?.message || `Falha ao remover dominio legado (HTTP ${response.status}).`);
  error.status = response.status;
  error.payload = payload;
  throw error;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  if (!LEGACY_DOMAIN_PROJECT_ID || !VERCEL_ACCESS_TOKEN) {
    return json(res, 500, {
      ok: false,
      error: 'Configuracao incompleta para desligar o dominio legado.',
    });
  }

  const cutoff = new Date(LEGACY_DOMAIN_DISABLE_AFTER);
  if (Number.isNaN(cutoff.getTime())) {
    return json(res, 500, {
      ok: false,
      error: 'Data de desligamento invalida.',
      cutoff: LEGACY_DOMAIN_DISABLE_AFTER,
    });
  }

  const now = new Date();
  if (now.getTime() < cutoff.getTime()) {
    return json(res, 202, {
      ok: true,
      pending: true,
      domain: LEGACY_DOMAIN_NAME,
      disableAfter: cutoff.toISOString(),
      now: now.toISOString(),
    });
  }

  try {
    const result = await removeLegacyDomain();
    return json(res, 200, {
      ok: true,
      domain: LEGACY_DOMAIN_NAME,
      disableAfter: cutoff.toISOString(),
      now: now.toISOString(),
      ...result,
    });
  } catch (error) {
    return json(res, error?.status || 500, {
      ok: false,
      domain: LEGACY_DOMAIN_NAME,
      disableAfter: cutoff.toISOString(),
      now: now.toISOString(),
      error: error?.message || 'Falha inesperada ao desligar dominio legado.',
      payload: error?.payload || null,
    });
  }
}
