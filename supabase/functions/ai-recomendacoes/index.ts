import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  perfil: 'ensino_medio' | 'ensino_tecnico' | 'eja';
  areas: string[];
  objetivos: string[];
}

interface Livro {
  id: string;
  titulo: string;
  autor: string;
  area: string;
  editora: string | null;
  ano: string | null;
}

interface LivroRecomendado {
  id: string;
  titulo: string;
  autor: string;
  area: string;
  motivo: string;
  relevancia: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { perfil, areas, objetivos }: RequestBody = await req.json();

    if (!perfil || !areas || areas.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Perfil e áreas de interesse são obrigatórios',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch available books
    const { data: livros, error: livrosError } = await supabase
      .from('livros')
      .select('id, titulo, autor, area, editora, ano')
      .eq('disponivel', true)
      .limit(100);

    if (livrosError) {
      console.error('Error fetching books:', livrosError);
      throw new Error('Erro ao buscar livros');
    }

    if (!livros || livros.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            explicacao: 'Não há livros disponíveis no acervo no momento.',
            livros: [],
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare prompt for AI
    const perfilDescricao = {
      ensino_medio: 'estudante do Ensino Médio Regular',
      ensino_tecnico: 'estudante de Ensino Técnico',
      eja: 'estudante da Educação de Jovens e Adultos (EJA)',
    };

    const livrosLista = livros
      .map((l: Livro) => `- ID: ${l.id}, Título: "${l.titulo}", Autor: ${l.autor}, Área: ${l.area}`)
      .join('\n');

    const prompt = `Você é um bibliotecário especialista em recomendações de livros para estudantes.

Perfil do estudante:
- Nível: ${perfilDescricao[perfil]}
- Áreas de interesse: ${areas.join(', ')}
- Objetivos: ${objetivos.length > 0 ? objetivos.join(', ') : 'Não especificados'}

Livros disponíveis no acervo:
${livrosLista}

Com base no perfil do estudante e nos livros disponíveis, selecione os 5 livros mais relevantes para este estudante.

Responda APENAS com um JSON válido no seguinte formato (sem markdown, sem explicações adicionais):
{
  "explicacao": "Uma explicação de 2-3 frases sobre como você selecionou os livros para este perfil",
  "livros": [
    {
      "id": "id-do-livro",
      "titulo": "título do livro",
      "autor": "autor do livro",
      "area": "área do livro",
      "motivo": "Por que este livro é relevante para o estudante (1-2 frases)",
      "relevancia": 95
    }
  ]
}

A relevância deve ser um número de 60 a 100 indicando o quão adequado o livro é para o perfil.
Ordene os livros do mais relevante para o menos relevante.
Se não houver livros adequados para o perfil, retorne uma lista vazia.`;

    // Call Lovable AI Gateway
    const aiGatewayUrl = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const aiResponse = await fetch(aiGatewayUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', errorText);
      throw new Error('Erro ao consultar a IA');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('Resposta da IA vazia');
    }

    // Parse AI response
    let parsedResponse;
    try {
      // Remove markdown code blocks if present
      const cleanContent = aiContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      parsedResponse = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Error parsing AI response:', aiContent);
      throw new Error('Erro ao processar resposta da IA');
    }

    // Validate and sanitize the response
    const validLivros: LivroRecomendado[] = [];
    const livrosMap = new Map(livros.map((l: Livro) => [l.id, l]));

    for (const livro of parsedResponse.livros || []) {
      const livroOriginal = livrosMap.get(livro.id);
      if (livroOriginal) {
        validLivros.push({
          id: livro.id,
          titulo: livroOriginal.titulo,
          autor: livroOriginal.autor,
          area: livroOriginal.area,
          motivo: livro.motivo || 'Livro recomendado para seu perfil',
          relevancia: Math.min(100, Math.max(60, Number(livro.relevancia) || 75)),
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          explicacao: parsedResponse.explicacao || 'Livros selecionados com base no seu perfil.',
          livros: validLivros.slice(0, 5),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in ai-recomendacoes:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
