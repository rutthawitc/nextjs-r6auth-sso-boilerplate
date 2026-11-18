/** Where to go after login when `?from` is missing or unsafe. */
export const DEFAULT_POST_LOGIN_PATH = "/profile";

/**
 * Returns `from` only when it is a same-origin relative path: it must start
 * with a single "/" and not "//" or "/\" (both are protocol-relative to a
 * browser), and must not contain control characters, backslashes or a scheme
 * smuggled in after decoding. Anything else yields the fallback.
 */
export function safeRedirectPath(
  from: string | null | undefined,
  fallback: string = DEFAULT_POST_LOGIN_PATH,
): string {
  if (typeof from !== "string" || from === "") return fallback;
  if (!from.startsWith("/")) return fallback;
  if (from.startsWith("//") || from.startsWith("/\\")) return fallback;
  // Control characters (tab/newline are stripped by URL parsers: "/\t/evil.com").
  if (/[\u0000-\u001f\u007f]/.test(from)) return fallback;
  if (from.includes("\\")) return fallback;
  // Resolve against a dummy origin and make sure we stay on it.
  try {
    const base = "http://localhost";
    const url = new URL(from, base);
    if (url.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return from;
}
