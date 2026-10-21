import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, getCompetitions, getMatch, getObservedMatchDetail, getSource } from "@/client/api";
import type { ObservedMatchDetail, TeamMatchStats } from "@/contract";
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
const SCOPE = "Partido y estadísticas colectivas según la fuente. Un dato que la fuente no da se muestra como «—».";
const detail = (statistics: ObservedMatchDetail["statistics"], match: Partial<ObservedMatchDetail["match"]> = {}): ObservedMatchDetail => ({
  match: { id: "sofascore-match-16599363", kickoff: "2026-08-30T17:15:00Z", status: "finished",
    competition: "Primera Federacion, Group 2", season: "26/27", round: 1,
    home: { id: "sofascore-team-135672", name: "CE Europa" }, away: { id: "team-real-jaen", name: "Real Jaén" },
    score: { home: 0, away: 3 }, ...match },
  statistics, scope: SCOPE, source: { synthetic: false, label: "Datos reales" },
});
const stored = detail({ state: "stored", fetchedAt: "2026-10-21T12:07:30+00:00",
  home: stats({ possession: 46, xg: 1.81, shots: 15, yellowCards: 0 }), away: stats({ possession: 54, xg: 1.6, shots: 13, yellowCards: 1 }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos y reales", realSections: ["matches"] });
  vi.mocked(getObservedMatchDetail).mockResolvedValue(stored);
});

const metric = (label: string) => screen.getByText(label, { selector: "dt" }).parentElement!;

describe("Real match detail", () => {
  it("shows the header and team stats from the source, unknown values as «—», with provenance", async () => {
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByRole("heading", { level: 1, name: "CE Europa contra Real Jaén" })).toBeInTheDocument();
    expect(getObservedMatchDetail).toHaveBeenCalledWith("sofascore-match-16599363", expect.anything());
    expect(screen.getByText("Primera Federacion, Group 2 · 26/27")).toBeVisible();
    expect(screen.getByText("Jornada 1")).toBeVisible();
    expect(screen.getByText("0 – 3")).toBeVisible();
    expect(screen.getByText("Finalizado")).toBeVisible();
    expect(screen.getByText("Datos reales")).toBeVisible();
    expect(screen.getByText(SCOPE)).toBeVisible();
    expect(within(metric("Posesión")).getAllByRole("definition").slice(0, 2).map((d) => d.textContent)).toEqual(["46 %", "54 %"]);
    expect(within(metric("xG")).getAllByRole("definition").slice(0, 2).map((d) => d.textContent)).toEqual(["1,81", "1,60"]);
    expect(within(metric("Amarillas")).getAllByRole("definition").slice(0, 2).map((d) => d.textContent)).toEqual(["0", "1"]);
    // Red cards the source does not give stay unknown, never 0.
    expect(within(metric("Rojas")).getAllByRole("definition").slice(0, 2).map((d) => d.textContent)).toEqual(["—", "—"]);
    expect(screen.getByText(/Obtenidas de la fuente el 21 oct 2026/)).toBeVisible();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(getMatch).not.toHaveBeenCalled();
    expect(getCompetitions).not.toHaveBeenCalled();
  });

  it("distinguishes statistics not stored, stored empty and a failed query", async () => {
    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ state: "not_stored", fetchedAt: null },
      { status: "scheduled", score: null, kickoff: "2026-11-07T15:30:00Z" }));
    const view = render(<RealMatchDetailView matchId="sofascore-match-16599386" />);
    expect(await screen.findByText("La fuente no tiene estadísticas guardadas de este partido.")).toBeVisible();
    expect(screen.getByText("Programado")).toBeVisible();
    expect(screen.queryByText("0 – 0")).toBeNull();
    view.unmount();

    vi.mocked(getObservedMatchDetail).mockResolvedValue(detail({ state: "empty", fetchedAt: "2026-10-21T12:07:30+00:00" }));
    const emptyView = render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByText("La fuente guardó las estadísticas de este partido sin contenido.")).toBeVisible();
    emptyView.unmount();

    vi.mocked(getObservedMatchDetail).mockResolvedValueOnce(detail({ state: "error", fetchedAt: null }));
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    const section = await screen.findByRole("region", { name: "Estadísticas de equipo" });
    expect(within(section).getByRole("alert")).toHaveTextContent("No se pudieron cargar las estadísticas de este partido.");
    expect(screen.getByText("0 – 3")).toBeVisible();
    vi.mocked(getObservedMatchDetail).mockResolvedValue(stored);
    await userEvent.setup().click(within(section).getByRole("button", { name: "Reintentar" }));
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

  it("asks nothing when the real matches are not enabled", async () => {
    vi.mocked(getSource).mockResolvedValue({ synthetic: true, label: "Datos sintéticos", realSections: [] });
    render(<RealMatchDetailView matchId="sofascore-match-16599363" />);
    expect(await screen.findByRole("heading", { name: "La fuente real de partidos no está activada" })).toBeVisible();
    expect(getObservedMatchDetail).not.toHaveBeenCalled();
    expect(getMatch).not.toHaveBeenCalled();
  });
});
