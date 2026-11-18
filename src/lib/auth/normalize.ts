/**
 * Reduce what the user typed to a bare account name: trim, then drop a
 * `DOMAIN\` prefix (everything up to the last backslash) or an `@suffix`.
 * Case is preserved.
 */
export function normalizeUsername(input: string): string {
  let username = input.trim();

  if (username.includes("\\")) {
    username = username.slice(username.lastIndexOf("\\") + 1);
  } else if (username.includes("@")) {
    username = username.slice(0, username.indexOf("@"));
  }

  return username.trim();
}
