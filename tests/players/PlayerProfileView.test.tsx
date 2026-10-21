import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getPlayer, getPlayerProfile, getSeasonMatches } from "@/client/api";
import type { PlayerProfile } from "@/contract";
import { PlayerProfileView } from "@/features/players/PlayerProfileView";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getPlayerProfile: vi.fn(), getPlayer: vi.fn(), getSeasonMatches: vi.fn(),
}));

const SCOPE = "Datos personales según la fuente. No indican equipo actual, temporada ni estadísticas.";
const moha: PlayerProfile = {
  player: { id: "sofascore-player-966303", name: "Moha Keita", position: "midfielder",
    birthDate: "1999-09-18", heightCm: 165, preferredFoot: null, country: "Senegal" },
  scope: SCOPE,
  source: { synthetic: false, label: "Datos reales" },
};
const RETURN = "/teams?season=s&team=team-real-jaen&tab=players";
const field = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling!;

beforeEach(() => vi.resetAllMocks());

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
