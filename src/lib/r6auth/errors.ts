/** The authorization code is unknown, expired, already used or bound to another client. */
export class InvalidGrantError extends Error {
  constructor(message = "r6auth rejected the authorization code") {
    super(message);
    this.name = "InvalidGrantError";
  }
}

/** r6auth could not be used: network, timeout, bad credentials of this app, or an unexpected answer. */
export class R6AuthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R6AuthUnavailableError";
  }
}
