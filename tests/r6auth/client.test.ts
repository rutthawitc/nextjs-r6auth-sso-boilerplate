import { describe, expect, it, vi } from "vitest";

import { HttpR6AuthClient } from "@/lib/r6auth/client";
import { parseR6AuthConfig } from "@/lib/r6auth/config";
import { InvalidGrantError, R6AuthUnavailableError } from "@/lib/r6auth/errors";

const cfg = parseR6AuthConfig({
  NODE_ENV: "production",
  R6AUTH_URL: "https://r6.example/r6auth",
  R6AUTH_CLIENT_ID: "my-app",
  R6AUTH_CLIENT_SECRET: "SHHH",
  R6AUTH_REDIRECT_URI: "https://my-app.example/api/auth/sso/callback",
  R6AUTH_POST_LOGOUT_REDIRECT_URI: "https://my-app.example/login",
});

const okBody = {
  user: {
    username: "10001",
    sub: "0c04df73-aaaa",
    name: "นายสมชาย ใจดี",
    first_name: "สมชาย",
    last_name: "ใจดี",
    email: "somchai@example.com",
    title: "นักวิชาการคอมพิวเตอร์",
    level: "7",
    company: "",
    division: "กอง",
    department: "แผนก",
    office: "งาน",
    costcenter: "900001",
    ba: "1059",
  },
  login_at: 1760000000,
  expires_at: 1760028800,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const clientWith = (impl: (...args: Parameters<typeof fetch>) => Promise<Response>) => {
  const fetchImpl = vi.fn(impl);
  return { client: new HttpR6AuthClient(cfg, fetchImpl as unknown as typeof fetch), fetchImpl };
};

async function errorOf(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("expected a rejection");
}

describe("HttpR6AuthClient", () => {
  it("exchanges code with form body", async () => {
    const { client, fetchImpl } = clientWith(async () => json(200, okBody));
    await client.exchangeCode("CODE1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://r6.example/r6auth/token.php");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "CODE1",
      redirect_uri: "https://my-app.example/api/auth/sso/callback",
      client_id: "my-app",
      client_secret: "SHHH",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps success", async () => {
    const { client } = clientWith(async () => json(200, okBody));
    const r = await client.exchangeCode("CODE1");
    expect(r.loginAt).toBe(1760000000);
    expect(r.expiresAt).toBe(1760028800);
    expect(r.user.username).toBe("10001");
    expect(r.user.costcenter).toBe("900001");
    expect(r.user.name_en).toBe("");
  });

  it("invalid_grant -> InvalidGrantError", async () => {
    const { client } = clientWith(async () => json(400, { error: "invalid_grant", error_description: "x" }));
    expect(await errorOf(client.exchangeCode("C"))).toBeInstanceOf(InvalidGrantError);
  });

  it.each([
    ["invalid_client", 401],
    ["slow_down", 429],
    ["invalid_request", 400],
    ["server_error", 500],
  ])("%s (%i) -> R6AuthUnavailableError", async (error, status) => {
    const { client } = clientWith(async () => json(status, { error }));
    const err = await errorOf(client.exchangeCode("C"));
    expect(err).toBeInstanceOf(R6AuthUnavailableError);
    expect(err.message).toContain(String(status));
  });

  it("rejects non-JSON 200", async () => {
    const { client } = clientWith(async () => new Response("<html>proxy</html>", { status: 200 }));
    expect(await errorOf(client.exchangeCode("C"))).toBeInstanceOf(R6AuthUnavailableError);
  });

  it("rejects 200 without user", async () => {
    const { client } = clientWith(async () => json(200, { login_at: 1, expires_at: 2 }));
    expect(await errorOf(client.exchangeCode("C"))).toBeInstanceOf(R6AuthUnavailableError);
  });

  it("rejects 200 with an empty username", async () => {
    const { client } = clientWith(async () => json(200, { ...okBody, user: { ...okBody.user, username: "" } }));
    expect(await errorOf(client.exchangeCode("C"))).toBeInstanceOf(R6AuthUnavailableError);
  });

  it("network error / abort -> R6AuthUnavailableError", async () => {
    const net = clientWith(async () => { throw new TypeError("fetch failed"); });
    expect(await errorOf(net.client.exchangeCode("C"))).toBeInstanceOf(R6AuthUnavailableError);
    const abort = clientWith(async () => { throw new DOMException("timed out", "TimeoutError"); });
    expect(await errorOf(abort.client.exchangeCode("C"))).toBeInstanceOf(R6AuthUnavailableError);
  });

  it("error message never contains code or secret", async () => {
    const cases = [
      async () => json(401, { error: "invalid_client", error_description: "bad SHHH SECRETCODE" }),
      async () => { throw new TypeError("fetch failed SECRETCODE"); },
      async () => new Response("SECRETCODE SHHH", { status: 200 }),
    ];
    for (const impl of cases) {
      const err = await errorOf(clientWith(impl).client.exchangeCode("SECRETCODE"));
      expect(err.message).not.toContain("SECRETCODE");
      expect(err.message).not.toContain("SHHH");
    }
  });
});
