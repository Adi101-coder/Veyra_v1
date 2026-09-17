/**
 * Shared PostgreSQL write-conflict handling.
 *
 * Under READ COMMITTED, two concurrent `upsert`s on the same row do not serialise:
 * the loser raises P2002 (unique violation) rather than falling through to the
 * update. Every upsert that two requests or two workers can reach at the same time
 * must therefore be retried rather than treated as "already present".
 */

/** Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Prisma write conflict / deadlock (transaction may be retried). */
export function isWriteConflict(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2034";
}

export async function withUniqueRetry<T>(run: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if ((!isUniqueViolation(error) && !isWriteConflict(error)) || attempt >= attempts) throw error;
    }
  }
}
