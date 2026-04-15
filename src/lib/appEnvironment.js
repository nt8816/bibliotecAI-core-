const APP_ENV = String(import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development')
  .trim()
  .toLowerCase();

const APP_ENV_LABEL = String(import.meta.env.VITE_APP_ENV_LABEL || '')
  .trim();

const APP_WRITE_GUARD = String(import.meta.env.VITE_APP_WRITE_GUARD || '')
  .trim()
  .toLowerCase();

const ALLOW_REAL_WRITES = String(import.meta.env.VITE_ALLOW_REAL_WRITES || 'false')
  .trim()
  .toLowerCase() === 'true';

const PLATFORM_API_BASE_URL = String(import.meta.env.VITE_PLATFORM_API_BASE_URL || '')
  .trim()
  .toLowerCase();

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '')
  .trim()
  .toLowerCase();

const SANDBOX_PUBLIC_URL = String(import.meta.env.VITE_SANDBOX_PUBLIC_URL || '')
  .trim();

function inferProductionHost(value) {
  return value.includes('bibliotecai.com.br')
    || value.includes('supabase.co')
    || value.includes('workers.dev');
}

export function getAppEnvironment() {
  return APP_ENV;
}

export function getAppEnvironmentLabel() {
  if (APP_ENV_LABEL) return APP_ENV_LABEL;

  if (APP_ENV === 'production') return 'Producao';
  if (APP_ENV === 'homolog') return 'Homologacao';
  if (APP_ENV === 'test') return 'Teste';
  if (APP_ENV === 'development') return 'Desenvolvimento';
  return APP_ENV;
}

export function getPlatformApiBaseUrl() {
  return PLATFORM_API_BASE_URL;
}

export function getSupabaseUrl() {
  return SUPABASE_URL;
}

export function getSandboxPublicUrl() {
  return SANDBOX_PUBLIC_URL;
}

export function isProductionEnvironment() {
  return APP_ENV === 'production';
}

export function isProtectedNonProductionEnvironment() {
  return !isProductionEnvironment() && APP_WRITE_GUARD === 'readonly';
}

export function isPointingToLikelyProductionServices() {
  return inferProductionHost(PLATFORM_API_BASE_URL) || inferProductionHost(SUPABASE_URL);
}

export function canPerformRealWrites() {
  if (isProductionEnvironment()) return true;
  if (APP_WRITE_GUARD !== 'readonly') return true;
  return ALLOW_REAL_WRITES;
}

export function getWriteGuardReason(method = 'GET', routePath = '') {
  const normalizedMethod = String(method || 'GET').trim().toUpperCase();
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    return '';
  }

  if (String(routePath || '').startsWith('/v1/auth/')) {
    return '';
  }

  if (canPerformRealWrites()) {
    return '';
  }

  const targetHint = isPointingToLikelyProductionServices()
    ? ' Os endpoints atuais parecem ser de producao.'
    : '';

  return `Operacao bloqueada no ambiente ${getAppEnvironmentLabel()}. Escritas reais estao desativadas.${targetHint}`;
}

export function getEnvironmentBannerVariant() {
  if (isProductionEnvironment()) return 'production';
  if (isProtectedNonProductionEnvironment()) return 'protected';
  return 'default';
}
