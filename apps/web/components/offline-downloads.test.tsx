import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";

const state = vi.hoisted(() => ({
  footprint: null as { bytes: number; syncedAt: string } | null,
  online: true,
}));

vi.mock("../lib/offline/sync", () => ({
  offlineFootprint: async () => state.footprint,
  syncJourneyOffline: async () => ({ ok: true, changed: [] }),
}));
vi.mock("../lib/offline/use-online", () => ({ useOnline: () => state.online }));

const { OfflineDownloads } = await import("./offline-downloads");

function renderPanel() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <OfflineDownloads journeyId="j1" locale="en" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.footprint = null;
  state.online = true;
});

/**
 * PRD F11: "Downloads section in Prepare shows size, last updated, and 'Update now'."
 *
 * The section was a checkbox the traveler ticked themselves, which could not tell them
 * whether their journey was actually on the phone. These pin the three things F11 names.
 */
describe("OfflineDownloads", () => {
  it("shows the size and when the saved copy is from", async () => {
    state.footprint = { bytes: 1_572_864, syncedAt: "2026-09-23T06:30:00Z" };
    renderPanel();

    expect(await screen.findByText("1.5 MB")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.getByText("Last updated")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Update now/ })).toBeTruthy();
  });

  it("gives small journeys a size a person can read, not 0.0 MB", async () => {
    state.footprint = { bytes: 42_000, syncedAt: "2026-09-23T06:30:00Z" };
    renderPanel();
    expect(await screen.findByText("41 KB")).toBeTruthy();
  });

  it("says plainly when nothing is saved, and offers to save it", async () => {
    renderPanel();

    expect(await screen.findByText(/not saved on this phone yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save for offline/ })).toBeTruthy();
  });

  it("will not offer to update with no signal, and says why", async () => {
    state.online = false;
    state.footprint = { bytes: 42_000, syncedAt: "2026-09-23T06:30:00Z" };
    renderPanel();

    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /Update now/ }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(screen.getByText(/You're offline/)).toBeTruthy();
  });
});
