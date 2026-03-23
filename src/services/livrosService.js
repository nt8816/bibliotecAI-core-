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

export async function fetchLivrosCatalogo({ userId, preCategorias, canonicalizeBookArea, defaultPreCategories }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/livros'),
    async () => {
      const { data: profile, error: profileError } = await supabase
        .from('usuarios_biblioteca')
        .select('escola_id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileError) throw profileError;

      let livrosData = [];
      if (profile?.escola_id) {
        const [{ data: escolaLivros, error: escolaError }, { data: legacyLivros, error: legacyError }] = await Promise.all([
          supabase.from('livros').select('*').eq('escola_id', profile.escola_id).order('titulo'),
          supabase.from('livros').select('*').is('escola_id', null).order('titulo'),
        ]);

        if (escolaError) throw escolaError;
        if (legacyError) throw legacyError;

        const byId = new Map();
        [...(escolaLivros || []), ...(legacyLivros || [])].forEach((livro) => {
          if (livro?.id) byId.set(livro.id, livro);
        });
        livrosData = Array.from(byId.values()).sort((a, b) => String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR'));
      } else {
        const { data, error } = await supabase.from('livros').select('*').order('titulo');
        if (error) throw error;
        livrosData = data || [];
      }

      const { data: categorias, error: categoriasError } = profile?.escola_id
        ? await supabase
            .from('categorias_livros')
            .select('nome')
            .eq('escola_id', profile.escola_id)
            .order('nome')
        : { data: [], error: null };

      if (categoriasError) throw categoriasError;

      const nomes = [...new Set((categorias || []).map((c) => String(c.nome || '').trim()).filter(Boolean))];
      const categoriasNormalizadas = (nomes.length > 0 ? nomes : defaultPreCategories).map((nome) => canonicalizeBookArea(nome));

      return {
        escolaId: profile?.escola_id || null,
        livros: livrosData.map((livro) => ({
          ...livro,
          area: canonicalizeBookArea(livro.area, preCategorias),
        })),
        preCategorias: categoriasNormalizadas,
      };
    },
  );
}

export async function createLivroCategoria(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/livros/categorias', { method: 'POST', body: payload }),
    async () => {
      const { error } = await supabase
        .from('categorias_livros')
        .upsert(payload, { onConflict: 'escola_id,nome' });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function deleteLivroCategoria(escolaId, nome) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/livros/categorias/delete', { method: 'POST', body: { escola_id: escolaId, nome } }),
    async () => {
      const { error } = await supabase
        .from('categorias_livros')
        .delete()
        .eq('escola_id', escolaId)
        .eq('nome', nome);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function saveLivro(payload, editingLivroId) {
  return requestWithFallback(
    async () => editingLivroId
      ? requestPlatformApi(`/v1/livros/${editingLivroId}`, { method: 'PATCH', body: payload })
      : requestPlatformApi('/v1/livros', { method: 'POST', body: payload }),
    async () => {
      if (editingLivroId) {
        const { error } = await supabase.from('livros').update(payload).eq('id', editingLivroId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('livros').insert(payload);
        if (error) throw error;
      }
      return { success: true };
    },
  );
}

export async function deleteLivro(id) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/livros/${id}/delete`, { method: 'POST' }),
    async () => {
      const { error } = await supabase.from('livros').delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function importLivrosBatch(livros, escolaId, preCategorias, canonicalizeBookArea) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/livros/import', {
      method: 'POST',
      body: { livros, escola_id: escolaId },
    }),
    async () => {
      const updated = [...livros];

      for (let i = 0; i < updated.length; i += 1) {
        const l = updated[i];
        try {
          const payload = {
            area: canonicalizeBookArea(l.area || '', preCategorias),
            tombo: l.tombo || null,
            autor: l.autor || '',
            titulo: l.titulo,
            vol: l.vol || '',
            edicao: l.edicao || '',
            local: l.local || '',
            editora: l.editora || '',
            ano: l.ano || '',
            disponivel: true,
            sinopse: l.sinopse || '',
            escola_id: escolaId,
          };

          const { error } = await supabase.from('livros').insert(payload);
          if (error) {
            updated[i] = { ...l, status: 'erro', mensagem: error.code === '23505' ? 'Tombo ja cadastrado' : error.message };
          } else {
            updated[i] = { ...l, status: 'sucesso' };
          }
        } catch (error) {
          updated[i] = { ...l, status: 'erro', mensagem: error.message };
        }
      }

      return { livros: updated };
    },
  );
}
