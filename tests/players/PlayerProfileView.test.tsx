import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getMatch, getPlayer, getPlayerObservedMatches, getPlayerProfile, getSeasonMatches, getSource } from "@/client/api";
import { OBSERVED_MATCH_STAT_KEYS, type ObservedPlayerMatch, type ObservedPlayerMatches, type PlayerProfile } from "@/contract";
import { PlayerProfileView } from "@/features/players/PlayerProfileView";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getPlayerProfile: vi.fn(), getPlayerObservedMatches: vi.fn(), getPlayer: vi.fn(), getSeasonMatches: vi.fn(),
  getSource: vi.fn(), getMatch: vi.fn(),
}));

const SCOPE = "Datos personales según la fuente. No indican equipo actual.";
const moha: PlayerProfile = {
  player: { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder",
    birthDate: "1999-09-18", heightCm: 165, preferredFoot: null, country: "Senegal" },
  scope: SCOPE,
  source: { synthetic: false, label: "Datos reales" },
};
const RETURN = "/teams?season=s&team=team-real-jaen&tab=players";
const field = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling!;

const noMatches: ObservedPlayerMatches = {
  playerId: moha.player.id, matches: [], scope: "Partidos en los que la fuente registra al jugador en la convocatoria.",
  ratingSource: "SofaScore", source: { synthetic: false, label: "Datos reales" },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPlayerObservedMatches).mockResolvedValue(noMatches);
  vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["observedPlayers"] });
});

async function load(data: PlayerProfile = moha) {
  vi.mocked(getPlayerProfile).mockResolvedValue(data);
  render(<PlayerProfileView playerId={data.player.id} returnHref={RETURN} />);
  await screen.findByRole("heading", { level: 1, name: data.player.name });
}

describe("Real player profile", () => {
  it("shows the personal data with provenance and scope, and loads nothing else", async () => {
    await load();
    expect(getPlayerProfile).toHaveBeenCalledWith("sofascore-player-966303", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(screen.getByText("Centrocampista")).toBeVisible();
    expect(field("Nacimiento")).toHaveTextContent(/^18\/09\/1999 \(\d+ años\)$/);
    expect(field("Estatura")).toHaveTextContent("1,65 m");
    expect(field("País")).toHaveTextContent("Senegal");
    expect(screen.getByText("Datos reales")).toBeVisible();
    expect(screen.getByText(SCOPE)).toBeVisible();
    expect(screen.getByRole("link", { name: "← Volver" })).toHaveAttribute("href", RETURN);
    // No season, team, stats or matches: neither shown nor requested.
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByLabelText(/Dorsal/)).toBeNull();
    expect(screen.queryByText(/Real Jaén|2026\/27|Participación/)).toBeNull();
    expect(getPlayer).not.toHaveBeenCalled();
    expect(getSeasonMatches).not.toHaveBeenCalled();
  });

  it("shows unknown values as «—», never invented", async () => {
    await load({ ...moha, player: { ...moha.player, position: null, birthDate: null, heightCm: null, preferredFoot: null, country: null } });
    for (const label of ["Nacimiento", "Estatura", "Pierna dominante", "País"]) {
      expect(field(label), label).toHaveTextContent(/^—$/);
    }
    expect(screen.getByText("—", { selector: "p" })).toBeVisible();
  });

  it("says when the player does not exist, without retry", async () => {
    vi.mocked(getPlayerProfile).mockRejectedValue(new ApiRequestError(404, "NOT_FOUND", "Jugador no encontrado en la fuente de datos."));
    render(<PlayerProfileView playerId="sofascore-player-1" returnHref={RETURN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Jugador no encontrado");
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    expect(screen.getByRole("link", { name: "← Volver" })).toHaveAttribute("href", RETURN);
  });

  it("shows the failure of the real source and retries", async () => {
    vi.mocked(getPlayerProfile).mockRejectedValueOnce(
      new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "La fuente de datos real no está disponible."),
    );
    render(<PlayerProfileView playerId={moha.player.id} returnHref={RETURN} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("La fuente de datos real no está disponible.");
    vi.mocked(getPlayerProfile).mockResolvedValue(moha);
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Moha Keita" })).toBeVisible();
    expect(getPlayerProfile).toHaveBeenCalledTimes(2);
  });
});

const missing = { value: null, reason: "not_available" } as const;
const noStats = Object.fromEntries(OBSERVED_MATCH_STAT_KEYS.map((key) => [key, missing])) as ObservedPlayerMatch["stats"];
const played: ObservedPlayerMatch = {
  match: { id: "sofascore-match-1", kickoff: "2026-10-18T16:15:00Z", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 10,
    home: { id: "team-real-jaen", name: "Real Jaén" }, away: { id: "sofascore-team-9", name: "Rayo Majadahonda" },
    score: { home: 1, away: 0 } },
  side: "home", role: "starter", position: "forward", participation: "confirmed",
  stats: { ...noStats, minutes: { value: 90 }, goals: { value: 2 }, assists: { value: 0 }, shots: { value: 4 },
    shotsOnTarget: { value: 0 }, xg: { value: 0.454 }, passes: { value: 29 }, passesCompleted: { value: 23 },
    duelsWon: { value: 5 }, rating: { value: 7 } },
};
const benched: ObservedPlayerMatch = {
  match: { ...played.match, id: "sofascore-match-2", kickoff: "2026-09-06T09:30:00Z", season: "25/26", round: 2,
    competition: "Copa del Rey", home: { id: "sofascore-team-7", name: null }, away: { id: "team-real-jaen", name: "Real Jaén" },
    score: { home: 2, away: 2 } },
  side: "away", role: "substitute", position: "midfielder", participation: "unknown", stats: noStats,
};
const keeper: ObservedPlayerMatch = {
  ...played, match: { ...played.match, id: "sofascore-match-3", kickoff: "2026-08-30T17:15:00Z", round: 1 },
  position: "goalkeeper", stats: { ...noStats, minutes: { value: 90 }, passes: { value: 0 }, saves: { value: 4 } },
};
const history = () => screen.getByRole("list", { name: "Histórico de partidos" });
const rowButtons = () => within(history()).getAllByRole("button");
const detail = () => screen.getByRole("region", { name: "Detalle del partido" });
const metric = (label: string) => within(detail()).getByText(label, { selector: "dt" }).nextElementSibling as HTMLElement;

async function loadMatches(matches: ObservedPlayerMatch[], props: Partial<Parameters<typeof PlayerProfileView>[0]> = {}) {
  vi.mocked(getPlayerObservedMatches).mockResolvedValue({ ...noMatches, matches });
  vi.mocked(getPlayerProfile).mockResolvedValue(moha);
  render(<PlayerProfileView playerId={moha.player.id} returnHref={RETURN} {...props} />);
  await screen.findByRole("list", { name: "Histórico de partidos" });
}

describe("Partidos (real)", () => {
  it("lists every call-up with its own competition and season, and details the newest appearance", async () => {
    await loadMatches([benched, played]);
    const [first, second] = rowButtons();
    expect(first).toHaveTextContent(
      "J2Equipo sin identificar · Real JaénVisitante · 6 sept 2026Copa del Rey · 25/262–2Suplente · Participación no confirmada");
    expect(second).toHaveTextContent(/J10Real Jaén · Rayo MajadahondaLocal · 18 oct 2026Primera Federacion, Group 2 · 26\/271–0Titular · 90′/);
    expect(within(second).getByLabelText("2 goles")).toBeVisible();
    // Zero assists: no icon; an unconfirmed call-up never reads «No participó».
    expect(within(second).queryByLabelText(/asistencia/)).toBeNull();
    expect(screen.queryByText(/No participó/)).toBeNull();
    // Without a selection, the newest confirmed appearance, not the newest call-up.
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(within(detail()).getByText(/Posición en el partido: Delantero · Valoración de SofaScore: 7,0/)).toBeVisible();
    expect(getSeasonMatches).not.toHaveBeenCalled();
    expect(getPlayer).not.toHaveBeenCalled();
  });

  it("shows real values, real zeros and missing values apart; accuracy only from both pass counts", async () => {
    await loadMatches([played]);
    expect(metric("Goles")).toHaveTextContent(/^2$/);
    expect(metric("Tiros a puerta")).toHaveTextContent(/^0$/);
    expect(metric("xG")).toHaveTextContent(/^0,45$/);
    expect(metric("Pases")).toHaveTextContent(/^29$/);
    expect(metric("Precisión de pase")).toHaveTextContent(/^79,3 %$/);
    expect(metric("Duelos ganados")).toHaveTextContent(/^5$/);
    // Keys the source omitted stay unknown although other stats are given.
    for (const label of ["Regates", "Recuperaciones", "Duelos perdidos", "Faltas"]) {
      expect(metric(label), label).toHaveTextContent(/^—$/);
      expect(within(metric(label)).getByLabelText("Dato no disponible")).toBeVisible();
    }
    // No synthetic-only metric is invented for a real player.
    expect(within(detail()).queryByText(/Amarillas|Rojas|Goles encajados/)).toBeNull();
  });

  it("never divides by zero or by an unknown count", async () => {
    await loadMatches([{ ...played, stats: { ...played.stats, passes: { value: 0 }, passesCompleted: { value: 0 } } }]);
    expect(metric("Precisión de pase")).toHaveTextContent(/^—$/);
    cleanup();
    await loadMatches([{ ...played, stats: { ...played.stats, passesCompleted: missing } }]);
    expect(metric("Precisión de pase")).toHaveTextContent(/^—$/);
  });

  it("uses the match position, not the usual one, to choose the goalkeeper metrics", async () => {
    await loadMatches([keeper]);
    expect(within(detail()).getByText(/Posición en el partido: Portero/)).toBeVisible();
    expect(metric("Paradas")).toHaveTextContent(/^4$/);
    expect(within(detail()).queryByText("Tiros")).toBeNull();
  });

  it("tells a call-up without confirmed participation from an appearance", async () => {
    await loadMatches([benched], { initialMatchId: "sofascore-match-2" });
    expect(within(detail()).getByText(/La fuente no confirma su participación: sin minutos ni estadísticas/)).toBeVisible();
    expect(within(detail()).getByText(/Suplente · Participación no confirmada/)).toBeVisible();
    expect(within(detail()).queryByText(/Valoración/)).toBeNull();
    expect(within(detail()).queryByRole("term")).toBeNull();
  });

  it("changes the selected match in place and keeps it in the URL without navigating", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    await loadMatches([played, benched]);
    const second = rowButtons()[1];
    await userEvent.setup().click(second);
    expect(second).toHaveAttribute("aria-pressed", "true");
    expect(within(detail()).getByText(/vs Equipo sin identificar/)).toBeVisible();
    expect(replace).toHaveBeenLastCalledWith(window.history.state, "", expect.stringContaining("match=sofascore-match-2"));
    replace.mockRestore();
  });

  it("selects the requested match, and says when it is not among the call-ups", async () => {
    await loadMatches([played, benched], { initialMatchId: "sofascore-match-2" });
    expect(rowButtons()[1]).toHaveAttribute("aria-pressed", "true");
    cleanup();
    await loadMatches([played], { initialMatchId: "sofascore-match-404" });
    expect(screen.getByRole("status")).toHaveTextContent("El partido indicado no figura entre los partidos observados de este jugador.");
    expect(rowButtons()[0]).toHaveAttribute("aria-pressed", "false");
    expect(within(detail()).getByText("Selecciona un partido del histórico.")).toBeVisible();
  });

  it("says when the source has no matches for the player", async () => {
    await load();
    expect(await screen.findByText("La fuente no tiene partidos observados de este jugador.")).toBeVisible();
    expect(within(detail()).getByText("Sin partidos observados.")).toBeVisible();
  });

  it("keeps the personal data when the matches fail, and retries only the matches", async () => {
    vi.mocked(getPlayerObservedMatches).mockRejectedValueOnce(
      new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "La fuente de datos real no está disponible."),
    );
    await load();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los partidos observados.");
    expect(field("País")).toHaveTextContent("Senegal");
    vi.mocked(getPlayerObservedMatches).mockResolvedValue({ ...noMatches, matches: [played] });
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("list", { name: "Histórico de partidos" })).toBeVisible();
    expect(getPlayerProfile).toHaveBeenCalledTimes(1);
  });

  it("links «Ver partido completo» to the real detail when real matches are enabled, carrying this profile's return", async () => {
    vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["observedPlayers", "matches"] });
    await loadMatches([played, benched], { context: { seasonId: "s", origin: { kind: "team", id: "team-real-jaen" } } });
    const link = await within(detail()).findByRole("link", { name: "Ver partido completo" });
    expect(link).toHaveAttribute("href",
      "/matches/sofascore-match-1?view=observed&from=player&player=sofascore-player-966303&season=s&playerFrom=team&playerOrigin=team-real-jaen");
    expect(getMatch).not.toHaveBeenCalled();
  });

  it.each([
    ["real matches are not enabled", () => vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos", realSections: [] })],
    ["the source cannot be determined", () => vi.mocked(getSource).mockRejectedValue(new ApiRequestError(503, "X", "No"))],
  ])("offers no match link when %s, never a synthetic detail", async (_, setSource) => {
    setSource();
    await loadMatches([played]);
    await vi.waitFor(() => expect(getSource).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Ver partido completo" })).toBeNull();
    expect(getMatch).not.toHaveBeenCalled();
  });
});
