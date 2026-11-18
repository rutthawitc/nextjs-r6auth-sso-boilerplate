import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/auth/redirect";

/**
 * Primary sign-in for employees: a plain link, so the browser follows the
 * redirects itself. `origin` (the host registered as redirect_uri) makes the
 * login start on that host, so the state cookie is set where the callback
 * reads it even when the page was opened by IP or a short host name.
 */
export default function SsoButton({ from, origin = "" }: { from?: string; origin?: string }) {
  const href = `${origin}/api/auth/sso/login?${new URLSearchParams({ from: safeRedirectPath(from) })}`;
  return (
    <Button asChild size="lg" className="w-full">
      <a href={href}>เข้าสู่ระบบด้วยบัญชี กปภ.</a>
    </Button>
  );
}
