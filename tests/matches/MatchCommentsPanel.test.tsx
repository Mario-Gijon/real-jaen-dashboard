import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEnrichedComments, getMatchComments } from "@/client/api";
import type { EnrichedCommentsPage, MatchComments } from "@/contract";
import { MatchCommentsPanel } from "@/features/matches/MatchCommentsPanel";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getEnrichedComments: vi.fn(),
  getMatchComments: vi.fn(),
}));

const enriched: EnrichedCommentsPage = {
  enrichmentVersion: "rules-v1", total: 1, limit: 25, offset: 0,
  items: [{ id: "comment-1", position: 2, text: "Remate original", originalType: "shotSaved", minute: 12,
    periodName: "1ST", category: "shot", attributes: { surface: "right_foot", area_zone: "inside_area" },
    participants: [{ sourceRole: "player", role: "scorer", normalizerRole: "scorer", sourceId: 597500,
      name: "Delantero", player: { id: "sofascore-player-597500", name: "Delantero", position: null } }] }],
};

const capture = (availability: MatchComments["availability"]): MatchComments => ({
  matchId: "sofascore-match-16600011", availability,
  capturedAt: availability === "not_collected" ? null : "2026-11-03T16:53:19+00:00",
  responseSha256: null,
  lastAttempt: { availability, occurredAt: null, httpStatus: null, errorCode: null },
  comments: availability === "available" ? [
    { id: "last", position: 0, text: "Final del partido", type: "matchEnded", minute: null,
      periodName: null, isHome: null, score: null, incidentId: null, participants: {} },
    { id: "first", position: 1, text: "The full original narrative text remains on screen.", type: "goal",
      minute: 97, periodName: "2ND", isHome: true, score: { home: 3, away: 2 }, incidentId: "incident-1",
      participants: { player: { name: "Jugador", shortName: null, position: null, jerseyNumber: null } } },
  ] : [],
});

beforeEach(() => vi.resetAllMocks());

describe("MatchCommentsPanel", () => {
  it("keeps chronological order, added minutes and comments without a minute", async () => {
    vi.mocked(getMatchComments).mockResolvedValue(capture("available"));
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" seasonId="season-26-27" />);
    const entries = await screen.findAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("97′");
    expect(entries[0]).toHaveTextContent("Segunda parte");
    expect(entries[0]).toHaveTextContent("The full original narrative text remains on screen.");
    expect(entries[0]).toHaveTextContent("Jugador");
    expect(entries.at(-1)).toHaveTextContent("Sin minuto");
    expect(entries.at(-1)).toHaveTextContent("Final del partido");
    expect(screen.getByLabelText("Comentarios narrativos en orden cronológico")).toBeVisible();
  });

  it.each([
    ["not_collected", "Los comentarios narrativos todavía no se han recopilado para este partido."],
    ["empty", "La respuesta guardada es válida y no contiene comentarios narrativos."],
  ] as const)("distinguishes %s from a collected empty response", async (availability, message) => {
    vi.mocked(getMatchComments).mockResolvedValue(capture(availability));
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" seasonId="season-26-27" />);
    expect(await screen.findByText(message)).toBeVisible();
  });

  it("shows rules-v1 labels and lets the analyst filter a match by category and original type", async () => {
    vi.mocked(getMatchComments).mockResolvedValue(capture("available"));
    vi.mocked(getEnrichedComments).mockResolvedValue(enriched);
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" seasonId="season-26-27" />);
    await screen.findByText("The full original narrative text remains on screen.");
    fireEvent.click(screen.getByRole("button", { name: "Clasificación rules-v1" }));
    expect(await screen.findByText("Remate original")).toBeVisible();
    expect(screen.getAllByText("Remates")).toHaveLength(2);
    expect(screen.getByText("Pie derecho")).toBeVisible();
    expect(screen.getByRole("link", { name: "Delantero" })).toHaveAttribute(
      "href", "/players/sofascore-player-597500?season=season-26-27",
    );
    expect(getEnrichedComments).toHaveBeenCalledWith(
      { sourceEventId: "16600011", category: undefined, originalType: undefined, limit: 25, offset: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fireEvent.change(screen.getByLabelText("Categoría"), { target: { value: "shot" } });
    await screen.findByLabelText("Categoría");
    await screen.findByLabelText("Tipo original");
    fireEvent.change(screen.getByLabelText("Tipo original"), { target: { value: "shotSaved" } });
    expect(await screen.findByText("Remate original")).toBeVisible();
    expect(getEnrichedComments).toHaveBeenLastCalledWith(
      { sourceEventId: "16600011", category: "shot", originalType: "shotSaved", limit: 25, offset: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps the classification view available when narrative comments were not collected", async () => {
    vi.mocked(getMatchComments).mockResolvedValue(capture("not_collected"));
    vi.mocked(getEnrichedComments).mockResolvedValue(enriched);
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" seasonId="season-26-27" />);
    expect(await screen.findByText("Los comentarios narrativos todavía no se han recopilado para este partido.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clasificación rules-v1" }));
    expect(await screen.findByText("Remate original")).toBeVisible();
  });
});
