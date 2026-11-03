import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMatchComments } from "@/client/api";
import type { MatchComments } from "@/contract";
import { MatchCommentsPanel } from "@/features/matches/MatchCommentsPanel";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getMatchComments: vi.fn(),
}));

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
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" />);
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
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" />);
    expect(await screen.findByText(message)).toBeVisible();
  });
});
