/** Node-only entry point for r6auth SSO. Never import from proxy.ts or edge code. */
import { HttpR6AuthClient, type R6AuthClient } from "./client";
import { getR6AuthConfig } from "./config";
import { FakeR6AuthClient } from "./fake";

export { HttpR6AuthClient, type R6AuthClient } from "./client";
export {
  getR6AuthConfig,
  isFakeActive,
  parseR6AuthConfig,
  resetR6AuthConfigCache,
  type R6AuthConfig,
} from "./config";
export { InvalidGrantError, R6AuthUnavailableError } from "./errors";
export { FAKE_SSO_USERS, FakeR6AuthClient } from "./fake";
export type { R6AuthResult, R6AuthUser } from "./types";
export { buildAuthorizeUrl, buildLogoutUrl } from "./urls";

/** The configured client: the fake one in development/test with R6AUTH_FAKE, else HTTP. */
export function getR6AuthClient(): R6AuthClient {
  const cfg = getR6AuthConfig();
  return cfg.fake ? new FakeR6AuthClient() : new HttpR6AuthClient(cfg);
}
