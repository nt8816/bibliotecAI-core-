CREATE TABLE public.aluno_livro_preferencias (
  aluno_id uuid PRIMARY KEY REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  generos text[] NOT NULL DEFAULT '{}',
  perfil_ia jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.aluno_livro_sugestoes_dia (
  aluno_id uuid NOT NULL REFERENCES public.usuarios_biblioteca(id) ON DELETE CASCADE,
  dia date NOT NULL,
  contador integer NOT NULL DEFAULT 0 CHECK (contador BETWEEN 0 AND 3),
  exibidos uuid[] NOT NULL DEFAULT '{}',
  principal jsonb,
  PRIMARY KEY (aluno_id, dia)
);
ALTER TABLE public.aluno_livro_preferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aluno_livro_sugestoes_dia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aluno_livro_preferencias, public.aluno_livro_sugestoes_dia FROM anon, authenticated;
GRANT ALL ON public.aluno_livro_preferencias, public.aluno_livro_sugestoes_dia TO service_role;

CREATE FUNCTION public.registrar_recomendacao_livro(p_aluno uuid, p_candidatos jsonb, p_proximo boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dia date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_estado public.aluno_livro_sugestoes_dia%ROWTYPE;
  v_livro jsonb;
BEGIN
  INSERT INTO public.aluno_livro_sugestoes_dia (aluno_id, dia) VALUES (p_aluno, v_dia) ON CONFLICT DO NOTHING;
  SELECT * INTO v_estado FROM public.aluno_livro_sugestoes_dia WHERE aluno_id = p_aluno AND dia = v_dia FOR UPDATE;
  IF NOT p_proximo AND v_estado.principal IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_candidatos) item
    WHERE item->>'livro_id' = v_estado.principal->>'livro_id'
  ) THEN
    RETURN jsonb_build_object('estado', 'ok', 'principal', v_estado.principal, 'contador', v_estado.contador);
  END IF;
  IF p_proximo AND v_estado.contador >= 3 THEN
    RETURN jsonb_build_object('estado', 'limite', 'principal', v_estado.principal, 'contador', v_estado.contador);
  END IF;
  SELECT item INTO v_livro FROM jsonb_array_elements(p_candidatos) item
    WHERE NOT ((item->>'livro_id')::uuid = ANY(v_estado.exibidos)) LIMIT 1;
  IF v_livro IS NULL AND NOT p_proximo AND v_estado.principal IS NULL THEN
    SELECT item INTO v_livro FROM jsonb_array_elements(p_candidatos) item LIMIT 1;
  END IF;
  IF v_livro IS NULL THEN
    RETURN jsonb_build_object('estado', 'sem_candidato', 'principal', CASE WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_candidatos) item
      WHERE item->>'livro_id' = v_estado.principal->>'livro_id'
    ) THEN v_estado.principal ELSE NULL END, 'contador', v_estado.contador);
  END IF;
  UPDATE public.aluno_livro_sugestoes_dia SET principal = v_livro,
    exibidos = array_append(exibidos, (v_livro->>'livro_id')::uuid),
    contador = contador + CASE WHEN p_proximo THEN 1 ELSE 0 END
    WHERE aluno_id = p_aluno AND dia = v_dia RETURNING * INTO v_estado;
  RETURN jsonb_build_object('estado', 'ok', 'principal', v_estado.principal, 'contador', v_estado.contador);
END; $$;
REVOKE ALL ON FUNCTION public.registrar_recomendacao_livro(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_recomendacao_livro(uuid, jsonb, boolean) TO service_role;
