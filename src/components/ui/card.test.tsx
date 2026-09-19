// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "./card";

describe("Card", () => {
  it("renders as a section by default", () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId("card").tagName).toBe("SECTION");
  });

  it("renders as a different element via `as`", () => {
    render(
      <Card as="article" data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card").tagName).toBe("ARTICLE");
  });

  it("carries the shared surface classes", () => {
    render(<Card data-testid="card">content</Card>);
    const className = screen.getByTestId("card").className;
    for (const token of ["border-border", "bg-card", "shadow-resting"]) {
      expect(className).toContain(token);
    }
  });

  it("defaults to the default size's padding", () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId("card").className).toContain("p-5");
  });

  it("applies the spacious size's padding", () => {
    render(
      <Card size="spacious" data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("p-6");
  });

  it("uses the same outer radius for every size", () => {
    render(<Card data-testid="card">content</Card>);
    expect(screen.getByTestId("card").className).toContain("rounded-4xl");
    expect(screen.getByTestId("card").className).toContain("sm:rounded-5xl");
  });

  it("does not render its own clip-path geometry — corner-shape is global", () => {
    // See the doc comment in card.tsx: globals.css already applies
    // `corner-shape: squircle` to every rounded element, so this component must not
    // reintroduce a second, bespoke geometry system.
    render(<Card data-testid="card">content</Card>);
    const className = screen.getByTestId("card").className;
    expect(className).not.toContain("clip-path");
    expect(className).not.toContain("corner-shape");
    expect(className).not.toContain("--card-clip");
  });

  it("merges a caller className", () => {
    render(
      <Card className="max-w-3xl" data-testid="card">
        content
      </Card>,
    );
    expect(screen.getByTestId("card").className).toContain("max-w-3xl");
  });
});
