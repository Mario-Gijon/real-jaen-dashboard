// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createLocalApiEnrichedComments } from "@/server/local-api/enrichment-comments";

const response = {
  enrichment_version: "rules-v1",
  total: 1,
  limit: 25,
  offset: 0,
  items: [{
    comment: {
      source_comment_id: "narrative-1", source_position: 4,
      text: " ¡Gol! Real Jaén 1, Algeciras 0. ", type: "scoreChange", minute: 27,
      period_name: "1ST",
    },
    enrichment: {
      category: "goal",
      attributes: { goal_status: "valid", surface: null, contexts: [] },
    },
  }],
};

describe("local API adapter: enriched narrative comments", () => {
  it("maps the paginated REST response without losing original text or nullable attributes", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(response)));
    const load = createLocalApiEnrichedComments({ baseUrl: "http://127.0.0.1:8001/", fetch });
    await expect(load({ sourceEventId: "16600011", category: "goal", limit: 25, offset: 0 })).resolves.toEqual({
      enrichmentVersion: "rules-v1", total: 1, limit: 25, offset: 0,
      items: [{ id: "narrative-1", position: 4, text: " ¡Gol! Real Jaén 1, Algeciras 0. ",
        originalType: "scoreChange", minute: 27, periodName: "1ST", category: "goal",
        attributes: { goal_status: "valid", surface: null, contexts: [] } }],
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8001/api/v1/enrichment/comments?source_event_id=16600011&category=goal&limit=25&offset=0",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("rejects malformed original records or attributes", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ...response,
      items: [{ ...response.items[0], enrichment: { category: "goal", attributes: { surface: 4 } } }],
    })));
    const load = createLocalApiEnrichedComments({ baseUrl: "http://127.0.0.1:8001", fetch });
    await expect(load({ sourceEventId: "16600011" })).rejects.toThrow("Respuesta no válida");
  });
});
