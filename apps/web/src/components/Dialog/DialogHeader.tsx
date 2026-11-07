import { X } from "lucide-react";
import { IconButton } from "../IconButton/IconButton";

export interface DialogHeaderProps {
  titleId: string;
  title: string;
  onClose: () => void;
}

/**
 * Modals v2 header (Figma Proposals `33:1016`): the title, then Close as an ✕
 * icon button on the right.
 */
export function DialogHeader({ titleId, title, onClose }: DialogHeaderProps) {
  return (
    <div className="dialog-header">
      <h2 id={titleId} className="form-modal__title">
        {title}
      </h2>
      <IconButton icon={X} label="Close" tooltipAlign="end" onClick={onClose} />
    </div>
  );
}
