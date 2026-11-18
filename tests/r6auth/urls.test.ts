import { describe, expect, it } from "vitest";

import { parseR6AuthConfig } from "@/lib/r6auth/config";
import { buildAuthorizeUrl, buildLogoutUrl } from "@/lib/r6auth/urls";

const cfg = parseR6AuthConfig({
  NODE_ENV: "production",
  R6AUTH_URL: "https://r6.example/r6auth",
  R6AUTH_CLIENT_ID: "my-app",
  R6AUTH_CLIENT_SECRET: "x",
  R6AUTH_REDIRECT_URI: "https://my-app.example/api/auth/sso/callback",
  R6AUTH_POST_LOGOUT_REDIRECT_URI: "https://my-app.example/login",
});

describe("r6auth urls", () => {
  it("builds the authorize URL", () => {
    expect(buildAuthorizeUrl(cfg, "abc")).toBe(
      "https://r6.example/r6auth/authorize.php?response_type=code&client_id=my-app" +
        "&redirect_uri=https%3A%2F%2Fmy-app.example%2Fapi%2Fauth%2Fsso%2Fcallback&state=abc",
    );
  });

  it("builds the logout URL", () => {
    expect(buildLogoutUrl(cfg)).toBe(
      "https://r6.example/r6auth/logout.php?client_id=my-app" +
        "&post_logout_redirect_uri=https%3A%2F%2Fmy-app.example%2Flogin",
    );
  });
});
