import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagManagerModal } from "../../src/tags/TagManagerModal";
import { getTagsVersion } from "../../src/tags/tags-store";

function baseTags() {
  return [
    { id: "t-web", name: "web-reference", count: 53 },
    { id: "t-ref", name: "web-ref", count: 3 },
    { id: "t-insp", name: "inspiration", count: 94 },
    { id: "t-harness", name: "harness", count: 0 },
    { id: "t-github", name: "github", count: 0 },
  ];
}

function renderModal(overrides: Partial<Parameters<typeof TagManagerModal>[0]> = {}) {
  const props = {
    onClose: vi.fn(),
    onTagsChange: vi.fn(),
    getTags: vi.fn().mockResolvedValue({ tags: baseTags() }),
    renameTag: vi.fn().mockResolvedValue({ id: "t-web", name: "web-reference", count: 56 }),
    deleteTag: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<TagManagerModal {...props} />);
  return props;
}

function rowNames(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((row) => row.querySelector(".tag-manager__name")?.textContent ?? "");
}

describe("TagManagerModal", () => {
  it("lists every tag, most used first, with its item count or Unused", async () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Tags" })).toBeInTheDocument();
    await screen.findByText("inspiration");

    expect(rowNames()).toEqual(["inspiration", "web-reference", "web-ref", "github", "harness"]);
    const insp = screen.getByText("inspiration").closest("li") as HTMLElement;
    expect(within(insp).getByText("94 items")).toBeInTheDocument();
    const harness = screen.getByText("harness").closest("li") as HTMLElement;
    expect(within(harness).getByText("Unused")).toBeInTheDocument();
  });

  it("sorts A–Z and filters by name", async () => {
    renderModal();
    await screen.findByText("inspiration");

    fireEvent.click(screen.getByRole("button", { name: "A–Z" }));
    expect(rowNames()).toEqual(["github", "harness", "inspiration", "web-ref", "web-reference"]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search tags" }), {
      target: { value: "WEB" },
    });
    expect(rowNames()).toEqual(["web-ref", "web-reference"]);
  });

  it("renames a tag, warns about a merge, and reports the change", async () => {
    const props = renderModal();
    await screen.findByText("web-ref");
    const versionBefore = getTagsVersion();

    fireEvent.click(screen.getByRole("button", { name: "Rename web-ref" }));
    const input = screen.getByRole("textbox", { name: "Rename web-ref" });
    fireEvent.change(input, { target: { value: " Web-Reference " } });
    expect(
      screen.getByText(
        "A tag named “web-reference” already exists. Saving merges these 3 items into it.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(props.renameTag).toHaveBeenCalledWith("t-ref", "Web-Reference"));
    await waitFor(() =>
      expect(props.onTagsChange).toHaveBeenCalledWith([{ from: "web-ref", to: "web-reference" }]),
    );
    expect(getTagsVersion()).toBe(versionBefore + 1);
    expect(props.getTags).toHaveBeenCalledTimes(2);
  });

  it("deletes one tag after confirming", async () => {
    const props = renderModal();
    await screen.findByText("inspiration");

    fireEvent.click(screen.getByRole("button", { name: "Delete inspiration" }));
    const confirm = screen.getByRole("dialog", { name: "Delete “inspiration”?" });
    expect(
      within(confirm).getByText("It will be removed from 94 items. The items stay in the garden."),
    ).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete tag" }));

    await waitFor(() => expect(props.deleteTag).toHaveBeenCalledWith("t-insp"));
    await waitFor(() =>
      expect(props.onTagsChange).toHaveBeenCalledWith([{ from: "inspiration", to: null }]),
    );
  });

  it("deletes every unused tag at once after confirming", async () => {
    const props = renderModal();
    await screen.findByText("inspiration");

    expect(screen.getByText("2 tags aren’t on any item.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete unused" }));
    const confirm = screen.getByRole("dialog", { name: "Delete 2 unused tags?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete 2 tags" }));

    await waitFor(() => expect(props.deleteTag).toHaveBeenCalledTimes(2));
    expect(props.deleteTag).toHaveBeenCalledWith("t-harness");
    expect(props.deleteTag).toHaveBeenCalledWith("t-github");
    await waitFor(() => expect(props.onTagsChange).toHaveBeenCalledTimes(1));
    expect(props.onTagsChange).toHaveBeenCalledWith([
      { from: "github", to: null },
      { from: "harness", to: null },
    ]);
  });

  it("hides the unused cleanup when every tag is in use", async () => {
    renderModal({
      getTags: vi.fn().mockResolvedValue({ tags: [{ id: "a", name: "ai", count: 1 }] }),
    });
    await screen.findByText("ai");
    expect(screen.queryByRole("button", { name: "Delete unused" })).not.toBeInTheDocument();
  });

  it("shows an error when a mutation fails", async () => {
    renderModal({ deleteTag: vi.fn().mockRejectedValue(new Error("network")) });
    await screen.findByText("inspiration");

    fireEvent.click(screen.getByRole("button", { name: "Delete inspiration" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That tag action failed. Please try again.",
    );
  });

  it("shows an empty state when there are no tags", async () => {
    renderModal({ getTags: vi.fn().mockResolvedValue({ tags: [] }) });
    expect(await screen.findByText("No tags yet.")).toBeInTheDocument();
  });
});
