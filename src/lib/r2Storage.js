import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { supabase } from '@/integrations/supabase/client';

function sanitizeFileName(fileName) {
  return String(fileName || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]/g, '_');
}

export function buildR2ObjectKey({ escolaId, ownerId, scope = 'arquivos-aula', fileName }) {
  const safeName = sanitizeFileName(fileName);
  const timestamp = Date.now();
  return `escolas/${escolaId}/${scope}/${ownerId}/${timestamp}-${safeName}`;
}

async function getUserAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Sessao invalida. Faca login novamente.');
  }
  return accessToken;
}

function buildR2NetworkErrorMessage(error, action) {
  const message = String(error?.message || '');
  if (message.toLowerCase().includes('failed to fetch')) {
    return `Falha de rede ao ${action} no Cloudflare R2. Verifique o CORS do bucket e tente novamente.`;
  }
  return message || `Nao foi possivel ${action} no Cloudflare R2.`;
}

export async function uploadFileToR2({ file, escolaId, ownerId, scope = 'arquivos-aula' }) {
  if (!file) throw new Error('Arquivo nao informado.');
  if (!escolaId || !ownerId) throw new Error('Contexto do upload incompleto.');

  const objectKey = buildR2ObjectKey({
    escolaId,
    ownerId,
    scope,
    fileName: file.name,
  });
  const accessToken = await getUserAccessToken();

  const payload = await invokeEdgeFunction('r2-storage', {
    body: {
      operation: 'create_upload_url',
      objectKey,
      contentType: file.type || 'application/octet-stream',
      fileName: file.name,
    },
    requireAuth: false,
    headers: {
      'x-user-access-token': accessToken,
    },
    transport: 'http',
    fallbackErrorMessage: 'Nao foi possivel iniciar o upload para o Cloudflare R2.',
  });

  let uploadResponse;
  try {
    uploadResponse = await fetch(payload.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
  } catch (error) {
    throw new Error(buildR2NetworkErrorMessage(error, 'enviar o arquivo'));
  }

  if (!uploadResponse.ok) {
    throw new Error(`Falha ao enviar arquivo para o Cloudflare R2 (HTTP ${uploadResponse.status}).`);
  }

  return {
    provider: 'r2',
    objectKey: payload.objectKey || objectKey,
    publicUrl: payload.publicUrl || null,
  };
}

function dataUrlToFile(dataUrl, fileName = 'arquivo.bin') {
  const source = String(dataUrl || '');
  const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) throw new Error('Data URL invalida para upload.');

  const mimeType = match[1] || 'application/octet-stream';
  const encoded = match[3] || '';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}

export async function uploadDataUrlToR2({
  dataUrl,
  escolaId,
  ownerId,
  scope = 'imagens',
  fileName = 'arquivo.bin',
}) {
  const file = dataUrlToFile(dataUrl, fileName);
  return uploadFileToR2({ file, escolaId, ownerId, scope });
}

export async function getR2DownloadUrl(objectKey, fileName) {
  const accessToken = await getUserAccessToken();
  let payload;
  try {
    payload = await invokeEdgeFunction('r2-storage', {
      body: {
        operation: 'create_download_url',
        objectKey,
        fileName,
      },
      requireAuth: false,
      headers: {
        'x-user-access-token': accessToken,
      },
      transport: 'http',
      fallbackErrorMessage: 'Nao foi possivel preparar o download do arquivo.',
    });
  } catch (error) {
    throw new Error(buildR2NetworkErrorMessage(error, 'preparar o download'));
  }

  return payload.downloadUrl;
}

export async function deleteR2Object(objectKey) {
  const accessToken = await getUserAccessToken();
  try {
    await invokeEdgeFunction('r2-storage', {
      body: {
        operation: 'delete_object',
        objectKey,
      },
      requireAuth: false,
      headers: {
        'x-user-access-token': accessToken,
      },
      transport: 'http',
      fallbackErrorMessage: 'Nao foi possivel excluir o arquivo do Cloudflare R2.',
    });
  } catch (error) {
    throw new Error(buildR2NetworkErrorMessage(error, 'excluir o arquivo'));
  }
}
