import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokensModal } from "../../src/tokens/TokensModal";

const existingToken = {
  id: "01HZY3Q3G0K8R4S8T2V6W0X4Y9",
  name: "agent-one",
  scope: "read" as const,
  createdAt: "2026-09-26T12:00:00.000Z",
};

describe("TokensModal (T12)", () => {
  it("is a keyboard-accessible labeled dialog", async () => {
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [] })}
        createToken={vi.fn()}
        revokeToken={vi.fn()}
      />,
    );
    expect(await screen.findByRole("dialog", { name: "API tokens" })).toBeInTheDocument();
  });

  it("shows 'no tokens yet' when the list is empty", async () => {
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [] })}
        createToken={vi.fn()}
        revokeToken={vi.fn()}
      />,
    );
    expect(await screen.findByText(/no tokens yet/i)).toBeInTheDocument();
  });

  it("lists existing tokens by name, scope, and created date — never a secret", async () => {
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [existingToken] })}
        createToken={vi.fn()}
        revokeToken={vi.fn()}
      />,
    );

    expect(await screen.findByText("agent-one")).toBeInTheDocument();
    expect(screen.getByText("read", { selector: ".tokens-modal__scope" })).toBeInTheDocument();
    expect(screen.queryByText(/^ig_/)).not.toBeInTheDocument();
  });

  it("shows a load error when listing tokens fails", async () => {
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockRejectedValue(new Error("boom"))}
        createToken={vi.fn()}
        revokeToken={vi.fn()}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("creates a token, showing its plaintext secret exactly once with a copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const createToken = vi.fn().mockResolvedValue({
      ...existingToken,
      id: "new-id",
      name: "agent-two",
      scope: "write",
      token: "ig_plaintext_secret",
    });

    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [] })}
        createToken={createToken}
        revokeToken={vi.fn()}
      />,
    );
    await screen.findByText(/no tokens yet/i);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "agent-two" } });
    fireEvent.change(screen.getByLabelText("Scope"), { target: { value: "write" } });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    await waitFor(() =>
      expect(createToken).toHaveBeenCalledWith({ name: "agent-two", scope: "write" }),
    );

    expect(await screen.findByText("ig_plaintext_secret")).toBeInTheDocument();
    expect(screen.getByText(/won't see this again/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("ig_plaintext_secret");

    // The new token appears in the list, without its secret repeated there.
    expect(screen.getByText("agent-two")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("ig_plaintext_secret")).not.toBeInTheDocument();
  });

  it("shows an inline error when token creation fails, without losing the form", async () => {
    const createToken = vi.fn().mockRejectedValue(new Error("boom"));
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [] })}
        createToken={createToken}
        revokeToken={vi.fn()}
      />,
    );
    await screen.findByText(/no tokens yet/i);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "agent-three" } });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create/i);
    expect(screen.getByLabelText("Name")).toHaveValue("agent-three");
  });

  it("revokes a token after confirming, and marks it revoked in the list", async () => {
    const revokeToken = vi.fn().mockResolvedValue(undefined);
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [existingToken] })}
        createToken={vi.fn()}
        revokeToken={revokeToken}
      />,
    );

    await screen.findByText("agent-one");
    fireEvent.click(screen.getByRole("button", { name: "Revoke agent-one" }));
    expect(await screen.findByRole("dialog", { name: "Revoke token" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => expect(revokeToken).toHaveBeenCalledWith(existingToken.id));
    expect(await screen.findByText(/revoked/i)).toBeInTheDocument();
  });

  it("cancelling the revoke confirmation leaves the token untouched", async () => {
    const revokeToken = vi.fn();
    render(
      <TokensModal
        onClose={vi.fn()}
        listTokens={vi.fn().mockResolvedValue({ tokens: [existingToken] })}
        createToken={vi.fn()}
        revokeToken={revokeToken}
      />,
    );

    await screen.findByText("agent-one");
    fireEvent.click(screen.getByRole("button", { name: "Revoke agent-one" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Revoke token" })).not.toBeInTheDocument();
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <TokensModal
        onClose={onClose}
        listTokens={vi.fn().mockResolvedValue({ tokens: [] })}
        createToken={vi.fn()}
        revokeToken={vi.fn()}
      />,
    );
    await screen.findByText(/no tokens yet/i);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
