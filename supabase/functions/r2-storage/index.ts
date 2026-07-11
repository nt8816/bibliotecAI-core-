import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ["https://bibliotecai.com.br", "https://app.bibliotecai.com.br", "http://localhost:5173", "http://localhost:3000"];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner';


const jsonResponse = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' },
  });

type Payload = {
  operation?: 'create_upload_url' | 'create_download_url' | 'delete_object' | 'upload_object';
  objectKey?: string;
  contentType?: string;
  fileName?: string;
  fileDataBase64?: string;
};

function getUserToken(req: Request) {
  const manualToken = req.headers.get('x-user-access-token') || '';
  const authHeader = req.headers.get('Authorization') || '';
  return String(manualToken || authHeader.replace(/^Bearer\s+/i, '')).trim();
}

function buildPublicUrl(baseUrl: string, objectKey: string) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return null;
  return `${normalizedBase}/${objectKey}`;
}

function sanitizeObjectKey(objectKey: string) {
  return String(objectKey || '')
    .replace(/^\/+/, '')
    .replace(/%/g, '')       // Remove URL-encoded characters
    .replace(/\.\./g, '')    // Remove path traversal
    .replace(/\0/g, '')      // Remove null bytes
    .replace(/[^a-zA-Z0-9._/\-]/g, '_')  // Allow only safe characters
    .trim();
}

function extractSchoolIdFromObjectKey(objectKey: string) {
  const match = String(objectKey || '').match(/^escolas\/([^/]+)\//);
  return match?.[1] || null;
}

function decodeBase64ToUint8Array(value: string) {
  const normalized = String(value || '').replace(/^data:[^,]+,/, '').trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJwtHeader(token: string) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;

  try {
    const normalized = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function signHs256Jwt(secret: string, payload: Record<string, unknown>) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getSupabaseRestServiceToken(serviceRoleKey: string) {
  const jwtHeader = parseJwtHeader(serviceRoleKey);
  const algorithm = String(jwtHeader?.alg || '').toUpperCase();
  if (algorithm !== 'ES256') return serviceRoleKey;

  const jwtSecret = String(Deno.env.get('SUPABASE_JWT_SECRET') || '').trim();
  if (!jwtSecret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY usa ES256. Configure SUPABASE_JWT_SECRET na function r2-storage.');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (60 * 60);
  return signHs256Jwt(jwtSecret, {
    aud: 'authenticated',
    exp: expiresAt,
    iat: now,
    iss: 'supabase',
    role: 'service_role',
    sub: 'service_role',
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const r2AccountId = Deno.env.get('R2_ACCOUNT_ID') ?? '';
    const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
    const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
    const r2Bucket = Deno.env.get('R2_BUCKET') ?? '';
    const r2PublicBaseUrl = Deno.env.get('R2_PUBLIC_BASE_URL') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuracao do Supabase incompleta.' }, 500);
    }

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
      return jsonResponse({ success: false, error: 'Configuracao do Cloudflare R2 incompleta.' }, 500);
    }

    const userToken = getUserToken(req);
    if (!userToken) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adminServiceToken = await getSupabaseRestServiceToken(serviceRoleKey);
    const adminClient = createClient(supabaseUrl, adminServiceToken, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser(userToken);
    const caller = callerData?.user;
    if (callerError || !caller) {
      return jsonResponse({ success: false, error: 'Sessao invalida.' }, 401);
    }

    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (callerRolesError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel validar permissoes do usuario.' }, 403);
    }

    const isSuperAdmin = (callerRoles || []).some((item) => item.role === 'super_admin');

    const { data: profile, error: profileError } = isSuperAdmin
      ? { data: null, error: null }
      : await adminClient
          .from('usuarios_biblioteca')
          .select('id, escola_id, tipo')
          .eq('user_id', caller.id)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

    if (!isSuperAdmin && (profileError || !profile?.escola_id)) {
      return jsonResponse({ success: false, error: 'Nao foi possivel identificar a escola do usuario.' }, 403);
    }

    let payload: Payload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'JSON invalido no corpo da requisicao.' }, 400);
    }

    const operation = payload?.operation;
    const objectKey = sanitizeObjectKey(payload?.objectKey || '');

    if (!operation || !objectKey) {
      return jsonResponse({ success: false, error: 'Operacao ou chave do objeto ausente.' }, 400);
    }

    const objectSchoolId = extractSchoolIdFromObjectKey(objectKey);
    const schoolPrefix = profile?.escola_id ? `escolas/${profile.escola_id}/` : null;
    if (!isSuperAdmin && (!schoolPrefix || !objectKey.startsWith(schoolPrefix))) {
      return jsonResponse({ success: false, error: 'Chave do objeto fora do escopo da escola.' }, 403);
    }
    if (isSuperAdmin && !objectSchoolId) {
      return jsonResponse({ success: false, error: 'Chave do objeto invalida para o R2.' }, 400);
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    if (operation === 'create_upload_url') {
      const contentType = String(payload?.contentType || 'application/octet-stream').trim();
      const command = new PutObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
      return jsonResponse({
        success: true,
        provider: 'r2',
        objectKey,
        uploadUrl,
        publicUrl: buildPublicUrl(r2PublicBaseUrl, objectKey),
      });
    }

    if (operation === 'upload_object') {
      const contentType = String(payload?.contentType || 'application/octet-stream').trim();
      const fileDataBase64 = String(payload?.fileDataBase64 || '').trim();
      if (!fileDataBase64) {
        return jsonResponse({ success: false, error: 'Conteudo do arquivo ausente.' }, 400);
      }

      await s3.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: objectKey,
          Body: decodeBase64ToUint8Array(fileDataBase64),
          ContentType: contentType,
        }),
      );

      return jsonResponse({
        success: true,
        provider: 'r2',
        objectKey,
        publicUrl: buildPublicUrl(r2PublicBaseUrl, objectKey),
      });
    }

    if (operation === 'create_download_url') {
      const fileName = String(payload?.fileName || 'arquivo').trim();
      const command = new GetObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`,
      });

      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
      return jsonResponse({
        success: true,
        objectKey,
        downloadUrl,
      });
    }

    if (operation === 'delete_object') {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: r2Bucket,
          Key: objectKey,
        }),
      );

      return jsonResponse({ success: true, objectKey });
    }

    return jsonResponse({ success: false, error: 'Operacao nao suportada.' }, 400);
  } catch (error) {
    console.error('r2-storage error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Falha inesperada no R2.' },
      500,
    );
  }
});
