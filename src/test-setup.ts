// Registers jest-dom's matchers (toBeInTheDocument, toBeDisabled, ...) on Vitest's
// `expect`. Harmless for test files that run under the `node` environment and never
// touch the DOM — the matchers simply go unused there.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library does not auto-unmount between tests outside a Jest-globals
// setup. Without this, one test's rendered DOM is still attached when the next test's
// `render()` runs, and a query like `getByTestId` starts throwing "found multiple
// elements" for reasons that have nothing to do with the component under test.
afterEach(() => {
  cleanup();
});
