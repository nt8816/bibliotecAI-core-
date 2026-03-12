export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      aluno_audiobooks: {
        Row: {
          aluno_id: string
          audiobook_id: string
          created_at: string
          favorito: boolean
          id: string
          progresso_segundos: number
          updated_at: string
        }
        Insert: {
          aluno_id: string
          audiobook_id: string
          created_at?: string
          favorito?: boolean
          id?: string
          progresso_segundos?: number
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          audiobook_id?: string
          created_at?: string
          favorito?: boolean
          id?: string
          progresso_segundos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aluno_audiobooks_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aluno_audiobooks_audiobook_id_fkey"
            columns: ["audiobook_id"]
            isOneToOne: false
            referencedRelation: "audiobooks_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades_entregas: {
        Row: {
          aluno_id: string
          anexo_url: string | null
          atividade_id: string
          avaliado_em: string | null
          created_at: string
          enviado_em: string
          feedback_professor: string | null
          id: string
          pontos_ganhos: number
          status: string
          texto_entrega: string
          updated_at: string
        }
        Insert: {
          aluno_id: string
          anexo_url?: string | null
          atividade_id: string
          avaliado_em?: string | null
          created_at?: string
          enviado_em?: string
          feedback_professor?: string | null
          id?: string
          pontos_ganhos?: number
          status?: string
          texto_entrega: string
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          anexo_url?: string | null
          atividade_id?: string
          avaliado_em?: string | null
          created_at?: string
          enviado_em?: string
          feedback_professor?: string | null
          id?: string
          pontos_ganhos?: number
          status?: string
          texto_entrega?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_entregas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_entregas_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades_leitura"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades_leitura: {
        Row: {
          aluno_id: string
          created_at: string
          data_entrega: string | null
          descricao: string | null
          id: string
          livro_id: string
          pontos_extras: number | null
          professor_id: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          aluno_id: string
          created_at?: string
          data_entrega?: string | null
          descricao?: string | null
          id?: string
          livro_id: string
          pontos_extras?: number | null
          professor_id: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          created_at?: string
          data_entrega?: string | null
          descricao?: string | null
          id?: string
          livro_id?: string
          pontos_extras?: number | null
          professor_id?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_leitura_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_leitura_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_leitura_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      audiobooks_biblioteca: {
        Row: {
          audio_url: string
          autor: string | null
          created_at: string
          criado_por: string | null
          duracao_minutos: number | null
          escola_id: string | null
          id: string
          livro_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          audio_url: string
          autor?: string | null
          created_at?: string
          criado_por?: string | null
          duracao_minutos?: number | null
          escola_id?: string | null
          id?: string
          livro_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          audio_url?: string
          autor?: string | null
          created_at?: string
          criado_por?: string | null
          duracao_minutos?: number | null
          escola_id?: string | null
          id?: string
          livro_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiobooks_biblioteca_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiobooks_biblioteca_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiobooks_biblioteca_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
        ]
      }
      avaliacoes_livros: {
        Row: {
          created_at: string
          id: string
          livro_id: string
          nota: number
          resenha: string | null
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          livro_id: string
          nota: number
          resenha?: string | null
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          livro_id?: string
          nota?: number
          resenha?: string | null
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avaliacoes_livros_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avaliacoes_livros_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_livros: {
        Row: {
          created_at: string
          created_by: string | null
          escola_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          escola_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          escola_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_livros_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
        ]
      }
      comunidade_curtidas: {
        Row: {
          created_at: string
          id: string
          post_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunidade_curtidas_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "comunidade_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunidade_curtidas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      comunidade_posts: {
        Row: {
          audiobook_id: string | null
          autor_id: string
          conteudo: string
          created_at: string
          escola_id: string | null
          id: string
          imagem_urls: string[]
          livro_id: string | null
          tags: string[]
          tipo: string
          titulo: string | null
          updated_at: string
        }
        Insert: {
          audiobook_id?: string | null
          autor_id: string
          conteudo: string
          created_at?: string
          escola_id?: string | null
          id?: string
          imagem_urls?: string[]
          livro_id?: string | null
          tags?: string[]
          tipo?: string
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          audiobook_id?: string | null
          autor_id?: string
          conteudo?: string
          created_at?: string
          escola_id?: string | null
          id?: string
          imagem_urls?: string[]
          livro_id?: string | null
          tags?: string[]
          tipo?: string
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunidade_posts_audiobook_id_fkey"
            columns: ["audiobook_id"]
            isOneToOne: false
            referencedRelation: "audiobooks_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunidade_posts_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunidade_posts_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunidade_posts_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
        ]
      }
      comunidade_quiz_tentativas: {
        Row: {
          acertos: number
          aluno_id: string
          created_at: string
          escola_id: string | null
          id: string
          post_id: string
          total: number
        }
        Insert: {
          acertos: number
          aluno_id: string
          created_at?: string
          escola_id?: string | null
          id?: string
          post_id: string
          total: number
        }
        Update: {
          acertos?: number
          aluno_id?: string
          created_at?: string
          escola_id?: string | null
          id?: string
          post_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "comunidade_quiz_tentativas_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunidade_quiz_tentativas_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunidade_quiz_tentativas_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "comunidade_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      emprestimos: {
        Row: {
          created_at: string
          data_devolucao_prevista: string
          data_devolucao_real: string | null
          data_emprestimo: string
          id: string
          livro_id: string
          observacoes: string | null
          status: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          data_devolucao_prevista?: string
          data_devolucao_real?: string | null
          data_emprestimo?: string
          id?: string
          livro_id: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          data_devolucao_prevista?: string
          data_devolucao_real?: string | null
          data_emprestimo?: string
          id?: string
          livro_id?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emprestimos_livro_id_fkey1"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_usuario_id_fkey1"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      emprestimos_backup_20260220143832: {
        Row: {
          criado_em: string | null
          data_devolucao: string | null
          data_hora: string | null
          data_prevista: string | null
          id: number
          livro_id: number | null
          status: string
          usuario_id: number | null
        }
        Insert: {
          criado_em?: string | null
          data_devolucao?: string | null
          data_hora?: string | null
          data_prevista?: string | null
          id?: never
          livro_id?: number | null
          status?: string
          usuario_id?: number | null
        }
        Update: {
          criado_em?: string | null
          data_devolucao?: string | null
          data_hora?: string | null
          data_prevista?: string | null
          id?: never
          livro_id?: number | null
          status?: string
          usuario_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emprestimos_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros_backup_20260220143832"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      escolas: {
        Row: {
          created_at: string
          gestor_id: string | null
          id: string
          nome: string
          subdominio: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gestor_id?: string | null
          id?: string
          nome: string
          subdominio?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gestor_id?: string | null
          id?: string
          nome?: string
          subdominio?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escolas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gestores: {
        Row: {
          criado_em: string | null
          id: number
          nome: string
          senha: string
          usuario: string
        }
        Insert: {
          criado_em?: string | null
          id?: never
          nome: string
          senha: string
          usuario: string
        }
        Update: {
          criado_em?: string | null
          id?: never
          nome?: string
          senha?: string
          usuario?: string
        }
        Relationships: []
      }
      laboratorio_criacoes: {
        Row: {
          aluno_id: string
          comunidade_post_id: string | null
          conteudo_json: Json
          created_at: string
          descricao: string | null
          escola_id: string | null
          id: string
          imagem_urls: string[]
          livro_id: string | null
          publicado_comunidade: boolean
          tags: string[]
          tipo: string
          titulo: string | null
          updated_at: string
        }
        Insert: {
          aluno_id: string
          comunidade_post_id?: string | null
          conteudo_json?: Json
          created_at?: string
          descricao?: string | null
          escola_id?: string | null
          id?: string
          imagem_urls?: string[]
          livro_id?: string | null
          publicado_comunidade?: boolean
          tags?: string[]
          tipo: string
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          aluno_id?: string
          comunidade_post_id?: string | null
          conteudo_json?: Json
          created_at?: string
          descricao?: string | null
          escola_id?: string | null
          id?: string
          imagem_urls?: string[]
          livro_id?: string | null
          publicado_comunidade?: boolean
          tags?: string[]
          tipo?: string
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laboratorio_criacoes_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laboratorio_criacoes_comunidade_post_id_fkey"
            columns: ["comunidade_post_id"]
            isOneToOne: false
            referencedRelation: "comunidade_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laboratorio_criacoes_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "laboratorio_criacoes_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_desejos: {
        Row: {
          created_at: string
          id: string
          livro_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          livro_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          livro_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_desejos_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_desejos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_lidas: {
        Row: {
          created_at: string
          id: string
          notification_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_lidas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_sistema: {
        Row: {
          conteudo: string
          created_at: string
          enviado_por: string | null
          id: string
          is_critical: boolean
          role_destino: Database["public"]["Enums"]["app_role"] | null
          titulo: string
          updated_at: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          enviado_por?: string | null
          id?: string
          is_critical?: boolean
          role_destino?: Database["public"]["Enums"]["app_role"] | null
          titulo: string
          updated_at?: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          enviado_por?: string | null
          id?: string
          is_critical?: boolean
          role_destino?: Database["public"]["Enums"]["app_role"] | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_sistema_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      preferencias_aluno: {
        Row: {
          autores_favoritos: string[] | null
          created_at: string
          formatos_preferidos: string[] | null
          frequencia_leitura: string | null
          generos_favoritos: string[] | null
          id: string
          idiomas: string[] | null
          nivel_leitura: string | null
          ultimos_livros: string[] | null
          updated_at: string
          usuario_id: string
        }
        Insert: {
          autores_favoritos?: string[] | null
          created_at?: string
          formatos_preferidos?: string[] | null
          frequencia_leitura?: string | null
          generos_favoritos?: string[] | null
          id?: string
          idiomas?: string[] | null
          nivel_leitura?: string | null
          ultimos_livros?: string[] | null
          updated_at?: string
          usuario_id: string
        }
        Update: {
          autores_favoritos?: string[] | null
          created_at?: string
          formatos_preferidos?: string[] | null
          frequencia_leitura?: string | null
          generos_favoritos?: string[] | null
          id?: string
          idiomas?: string[] | null
          nivel_leitura?: string | null
          ultimos_livros?: string[] | null
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferencias_aluno_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      professor_turmas: {
        Row: {
          created_at: string
          escola_id: string
          id: string
          professor_id: string
          turma: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          escola_id: string
          id?: string
          professor_id: string
          turma: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          escola_id?: string
          id?: string
          professor_id?: string
          turma?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "professor_turmas_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professor_turmas_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      salas_cursos: {
        Row: {
          created_at: string
          escola_id: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          escola_id: string
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          escola_id?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salas_cursos_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_emprestimo: {
        Row: {
          created_at: string
          id: string
          livro_id: string
          mensagem: string | null
          resposta: string | null
          status: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          livro_id: string
          mensagem?: string | null
          resposta?: string | null
          status?: string
          updated_at?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          livro_id?: string
          mensagem?: string | null
          resposta?: string | null
          status?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_emprestimo_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_emprestimo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      sugestoes_livros: {
        Row: {
          aluno_id: string
          created_at: string
          id: string
          lido: boolean
          livro_id: string
          mensagem: string | null
          professor_id: string
        }
        Insert: {
          aluno_id: string
          created_at?: string
          id?: string
          lido?: boolean
          livro_id: string
          mensagem?: string | null
          professor_id: string
        }
        Update: {
          aluno_id?: string
          created_at?: string
          id?: string
          lido?: boolean
          livro_id?: string
          mensagem?: string | null
          professor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sugestoes_livros_aluno_id_fkey"
            columns: ["aluno_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_livros_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sugestoes_livros_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_admin_invites: {
        Row: {
          cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          escola_id: string
          expira_em: string
          id: string
          tenant_id: string
          token: string
          usado_em: string | null
          usado_por: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          escola_id: string
          expira_em?: string
          id?: string
          tenant_id: string
          token?: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          escola_id?: string
          expira_em?: string
          id?: string
          tenant_id?: string
          token?: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_admin_invites_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_admin_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          escola_id: string | null
          id: string
          nome: string
          plano: string
          schema_name: string
          subdominio: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          escola_id?: string | null
          id?: string
          nome: string
          plano?: string
          schema_name: string
          subdominio: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          escola_id?: string | null
          id?: string
          nome?: string
          plano?: string
          schema_name?: string
          subdominio?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: true
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens_convite: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string
          escola_id: string
          expira_em: string
          id: string
          role_destino: Database["public"]["Enums"]["app_role"]
          token: string
          usado_em: string | null
          usado_por: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por: string
          escola_id: string
          expira_em?: string
          id?: string
          role_destino: Database["public"]["Enums"]["app_role"]
          token?: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string
          escola_id?: string
          expira_em?: string
          id?: string
          role_destino?: Database["public"]["Enums"]["app_role"]
          token?: string
          usado_em?: string | null
          usado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tokens_convite_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          cpf: string | null
          criado_em: string | null
          email: string | null
          id: number
          matricula: string | null
          nome: string
          telefone: string | null
          tipo: string
          turma: string | null
        }
        Insert: {
          cpf?: string | null
          criado_em?: string | null
          email?: string | null
          id?: never
          matricula?: string | null
          nome: string
          telefone?: string | null
          tipo?: string
          turma?: string | null
        }
        Update: {
          cpf?: string | null
          criado_em?: string | null
          email?: string | null
          id?: never
          matricula?: string | null
          nome?: string
          telefone?: string | null
          tipo?: string
          turma?: string | null
        }
        Relationships: []
      }
      usuarios_biblioteca: {
        Row: {
          cpf: string | null
          created_at: string
          email: string
          escola_id: string | null
          id: string
          matricula: string | null
          nome: string
          sala_curso_id: string | null
          telefone: string | null
          tipo: Database["public"]["Enums"]["app_role"]
          turma: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email: string
          escola_id?: string | null
          id?: string
          matricula?: string | null
          nome: string
          sala_curso_id?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["app_role"]
          turma?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string
          escola_id?: string | null
          id?: string
          matricula?: string | null
          nome?: string
          sala_curso_id?: string | null
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["app_role"]
          turma?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_biblioteca_escola_id_fkey"
            columns: ["escola_id"]
            isOneToOne: false
            referencedRelation: "escolas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_biblioteca_sala_curso_id_fkey"
            columns: ["sala_curso_id"]
            isOneToOne: false
            referencedRelation: "salas_cursos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_tenant_admin_invite: {
        Args: {
          _base_domain?: string
          _invite_cpf?: string
          _invite_expires_hours?: string
          _tenant_id: string
        }
        Returns: Json
      }
      current_professor_profile_id: { Args: never; Returns: string }
      get_login_email_by_cpf: { Args: { _cpf: string }; Returns: string }
      get_login_email_by_matricula: {
        Args: { _matricula: string }
        Returns: string
      }
      get_tenant_invite_context: {
        Args: { _token: string }
        Returns: {
          cpf: string
          email: string
          escola_id: string
          escola_nome: string
          expira_em: string
          subdominio: string
          tenant_id: string
        }[]
      }
      get_user_escola_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_bibliotecaria: { Args: never; Returns: boolean }
      is_gestor: { Args: never; Returns: boolean }
      is_matricula_login_activated: {
        Args: { _matricula: string }
        Returns: boolean
      }
      is_professor: { Args: never; Returns: boolean }
      is_professor_profile_in_escola: {
        Args: { _escola_id: string; _profile_id: string }
        Returns: boolean
      }
      is_same_escola: { Args: { _escola_id: string }; Returns: boolean }
      is_same_user_escola: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_platform_admin: { Args: never; Returns: boolean }
      normalize_subdominio: { Args: { _value: string }; Returns: string }
      provision_tenant: {
        Args: {
          _base_domain?: string
          _escola_nome: string
          _invite_cpf?: string
          _invite_expires_hours?: string
          _plano?: string
          _subdominio: string
        }
        Returns: Json
      }
      schema_from_subdominio: { Args: { _subdominio: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "gestor"
        | "professor"
        | "aluno"
        | "bibliotecaria"
        | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : never
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "gestor",
        "professor",
        "aluno",
        "bibliotecaria",
        "super_admin",
      ],
    },
  },
} as const
