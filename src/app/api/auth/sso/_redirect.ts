import { NextResponse } from "next/server";

/**
 * Same-site redirect with a relative Location. Never build it from
 * `request.url`: in the standalone server that is the bind address
 * (e.g. http://0.0.0.0:3000), not the public host behind the proxy.
 * `path` must already be a safe same-origin path.
 */
export function relativeRedirect(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}
