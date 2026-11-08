import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAllEnrichedComments } from "@/client/api";
import type { EnrichedComment, EnrichedCommentsPage, PlayerRef } from "@/contract";
import { MatchCommentsPanel } from "@/features/matches/MatchCommentsPanel";

vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getAllEnrichedComments: vi.fn(),
}));

const participant = (id: string, name: string, role: string) => ({
  sourceRole: "player", role, normalizerRole: role, sourceId: Number(id.split("-").at(-1)), name,
  player: { id, name, position: null },
});

function event(overrides: Partial<EnrichedComment> & Pick<EnrichedComment, "id" | "position" | "text" | "category">): EnrichedComment {
  return {
    captureId: 31, originalType: "scoreChange", minute: 24, periodName: "1ST", isHome: true,
    score: { home: 1, away: 0 }, attributes: {}, participants: [], ...overrides,
  };
}

function page(items: EnrichedComment[]): EnrichedCommentsPage {
  return { enrichmentVersion: "rules-v1", total: items.length, limit: items.length || 1, offset: 0, items };
}

beforeEach(() => vi.resetAllMocks());

describe("MatchCommentsPanel unified events", () => {
  it("shows every event in one chronological list without pages or technical source codes", async () => {
    const items = Array.from({ length: 121 }, (_, index) => event({
      id: `event-${index}`, position: index, text: `Narración ${index}`, category: "match_flow",
      originalType: index === 0 ? "matchEnded" : "matchStarted", minute: index,
      periodName: index % 2 ? "2ND" : "1ST", isHome: null, score: null,
    }));
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page(items));
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" homeName="Real Jaén" awayName="Algeciras CF" />);

    const list = await screen.findByRole("list", { name: "Eventos en orden cronológico" });
    const rows = Array.from(list.children) as HTMLLIElement[];
    expect(rows).toHaveLength(121);
    expect(rows[0]).toHaveTextContent("Narración 120");
    expect(rows.at(-1)).toHaveTextContent("Final del partido");
    expect(screen.getByText("120′")).toBeVisible();
    expect(screen.queryByText("Primera parte", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Segunda parte", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /más antiguos|más recientes/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/mostrando \d+ de \d+/i)).not.toBeInTheDocument();
    expect(screen.queryByText("rules-v1")).not.toBeInTheDocument();
    expect(screen.queryByText("matchEnded")).not.toBeInTheDocument();
    expect(screen.getByText("Final del partido")).toBeVisible();
    expect(screen.getByLabelText("Tipo de evento")).toBeVisible();
    expect(screen.getByLabelText("Jugador")).toBeVisible();
    expect(screen.getByLabelText("Equipo")).toBeVisible();
  });

  it("keeps separate periods internally when two events share the same displayed minute", async () => {
    const items = [
      event({ id: "first-half", position: 1, minute: 45, periodName: "1ST", text: "Gol de Primera.", category: "goal" }),
      event({ id: "second-half", position: 2, minute: 45, periodName: "2ND", text: "Gol de Segunda.", category: "goal" }),
    ];
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page(items));
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" />);
    const list = await screen.findByRole("list", { name: "Eventos en orden cronológico" });
    const rows = Array.from(list.children) as HTMLLIElement[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Gol de Segunda.");
    expect(rows[1]).toHaveTextContent("Gol de Primera.");
    expect(screen.getAllByText("45′")).toHaveLength(2);
    expect(screen.queryByText("Primera parte", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Segunda parte", { exact: true })).not.toBeInTheDocument();
  });

  it("combines event, structured player, and event-side team filters and links matched names in prose", async () => {
    const scorer = participant("sofascore-player-597500", "Delantero", "scorer");
    const assistant = participant("sofascore-player-597501", "Asistente", "assistant");
    const items = [
      event({ id: "goal-home", position: 4, text: "¡Gol de Delantero! Asistencia de Asistente.", category: "goal",
        attributes: { goal_status: "valid", surface: "right_foot", goal_kind: "ordinary", contexts: ["after_corner"] },
        participants: [scorer, assistant] }),
      event({ id: "shot-away", position: 3, text: "Remate de Delantero.", category: "shot", isHome: false,
        participants: [scorer], score: { home: 1, away: 0 } }),
      event({ id: "goal-away", position: 2, text: "Gol de Delantero para el visitante.", category: "goal", isHome: false,
        participants: [scorer], score: { home: 1, away: 1 } }),
    ];
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page(items));
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" homeName="Real Jaén" awayName="Algeciras CF"
      profileOrigin={{ kind: "observedMatch", id: "sofascore-match-16600011" }} />);

    fireEvent.change(await screen.findByLabelText("Tipo de evento"), { target: { value: "goal" } });
    fireEvent.change(screen.getByLabelText("Jugador"), { target: { value: "sofascore-player-597500" } });
    fireEvent.change(screen.getByLabelText("Equipo"), { target: { value: "home" } });

    const list = screen.getByRole("list", { name: "Eventos en orden cronológico" });
    const rows = Array.from(list.children) as HTMLLIElement[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("¡Gol de Delantero! Asistencia de Asistente.");
    expect(within(rows[0]).getByRole("link", { name: "Delantero" })).toHaveAttribute(
      "href", "/players/sofascore-player-597500?view=profile&from=observedMatch&origin=sofascore-match-16600011",
    );
    expect(within(rows[0]).getByRole("link", { name: "Asistente" })).toBeVisible();
    expect(rows[0]).toHaveTextContent("Gol en jugada");
    expect(rows[0]).toHaveTextContent("Pie derecho");
    expect(rows[0]).toHaveTextContent("Tras córner");
    expect(rows[0]).toHaveTextContent("Marcador 1–0");
    expect(screen.queryByText("scoreChange")).not.toBeInTheDocument();
    expect(screen.queryByText("scorer")).not.toBeInTheDocument();
    expect(screen.queryByText("assistant")).not.toBeInTheDocument();
  });

  it("leaves ambiguous names and participants without IDs as plain text and omits empty attributes", async () => {
    const item = event({ id: "ambiguous", position: 1, category: "foul", text: "Falta de Juan Pérez sobre Juan.",
      attributes: { infraction_type: "foul", unknown_internal_field: "internal_code" },
      participants: [
        participant("sofascore-player-1", "Juan", "foul_committer"),
        participant("sofascore-player-2", "Juan", "foul_recipient"),
        { sourceRole: "player", role: null, normalizerRole: null, sourceId: null, name: "Juan Pérez", player: null },
      ] });
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600011" />);
    const row = await screen.findByText("Falta de Juan Pérez sobre Juan.");
    expect(row.querySelectorAll("a")).toHaveLength(0);
    expect(row).toHaveTextContent("Falta de Juan Pérez sobre Juan.");
    expect(screen.getByText("Infracción")).toBeVisible();
    expect(screen.queryByText("unknown_internal_field")).not.toBeInTheDocument();
    expect(screen.queryByText("internal_code")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Juan (ID 1)" })).toBeVisible();
  });

  it("links SofaScore's shortened Cheikh Thiam mention and filters all his structured events", async () => {
    const cheikh = participant("sofascore-player-2137657", "Cheikh Tidiane Thiam", "foul_committer");
    const roster: PlayerRef[] = [{ id: "sofascore-player-2137657", name: "Cheikh Tidiane Thiam", position: null }];
    const items = [
      event({ id: "handball-88", position: 3, minute: 88, originalType: "freeKickLost", category: "foul",
        text: "Mano de Cheikh Thiam (Villarreal II).", participants: [cheikh] }),
      event({ id: "shot-78", position: 2, minute: 78, originalType: "shotOffTarget", category: "shot",
        text: "Disparo que sale desviado de Cheikh Thiam (Villarreal II).", participants: [cheikh] }),
      event({ id: "shot-50", position: 1, minute: 50, originalType: "shotBlocked", category: "shot",
        text: "Remate rechazado de Cheikh Thiam (Villarreal II).", participants: [cheikh] }),
    ];
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page(items));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={roster}
      profileOrigin={{ kind: "observedMatch", id: "sofascore-match-16600019" }} />);

    const links = await screen.findAllByRole("link", { name: "Cheikh Thiam" });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/players/sofascore-player-2137657?view=profile&from=observedMatch&origin=sofascore-match-16600019");
    fireEvent.change(screen.getByLabelText("Jugador"), { target: { value: "sofascore-player-2137657" } });
    expect(screen.getByRole("list", { name: "Eventos en orden cronológico" }).children).toHaveLength(3);
    expect(screen.getByRole("option", { name: "Cheikh Tidiane Thiam" })).toBeVisible();
  });

  it("resolves the explicit Edu alias to Eduardo Espiau and includes its event in the player filter", async () => {
    const item = event({ id: "edu-goal", position: 1, category: "goal", text: "¡Gol de Edu Espiau!",
      participants: [{ sourceRole: "player", role: "scorer", normalizerRole: "player", sourceId: null,
        name: "Edu Espiau", player: null }] });
    const eduardo: PlayerRef = { id: "sofascore-player-184816", name: "Eduardo Espiau", position: null };
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[eduardo]}
      profileOrigin={{ kind: "observedMatch", id: "sofascore-match-16600019" }} />);

    const link = await screen.findByRole("link", { name: "Edu Espiau" });
    expect(link).toHaveAttribute("href",
      "/players/sofascore-player-184816?view=profile&from=observedMatch&origin=sofascore-match-16600019");
    expect(screen.getByRole("option", { name: "Eduardo Espiau" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Jugador"), { target: { value: eduardo.id } });
    const rows = screen.getByRole("list", { name: "Eventos en orden cronológico" }).children;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("¡Gol de Edu Espiau!");
  });

  it("does not equate a different given name such as Fernán with Fernando", async () => {
    const item = event({ id: "fernan-foul", position: 1, category: "foul", text: "Falta de Fernán Pérez." });
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[
      { id: "sofascore-player-32001", name: "Fernando Pérez", position: null },
    ]} />);

    const text = await screen.findByText("Falta de Fernán Pérez.");
    expect(text.querySelector("a")).toBeNull();
    expect(screen.queryByRole("option", { name: "Fernando Pérez" })).not.toBeInTheDocument();
  });

  it("leaves an explicit alias unlinked when multiple roster players share it", async () => {
    const item = event({ id: "ambiguous-edu", position: 1, category: "goal", text: "Gol de Edu Espiau." });
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[
      { id: "sofascore-player-41001", name: "Eduardo Espiau", position: null },
      { id: "sofascore-player-41002", name: "Eduardo María Espiau", position: null },
    ]} />);

    const text = await screen.findByText("Gol de Edu Espiau.");
    expect(text.querySelector("a")).toBeNull();
    expect(screen.queryByRole("option", { name: "Eduardo Espiau" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Eduardo María Espiau" })).not.toBeInTheDocument();
  });

  it("does not apply a roster alias when it conflicts with another structured event identity", async () => {
    const item = event({ id: "conflicting-edu", position: 1, category: "goal", text: "Gol de Edu Espiau.",
      participants: [participant("sofascore-player-41099", "Eduardo Espiau", "assistant")] });
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[
      { id: "sofascore-player-41001", name: "Eduardo Espiau", position: null },
    ]} />);

    const text = await screen.findByText("Gol de Edu Espiau.");
    expect(text.querySelector("a")).toBeNull();
    expect(screen.getByRole("option", { name: "Eduardo Espiau" })).toHaveValue("sofascore-player-41099");
  });

  it("resolves a missing participant ID only from one matching roster player", async () => {
    const item = event({ id: "lineup-resolved", position: 1, text: "Mano de Cheikh Thiam.", category: "foul",
      participants: [{ sourceRole: "player", role: "foul_committer", normalizerRole: "player", sourceId: null,
        name: "Cheikh Thiam", player: null }] });
    const player: PlayerRef = { id: "sofascore-player-2137657", name: "Cheikh Tidiane Thiam", position: null };
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    const view = render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[player]}
      profileOrigin={{ kind: "observedMatch", id: "sofascore-match-16600019" }} />);
    expect(await screen.findByRole("link", { name: "Cheikh Thiam" })).toHaveAttribute("href",
      "/players/sofascore-player-2137657?view=profile&from=observedMatch&origin=sofascore-match-16600019");
    expect(screen.getByRole("option", { name: "Cheikh Tidiane Thiam" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Jugador"), { target: { value: player.id } });
    expect(screen.getByRole("list", { name: "Eventos en orden cronológico" }).children).toHaveLength(1);
    view.unmount();

    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([{ ...item, participants: [] }]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[player,
      { id: "sofascore-player-999", name: "Cheikh Thiam", position: null }]}
      profileOrigin={{ kind: "observedMatch", id: "sofascore-match-16600019" }} />);
    expect(await screen.findByText("Mano de Cheikh Thiam.")).toBeVisible();
    expect(screen.getByText("Mano de Cheikh Thiam.").querySelector("a")).toBeNull();
    expect(screen.queryByRole("option", { name: "Cheikh Tidiane Thiam" })).not.toBeInTheDocument();
  });

  it("does not match a roster name inside a longer word", async () => {
    const item = event({ id: "not-a-name", position: 1, text: "Remate desviado de Óscar Ureñazo.", category: "shot" });
    vi.mocked(getAllEnrichedComments).mockResolvedValue(page([item]));
    render(<MatchCommentsPanel matchId="sofascore-match-16600019" rosterPlayers={[
      { id: "sofascore-player-1134431", name: "Oscar Ureña", position: null },
    ]} profileOrigin={{ kind: "observedMatch", id: "sofascore-match-16600019" }} />);
    const text = await screen.findByText("Remate desviado de Óscar Ureñazo.");
    expect(text.querySelector("a")).toBeNull();
    expect(screen.queryByRole("option", { name: "Oscar Ureña" })).not.toBeInTheDocument();
  });

  it("does not request a real event for local or synthetic match IDs", () => {
    render(<MatchCommentsPanel matchId="match-demo-1" />);
    expect(screen.getByText("La cronología de eventos no está disponible para este partido.")).toBeVisible();
    expect(getAllEnrichedComments).not.toHaveBeenCalled();
  });
});
