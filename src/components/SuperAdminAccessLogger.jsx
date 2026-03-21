import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { logSystemEvent } from '@/lib/systemLogger';

const LOG_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'super-admin-access-log:v1';

function isEligiblePath(pathname) {
  return pathname.startsWith('/admin') || pathname === '/reclamacoes';
}

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
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 10 * 60 * 1000,
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

export function SuperAdminAccessLogger() {
  const location = useLocation();
  const { user, loading, isSuperAdmin } = useAuth();
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (loading || !user?.id || !isSuperAdmin) return;
    if (!isEligiblePath(location.pathname)) return;
    if (inFlightRef.current) return;

    const lastSnapshotAt = readLastSnapshotAt(user.id);
    if (lastSnapshotAt && Date.now() - lastSnapshotAt < LOG_INTERVAL_MS) return;

    inFlightRef.current = true;

    const captureAccess = async () => {
      const permissionState = await getPermissionState();
      const baseContext = {
        capture_window_hours: 24,
        geolocation_permission: permissionState,
        pathname: location.pathname,
        captured_at: new Date().toISOString(),
      };

      try {
        const position = await getCurrentPosition();
        const latitude = Number(position.coords?.latitude);
        const longitude = Number(position.coords?.longitude);
        const accuracy = Number(position.coords?.accuracy);

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

        logSystemEvent({
          level: 'info',
          event: 'super_admin_access_snapshot',
          message: 'Acesso de super admin registrado.',
          path: location.pathname,
          context: {
            ...baseContext,
            geolocation_status: 'captured',
            city: cityData.city,
            locality: cityData.locality,
            state: cityData.principalSubdivision,
            country: cityData.countryName,
            coordinates: {
              latitude: Number.isFinite(latitude) ? latitude : null,
              longitude: Number.isFinite(longitude) ? longitude : null,
              accuracy_meters: Number.isFinite(accuracy) ? accuracy : null,
            },
            reverse_geocode_error: cityData.error || null,
          },
        });
      } catch (error) {
        logSystemEvent({
          level: 'warn',
          event: 'super_admin_access_snapshot',
          message: 'Acesso de super admin registrado sem localizacao precisa.',
          path: location.pathname,
          context: {
            ...baseContext,
            geolocation_status: 'unavailable',
            geolocation_error: error?.message || 'Falha ao capturar localizacao',
          },
        });
      } finally {
        writeLastSnapshotAt(user.id, location.pathname);
        inFlightRef.current = false;
      }
    };

    void captureAccess();
  }, [isSuperAdmin, loading, location.pathname, user?.id]);

  return null;
}
