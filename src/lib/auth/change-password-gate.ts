/**
 * Where /change-password sends a visitor instead of showing the form, or null
 * to show it. Re-checks the contractor in the database so an ended contract
 * shows the contract message on /login instead of a generic refusal on submit.
 */
import { loadActivePrincipal } from "@/lib/auth/principal";
import type { SessionUser } from "@/lib/session-core";
import type { AppDb } from "@/lib/users/sync";

export async function changePasswordRedirect(
  user: Pick<SessionUser, "kind" | "id"> | null,
  db?: AppDb,
  now: Date = new Date(),
): Promise<string | null> {
  if (!user) return "/login?from=/change-password";
  if (user.kind !== "contractor") return "/profile";

  const result = await loadActivePrincipal(user, db, now);
  if (result.ok || result.reason === "password_change_required") return null;
  if (result.reason === "contract_ended") return "/login?contract=ended";
  if (result.reason === "contract_not_started") return "/login?contract=not_started";
  return "/login?expired=1&from=/change-password";
}
