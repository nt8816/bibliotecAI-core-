import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchArquivosAulaData() {
  return requestPlatformApi('/v1/arquivos-aula');
}

export async function createArquivosAulaPost(payload) {
  return requestPlatformApi('/v1/arquivos-aula', {
    method: 'POST',
    body: payload,
  });
}

export async function updateArquivosAulaFiles(postId, arquivos) {
  return requestPlatformApi(`/v1/arquivos-aula/${postId}/arquivos`, {
    method: 'PATCH',
    body: { arquivos },
  });
}

export async function deleteArquivosAulaPost(postId) {
  return requestPlatformApi(`/v1/arquivos-aula/${postId}/delete`, {
    method: 'POST',
  });
}
