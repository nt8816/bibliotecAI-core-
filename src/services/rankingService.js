import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchRankingData() {
  const payload = await requestPlatformApi('/v1/rankings');
  return {
    currentStudentId: payload?.currentStudentId || null,
    currentTurma: payload?.currentTurma || null,
    ranking: Array.isArray(payload?.ranking) ? payload.ranking : [],
  };
}
