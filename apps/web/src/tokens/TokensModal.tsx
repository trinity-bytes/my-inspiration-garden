import type { ApiTokenPublic, CreateApiTokenInput, TokenScope } from "@garden/shared";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  type CreatedApiToken,
  createToken as createTokenDefault,
  listTokens as listTokensDefault,
  revokeToken as revokeTokenDefault,
  type TokensResult,
} from "../api/endpoints";
import { ConfirmDialog } from "../components/Dialog/ConfirmDialog";
import { useDialogFocusTrap } from "../components/Dialog/useDialogFocusTrap";
import "../forms/FormModal.css";
import "./TokensModal.css";

export interface TokensModalProps {
  onClose: () => void;
  listTokens?: () => Promise<TokensResult>;
  createToken?: (input: CreateApiTokenInput) => Promise<CreatedApiToken>;
  revokeToken?: (id: string) => Promise<void>;
}

const LOAD_ERROR = "Could not load tokens.";
const CREATE_ERROR = "Could not create the token. Please try again.";
const REVOKE_ERROR = "Could not revoke this token. Please try again.";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Owner-only API token manager (T12), opened from the Navbar's owner
 * controls next to Categories. Lists existing tokens (name, scope, created,
 * last used — never a secret), creates new scoped tokens (showing the
 * plaintext secret exactly once, right after creation), and revokes tokens
 * via the shared `ConfirmDialog`. Reuses the established modal shell
 * (`form-modal-backdrop`/`form-modal-dialog` + `useDialogFocusTrap`).
 */
export function TokensModal({
  onClose,
  listTokens = listTokensDefault,
  createToken = createTokenDefault,
  revokeToken = revokeTokenDefault,
}: TokensModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  // While the revoke ConfirmDialog is open, this dialog's own Escape/Tab
  // handling must stand down so only the nested ConfirmDialog's own
  // useDialogFocusTrap instance handles them (same nested-dialog pattern as
  // ItemDetailModal's trash confirm and CategoryManagerModal's delete).
  const { handleTabKey } = useDialogFocusTrap(dialogRef, () => {
    if (revokingId === null) onClose();
  });
  const titleId = "tokens-modal-title";
  const nameInputId = useId();
  const scopeSelectId = useId();

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tokens, setTokens] = useState<ApiTokenPublic[]>([]);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("read");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const revoking = tokens.find((token) => token.id === revokingId);

  useEffect(() => {
    let cancelled = false;
    listTokens()
      .then((result) => {
        if (cancelled) return;
        setTokens(result.tokens);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [listTokens]);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createToken({ name: trimmed, scope });
      const { token: secret, ...publicToken } = created;
      setTokens((current) => [...current, publicToken]);
      setCreatedSecret(secret);
      setName("");
      setScope("read");
    } catch {
      setError(CREATE_ERROR);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(): Promise<void> {
    if (!revoking) return;
    setError(null);
    try {
      await revokeToken(revoking.id);
      const revokedAt = new Date().toISOString();
      setTokens((current) =>
        current.map((token) => (token.id === revoking.id ? { ...token, revokedAt } : token)),
      );
    } catch {
      setError(REVOKE_ERROR);
    } finally {
      setRevokingId(null);
    }
  }

  function handleCopy(): void {
    if (!createdSecret) return;
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    const done = () => setCopied(true);
    if (clipboard?.writeText) {
      clipboard.writeText(createdSecret).then(done, done);
    } else {
      done();
    }
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only backdrop close, Escape is the keyboard equivalent (see ItemDetailModal precedent).
    // biome-ignore lint/a11y/useKeyWithClickEvents: see comment above.
    <div className="form-modal-backdrop" data-testid="tokens-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="glass form-modal-dialog tokens-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={revokingId === null ? handleTabKey : undefined}
      >
        <h2 id={titleId} className="form-modal__title">
          API tokens
        </h2>
        <p className="tokens-modal__intro">
          Scoped bearer tokens for agents, the browser extension, and the PWA. A <code>write</code>{" "}
          scope always implies <code>read</code>.
        </p>

        {error && (
          <p className="item-form__error" role="alert">
            {error}
          </p>
        )}

        {createdSecret && (
          <div className="tokens-modal__secret" role="status">
            <p className="tokens-modal__secret-warning">
              Copy this token now — you won't see this again.
            </p>
            <div className="tokens-modal__secret-row">
              <code className="tokens-modal__secret-value">{createdSecret}</code>
              <button type="button" onClick={handleCopy}>
                Copy
              </button>
            </div>
            {copied && <span className="tokens-modal__copied">Copied</span>}
            <div className="item-form__actions">
              <button
                type="button"
                onClick={() => {
                  setCreatedSecret(null);
                  setCopied(false);
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}

        {status === "loading" && <p>Loading tokens…</p>}
        {status === "error" && (
          <p className="item-form__error" role="alert">
            {LOAD_ERROR}
          </p>
        )}
        {status === "ready" && tokens.length === 0 && <p>No tokens yet.</p>}
        {status === "ready" && tokens.length > 0 && (
          <ul className="tokens-modal__list">
            {tokens.map((token) => (
              <li key={token.id} className="tokens-modal__item">
                <span className="tokens-modal__name">{token.name}</span>
                <span className="tokens-modal__scope">{token.scope}</span>
                <span className="tokens-modal__meta">Created {formatDate(token.createdAt)}</span>
                <span className="tokens-modal__meta">
                  {token.lastUsedAt ? `Last used ${formatDate(token.lastUsedAt)}` : "Never used"}
                </span>
                {token.revokedAt ? (
                  <span className="tokens-modal__revoked">Revoked</span>
                ) : (
                  <button type="button" onClick={() => setRevokingId(token.id)}>
                    Revoke {token.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="tokens-modal__create" onSubmit={handleCreate}>
          <div className="item-form__field">
            <label htmlFor={nameInputId}>Name</label>
            <input
              id={nameInputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. research-agent"
              disabled={creating}
            />
          </div>
          <div className="item-form__field">
            <label htmlFor={scopeSelectId}>Scope</label>
            <select
              id={scopeSelectId}
              value={scope}
              onChange={(event) => setScope(event.target.value as TokenScope)}
              disabled={creating}
            >
              <option value="read">Read</option>
              <option value="write">Read + write</option>
            </select>
          </div>
          <button type="submit" disabled={creating || name.trim().length === 0}>
            Create token
          </button>
        </form>

        <div className="item-form__actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {revoking && (
        <ConfirmDialog
          title="Revoke token"
          message={`Revoke "${revoking.name}"? Anything using this token will immediately lose access.`}
          confirmLabel="Revoke"
          destructive
          onCancel={() => setRevokingId(null)}
          onConfirm={() => {
            void handleRevoke();
          }}
        />
      )}
    </div>
  );
}
