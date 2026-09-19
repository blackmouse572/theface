// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Find out</Button>);
    expect(screen.getByRole("button", { name: "Find out" })).toBeInTheDocument();
  });

  it("defaults to type=button, so it never submits a form by accident", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("respects an explicit type", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("defaults to the primary variant and md size", () => {
    render(<Button>Default</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("h-11");
  });

  it.each(["primary", "outline", "ghost", "inverse"] as const)(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>X</Button>);
      expect(screen.getByRole("button")).toBeInTheDocument();
    },
  );

  it.each(["sm", "md", "icon"] as const)("renders the %s size", (size) => {
    render(<Button size={size}>X</Button>);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("merges a caller className without losing the base classes", () => {
    render(<Button className="mt-4">X</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("mt-4");
    expect(button.className).toContain("rounded-full");
  });

  it("lets tailwind-merge resolve a conflicting utility in the caller's favour", () => {
    render(<Button className="px-2">X</Button>);
    expect(screen.getByRole("button").className).toContain("px-2");
    expect(screen.getByRole("button").className).not.toMatch(/(?<!\S)px-6(?!\S)/);
  });

  describe("disabled", () => {
    it("disables on the disabled prop", () => {
      render(<Button disabled>X</Button>);
      expect(screen.getByRole("button")).toBeDisabled();
    });

    it("does not fire onClick while disabled", async () => {
      const onClick = vi.fn();
      render(
        <Button disabled onClick={onClick}>
          X
        </Button>,
      );
      screen.getByRole("button").click();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("loading", () => {
    it("disables the button and marks it busy", () => {
      render(<Button loading>Find out</Button>);
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("aria-busy", "true");
    });

    it("keeps the label rather than replacing it — width must not jump", () => {
      render(<Button loading>Find out</Button>);
      expect(screen.getByText("Find out")).toBeInTheDocument();
    });

    it("shows a status role for the spinner", () => {
      render(<Button loading>Find out</Button>);
      expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    });

    it("stays disabled if the caller also passes disabled", () => {
      render(
        <Button loading disabled={false}>
          X
        </Button>,
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  // The instruction this session gave was explicit: no press animation on buttons.
  // This asserts the primitive itself carries none, so nobody reintroduces it here.
  it("has no active/press transform in its base classes", () => {
    render(<Button>X</Button>);
    const className = screen.getByRole("button").className;
    expect(className).not.toMatch(/active:(scale|translate)/);
  });
});
