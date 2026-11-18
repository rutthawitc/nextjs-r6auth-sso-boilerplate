/** Small CLI helpers shared by the ops scripts (colours, prompts, env loading). */
import { config as loadEnv } from "dotenv";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

/** Load .env.local, then .env (existing process env always wins). */
export function loadEnvFiles(): void {
  loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false, quiet: true });
  loadEnv({ path: resolve(process.cwd(), ".env"), override: false, quiet: true });
}

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code: string, text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
export const bold = (t: string) => paint("1", t);
export const green = (t: string) => paint("32", t);
export const red = (t: string) => paint("31", t);
export const yellow = (t: string) => paint("33", t);

export class Reporter {
  failed = false;

  step(title: string): void {
    console.log(`\n${bold(title)}`);
  }

  ok(message: string): void {
    console.log(`  ${green("✓")} ${message}`);
  }

  bad(message: string, hint: string): void {
    this.failed = true;
    console.log(`  ${red("✗")} ${message}`);
    console.log(`    Hint: ${hint}`);
  }

  warn(message: string): void {
    console.log(`  ${yellow("!")} ${message}`);
  }
}

/** Print a two-column table with aligned columns. */
export function table(headers: [string, string], rows: Array<[string, string]>): void {
  const w0 = Math.max(headers[0].length, ...rows.map((r) => r[0].length));
  const line = (a: string, b: string) => `  ${a.padEnd(w0)}  ${b}`;
  console.log(line(headers[0], headers[1]));
  console.log(line("-".repeat(w0), "-".repeat(Math.max(headers[1].length, 5))));
  for (const [a, b] of rows) console.log(line(a, b));
}

/** Read the first line of a non-TTY stdin (undefined when it is empty). */
async function readPipedLine(): Promise<string | undefined> {
  process.stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk as string;
    const nl = data.indexOf("\n");
    if (nl !== -1) {
      data = data.slice(0, nl);
      break;
    }
  }
  return data === "" ? undefined : data.replace(/\r$/, "");
}

/**
 * Visible prompt. On a non-TTY stdin it returns "" without reading, so the one
 * piped line stays available for the password.
 */
export async function ask(question: string): Promise<string> {
  if (!process.stdin.isTTY) return "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveAnswer) => {
    rl.question(question, (answer) => {
      rl.close();
      resolveAnswer(answer.trim());
    });
  });
}

/**
 * Password prompt without echo. On a non-TTY stdin one line is read from stdin
 * (so a password can be piped in). The password is never
 * accepted as an argument or environment variable.
 */
export async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return (await readPipedLine()) ?? "";
  }

  const stdin = process.stdin;
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolvePassword, reject) => {
    let value = "";
    const finish = (err?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (err) reject(err);
      else resolvePassword(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return finish();
        if (ch === "\u0003") return finish(new Error("Cancelled."));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Parse `--name value` / `--name=value` options and positional arguments. */
export function parseArgs(argv: string[], options: string[]): { options: Record<string, string>; positional: string[] } {
  const opts: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m && options.includes(m[1])) {
      opts[m[1]] = m[2] ?? argv[++i] ?? "";
    } else if (arg.startsWith("--")) {
      opts[arg.slice(2)] = "";
    } else {
      positional.push(arg);
    }
  }
  return { options: opts, positional };
}
