import { Upload } from "lucide-react";
import type { ChangeEvent } from "react";

export interface FilePickerProps {
  id: string;
  accept: string;
  buttonLabel: string;
  fileName: string | null;
  invalid?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A visually hidden file input wrapped in a second label, so clicking
 * anywhere on the picker opens the file dialog. The field's own visible
 * label is rendered by the caller.
 */
export function FilePicker({
  id,
  accept,
  buttonLabel,
  fileName,
  invalid,
  onChange,
}: FilePickerProps) {
  return (
    <label className="file-picker" htmlFor={id} data-invalid={invalid || undefined}>
      <input
        id={id}
        className="visually-hidden"
        type="file"
        accept={accept}
        aria-invalid={invalid || undefined}
        onChange={onChange}
      />
      <span className="button button--secondary button--sm" aria-hidden="true">
        <Upload size={16} />
        {buttonLabel}
      </span>
      <span className="file-picker__name">{fileName ?? "No file chosen"}</span>
    </label>
  );
}
