/**
 * Uniform application error mapped to the API's `{ error: { code, message,
 * details? } }` JSON error shape by the http error handler (see
 * `src/http/app.ts`).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = "authentication required"): AppError {
    return new AppError(401, "unauthorized", message);
  }

  static forbidden(message = "insufficient permissions"): AppError {
    return new AppError(403, "forbidden", message);
  }

  static notFound(message = "not found"): AppError {
    return new AppError(404, "not_found", message);
  }

  static conflict(code: string, message: string, details?: unknown): AppError {
    return new AppError(409, code, message, details);
  }

  static unprocessable(code: string, message: string, details?: unknown): AppError {
    return new AppError(422, code, message, details);
  }
}

export function errorBody(error: AppError): {
  error: { code: string; message: string; details?: unknown };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    },
  };
}
