import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ["https://bibliotecai.com.br", "https://app.bibliotecai.com.br", "http://localhost:5173", "http://localhost:3000"];

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}


const MAX_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB binary payload

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request || new Request("http://localhost")) });
  }

  try {
    const { base64Data, tipo } = await req.json();

    if (!base64Data) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum dado fornecido' }),
        { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (typeof base64Data !== 'string' || base64Data.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ success: false, error: 'Arquivo excede o limite permitido para processamento' }),
        { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' }, status: 413 }
      );
    }

    if (tipo !== 'pdf_livros') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Tipo de arquivo não suportado por este endpoint',
        }),
        { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (tipo === 'pdf_livros') {
      // Best-effort extraction for text-based PDFs that keep table rows as plain text.
      // This does not support scanned/OCR PDFs.
      const binary = atob(base64Data);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);

      // Keep only readable characters and split into potential rows.
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
        const idx = (keys) => headers.findIndex((h) => keys.some((k) => h.includes(k)));

        const tituloIdx = idx(['titulo', 'título']);
        if (tituloIdx >= 0) {
          const autorIdx = idx(['autor']);
          const areaIdx = idx(['area', 'área']);
          const tomboIdx = idx(['tombo']);
          const editoraIdx = idx(['editora']);
          const anoIdx = idx(['ano']);
          const edicaoIdx = idx(['edicao', 'edição']);
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
            return new Response(
              JSON.stringify({ success: true, livros }),
              { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' }, status: 200 }
            );
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Não foi possível identificar uma tabela textual no PDF. Use Excel/CSV ou converta o PDF para planilha.',
          suggestion: 'Se o PDF for escaneado (imagem), use OCR antes da importação.',
        }),
        { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'O processamento de PDF requer OCR. Por favor, converta o PDF para Excel ou CSV antes de importar.',
        suggestion: 'Use ferramentas como Adobe Acrobat, iLovePDF ou SmallPDF para converter o PDF em Excel.',
      }),
      { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
