import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MainNav } from "@/ui/MainNav";

const pathname = vi.hoisted(() => ({ value: "/matches" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("MainNav", () => {
  it("offers only Partidos and Equipos", () => {
    render(<MainNav />);
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Partidos", "Equipos"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/matches", "/teams"]);
    expect(within(nav).queryByText(/Jugadores|Inicio|Administración|Informes/)).toBeNull();
  });

  it("marks the current section, including its detail pages", () => {
    pathname.value = "/teams/real-jaen";
    render(<MainNav />);
    expect(screen.getByRole("link", { name: "Equipos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Partidos" })).not.toHaveAttribute("aria-current");
  });
});
