/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTenantBySubdomain } from '@/services/tenantService';

const TenantContext = createContext(undefined);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'assets', 'cdn']);

function removePort(hostname) {
  return (hostname || '').toLowerCase().split(':')[0];
}

function getBaseDomainFromEnv() {
  return (import.meta.env.VITE_APP_BASE_DOMAIN || '').trim().toLowerCase();
}

function extractSubdomain(hostname) {
  const host = removePort(hostname);
  const envBaseDomain = getBaseDomainFromEnv();
  const query = new URLSearchParams(window.location.search);
  const forcedTenant = (query.get('tenant') || '').trim().toLowerCase();
  const forcedAdmin = query.get('admin') === '1';

  if (!host) return { mode: 'root', subdomain: null };
  if (forcedTenant) return { mode: 'tenant', subdomain: forcedTenant };
  if (forcedAdmin) return { mode: 'admin', subdomain: null };
  if (host.startsWith('admin.')) return { mode: 'admin', subdomain: null };
  if (LOCAL_HOSTS.has(host)) return { mode: 'root', subdomain: null };

  if (envBaseDomain && host.endsWith(`.${envBaseDomain}`)) {
    const suffix = `.${envBaseDomain}`;
    const subdomain = host.slice(0, host.length - suffix.length);
    if (!subdomain) return { mode: 'root', subdomain: null };
    if (subdomain === 'admin') return { mode: 'admin', subdomain: null };
    return { mode: 'tenant', subdomain };
  }

  return { mode: 'root', subdomain: null };
}

export function TenantProvider({ children }) {
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('root');

  useEffect(() => {
    let mounted = true;

    const resolveTenant = async () => {
      setLoading(true);
      setError(null);
      const { mode: hostMode, subdomain } = extractSubdomain(window.location.hostname);
      setMode(hostMode);
      const syntheticTenant = subdomain
        ? {
            id: `host-${subdomain}`,
            nome: subdomain,
            subdominio: subdomain,
            ativo: true,
          }
        : null;

      if (hostMode !== 'tenant') {
        if (mounted) {
          setTenant(null);
          setLoading(false);
        }
        return;
      }

      try {
        const data = await resolveTenantBySubdomain(subdomain);
        if (mounted) {
          setTenant(data || syntheticTenant);
          if (!data) setError('Tenant nao encontrado para este subdominio. Usando fallback do host.');
        }
      } catch {
        if (mounted) {
          setTenant(syntheticTenant);
          setError('Falha ao validar tenant pelo backend. Usando fallback do host.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    resolveTenant();
    return () => { mounted = false; };
  }, []);

  const value = useMemo(() => ({
    tenant,
    loading,
    error,
    mode,
    isTenantHost: mode === 'tenant',
    isAdminHost: mode === 'admin',
  }), [tenant, loading, error, mode]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) throw new Error('useTenant must be used within a TenantProvider');
  return context;
}
