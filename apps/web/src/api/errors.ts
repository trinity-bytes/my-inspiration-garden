/**
 * Cause of an {@link ApiError}, mirrored from the request lifecycle:
 * - `network`: `fetch` itself failed (offline, DNS, CORS preflight, timeout…).
 * - `http`: the API responded with a non-2xx status.
 * - `invalid_response`: the API responded 2xx but the body did not match the
 *   expected shape.
 */
export type ApiErrorKind = "network" | "http" | "invalid_response";

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  /** HTTP status code, only present for `kind: "http"`. */
  status?: number;
  /** Server-provided `error.code` from the `{ error: { code, message } }` envelope. */
  code?: string;
}

/**
 * Typed error surfaced by the API client. Messages are always
 * garden-authored and never echo the underlying `fetch` error or raw
 * response body, so no internal detail (stack traces, DNS errors, server
 * message text) leaks to the UI.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, info: ApiErrorInfo) {
    super(message);
    this.name = "ApiError";
    this.kind = info.kind;
    this.status = info.status;
    this.code = info.code;
  }
}
