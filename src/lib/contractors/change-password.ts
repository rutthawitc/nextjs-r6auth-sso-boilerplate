/**
 * Contractor password change. Pure service with injectable deps; the route
 * maps the result to HTTP. Passwords are never logged or returned.
 */
import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";

import { users } from "@/db/schema";
import * as throttle from "@/lib/auth/throttle";
import type { SessionUser } from "@/lib/session-core";
import type { AppDb } from "@/lib/users/sync";

import { BCRYPT_COST } from "./constants";
import { isWithinContract } from "./contract";
import { checkNewPassword, type PasswordProblem } from "./password";

export type ChangePasswordFailureCode =
  | "INVALID_CURRENT"
  | "TOO_MANY_ATTEMPTS"
  | "WEAK_PASSWORD"
  | "SAME_PASSWORD"
  | "NOT_ALLOWED"
  | "SERVICE_UNAVAILABLE";

export type ChangePasswordResult =
  | { ok: true; user: SessionUser }
  | { ok: false; code: ChangePasswordFailureCode; problem?: PasswordProblem; retryAfterSeconds?: number };

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  ip: string;
}

export interface ChangePasswordDeps {
  db?: AppDb;
  now?: () => Date;
}

const fail = (
  code: ChangePasswordFailureCode,
  extra?: { problem?: PasswordProblem; retryAfterSeconds?: number },
): ChangePasswordResult => ({ ok: false, code, ...extra });

export async function changeContractorPassword(
  input: ChangePasswordInput,
  deps: ChangePasswordDeps = {},
): Promise<ChangePasswordResult> {
  const now = (deps.now ?? (() => new Date()))();
  try {
    const db = deps.db ?? ((await import("@/lib/db")).db as unknown as AppDb);

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.accountType, "contractor")))
      .limit(1);
    if (!user || !user.passwordHash || !user.isActive) return fail("NOT_ALLOWED");
    if (isWithinContract(user.contractStart ?? "", user.contractEnd ?? "", now) !== "ok") {
      return fail("NOT_ALLOWED");
    }

    // Same counter as login: guessing the current password here is guessing the login.
    const key = throttle.throttleKey(user.username, input.ip);
    const tOpts = { db, now };
    const status = await throttle.check(key, tOpts);
    if (status.locked) return fail("TOO_MANY_ATTEMPTS", { retryAfterSeconds: status.retryAfterSeconds });

    const currentOk =
      input.currentPassword.length > 0 &&
      input.currentPassword.length <= 1024 &&
      (await bcrypt.compare(input.currentPassword, user.passwordHash));
    if (!currentOk) {
      await throttle.hit(key, tOpts);
      return fail("INVALID_CURRENT");
    }

    const problem = checkNewPassword(input.newPassword);
    if (problem) return fail("WEAK_PASSWORD", { problem });
    if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
      return fail("SAME_PASSWORD", { problem: "same_as_current" });
    }

    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    // Guarded on the hash we verified, so two concurrent changes cannot both win.
    const updated = await db
      .update(users)
      .set({ passwordHash: newHash, mustChangePassword: false, passwordChangedAt: now, updatedAt: now })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
      .returning({ id: users.id });
    if (updated.length === 0) return fail("SERVICE_UNAVAILABLE");

    await throttle.clear(key, tOpts).catch(() => {});

    return {
      ok: true,
      user: {
        kind: "contractor",
        id: user.id,
        username: user.username,
        role: "user",
        displayName: user.displayName,
        ...(user.firstName ? { firstName: user.firstName } : {}),
        mustChangePassword: false,
      },
    };
  } catch (error) {
    console.error("Contractor password change failed", error instanceof Error ? error.name : typeof error);
    return fail("SERVICE_UNAVAILABLE");
  }
}
