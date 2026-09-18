/**
 * Errors the transaction flow can produce, named so the UI can react to the kind rather
 * than matching on message text.
 */

export class UserRejectedError extends Error {
  constructor() {
    super("Transaction rejected in wallet");
    this.name = "UserRejectedError";
  }
}

export class ContractRevertError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ContractRevertError";
  }
}

/**
 * The action was not needed, which is not the same as the action failing.
 *
 * Raised where there is genuinely nothing to sign. Presenting that as an error taught people
 * that a working button was broken, and sent them looking for a fault that was never there.
 */
export class NothingToDoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NothingToDoError";
  }
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet. The lock contract ships in part 2.`);
    this.name = "NotImplementedError";
  }
}

/**
 * A readable sentence from whatever was thrown.
 *
 * viem wraps its errors, so the useful part is shortMessage rather than message. A user
 * rejection is special-cased because every wallet words it differently and none of them
 * word it well.
 */
export function describeError(error: unknown): string {
  if (error instanceof UserRejectedError) return error.message;

  if (error && typeof error === "object") {
    const candidate = error as {shortMessage?: string; message?: string; details?: string};
    const short = candidate.shortMessage ?? candidate.message;
    if (typeof short === "string") {
      if (/user rejected|user denied|rejected the request/i.test(short)) {
        return "Transaction rejected in wallet";
      }
      const details = candidate.details;
      return details && details.length < 140 ? `${short} (${details})` : short;
    }
  }

  return String(error);
}
