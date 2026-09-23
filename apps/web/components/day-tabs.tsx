"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Day tabs on the journey page (PRD §5 A10: "Day tabs, timeline items, tier chips, travel
 * legs, Health pill").
 *
 * Before this, every day was stacked in one scroll. A three-day journey with twelve stops
 * — the journey PRD-PLAN-009 is measured on — put day three a long way below the fold, and
 * a traveler planning tomorrow had to scroll past today to find it. Tabs show one day at a
 * time, which is how people think about a pilgrimage: today, then tomorrow.
 *
 * The WAI-ARIA tabs pattern, not a row of buttons that happen to look like tabs: a
 * `tablist`, each `tab` naming its `tabpanel`, only the selected tab in the tab order, and
 * arrow keys moving between them. Home and End go to the first and last day.
 *
 * Every day's content is still rendered on the server and stays in the document; the tab
 * only decides which is shown. So a search engine, a screen reader asked for the whole
 * page, and "print" all see the complete plan, and switching days costs no request.
 *
 * The selected day is kept in the URL fragment (`#day-2`), so a link from Live or a
 * notification lands on the day it is about, and the back button does not lose it.
 */

type DayTab = { dayIndex: number; label: string; date: string };

const SelectedDay = createContext<number | null>(null);

export function DayTabs({
  days,
  initialDayIndex,
  label,
  children,
}: {
  days: DayTab[];
  /** Today when the journey is under way, otherwise the first day. Decided on the server. */
  initialDayIndex: number;
  /** The tablist's accessible name, e.g. "Days of this journey". */
  label: string;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState(initialDayIndex);
  const tabs = useRef<Map<number, HTMLButtonElement>>(new Map());

  /*
   * A fragment in the URL wins over the default — on arrival, and whenever it changes
   * afterwards. The second half matters: back and forward, or a link to another day on the
   * same page, change only the fragment, so the page does not reload and a check made once
   * on mount would leave the wrong day showing under the right URL.
   */
  useEffect(() => {
    const fromHash = () => {
      const match = /^#day-(\d+)$/.exec(window.location.hash);
      const index = match ? Number(match[1]) : NaN;
      if (days.some((day) => day.dayIndex === index)) setSelected(index);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [days]);

  const choose = useCallback((dayIndex: number, focus: boolean) => {
    setSelected(dayIndex);
    // replaceState, not a navigation: switching days is not a page the back button should
    // have to step through one tap at a time.
    window.history.replaceState(null, "", `#day-${dayIndex}`);
    if (focus) tabs.current.get(dayIndex)?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = days.length - 1;
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % days.length
        : event.key === "ArrowLeft"
          ? (index - 1 + days.length) % days.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    choose(days[next]!.dayIndex, true);
  }

  return (
    <SelectedDay.Provider value={days.length > 1 ? selected : null}>
      {/* One day needs no tabs; a single tab is a control that does nothing. */}
      {days.length > 1 ? (
        <div
          role="tablist"
          aria-label={label}
          className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4"
        >
          {days.map((day, index) => {
            const active = day.dayIndex === selected;
            return (
              <button
                key={day.dayIndex}
                ref={(node) => {
                  if (node) tabs.current.set(day.dayIndex, node);
                  else tabs.current.delete(day.dayIndex);
                }}
                type="button"
                role="tab"
                id={`day-tab-${day.dayIndex}`}
                aria-selected={active}
                aria-controls={`day-panel-${day.dayIndex}`}
                tabIndex={active ? 0 : -1}
                onClick={() => choose(day.dayIndex, false)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`focus-ring flex min-h-12 shrink-0 flex-col items-start justify-center border-b-2 px-3 text-left ${
                  active
                    ? "border-brand-primary text-text-primary"
                    : "border-transparent text-text-secondary"
                }`}
              >
                <span className="text-body-sm font-medium">{day.label}</span>
                <span className="text-caption">{day.date}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {children}
    </SelectedDay.Provider>
  );
}

/**
 * One day's content. Hidden, not unmounted, when another day is chosen — the plan stays in
 * the document for print and assistive technology, and the item editors inside keep their
 * state when the traveler looks at another day and comes back.
 */
export function DayPanel({ dayIndex, children }: { dayIndex: number; children: ReactNode }) {
  const selected = useContext(SelectedDay);

  // No tabs (a one-day journey): the content is simply the page.
  if (selected === null) return <>{children}</>;

  return (
    <div
      role="tabpanel"
      id={`day-panel-${dayIndex}`}
      aria-labelledby={`day-tab-${dayIndex}`}
      hidden={dayIndex !== selected}
      className="print:!block"
    >
      {children}
    </div>
  );
}
