export class BettingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "BettingError";
    this.code = code;
    this.status = status;
  }
}

export function isBettingError(error: unknown): error is BettingError {
  return error instanceof BettingError;
}
