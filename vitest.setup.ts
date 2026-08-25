import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll } from "vitest";

beforeAll(() => {
  // jsdom resolves `transform` to "" and does not implement the vendor-prefixed aliases, so
  // vaul's drag maths reads `undefined` on pointer release. Shadow it with an explicit "none".
  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((element: Element, pseudoElement?: string | null) => {
    const style = originalGetComputedStyle(element, pseudoElement ?? undefined);
    if (!style.transform) {
      Object.defineProperty(style, "transform", { value: "none", configurable: true });
    }
    return style;
  }) as typeof window.getComputedStyle;

  // Pointer-capture and scrollIntoView are unimplemented in jsdom but used by Radix/vaul.
  const proto = window.Element.prototype as unknown as Record<string, unknown>;
  proto["hasPointerCapture"] ??= () => false;
  proto["setPointerCapture"] ??= () => {};
  proto["releasePointerCapture"] ??= () => {};
  proto["scrollIntoView"] ??= () => {};

  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
});
