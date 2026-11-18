/**
 * Error types shared across modules. Route handlers and Server Functions will
 * map these to HTTP responses in a later work package.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", options?: ErrorOptions) {
    super(message, "VALIDATION_ERROR", options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", options?: ErrorOptions) {
    super(message, "NOT_FOUND", options);
  }
}
