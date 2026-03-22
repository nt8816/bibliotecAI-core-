import { useEffect, useRef, useState } from 'react';
import { MapPinned, ShieldAlert } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { logSystemEvent } from '@/lib/systemLogger';

const LOG_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXACT_LOCATION_MAX_ACCURACY_METERS = 100;
const DESKTOP_LOCATION_MAX_ACCURACY_METERS = 10000;
const STORAGE_PREFIX = 'super-admin-access-log:v1';

function getStorageKey(userId) {
  return `${STORAGE_PREFIX}:${userId || 'anon'}`;
}

function readLastSnapshotAt(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Number(parsed?.ts) || 0;
  } catch {
    return 0;
  }
}

function writeLastSnapshotAt(userId, pathname) {
  try {
    localStorage.setItem(
      getStorageKey(userId),
      JSON.stringify({ ts: Date.now(), path: pathname }),
    );
  } catch {
    // ignore storage failures
  }
}

function getPermissionState() {
  if (!navigator?.permissions?.query) return Promise.resolve('unsupported');

  return navigator.permissions
    .query({ name: 'geolocation' })
    .then((result) => result.state || 'unknown')
    .catch(() => 'unknown');
}

function getCurrentPosition() {
  if (!navigator?.geolocation?.getCurrentPosition) {
    return Promise.reject(new Error('Geolocalizacao nao suportada'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
    });
  });
}

async function reverseGeocodeCity(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: 'pt',
  });

  const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Falha ao resolver cidade (${response.status})`);
  }

  const data = await response.json();
  return {
    city: data.city || data.locality || data.principalSubdivision || null,
    principalSubdivision: data.principalSubdivision || null,
    countryName: data.countryName || null,
    locality: data.locality || null,
  };
}

function isExactLocation(accuracy) {
  return Number.isFinite(accuracy) && accuracy > 0 && accuracy <= EXACT_LOCATION_MAX_ACCURACY_METERS;
}

function isDesktopDevice() {
  if (typeof navigator === 'undefined') return false;
  const userAgent = String(navigator.userAgent || '').toLowerCase();
  return !/android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

function isAcceptedLocationAccuracy(accuracy) {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return false;
  if (isDesktopDevice()) {
    return accuracy <= DESKTOP_LOCATION_MAX_ACCURACY_METERS;
  }
  return isExactLocation(accuracy);
}

export function SuperAdminAccessLogger() {
  const location = useLocation();
  const { user, loading, isSuperAdmin } = useAuth();
  const inFlightRef = useRef(false);
  const [blockedReason, setBlockedReason] = useState('');

  useEffect(() => {
    if (loading || !user?.id || !isSuperAdmin) {
      setBlockedReason('');
      return;
    }
    if (inFlightRef.current) return;

    const lastSnapshotAt = readLastSnapshotAt(user.id);
    if (lastSnapshotAt && Date.now() - lastSnapshotAt < LOG_INTERVAL_MS) {
      setBlockedReason('');
      return;
    }

    inFlightRef.current = true;

    const captureAccess = async () => {
      const permissionState = await getPermissionState();
      const baseContext = {
        capture_window_hours: 24,
        geolocation_permission: permissionState,
        login_pathname: location.pathname,
        captured_at: new Date().toISOString(),
        trigger: 'super_admin_login',
        requested_high_accuracy: true,
      };

      try {
        const position = await getCurrentPosition();
        const latitude = Number(position.coords?.latitude);
        const longitude = Number(position.coords?.longitude);
        const accuracy = Number(position.coords?.accuracy);

        if (!isAcceptedLocationAccuracy(accuracy)) {
          setBlockedReason('A plataforma exige compartilhamento de localizacao para acesso de Super Admin. Em celular, use localizacao precisa. Em computador, permita a localizacao do navegador para continuar.');
          logSystemEvent({
            level: 'warn',
            event: 'super_admin_login_snapshot',
            message: 'Login de super admin bloqueado por localizacao insuficiente.',
            path: location.pathname,
            context: {
              ...baseContext,
              geolocation_status: 'insufficient',
              device_type: isDesktopDevice() ? 'desktop' : 'mobile',
              coordinates: {
                latitude: Number.isFinite(latitude) ? latitude : null,
                longitude: Number.isFinite(longitude) ? longitude : null,
                accuracy_meters: Number.isFinite(accuracy) ? accuracy : null,
              },
              exact_location_required: true,
              exact_location_max_accuracy_meters: EXACT_LOCATION_MAX_ACCURACY_METERS,
              desktop_location_max_accuracy_meters: DESKTOP_LOCATION_MAX_ACCURACY_METERS,
            },
          });
          return;
        }

        let cityData = {
          city: null,
          principalSubdivision: null,
          countryName: null,
          locality: null,
        };

        try {
          cityData = await reverseGeocodeCity(latitude, longitude);
        } catch (cityError) {
          cityData = {
            ...cityData,
            error: cityError?.message || 'Falha ao resolver cidade',
          };
        }

        setBlockedReason('');
        logSystemEvent({
          level: 'info',
          event: 'super_admin_login_snapshot',
          message: 'Login de super admin registrado.',
          path: location.pathname,
          context: {
            ...baseContext,
            geolocation_status: 'captured',
            city: cityData.city,
            locality: cityData.locality,
            state: cityData.principalSubdivision,
            country: cityData.countryName,
            exact_location_required: true,
            exact_location_max_accuracy_meters: EXACT_LOCATION_MAX_ACCURACY_METERS,
            desktop_location_max_accuracy_meters: DESKTOP_LOCATION_MAX_ACCURACY_METERS,
            device_type: isDesktopDevice() ? 'desktop' : 'mobile',
            coordinates: {
              latitude: Number.isFinite(latitude) ? latitude : null,
              longitude: Number.isFinite(longitude) ? longitude : null,
              accuracy_meters: Number.isFinite(accuracy) ? accuracy : null,
            },
            reverse_geocode_error: cityData.error || null,
          },
        });
        writeLastSnapshotAt(user.id, location.pathname);
      } catch (error) {
        setBlockedReason('A localizacao exata e obrigatoria para seguranca da plataforma. Compartilhe a localizacao precisa para liberar o uso do painel de Super Admin.');
        logSystemEvent({
          level: 'warn',
          event: 'super_admin_login_snapshot',
          message: 'Login de super admin bloqueado sem localizacao exata.',
          path: location.pathname,
          context: {
            ...baseContext,
            geolocation_status: 'unavailable',
            geolocation_error: error?.message || 'Falha ao capturar localizacao',
            exact_location_required: true,
            exact_location_max_accuracy_meters: EXACT_LOCATION_MAX_ACCURACY_METERS,
            desktop_location_max_accuracy_meters: DESKTOP_LOCATION_MAX_ACCURACY_METERS,
            device_type: isDesktopDevice() ? 'desktop' : 'mobile',
          },
        });
      } finally {
        inFlightRef.current = false;
      }
    };

    void captureAccess();
  }, [isSuperAdmin, loading, location.pathname, user?.id]);

  if (!isSuperAdmin || !blockedReason) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] bg-background/96 backdrop-blur-sm">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border border-destructive/30 bg-card p-6 shadow-2xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-bold">Localizacao exata obrigatoria</p>
              <p className="text-sm text-muted-foreground">Acesso protegido do Super Admin</p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-6 text-foreground/85">
            {blockedReason}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="button" onClick={() => window.location.reload()}>
              <MapPinned className="mr-2 h-4 w-4" />
              Tentar novamente com localizacao exata
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
