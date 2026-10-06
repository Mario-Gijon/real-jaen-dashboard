import Link from "next/link";
import type { PlayerRef } from "@/contract";
import css from "./PlayerLink.module.css";
import { playerHref, type PlayerOrigin } from "./navigation";

/** Navigate using the identified player and the season of the current context. */
export function PlayerLink({ player, seasonId, className = "", origin }: {
  player: PlayerRef; seasonId: string; className?: string; origin?: PlayerOrigin;
}) {
  if (!player.id.trim()) return <span className={className}>{player.name}</span>;
  return <Link className={`${css.link} ${className}`.trim()} prefetch={false}
    href={playerHref(player.id, seasonId, origin)}>
    {player.name}
  </Link>;
}
