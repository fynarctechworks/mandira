"use client";

import {
  CENTRE_FOCAL_POINT,
  MEDIA_CROP_PRESETS,
  clampFocal,
  focalObjectPosition,
  focalPointOf,
  nudgeFocal,
  type FocalPoint,
  type MediaCropPreset,
} from "@mandhira/ui";
import { Button } from "@mandhira/ui/components/ui/button";
import { Input } from "@mandhira/ui/components/ui/input";
import { Label } from "@mandhira/ui/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent, type PointerEvent } from "react";

import { setMediaFocalPoint } from "@/app/(ops)/media/actions";

/**
 * Where the subject of an image is (PRD-OPS-CNT-003, migration 0036).
 *
 * Three ways to set the same point, because a drag-only control is a control some
 * operators cannot use (WCAG 2.2 SC 2.5.7): click or drag on the image; focus the marker
 * and use the arrow keys (Shift for bigger steps); or type the percentages.
 *
 * Nothing is saved until Save is pressed — moving the marker is a preview, not an edit.
 */
export function MediaFocalEditor({
  id,
  src,
  alt,
  initial,
}: {
  id: string;
  src: string;
  alt: string;
  initial: { x: number | null; y: number | null };
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<FocalPoint>(() =>
    focalPointOf({ focal_x: initial.x, focal_y: initial.y }),
  );
  const [point, setPoint] = useState<FocalPoint>(saved);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "problem">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const dirty = point.x !== saved.x || point.y !== saved.y;
  const percent = (value: number) => Math.round(value * 1000) / 10;

  function move(next: FocalPoint) {
    setPoint(next);
    if (status !== "saving") setStatus("idle");
  }

  function fromPointer(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    move({
      x: clampFocal((event.clientX - box.left) / box.width),
      y: clampFocal((event.clientY - box.top) / box.height),
    });
  }

  function onMarkerKey(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [axis: "x" | "y", delta: number]> = {
      ArrowLeft: ["x", -step],
      ArrowRight: ["x", step],
      ArrowUp: ["y", -step],
      ArrowDown: ["y", step],
    };
    const found = moves[event.key];
    if (!found) return;
    event.preventDefault();
    move(nudgeFocal(point, found[0], found[1]));
  }

  async function save() {
    setStatus("saving");
    setProblem(null);

    const result = await setMediaFocalPoint({ id, focal_x: point.x, focal_y: point.y });
    if (!result.ok) {
      setStatus("problem");
      setProblem(result.error.message);
      return;
    }

    setSaved({ x: result.data.focal_x, y: result.data.focal_y });
    setStatus("saved");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="focal-heading">
        <h2 id="focal-heading" className="text-h3">
          Focal point
        </h2>
        <p id="focal-help" className="max-w-2xl text-body-sm text-text-secondary">
          Put the marker on what matters in the picture — the gopuram, the entrance, the deity
          board. Every crop keeps that point in view. Click or drag on the image, or select the
          marker and use the arrow keys (hold Shift for bigger steps).
        </p>

        <div
          className="relative w-full max-w-2xl cursor-crosshair touch-none select-none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            fromPointer(event);
          }}
          onPointerMove={(event) => {
            if (dragging) fromPointer(event);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Ops-only preview behind auth; next/image adds nothing */}
          <img src={src} alt={alt} className="block h-auto w-full rounded-card" draggable={false} />
          <button
            type="button"
            aria-label={`Focal point: ${percent(point.x)}% from the left, ${percent(point.y)}% from the top`}
            aria-describedby="focal-help"
            onKeyDown={onMarkerKey}
            // The container handles the pointer; the button is the keyboard handle.
            onPointerDown={(event) => event.stopPropagation()}
            className="focus-ring absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
          >
            <span
              aria-hidden="true"
              className="block size-6 rounded-full border-[3px] border-white bg-brand-primary shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
            />
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {(["x", "y"] as const).map((axis) => (
            <div key={axis} className="flex flex-col gap-1">
              <Label htmlFor={`focal-${axis}`} className="text-body-sm font-medium">
                {axis === "x" ? "From the left (%)" : "From the top (%)"}
              </Label>
              <Input
                id={`focal-${axis}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={1}
                value={percent(point[axis])}
                onChange={(event) => {
                  const value = Number.parseFloat(event.target.value);
                  if (Number.isFinite(value)) move({ ...point, [axis]: clampFocal(value / 100) });
                }}
                className="min-h-11 w-28 text-body"
              />
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            className="min-h-11 px-4 text-body-sm"
            onClick={() => move(CENTRE_FOCAL_POINT)}
          >
            Centre
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="presets-heading">
        <h2 id="presets-heading" className="text-h3">
          How travelers will see it
        </h2>
        <ul className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {(Object.keys(MEDIA_CROP_PRESETS) as MediaCropPreset[]).map((key) => {
            const preset = MEDIA_CROP_PRESETS[key];
            return (
              <li key={key}>
                <figure className="flex flex-col gap-1">
                  <div
                    className="w-full overflow-hidden rounded-card border border-border-subtle"
                    style={{ aspectRatio: preset.aspectRatio }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Ops-only preview behind auth */}
                    <img
                      src={src}
                      alt=""
                      className="size-full object-cover"
                      style={{ objectPosition: focalObjectPosition(point) }}
                    />
                  </div>
                  <figcaption className="text-body-sm">
                    {preset.label} · {preset.ratioLabel}
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        {status === "problem" && problem ? (
          <p role="alert" className="text-body-sm text-status-tight">
            {problem}
          </p>
        ) : null}
        <p role="status" className="text-body-sm text-text-secondary">
          {status === "saved" && !dirty
            ? "Framing saved. Travelers see it the next time the image loads."
            : dirty
              ? "Not saved yet."
              : ""}
        </p>
        <div>
          <Button
            type="button"
            className="min-h-11 px-4 text-body-sm"
            disabled={!dirty || status === "saving"}
            onClick={() => void save()}
          >
            {status === "saving" ? "Saving…" : "Save framing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
