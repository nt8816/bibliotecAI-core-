import { getSupabaseRealtimeClient } from '@/integrations/supabase/client';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getAtividadeIdsFromSaveResponse(response) {
  const ids = new Set();
  const candidates = [
    response?.id,
    response?.atividadeId,
    response?.atividade_id,
    response?.data?.id,
    response?.data?.atividadeId,
    response?.data?.atividade_id,
  ];

  candidates.forEach((value) => {
    const normalized = String(value || '').trim();
    if (normalized) ids.add(normalized);
  });

  const arrayCandidates = [
    response?.ids,
    response?.atividadeIds,
    response?.atividade_ids,
    response?.data?.ids,
    response?.data?.atividadeIds,
    response?.data?.atividade_ids,
    response?.items,
    response?.data?.items,
  ];

  arrayCandidates.forEach((value) => {
    ensureArray(value).forEach((item) => {
      const normalized = String(
        item?.id || item?.atividadeId || item?.atividade_id || item || '',
      ).trim();
      if (normalized) ids.add(normalized);
    });
  });

  return Array.from(ids);
}

export async function fetchAtividadeMateriaisMap(atividadeIds) {
  const ids = [...new Set(
    ensureArray(atividadeIds)
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )];
  if (ids.length === 0) return new Map();

  const supabase = getSupabaseRealtimeClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from('atividades_leitura')
    .select('id, materiais_apoio')
    .in('id', ids);

  if (error) throw error;

  return new Map(
    ensureArray(data).map((item) => [
      String(item?.id || '').trim(),
      ensureArray(item?.materiais_apoio),
    ]),
  );
}

export async function persistAtividadeMateriais(atividadeIdsOrResponse, materiaisApoio) {
  const ids = Array.isArray(atividadeIdsOrResponse)
    ? atividadeIdsOrResponse
    : getAtividadeIdsFromSaveResponse(atividadeIdsOrResponse);
  const normalizedIds = [...new Set(
    ensureArray(ids)
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )];

  if (normalizedIds.length === 0) return [];

  const supabase = getSupabaseRealtimeClient();
  if (!supabase) return [];

  const { error } = await supabase
    .from('atividades_leitura')
    .update({ materiais_apoio: ensureArray(materiaisApoio) })
    .in('id', normalizedIds);

  if (error) throw error;
  return normalizedIds;
}
