import { fireEvent, render, screen } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Select, type SelectOption } from "../../src/components/Select/Select";

type Fruit = "apple" | "banana" | "cherry";

const OPTIONS: SelectOption<Fruit>[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

function renderSelect(onChange = vi.fn(), value: Fruit = "banana") {
  render(
    <>
      <label htmlFor="fruit">Fruit</label>
      <Select id="fruit" value={value} options={OPTIONS} onChange={onChange} />
    </>,
  );
  return { onChange, trigger: screen.getByRole("combobox", { name: "Fruit" }) };
}

describe("Select", () => {
  it("is a labelled combobox showing the selected label, with the list closed", () => {
    const { trigger } = renderSelect();

    expect(trigger).toHaveTextContent("Banana");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens on click, marks the selected option, and commits a clicked option", () => {
    const { onChange, trigger } = renderSelect();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Banana" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("option", { name: "Cherry" }));
    expect(onChange).toHaveBeenCalledWith("cherry");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not call onChange when the already-selected option is chosen", () => {
    const { onChange, trigger } = renderSelect();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "Banana" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves the active option with the arrow keys and commits it with Enter", () => {
    const { onChange, trigger } = renderSelect();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const active = () => trigger.getAttribute("aria-activedescendant");
    expect(document.getElementById(active() ?? "")).toHaveTextContent("Banana");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.getElementById(active() ?? "")).toHaveTextContent("Cherry");
    fireEvent.keyDown(trigger, { key: "Home" });
    expect(document.getElementById(active() ?? "")).toHaveTextContent("Apple");

    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("apple");
  });

  it("jumps to an option by its first letter", () => {
    const { onChange, trigger } = renderSelect();

    fireEvent.keyDown(trigger, { key: "c" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("cherry");
  });

  it("closes on Escape without letting the key reach an enclosing dialog", () => {
    const onDocumentEscape = vi.fn();
    document.addEventListener("keydown", onDocumentEscape);
    const { onChange, trigger } = renderSelect();

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(onDocumentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDocumentEscape);
  });

  it("closes when the pointer goes down outside it", () => {
    const { trigger } = renderSelect();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders an icon-only trigger named by aria-label", () => {
    render(
      <Select
        variant="icon"
        icon={Pencil}
        aria-label="Move Root"
        value="apple"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Move Root" });
    expect(trigger).toHaveClass("icon-button");
    expect(trigger).not.toHaveTextContent("Apple");
  });
});
