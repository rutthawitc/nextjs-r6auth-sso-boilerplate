import { isTrustProxy } from "@/lib/session-core";

/** Used when no trustworthy client address exists; throttling becomes per-username. */
export const UNKNOWN_IP = "-";

const MAX_IP_LENGTH = 64;

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || v.length > MAX_IP_LENGTH || /[\x00-\x1F\x7F]/.test(v)) return null;
  return v;
}

/**
 * Client address for throttling. Next route handlers expose no socket address,
 * so the only source is request headers. X-Forwarded-For / X-Real-IP are
 * trivially spoofable by any client that reaches the app directly; they are
 * honoured only when TRUST_PROXY=true, i.e. a reverse proxy that overwrites
 * them sits in front. Otherwise a constant is returned, so an attacker cannot
 * dodge the lockout by rotating a forged header.
 */
export function getClientIp(
  headers: Pick<Headers, "get">,
  trustProxy: boolean = isTrustProxy(),
): string {
  if (!trustProxy) return UNKNOWN_IP;
  const forwarded = clean(headers.get("x-forwarded-for")?.split(",")[0]);
  if (forwarded) return forwarded;
  return clean(headers.get("x-real-ip")) ?? UNKNOWN_IP;
}
