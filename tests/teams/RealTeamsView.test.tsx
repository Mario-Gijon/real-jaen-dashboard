import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError, getCompetitions, getObservedPlayers, getSeasonTeams, getSource, getTeamObservedPerformance, getTeamSeason,
} from "@/client/api";
import type { ObservedCompetitionPerformance, ObservedMatch, ObservedTeamPerformance, RealSection } from "@/contract";
import { TeamsView } from "@/features/teams/TeamsView";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getSource: vi.fn(), getTeamObservedPerformance: vi.fn(), getObservedPlayers: vi.fn(),
  getCompetitions: vi.fn(), getSeasonTeams: vi.fn(), getTeamSeason: vi.fn(),
}));

const jaen = { id: "team-real-jaen", name: "Real Jaén" };
const match = (id: string, round: number, home: { id: string; name: string | null }, away: { id: string; name: string | null },
  score: [number, number]): ObservedMatch => ({
  id, kickoff: `2026-09-0${round}T17:00:00Z`, status: "finished", competition: "Primera Federacion, Group 2", season: "26/27",
  round, home, away, score: { home: score[0], away: score[1] },
});
const europa = { id: "sofascore-team-135672", name: "CE Europa" };
const huesca = { id: "sofascore-team-24265", name: "Huesca" };
const GROUP_2 = "sofascore-scope-94191-97382";
const competition = (fields: Partial<ObservedCompetitionPerformance> = {}): ObservedCompetitionPerformance => ({
  id: GROUP_2, name: "Primera Federación, Grupo 2", season: "26/27",
  matches: { inScope: 37, finished: 3, pending: 29, counted: 3, finishedWithoutValidScore: 0, unknownStatus: 0 },
  record: { played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 6, goalsAgainst: 2, goalDifference: 4 },
  venues: { home: { win: 1, draw: 1, loss: 0 }, away: { win: 1, draw: 0, loss: 0 } },
  results: [
    { match: match("sofascore-match-1", 1, europa, jaen, [0, 3]), side: "away", result: "win", goalsFor: 3, goalsAgainst: 0 },
    { match: match("sofascore-match-2", 2, jaen, huesca, [2, 2]), side: "home", result: "draw", goalsFor: 2, goalsAgainst: 2 },
    { match: match("sofascore-match-3", 3, jaen, europa, [1, 0]), side: "home", result: "win", goalsFor: 1, goalsAgainst: 0 },
  ],
  ...fields,
});
const SCOPE = "Resultados de los partidos finalizados observados en esta competición. No es necesariamente la temporada completa: sin clasificación ni puntos.";
const performance = (competitions = [competition()]): ObservedTeamPerformance => ({
  teamId: "team-real-jaen", competitions, teams: [jaen], scope: SCOPE, source: { synthetic: false, label: "Datos reales" },
});
const sections = (realSections: RealSection[]) =>
  vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections });

beforeEach(() => {
  vi.resetAllMocks();
  sections(["teams"]);
  vi.mocked(getTeamObservedPerformance).mockResolvedValue(performance());
});

const loaded = () => screen.findByRole("heading", { level: 2, name: "Real Jaén" });
const item = (short: string) => within(screen.getByLabelText("Balance")).getByTitle(new RegExp(`^${{
  PJ: "Partidos jugados", V: "Victorias", E: "Empates", D: "Derrotas", GF: "Goles a favor", GC: "Goles en contra", DG: "Diferencia de goles",
}[short]}$`)).closest("div")!;

describe("Equipos con la fuente real (TEAMS_SOURCE=local)", () => {
  it("shows the real club with the scope's competition and season, and loads nothing synthetic", async () => {
    render(<TeamsView />);
    await loaded();
    expect(getTeamObservedPerformance).toHaveBeenCalledWith("team-real-jaen", expect.anything());
    expect(screen.queryByRole("combobox", { name: "Competición" })).toBeNull();
    expect(screen.getByText("Competición").parentElement).toHaveTextContent("CompeticiónPrimera Federación, Grupo 2");
    const season = screen.getByRole("combobox", { name: "Temporada" });
    expect([...season.querySelectorAll("option")].map((o) => [o.value, o.textContent])).toEqual([[GROUP_2, "26/27"]]);
    expect(screen.getByText("Primera Federación, Grupo 2 · 26/27")).toBeVisible();
    // The grid keeps its design with the only team with correspondence.
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    for (const synthetic of [getCompetitions, getSeasonTeams, getTeamSeason]) expect(synthetic).not.toHaveBeenCalled();
  });

  it("shows the balance with goal difference, home and away, and the result sequence, without standings nor advanced metrics", async () => {
    render(<TeamsView />);
    await loaded();
    for (const [short, value] of [["PJ", "3"], ["V", "2"], ["E", "1"], ["D", "0"], ["GF", "6"], ["GC", "2"], ["DG", "+4"]]) {
      expect(item(short), short).toHaveTextContent(`${short}${value}`);
    }
    expect(within(screen.getByLabelText("Casa y fuera")).getByText("Casa").parentElement).toHaveTextContent("Casa1V1E0D");
    expect(within(screen.getByLabelText("Casa y fuera")).getByText("Fuera").parentElement).toHaveTextContent("Fuera1V0E0D");
    const chips = within(screen.getByRole("list", { name: "Resultados por jornada" })).getAllByRole("button");
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Jornada 1: Victoria 3-0 fuera contra CE Europa",
      "Jornada 2: Empate 2-2 en casa contra Huesca",
      "Jornada 3: Victoria 1-0 en casa contra CE Europa",
    ]);
    expect(screen.queryByText(/Clasificación|Puntos/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Rendimiento" })).toBeNull();
    expect(screen.queryByText(/xG|Posesión|pendiente de datos/i)).toBeNull();
    expect(screen.getByText("Datos reales")).toBeVisible();
    expect(screen.getByText(SCOPE)).toBeVisible();
    expect(screen.getByText("3 partidos finalizados con resultado de 37 partidos observados en esta competición (29 pendientes).")).toBeVisible();
  });

  it("lists the played matches newest first, linked to their real detail only when real matches are enabled", async () => {
    sections(["teams", "matches"]);
    const { unmount } = render(<TeamsView />);
    await loaded();
    const table = screen.getByRole("table", { name: "Partidos disputados" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^3.*Localvs.*CE Europa.*V 1-0$/), expect.stringMatching(/^2.*Localvs.*Huesca.*E 2-2$/),
      expect.stringMatching(/^1.*Visitanteen.*CE Europa.*V 3-0$/),
    ]);
    expect(within(table).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(
      ["sofascore-match-3", "sofascore-match-2", "sofascore-match-1"].map((id) => `/matches/${id}?view=observed`));
    unmount();
    sections(["teams"]);
    render(<TeamsView />);
    await loaded();
    expect(within(screen.getByRole("table", { name: "Partidos disputados" })).queryAllByRole("link")).toHaveLength(0);
  });

  it("says what is left out: finished matches without a valid score and unknown states", async () => {
    vi.mocked(getTeamObservedPerformance).mockResolvedValue(performance([competition({
      matches: { inScope: 37, finished: 4, pending: 28, counted: 3, finishedWithoutValidScore: 1, unknownStatus: 1 },
    })]));
    render(<TeamsView />);
    await loaded();
    expect(screen.getByText(/1 finalizado sin marcador válido no se incluye\. 1 partido con estado desconocido no se incluye\./)).toBeVisible();
  });

  it("tells zero finished matches apart from a failure, which retries", async () => {
    vi.mocked(getTeamObservedPerformance).mockResolvedValueOnce(performance([competition({
      matches: { inScope: 29, finished: 0, pending: 29, counted: 0, finishedWithoutValidScore: 0, unknownStatus: 0 },
      record: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 },
      venues: { home: { win: 0, draw: 0, loss: 0 }, away: { win: 0, draw: 0, loss: 0 } }, results: [],
    })]));
    const { unmount } = render(<TeamsView />);
    expect(await screen.findByText("Sin partidos finalizados observados en esta competición.")).toBeVisible();
    expect(screen.queryByLabelText("Balance")).toBeNull();
    unmount();

    vi.mocked(getTeamObservedPerformance).mockRejectedValueOnce(new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "No"));
    render(<TeamsView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los datos reales del equipo.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    await loaded();
    expect(getTeamSeason).not.toHaveBeenCalled();
  });

  it("never swaps a synthetic season or a team without correspondence from the URL", async () => {
    const { unmount } = render(<TeamsView initialSeasonId="season-demo-2026-27" />);
    expect(await screen.findByText(/La temporada indicada no corresponde a la fuente real de equipos/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver la temporada real" })).toHaveAttribute("href", "/teams");
    unmount();
    vi.mocked(getTeamObservedPerformance).mockRejectedValue(new ApiRequestError(404, "NOT_FOUND", "No"));
    render(<TeamsView initialTeamId="team-montealto" />);
    expect(await screen.findByText("Este equipo no tiene correspondencia con la fuente real de equipos.")).toBeVisible();
    expect(getTeamObservedPerformance).toHaveBeenCalledWith("team-montealto", expect.anything());
    // The way out resets the team chosen by the URL (same page, no remount).
    vi.mocked(getTeamObservedPerformance).mockResolvedValue(performance());
    await userEvent.setup().click(screen.getByRole("link", { name: "Ver el Real Jaén" }));
    await loaded();
  });

  it("opens the real season from the URL: the one a real profile returns to", async () => {
    render(<TeamsView initialSeasonId={GROUP_2} />);
    await loaded();
    expect(screen.getByRole("combobox", { name: "Temporada" })).toHaveValue(GROUP_2);
  });

  it("shows the real observed players when enabled, returning to this real season; otherwise says they are not enabled", async () => {
    sections(["teams", "observedPlayers"]);
    vi.mocked(getObservedPlayers).mockResolvedValue({ teamId: "team-real-jaen", scope: "Jugadores observados en convocatorias.",
      source: { synthetic: false, label: "Datos reales" }, players: [{ id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder" }] });
    const { unmount } = render(<TeamsView initialTab="players" />);
    const link = await screen.findByRole("link", { name: "Ver ficha de Moha Keita" });
    expect(link).toHaveAttribute("href", `/players/sofascore-player-966303?view=profile&season=${GROUP_2}&from=team&origin=team-real-jaen`);
    unmount();

    sections(["teams"]);
    vi.mocked(getObservedPlayers).mockClear();
    render(<TeamsView initialTab="players" />);
    expect(await screen.findByText("La fuente real de jugadores no está activada.")).toBeVisible();
    expect(getObservedPlayers).not.toHaveBeenCalled();
    expect(getTeamSeason).not.toHaveBeenCalled();
  });

  it("asks nothing when the source cannot be determined, and stays synthetic without TEAMS_SOURCE", async () => {
    vi.mocked(getSource).mockRejectedValueOnce(new ApiRequestError(503, "X", "No"));
    const { unmount } = render(<TeamsView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo determinar la fuente de los equipos.");
    expect(getTeamObservedPerformance).not.toHaveBeenCalled();
    expect(getCompetitions).not.toHaveBeenCalled();
    unmount();
    sections(["matches", "observedPlayers"]);
    vi.mocked(getCompetitions).mockResolvedValue([]);
    render(<TeamsView />);
    await vi.waitFor(() => expect(getCompetitions).toHaveBeenCalled());
    expect(getTeamObservedPerformance).not.toHaveBeenCalled();
  });
});
