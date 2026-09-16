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
  const message = error instanceof Error ? error.message : "Unexpected error";
  return NextResponse.json({ error: { code: "INTERNAL", message } }, { status: 500 });
}
