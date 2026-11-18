import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

import { localAdmins, type SelectLocalAdmin } from "@/db/schema";
import { errorSummary } from "@/lib/log-error";
import type { AppDb } from "@/lib/users/sync";

export interface AuthResult {
  success: boolean;
  user?: SelectLocalAdmin;
  error?: string;
}

async function resolveDb(db?: AppDb): Promise<AppDb> {
  return db ?? ((await import("@/lib/db")).db as unknown as AppDb);
}

/**
 * Local authentication strategy for admin accounts (table `local_admins`).
 * Every local admin gets the `admin` session role.
 */
export const localAuthStrategy = {
  async authenticate(username: string, password: string, db?: AppDb): Promise<AuthResult> {
    try {
      const conn = await resolveDb(db);
      const [admin] = await conn
        .select()
        .from(localAdmins)
        .where(eq(localAdmins.username, username.trim().toLowerCase()))
        .limit(1);

      if (!admin) {
        return { success: false };
      }

      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) {
        return { success: false };
      }

      if (!admin.isActive) {
        return {
          success: false,
          error: "Your account has been deactivated. Please contact an administrator.",
        };
      }

      return { success: true, user: admin };
    } catch (error) {
      console.error("Local authentication error", errorSummary(error));
      return { success: false };
    }
  },
};

/** Updates a local admin's last login timestamp. */
export async function updateLocalAdminLastLogin(adminId: string, db?: AppDb): Promise<void> {
  const conn = await resolveDb(db);
  const now = new Date();
  await conn
    .update(localAdmins)
    .set({ lastLogin: now, updatedAt: now })
    .where(eq(localAdmins.id, adminId));
}
