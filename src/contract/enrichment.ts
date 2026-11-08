/** Read-only rule annotations returned for the currently selected Spanish captures. */
export type EnrichmentAttributeValue = string | string[] | null;

export type EnrichedComment = {
  id: string | number;
  position: number;
  text: string;
  originalType: string;
  minute: number | null;
  periodName: string | null;
  category: string | null;
  attributes: Record<string, EnrichmentAttributeValue>;
};

export type EnrichedCommentsPage = {
  enrichmentVersion: string;
  total: number;
  limit: number;
  offset: number;
  items: EnrichedComment[];
};

export type EnrichedCommentsFilter = {
  sourceEventId: string;
  category?: string;
  originalType?: string;
  limit?: number;
  offset?: number;
};
