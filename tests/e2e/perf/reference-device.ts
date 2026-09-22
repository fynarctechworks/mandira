import type { Page } from "@playwright/test";

/**
 * The reference device from TRD §9, emulated.
 *
 * "Android, ~₹12k class (4 GB RAM, Snapdragon 600-series or MediaTek G-series), Chrome, 4G
 * throttled to 1.6 Mbps / 150 ms RTT." Playwright gives us the viewport and the user agent
 * through `devices["Pixel 5"]`; the two things that actually decide these numbers — a slow
 * CPU and a slow network — come from CDP, so they are set here.
 *
 * WHAT THIS IS AND IS NOT. It is a repeatable floor: if the numbers fail here they will
 * fail on the phone. It is NOT the phone. A desktop core throttled 4× is not a
 * Snapdragon 662, thermal behaviour is absent, and the render pipeline is a different one.
 * TRD-PERF-001 asks for the reference device itself, and this harness narrows what is left
 * to check there rather than replacing it — a run on a real handset still decides.
 */

/** 4G as TRD §9 defines it: 1.6 Mbps down, 750 kbps up, 150 ms RTT. */
export const FOUR_G = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

/**
 * 4× CPU slowdown.
 *
 * Lighthouse's own mobile preset uses 4× against a desktop reference, and matching it
 * means these numbers can be read beside a Lighthouse run rather than against it.
 */
export const CPU_SLOWDOWN = 4;

export async function useReferenceDevice(page: Page): Promise<() => Promise<void>> {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", FOUR_G);
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

  /*
   * Never throws. This runs in a `finally`, and a CDP session whose page has already gone
   * would otherwise replace the real failure with "target has been closed" — which is how
   * a broken selector once looked like a broken harness.
   */
  return async () => {
    try {
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await client.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: -1,
        uploadThroughput: -1,
        latency: 0,
      });
      await client.detach();
    } catch {
      // The page is gone; there is nothing left to un-throttle.
    }
  };
}

/**
 * The largest contentful paint the browser actually reported, in milliseconds.
 *
 * Read from PerformanceObserver rather than from a navigation timing, because LCP is the
 * metric TRD §9 names and it is not derivable from `loadEventEnd`. Resolves on the last
 * entry seen once the page has settled; null when the browser reported none, which is
 * itself worth failing on rather than scoring as zero.
 */
export async function largestContentfulPaint(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>((resolve) => {
        let latest: number | null = null;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) latest = entry.startTime;
          });
          observer.observe({ type: "largest-contentful-paint", buffered: true });
          // LCP can still change while the page settles; 1s after load is where the
          // traveler's impression is formed and where Lighthouse stops caring too.
          setTimeout(() => {
            observer.disconnect();
            resolve(latest);
          }, 1000);
        } catch {
          resolve(null);
        }
      }),
  );
}

/** Milliseconds a block took, measured in the page rather than across the wire. */
export async function timeInPage(page: Page, run: () => Promise<void>): Promise<number> {
  const started = await page.evaluate(() => performance.now());
  await run();
  const ended = await page.evaluate(() => performance.now());
  return ended - started;
}
