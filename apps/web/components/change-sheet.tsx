"use client";

import { ChangeCard as ChangeCardSheet, type ChangeCardOption } from "@mandhira/ui";
import type { ChangeCard, ChangeOption } from "@mandhira/journey-engine";

/**
 * The Change Card a traveler actually reads (PRD F6, PRD-ADPT-004/006).
 *
 * The engine returns keys and params, never sentences — the same rule as health causes —
 * so this is where PRD F6's contract becomes language: what changed / why it matters /
 * recommended with a because / up to two others / keep as is with its resulting state.
 *
 * Nothing here decides anything. Every option is a button, and the plan moves only when
 * one is pressed (PRD-ADPT-005).
 */
export function ChangeSheet({
  card,
  open,
  onDecide,
  onOpenChange,
  pending,
  offline = false,
}: {
  card: ChangeCard;
  open: boolean;
  /** `null` means "keep as is", which is a real decision and is recorded as one. */
  onDecide: (optionId: string | null) => void;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Worked out on the device, from the cached snapshot (PRD-ADPT-007). */
  offline?: boolean;
}) {
  const recommended = card.recommended;
  if (!recommended) return null;

  const others = card.options.filter((option) => option.id !== recommended.id).slice(0, 2);

  return (
    <ChangeCardSheet
      open={open}
      onOpenChange={onOpenChange}
      whatChanged={sentence(card.whatChanged)}
      whyItMatters={
        card.whyItMatters.map(sentence).filter(Boolean).join(" ") ||
        "This affects how the rest of the day fits together."
      }
      recommended={toOption(recommended)}
      otherOptions={others.map(toOption)}
      /*
       * PRD F6 requires "keep as is" to state what happens if nothing changes. An option
       * to decline that does not say the cost is not really an option.
       */
      keepAsIs={{
        label: "Keep as is",
        resultingHealth: card.keepAsIs.resultingState,
        because: keepAsIsBecause(card.keepAsIs.resultingState),
      }}
      /*
       * The only apply path in the product. Disabled while a decision is in flight, so a
       * double-tap on a slow connection cannot answer the same card twice — the route
       * refuses a second decision anyway, but the traveler should not see it try.
       */
      onChooseOption={(id) => {
        if (!pending) onDecide(id);
      }}
      onKeepAsIs={() => {
        if (!pending) onDecide(null);
      }}
      /*
       * PRD-ADPT-006: a card triggered by knowledge or a live feed says what it rests on,
       * and low confidence adds the line telling the traveler to check locally. A
       * recommendation built on a fact nobody has verified recently must say so.
       */
      {...(offline
        ? {
            /*
             * PRD-ADPT-007, said plainly because an offline evaluation is genuinely less
             * complete: traveler profiles are deliberately NOT cached (PRD-PRIV-002), so
             * the buffer multipliers for someone using a wheelchair or needing frequent
             * rest are not applied here. An option can therefore look slightly more
             * comfortable than it is, and the next online check is authoritative.
             */
            lowConfidenceNote:
              "Worked out from what's saved on this device. Your choice is kept and sent " +
              "when there's a signal, and we'll check it again then.",
          }
        : card.trustExposure?.length
          ? { lowConfidenceNote: trustNote(card.trustExposure) }
          : {})}
    />
  );
}

function toOption(option: ChangeOption): ChangeCardOption {
  return {
    id: option.id,
    label: optionLabel(option),
    because: optionBecause(option),
    resultingHealth: option.resultingState,
    requiresConfirmation: option.requiresConfirmation,
  };
}

/**
 * The ladder's rungs, in a traveler's words.
 *
 * Keyed on the LADDER STEP rather than on the option id, because the step is what the
 * option actually is — (a) is always "use the slack", (f) is always "drop something" — and
 * a label derived from the step cannot drift out of step with the rung it describes.
 */
function optionLabel(option: ChangeOption): string {
  const minutes = String(option.params?.["minutes"] ?? "");

  return (
    {
      a: `Use the spare time you'd left${minutes ? ` — about ${minutes} minutes` : ""}`,
      b: "Start the next one a little later",
      c: `Spend less time at one stop${minutes ? ` — about ${minutes} minutes` : ""}`,
      d: "Move something to another day",
      e: "Swap the order of two things",
      f: "Leave one thing out",
    }[option.step] ?? "Adjust the day"
  );
}

/** PRD F6: every recommendation ships a one-sentence reason. */
function optionBecause(option: ChangeOption): string {
  const kept = option.removedItemIds.length === 0;

  if (option.step === "a") {
    return "because the buffers were there for exactly this, and nothing you planned has to change.";
  }
  if (option.step === "f") {
    return "because there isn't enough of the day left to reach everything, and this is the one you marked as optional.";
  }
  if (option.requiresConfirmation) {
    return "because this touches something you said matters, so it's your call rather than ours.";
  }

  return kept
    ? "because it keeps everything you said matters, and only shifts the timing."
    : "because it brings the rest of the day back within reach.";
}

function keepAsIsBecause(state: string): string {
  return state === "broken"
    ? "The day won't work as planned, and something will be missed."
    : state === "at_risk"
      ? "It may still work, but there's no room left if anything slips."
      : "Nothing needs to change.";
}

/**
 * PRD-ADPT-006's disclosure.
 *
 * A recommendation is only as good as the fact underneath it. When that fact is
 * low-confidence, the traveler is told to check locally — Mandhira would rather be second
 * to a temple noticeboard than confidently wrong.
 */
function trustNote(exposure: { key: string; count: number }[]): string {
  const low = exposure.some((cause) => cause.key.includes("low_confidence"));
  const stale = exposure.some((cause) => cause.key.includes("stale"));

  if (low) return "This is based on information we're not fully sure of — worth checking locally.";
  if (stale) return "This is based on information that hasn't been confirmed recently.";
  return "This is based on information that changed.";
}

/** The engine's key + params, rendered. */
function sentence(part: { key: string; params?: Record<string, string | number> }): string {
  const minutes = String(part.params?.["minutes"] ?? "");

  return (
    {
      "change.what.user_late": `You're about ${minutes} minutes behind.`,
      "change.what.user_stay_longer": `You're staying about ${minutes} minutes longer.`,
      "change.what.user_done_delta": `That finished about ${minutes} minutes off the plan.`,
      "change.what.knowledge_update": "Something we know about your day has changed.",
      "change.what.live_transport": "A transport connection has changed.",
      "change.what.live_weather": "The weather for your day has changed.",
      "change.what.item_added": "You added something to the day.",
      "change.what.item_removed": "You took something out of the day.",
      "change.what.availability_changed": "Opening times for one of these have changed.",
      "change.what.preferences_changed": "What matters to you has changed.",
      "health.cause.overlap": "Two things now overlap.",
      "health.cause.tight_transition": `That leaves only ${minutes} minutes to get between two of them.`,
      "health.cause.outside_window": "One of these now falls outside when it's open.",
      "health.cause.return_at_risk": `You'd reach your return about ${minutes} minutes late.`,
      "health.cause.physical_load": "This day already asks a lot on foot.",
      "health.cause.no_break": "There's a long stretch here without a proper break.",
      "health.cause.not_step_free": "Part of this day is only partly step-free.",
    }[part.key] ?? ""
  );
}
