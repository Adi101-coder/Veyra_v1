import { NextResponse } from "next/server";
import { isBettingError } from "@/server/errors";
import { MoneyError } from "@/server/money";

export function jsonError(error: unknown) {
  if (isBettingError(error)) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof MoneyError) {
    return NextResponse.json(
      { error: { code: "INVALID_MONEY", message: error.message } },
      { status: 400 },
    );
  }
  // Never echo internal errors (Prisma, SDK, stack details) to clients.
  console.error("[api] unhandled error", error instanceof Error ? { name: error.name, message: error.message } : error);
  const malformed = error instanceof SyntaxError;
  return NextResponse.json(
    { error: malformed ? { code: "INVALID_JSON", message: "Request body must be valid JSON." } : { code: "INTERNAL", message: "Unexpected server error." } },
    { status: malformed ? 400 : 500 },
  );
}
