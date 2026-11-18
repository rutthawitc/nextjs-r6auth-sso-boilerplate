/**
 * Server-side code exchange with r6auth's token.php. The client secret and
 * the code never appear in errors or logs.
 */
import { z } from "zod";

import type { R6AuthConfig } from "./config";
import { InvalidGrantError, R6AuthUnavailableError } from "./errors";
import type { R6AuthResult } from "./types";

export interface R6AuthClient {
  exchangeCode(code: string): Promise<R6AuthResult>;
}

const text = z.string().default("");
const tokenSchema = z.object({
  user: z.object({
    username: z.string().trim().min(1),
    sub: text,
    name: text,
    first_name: text,
    last_name: text,
    name_en: text,
    email: text,
    title: text,
    level: text,
    company: text,
    division: text,
    department: text,
    office: text,
    costcenter: text,
    ba: text,
  }),
  login_at: z.number().int().positive(),
  expires_at: z.number().int().positive(),
});

const errorSchema = z.object({ error: z.string() });

/** Only a short, known-safe token from the server's `error` field. */
function safeErrorName(body: unknown): string {
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success) return "unknown";
  return /^[a-z_]{1,40}$/.test(parsed.data.error) ? parsed.data.error : "unknown";
}

export class HttpR6AuthClient implements R6AuthClient {
  constructor(
    private readonly cfg: R6AuthConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async exchangeCode(code: string): Promise<R6AuthResult> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.cfg.url}/token.php`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.cfg.redirectUri,
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      const kind = error instanceof Error ? error.name : typeof error;
      throw new R6AuthUnavailableError(`token.php request failed (${kind})`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new R6AuthUnavailableError(`token.php HTTP ${response.status}: response is not JSON`);
    }

    if (response.status !== 200) {
      const error = safeErrorName(body);
      if (response.status === 400 && error === "invalid_grant") throw new InvalidGrantError();
      throw new R6AuthUnavailableError(`token.php HTTP ${response.status}: ${error}`);
    }

    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) {
      throw new R6AuthUnavailableError("token.php HTTP 200: unexpected response shape");
    }
    const { user, login_at, expires_at } = parsed.data;
    return { user, loginAt: login_at, expiresAt: expires_at };
  }
}
