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
            foreignKeyName: "emprestimos_livro_id_fkey"
            columns: ["livro_id"]
            isOneToOne: false
            referencedRelation: "livros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_biblioteca"
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
          updated_at: string
        }
        Insert: {
          created_at?: string
          gestor_id?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gestor_id?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      livros: {
        Row: {
          ano: string | null
          area: string
          autor: string
          created_at: string
          disponivel: boolean
          edicao: string | null
          editora: string | null
          id: string
          local: string | null
          titulo: string
          tombo: string | null
          updated_at: string
          vol: string | null
        }
        Insert: {
          ano?: string | null
          area?: string
          autor?: string
          created_at?: string
          disponivel?: boolean
          edicao?: string | null
          editora?: string | null
          id?: string
          local?: string | null
          titulo: string
          tombo?: string | null
          updated_at?: string
          vol?: string | null
        }
        Update: {
          ano?: string | null
          area?: string
          autor?: string
          created_at?: string
          disponivel?: boolean
          edicao?: string | null
          editora?: string | null
          id?: string
          local?: string | null
          titulo?: string
          tombo?: string | null
          updated_at?: string
          vol?: string | null
        }
        Relationships: []
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
      is_professor: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "gestor" | "professor" | "aluno" | "bibliotecaria"
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
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["gestor", "professor", "aluno", "bibliotecaria"],
    },
  },
} as const
