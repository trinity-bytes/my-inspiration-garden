import { Select, type SelectOption } from "../../components/Select/Select";
import type { ItemFormState } from "../item-form-state";
import type { UpdateKindData } from "./types";

const FONT_PROVIDER_OPTIONS: SelectOption<NonNullable<ItemFormState["font"]["provider"]> | "">[] = [
  { value: "", label: "—" },
  { value: "google", label: "Google Fonts" },
  { value: "fontshare", label: "Fontshare" },
  { value: "foundry", label: "Foundry" },
  { value: "other", label: "Other" },
];

const FONT_LICENSE_OPTIONS: SelectOption<NonNullable<ItemFormState["font"]["license"]> | "">[] = [
  { value: "", label: "—" },
  { value: "free", label: "Free" },
  { value: "commercial", label: "Commercial" },
  { value: "unknown", label: "Unknown" },
];

export interface FontFieldsProps {
  formId: string;
  font: ItemFormState["font"];
  updateKindData: UpdateKindData;
}

export function FontFields({ formId, font, updateKindData }: FontFieldsProps) {
  return (
    <>
      <label className="item-form__field" htmlFor={`${formId}-font-family`}>
        Font family
        <input
          id={`${formId}-font-family`}
          type="text"
          value={font.family}
          onChange={(event) => updateKindData("font", { family: event.target.value })}
        />
      </label>
      <label className="item-form__field" htmlFor={`${formId}-font-source`}>
        Source URL
        <input
          id={`${formId}-font-source`}
          type="url"
          value={font.sourceUrl ?? ""}
          onChange={(event) => updateKindData("font", { sourceUrl: event.target.value })}
        />
      </label>
      <label className="item-form__field" htmlFor={`${formId}-font-provider`}>
        Provider
        <Select
          id={`${formId}-font-provider`}
          value={font.provider ?? ""}
          options={FONT_PROVIDER_OPTIONS}
          onChange={(provider) => updateKindData("font", { provider: provider || undefined })}
        />
      </label>
      <label className="item-form__field" htmlFor={`${formId}-font-license`}>
        License
        <Select
          id={`${formId}-font-license`}
          value={font.license ?? ""}
          options={FONT_LICENSE_OPTIONS}
          onChange={(license) => updateKindData("font", { license: license || undefined })}
        />
      </label>
      <label className="item-form__field" htmlFor={`${formId}-font-preview-text`}>
        Preview text
        <input
          id={`${formId}-font-preview-text`}
          type="text"
          value={font.previewText ?? ""}
          onChange={(event) => updateKindData("font", { previewText: event.target.value })}
        />
      </label>
    </>
  );
}
