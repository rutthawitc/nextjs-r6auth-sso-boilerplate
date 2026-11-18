/**
 * Admin-side contractor management. Pure service with injectable deps; the
 * routes map ContractorError to HTTP. Never returns a password hash. The only
 * plaintext password that leaves this module is `generatedPassword`, shown
 * once to the admin.
 */
import bcrypt from "bcrypt";
import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { localAdmins, roles, userRoles, users } from "@/db/schema";
import * as throttle from "@/lib/auth/throttle";
import { ensureBaseUserRole, type AppDb } from "@/lib/users/sync";

import { BCRYPT_COST, CONTRACTOR_CODE_RE, CONTRACTOR_MAX_ROLE_LEVEL } from "./constants";
import { canDeleteContractor, contractStatus, isValidDateString, type ContractStatus } from "./contract";
import { checkNewPassword, generatePassword, PASSWORD_MESSAGES } from "./password";

export type ContractorErrorCode =
  | "USERNAME_TAKEN"
  | "INVALID_INPUT"
  | "ROLE_NOT_ALLOWED"
  | "NOT_FOUND"
  | "NOT_DELETABLE";

export class ContractorError extends Error {
  constructor(
    public readonly code: ContractorErrorCode,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ContractorError";
  }
}

export interface AdminOptions {
  db?: AppDb;
  now?: Date;
  /** Admin session user id, stored as `user_roles.assignedBy` (not a FK). */
  actorId?: string | null;
}

export interface RoleSummary {
  id: string;
  name: string;
  level: number;
}

export type ContractorRow = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  department: string;
  businessArea: string;
  phone: string | null;
  contractStart: string;
  contractEnd: string;
  isActive: boolean;
  status: ContractStatus;
  daysLeft: number;
  /** Assigned RBAC roles, excluding the implicit base `user` role. */
  roles: RoleSummary[];
  lastLogin: string | null;
};

export interface ContractorProfileInput {
  firstName: string;
  lastName: string;
  department: string;
  businessArea: string;
  phone?: string | null;
  roleIds: string[];
}

export interface CreateContractorInput extends ContractorProfileInput {
  username: string;
  contractStart: string;
  contractEnd: string;
  password?: string;
}

const resolveDb = async (db?: AppDb): Promise<AppDb> =>
  db ?? ((await import("@/lib/db")).db as unknown as AppDb);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertDates(start: string, end: string): void {
  if (!isValidDateString(start)) throw new ContractorError("INVALID_INPUT", "Invalid contract start date.", "contractStart");
  if (!isValidDateString(end)) throw new ContractorError("INVALID_INPUT", "Invalid contract end date.", "contractEnd");
  if (end < start) throw new ContractorError("INVALID_INPUT", "Contract end must not be before start.", "contractEnd");
}

function assertPassword(password: string): void {
  const problem = checkNewPassword(password);
  if (problem) throw new ContractorError("INVALID_INPUT", PASSWORD_MESSAGES[problem], "password");
}

function assertName(value: string, field: string): void {
  if (value.trim().length === 0) throw new ContractorError("INVALID_INPUT", `${field} is required.`, field);
}

function isUniqueViolation(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 4 && e && typeof e === "object"; i++) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/** Throws ROLE_NOT_ALLOWED unless every id is an active, assignable, non-base role. */
async function assertAssignableRoles(db: AppDb, roleIds: string[]): Promise<string[]> {
  const unique = [...new Set(roleIds)];
  for (const id of unique) {
    if (!UUID_RE.test(id)) throw new ContractorError("ROLE_NOT_ALLOWED", "Role not allowed.", "roleIds");
  }
  if (unique.length === 0) return unique;
  const found = await db.select().from(roles).where(inArray(roles.id, unique));
  const byId = new Map(found.map((r) => [r.id, r]));
  for (const id of unique) {
    const r = byId.get(id);
    if (!r || !r.isActive || r.level > CONTRACTOR_MAX_ROLE_LEVEL || r.name === "user") {
      throw new ContractorError("ROLE_NOT_ALLOWED", "Role not allowed.", "roleIds");
    }
  }
  return unique;
}

async function replaceRoles(
  tx: AppDb,
  userId: string,
  roleIds: string[],
  actorId: string | null,
): Promise<void> {
  const baseRoleId = await ensureBaseUserRole(tx);
  const keep = baseRoleId ? [baseRoleId] : [];
  await tx
    .delete(userRoles)
    .where(baseRoleId ? and(eq(userRoles.userId, userId), ne(userRoles.roleId, baseRoleId)) : eq(userRoles.userId, userId));
  const wanted = [...keep, ...roleIds];
  if (wanted.length > 0) {
    await tx
      .insert(userRoles)
      .values(wanted.map((roleId) => ({ userId, roleId, assignedBy: actorId })))
      .onConflictDoNothing();
  }
}

async function loadRow(db: AppDb, id: string, now: Date): Promise<ContractorRow | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.accountType, "contractor")))
    .limit(1);
  if (!u) return null;
  return (await toRows(db, [u], now))[0];
}

async function toRows(db: AppDb, list: (typeof users.$inferSelect)[], now: Date): Promise<ContractorRow[]> {
  if (list.length === 0) return [];
  const assigned = await db
    .select({ userId: userRoles.userId, id: roles.id, name: roles.name, level: roles.level })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        inArray(
          userRoles.userId,
          list.map((u) => u.id),
        ),
        ne(roles.name, "user"),
      ),
    )
    .orderBy(asc(roles.level), asc(roles.name));
  return list.map((u) => {
    const contractStart = u.contractStart ?? "";
    const contractEnd = u.contractEnd ?? "";
    const { status, daysLeft } = contractStatus({ isActive: u.isActive, contractStart, contractEnd }, now);
    return {
      id: u.id,
      username: u.username,
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      department: u.department ?? "",
      businessArea: u.businessArea ?? "",
      phone: u.phone,
      contractStart,
      contractEnd,
      isActive: u.isActive,
      status,
      daysLeft,
      roles: assigned.filter((a) => a.userId === u.id).map((a) => ({ id: a.id, name: a.name, level: a.level })),
      lastLogin: u.lastLogin ? u.lastLogin.toISOString() : null,
    };
  });
}

export async function listContractors(opts: AdminOptions = {}): Promise<ContractorRow[]> {
  const db = await resolveDb(opts.db);
  const list = await db
    .select()
    .from(users)
    .where(eq(users.accountType, "contractor"))
    .orderBy(asc(users.username));
  return toRows(db, list, opts.now ?? new Date());
}

export async function listAssignableRoles(opts: AdminOptions = {}): Promise<RoleSummary[]> {
  const db = await resolveDb(opts.db);
  const list = await db
    .select({ id: roles.id, name: roles.name, level: roles.level })
    .from(roles)
    .where(and(eq(roles.isActive, true), ne(roles.name, "user")))
    .orderBy(asc(roles.level), asc(roles.name));
  return list.filter((r) => r.level <= CONTRACTOR_MAX_ROLE_LEVEL);
}

export async function createContractor(
  input: CreateContractorInput,
  opts: AdminOptions = {},
): Promise<{ contractor: ContractorRow; generatedPassword?: string }> {
  const db = await resolveDb(opts.db);
  const now = opts.now ?? new Date();

  if (!CONTRACTOR_CODE_RE.test(input.username)) {
    throw new ContractorError("INVALID_INPUT", "Contractor code must be digits only.", "username");
  }
  assertName(input.firstName, "firstName");
  assertName(input.lastName, "lastName");
  assertName(input.department, "department");
  assertName(input.businessArea, "businessArea");
  assertDates(input.contractStart, input.contractEnd);
  if (input.password !== undefined) assertPassword(input.password);
  const roleIds = await assertAssignableRoles(db, input.roleIds);

  const generatedPassword = input.password === undefined ? generatePassword() : undefined;
  const hash = await bcrypt.hash(input.password ?? (generatedPassword as string), BCRYPT_COST);

  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const t = tx as unknown as AppDb;
      const [admin] = await t
        .select({ id: localAdmins.id })
        .from(localAdmins)
        .where(eq(localAdmins.username, input.username.toLowerCase()))
        .limit(1);
      if (admin) throw new ContractorError("USERNAME_TAKEN", "Username already in use.", "username");

      const [row] = await t
        .insert(users)
        .values({
          username: input.username,
          displayName: `${input.firstName} ${input.lastName}`,
          firstName: input.firstName,
          lastName: input.lastName,
          department: input.department,
          businessArea: input.businessArea,
          phone: input.phone ? input.phone : null,
          role: "user",
          isActive: true,
          approvalStatus: "approved",
          accountType: "contractor",
          passwordHash: hash,
          contractStart: input.contractStart,
          contractEnd: input.contractEnd,
          mustChangePassword: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: users.id });
      await replaceRoles(t, row.id, roleIds, opts.actorId ?? null);
      return row.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ContractorError("USERNAME_TAKEN", "Username already in use.", "username");
    throw error;
  }

  const contractor = (await loadRow(db, id, now)) as ContractorRow;
  return { contractor, ...(generatedPassword ? { generatedPassword } : {}) };
}

async function requireContractor(db: AppDb, id: string): Promise<typeof users.$inferSelect> {
  if (!UUID_RE.test(id)) throw new ContractorError("NOT_FOUND", "Contractor not found.");
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.accountType, "contractor")))
    .limit(1);
  if (!u) throw new ContractorError("NOT_FOUND", "Contractor not found.");
  return u;
}

export async function updateContractor(
  id: string,
  input: ContractorProfileInput,
  opts: AdminOptions = {},
): Promise<ContractorRow> {
  const db = await resolveDb(opts.db);
  const now = opts.now ?? new Date();
  await requireContractor(db, id);
  assertName(input.firstName, "firstName");
  assertName(input.lastName, "lastName");
  assertName(input.department, "department");
  assertName(input.businessArea, "businessArea");
  const roleIds = await assertAssignableRoles(db, input.roleIds);

  await db.transaction(async (tx) => {
    const t = tx as unknown as AppDb;
    await t
      .update(users)
      .set({
        displayName: `${input.firstName} ${input.lastName}`,
        firstName: input.firstName,
        lastName: input.lastName,
        department: input.department,
        businessArea: input.businessArea,
        phone: input.phone ? input.phone : null,
        updatedAt: now,
      })
      .where(eq(users.id, id));
    await replaceRoles(t, id, roleIds, opts.actorId ?? null);
  });
  return (await loadRow(db, id, now)) as ContractorRow;
}

export async function renewContract(
  id: string,
  input: { contractStart: string; contractEnd: string },
  opts: AdminOptions = {},
): Promise<ContractorRow> {
  const db = await resolveDb(opts.db);
  const now = opts.now ?? new Date();
  await requireContractor(db, id);
  assertDates(input.contractStart, input.contractEnd);
  await db
    .update(users)
    .set({ contractStart: input.contractStart, contractEnd: input.contractEnd, updatedAt: now })
    .where(eq(users.id, id));
  return (await loadRow(db, id, now)) as ContractorRow;
}

export async function resetContractorPassword(
  id: string,
  input: { password?: string },
  opts: AdminOptions = {},
): Promise<{ generatedPassword?: string }> {
  const db = await resolveDb(opts.db);
  const now = opts.now ?? new Date();
  const user = await requireContractor(db, id);
  if (input.password !== undefined) assertPassword(input.password);
  const generatedPassword = input.password === undefined ? generatePassword() : undefined;
  const hash = await bcrypt.hash(input.password ?? (generatedPassword as string), BCRYPT_COST);
  await db
    .update(users)
    .set({ passwordHash: hash, mustChangePassword: true, passwordChangedAt: now, updatedAt: now })
    .where(eq(users.id, id));
  // A locked-out contractor must be able to use the new password right away.
  await throttle.clearForUsername(user.username, { db, now });
  return generatedPassword ? { generatedPassword } : {};
}

export async function setContractorActive(
  id: string,
  isActive: boolean,
  opts: AdminOptions = {},
): Promise<ContractorRow> {
  const db = await resolveDb(opts.db);
  const now = opts.now ?? new Date();
  await requireContractor(db, id);
  await db.update(users).set({ isActive, updatedAt: now }).where(eq(users.id, id));
  return (await loadRow(db, id, now)) as ContractorRow;
}

/**
 * Permanently deletes a contractor whose contract has ended or who is
 * deactivated. `user_roles` rows go with it (ON DELETE CASCADE); the code is
 * free for reuse afterwards. A session the contractor still holds stops working
 * on its next DB re-check, because the row is gone.
 */
export async function deleteContractor(id: string, opts: AdminOptions = {}): Promise<void> {
  const db = await resolveDb(opts.db);
  const now = opts.now ?? new Date();
  const u = await requireContractor(db, id);
  const { status } = contractStatus(
    { isActive: u.isActive, contractStart: u.contractStart ?? "", contractEnd: u.contractEnd ?? "" },
    now,
  );
  if (!canDeleteContractor(status)) {
    throw new ContractorError("NOT_DELETABLE", "Only ended or deactivated contractors can be deleted.");
  }
  await db.delete(users).where(and(eq(users.id, id), eq(users.accountType, "contractor")));
  console.info("Contractor deleted", { contractorId: id, actorId: opts.actorId ?? null });
}
