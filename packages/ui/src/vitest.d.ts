/// <reference types="vitest/globals" />
// Registers the jest-dom matcher types (toBeInTheDocument, toBeVisible, ...) on Vitest's
// Assertion interface. The runtime counterpart is imported in the root vitest.setup.ts.
import "@testing-library/jest-dom/vitest";
