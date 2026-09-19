// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget } from "./turnstile";

function stubTurnstileScript() {
  let renderCalls = 0;
  window.turnstile = {
    render: vi.fn(() => {
      renderCalls += 1;
      return `widget-${renderCalls}`;
    }),
    remove: vi.fn(),
    reset: vi.fn(),
  };
  return () => renderCalls;
}

function RerenderHarness() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>rerender</button>
      <TurnstileWidget siteKey="test" onVerify={() => {}} onExpire={() => {}} />
      <span data-testid="count">{count}</span>
    </div>
  );
}

describe("TurnstileWidget", () => {
  beforeEach(() => {
    stubTurnstileScript();
  });

  afterEach(() => {
    delete (window as { turnstile?: unknown }).turnstile;
  });

  it("renders exactly once on mount", async () => {
    render(<TurnstileWidget siteKey="test" onVerify={() => {}} />);
    await vi.waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(1));
  });

  // The bug this guards against: the real UploadCard passes `onExpire={() =>
  // setTurnstileToken(null)}`, a fresh function every render. If the mount effect
  // depended on that identity, every unrelated parent re-render (file select, drag
  // hover, stage change) would tear down and re-render the live widget.
  it("does not re-render when the caller passes new onVerify/onExpire identities", async () => {
    const { getByText, getByTestId } = render(<RerenderHarness />);
    await vi.waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(1));

    fireEvent.click(getByText("rerender"));
    fireEvent.click(getByText("rerender"));
    fireEvent.click(getByText("rerender"));
    expect(getByTestId("count").textContent).toBe("3");

    expect(window.turnstile?.render).toHaveBeenCalledTimes(1);
    expect(window.turnstile?.remove).not.toHaveBeenCalled();
  });

  it("re-renders when siteKey actually changes", async () => {
    const { rerender } = render(<TurnstileWidget siteKey="a" onVerify={() => {}} />);
    await vi.waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(1));

    rerender(<TurnstileWidget siteKey="b" onVerify={() => {}} />);
    await vi.waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(2));
    expect(window.turnstile?.remove).toHaveBeenCalledTimes(1);
  });

  it("calls the LATEST onVerify, not the one from mount", async () => {
    let captured: ((token: string) => void) | undefined;
    (window.turnstile!.render as ReturnType<typeof vi.fn>).mockImplementation(
      (_container: HTMLElement, options: { callback: (token: string) => void }) => {
        captured = options.callback;
        return "widget-1";
      },
    );

    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<TurnstileWidget siteKey="test" onVerify={first} />);
    await vi.waitFor(() => expect(captured).toBeDefined());

    // Same siteKey/containerId, so the widget does not remount — but the callback
    // Turnstile itself invokes must still reach the newest prop.
    rerender(<TurnstileWidget siteKey="test" onVerify={second} />);
    captured?.("a-token");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("a-token");
  });

  it("removes the widget on unmount", async () => {
    const { unmount } = render(<TurnstileWidget siteKey="test" onVerify={() => {}} />);
    await vi.waitFor(() => expect(window.turnstile?.render).toHaveBeenCalledTimes(1));

    unmount();
    expect(window.turnstile?.remove).toHaveBeenCalledWith("widget-1");
  });
});
