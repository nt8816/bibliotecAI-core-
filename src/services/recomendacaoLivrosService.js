import { requestPlatformApi } from '@/lib/platformApi';

export const fetchRecomendacaoLivros = () => requestPlatformApi('/v1/livros/recomendacao');
export const proximaRecomendacaoLivros = () => requestPlatformApi('/v1/livros/recomendacao/proximo', { method: 'POST' });
export const salvarPreferenciasLivros = (generos) => requestPlatformApi('/v1/livros/preferencias', { method: 'POST', body: { generos } });
