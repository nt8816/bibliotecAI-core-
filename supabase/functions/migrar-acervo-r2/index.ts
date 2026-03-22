import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type ScopeName =
  | 'arquivos_aula_posts'
  | 'reclamacoes_super_admin'
  | 'comunidade_posts'
  | 'laboratorio_criacoes'
  | 'audiobooks_biblioteca'
  | 'atividades_entregas';

type Payload = {
  scope?: ScopeName | 'all';
};

type MigrationStats = {
  scannedRows: number;
  updatedRows: number;
  migratedFiles: number;
  skippedRows: number;
  errors: string[];
};

function getUserToken(req: Request) {
  const manualToken = req.headers.get('x-user-access-token') || '';
  const authHeader = req.headers.get('Authorization') || '';
  return String(manualToken || authHeader.replace(/^Bearer\s+/i, '')).trim();
}

function sanitizeFileName(fileName: string) {
  return String(fileName || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_');
}

function buildObjectKey({
  escolaId,
  ownerId,
  scope,
  fileName,
}: {
  escolaId: string;
  ownerId: string;
  scope: string;
  fileName: string;
}) {
  const safeName = sanitizeFileName(fileName);
  return `escolas/${escolaId}/${scope}/${ownerId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

function buildPublicUrl(baseUrl: string, objectKey: string) {
  const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalizedBase) return null;
  return `${normalizedBase}/${objectKey}`;
}

function ensureArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function isR2ObjectKey(value: unknown) {
  return typeof value === 'string' && value.startsWith('escolas/');
}

function isDataUrl(value: unknown) {
  return typeof value === 'string' && value.startsWith('data:');
}

function isHttpUrl(value: unknown) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function extractFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    return sanitizeFileName(lastSegment || 'arquivo');
  } catch {
    return 'arquivo';
  }
}

function extractR2ObjectKeyFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const marker = '/escolas/';
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return null;
    return parsed.pathname.slice(index + 1);
  } catch {
    return null;
  }
}

function bytesFromBase64(base64Value: string) {
  const binary = atob(base64Value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeDataUrl(dataUrl: string) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) {
    throw new Error('Data URL invalida.');
  }

  return {
    contentType: match[1] || 'application/octet-stream',
    bytes: bytesFromBase64(match[3] || ''),
  };
}

function extensionFromContentType(contentType: string) {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('ogg')) return 'ogg';
  return 'bin';
}

function parseEntregaPayload(rawText: string) {
  const source = String(rawText || '');
  const marker = '[ENTREGA_PAYLOAD_V1]';

  if (!source.startsWith(marker)) {
    return {
      usedMarker: false,
      texto: source,
      imagens: [] as string[],
      respostas: {} as Record<string, string>,
    };
  }

  try {
    const encoded = source.slice(marker.length).trim();
    const decoded = decodeURIComponent(escape(atob(encoded)));
    const parsed = JSON.parse(decoded) || {};
    return {
      usedMarker: true,
      texto: String(parsed?.texto || ''),
      imagens: ensureArray(parsed?.imagens).filter((item) => typeof item === 'string'),
      respostas: parsed?.respostas && typeof parsed.respostas === 'object' ? parsed.respostas : {},
    };
  } catch {
    return {
      usedMarker: true,
      texto: '',
      imagens: [] as string[],
      respostas: {} as Record<string, string>,
    };
  }
}

function serializeEntregaPayload(payload: { texto: string; imagens: string[]; respostas: Record<string, string> }) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload || {}))));
  return `[ENTREGA_PAYLOAD_V1]${encoded}`;
}

async function uploadBytesToR2({
  s3,
  bucket,
  objectKey,
  bytes,
  contentType,
}: {
  s3: S3Client;
  bucket: string;
  objectKey: string;
  bytes: Uint8Array;
  contentType: string;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: bytes,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
}

async function downloadLegacyStorageObject(adminClient: ReturnType<typeof createClient>, bucket: string, path: string) {
  const { data, error } = await adminClient.storage.from(bucket).download(path);
  if (error || !data) {
    throw error || new Error(`Nao foi possivel baixar ${path} do bucket ${bucket}.`);
  }

  const buffer = await data.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    contentType: data.type || 'application/octet-stream',
  };
}

async function downloadHttpObject(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar URL legada (${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}

async function migrateMediaValue({
  value,
  escolaId,
  ownerId,
  scope,
  defaultFileName,
  s3,
  bucket,
}: {
  value: string;
  escolaId: string;
  ownerId: string;
  scope: string;
  defaultFileName: string;
  s3: S3Client;
  bucket: string;
}) {
  if (!value || !escolaId || !ownerId) {
    return { changed: false, value };
  }

  if (isR2ObjectKey(value)) {
    return { changed: false, value };
  }

  if (isHttpUrl(value)) {
    const existingKey = extractR2ObjectKeyFromUrl(value);
    if (existingKey) {
      return { changed: true, value: existingKey };
    }

    const fileName = extractFileNameFromUrl(value) || defaultFileName;
    const { bytes, contentType } = await downloadHttpObject(value);
    const objectKey = buildObjectKey({ escolaId, ownerId, scope, fileName });
    await uploadBytesToR2({ s3, bucket, objectKey, bytes, contentType });
    return { changed: true, value: objectKey };
  }

  if (isDataUrl(value)) {
    const { bytes, contentType } = decodeDataUrl(value);
    const extension = extensionFromContentType(contentType);
    const safeName = defaultFileName.includes('.') ? defaultFileName : `${defaultFileName}.${extension}`;
    const objectKey = buildObjectKey({ escolaId, ownerId, scope, fileName: safeName });
    await uploadBytesToR2({ s3, bucket, objectKey, bytes, contentType });
    return { changed: true, value: objectKey };
  }

  return { changed: false, value };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
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

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
      return jsonResponse({ success: false, error: 'Configuracao do ambiente incompleta.' }, 500);
    }

    const userToken = getUserToken(req);
    if (!userToken) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerData, error: callerError } = await callerClient.auth.getUser(userToken);
    const caller = callerData?.user;
    if (callerError || !caller) {
      return jsonResponse({ success: false, error: 'Sessao invalida.' }, 401);
    }

    const { data: roleRows, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (roleError || !(roleRows || []).some((item) => item.role === 'super_admin')) {
      return jsonResponse({ success: false, error: 'Apenas Super Admin pode migrar o acervo.' }, 403);
    }

    let payload: Payload = { scope: 'all' };
    try {
      payload = { scope: 'all', ...(await req.json()) };
    } catch {
      // use default
    }

    const requestedScopes: ScopeName[] = payload.scope && payload.scope !== 'all'
      ? [payload.scope]
      : [
          'arquivos_aula_posts',
          'reclamacoes_super_admin',
          'comunidade_posts',
          'laboratorio_criacoes',
          'audiobooks_biblioteca',
          'atividades_entregas',
        ];

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    const profileByIdCache = new Map<string, { id: string; escola_id: string | null; user_id: string | null; email: string | null } | null>();
    const profileByUserIdCache = new Map<string, { id: string; escola_id: string | null; user_id: string | null; email: string | null } | null>();
    const profileByEmailCache = new Map<string, { id: string; escola_id: string | null; user_id: string | null; email: string | null } | null>();

    const getProfileById = async (profileId: string | null | undefined) => {
      const key = String(profileId || '').trim();
      if (!key) return null;
      if (profileByIdCache.has(key)) return profileByIdCache.get(key) || null;

      const { data } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, escola_id, user_id, email')
        .eq('id', key)
        .maybeSingle();

      profileByIdCache.set(key, data || null);
      if (data?.user_id) profileByUserIdCache.set(String(data.user_id), data);
      if (data?.email) profileByEmailCache.set(String(data.email).toLowerCase(), data);
      return data || null;
    };

    const getProfileByUserId = async (userId: string | null | undefined) => {
      const key = String(userId || '').trim();
      if (!key) return null;
      if (profileByUserIdCache.has(key)) return profileByUserIdCache.get(key) || null;

      const { data } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, escola_id, user_id, email')
        .eq('user_id', key)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      profileByUserIdCache.set(key, data || null);
      if (data?.id) profileByIdCache.set(String(data.id), data);
      if (data?.email) profileByEmailCache.set(String(data.email).toLowerCase(), data);
      return data || null;
    };

    const getProfileByEmail = async (email: string | null | undefined) => {
      const key = String(email || '').trim().toLowerCase();
      if (!key) return null;
      if (profileByEmailCache.has(key)) return profileByEmailCache.get(key) || null;

      const { data } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, escola_id, user_id, email')
        .ilike('email', key)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      profileByEmailCache.set(key, data || null);
      if (data?.id) profileByIdCache.set(String(data.id), data);
      if (data?.user_id) profileByUserIdCache.set(String(data.user_id), data);
      return data || null;
    };

    const summaries: Record<string, MigrationStats> = {};

    const runScope = async (scopeName: ScopeName, handler: () => Promise<MigrationStats>) => {
      summaries[scopeName] = await handler();
    };

    if (requestedScopes.includes('arquivos_aula_posts')) {
      await runScope('arquivos_aula_posts', async () => {
        const stats: MigrationStats = { scannedRows: 0, updatedRows: 0, migratedFiles: 0, skippedRows: 0, errors: [] };
        const { data: rows, error } = await adminClient
          .from('arquivos_aula_posts')
          .select('id, escola_id, autor_id, arquivos');
        if (error) throw error;

        for (const row of rows || []) {
          stats.scannedRows += 1;
          if (!row?.id || !row?.escola_id || !row?.autor_id) {
            stats.skippedRows += 1;
            continue;
          }

          const arquivos = ensureArray(row.arquivos);
          let changed = false;
          const nextArquivos = [];

          for (let index = 0; index < arquivos.length; index += 1) {
            const arquivo = arquivos[index] || {};
            const currentPath = String(arquivo?.object_key || arquivo?.path || '').trim();

            if (!currentPath || isR2ObjectKey(currentPath) || String(arquivo?.provider || '').toLowerCase() === 'r2') {
              nextArquivos.push(arquivo);
              continue;
            }

            try {
              const { bytes, contentType } = await downloadLegacyStorageObject(adminClient, 'arquivos-aula', currentPath);
              const fileName = String(arquivo?.nome || extractFileNameFromUrl(currentPath) || `arquivo-${index + 1}`);
              const objectKey = buildObjectKey({
                escolaId: row.escola_id,
                ownerId: row.autor_id,
                scope: 'arquivos-aula',
                fileName,
              });

              await uploadBytesToR2({ s3, bucket: r2Bucket, objectKey, bytes, contentType });

              nextArquivos.push({
                ...arquivo,
                path: objectKey,
                object_key: objectKey,
                provider: 'r2',
                public_url: buildPublicUrl(r2PublicBaseUrl, objectKey),
                tamanho: Number(arquivo?.tamanho || 0) > 0 ? arquivo.tamanho : bytes.byteLength,
                mime_type: arquivo?.mime_type || contentType,
              });
              changed = true;
              stats.migratedFiles += 1;
            } catch (migrationError) {
              stats.errors.push(`arquivos_aula_posts:${row.id}:${migrationError instanceof Error ? migrationError.message : 'erro'}`);
              nextArquivos.push(arquivo);
            }
          }

          if (changed) {
            const { error: updateError } = await adminClient
              .from('arquivos_aula_posts')
              .update({ arquivos: nextArquivos })
              .eq('id', row.id);
            if (updateError) {
              stats.errors.push(`arquivos_aula_posts:${row.id}:${updateError.message}`);
            } else {
              stats.updatedRows += 1;
            }
          }
        }

        return stats;
      });
    }

    const migrateArrayTable = async ({
      scopeName,
      table,
      column,
      scopePrefix,
      select,
      resolveContext,
    }: {
      scopeName: ScopeName;
      table: ScopeName;
      column: 'image_urls' | 'imagem_urls';
      scopePrefix: string;
      select: string;
      resolveContext: (row: Record<string, unknown>) => Promise<{ escolaId: string | null; ownerId: string | null }>;
    }) => {
      await runScope(scopeName, async () => {
        const stats: MigrationStats = { scannedRows: 0, updatedRows: 0, migratedFiles: 0, skippedRows: 0, errors: [] };
        const { data: rows, error } = await adminClient.from(table).select(select);
        if (error) throw error;

        for (const row of rows || []) {
          stats.scannedRows += 1;
          const { escolaId, ownerId } = await resolveContext(row);
          if (!row?.id || !escolaId || !ownerId) {
            stats.skippedRows += 1;
            continue;
          }

          let changed = false;
          const currentValues = ensureArray(row?.[column]).filter((item) => typeof item === 'string');
          const nextValues = [];

          for (let index = 0; index < currentValues.length; index += 1) {
            const currentValue = String(currentValues[index] || '');
            try {
              const migrated = await migrateMediaValue({
                value: currentValue,
                escolaId,
                ownerId,
                scope: scopePrefix,
                defaultFileName: `${scopePrefix}-${row.id}-${index + 1}.bin`,
                s3,
                bucket: r2Bucket,
              });
              if (migrated.changed) {
                changed = true;
                stats.migratedFiles += 1;
              }
              nextValues.push(migrated.value);
            } catch (migrationError) {
              stats.errors.push(`${table}:${row.id}:${migrationError instanceof Error ? migrationError.message : 'erro'}`);
              nextValues.push(currentValue);
            }
          }

          if (changed) {
            const { error: updateError } = await adminClient
              .from(table)
              .update({ [column]: nextValues })
              .eq('id', row.id);
            if (updateError) {
              stats.errors.push(`${table}:${row.id}:${updateError.message}`);
            } else {
              stats.updatedRows += 1;
            }
          }
        }

        return stats;
      });
    };

    if (requestedScopes.includes('reclamacoes_super_admin')) {
      await migrateArrayTable({
        scopeName: 'reclamacoes_super_admin',
        table: 'reclamacoes_super_admin',
        column: 'image_urls',
        scopePrefix: 'reclamacoes',
        select: 'id, escola_id, sender_profile_id, sender_user_id, sender_email, image_urls',
        resolveContext: async (row) => {
          const byProfile = await getProfileById(String(row.sender_profile_id || ''));
          const byUser = byProfile || await getProfileByUserId(String(row.sender_user_id || ''));
          const byEmail = byUser || await getProfileByEmail(String(row.sender_email || ''));
          return {
            escolaId: String(row.escola_id || byEmail?.escola_id || '') || null,
            ownerId: String(row.sender_profile_id || byEmail?.id || row.id || '') || null,
          };
        },
      });
    }

    if (requestedScopes.includes('comunidade_posts')) {
      await migrateArrayTable({
        scopeName: 'comunidade_posts',
        table: 'comunidade_posts',
        column: 'imagem_urls',
        scopePrefix: 'comunidade',
        select: 'id, escola_id, autor_id, imagem_urls',
        resolveContext: async (row) => ({
          escolaId: String(row.escola_id || '') || null,
          ownerId: String(row.autor_id || row.id || '') || null,
        }),
      });
    }

    if (requestedScopes.includes('laboratorio_criacoes')) {
      await migrateArrayTable({
        scopeName: 'laboratorio_criacoes',
        table: 'laboratorio_criacoes',
        column: 'imagem_urls',
        scopePrefix: 'laboratorio',
        select: 'id, escola_id, aluno_id, imagem_urls',
        resolveContext: async (row) => ({
          escolaId: String(row.escola_id || '') || null,
          ownerId: String(row.aluno_id || row.id || '') || null,
        }),
      });
    }

    if (requestedScopes.includes('audiobooks_biblioteca')) {
      await runScope('audiobooks_biblioteca', async () => {
        const stats: MigrationStats = { scannedRows: 0, updatedRows: 0, migratedFiles: 0, skippedRows: 0, errors: [] };
        const { data: rows, error } = await adminClient
          .from('audiobooks_biblioteca')
          .select('id, escola_id, criado_por, titulo, audio_url');
        if (error) throw error;

        for (const row of rows || []) {
          stats.scannedRows += 1;
          if (!row?.id || !row?.escola_id || !row?.criado_por || !row?.audio_url) {
            stats.skippedRows += 1;
            continue;
          }

          try {
            const migrated = await migrateMediaValue({
              value: String(row.audio_url),
              escolaId: row.escola_id,
              ownerId: row.criado_por,
              scope: 'audiobooks',
              defaultFileName: `${sanitizeFileName(String(row.titulo || row.id))}.mp3`,
              s3,
              bucket: r2Bucket,
            });

            if (!migrated.changed) continue;

            const { error: updateError } = await adminClient
              .from('audiobooks_biblioteca')
              .update({ audio_url: migrated.value })
              .eq('id', row.id);

            if (updateError) {
              stats.errors.push(`audiobooks_biblioteca:${row.id}:${updateError.message}`);
            } else {
              stats.updatedRows += 1;
              stats.migratedFiles += 1;
            }
          } catch (migrationError) {
            stats.errors.push(`audiobooks_biblioteca:${row.id}:${migrationError instanceof Error ? migrationError.message : 'erro'}`);
          }
        }

        return stats;
      });
    }

    if (requestedScopes.includes('atividades_entregas')) {
      await runScope('atividades_entregas', async () => {
        const stats: MigrationStats = { scannedRows: 0, updatedRows: 0, migratedFiles: 0, skippedRows: 0, errors: [] };
        const { data: rows, error } = await adminClient
          .from('atividades_entregas')
          .select('id, aluno_id, texto_entrega, anexo_url');
        if (error) throw error;

        for (const row of rows || []) {
          stats.scannedRows += 1;
          if (!row?.id || !row?.aluno_id) {
            stats.skippedRows += 1;
            continue;
          }

          const profile = await getProfileById(String(row.aluno_id || ''));
          if (!profile?.escola_id) {
            stats.skippedRows += 1;
            continue;
          }

          const payload = parseEntregaPayload(String(row.texto_entrega || ''));
          const sourceImages = [...payload.imagens];
          if (row.anexo_url && !sourceImages.includes(String(row.anexo_url))) {
            sourceImages.push(String(row.anexo_url));
          }

          let changed = false;
          const nextImages: string[] = [];

          for (let index = 0; index < sourceImages.length; index += 1) {
            const currentValue = String(sourceImages[index] || '');
            try {
              const migrated = await migrateMediaValue({
                value: currentValue,
                escolaId: profile.escola_id,
                ownerId: row.aluno_id,
                scope: 'atividades-entregas',
                defaultFileName: `entrega-${row.id}-${index + 1}.jpg`,
                s3,
                bucket: r2Bucket,
              });
              if (migrated.changed) {
                changed = true;
                stats.migratedFiles += 1;
              }
              nextImages.push(migrated.value);
            } catch (migrationError) {
              stats.errors.push(`atividades_entregas:${row.id}:${migrationError instanceof Error ? migrationError.message : 'erro'}`);
              nextImages.push(currentValue);
            }
          }

          if (!changed && sourceImages.length === payload.imagens.length) {
            continue;
          }

          const nextPayload = serializeEntregaPayload({
            texto: payload.texto,
            imagens: nextImages,
            respostas: payload.respostas,
          });

          const { error: updateError } = await adminClient
            .from('atividades_entregas')
            .update({
              texto_entrega: nextPayload,
              anexo_url: nextImages[0] || null,
            })
            .eq('id', row.id);

          if (updateError) {
            stats.errors.push(`atividades_entregas:${row.id}:${updateError.message}`);
          } else {
            stats.updatedRows += 1;
          }
        }

        return stats;
      });
    }

    return jsonResponse({
      success: true,
      requestedScopes,
      summaries,
    });
  } catch (error) {
    console.error('migrar-acervo-r2 error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Falha inesperada na migracao.' },
      500,
    );
  }
});
