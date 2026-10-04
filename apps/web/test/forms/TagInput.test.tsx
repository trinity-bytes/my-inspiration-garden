import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "../../src/forms/TagInput";

function makeGetTags(tags: { id: string; name: string; count: number }[]) {
  return vi.fn().mockResolvedValue({ tags });
}

describe("TagInput", () => {
  it("renders existing tags as removable chips", () => {
    render(
      <TagInput id="tags" tags={["ui", "nature"]} onChange={vi.fn()} getTags={makeGetTags([])} />,
    );

    expect(screen.getByText("ui")).toBeInTheDocument();
    expect(screen.getByText("nature")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove tag ui" })).toBeInTheDocument();
  });

  it("removes a chip when its remove button is clicked", () => {
    const onChange = vi.fn();
    render(
      <TagInput id="tags" tags={["ui", "nature"]} onChange={onChange} getTags={makeGetTags([])} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove tag ui" }));
    expect(onChange).toHaveBeenCalledWith(["nature"]);
  });

  it("removes the last chip on Backspace when the input is empty", () => {
    const onChange = vi.fn();
    render(
      <TagInput id="tags" tags={["ui", "nature"]} onChange={onChange} getTags={makeGetTags([])} />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith(["ui"]);
  });

  it("does not remove a chip on Backspace when the input has text", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" tags={["ui"]} onChange={onChange} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "nat" } });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds the typed text as a new tag on Enter", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" tags={["ui"]} onChange={onChange} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "nature" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["ui", "nature"]);
  });

  it("adds the typed text as a new tag on comma", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" tags={[]} onChange={onChange} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "nature" } });
    fireEvent.keyDown(input, { key: "," });
    expect(onChange).toHaveBeenCalledWith(["nature"]);
  });

  it("adds the typed text as a new tag on Tab", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" tags={[]} onChange={onChange} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "nature" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onChange).toHaveBeenCalledWith(["nature"]);
  });

  it("commits the top suggestion on Tab when none is highlighted", async () => {
    const onChange = vi.fn();
    const getTags = makeGetTags([
      { id: "1", name: "nature", count: 5 },
      { id: "2", name: "naval", count: 12 },
    ]);
    render(<TagInput id="tags" tags={[]} onChange={onChange} getTags={getTags} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "na" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Tab" });

    expect(onChange).toHaveBeenCalledWith(["naval"]);
  });

  it("commits the highlighted suggestion on Tab", async () => {
    const onChange = vi.fn();
    const getTags = makeGetTags([
      { id: "1", name: "nature", count: 5 },
      { id: "2", name: "naval", count: 12 },
    ]);
    render(<TagInput id="tags" tags={[]} onChange={onChange} getTags={getTags} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "na" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Tab" });

    expect(onChange).toHaveBeenCalledWith(["nature"]);
  });

  it("keeps focus in the field when Tab commits a tag, so more tags can follow", () => {
    render(<TagInput id="tags" tags={[]} onChange={vi.fn()} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "nature" } });
    const notCancelled = fireEvent.keyDown(input, { key: "Tab" });

    expect(notCancelled).toBe(false);
  });

  it("lets Tab move focus normally when the field is empty", () => {
    render(<TagInput id="tags" tags={[]} onChange={vi.fn()} getTags={makeGetTags([])} />);

    const notCancelled = fireEvent.keyDown(screen.getByRole("combobox"), { key: "Tab" });

    expect(notCancelled).toBe(true);
  });

  it("ignores blank input on Enter", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" tags={["ui"]} onChange={onChange} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not add a duplicate tag (case-insensitive)", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" tags={["ui"]} onChange={onChange} getTags={makeGetTags([])} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "UI" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows matching suggestions while typing, excluding already-selected tags, sorted by count", async () => {
    const getTags = makeGetTags([
      { id: "1", name: "nature", count: 5 },
      { id: "2", name: "naval", count: 12 },
      { id: "3", name: "ui", count: 3 },
    ]);
    render(<TagInput id="tags" tags={["ui"]} onChange={vi.fn()} getTags={getTags} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "na" } });

    const listbox = await screen.findByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("naval");
    expect(options[1]).toHaveTextContent("nature");
  });

  it("ranks suggestions by closeness first (exact, prefix, word prefix, substring), then by count", async () => {
    const getTags = makeGetTags([
      { id: "1", name: "build-ui", count: 40 },
      { id: "2", name: "fluid", count: 30 },
      { id: "3", name: "ui-kits", count: 5 },
      { id: "4", name: "ui", count: 2 },
      { id: "5", name: "ui-patterns", count: 9 },
    ]);
    render(<TagInput id="tags" tags={[]} onChange={vi.fn()} getTags={getTags} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ui" } });

    const listbox = await screen.findByRole("listbox");
    const names = within(listbox)
      .getAllByRole("option")
      .map((option) => option.firstChild?.textContent);
    expect(names).toEqual(["ui", "ui-patterns", "ui-kits", "build-ui", "fluid"]);
  });

  it("filters suggestions case/accent-insensitively", async () => {
    const getTags = makeGetTags([{ id: "1", name: "café", count: 1 }]);
    render(<TagInput id="tags" tags={[]} onChange={vi.fn()} getTags={getTags} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "CAFE" } });

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option")).toHaveTextContent("café");
  });

  it("navigates suggestions with ArrowDown/ArrowUp and commits the highlighted one on Enter", async () => {
    const onChange = vi.fn();
    const getTags = makeGetTags([
      { id: "1", name: "nature", count: 5 },
      { id: "2", name: "naval", count: 12 },
    ]);
    render(<TagInput id="tags" tags={[]} onChange={onChange} getTags={getTags} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "na" } });
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["naval"]);
  });

  it("sets aria-activedescendant to the highlighted option", async () => {
    const getTags = makeGetTags([{ id: "1", name: "nature", count: 5 }]);
    render(<TagInput id="tags" tags={[]} onChange={vi.fn()} getTags={getTags} />);

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "na" } });
    const listbox = await screen.findByRole("listbox");
    const option = within(listbox).getByRole("option");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    expect(option).toHaveAttribute("aria-selected", "true");
  });

  it("still allows free entry when fetching tags fails", async () => {
    const onChange = vi.fn();
    const getTags = vi.fn().mockRejectedValue(new Error("network error"));
    render(<TagInput id="tags" tags={[]} onChange={onChange} getTags={getTags} />);

    await waitFor(() => expect(getTags).toHaveBeenCalled());
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "nature" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["nature"]);
  });
});
