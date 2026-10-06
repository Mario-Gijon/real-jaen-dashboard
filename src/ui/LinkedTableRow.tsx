"use client";

import type { ComponentPropsWithoutRef } from "react";

/** One native link is the keyboard stop; clicks elsewhere in its row activate it. */
export function LinkedTableRow(props: ComponentPropsWithoutRef<"tr">) {
  return <tr {...props} onClick={event => {
    if ((event.target as Element).closest("a,button,input,select")) return;
    const link = event.currentTarget.querySelector<HTMLAnchorElement>("a[href]");
    link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true,
      ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey }));
  }} onKeyDown={event => {
    if (event.target === event.currentTarget && event.key === "Enter") event.currentTarget.querySelector<HTMLAnchorElement>("a[href]")?.click();
  }} />;
}
