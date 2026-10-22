import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getMatch, getPlayer, getPlayerObservedMatches, getPlayerProfile, getSeasonMatches, getSource } from "@/client/api";
import type { ObservedPlayerMatch, ObservedPlayerMatches, PlayerProfile } from "@/contract";
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
const played: ObservedPlayerMatch = {
  match: { id: "sofascore-match-1", kickoff: "2026-10-18T16:15:00Z", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 10,
    home: { id: "team-real-jaen", name: "Real Jaén" }, away: { id: "sofascore-team-9", name: "Rayo Majadahonda" },
    score: { home: 1, away: 0 } },
  side: "home", role: "starter", participation: "confirmed",
  stats: { minutes: { value: 90 }, goals: missing, assists: { value: 0 }, shots: { value: 2 },
    xg: { value: 0.454 }, passesCompleted: missing, passes: { value: 29 }, rating: { value: 7 } },
};
const benched: ObservedPlayerMatch = {
  match: { ...played.match, id: "sofascore-match-2", kickoff: "2026-09-06T09:30:00Z", season: "25/26", round: 2,
    home: { id: "sofascore-team-7", name: null }, away: { id: "team-real-jaen", name: "Real Jaén" },
    score: { home: 2, away: 2 } },
  side: "away", role: "substitute", participation: "unknown",
  stats: { minutes: missing, goals: missing, assists: missing, shots: missing, xg: missing,
    passesCompleted: missing, passes: missing, rating: missing },
};
const rows = () => within(screen.getByRole("table", { name: "Partidos observados del jugador" })).getAllByRole("row").slice(1);
const cells = (row: HTMLElement) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent);

describe("Partidos observados", () => {
  it("shows each call-up with its own season, venue, result, role and the available stats", async () => {
    vi.mocked(getPlayerObservedMatches).mockResolvedValue({ ...noMatches, matches: [played, benched] });
    await load();
    const section = await screen.findByRole("region", { name: /Partidos observados/ });
    expect(within(section).getByRole("columnheader", { name: /Val\. SofaScore/ })).toBeVisible();
    expect(within(section).getByTitle("Valoración de SofaScore")).toBeVisible();
    const [first, second] = rows();
    expect(cells(first)).toEqual([
      "vs Rayo Majadahonda18 oct 2026 · LocalPrimera Federacion, Group 2 · 26/27 · J10",
      "1–0", "Titular", "90", "—", "0", "2", "0,45", "—/29", "7,0",
    ]);
    // Its own season, unknown opponent name and no claimed participation.
    expect(cells(second)).toEqual([
      "vs Rival sin identificar6 sept 2026 · VisitantePrimera Federacion, Group 2 · 25/26 · J2",
      "2–2", "SuplenteParticipación no confirmada", "—", "—", "—", "—", "—", "—/—", "—",
    ]);
    expect(screen.queryByText(/No participó/)).toBeNull();
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(getSeasonMatches).not.toHaveBeenCalled();
  });

  it("says when the source has no matches for the player", async () => {
    await load();
    expect(await screen.findByText("La fuente no tiene partidos observados de este jugador.")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the personal data when the matches fail, and retries only the matches", async () => {
    vi.mocked(getPlayerObservedMatches).mockRejectedValueOnce(
      new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "La fuente de datos real no está disponible."),
    );
    await load();
    const section = screen.getByRole("region", { name: /Partidos observados/ });
    expect(await within(section).findByRole("alert")).toHaveTextContent("No se pudieron cargar los partidos observados.");
    expect(field("País")).toHaveTextContent("Senegal");
    vi.mocked(getPlayerObservedMatches).mockResolvedValue({ ...noMatches, matches: [played] });
    await userEvent.setup().click(within(section).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table", { name: "Partidos observados del jugador" })).toBeVisible();
    expect(getPlayerProfile).toHaveBeenCalledTimes(1);
  });

  it("links each match to its real detail when real matches are enabled, carrying this profile's return", async () => {
    vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["observedPlayers", "matches"] });
    vi.mocked(getPlayerObservedMatches).mockResolvedValue({ ...noMatches, matches: [played, benched] });
    vi.mocked(getPlayerProfile).mockResolvedValue(moha);
    render(<PlayerProfileView playerId={moha.player.id} returnHref={RETURN}
      context={{ seasonId: "s", origin: { kind: "team", id: "team-real-jaen" } }} />);
    const section = await screen.findByRole("region", { name: /Partidos observados/ });
    const links = await within(section).findAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["vs Rayo Majadahonda", "/matches/sofascore-match-1?view=observed&from=player&player=sofascore-player-966303&season=s&playerFrom=team&playerOrigin=team-real-jaen"],
      ["vs Rival sin identificar", "/matches/sofascore-match-2?view=observed&from=player&player=sofascore-player-966303&season=s&playerFrom=team&playerOrigin=team-real-jaen"],
    ]);
    expect(links[0]).not.toHaveAttribute("target");
    expect(getMatch).not.toHaveBeenCalled();
  });

  it.each([
    ["real matches are not enabled", () => vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos", realSections: [] })],
    ["the source cannot be determined", () => vi.mocked(getSource).mockRejectedValue(new ApiRequestError(503, "X", "No"))],
  ])("shows the matches without links when %s, never a synthetic detail", async (_, setSource) => {
    setSource();
    vi.mocked(getPlayerObservedMatches).mockResolvedValue({ ...noMatches, matches: [played] });
    await load();
    const section = await screen.findByRole("region", { name: /Partidos observados/ });
    await within(section).findByText("vs Rayo Majadahonda");
    await vi.waitFor(() => expect(getSource).toHaveBeenCalled());
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(getMatch).not.toHaveBeenCalled();
  });
});
