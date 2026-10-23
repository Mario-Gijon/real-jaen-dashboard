/** Moves only the history viewport, never the page. */
export function revealMatch(history: HTMLElement | null, matchId: string) {
  const row = history && [...history.querySelectorAll<HTMLElement>("[data-match-id]")]
    .find(element => element.dataset.matchId === matchId);
  if (!history || !row || history.scrollHeight <= history.clientHeight) return;
  const bounds = history.getBoundingClientRect();
  const rowBounds = row.getBoundingClientRect();
  const visibleTop = Math.max(bounds.top, 0);
  const visibleBottom = Math.min(bounds.bottom, document.documentElement.clientHeight);
  const top = visibleBottom > visibleTop ? visibleTop : bounds.top;
  const bottom = visibleBottom > visibleTop ? visibleBottom : bounds.bottom;
  if (rowBounds.top < top) history.scrollTop += rowBounds.top - top;
  else if (rowBounds.bottom > bottom) history.scrollTop += rowBounds.bottom - bottom;
}
