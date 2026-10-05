"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import css from "./SidePanel.module.css";

/**
 * Panel docked to the right (full width on phones) over a native modal
 * `<dialog>`: focus stays inside, Escape and the backdrop close it, and focus
 * returns to whatever opened it.
 */
export function SidePanel({
  title,
  description,
  header,
  footer,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Visual identity shown before the title (avatar, crest…). */
  header?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previous = document.activeElement;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={css.panel}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the dialog box itself (not its content) is the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialog}
    >
      <div className={css.inner}>
        <header className={css.header}>
          {header}
          <div className={css.titles}>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button aria-label="Cerrar" className={css.close} onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className={css.body}>{children}</div>
        {footer ? <footer className={css.footer}>{footer}</footer> : null}
      </div>
    </dialog>
  );
}
