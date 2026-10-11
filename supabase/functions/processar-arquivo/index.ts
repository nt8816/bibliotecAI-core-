import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/cors.ts';

const MAX_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB binary payload

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(req, { success: false, error: 'Configuracao do servidor incompleta' }, 500);
  }

  const { user, error: authError } = await requireAuth(req, supabaseUrl, serviceRoleKey);
  if (authError || !user) {
    return jsonResponse(req, { success: false, error: authError || 'Autenticacao necessaria' }, 401);
  }

  try {
    const { base64Data, tipo } = await req.json();

    if (!base64Data) {
      return jsonResponse(req, { success: false, error: 'Nenhum dado fornecido' }, 400);
    }

    if (typeof base64Data !== 'string' || base64Data.length > MAX_BASE64_LENGTH) {
      return jsonResponse(req, { success: false, error: 'Arquivo excede o limite permitido para processamento' }, 413);
    }

    if (tipo !== 'pdf_livros') {
      return jsonResponse(req, {
        success: false,
        error: 'Tipo de arquivo nao suportado por este endpoint',
      }, 400);
    }

    if (tipo === 'pdf_livros') {
      const binary = atob(base64Data);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);

      const cleaned = decoded.replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g, ' ');
      const rawLines = cleaned
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const tableLines = rawLines.filter((l) => l.includes('|') || l.includes(';') || l.includes('\t'));
      if (tableLines.length >= 2) {
        const separator = tableLines[0].includes('|')
          ? '|'
          : tableLines[0].includes(';')
            ? ';'
            : '\t';

        const headers = tableLines[0].toLowerCase().split(separator).map((h) => h.trim());
        const idx = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));

        const tituloIdx = idx(['titulo', 'titulo']);
        if (tituloIdx >= 0) {
          const autorIdx = idx(['autor']);
          const areaIdx = idx(['area']);
          const tomboIdx = idx(['tombo']);
          const editoraIdx = idx(['editora']);
          const anoIdx = idx(['ano']);
          const edicaoIdx = idx(['edicao']);
          const volumeIdx = idx(['volume', 'vol']);
          const localIdx = idx(['local']);
          const sinopseIdx = idx(['sinopse']);

          const livros = tableLines
            .slice(1)
            .map((line) => line.split(separator).map((c) => c.trim()))
            .filter((row) => row[tituloIdx])
            .map((row) => ({
              titulo: row[tituloIdx] || '',
              autor: autorIdx >= 0 ? (row[autorIdx] || '') : '',
              area: areaIdx >= 0 ? (row[areaIdx] || '') : '',
              tombo: tomboIdx >= 0 ? (row[tomboIdx] || '') : '',
              editora: editoraIdx >= 0 ? (row[editoraIdx] || '') : '',
              ano: anoIdx >= 0 ? (row[anoIdx] || '') : '',
              edicao: edicaoIdx >= 0 ? (row[edicaoIdx] || '') : '',
              vol: volumeIdx >= 0 ? (row[volumeIdx] || '') : '',
              local: localIdx >= 0 ? (row[localIdx] || '') : '',
              sinopse: sinopseIdx >= 0 ? (row[sinopseIdx] || '') : '',
            }));

          if (livros.length > 0) {
            return jsonResponse(req, { success: true, livros });
          }
        }
      }

      return jsonResponse(req, {
        success: false,
        error: 'Nao foi possivel identificar uma tabela textual no PDF. Use Excel/CSV ou converta o PDF para planilha.',
        suggestion: 'Se o PDF for escaneado (imagem), use OCR antes da importacao.',
      }, 400);
    }

    return jsonResponse(req, {
      success: false,
      error: 'O processamento de PDF requer OCR. Por favor, converta o PDF para Excel ou CSV antes de importar.',
      suggestion: 'Use ferramentas como Adobe Acrobat, iLovePDF ou SmallPDF para converter o PDF em Excel.',
    });
  } catch (error) {
    return jsonResponse(req, { success: false, error: 'Erro interno' }, 500);
  }
});
