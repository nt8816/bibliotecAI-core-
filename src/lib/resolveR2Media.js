import { getR2DownloadUrl } from '@/lib/r2Storage';

export function isR2ObjectKey(value) {
  return typeof value === 'string' && value.startsWith('escolas/');
}

export async function resolveR2MediaUrl(value, fileName = 'arquivo') {
  if (!isR2ObjectKey(value)) return value;
  try {
    return await getR2DownloadUrl(value, fileName);
  } catch {
    return value;
  }
}

export async function resolveR2MediaUrls(values, fileNamePrefix = 'arquivo') {
  const list = Array.isArray(values) ? values : [];
  return Promise.all(
    list.map((value, index) => resolveR2MediaUrl(value, `${fileNamePrefix}-${index + 1}`)),
  );
}
