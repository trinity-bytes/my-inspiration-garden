import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./primitives";

export const tokenScopeSchema = z.enum(["read", "write"]);
export type TokenScope = z.infer<typeof tokenScopeSchema>;

/** `write` implies `read`: a write token satisfies a read-scoped check too. */
export function scopeSatisfies(scope: TokenScope, required: TokenScope): boolean {
  if (required === "read") return scope === "read" || scope === "write";
  return scope === "write";
}

/** Public projection of an API token: never includes the raw secret or its hash. */
export const apiTokenPublicSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1),
  scope: tokenScopeSchema,
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.optional(),
  revokedAt: isoDateTimeSchema.optional(),
});
export type ApiTokenPublic = z.infer<typeof apiTokenPublicSchema>;
