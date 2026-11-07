import { Plus, X } from "lucide-react";
import { Button } from "../../components/Button/Button";
import { IconButton } from "../../components/IconButton/IconButton";
import type { ItemFormState } from "../item-form-state";
import type { UpdateKindData } from "./types";

type PaletteColor = ItemFormState["palette"]["colors"][number];

export interface PaletteFieldsProps {
  formId: string;
  colors: ItemFormState["palette"]["colors"];
  updateKindData: UpdateKindData;
}

export function PaletteFields({ formId, colors, updateKindData }: PaletteFieldsProps) {
  function addColor(): void {
    updateKindData("palette", { colors: [...colors, { hex: "#000000" }] });
  }

  function removeColor(index: number): void {
    updateKindData("palette", { colors: colors.filter((_, i) => i !== index) });
  }

  function updateColor(index: number, patch: Partial<PaletteColor>): void {
    updateKindData("palette", {
      colors: colors.map((color, i) => (i === index ? { ...color, ...patch } : color)),
    });
  }

  return (
    <fieldset className="item-form__field item-form__palette">
      <legend>Colors</legend>
      {colors.map((color, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: palette colors have no stable id; this row's own fields are already keyed by the same position.
        <div className="item-form__palette-row" key={index}>
          <label htmlFor={`${formId}-palette-hex-${index}`}>
            {`Color ${index + 1} hex`}
            <input
              id={`${formId}-palette-hex-${index}`}
              type="text"
              value={color.hex}
              onChange={(event) => updateColor(index, { hex: event.target.value })}
            />
          </label>
          <label htmlFor={`${formId}-palette-name-${index}`}>
            {`Color ${index + 1} name`}
            <input
              id={`${formId}-palette-name-${index}`}
              type="text"
              value={color.name ?? ""}
              onChange={(event) => updateColor(index, { name: event.target.value })}
            />
          </label>
          <label htmlFor={`${formId}-palette-weight-${index}`}>
            {`Color ${index + 1} weight (%)`}
            <input
              id={`${formId}-palette-weight-${index}`}
              type="number"
              min="0"
              step="any"
              value={color.weight ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                updateColor(index, { weight: raw.trim().length > 0 ? Number(raw) : undefined });
              }}
            />
          </label>
          <IconButton
            icon={X}
            label="Remove color"
            tooltipAlign="end"
            onClick={() => removeColor(index)}
          />
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={addColor}>
        Add color
      </Button>
      {colors.length > 0 && (
        <p className="item-form__hint item-form__palette-total">
          {`Total: ${colors.reduce((sum, c) => sum + (c.weight ?? 0), 0)}%`}
          {" — weights not summing to 100 are normalized proportionally."}
        </p>
      )}
    </fieldset>
  );
}
