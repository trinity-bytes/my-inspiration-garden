import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// `test.globals` is off (see vite.config.ts), so @testing-library/react's
// own auto-cleanup (which relies on a global `afterEach`) never registers.
// Without this, DOM from one test's render() leaks into the next.
afterEach(() => {
  cleanup();
});
