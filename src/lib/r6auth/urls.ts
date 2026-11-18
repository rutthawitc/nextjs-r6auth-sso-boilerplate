import type { R6AuthConfig } from "./config";

/** Where the browser goes to sign in. */
export function buildAuthorizeUrl(cfg: R6AuthConfig, state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `${cfg.url}/authorize.php?${q}`;
}

/** Where the browser goes to end the central (r6auth + Keycloak) session. */
export function buildLogoutUrl(cfg: R6AuthConfig): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    post_logout_redirect_uri: cfg.postLogoutRedirectUri,
  });
  return `${cfg.url}/logout.php?${q}`;
}
