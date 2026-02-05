-- Enable realtime for main tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.livros;
ALTER PUBLICATION supabase_realtime ADD TABLE public.emprestimos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.usuarios_biblioteca;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sugestoes_livros;
ALTER PUBLICATION supabase_realtime ADD TABLE public.atividades_leitura;