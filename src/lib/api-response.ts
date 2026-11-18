import { NextResponse } from "next/server";

type ErrorPayload = {
  error: string;
};

export function createSuccessResponse<T>(
  data: T,
  init?: number | ResponseInit,
) {
  const responseInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, responseInit);
}

export function createErrorResponse(
  message: string,
  status: number = 500,
  extra?: Record<string, unknown>,
) {
  const payload: ErrorPayload & Record<string, unknown> = {
    error: message,
    ...(extra ?? {}),
  };

  return NextResponse.json(payload, { status });
}
