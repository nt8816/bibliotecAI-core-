const rolePriority = ['super_admin', 'gestor', 'bibliotecaria', 'professor', 'aluno'];

export function pickPrimaryRole(roles = []) {
  const normalizedRoles = Array.isArray(roles)
    ? [...new Set(roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean))]
    : [];

  return rolePriority.find((role) => normalizedRoles.includes(role)) || null;
}

export function getDefaultRouteForRoles(roles = []) {
  const primaryRole = pickPrimaryRole(roles);

  if (primaryRole === 'super_admin') return '/admin/tenants';
  if (primaryRole === 'professor') return '/professor/dashboard';
  if (primaryRole === 'aluno') return '/aluno/perfil';
  return '/dashboard';
}

export function getDefaultRouteForRole(role) {
  return getDefaultRouteForRoles(role ? [role] : []);
}
