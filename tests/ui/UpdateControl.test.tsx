import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UpdateJob, UpdateStatus } from "@/contract";
import { OperatorView } from "@/features/updates/OperatorView";
import { UpdateControl } from "@/features/updates/UpdateControl";

const SCOPE = { kind: "pilot" as const, label: "Actualización piloto: calendario de la jornada 1 y un partido", round: 1,
  matchIds: ["sofascore-match-16599363"] };
const job = (over: Partial<UpdateJob> = {}): UpdateJob => ({
  id: "7f1c2a3b-4d5e-4f60-8a1b-2c3d4e5f6a7b", status: "running", phase: "acquiring", cancellable: true, cancelRequested: false,
  published: false, requestedAt: "2026-10-28T17:00:00Z", finishedAt: null, pollAfterSeconds: 1, error: null, result: null, ...over });
const operatorStatus = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  available: true, operator: true, scope: SCOPE, lastPublished: null, activeJob: null, lastJob: null, ...over });

type Handler = (url: string, init?: RequestInit) => { status?: number; body?: unknown };
function api(handler: Handler) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { status = 200, body = null } = handler(String(input), init);
    return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const posts = (fetch: ReturnType<typeof api>, path: string) =>
  fetch.mock.calls.filter(([url, init]) => String(url) === path && init?.method === "POST");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("UpdateControl (top bar)", () => {
  it("is hidden without an operator session or where updates do not exist", async () => {
    for (const status of [{ available: true, operator: false, scope: SCOPE, lastPublished: null },
      { available: false, operator: false, scope: null, lastPublished: null }]) {
      const fetch = api(() => ({ body: status }));
      const { container, unmount } = render(<UpdateControl />);
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("names the pilot scope, and repeated clicks send a single start with one key", async () => {
    let release: () => void = () => {};
    let started = false;
    const fetch = api((url, init) => {
      if (url === "/api/v1/updates" && init?.method === "POST") return { status: 202, body: { job: job(), reused: false } };
      return { body: operatorStatus(started ? { activeJob: job({ pollAfterSeconds: 30 }) } : {}) };
    });
    render(<UpdateControl />);
    const start = await screen.findByRole("button", { name: /Actualizar: Actualización piloto/ });
    expect(start).toHaveTextContent("Actualizar piloto");
    expect(screen.queryByText(/jornada completa|temporada/i)).toBeNull();
    const user = userEvent.setup();
    const gate = new Promise<void>((resolve) => { release = resolve; });
    fetch.mockImplementationOnce(async () => {
      await gate;
      started = true;
      return new Response(JSON.stringify({ job: job({ pollAfterSeconds: 30 }), reused: false }), { status: 202 });
    });
    await user.click(start);
    await user.click(start);
    await act(async () => release());
    expect(await screen.findByRole("button", { name: "Cancelar" })).toBeVisible();
    const sent = posts(fetch, "/api/v1/updates");
    expect(sent).toHaveLength(1);
    expect(new Headers(sent[0][1]!.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getAllByText("Consultando datos…").length).toBeGreaterThan(0);
  });

  it("follows the job to its publication and offers to reload the data", async () => {
    let polls = 0;
    api((url) => {
      if (url.startsWith("/api/v1/updates/7f1c")) {
        polls += 1;
        return { body: polls < 2 ? job({ phase: "publishing", cancellable: false })
          : job({ status: "completed", phase: "finished", published: true, cancellable: false, finishedAt: "2026-10-28T17:02:00Z",
            result: { publishedAt: "2026-10-28T17:02:00Z", reusedBundle: false } }) };
      }
      const done = job({ status: "completed", phase: "finished", published: true, cancellable: false,
        finishedAt: "2026-10-28T17:02:00Z", result: { publishedAt: "2026-10-28T17:02:00Z", reusedBundle: false } });
      return { body: polls < 2 ? operatorStatus({ activeJob: job() })
        : operatorStatus({ lastJob: done, lastPublished: { at: "2026-10-28T17:02:00Z" } }) };
    });
    render(<UpdateControl />);
    expect(await screen.findByRole("button", { name: "Cancelar" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled(), { timeout: 3000 });
    expect(await screen.findByRole("button", { name: "Recargar datos" }, { timeout: 4000 })).toBeVisible();
    expect(screen.getAllByText(/Publicado el 28\/10/).length).toBeGreaterThan(0);
  });
});

describe("OperatorView (/operador)", () => {
  it("asks for the operator key and says what the pilot does and does not update", async () => {
    let operator = false;
    const fetch = api((url, init) => {
      if (url === "/api/v1/updates/session") {
        const ok = JSON.parse(String(init?.body)).key === "the-right-key";
        operator = ok;
        return ok ? { status: 204 } : { status: 401, body: { error: { code: "UNAUTHORIZED", message: "Clave de operador no válida." } } };
      }
      return { body: operator ? operatorStatus() : { available: true, operator: false, scope: SCOPE, lastPublished: null } };
    });
    render(<OperatorView />);
    expect(await screen.findByText(/No actualiza el resto de la jornada ni de la temporada/)).toBeVisible();
    expect(screen.getByRole("link", { name: "un partido" })).toHaveAttribute("href", "/matches/sofascore-match-16599363");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Clave de operador"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Clave de operador no válida.");
    await user.clear(screen.getByLabelText("Clave de operador"));
    await user.type(screen.getByLabelText("Clave de operador"), "the-right-key");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("button", { name: "Actualizar piloto" })).toBeVisible();
    expect(posts(fetch, "/api/v1/updates/session")).toHaveLength(2);
  });

  it("shows a failed update as failed, keeping the previous data, and cancels only while consulting", async () => {
    api(() => ({ body: operatorStatus({ lastJob: job({ status: "failed", phase: "finished", cancellable: false,
      error: { code: "ACQUISITION_FAILED", message: "La consulta al proveedor no se completó o fue rechazada.", retryable: true } }) }) }));
    render(<OperatorView />);
    expect(await screen.findByText(/no se completó o fue rechazada\. Se mantienen los datos anteriores\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Actualizar piloto" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("marks the current step and refuses to cancel once it verifies or publishes", async () => {
    api(() => ({ body: operatorStatus({ activeJob: job({ phase: "verifying", cancellable: false, pollAfterSeconds: 30 }) }) }));
    render(<OperatorView />);
    expect(await screen.findByRole("button", { name: "Ya no se puede cancelar" })).toBeDisabled();
    expect(screen.getByText("Comprobando los datos recibidos")).toHaveAttribute("aria-current", "step");
  });
});
