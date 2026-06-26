export function getInitials(name, email) {
  const clean = (name || '').trim();
  if (clean) {
    const parts = clean.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase() || first.toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '?';
}
