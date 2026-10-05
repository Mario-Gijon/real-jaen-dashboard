import type { SeasonStat } from "@/contract";
import { MISSING, seasonText } from "./format";
import css from "./SeasonValue.module.css";

/**
 * A season figure as the analyst must read it: the number; «—» when no match
 * had it; and, when only some matches had it, the number marked with how many,
 * so a partial total never passes for the whole season.
 */
export function SeasonValue({ stat, decimals = 0 }: { stat: SeasonStat; decimals?: number }) {
  if (stat.value === null) {
    return (
      <span className={css.missing} title="Sin datos">
        <span aria-hidden="true">{MISSING}</span>
        <span className={css.sr}>Sin datos</span>
      </span>
    );
  }
  if (stat.coverage === "partial") {
    const note = `Dato de ${stat.matches} de ${stat.of} partidos`;
    return (
      <span className={css.partial} title={note}>
        {seasonText(stat, decimals)}
        <sup aria-hidden="true">*</sup>
        <span className={css.sr}> ({note.toLocaleLowerCase("es")})</span>
      </span>
    );
  }
  return <>{seasonText(stat, decimals)}</>;
}
