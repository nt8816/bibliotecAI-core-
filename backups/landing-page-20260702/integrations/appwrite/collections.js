const DB_ID = String(import.meta.env.VITE_APPWRITE_DATABASE_ID || '').trim();

export const DATABASE_ID = DB_ID;

export const COLLECTIONS = {
  USUARIOS_BIBLIOTECA: 'usuarios_biblioteca',
  USER_ROLES: 'user_roles',
  ESCOLAS: 'escolas',
  TENANTS: 'tenants',
  LIVROS: 'livros',
  CATEGORIAS_LIVROS: 'categorias_livros',
  EMPRESTIMOS: 'emprestimos',
  SOLICITACOES_EMPRESTIMO: 'solicitacoes_emprestimo',
  ATIVIDADES_LEITURA: 'atividades_leitura',
  ATIVIDADES_ENTREGAS: 'atividades_entregas',
  AUDIOBOOKS_BIBLIOTECA: 'audiobooks_biblioteca',
  AVALIACOES_LIVROS: 'avaliacoes_livros',
  COMUNIDADE_POSTS: 'comunidade_posts',
  COMUNIDADE_CURTIDAS: 'comunidade_curtidas',
  COMUNIDADE_QUIZ_TENTATIVAS: 'comunidade_quiz_tentativas',
  LABORATORIO_CRIACOES: 'laboratorio_criacoes',
  LISTA_DESEJOS: 'lista_desejos',
  NOTIFICACOES_LIDAS: 'notificacoes_lidas',
  NOTIFICACOES_SISTEMA: 'notificacoes_sistema',
  PREFERENCIAS_ALUNO: 'preferencias_aluno',
  PROFESSOR_TURMAS: 'professor_turmas',
  SALAS_CURSOS: 'salas_cursos',
  SUGESTOES_LIVROS: 'sugestoes_livros',
  TENANT_ADMIN_INVITES: 'tenant_admin_invites',
  TOKENS_CONVITE: 'tokens_convite',
  ALUNO_AUDIOBOOKS: 'aluno_audiobooks',
  SOLICITACOES_EMPRESTIMO_MENSAGENS: 'solicitacoes_emprestimo_mensagens',
  PUSH_DEVICE_TOKENS: 'push_device_tokens',
  SYSTEM_LOGS: 'system_logs',
  RECLAMACOES_SUPER_ADMIN: 'reclamacoes_super_admin',
  SUPER_ADMIN_SECURITY: 'super_admin_security',
  SUPER_ADMIN_PASSKEYS: 'super_admin_passkeys',
  SUPER_ADMIN_EMAIL_CHALLENGES: 'super_admin_email_challenges',
  SUPER_ADMIN_DESKTOP_CHALLENGES: 'super_admin_desktop_challenges',
  SUPER_ADMIN_LOGIN_ATTEMPTS: 'super_admin_login_attempts',
  GESTORES: 'gestores',
  USUARIOS: 'usuarios',
  ANALYTICS_EVENTS: 'analytics_events',
  ANALYTICS_SESSIONS: 'analytics_sessions',
};

export function col(name) {
  return COLLECTIONS[name] || name;
}
