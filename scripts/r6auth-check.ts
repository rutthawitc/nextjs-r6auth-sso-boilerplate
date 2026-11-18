/**
 * Checks the r6auth setup without logging anyone in: configuration, that
 * ping.php answers UP, and the URLs to register at apps.php. Never prints the
 * client secret and never calls token.php.
 *
 *   pnpm r6auth:check
 *   docker compose exec app node dist-scripts/r6auth-check.mjs
 */
import { pathToFileURL } from "node:url";

import { parseR6AuthConfig, type R6AuthConfig } from "../src/lib/r6auth/config";
import { bold, green, loadEnvFiles, red } from "./lib/cli";

export interface CheckStep {
  name: string;
  ok: boolean;
  detail: string;
}

export async function checkSteps(cfg: R6AuthConfig, fetchImpl: typeof fetch = fetch): Promise<CheckStep[]> {
  const steps: CheckStep[] = [
    {
      name: "config",
      ok: true,
      detail:
        `url=${cfg.url} client_id=${cfg.clientId} client_secret=${cfg.clientSecret ? "set" : "missing"} ` +
        `allowed_ba=${cfg.allowedBa.length > 0 ? cfg.allowedBa.join(",") : "(any)"} fake=${cfg.fake}`,
    },
  ];

  let ping: CheckStep;
  try {
    const res = await fetchImpl(`${cfg.url}/ping.php`, { signal: AbortSignal.timeout(cfg.timeoutMs), cache: "no-store" });
    const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
    const up = res.status === 200 && body?.status === "UP";
    ping = { name: "ping", ok: up, detail: `HTTP ${res.status} status=${String(body?.status ?? "?")}` };
  } catch (error) {
    ping = { name: "ping", ok: false, detail: `request failed (${error instanceof Error ? error.name : typeof error})` };
  }
  steps.push(ping);

  steps.push({
    name: "register",
    ok: true,
    detail:
      `at ${cfg.url}/apps.php register redirect_uris=${cfg.redirectUri} ` +
      `post_logout_redirect_uris=${cfg.postLogoutRedirectUri}`,
  });
  return steps;
}

async function main() {
  loadEnvFiles();
  let cfg: R6AuthConfig;
  try {
    cfg = parseR6AuthConfig(process.env);
  } catch (error) {
    console.error(red(`✗ config: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
  const steps = await checkSteps(cfg);
  for (const s of steps) console.log(`${s.ok ? green("✓") : red("✗")} ${bold(s.name)}: ${s.detail}`);
  process.exit(steps.every((s) => s.ok) ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
