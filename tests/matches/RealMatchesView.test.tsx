import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError, getCompetitions, getSeasonMatches, getSeasonTeams, getSource, getTeamObservedMatches,
} from "@/client/api";
import type { ObservedMatch, ObservedTeamMatches } from "@/contract";
import { MatchesView } from "@/features/matches/MatchesView";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getSource: vi.fn(), getTeamObservedMatches: vi.fn(),
  getCompetitions: vi.fn(), getSeasonMatches: vi.fn(), getSeasonTeams: vi.fn(),
}));

const jaen = { id: "team-real-jaen", name: "Real Jaén" };
const match = (id: string, fields: Partial<ObservedMatch>): ObservedMatch => ({
  id, kickoff: "2026-08-30T17:15:00Z", status: "finished", competition: "Primera Federacion, Group 2",
  season: "26/27", round: 1, home: { id: "sofascore-team-1", name: "CE Europa" }, away: jaen,
  score: { home: 0, away: 3 }, ...fields,
});
const SCOPE = "Partidos del equipo que registra la fuente. No es necesariamente un calendario completo.";
const GROUP_2 = { name: "Primera Federación, Grupo 2", season: "26/27" };
/** By default a source serving two competitions (the selector's case); this version's serves only Group 2. */
const real = (matches: ObservedMatch[], competitions = [GROUP_2, { name: "Copa del Rey", season: "26/27" }]): ObservedTeamMatches => ({
  teamId: "team-real-jaen", scope: SCOPE, source: { synthetic: false, label: "Datos reales" }, competitions,
  matches: matches.map((m) => ({ match: m, side: m.home.id === jaen.id ? "home" : "away" })),
});
const finished = match("m1", {});
const goalless = match("m2", { kickoff: "2026-10-03T11:00:00Z", round: 6, score: { home: 0, away: 0 } });
const cup = match("m3", { kickoff: "2026-10-28T19:00:00Z", status: "scheduled", competition: "Copa del Rey", round: 1,
  home: { id: "sofascore-team-3", name: "CD Rival Copa" }, score: null });
const undated = match("m4", { kickoff: null, status: "scheduled", round: 20, home: jaen, away: { id: "sofascore-team-4", name: null }, score: null });
const strange = match("m5", { kickoff: "2026-11-01T10:00:00Z", status: null, score: null, season: "27/28" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["matches"] });
  vi.mocked(getTeamObservedMatches).mockResolvedValue(real([finished, goalless, cup, strange, undated]));
});

const rows = () => within(screen.getByRole("list", { name: "Partidos reales" })).getAllByRole("listitem");

describe("Partidos with the real source", () => {
  it("lists the club's real matches with provenance and coverage, linked only to their real detail, never touching synthetic data", async () => {
    render(<MatchesView />);
    expect(await screen.findByRole("list", { name: "Partidos reales" })).toBeVisible();
    expect(getTeamObservedMatches).toHaveBeenCalledWith("team-real-jaen", expect.anything());
    expect(screen.getByText("Datos reales")).toBeVisible();
    expect(screen.getByText(SCOPE)).toBeVisible();
    expect(rows()).toHaveLength(5);
    expect(within(rows()[0]).getByText("Primera Federacion, Group 2")).toBeVisible();
    expect(within(rows()[0]).getByText("26/27 · J1")).toBeVisible();
    expect(rows()[0]).toHaveTextContent("0 – 3Finalizado");
    expect(rows()[1]).toHaveTextContent("0 – 0Finalizado");
    // A pending match shows its time, never 0–0.
    expect(rows()[2]).toHaveTextContent(/\d\d:\d\dProgramado/);
    expect(rows()[2]).not.toHaveTextContent("0 – 0");
    expect(rows()[3]).toHaveTextContent("Estado desconocido");
    expect(rows()[4]).toHaveTextContent("Fecha por definir");
    expect(rows()[4]).toHaveTextContent("Por definirProgramado");
    expect(rows()[4]).toHaveTextContent("Equipo sin identificar");
    const links = within(screen.getByRole("list", { name: "Partidos reales" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["m1", "m2", "m3", "m5", "m4"].map((id) => `/matches/${id}?view=observed`));
    for (const synthetic of [getCompetitions, getSeasonMatches, getSeasonTeams]) expect(synthetic).not.toHaveBeenCalled();
  });

  it("names the only competition the source serves instead of offering a choice, keeping the real seasons", async () => {
    vi.mocked(getTeamObservedMatches).mockResolvedValue(real([finished, goalless, strange], [GROUP_2]));
    const user = userEvent.setup();
    render(<MatchesView />);
    await screen.findByRole("list", { name: "Partidos reales" });
    expect(screen.queryByRole("combobox", { name: "Competición" })).toBeNull();
    expect(screen.getByText("Competición").parentElement).toHaveTextContent("CompeticiónPrimera Federación, Grupo 2");
    const season = screen.getByRole("combobox", { name: "Temporada" });
    expect([...season.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Todas", "27/28", "26/27"]);
    await user.selectOptions(season, "26/27");
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText(/Copa del Rey/)).toBeNull();
  });

  it("filters by the source's seasons, competitions and status", async () => {
    const user = userEvent.setup();
    render(<MatchesView />);
    await screen.findByRole("list", { name: "Partidos reales" });
    const season = screen.getByRole("combobox", { name: "Temporada" });
    expect([...season.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Todas", "27/28", "26/27"]);
    await user.selectOptions(season, "26/27");
    expect(rows()).toHaveLength(4);
    await user.selectOptions(screen.getByRole("combobox", { name: "Competición" }), "Copa del Rey");
    expect(rows()).toHaveLength(1);
    await user.selectOptions(screen.getByRole("combobox", { name: "Competición" }), "all");
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "finished");
    expect(rows()).toHaveLength(2);
    await user.selectOptions(screen.getByRole("combobox", { name: "Estado" }), "pending");
    expect(rows()).toHaveLength(2);
    await user.selectOptions(season, "27/28");
    expect(screen.getByText("No hay partidos con estos filtros.")).toBeVisible();
  });

  it("says when the source has no matches", async () => {
    vi.mocked(getTeamObservedMatches).mockResolvedValue(real([]));
    render(<MatchesView />);
    expect(await screen.findByText("La fuente no tiene partidos de este equipo.")).toBeVisible();
  });

  it("shows the failure of the real source with retry, never synthetic matches", async () => {
    vi.mocked(getTeamObservedMatches).mockRejectedValueOnce(
      new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "La fuente de datos real no está disponible."),
    );
    render(<MatchesView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los partidos reales.");
    expect(getSeasonMatches).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("list", { name: "Partidos reales" })).toBeVisible();
  });

  it("says a team from the URL has no correspondence, without swapping it for Real Jaén", async () => {
    vi.mocked(getTeamObservedMatches).mockRejectedValue(new ApiRequestError(404, "NOT_FOUND", "Sin correspondencia"));
    render(<MatchesView initialTeamId="team-montealto" />);
    expect(await screen.findByText("Este equipo no tiene correspondencia con la fuente real de partidos.")).toBeVisible();
    expect(getTeamObservedMatches).toHaveBeenCalledWith("team-montealto", expect.anything());
    expect(screen.getByRole("link", { name: "Ver los partidos reales del Real Jaén" })).toHaveAttribute("href", "/matches");
    expect(screen.queryByRole("list", { name: "Partidos reales" })).toBeNull();
  });

  it("says a synthetic season from the URL does not apply, without asking for or filtering real matches", async () => {
    render(<MatchesView initialSeasonId="season-demo-2026-27" initialTeamId="team-real-jaen" />);
    expect(await screen.findByText(/La temporada seleccionada no corresponde a la fuente real de partidos/)).toBeVisible();
    expect(getTeamObservedMatches).not.toHaveBeenCalled();
  });

  it("assumes nothing when the source of the section cannot be known", async () => {
    vi.mocked(getSource).mockRejectedValue(new Error("down"));
    render(<MatchesView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo determinar la fuente de los partidos.");
    expect(getTeamObservedMatches).not.toHaveBeenCalled();
    expect(getCompetitions).not.toHaveBeenCalled();
  });
});
