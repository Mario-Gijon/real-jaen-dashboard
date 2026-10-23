import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiRequestError, getCompetitions, getObservedMatchDetail, getSeasonMatches, getSource, getTeamObservedMatches,
  getTeamObservedPerformance, getTeamSeason,
} from "@/client/api";
import type { ObservedMatch } from "@/contract";
import { HomeView } from "@/features/home/HomeView";
import {
  afterTarget, clubMatches, detailOf, jaen, later, next, NOW, observed, other, postponed, rival, rivalMatches, rivalPerformance,
  rivalPlayed, target,
} from "./real-fixtures";
import { DEMO_SOURCE, REAL_SOURCE } from "../shared/sources";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/client/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/client/api")>(),
  getSource: vi.fn(), getTeamObservedMatches: vi.fn(), getTeamObservedPerformance: vi.fn(), getObservedMatchDetail: vi.fn(),
  getCompetitions: vi.fn(), getSeasonMatches: vi.fn(), getTeamSeason: vi.fn(),
}));

/** xG of each match by id: [home, away]; any other match has its statistics stored without xG. */
const XG: Record<string, [number | null, number | null]> = {
  "sofascore-match-107": [1.56, 0.39], "sofascore-match-108": [2.15, 3.13], "sofascore-match-104": [2.33, 1.74],
  "sofascore-match-103": [1.32, 3.81], "sofascore-match-102": [0, 1.27],
};
const all = [...rivalPlayed, afterTarget];
const algecirasPlayed = observed(201, "2026-10-04T17:00:00Z", "finished", later, other, 6, { home: 0, away: 1 });

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
  vi.mocked(getSource).mockResolvedValue(REAL_SOURCE);
  vi.mocked(getTeamObservedMatches).mockImplementation(async (teamId) =>
    teamId === jaen.id ? clubMatches() : teamId === later.id ? rivalMatches([algecirasPlayed, next], later) : rivalMatches());
  vi.mocked(getTeamObservedPerformance).mockImplementation(async (teamId) =>
    teamId === later.id ? rivalPerformance([algecirasPlayed], later) : rivalPerformance(all));
  vi.mocked(getObservedMatchDetail).mockImplementation(async (id) =>
    detailOf(all.concat(algecirasPlayed).find((m) => m.id === id) as ObservedMatch, XG[id] ?? [null, null]));
});

// Several chained loads (source, calendar, rival, details): more margin than the default under a parallel run.
const WAIT = { timeout: 4000 };
const recent = () => screen.findByRole("list", { name: "Últimos partidos del rival" }, WAIT);
const summary = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling!;

describe("Inicio con la fuente real", () => {
  it("prepares the club's next current match: its rival, its five previous matches and their summary, loading nothing synthetic", async () => {
    render(<HomeView now={NOW} />);
    const list = await recent();
    const header = screen.getByRole("region", { name: "Encuentro de preparación" });
    expect(within(header).getByText("Jornada 9 · 25 oct 2026 · Primera Federación, Grupo 2 · 26/27")).toBeVisible();
    expect(within(header).getByText("Atlético Madrileño").parentElement).toHaveTextContent("Local");
    expect(screen.getByRole("link", { name: "Analizar Atlético Madrileño" })).toHaveAttribute("href", "/teams?team=sofascore-team-24326");
    expect(screen.getByText("Datos reales")).toBeVisible();
    // By date, not by round; the target and the match after it are left out.
    expect(within(list).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(
      ["107", "108", "104", "103", "102"].map((id) => `/matches/sofascore-match-${id}?view=observed&from=home&match=sofascore-match-9`));
    expect(screen.getByRole("region", { name: "Últimos 5 partidos" })).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Últimos 5 partidos" })).getByRole("link", { name: "Ver todos" }))
      .toHaveAttribute("href", "/matches?team=sofascore-team-24326");
    expect(summary("Forma")).toHaveTextContent("0 V · 3 E · 2 D");
    expect(summary("Goles")).toHaveTextContent("9 GF · 11 GC");
    // xG oriented to the rival's side in each match: (0.39 + 2.15 + 1.74 + 1.32 + 1.27) / 5 = 1.374 and (1.56 + 3.13 + 2.33 + 3.81 + 0) / 5.
    expect(await screen.findByText("1,37", {}, WAIT)).toBeVisible();
    expect(screen.getByText("2,17")).toBeVisible();
    expect(getObservedMatchDetail).toHaveBeenCalledTimes(5);
    expect(getCompetitions).not.toHaveBeenCalled();
    expect(getSeasonMatches).not.toHaveBeenCalled();
    expect(getTeamSeason).not.toHaveBeenCalled();
  });

  it("recalculates the rival and its history against a chosen target's date, without later matches", async () => {
    const user = userEvent.setup();
    const view = render(<HomeView now={NOW} />);
    await recent();
    await user.click(screen.getByRole("button", { name: "Cambiar rival" }));
    const options = within(screen.getByRole("region", { name: "Próximos encuentros del Real Jaén" })).getAllByRole("button");
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining("Jornada 9 · Atlético Madrileño"), expect.stringContaining("Jornada 10 · Algeciras CF")]);
    await user.click(options[1]);
    expect(push).toHaveBeenCalledWith("/?match=sofascore-match-10", { scroll: false });
    view.rerender(<HomeView now={NOW} matchId="sofascore-match-10" />);
    expect(await screen.findByRole("link", { name: "Analizar Algeciras CF" }, WAIT)).toBeVisible();
    const list = await recent();
    expect(within(list).getAllByRole("link").map((l) => l.getAttribute("href")))
      .toEqual(["/matches/sofascore-match-201?view=observed&from=home&match=sofascore-match-10"]);
    expect(screen.getByRole("region", { name: "Último partido" })).toBeVisible();
    expect(screen.getByText(/1 de 5: son todos los partidos finalizados del rival antes del encuentro/)).toBeVisible();
  });

  it("never proposes a postponed match, which is said to be still pending without a confirmed date", async () => {
    vi.mocked(getTeamObservedMatches).mockImplementation(async (teamId) =>
      teamId === jaen.id ? clubMatches([postponed, target, next]) : rivalMatches());
    render(<HomeView now={NOW} />);
    await recent();
    expect(screen.getByText("J5 · Gimnàstic de Tarragona: aplazado, pendiente de disputar sin nueva fecha confirmada. No se propone para preparar.")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Encuentro de preparación" })).getByText(/^Jornada 9 ·/)).toBeVisible();
  });

  it("tells the rival's matches still to be played before the target from overdue ones, and says unknown statuses without guessing them", async () => {
    const unknownClub = observed(11, "2026-10-24T11:00:00Z", null, jaen, other, 11);
    vi.mocked(getTeamObservedMatches).mockImplementation(async (teamId) => teamId === jaen.id ? clubMatches([unknownClub, target, next]) : rivalMatches([
      ...rivalPlayed, observed(112, "2026-10-24T17:00:00Z", "scheduled", rival, other, 12),
      observed(113, "2026-10-20T17:00:00Z", null, other, rival, 13), target]));
    render(<HomeView now={NOW} />);
    await recent();
    expect(screen.getByText("Jornada 11 · 24 oct 2026 · Gimnàstic de Tarragona: estado desconocido en la fuente. No se considera para elegir el próximo encuentro.")).toBeVisible();
    expect(within(screen.getByRole("region", { name: "Encuentro de preparación" })).getByText(/^Jornada 9 ·/)).toBeVisible();
    expect(screen.getByText("1 partido del rival previsto antes del encuentro todavía no se ha disputado.")).toBeVisible();
    expect(screen.getByText("1 partido del rival con estado desconocido en la fuente no se considera: no se sabe si se disputó.")).toBeVisible();
    expect(screen.queryByText(/con fecha ya pasada/)).toBeNull();
  });

  it("says when the next scheduled match's date has passed, and when there is no next match", async () => {
    const stale = observed(8, "2026-10-18T16:15:00Z", "scheduled", jaen, other, 8);
    vi.mocked(getTeamObservedMatches).mockImplementation(async (teamId) => teamId === jaen.id ? clubMatches([stale]) : rivalMatches());
    render(<HomeView now={NOW} />);
    expect(await screen.findByText("No hay próximos encuentros vigentes del Real Jaén con fecha confirmada en los datos importados.")).toBeVisible();
    expect(screen.getByText(/Jornada 8 · 18 oct 2026 · Gimnàstic de Tarragona: figura como programado aunque su fecha ya ha pasado/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Cambiar rival" })).toBeDisabled();
    expect(getTeamObservedPerformance).not.toHaveBeenCalled();
  });

  it("does not analyse a rival without an export of its own, nor stand in for it with other data", async () => {
    vi.mocked(getTeamObservedPerformance).mockRejectedValue(new ApiRequestError(404, "NOT_FOUND", "No"));
    render(<HomeView now={NOW} />);
    expect(await screen.findByText("Este rival no tiene exportación propia en la fuente real: no se muestran sus últimos partidos.", {}, WAIT)).toBeVisible();
    expect(screen.queryByRole("list", { name: "Últimos partidos del rival" })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Analizar/ })).toBeNull();
    expect(getObservedMatchDetail).not.toHaveBeenCalled();
  });

  it("tells a failure of the rival's data apart, with a retry", async () => {
    vi.mocked(getTeamObservedMatches).mockImplementationOnce(async () => clubMatches())
      .mockRejectedValueOnce(new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "No"));
    render(<HomeView now={NOW} />);
    expect(await screen.findByText("No se pudieron cargar los partidos del rival.", {}, WAIT)).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await recent()).toBeVisible();
  });

  it("shows fewer matches and what is left out, keeps 0 apart from missing and an xG failure apart from both", async () => {
    const uncounted = rivalPlayed.slice(3);
    vi.mocked(getTeamObservedMatches).mockImplementation(async (teamId) => teamId === jaen.id ? clubMatches() : rivalMatches(
      [...uncounted, observed(109, "2026-10-21T17:00:00Z", "postponed", rival, other, 9), target]));
    vi.mocked(getTeamObservedPerformance).mockResolvedValue(rivalPerformance(uncounted.filter((m) => m.id !== "sofascore-match-108")));
    vi.mocked(getObservedMatchDetail).mockImplementation(async (id) =>
      detailOf(uncounted.find((m) => m.id === id)!, id === "sofascore-match-107" ? [0, null] : "not_stored"));
    render(<HomeView now={NOW} />);
    const list = await recent();
    expect(screen.getByRole("region", { name: "Últimos 3 partidos" })).toBeVisible();
    expect(screen.getByText(/^3 de 5: son todos/)).toBeVisible();
    expect(screen.getByText("1 partido sin resultado contabilizado (marcador no válido o versiones contradictorias) queda fuera de la síntesis.")).toBeVisible();
    expect(screen.getByText("1 partido del rival con fecha ya pasada sigue sin resultado en los datos importados (aplazado o sin actualizar) y no se incluye.")).toBeVisible();
    expect(screen.queryByText(/todavía no se ha/)).toBeNull();
    expect(within(list).getByRole("link", { name: /resultado no contabilizado/ })).toHaveTextContent("Resultado no contabilizado");
    expect(summary("Forma")).toHaveTextContent("0 V · 0 E · 2 D");
    // 107: the rival is away, its xG (away) missing and its rival's (home) 0.
    expect(await screen.findByTitle("Dato no disponible", {}, WAIT)).toHaveTextContent("—");
    expect(screen.getByTitle("Datos disponibles en 1 de 2 partidos")).toHaveTextContent("0,00");
  });

  // A failing detail is an error with a retry, never «no data».
  it("shows an xG failure with its own retry, keeping form and goals", async () => {
    vi.mocked(getObservedMatchDetail).mockRejectedValueOnce(new ApiRequestError(503, "UPSTREAM_UNAVAILABLE", "No"));
    render(<HomeView now={NOW} />);
    expect(await screen.findByText("No se pudo cargar el xG", {}, WAIT)).toBeVisible();
    expect(summary("Forma")).toHaveTextContent("0 V · 3 E · 2 D");
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("1,37", {}, WAIT)).toBeVisible();
  });

  it("says a synthetic season in the URL does not belong to the real source, and the demonstration never asks the real one", async () => {
    const { unmount } = render(<HomeView now={NOW} seasonId="season-demo-2026-27" matchId="sofascore-match-9" />);
    expect(await screen.findByText(/La temporada indicada no corresponde a la fuente real/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver la preparación con datos reales" })).toHaveAttribute("href", "/");
    expect(getTeamObservedMatches).not.toHaveBeenCalled();
    unmount();
    vi.mocked(getSource).mockResolvedValue(DEMO_SOURCE);
    vi.mocked(getCompetitions).mockResolvedValue([]);
    render(<HomeView now={NOW} />);
    await vi.waitFor(() => expect(getCompetitions).toHaveBeenCalled());
    expect(getTeamObservedMatches).not.toHaveBeenCalled();
    expect(getTeamObservedPerformance).not.toHaveBeenCalled();
  });
});
