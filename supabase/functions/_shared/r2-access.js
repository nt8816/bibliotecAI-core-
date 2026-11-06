// The owner segment can contain either an auth user ID or a profile ID.
export function mayModifyR2Object({ isSuperAdmin, userId, profileId }, objectKey) {
  const parts = String(objectKey || '').split('/');
  if (parts.length < 5 || parts[0] !== 'escolas' || parts.some((part) => !part)) return false;
  if (isSuperAdmin) return true;
  return Boolean(parts[3] && (parts[3] === userId || parts[3] === profileId));
}
