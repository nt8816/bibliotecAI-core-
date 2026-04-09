const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function removePort(hostname) {
  return String(hostname || '').toLowerCase().split(':')[0];
}

export function buildTenantAccessUrl(tenant, nextPath = '/dashboard') {
  const subdomain = String(tenant?.subdominio || '').trim().toLowerCase();
  if (!subdomain || typeof window === 'undefined') return '';

  const baseDomain = String(import.meta.env.VITE_APP_BASE_DOMAIN || '').trim().toLowerCase();
  const host = removePort(window.location.hostname);
  const protocol = window.location.protocol || 'https:';
  const normalizedPath = String(nextPath || '/dashboard').trim() || '/dashboard';
  const path = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;

  if (baseDomain && !LOCAL_HOSTS.has(host)) {
    return `${protocol}//${subdomain}.${baseDomain}${path}`;
  }

  return `${window.location.origin}${path.includes('?') ? `${path}&tenant=${encodeURIComponent(subdomain)}` : `${path}?tenant=${encodeURIComponent(subdomain)}`}`;
}

export function shouldRedirectToTenantHost(tenant) {
  const subdomain = String(tenant?.subdominio || '').trim().toLowerCase();
  if (!subdomain || typeof window === 'undefined') return false;

  const host = removePort(window.location.hostname);
  const baseDomain = String(import.meta.env.VITE_APP_BASE_DOMAIN || '').trim().toLowerCase();
  const query = new URLSearchParams(window.location.search);
  const currentTenant = String(query.get('tenant') || '').trim().toLowerCase();

  if (LOCAL_HOSTS.has(host)) {
    return currentTenant !== subdomain;
  }

  if (baseDomain && host === `${subdomain}.${baseDomain}`) {
    return false;
  }

  return true;
}
