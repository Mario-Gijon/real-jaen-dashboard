import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LinkedTableRow } from "@/ui/LinkedTableRow";
import Link from "next/link";

it("activates the native link from a row cell and preserves navigation modifiers", () => {
  const click = vi.fn(event => event.preventDefault());
  render(<table><tbody><LinkedTableRow><th><Link href="/matches/m1" onClick={click}>Rival</Link></th><td>2–0</td></LinkedTableRow></tbody></table>);
  fireEvent.click(screen.getByText("2–0"), { ctrlKey: true });
  expect(click).toHaveBeenCalledTimes(1);
  expect(click.mock.calls[0][0].ctrlKey).toBe(true);
  fireEvent.click(screen.getByRole("link"));
  expect(click).toHaveBeenCalledTimes(2);
  screen.getByRole("link").focus();
  expect(screen.getByRole("link")).toHaveFocus();
});
