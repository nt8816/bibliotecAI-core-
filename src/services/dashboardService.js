import { supabase } from '@/integrations/supabase/client';
import { isPlatformApiConfigured, isPlatformApiUnavailableError, requestPlatformApi } from '@/lib/platformApi';

async function requestWithFallback(platformCall, fallbackCall) {
  if (isPlatformApiConfigured()) {
    try {
      return await platformCall();
    } catch (error) {
      if (!isPlatformApiUnavailableError(error)) throw error;
    }
  }

  return fallbackCall();
}

function monthKey(dateValue) {
  const d = new Date(dateValue);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildLastMonths(size = 6) {
  const now = new Date();
  const keys = [];
  for (let i = size - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function estimateDataUrlBytes(value) {
  if (typeof value !== 'string' || !value || !value.startsWith('data:')) return 0;

  const [, payload = ''] = value.split(',', 2);
  const cleaned = payload.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function estimateUrlCollectionBytes(collection) {
  if (!Array.isArray(collection)) return 0;
  return collection.reduce((total, item) => total + estimateDataUrlBytes(item), 0);
}

function estimateArquivosBytes(arquivos) {
  if (!Array.isArray(arquivos)) return 0;

  return arquivos.reduce((total, arquivo) => {
    const tamanho = Number(arquivo?.tamanho);
    if (Number.isFinite(tamanho) && tamanho > 0) return total + tamanho;
    return total + estimateDataUrlBytes(arquivo?.url);
  }, 0);
}

export async function fetchDashboardData(userRole) {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/dashboard');
      return {
        stats: payload?.stats || {},
        atividades: Array.isArray(payload?.atividades) ? payload.atividades : [],
        emprestimosPorMes: Array.isArray(payload?.emprestimosPorMes) ? payload.emprestimosPorMes : [],
        livrosMaisEmprestados: Array.isArray(payload?.livrosMaisEmprestados) ? payload.livrosMaisEmprestados : [],
        escolasCadastradas: Array.isArray(payload?.escolasCadastradas) ? payload.escolasCadastradas : [],
        superAdminStats: payload?.superAdminStats || null,
      };
    },
    async () => {
      const baseQueries = [
        supabase.from('livros').select('*', { count: 'exact', head: true }),
        supabase.from('livros').select('*', { count: 'exact', head: true }).eq('disponivel', true),
        supabase.from('usuarios_biblioteca').select('*', { count: 'exact', head: true }),
        supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
        supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo').lt('data_devolucao_prevista', new Date().toISOString()),
        supabase.from('emprestimos').select('id, data_emprestimo, data_devolucao_real, status, livros(titulo), usuarios_biblioteca(nome)').order('created_at', { ascending: false }).limit(5),
        supabase.from('emprestimos').select('id, livro_id, created_at, data_emprestimo, status, livros(titulo)').order('created_at', { ascending: false }),
        supabase.from('tenants').select('id, nome, subdominio, ativo, escola_id').order('nome'),
        supabase.from('escolas').select('id, nome, gestor_id').order('nome'),
      ];

      const superAdminQueries = userRole === 'super_admin'
        ? [
            supabase.from('super_admin_accounts').select('id, ativo, bloqueado, tentativas_falhas'),
            supabase.rpc('get_reclamacoes_super_admin_feed'),
            supabase.from('arquivos_aula_posts').select('arquivos'),
            supabase.from('reclamacoes_super_admin').select('image_urls'),
            supabase.from('comunidade_posts').select('imagem_urls'),
            supabase.from('laboratorio_criacoes').select('imagem_urls'),
            supabase.from('audiobooks_biblioteca').select('audio_url'),
          ]
        : [];

      const results = await Promise.allSettled([...baseQueries, ...superAdminQueries]);
      const [
        livrosResult,
        livrosDisponiveisResult,
        usuariosResult,
        emprestimosAtivosResult,
        atrasadosResult,
        emprestimosRecentesResult,
        emprestimosDetalhadosResult,
        tenantsResult,
        escolasResult,
        superAdminsResult,
        reclamacoesFeedResult,
        arquivosAulaResult,
        reclamacoesImagensResult,
        comunidadeImagensResult,
        laboratorioImagensResult,
        audiobooksResult,
      ] = results;

      const stats = {
        totalLivros: livrosResult.status === 'fulfilled' ? (livrosResult.value.count || 0) : 0,
        livrosDisponiveis: livrosDisponiveisResult.status === 'fulfilled' ? (livrosDisponiveisResult.value.count || 0) : 0,
        totalUsuarios: usuariosResult.status === 'fulfilled' ? (usuariosResult.value.count || 0) : 0,
        emprestimosAtivos: emprestimosAtivosResult.status === 'fulfilled' ? (emprestimosAtivosResult.value.count || 0) : 0,
        emprestimosAtrasados: atrasadosResult.status === 'fulfilled' ? (atrasadosResult.value.count || 0) : 0,
      };

      const atividades = emprestimosRecentesResult.status === 'fulfilled' && emprestimosRecentesResult.value.data
        ? emprestimosRecentesResult.value.data.map((emp) => ({
          id: emp.id,
          tipo: emp.data_devolucao_real ? 'devolucao' : 'emprestimo',
          descricao: emp.data_devolucao_real
            ? `${emp.usuarios_biblioteca?.nome || 'Usuario'} devolveu "${emp.livros?.titulo || 'Livro'}"`
            : `${emp.usuarios_biblioteca?.nome || 'Usuario'} emprestou "${emp.livros?.titulo || 'Livro'}"`,
          data: emp.data_devolucao_real || emp.data_emprestimo,
        }))
        : [];

      let emprestimosPorMes = [];
      let livrosMaisEmprestados = [];
      if (emprestimosDetalhadosResult.status === 'fulfilled' && emprestimosDetalhadosResult.value.data) {
        const monthlyKeys = buildLastMonths(6);
        const monthlyMap = new Map(
          monthlyKeys.map((key) => [key, { key, mes: key, emprestimos: 0 }]),
        );
        const livroCountMap = new Map();

        emprestimosDetalhadosResult.value.data.forEach((emp) => {
          const loanDate = emp.data_emprestimo || emp.created_at;
          if (loanDate) {
            const key = monthKey(loanDate);
            if (monthlyMap.has(key)) monthlyMap.get(key).emprestimos += 1;
          }

          const livroNome = emp?.livros?.titulo || 'Livro sem titulo';
          livroCountMap.set(livroNome, (livroCountMap.get(livroNome) || 0) + 1);
        });

        emprestimosPorMes = Array.from(monthlyMap.values());
        livrosMaisEmprestados = Array.from(livroCountMap.entries())
          .map(([titulo, emprestimos]) => ({ titulo, emprestimos }))
          .sort((a, b) => b.emprestimos - a.emprestimos)
          .slice(0, 5);
      }

      const tenantsData = tenantsResult.status === 'fulfilled' ? (tenantsResult.value.data || []) : [];
      const escolasData = escolasResult.status === 'fulfilled' ? (escolasResult.value.data || []) : [];
      const tenantByEscolaId = new Map(
        tenantsData.filter((tenant) => tenant?.escola_id).map((tenant) => [tenant.escola_id, tenant]),
      );

      const escolasCompletas = escolasData.map((escola) => {
        const tenant = tenantByEscolaId.get(escola.id);
        return {
          id: tenant?.id || escola.id,
          escola_id: escola.id,
          nome: tenant?.nome || escola.nome,
          subdominio: tenant?.subdominio || null,
          ativo: tenant?.ativo ?? true,
          temTenant: Boolean(tenant),
          gestor_id: escola.gestor_id || null,
        };
      });

      const escolasSemBase = tenantsData
        .filter((tenant) => tenant?.escola_id && !escolasData.some((escola) => escola.id === tenant.escola_id))
        .map((tenant) => ({
          id: tenant.id,
          escola_id: tenant.escola_id,
          nome: tenant.nome,
          subdominio: tenant.subdominio || null,
          ativo: tenant.ativo ?? true,
          temTenant: true,
          gestor_id: null,
        }));

      const escolasCadastradas = [...escolasCompletas, ...escolasSemBase].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

      let superAdminStats = null;
      if (userRole === 'super_admin') {
        const reclamacoesFeed = reclamacoesFeedResult?.status === 'fulfilled' ? (reclamacoesFeedResult.value.data || []) : [];
        const superAdmins = superAdminsResult?.status === 'fulfilled' ? (superAdminsResult.value.data || []) : [];
        const arquivosAula = arquivosAulaResult?.status === 'fulfilled' ? (arquivosAulaResult.value.data || []) : [];
        const reclamacoesImagens = reclamacoesImagensResult?.status === 'fulfilled' ? (reclamacoesImagensResult.value.data || []) : [];
        const comunidadeImagens = comunidadeImagensResult?.status === 'fulfilled' ? (comunidadeImagensResult.value.data || []) : [];
        const laboratorioImagens = laboratorioImagensResult?.status === 'fulfilled' ? (laboratorioImagensResult.value.data || []) : [];
        const audiobooks = audiobooksResult?.status === 'fulfilled' ? (audiobooksResult.value.data || []) : [];

        const armazenamentoConsumidoBytes =
          arquivosAula.reduce((total, item) => total + estimateArquivosBytes(item?.arquivos), 0) +
          reclamacoesImagens.reduce((total, item) => total + estimateUrlCollectionBytes(item?.image_urls), 0) +
          comunidadeImagens.reduce((total, item) => total + estimateUrlCollectionBytes(item?.imagem_urls), 0) +
          laboratorioImagens.reduce((total, item) => total + estimateUrlCollectionBytes(item?.imagem_urls), 0) +
          audiobooks.reduce((total, item) => total + estimateDataUrlBytes(item?.audio_url), 0);

        superAdminStats = {
          totalEscolas: escolasCadastradas.length,
          tenantsAtivos: tenantsData.filter((tenant) => tenant?.ativo !== false).length,
          tenantsInativos: tenantsData.filter((tenant) => tenant?.ativo === false).length,
          escolasSemTenant: escolasCadastradas.filter((escola) => !escola.temTenant).length,
          superAdminsAtivos: superAdmins.filter((item) => item?.ativo !== false && item?.bloqueado !== true).length,
          superAdminsBloqueados: superAdmins.filter((item) => item?.bloqueado === true || item?.ativo === false).length,
          reclamacoesEmAnalise: reclamacoesFeed.filter((item) => item?.status === 'em_analise').length,
          reclamacoesAtrasadas: reclamacoesFeed.filter((item) => item?.alerta_prazo).length,
          armazenamentoConsumidoBytes,
        };
      }

      return {
        stats,
        atividades,
        emprestimosPorMes,
        livrosMaisEmprestados,
        escolasCadastradas,
        superAdminStats,
      };
    },
  );
}
