import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MainNav } from "./MainNav";
import { SourceBadge } from "./SourceBadge";
import css from "./AppShell.module.css";

/**
 * Analyst frame: Real Jaén identity, the two sections and the data-source
 * notice in one top bar (no sidebar for two entries), then the page content.
 * `actions`: an optional control at the right end of the bar (the update control of an operator).
 */
export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <a className={css.skip} href="#contenido">
        Saltar al contenido
      </a>
      <header className={css.bar}>
        <div className={css.inner}>
          <Link className={css.brand} href="/matches">
            <Image
              alt=""
              className={css.crest}
              height={44}
              priority
              src="/crests/real-jaen.webp"
              width={44}
            />
            <span className={css.brandText}>
              <strong>Real Jaén CF</strong>
              <span>Análisis</span>
            </span>
          </Link>
          <MainNav />
          <SourceBadge />
          {actions}
        </div>
      </header>
      <main className={css.main} id="contenido">
        {children}
      </main>
    </>
  );
}
