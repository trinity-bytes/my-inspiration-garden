import type { ZodType } from "zod";
import { ApiError } from "./errors";

export type SearchParamValue = string | number | boolean | undefined | string[];
export type SearchParams = Record<string, SearchParamValue>;

export interface ApiFetchOptions<T> {
  schema: ZodType<T>;
  method?: string;
  searchParams?: SearchParams;
  body?: unknown;
  signal?: AbortSignal;
}

function appendSearchParams(query: URLSearchParams, params: SearchParams | undefined): void {
  if (!params) return;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
      continue;
    }
    if (value === "") continue;
    query.append(key, String(value));
  }
}

/**
 * Joins a base URL (possibly empty, for same-origin requests) and a path,
 * appending a query string built from `params`. `undefined` values, empty
 * strings and empty arrays are omitted; array values become repeated keys
 * (matching the API's `itemListQuerySchema` preprocessing for `kind`, `tag`
 * and `categoryId`).
 */
export function buildRequestUrl(baseUrl: string, path: string, params?: SearchParams): string {
  const query = new URLSearchParams();
  appendSearchParams(query, params);
  const queryString = query.toString();
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const url = `${normalizedBase}${path}`;
  return queryString ? `${url}?${queryString}` : url;
}

/** Base URL of the API, from `VITE_API_URL`; empty string means same-origin. */
export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  return configured ? configured.replace(/\/$/, "") : "";
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string") return code;
    }
  }
  return undefined;
}

/**
 * Typed fetch wrapper for the Garden API's read/write endpoints. The web app
 * and the API share one hostname (same-origin topology, see `docs/api.md`),
 * so `credentials: "same-origin"` is enough for the owner's Access session
 * cookie to reach the API — no cross-origin credentialed CORS needed. Every
 * request also carries `X-Garden-Client: web`, which both identifies the web
 * client to the API (`source` tracking, `docs/api.md`) and — being a
 * non-CORS-safelisted header — is required input to the API's CSRF guard on
 * writes. Validates the response body against `schema`; any failure
 * (network, non-2xx status, unexpected shape) is surfaced as a typed
 * {@link ApiError}, never as a raw `fetch`/parsing exception.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions<T>): Promise<T> {
  const url = buildRequestUrl(resolveApiBaseUrl(), path, options.searchParams);
  const hasBody = options.body !== undefined;

  const headers = new Headers({ "X-Garden-Client": "web" });
  if (hasBody) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError("unable to reach the garden api", { kind: "network" });
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ApiError(`garden api request failed with status ${response.status}`, {
      kind: "http",
      status: response.status,
      code,
    });
  }

  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = options.schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError("garden api returned an unexpected response shape", {
      kind: "invalid_response",
    });
  }
  return parsed.data;
}
