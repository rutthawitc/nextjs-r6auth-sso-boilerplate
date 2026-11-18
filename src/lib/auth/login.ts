/**
 * Password login (local admins and contractors): pure logic with injectable
 * dependencies. Employees sign in through r6auth SSO instead. The route handler
 * maps the result to HTTP; nothing here touches cookies or Next APIs.
 */
import bcrypt from "bcrypt";

import { isWithinContract } from "@/lib/contractors/contract";
import { localAuthStrategy, updateLocalAdminLastLogin } from "@/lib/auth-strategies";
import { errorSummary } from "@/lib/log-error";
import type { SessionUser } from "@/lib/session-core";
import type { AppDb } from "@/lib/users/sync";

import { findContractor, updateContractorLastLogin } from "./contractor-auth";
import { normalizeUsername } from "./normalize";
import * as throttle from "./throttle";

export type LoginFailureCode =
  | "INVALID_CREDENTIALS"
  | "TOO_MANY_ATTEMPTS"
  | "SERVICE_UNAVAILABLE"
  | "INACTIVE"
  | "CONTRACT_NOT_STARTED"
  | "CONTRACT_ENDED";

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; code: LoginFailureCode; retryAfterSeconds?: number };

export interface LoginInput {
  username: string;
  password: string;
  ip: string;
}

export interface LoginDeps {
  db?: AppDb;
  now?: () => Date;
  throttleWindowSeconds?: number;
  throttleMax?: number;
  logger?: Pick<Console, "error">;
}

const CONTROL_CHARS_FREE = /^[^\x00-\x1F\x7F]+$/;

const fail = (code: LoginFailureCode, extra?: { retryAfterSeconds?: number }): LoginResult => ({
  ok: false,
  code,
  ...extra,
});

export async function attemptLogin(input: LoginInput, deps: LoginDeps = {}): Promise<LoginResult> {
  const { username, password, ip } = input;
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => new Date());

  // 1. Input validation: no throttle hit.
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length < 1 ||
    username.length > 100 ||
    !CONTROL_CHARS_FREE.test(username) ||
    password.length < 1 ||
    password.length > 1024
  ) {
    return fail("INVALID_CREDENTIALS");
  }

  // 2. Normalize (employees may type "PWA\code" out of habit); "PWA\" alone normalizes to empty.
  const normalized = normalizeUsername(username);
  if (normalized === "") return fail("INVALID_CREDENTIALS");

  // 3. Throttle check.
  const key = throttle.throttleKey(normalized, ip);
  const tOpts = () => ({
    db: deps.db,
    now: now(),
    windowSeconds: deps.throttleWindowSeconds,
    max: deps.throttleMax,
  });
  try {
    const status = await throttle.check(key, tOpts());
    if (status.locked) return fail("TOO_MANY_ATTEMPTS", { retryAfterSeconds: status.retryAfterSeconds });
  } catch (error) {
    logger.error("Login throttle unavailable", errorInfo(normalized, error));
    return fail("SERVICE_UNAVAILABLE");
  }

  // 4. Local admin (raw trimmed input, lowercased by the strategy).
  const local = await localAuthStrategy.authenticate(username.trim(), password, deps.db);
  if (local.success && local.user) {
    const admin = local.user;
    try {
      await updateLocalAdminLastLogin(admin.id, deps.db);
      await throttle.clear(key, tOpts());
    } catch (error) {
      logger.error("Post-login bookkeeping failed", errorInfo(normalized, error));
    }
    return {
      ok: true,
      user: {
        kind: "local",
        id: admin.id,
        username: admin.username,
        role: "admin",
        displayName: admin.displayName ?? admin.username,
      },
    };
  }
  if (local.error) return fail("INACTIVE"); // password matched but the admin is inactive

  // 5. Contractor (local password).
  let contractor;
  try {
    contractor = await findContractor(normalized, deps.db);
  } catch (error) {
    logger.error("Contractor lookup failed", errorInfo(normalized, error));
    return fail("SERVICE_UNAVAILABLE");
  }
  if (contractor) {
    let passwordOk = false;
    try {
      passwordOk = contractor.passwordHash ? await bcrypt.compare(password, contractor.passwordHash) : false;
    } catch (error) {
      logger.error("Contractor password check failed", errorInfo(normalized, error));
      return fail("SERVICE_UNAVAILABLE");
    }
    if (!passwordOk) {
      await recordHit(key, tOpts(), logger, normalized);
      return fail("INVALID_CREDENTIALS");
    }
    if (!contractor.isActive) return fail("INACTIVE");
    // The CHECK constraint guarantees both dates for contractor rows.
    const window = isWithinContract(contractor.contractStart ?? "", contractor.contractEnd ?? "", now());
    if (window === "not_started") return fail("CONTRACT_NOT_STARTED");
    if (window === "ended") return fail("CONTRACT_ENDED");
    try {
      await updateContractorLastLogin(contractor.id, now(), deps.db);
    } catch (error) {
      logger.error("Contractor last_login update failed", errorInfo(normalized, error));
      return fail("SERVICE_UNAVAILABLE");
    }
    try {
      await throttle.clear(key, tOpts());
    } catch (error) {
      logger.error("Failed to clear login throttle", errorInfo(normalized, error));
    }
    return {
      ok: true,
      user: {
        kind: "contractor",
        id: contractor.id,
        username: contractor.username,
        role: "user",
        displayName: contractor.displayName,
        ...(contractor.firstName ? { firstName: contractor.firstName } : {}),
        mustChangePassword: contractor.mustChangePassword,
      },
    };
  }

  // 6. No local account matched: count it like a wrong password.
  await recordHit(key, tOpts(), logger, normalized);
  return fail("INVALID_CREDENTIALS");
}

async function recordHit(
  key: string,
  opts: Parameters<typeof throttle.hit>[1],
  logger: Pick<Console, "error">,
  username: string,
) {
  try {
    await throttle.hit(key, opts);
  } catch (error) {
    logger.error("Failed to record login attempt", errorInfo(username, error));
  }
}

/** Server-side log payload: username and error class/codes. Never the password or the error message (query params). */
function errorInfo(username: string, error: unknown) {
  return { username, ...errorSummary(error) };
}
