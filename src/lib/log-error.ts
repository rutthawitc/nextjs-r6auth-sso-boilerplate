/**
 * Log-safe description of an error: its class and machine codes, never its
 * message. Drizzle query errors put the SQL and its params (names, emails,
 * units) in `message`, so messages must not reach the logs.
 */
export interface ErrorSummary {
  errorClass: string;
  code?: string;
  causeClass?: string;
  causeCode?: string;
}

function className(error: Error): string {
  return error.name && error.name !== "Error" ? error.name : error.constructor.name || "Error";
}

function stringCode(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function errorSummary(error: unknown): ErrorSummary {
  if (!(error instanceof Error)) return { errorClass: typeof error };
  const summary: ErrorSummary = { errorClass: className(error) };
  const code = stringCode(error);
  if (code) summary.code = code;
  const cause = error.cause;
  if (cause instanceof Error) {
    summary.causeClass = className(cause);
    const causeCode = stringCode(cause);
    if (causeCode) summary.causeCode = causeCode;
  }
  return summary;
}
