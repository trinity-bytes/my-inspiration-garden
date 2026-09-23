import type { ApiTokenPublic, CreateApiTokenInput, TokenScope } from "@garden/shared";
import { eq } from "drizzle-orm";
import { AppError } from "../../lib/errors";
import { generatePlaintextToken, hashToken } from "../../lib/tokens";
import type { Db } from "../client";
import { apiTokens } from "../schema";

export interface CreatedApiToken extends ApiTokenPublic {
  token: string;
}

export interface ActiveTokenLookup {
  id: string;
  name: string;
  scope: TokenScope;
}

function rowToPublic(row: typeof apiTokens.$inferSelect): ApiTokenPublic {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as TokenScope,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? undefined,
    revokedAt: row.revokedAt ?? undefined,
  };
}

export class TokensRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateApiTokenInput): Promise<CreatedApiToken> {
    const plaintext = generatePlaintextToken();
    const tokenHash = await hashToken(plaintext);
    const row = {
      id: crypto.randomUUID(),
      name: input.name,
      tokenHash,
      scope: input.scope,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.db.insert(apiTokens).values(row);
    return { ...rowToPublic(row as typeof apiTokens.$inferSelect), token: plaintext };
  }

  async list(): Promise<ApiTokenPublic[]> {
    const rows = await this.db.select().from(apiTokens);
    return rows.map(rowToPublic);
  }

  async revoke(id: string): Promise<void> {
    const existing = await this.db.select().from(apiTokens).where(eq(apiTokens.id, id)).limit(1);
    if (existing.length === 0) throw AppError.notFound("token not found");
    await this.db
      .update(apiTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(apiTokens.id, id));
  }

  /** Looks up an active (non-revoked) token by its plaintext value's SHA-256 hash. */
  async findActiveByPlaintext(plaintext: string): Promise<ActiveTokenLookup | null> {
    const tokenHash = await hashToken(plaintext);
    const rows = await this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row || row.revokedAt) return null;
    return { id: row.id, name: row.name, scope: row.scope as TokenScope };
  }

  /** Best-effort last-used bump; failures never fail the request. */
  async touchLastUsed(id: string): Promise<void> {
    try {
      await this.db
        .update(apiTokens)
        .set({ lastUsedAt: new Date().toISOString() })
        .where(eq(apiTokens.id, id));
    } catch {
      // best-effort only
    }
  }
}
