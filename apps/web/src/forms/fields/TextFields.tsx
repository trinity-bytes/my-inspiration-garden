import type { ItemFormState } from "../item-form-state";
import type { UpdateKindData } from "./types";

export interface TextFieldsProps {
  formId: string;
  text: ItemFormState["text"];
  updateKindData: UpdateKindData;
}

export function TextFields({ formId, text, updateKindData }: TextFieldsProps) {
  return (
    <label className="item-form__field" htmlFor={`${formId}-text-body`}>
      Body
      <textarea
        id={`${formId}-text-body`}
        value={text.body}
        onChange={(event) => updateKindData("text", { body: event.target.value })}
      />
    </label>
  );
}
