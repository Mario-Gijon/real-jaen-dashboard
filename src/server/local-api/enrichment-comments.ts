/** Typed adapter for the read-only enrichment endpoint. */
import type { EnrichedComment, EnrichedCommentsFilter, EnrichedCommentsPage, EnrichmentAttributeValue } from "@/contract";
import { baseOf, getJson, type Options } from "./http";
import { count, invalid, isRecord, optionalText } from "./validation";

function parseAttributes(value: unknown, field: string): Record<string, EnrichmentAttributeValue> {
  if (!isRecord(value)) throw invalid(field);
  const attributes: Record<string, EnrichmentAttributeValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === "string") {
      attributes[key] = item;
    } else if (Array.isArray(item) && item.every((entry) => typeof entry === "string")) {
      attributes[key] = item;
    } else {
      throw invalid(`${field}.${key}`);
    }
  }
  return attributes;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw invalid(field);
  return value;
}

function parseComment(value: unknown, index: number): EnrichedComment {
  const field = `items[${index}]`;
  if (!isRecord(value) || !isRecord(value.comment) || !isRecord(value.enrichment)) throw invalid(field);
  const comment = value.comment;
  const enrichment = value.enrichment;
  const id = comment.source_comment_id;
  if (!(typeof id === "string" && id.trim()) && !(typeof id === "number" && Number.isSafeInteger(id) && id >= 0)) {
    throw invalid(`${field}.comment.source_comment_id`);
  }
  const text = requiredText(comment.text, `${field}.comment.text`);
  const originalType = requiredText(comment.type, `${field}.comment.type`);
  const category = optionalText(enrichment.category, `${field}.enrichment.category`);
  const minute = comment.minute === null ? null : count(comment.minute, `${field}.comment.minute`);
  return {
    id,
    position: count(comment.source_position, `${field}.comment.source_position`),
    text,
    originalType,
    minute,
    periodName: optionalText(comment.period_name, `${field}.comment.period_name`),
    category,
    attributes: parseAttributes(enrichment.attributes, `${field}.enrichment.attributes`),
  };
}

function parsePage(value: unknown): EnrichedCommentsPage {
  if (!isRecord(value) || !Array.isArray(value.items)) throw invalid("enrichment response");
  const enrichmentVersion = optionalText(value.enrichment_version, "enrichment_version");
  if (!enrichmentVersion) throw invalid("enrichment_version");
  const total = count(value.total, "total");
  const limit = count(value.limit, "limit");
  const offset = count(value.offset, "offset");
  if (limit < 1 || limit > 100 || value.items.length > limit) throw invalid("pagination");
  return { enrichmentVersion, total, limit, offset, items: value.items.map(parseComment) };
}

export function createLocalApiEnrichedComments(options: Options) {
  return async (filter: EnrichedCommentsFilter): Promise<EnrichedCommentsPage | null> => {
    if (!/^[1-9]\d*$/.test(filter.sourceEventId)) throw invalid("sourceEventId");
    const params = new URLSearchParams({ source_event_id: filter.sourceEventId });
    if (filter.category) params.set("category", filter.category);
    if (filter.originalType) params.set("original_type", filter.originalType);
    if (filter.limit !== undefined) params.set("limit", String(filter.limit));
    if (filter.offset !== undefined) params.set("offset", String(filter.offset));
    const body = await getJson(options, `${baseOf(options)}/api/v1/enrichment/comments?${params}`);
    return body === null ? null : parsePage(body);
  };
}
