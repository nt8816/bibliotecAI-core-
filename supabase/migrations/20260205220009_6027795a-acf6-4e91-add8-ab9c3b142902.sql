-- Add RLS policy for professors to view students of their school
CREATE POLICY "Professors can view students of their school"
ON public.usuarios_biblioteca
FOR SELECT
TO authenticated
USING (
  is_professor() AND 
  tipo = 'aluno' AND
  escola_id IN (
    SELECT escola_id FROM public.usuarios_biblioteca WHERE user_id = auth.uid()
  )
);