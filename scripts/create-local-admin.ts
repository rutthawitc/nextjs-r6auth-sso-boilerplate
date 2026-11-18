import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import dotenv from "dotenv";
import path from "node:path";
import postgres from "postgres";

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

interface CliArgs {
  username?: string;
  password?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: "admin" | "user";
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2) as keyof CliArgs;
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for flag --${key}`);
    }

    args[key] = value as never;
    index += 1;
  }

  return args;
}

async function main() {
  let sqlClient: ReturnType<typeof postgres> | null = null;
  try {
    const argv = process.argv.slice(2);
    const args = parseArgs(argv);

    if (!args.username || !args.password) {
      throw new Error(
        "Usage: pnpm create-local-admin -- --username <name> --password <password> [--firstname <first>] [--lastname <last>] [--email <ignored>] [--role admin]",
      );
    }

    if (args.role && args.role !== "admin") {
      throw new Error("Local accounts are always administrators; only --role admin is accepted.");
    }

    const schema = await import("@/db/schema");
    const { localAdmins } = schema;

    sqlClient = postgres(process.env.DATABASE_URL!, {
      max: 1,
      prepare: false,
    });

    const db = drizzle(sqlClient, { schema });

    const username = args.username.trim().toLowerCase();

    const [existing] = await db
      .select({ id: localAdmins.id })
      .from(localAdmins)
      .where(eq(localAdmins.username, username))
      .limit(1);

    if (existing) {
      throw new Error(`Local admin "${username}" already exists.`);
    }

    const hashedPassword = await bcrypt.hash(args.password, 12);
    const displayName =
      [args.firstname, args.lastname].filter(Boolean).join(" ").trim() || null;

    const [admin] = await db
      .insert(localAdmins)
      .values({ username, password: hashedPassword, displayName })
      .returning({ id: localAdmins.id, username: localAdmins.username });

    console.log("✔ Successfully created local admin", {
      id: admin.id,
      username: admin.username,
    });
  } finally {
    await sqlClient?.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((error) => {
  console.error("✖ Failed to create local user", error);
  process.exit(1);
});
