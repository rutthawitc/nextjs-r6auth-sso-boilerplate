/** The organisational unit shown for a user: office, else department, else division. */
export function unitOf(user: {
  office?: string | null;
  department?: string | null;
  division?: string | null;
}): string | null {
  for (const value of [user.office, user.department, user.division]) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
