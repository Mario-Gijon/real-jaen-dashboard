"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import css from "./AppShell.module.css";

/** The only two sections of the app; players open from matches and teams. */
export const SECTIONS = [
  { href: "/matches", label: "Partidos" },
  { href: "/teams", label: "Equipos" },
] as const;

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className={css.nav}>
      {SECTIONS.map((section) => {
        const current =
          pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={css.navLink}
            href={section.href}
            key={section.href}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
