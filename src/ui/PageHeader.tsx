import type { ReactNode } from "react";
import css from "./PageHeader.module.css";

/** Page title, one-line description and an optional action area. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={css.header}>
      <div className={css.copy}>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className={css.actions}>{actions}</div> : null}
    </header>
  );
}
