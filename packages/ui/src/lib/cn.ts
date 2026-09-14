import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge, taught the design system's type scale (packages/config/tailwind/preset.css).
 *
 * Out of the box it does not know that `text-body` or `text-caption` are font sizes, so it
 * filed them with the text COLOURS and let the later one win. Every primary Button carries
 * `text-text-on-primary` from its variant and `text-body` from its size — the colour was
 * dropped, the label inherited the page's text colour, and in dark mode that put near-white
 * text on the orange fill at 2.5:1 (axe, every primary button in dark mode).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "h3", "body", "body-sm", "caption"] }],
    },
  },
});

/** shadcn's class combiner: conditional classes + Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
