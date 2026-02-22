/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
  const vercelProjectHost = (import.meta.env.VITE_VERCEL_PROJECT_HOST || '').trim().toLowerCase();

  if (!host) return { mode: 'root', subdomain: null };

  if (host.startsWith('admin.')) {
    return { mode: 'admin', subdomain: null };
  }

  if (LOCAL_HOSTS.has(host)) {
    const localTenant = new URLSearchParams(window.location.search).get('tenant');
    if (localTenant) {
      return { mode: 'tenant', subdomain: localTenant.toLowerCase() };
    }

    const localAdmin = new URLSearchParams(window.location.search).get('admin');
    if (localAdmin === '1') {
      return { mode: 'admin', subdomain: null };
    }

    return { mode: 'root', subdomain: null };
  }

  if (envBaseDomain && host.endsWith(`.${envBaseDomain}`)) {
    const suffix = `.${envBaseDomain}`;
    const subdomain = host.slice(0, host.length - suffix.length);

    if (!subdomain) return { mode: 'root', subdomain: null };
    if (subdomain === 'admin') return { mode: 'admin', subdomain: null };

    return { mode: 'tenant', subdomain };
  }

  if (host.endsWith('.vercel.app')) {
    // Root/preview domains on vercel.app are not tenant hosts.
    // Example root: bibliotec-ai-core.vercel.app
    // Example preview: feature-branch--bibliotec-ai-core.vercel.app
    if (host.includes('--')) {
      return { mode: 'root', subdomain: null };
    }

    if (vercelProjectHost && host === vercelProjectHost) {
      return { mode: 'root', subdomain: null };
    }

    const parts = host.split('.');
    if (parts.length === 3) {
      return { mode: 'root', subdomain: null };
    }

    if (parts.length >= 4) {
      if (parts[0] === 'admin') return { mode: 'admin', subdomain: null };
      if (!RESERVED_SUBDOMAINS.has(parts[0])) {
        return { mode: 'tenant', subdomain: parts[0] };
      }
    }
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

      if (hostMode !== 'tenant') {
        if (mounted) {
          setTenant(null);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error: tenantError } = await supabase
          .from('tenants')
          .select('id, nome, escola_id, subdominio, schema_name, plano, ativo')
          .eq('subdominio', subdomain)
          .eq('ativo', true)
          .maybeSingle();

        if (tenantError || !data) {
          throw tenantError || new Error('Tenant não encontrado');
        }

        if (mounted) {
          setTenant(data);
        }
      } catch (_error) {
        if (mounted) {
          setTenant(null);
          setError('Tenant não encontrado para este subdomínio.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    resolveTenant();

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo(
    () => ({
      tenant,
      loading,
      error,
      mode,
      isTenantHost: mode === 'tenant',
      isAdminHost: mode === 'admin',
    }),
    [tenant, loading, error, mode],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }

  return context;
}
