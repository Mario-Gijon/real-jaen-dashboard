import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getCompetitions, getMatch, getObservedMatchDetail, getSource } from "@/client/api";
import type { ObservedGoal, ObservedLineupPlayer, ObservedMatchDetail, PlayerRef, TeamMatchStats } from "@/contract";
import { RealMatchDetailView } from "@/features/matches/RealMatchDetailView";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getSource: vi.fn(), getObservedMatchDetail: vi.fn(), getMatch: vi.fn(), getCompetitions: vi.fn(),
}));

const missing = { value: null, reason: "not_available" } as const;
const stats = (values: Partial<Record<keyof TeamMatchStats, number>>): TeamMatchStats => ({
  possession: missing, shots: missing, shotsOnTarget: missing, xg: missing, corners: missing,
  fouls: missing, yellowCards: missing, redCards: missing,
  ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v }])),
});
const SCOPE = "Partido, estadísticas colectivas, alineaciones e incidencias según la fuente. Un dato que la fuente no da se muestra como «—».";
const notStored = { state: "not_stored", fetchedAt: null } as const;
type Sections = Partial<Pick<ObservedMatchDetail, "statistics" | "lineups" | "incidents">>;
const detail = (sections: Sections = {}, match: Partial<ObservedMatchDetail["match"]> = {}): ObservedMatchDetail => ({
  match: { id: "sofascore-match-16599363", kickoff: "2026-08-30T17:15:00Z", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 1,
    home: { id: "sofascore-team-135672", name: "CE Europa" }, away: { id: "team-real-jaen", name: "Real Jaén" },
    score: { home: 0, away: 3 }, ...match },
  statistics: notStored, lineups: notStored, incidents: notStored, ...sections,
  scope: SCOPE, source: { synthetic: false, label: "Datos reales" },
});
const statistics: ObservedMatchDetail["statistics"] = { state: "stored", fetchedAt: "2026-10-21T12:07:30+00:00",
  home: stats({ possession: 46, xg: 1.81, shots: 15, yellowCards: 0 }), away: stats({ possession: 54, xg: 1.6, shots: 13, yellowCards: 1 }) };

const ref = (id: number, name: string): PlayerRef => ({ id: `sofascore-player-${id}`, name, position: null });
const lineupPlayer = (id: number, name: string, fields: Partial<ObservedLineupPlayer> = {}): ObservedLineupPlayer => ({
  player: { id: `sofascore-player-${id}`, name, position: "midfielder" }, shirtNumber: id,
  role: "starter", participation: "confirmed", minutes: { value: 90 }, ...fields,
});
const startersFrom = (first: number) => Array.from({ length: 11 }, (_, i) => lineupPlayer(first + i, `Titular ${first + i}`));
const lineups: ObservedMatchDetail["lineups"] = {
  state: "stored", fetchedAt: "2026-10-21T12:07:31+00:00", confirmed: true,
  home: [...startersFrom(1), lineupPlayer(40, "Suplente Sin Jugar", { role: "substitute", participation: "unknown", minutes: missing }),
    lineupPlayer(41, "Suplente Con Minutos", { role: "substitute", minutes: { value: 5 } }),
    lineupPlayer(42, "Suplente No Utilizado", { role: "substitute", participation: "unused", minutes: { value: 0 } })],
  away: [...startersFrom(50), lineupPlayer(90, "Entra Tarde", { role: "substitute", minutes: { value: 22 } })],
};
const goal = (kind: ObservedGoal["kind"], scorer: PlayerRef | null, assist: PlayerRef | null = null, minute = 30): ObservedGoal =>
  ({ kind, minute, addedTime: null, scorer, assist });
const incidents: ObservedMatchDetail["incidents"] = {
  state: "stored", fetchedAt: "2026-10-21T12:07:31+00:00",
  goals: [
    goal("regular", ref(50, "Titular 50"), ref(51, "Titular 51")),
    goal("penalty", ref(50, "Titular 50"), null, 70),
    goal("ownGoal", ref(2, "Titular 2"), ref(52, "Titular 52")),
    goal("unknown", ref(53, "Titular 53")),
  ],
  substitutions: [{ minute: 68, addedTime: 2, playerIn: ref(90, "Entra Tarde"), playerOut: ref(55, "Titular 55") }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["matches"] });
  vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ statistics, lineups, incidents }));
});

const metric = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!;
const values = (label: string) => within(metric(label)).getAllByRole("definition").slice(0, 2).map((d) => d.textContent);
async function openLineups(props: { initialSection?: "summary" | "lineups" } = {}) {
  render(<RealMatchDetailView matchId="sofascore-match-16599363" {...props} />);
  if (!props.initialSection) await userEvent.setup().click(await screen.findByRole("tab", { name: "Alineaciones" }));
  return screen.findByRole("tabpanel", { name: "Alineaciones" });
}
const row = (panel: HTMLElement, name: string) => within(panel).getByText(name).closest("li")!;

describe("Real match detail: Resumen", () => {
  it("shows the header and, in Resumen, the team stats from the source, unknown values as «—», with provenance", async () => {
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByRole("heading", { level: 1, name: "CE Europa contra Real Jaén" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Resumen", "Alineaciones"]);
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Primera Federacion, Group 2 · 26/27")).toBeVisible();
    expect(screen.getByText("0 – 3")).toBeVisible();
    expect(screen.getByText("Datos reales")).toBeVisible();
    expect(screen.getByText(SCOPE)).toBeVisible();
    expect(values("Posesión")).toEqual(["46 %", "54 %"]);
    expect(values("xG")).toEqual(["1,81", "1,60"]);
    expect(values("Amarillas")).toEqual(["0", "1"]);
    // Red cards the source does not give stay unknown, never 0.
    expect(values("Rojas")).toEqual(["—", "—"]);
    expect(screen.getByText(/Obtenidas de la fuente el 21 oct 2026/)).toBeVisible();
    expect(getMatch).not.toHaveBeenCalled();
    expect(getCompetitions).not.toHaveBeenCalled();
  });

  it("moves between tabs with the keyboard, like the synthetic detail", async () => {
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    const summary = await screen.findByRole("tab", { name: "Resumen" });
    summary.focus();
    const user = userEvent.setup();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alineaciones" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Alineaciones" })).toBeVisible();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tabpanel", { name: "Resumen" })).toBeVisible();
  });

  it("distinguishes statistics not stored, stored empty and a failed query", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({}, { status: "scheduled", score: null, kickoff: "2026-11-07T15:30:00Z" }));
    const view = render(<RealMatchDetailView matchId="sofascore-match-16599386" />);
    expect(await screen.findByText("La fuente no tiene estadísticas guardadas de este partido.")).toBeVisible();
    expect(screen.getByText("Programado")).toBeVisible();
    expect(screen.queryByText("0 – 0")).toBeNull();
    view.unmount();

    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ statistics: { state: "empty", fetchedAt: "2026-10-21T12:07:30+00:00" } }));
    const emptyView = render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByText("La fuente guardó las estadísticas de este partido sin contenido.")).toBeVisible();
    emptyView.unmount();

    vi.mocked(getObservedMatchDetail).mockResolvedValueOnce(detail({ statistics: { state: "error", fetchedAt: null } }));
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    const panel = await screen.findByRole("tabpanel", { name: "Resumen" });
    expect(within(panel).getByRole("alert")).toHaveTextContent("No se pudieron cargar las estadísticas de este partido.");
    expect(screen.getByText("0 – 3")).toBeVisible();
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ statistics }));
    await userEvent.setup().click(within(panel).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/Obtenidas de la fuente/)).toBeVisible();
  });

  it("says a match the real source does not know is not found, without trying the synthetic detail", async () => {
    vi.mocked(getObservedMatchDetail).mockRejectedValue(new ApiRequestError(404, "NOT_FOUND", "No"));
    render(<RealMatchDetailView matchId="match-r01-01" />);
    expect(await screen.findByRole("heading", { name: "Partido no encontrado en la fuente real" })).toBeVisible();
    expect(getMatch).not.toHaveBeenCalled();
  });

  it("shows a failure of the real source with retry", async () => {
    vi.mocked(getObservedMatchDetail).mockRejectedValueOnce(new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "No"));
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByRole("heading", { name: "No se pudo cargar el partido" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("0 – 3")).toBeVisible();
  });

  it("returns to the list by default and to the real profile it was opened from", async () => {
    const { unmount } = render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(screen.getByRole("link", { name: "‹ Volver a partidos" })).toHaveAttribute("href", "/matches");
    unmount();
    vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["observedPlayers", "matches"] });
    const profile = "/players/sofascore-player-7?view=profile&from=team&origin=team-real-jaen";
    render(<RealMatchDetailView matchId="sofascore-match-16599363" playerReturnHref={profile} />);
    expect(screen.getByRole("link", { name: "‹ Volver al jugador" })).toHaveAttribute("href", profile);
    expect(screen.queryByRole("link", { name: "‹ Volver a partidos" })).toBeNull();
    // A profile opened from these line-ups still returns to them, not to the previous profile.
    await userEvent.setup().click(await screen.findByRole("tab", { name: "Alineaciones" }));
    expect(screen.getByRole("link", { name: "Titular 50" })).toHaveAttribute("href",
      "/players/sofascore-player-50?view=profile&from=observedMatch&origin=sofascore-match-16599363&originTab=lineups");
  });

  it("asks nothing when the real matches are not enabled", async () => {
    vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos", realSections: [] });
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByRole("heading", { name: "La fuente real de partidos no está activada" })).toBeVisible();
    expect(getObservedMatchDetail).not.toHaveBeenCalled();
  });
});

describe("Real match detail: Alineaciones", () => {
  it("lists «Once inicial» and «Banquillo» per team with shirt number and position, like the synthetic detail", async () => {
    const panel = await openLineups();
    expect(within(panel).getByText("Alineaciones confirmadas por la fuente.")).toBeVisible();
    const home = within(panel).getByRole("region", { name: "CE Europa" });
    expect(within(home).getByRole("list", { name: "Once inicial de CE Europa" }).children).toHaveLength(11);
    expect(within(home).getByRole("list", { name: "Banquillo de CE Europa" }).children).toHaveLength(3);
    expect(row(panel, "Titular 1")).toHaveTextContent("1Titular 1MED");
    expect(within(panel).queryByText(/4-4-2|Formación/)).toBeNull();
    // Real profiles are not enabled here: names without links.
    expect(within(panel).queryAllByRole("link")).toHaveLength(0);
  });

  it("marks goals by kind, named assists and recorded substitutions, never from minutes", async () => {
    const panel = await openLineups();
    const scorer = row(panel, "Titular 50");
    expect(within(scorer).getByRole("img", { name: "2 goles (1 de penalti)" })).toBeVisible();
    expect(within(row(panel, "Titular 51")).getByRole("img", { name: "1 asistencia" })).toBeVisible();
    // An own goal is not an ordinary goal, and its assist is not credited.
    const own = row(panel, "Titular 2");
    expect(within(own).getByLabelText("1 gol en propia puerta")).toHaveTextContent("p.p.");
    expect(within(own).queryByRole("img", { name: /gol/ })).toBeNull();
    expect(within(row(panel, "Titular 52")).queryByRole("img", { name: /asistencia/ })).toBeNull();
    const unknownKind = row(panel, "Titular 53");
    expect(within(unknownKind).getByRole("img", { name: "1 gol de tipo no indicado por la fuente" })).toBeVisible();
    expect(within(unknownKind).queryByRole("img", { name: /^\d+ goles?($| \()/ })).toBeNull();
    expect(unknownKind).toHaveTextContent("?");
    // Substitution: double arrows with the minute on the player out, entry line on the player in.
    expect(within(row(panel, "Titular 55")).getByRole("img", { name: "Sustituido en el minuto 68+2′" })).toBeVisible();
    const entered = row(panel, "Entra Tarde");
    expect(within(entered).getByLabelText("Entra en el minuto 68+2′")).toBeVisible();
    expect(entered).toHaveTextContent("Sale · Titular 55");
    // Minutes alone never become a substitution, and an unused substitute is not said to have stayed out.
    const withMinutes = row(panel, "Suplente Con Minutos");
    expect(within(withMinutes).queryByLabelText(/Entra/)).toBeNull();
    expect(withMinutes).toHaveTextContent("5′");
    expect(row(panel, "Suplente Sin Jugar")).toHaveTextContent("Participación no confirmada");
    // Unused as the data service resolves it: said so, never «0′».
    expect(row(panel, "Suplente No Utilizado")).toHaveTextContent("No utilizado");
    expect(row(panel, "Suplente No Utilizado")).not.toHaveTextContent("0′");
    expect(within(row(panel, "Titular 1")).queryByRole("img")).toBeNull();
  });

  it("keeps line-ups and stats when the incidents fail, marks nothing and can retry", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValueOnce(detail({ statistics, lineups, incidents: { state: "error", fetchedAt: null } }));
    const panel = await openLineups();
    expect(within(panel).getByRole("alert")).toHaveTextContent("No se pudieron cargar las incidencias: no se marcan goles, asistencias ni cambios.");
    expect(within(panel).getByRole("list", { name: "Once inicial de CE Europa" })).toBeVisible();
    expect(within(row(panel, "Titular 50")).queryByRole("img")).toBeNull();
    expect(row(panel, "Entra Tarde")).toHaveTextContent("22′");
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ statistics, lineups, incidents }));
    await userEvent.setup().click(within(panel).getByRole("button", { name: "Reintentar" }));
    // The retry reloads the detail but stays on Alineaciones.
    const reloaded = await screen.findByRole("tabpanel", { name: "Alineaciones" });
    expect(await within(reloaded).findByRole("img", { name: "2 goles (1 de penalti)" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("tab", { name: "Resumen" }));
    expect(values("Posesión")).toEqual(["46 %", "54 %"]);
  });

  it("says when the incidents are not stored or stored empty, without marking anything", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ lineups, incidents: { state: "empty", fetchedAt: null } }));
    const panel = await openLineups({ initialSection: "lineups" });
    expect(within(panel).getByText(/La fuente guardó las incidencias de este partido sin contenido/)).toBeVisible();
  });

  it("links names to the real profile, returning to this match's line-ups, only when real profiles are enabled", async () => {
    vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["observedPlayers", "matches"] });
    const panel = await openLineups({ initialSection: "lineups" });
    expect(within(panel).getByRole("link", { name: "Titular 1" })).toHaveAttribute("href",
      "/players/sofascore-player-1?view=profile&from=observedMatch&origin=sofascore-match-16599363&originTab=lineups");
  });

  it("never guesses: unknown role, shirt number and confirmation, and an incomplete side is said so", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ lineups: {
      state: "stored", fetchedAt: null, confirmed: null,
      home: [lineupPlayer(1, "Sin Rol", { role: null, shirtNumber: null, participation: "unknown", minutes: missing })],
      away: [],
    } }));
    const panel = await openLineups({ initialSection: "lineups" });
    expect(within(panel).getByText("La fuente no indica si las alineaciones están confirmadas.")).toBeVisible();
    expect(within(panel).getByText("Alineación incompleta en la fuente: 0 titulares y 1 sin rol informado.")).toBeVisible();
    expect(within(panel).getByRole("list", { name: "Jugadores sin rol informado de CE Europa" })).toHaveTextContent("—Sin Rol");
    expect(within(panel).getByText("La fuente no registra jugadores de este equipo.")).toBeVisible();
  });

  it("says when the line-ups are not stored, as in a pending match", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({}, { status: "scheduled", score: null }));
    const pending = await openLineups({ initialSection: "lineups" });
    expect(within(pending).getByText("La fuente no tiene alineaciones guardadas de este partido.")).toBeVisible();
  });

  it("never adds a goal of unknown kind to the player's ordinary goals", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ lineups, incidents: { state: "stored", fetchedAt: null, substitutions: [],
      goals: [goal("regular", ref(50, "Titular 50")), goal("unknown", ref(50, "Titular 50"), null, 60), goal("unknown", ref(50, "Titular 50"), null, 70)] } }));
    const panel = await openLineups({ initialSection: "lineups" });
    const scorer = row(panel, "Titular 50");
    expect(within(scorer).getByRole("img", { name: "1 gol" })).toBeVisible();
    expect(within(scorer).getByRole("img", { name: "2 goles de tipo no indicado por la fuente" })).toBeVisible();
    // The visible count next to the ball is the ordinary goals only (no «3», no «2» on that icon).
    expect(scorer.querySelector("[title='1 gol']")).toHaveTextContent(/^$/);
    expect(scorer.querySelector("[title='2 goles de tipo no indicado por la fuente']")).toHaveTextContent("? 2");
  });

  it("recovers line-ups after a failed query, keeping header and stats", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValueOnce(detail({ statistics, lineups: { state: "error", fetchedAt: null }, incidents }));
    const panel = await openLineups({ initialSection: "lineups" });
    expect(within(panel).getByRole("alert")).toHaveTextContent("No se pudieron cargar las alineaciones de este partido.");
    expect(screen.getByText("0 – 3")).toBeVisible();
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ statistics, lineups, incidents }));
    await userEvent.setup().click(within(panel).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("list", { name: "Once inicial de CE Europa" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Alineaciones" })).toHaveAttribute("aria-selected", "true");
  });
});
