"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@mandhira/ui";
import { useState } from "react";
import { setRouteStops } from "@/app/(ops)/routes/actions";

export type RouteStop = { place_id: string; label: string; is_rest_point: boolean };

/**
 * Ordered stops along a route (OPS-EDIT-04).
 *
 * Order is the point: the engine walks a route stop by stop, so a list in the wrong
 * sequence produces a plan that doubles back. Drag handles the common case, and the
 * keyboard sensor is wired because a drag-only reorder is unusable for anyone not using a
 * mouse (PRD §12.8).
 *
 * Nothing saves until the operator taps Save — dragging is exploratory, and an autosaving
 * reorder would write half-finished sequences.
 */
export function RouteStops({
  routeId,
  places,
  initial,
}: {
  routeId: string;
  places: { id: string; label: string }[];
  initial: RouteStop[];
}) {
  const [stops, setStops] = useState<RouteStop[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const unused = places.filter((place) => !stops.some((stop) => stop.place_id === place.id));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setStops((current) => {
      const from = current.findIndex((s) => s.place_id === active.id);
      const to = current.findIndex((s) => s.place_id === over.id);
      return from === -1 || to === -1 ? current : arrayMove(current, from, to);
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setProblem(null);

    const result = await setRouteStops({
      route_id: routeId,
      stops: stops.map((s) => ({ place_id: s.place_id, is_rest_point: s.is_rest_point })),
    });

    setSaving(false);
    if (!result.ok) {
      setProblem(result.error.message);
      return;
    }
    setSaved(true);
  }

  return (
    <section className="flex flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4">
      <div>
        <h2 className="text-h3">Stops along the route</h2>
        <p className="mt-1 text-body-sm text-text-secondary">
          In order of travel. Drag to reorder, or focus a stop and use the arrow keys.
        </p>
      </div>

      {stops.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">No stops yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={stops.map((s) => s.place_id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-2">
              {stops.map((stop, index) => (
                <SortableStop
                  key={stop.place_id}
                  stop={stop}
                  index={index}
                  onToggleRest={() => {
                    setStops((current) =>
                      current.map((s) =>
                        s.place_id === stop.place_id
                          ? { ...s, is_rest_point: !s.is_rest_point }
                          : s,
                      ),
                    );
                    setSaved(false);
                  }}
                  onRemove={() => {
                    setStops((current) => current.filter((s) => s.place_id !== stop.place_id));
                    setSaved(false);
                  }}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      {unused.length > 0 ? (
        <label className="flex flex-col gap-1 text-body-sm font-medium">
          Add a stop
          <select
            value=""
            onChange={(e) => {
              const place = unused.find((p) => p.id === e.target.value);
              if (!place) return;
              setStops((current) => [
                ...current,
                { place_id: place.id, label: place.label, is_rest_point: false },
              ]);
              setSaved(false);
            }}
            className="focus-ring min-h-11 rounded-input border border-border-subtle bg-surface px-3 text-body font-normal"
          >
            <option value="">Choose a place…</option>
            {unused.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {problem ? (
        <p role="alert" className="text-body-sm text-status-tight">
          {problem}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="button" loading={saving} onClick={() => void save()}>
          Save stop order
        </Button>
        {saved ? (
          <span role="status" className="text-body-sm text-status-comfortable">
            ● Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}

function SortableStop({
  stop,
  index,
  onToggleRest,
  onRemove,
}: {
  stop: RouteStop;
  index: number;
  onToggleRest: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.place_id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-button border border-border-subtle bg-surface px-3 py-2 ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${stop.label}, currently stop ${index + 1}`}
        className="focus-ring min-h-11 cursor-grab px-1 text-text-tertiary"
      >
        ⠿
      </button>
      <span className="w-6 shrink-0 text-body-sm text-text-tertiary">{index + 1}</span>
      <span className="flex-1 truncate text-body-sm">{stop.label}</span>

      <label className="flex items-center gap-1 text-caption">
        <input
          type="checkbox"
          checked={stop.is_rest_point}
          onChange={onToggleRest}
          className="focus-ring size-4"
        />
        Rest point
      </label>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${stop.label}`}
        className="focus-ring min-h-11 px-2 text-brand-primary-text"
      >
        ×
      </button>
    </li>
  );
}
