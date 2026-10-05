import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  altoSeason,
  competitions,
  playerProfile,
  rjSeason,
  SEASON_ID,
  squad,
  standings,
} from "./fixtures.test-data";
import { TeamsView } from "./TeamsView";

/** Answers the typed client's GETs from the fixtures, like `/api/v1` would. */
function serveApi() {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    const path = url.pathname.replace("/api/v1", "");
    const body =
      path === "/competitions"
        ? competitions
        : path === `/seasons/${SEASON_ID}/teams`
          ? standings
          : path === `/seasons/${SEASON_ID}/teams/team-real-jaen`
            ? rjSeason
            : path.startsWith(`/seasons/${SEASON_ID}/teams/`)
              ? altoSeason
              : path.startsWith("/players/")
                ? playerProfile(squad.find((row) => path.endsWith(row.player.id))!)
                : null;
    return body
      ? new Response(JSON.stringify(body))
      : new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "No" } }), {
          status: 404,
        });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const requested = (fetch: ReturnType<typeof serveApi>) =>
  fetch.mock.calls.map((call) => String((call as unknown[])[0]));

let fetch: ReturnType<typeof serveApi>;
beforeEach(() => {
  fetch = serveApi();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
});
afterEach(() => vi.unstubAllGlobals());

async function openTeams() {
  render(<TeamsView />);
  await screen.findByRole("heading", { level: 2, name: "Real Jaén CF" });
  await screen.findByText("Resumen");
}

const grid = () => screen.getByRole("group", { name: "Equipo" });
const resultsTable = () =>
  within(screen.getByRole("region", { name: "Partidos disputados" })).getByRole("table");

describe("Equipos", () => {
  it("offers only competition and season, and selects Real Jaén by default", async () => {
    await openTeams();
    expect(screen.getAllByRole("combobox").map((s) => s.closest("label")?.textContent)).toEqual([
      expect.stringContaining("Competición"),
      expect.stringContaining("Temporada"),
    ]);
    expect(within(grid()).getByRole("radio", { name: "Real Jaén" })).toBeChecked();
    expect(requested(fetch)).toContain(`/api/v1/seasons/${SEASON_ID}/teams/team-real-jaen`);
  });

  it("lists Real Jaén first and the rest alphabetically", async () => {
    await openTeams();
    expect(
      within(grid())
        .getAllByRole("radio")
        .map((r) => r.getAttribute("value")),
    ).toEqual(["team-real-jaen", "team-bravo", "team-alto", "team-vega"]);
  });

  it("changes team on click", async () => {
    const user = userEvent.setup();
    await openTeams();
    await user.click(within(grid()).getByText("Montealto"));
    expect(await screen.findByRole("heading", { level: 2, name: "CD Montealto" })).toBeVisible();
    expect(within(grid()).getByRole("radio", { name: "Montealto" })).toBeChecked();
  });

  it("moves through the grid with the arrow keys", async () => {
    const user = userEvent.setup();
    await openTeams();
    within(grid()).getByRole("radio", { name: "Real Jaén" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(within(grid()).getByRole("radio", { name: "Bravo" })).toBeChecked();
    expect(within(grid()).getByRole("radio", { name: "Bravo" })).toHaveFocus();
    expect(await screen.findByRole("heading", { level: 2, name: "Atlético Bravo" })).toBeVisible();
  });

  it("draws a neutral shield for clubs without crest, never another crest", async () => {
    await openTeams();
    const rj = within(grid()).getByRole("radio", { name: "Real Jaén" }).closest("label")!;
    const alto = within(grid()).getByRole("radio", { name: "Montealto" }).closest("label")!;
    expect(rj.querySelector('[data-crest="image"] img')).toHaveAttribute(
      "src",
      "/real-jaen-crest.png",
    );
    expect(alto.querySelector('[data-crest="fallback"]')).toHaveTextContent("MON");
    expect(alto.querySelector("img")).toBeNull();
  });

  it("switches between the two tabs, also with the keyboard", async () => {
    const user = userEvent.setup();
    await openTeams();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Rendimiento del equipo", "Jugadores"]);
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Jugadores");
    expect(screen.getByRole("table", { name: "Jugadores de la plantilla" })).toBeVisible();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Rendimiento del equipo" })).toHaveFocus();
    expect(screen.getByText("Evolución de resultados")).toBeVisible();
  });
});

describe("Rendimiento del equipo", () => {
  it("summarises played, wins, draws, losses and goals", async () => {
    await openTeams();
    const summary = screen.getByRole("region", { name: /Resumen/ });
    const value = (abbr: string) =>
      within(summary).getByTitle(abbr).closest("div")!.querySelector("dd");
    expect(value("Partidos jugados")).toHaveTextContent("3");
    expect(value("Victorias")).toHaveTextContent("1");
    expect(value("Empates")).toHaveTextContent("1");
    expect(value("Derrotas")).toHaveTextContent("1");
    expect(value("Goles a favor")).toHaveTextContent("4");
    expect(value("Goles en contra")).toHaveTextContent("4");
    expect(summary).toHaveTextContent("2.º en la clasificación");
  });

  it("shows one result per finished match, with round, rival, venue and score", async () => {
    const user = userEvent.setup();
    await openTeams();
    const results = screen.getByRole("list", { name: "Resultados por jornada" });
    const chips = within(results).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual(["VJ1", "EJ2", "DJ3"]);
    expect(chips[2]).toHaveAccessibleName("Jornada 3: Derrota 1-2 en casa contra Atlético Bravo");
    await user.click(chips[1]);
    expect(chips[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("UD Vegaclara", { selector: "strong" })).toBeVisible();
  });

  it("leaves postponed and scheduled matches out of the history (status decides, not dates)", async () => {
    await openTeams();
    const rows = within(resultsTable()).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.getAttribute("data-match-id"))).toEqual(["m-3", "m-2", "m-1"]);
    expect(within(resultsTable()).queryByText(/aplazado|programado/i)).toBeNull();
    expect(rows[0]).toHaveTextContent("D 1-2");
    expect(rows[2]).toHaveTextContent("Local");
    expect(rows[1]).toHaveTextContent("Visitante");
  });

  it("shows «—» for missing stats and flags a partial total", async () => {
    await openTeams();
    const stats = screen.getByRole("region", { name: "Estadísticas de la temporada" });
    const value = (label: string) =>
      within(stats).getByText(label).closest("div")!.querySelector("dd")!;
    expect(value("Faltas")).toHaveTextContent("—");
    expect(value("Rojas")).toHaveTextContent("0");
    expect(value("xG")).toHaveTextContent("3,10*");
    expect(within(value("xG")).getByTitle("Dato de 2 de 3 partidos")).toBeInTheDocument();
    expect(stats).toHaveTextContent("Total de los partidos con dato, no de toda la temporada.");
  });
});

describe("Jugadores", () => {
  async function openPlayers() {
    const user = userEvent.setup();
    await openTeams();
    await user.click(screen.getByRole("tab", { name: "Jugadores" }));
    return user;
  }
  const names = () =>
    within(screen.getByRole("table", { name: "Jugadores de la plantilla" }))
      .getAllByRole("button", { name: /Ver ficha de/ })
      .map((b) => b.getAttribute("aria-label")!.replace("Ver ficha de ", ""));
  const row = (name: string) =>
    screen.getByRole("button", { name: `Ver ficha de ${name}` }).closest("tr")!;

  it("lists every squad player by line and shirt number, including those without minutes", async () => {
    await openPlayers();
    expect(names()).toEqual([
      "Ángel Portero",
      "Tomás Reserva",
      "Lucas Defensa",
      "Mario Medio",
      "Iker Cantera",
      "Diego Goleador",
    ]);
    expect(row("Tomás Reserva")).toHaveTextContent(/^13Tomás ReservaPorteroPOR00000$/);
  });

  it("shows a real 0 as 0 and a missing total as «—»", async () => {
    await openPlayers();
    const cells = row("Iker Cantera").querySelectorAll("td");
    expect(cells[4]).toHaveTextContent("0"); // goals
    expect(cells[5]).toHaveTextContent("—"); // assists, not available
  });

  it("sorts by a column and filters by position", async () => {
    const user = await openPlayers();
    const goals = screen.getByRole("columnheader", { name: /^Goles/ });
    await user.click(within(goals).getByRole("button"));
    expect(names()[0]).toBe("Diego Goleador");
    expect(goals).toHaveAttribute("aria-sort", "descending");
    await user.click(within(goals).getByRole("button"));
    expect(goals).toHaveAttribute("aria-sort", "ascending");
    expect(names().at(-1)).toBe("Diego Goleador");

    await user.click(screen.getByRole("button", { name: /Porteros/ }));
    expect(names()).toEqual(["Ángel Portero", "Tomás Reserva"]);
    expect(screen.getByRole("button", { name: /Porteros/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: /Todos/ }));
    expect(names()).toHaveLength(6);
  });

  it("opens the side panel with personal data and the season, and closes it", async () => {
    const user = await openPlayers();
    await user.click(screen.getByRole("button", { name: "Ver ficha de Mario Medio" }));
    const panel = await screen.findByRole("dialog", { name: "Mario Medio" });
    expect(panel).toHaveTextContent("Centrocampista · Real Jaén CF");
    expect(await within(panel).findByText("1,81 m")).toBeVisible();
    expect(within(panel).getByText("Izquierda")).toBeVisible();
    expect(within(panel).getByText(/^10\/05\/2000 \(\d+ años\)$/)).toBeVisible();
    expect(within(panel).getByRole("link", { name: /Ver ficha completa/ })).toHaveAttribute(
      "href",
      `/players/p-mid?season=${SEASON_ID}`,
    );
    await user.click(within(panel).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows «—» for personal data the source does not have", async () => {
    const user = await openPlayers();
    await user.click(screen.getByRole("button", { name: "Ver ficha de Lucas Defensa" }));
    const panel = await screen.findByRole("dialog", { name: "Lucas Defensa" });
    await waitFor(() => expect(within(panel).queryByText("…")).toBeNull());
    for (const label of ["Nacimiento", "Estatura", "Pierna dominante"]) {
      expect(within(panel).getByText(label).closest("div")!.querySelector("dd")).toHaveTextContent(
        "—",
      );
    }
    expect(
      within(panel).getByText("Asistencias").closest("div")!.querySelector("dd"),
    ).toHaveTextContent("1");
  });
});
