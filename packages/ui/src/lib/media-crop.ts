/**
 * Crop presets and focal points (PRD-OPS-CNT-003, PRD §12 imagery, migration 0036).
 *
 * One original per asset (D-055) and one focal point per asset. Every preset is a ratio,
 * and the image is framed into it with `object-fit: cover` plus `object-position` taken
 * from the focal point — so a third ratio added later needs no re-crop of the library.
 *
 * Why `object-position` percentages keep the subject in frame: at `x%`, the point `x%` of
 * the way across the image is aligned with the point `x%` of the way across the box. The
 * focal point is therefore always inside the visible region, whichever axis is cropped.
 */

/** PRD §12: "Hero ratio 3:2; card 4:3." Nothing else is named, so nothing else ships. */
export const MEDIA_CROP_PRESETS = {
  hero: { label: "Hero", ratioLabel: "3:2", aspectRatio: "3 / 2" },
  card: { label: "Card", ratioLabel: "4:3", aspectRatio: "4 / 3" },
} as const;

export type MediaCropPreset = keyof typeof MEDIA_CROP_PRESETS;

/** Fractions of the image, 0–1 on each axis; (0, 0) is the top-left corner. */
export type FocalPoint = { x: number; y: number };

export const CENTRE_FOCAL_POINT: FocalPoint = { x: 0.5, y: 0.5 };

/**
 * A value the database will accept: finite, within 0–1, and at the three decimal places
 * the `numeric(4,3)` column stores. Anything unusable frames from the centre.
 */
export function clampFocal(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

/** The asset's focal point, tolerant of rows written before 0036 or read without it. */
export function focalPointOf(asset: {
  focal_x?: number | null;
  focal_y?: number | null;
}): FocalPoint {
  return { x: clampFocal(asset.focal_x), y: clampFocal(asset.focal_y) };
}

/** CSS `object-position` for a focal point, e.g. `"25% 80%"`. */
export function focalObjectPosition(point: FocalPoint): string {
  const percent = (value: number) => `${Math.round(clampFocal(value) * 1000) / 10}%`;
  return `${percent(point.x)} ${percent(point.y)}`;
}

/** Moves a focal point by `delta` (a fraction) along one axis, staying inside the image. */
export function nudgeFocal(point: FocalPoint, axis: "x" | "y", delta: number): FocalPoint {
  return { ...point, [axis]: clampFocal(point[axis] + delta) };
}
