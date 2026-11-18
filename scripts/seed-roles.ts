import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import path from "node:path";
import { eq } from "drizzle-orm";

const envLocalPath = path.resolve(process.cwd(), ".env.local");
const envPath = path.resolve(process.cwd(), ".env");

function isIgnorableEnvError(error: Error | undefined): boolean {
  return Boolean(
    error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );
}

const envLocalResult = dotenv.config({ path: envLocalPath });
const envLocalError = envLocalResult.error;
if (envLocalError && !isIgnorableEnvError(envLocalError)) {
  console.warn(
    `Could not load environment from ${envLocalPath}:`,
    envLocalError.message,
  );
}

const envDefaultResult = dotenv.config({ path: envPath });
const envDefaultError = envDefaultResult.error;
if (envDefaultError && !isIgnorableEnvError(envDefaultError)) {
  console.warn(
    `Could not load environment from ${envPath}:`,
    envDefaultError.message,
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not defined. Ensure it is set in .env.local or exported before running this script.",
  );
}

const DEFAULT_ROLES = [
  {
    name: "Super Admin",
    description: "Full system access with all permissions",
    permissions: [
      "users.read", "users.write", "users.delete",
      "roles.read", "roles.write", "roles.delete",
      "admin.access", "reports.read", "reports.write",
      "settings.read", "settings.write", "api.access"
    ],
    level: 999,
    isActive: true,
  },
  {
    name: "Admin",
    description: "Administrative access to manage users and basic settings",
    permissions: [
      "users.read", "users.write",
      "roles.read",
      "admin.access", "reports.read",
      "settings.read", "api.access"
    ],
    level: 100,
    isActive: true,
  },
  {
    name: "Manager",
    description: "Managerial access to view reports and user information",
    permissions: [
      "users.read",
      "roles.read",
      "reports.read", "reports.write",
      "api.access"
    ],
    level: 50,
    isActive: true,
  },
  {
    name: "User",
    description: "Basic user access with limited permissions",
    permissions: [
      "users.read",
      "api.access"
    ],
    level: 1,
    isActive: true,
  },
  {
    name: "Viewer",
    description: "Read-only access to view information",
    permissions: [
      "users.read",
      "reports.read"
    ],
    level: 0,
    isActive: true,
  },
];

async function seedRoles() {
  let sqlClient: ReturnType<typeof postgres> | null = null;
  
  try {
    console.log("🌱 Seeding default roles...");

    sqlClient = postgres(process.env.DATABASE_URL!, {
      max: 1,
      prepare: false,
    });

    const schema = await import("../src/db/schema");
    const { roles } = schema;

    const db = drizzle(sqlClient, { schema });

    for (const role of DEFAULT_ROLES) {
      const existingRole = await db
        .select()
        .from(roles)
        .where(eq(roles.name, role.name))
        .limit(1);

      if (existingRole.length === 0) {
        await db.insert(roles).values(role);
        console.log(`✅ Created role: ${role.name}`);
      } else {
        console.log(`⏭️  Role already exists: ${role.name}`);
      }
    }

    console.log("🎉 Role seeding completed!");
  } catch (error) {
    console.error("❌ Error seeding roles:", error);
    process.exit(1);
  } finally {
    await sqlClient?.end({ timeout: 5 }).catch(() => {});
  }
}

// Run the seeding
seedRoles().then(() => process.exit(0));