import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemDetailModal } from "../../src/detail/ItemDetailModal";
import { makeItem } from "../fixtures/items";

describe("ItemDetailModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders as a labelled dialog", () => {
    const item = makeItem("i1", "text", { body: "hello" }, { title: "My note" });
    render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("My note");
  });

  it("calls onClose on Escape", () => {
    const item = makeItem("i2", "text", { body: "hello" });
    const onClose = vi.fn();
    render(<ItemDetailModal item={item} onClose={onClose} categoryNames={{}} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on backdrop click, but not on a click inside the dialog content", () => {
    const item = makeItem("i3", "text", { body: "hello" }, { title: "Note" });
    const onClose = vi.fn();
    render(<ItemDetailModal item={item} onClose={onClose} categoryNames={{}} />);

    fireEvent.click(screen.getByText("Note"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("detail-modal-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the element that opened it once closed", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const item = makeItem("i4", "text", { body: "hello" }, { title: "Note" });
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open && (
            <ItemDetailModal item={item} onClose={() => setOpen(false)} categoryNames={{}} />
          )}
        </div>
      );
    }
    render(<Harness />);
    const openButton = screen.getByRole("button", { name: "Open" });
    openButton.focus();
    fireEvent.click(openButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(openButton).toHaveFocus();
  });

  it("opens focused on Close and keeps owner actions as named icon buttons, trash in the danger tone", () => {
    const item = makeItem("i9", "text", {}, { title: "Note" });
    render(
      <ItemDetailModal
        item={item}
        onClose={() => {}}
        categoryNames={{}}
        isOwner
        onEdit={() => {}}
        onOpenHistory={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveClass("icon-button--neutral");
    expect(screen.getByRole("button", { name: "History" })).toHaveClass("icon-button--neutral");
    expect(screen.getByRole("button", { name: "Move to trash" })).toHaveClass(
      "icon-button--danger",
    );
  });

  it("shows tags as static chips with a # prefix and makes the preview image open the link", () => {
    const item = makeItem(
      "i10",
      "link",
      { previewImage: "https://example.com/p.png" },
      { title: "A link", url: "https://example.com/a", tags: ["moodboard"] },
    );
    render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

    const tag = within(screen.getByRole("list", { name: "Tags" })).getByRole("listitem");
    expect(tag).toHaveClass("chip--static");
    expect(tag).toHaveTextContent("#moodboard");

    const preview = document.querySelector(".item-detail__preview-link");
    expect(preview).toHaveAttribute("href", "https://example.com/a");
    expect(preview).toHaveAttribute("tabindex", "-1");
    expect(preview).toHaveTextContent("Open");
    // Only the "Open link" button is in the tab order.
    expect(screen.getByRole("link", { name: /open link/i })).not.toHaveAttribute("tabindex");
  });

  it("traps Tab focus within the dialog", () => {
    const item = makeItem("i5", "link", {}, { title: "A link", url: "https://example.com/a" });
    render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("shows tags, created date and source", () => {
    const item = makeItem(
      "i6",
      "text",
      { body: "hello" },
      { title: "Note", tags: ["a", "b"], source: "web", createdAt: "2026-01-02T00:00:00.000Z" },
    );
    render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  it("resolves category names from the categoryNames map, falling back to the id when unknown", () => {
    const item = makeItem(
      "i7",
      "text",
      { body: "hello" },
      { title: "Note", categoryIds: ["cat-1", "cat-2"] },
    );
    render(
      <ItemDetailModal
        item={item}
        onClose={() => {}}
        categoryNames={{ "cat-1": "Illustration" }}
      />,
    );

    expect(screen.getByText("Illustration")).toBeInTheDocument();
    expect(screen.getByText("cat-2")).toBeInTheDocument();
  });

  describe("per-kind content", () => {
    describe("note", () => {
      it("shows the note to visitors on every kind, keeping its text whole", () => {
        const text = makeItem(
          "n1",
          "text",
          { body: "hello" },
          { notes: "First line\nSecond line" },
        );
        const { unmount } = render(
          <ItemDetailModal item={text} onClose={() => {}} categoryNames={{}} />,
        );
        expect(screen.getByRole("note", { name: "Note" }).textContent).toBe(
          "First line\nSecond line",
        );
        unmount();

        const image = makeItem(
          "n2",
          "image",
          { r2Key: "media/x.png", width: 100, height: 50, mime: "image/png" },
          { notes: "Hero reference" },
        );
        render(<ItemDetailModal item={image} onClose={() => {}} categoryNames={{}} />);
        expect(screen.getByRole("note", { name: "Note" })).toHaveTextContent("Hero reference");
      });

      it("shows no note block when the item has no note", () => {
        const item = makeItem("n3", "text", { body: "hello" });
        render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
        expect(screen.queryByRole("note")).not.toBeInTheDocument();
      });
    });

    it("image: shows a contained <img>", () => {
      const item = makeItem(
        "img1",
        "image",
        { r2Key: "media/x.png", width: 100, height: 50, mime: "image/png" },
        { title: "A photo" },
      );
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
      const image = screen.getByRole("img", { name: "A photo" });
      expect(image).toBeInTheDocument();
    });

    it("image: shows the description below the image", () => {
      const item = makeItem("img2", "image", {
        r2Key: "media/x.png",
        width: 100,
        height: 50,
        mime: "image/png",
        description: "A pier at dusk",
      });
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
      expect(screen.getByText("A pier at dusk")).toBeInTheDocument();
    });

    it("link: shows title, description, domain and an Open link button with safe rel", () => {
      const item = makeItem(
        "lnk1",
        "link",
        { description: "A cool shot" },
        { title: "Cool Shot", url: "https://dribbble.com/shots/1" },
      );
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

      expect(screen.getByText("A cool shot")).toBeInTheDocument();
      expect(screen.getByText("dribbble.com")).toBeInTheDocument();
      const openLink = screen.getByRole("link", { name: /open link/i });
      expect(openLink).toHaveAttribute("href", "https://dribbble.com/shots/1");
      expect(openLink).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(openLink).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
      expect(openLink).toHaveAttribute("target", "_blank");
    });

    it("video: renders an embed iframe when embedUrl is present, with a restricted allow", () => {
      const item = makeItem(
        "vid1",
        "video",
        { provider: "youtube", embedUrl: "https://www.youtube.com/embed/abc" },
        { title: "A clip" },
      );
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
      const iframe = screen.getByTitle("A clip");
      expect(iframe.tagName).toBe("IFRAME");
      expect(iframe).toHaveAttribute("src", "https://www.youtube.com/embed/abc");
      expect(iframe).toHaveAttribute("allow");
      expect(iframe.getAttribute("allow")).not.toBe("");
    });

    it("video: falls back to a thumbnail + open-link when there is no embedUrl", () => {
      const item = makeItem(
        "vid2",
        "video",
        { provider: "file", thumbnail: "https://img/thumb.jpg" },
        { title: "A clip", url: "https://example.com/video.mp4" },
      );
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
      expect(screen.queryByRole("region", { name: /embed/i })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /open link/i })).toHaveAttribute(
        "href",
        "https://example.com/video.mp4",
      );
    });

    it("text: shows the full body", () => {
      const item = makeItem(
        "txt1",
        "text",
        { body: "The full body text of this note, in full." },
        { title: "Note" },
      );
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
      expect(screen.getByText("The full body text of this note, in full.")).toBeInTheDocument();
    });

    it("palette: shows each color's normalized percentage, proportional to its weight (T11b B5)", () => {
      const item = makeItem("pal2", "palette", {
        colors: [
          { hex: "#ff0000", weight: 75 },
          { hex: "#00ff00", weight: 25 },
        ],
      });
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

      expect(screen.getByText("75%")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
    });

    it("palette: falls back to an even percentage split when no color has a weight", () => {
      const item = makeItem("pal3", "palette", {
        colors: [{ hex: "#ff0000" }, { hex: "#00ff00" }],
      });
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

      expect(screen.getAllByText("50%")).toHaveLength(2);
    });

    it("palette: shows every swatch with its hex value, and copies to clipboard on click", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      const item = makeItem("pal1", "palette", {
        colors: [{ hex: "#ff0000", name: "Red" }, { hex: "#00ff00" }],
      });
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);

      expect(screen.getByText("#ff0000")).toBeInTheDocument();
      expect(screen.getByText("#00ff00")).toBeInTheDocument();

      fireEvent.click(screen.getByText("#ff0000"));
      expect(writeText).toHaveBeenCalledWith("#ff0000");
      expect(await screen.findByText(/copied/i)).toBeInTheDocument();
    });

    it("font: shows the family name and specimen text at more than one size", () => {
      const item = makeItem("font1", "font", { family: "Inter" });
      render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
      expect(screen.getAllByText("Inter").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Aa").length).toBeGreaterThan(1);
    });
  });
});

describe("ItemDetailModal owner actions (T11)", () => {
  it("shows no owner action buttons for a visitor (isOwner omitted)", () => {
    const item = makeItem("owner1", "text", { body: "hello" });
    render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "History" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move to trash" })).not.toBeInTheDocument();
  });

  it("shows Edit/History/Move to trash for the owner and wires Edit/History directly", () => {
    const item = makeItem("owner2", "text", { body: "hello" });
    const onEdit = vi.fn();
    const onOpenHistory = vi.fn();
    const onDelete = vi.fn();
    render(
      <ItemDetailModal
        item={item}
        onClose={() => {}}
        categoryNames={{}}
        isOwner
        onEdit={onEdit}
        onOpenHistory={onOpenHistory}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("Move to trash opens a confirm dialog instead of deleting immediately", () => {
    const item = makeItem("owner3", "text", { body: "hello" });
    const onDelete = vi.fn();
    render(
      <ItemDetailModal
        item={item}
        onClose={() => {}}
        categoryNames={{}}
        isOwner
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /move to trash/i })).toBeInTheDocument();
  });

  it("confirming the dialog calls onDelete and closes the dialog", () => {
    const item = makeItem("owner4", "text", { body: "hello" });
    const onDelete = vi.fn();
    render(
      <ItemDetailModal
        item={item}
        onClose={() => {}}
        categoryNames={{}}
        isOwner
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    const confirmDialog = screen.getByRole("dialog", { name: /move to trash/i });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Move to trash" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: /move to trash/i })).not.toBeInTheDocument();
  });

  it("cancelling the dialog leaves the item untouched", () => {
    const item = makeItem("owner5", "text", { body: "hello" });
    const onDelete = vi.fn();
    render(
      <ItemDetailModal
        item={item}
        onClose={() => {}}
        categoryNames={{}}
        isOwner
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /move to trash/i })).not.toBeInTheDocument();
  });

  it("Escape while the confirm dialog is open only cancels the confirm, not the whole detail view", () => {
    const item = makeItem("owner6", "text", { body: "hello" });
    const onClose = vi.fn();
    const onDelete = vi.fn();
    render(
      <ItemDetailModal
        item={item}
        onClose={onClose}
        categoryNames={{}}
        isOwner
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: /move to trash/i })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Item owner6" })).toBeInTheDocument();
  });
});

describe("ItemDetailModal reduced motion", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    // jsdom does not implement matchMedia at all (unlike a real browser),
    // so this assigns it rather than spying on an existing function — same
    // convention CanvasHost.tsx's own reduced-motion check already guards
    // against (`typeof window.matchMedia === "function"`).
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("marks the dialog as reduced-motion (no open/close animation)", () => {
    const item = makeItem("rm1", "text", { body: "hello" });
    render(<ItemDetailModal item={item} onClose={() => {}} categoryNames={{}} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-reduced-motion", "true");
  });
});
