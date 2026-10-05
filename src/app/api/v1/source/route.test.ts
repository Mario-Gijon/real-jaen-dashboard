// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/v1/source", () => {
  it("says the data are synthetic without naming the source", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ synthetic: true, label: "Datos sintéticos" });
  });

  it("refuses a source that has no adapter", () => {
    vi.stubEnv("DATA_SOURCE", "sofascore");
    expect(() => GET()).toThrow("Fuente de datos no disponible");
  });
});
