/**
 * Base application error with HTTP status code and internal code.
 */
export class AppError extends Error {
  statusCode: number;

  code: string;

  /**
   * Constructs an AppError.
   * @param message Human readable message.
   * @param statusCode HTTP status code to send.
   * @param code Internal error identifier.
   */
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Error used when a resource cannot be located.
 */
export class NotFoundError extends AppError {
  /**
   * Constructs a NotFoundError.
   * @param message Error message.
   */
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * Error used when a request is unauthorized.
 */
export class UnauthorizedError extends AppError {
  /**
   * Constructs an UnauthorizedError.
   * @param message Error message.
   */
  constructor(message: string) {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * Error used when user lacks permissions.
 */
export class ForbiddenError extends AppError {
  /**
   * Constructs a ForbiddenError.
   * @param message Error message.
   */
  constructor(message: string) {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * Error used for bad client input.
 */
export class BadRequestError extends AppError {
  /**
   * Constructs a BadRequestError.
   * @param message Error message.
   */
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST');
  }
}

/**
 * Error used for conflicting state or constraint issues.
 */
export class ConflictError extends AppError {
  /**
   * Constructs a ConflictError.
   * @param message Error message.
   */
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * Error used when a client exceeds rate limits.
 */
export class TooManyRequestsError extends AppError {
  /**
   * Constructs a TooManyRequestsError.
   * @param message Error message.
   */
  constructor(message: string) {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
