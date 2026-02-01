import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { base64Data, tipo } = await req.json();

    if (!base64Data) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum dado fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // For PDF processing, we'll use a simple text extraction approach
    // In production, you might want to use a more robust PDF parsing library
    
    // For now, return a message that PDF requires manual processing
    // This is a placeholder for future PDF OCR integration
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'O processamento de PDF requer OCR. Por favor, converta o PDF para Excel ou CSV antes de importar.',
        suggestion: 'Use ferramentas como Adobe Acrobat, iLovePDF ou SmallPDF para converter o PDF em Excel.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error processing file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
