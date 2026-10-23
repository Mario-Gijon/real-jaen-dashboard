import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { observedCrest } from "@/features/matches/ObservedMatchList";
import { crestUrlOf } from "@/features/team-crests";
import { TeamCrest } from "@/ui/TeamCrest";

describe("crests of real teams", () => {
  it("come from the local files of the registry, by our team id; any other team has none", () => {
    expect(crestUrlOf("team-real-jaen")).toBe("/real-jaen-crest.png");
    expect(crestUrlOf("sofascore-team-24368")).toBeNull();
    expect(crestUrlOf("sofascore-team-2877")).toBeNull();
    expect(observedCrest({ id: "team-real-jaen", name: "Real Jaén" }).crestUrl).toBe("/real-jaen-crest.png");
    expect(observedCrest({ id: "sofascore-team-24368", name: "UD Ibiza" })).toMatchObject({ crestUrl: null, shortName: "UD Ibiza" });
  });

  it("draw the image, and the neutral shield without one or when it fails to load", () => {
    const { container, rerender } = render(<TeamCrest team={observedCrest({ id: "team-real-jaen", name: "Real Jaén" })} />);
    const image = container.querySelector('[data-crest="image"] img')!;
    expect(image).toHaveAttribute("src", "/real-jaen-crest.png");
    fireEvent.error(image);
    expect(container.querySelector('[data-crest="fallback"]')).toHaveTextContent("RJ");
    rerender(<TeamCrest team={observedCrest({ id: "sofascore-team-24368", name: "UD Ibiza" })} />);
    expect(container.querySelector('[data-crest="image"]')).toBeNull();
    expect(container.querySelector('[data-crest="fallback"]')).toHaveTextContent("UI");
  });
});
