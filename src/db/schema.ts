import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const accountTypeEnum = pgEnum("account_type", ["sso", "contractor"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"]);

/** SSO (r6auth) and contractor accounts. Local administrators live in `local_admins`. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Employee code from r6auth (lowercased, e.g. `10001`) or contractor code (digits only). */
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    /** Not unique: the directory does not guarantee unique mail. */
    email: text("email"),
    title: text("title"),
    department: text("department"),
    company: text("company"),
    phone: text("phone"),
    /** Business area (BA) code, e.g. `1059` for region 6 office. */
    businessArea: text("business_area"),
    /** Keycloak user id from r6auth (`sub`); informational, identity is `username`. */
    ssoSub: text("sso_sub"),
    nameEn: text("name_en"),
    level: text("level"),
    division: text("division"),
    office: text("office"),
    /** Cost center (ศูนย์ต้นทุน); drives `cost_center_roles`. */
    costCenter: text("cost_center"),
    role: userRoleEnum("role").notNull().default("user"),
    isActive: boolean("is_active").notNull().default(true),
    approvalStatus: approvalStatusEnum("approval_status").notNull().default("approved"),
    accountType: accountTypeEnum("account_type").notNull().default("sso"),
    /** bcrypt hash; contractors only. */
    passwordHash: text("password_hash"),
    /** Contract window as YYYY-MM-DD (Asia/Bangkok calendar days); contractors only. */
    contractStart: date("contract_start", { mode: "string" }),
    contractEnd: date("contract_end", { mode: "string" }),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    lastLogin: timestamp("last_login", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_cost_center_idx").on(table.costCenter),
    check(
      "users_contractor_fields_check",
      sql`(${table.accountType} = 'sso' AND ${table.passwordHash} IS NULL) OR (${table.accountType} = 'contractor' AND ${table.passwordHash} IS NOT NULL AND ${table.contractStart} IS NOT NULL AND ${table.contractEnd} IS NOT NULL AND ${table.contractEnd} >= ${table.contractStart})`,
    ),
  ],
);

/** Locally managed administrator accounts (bcrypt password). Every row is an admin. */
export const localAdmins = pgTable("local_admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Always stored lowercased. */
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  isActive: boolean("is_active").notNull().default(true),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: text("permissions").array().notNull().default([]),
  level: integer("level").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
  // Deliberately NOT a foreign key: the assigning admin may be a local admin
  // (table `local_admins`) or an SSO user. Cost-center role sync writes null.
  assignedBy: uuid("assigned_by"),
}, (table) => ({
  userRoleIdx: uniqueIndex("user_roles_user_role_idx").on(table.userId, table.roleId),
}));

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Cost center -> RBAC role, reconciled on every SSO login (exact code match). */
export const costCenterRoles = pgTable(
  "cost_center_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    costCenter: text("cost_center").notNull(),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("cost_center_roles_cc_role_idx").on(table.costCenter, table.roleId)],
);

/** Reference names for cost centers (seeded from CSV). Not a foreign key target. */
export const costCenters = pgTable("cost_centers", {
  code: text("code").primaryKey(),
  ba: text("ba").notNull(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Failed-login counters (fixed window), keyed by `lower(username)|ip`. */
export const loginThrottle = pgTable(
  "login_throttle",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull().default(0),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("login_throttle_reset_at_idx").on(table.resetAt)],
);

export type SelectUser = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SelectLocalAdmin = typeof localAdmins.$inferSelect;
export type InsertLocalAdmin = typeof localAdmins.$inferInsert;
export type SelectRole = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;
export type SelectUserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;
export type SelectSystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
export type SelectCostCenterRole = typeof costCenterRoles.$inferSelect;
export type SelectCostCenter = typeof costCenters.$inferSelect;
export type ApprovalStatus = "pending" | "approved" | "rejected";