import { chromium } from "playwright";
import fs from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {
  checkedAt: new Date().toISOString(),
  cpuSlowdown: 4,
  profiles: [],
};
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      deviceScaleFactor: mobile ? 2 : 1,
      isMobile: mobile,
      hasTouch: mobile,
    });
    await page.addInitScript(() => {
      const original = Element.prototype.getBoundingClientRect;
      window.rectReads = {};
      Element.prototype.getBoundingClientRect = function () {
        const key = this.closest?.(".f1")
          ? "parsing"
          : this.closest?.(".story")
            ? "story"
            : "other";
        window.rectReads[key] = (window.rectReads[key] || 0) + 1;
        return original.call(this);
      };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Performance.enable");
    await page.goto(process.env.PROFILE_URL || "http://localhost:4317", {
      waitUntil: "networkidle",
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    for (const selector of [".hero", "#story", "#parsing", "#intro"]) {
      const range = await page.locator(selector).evaluate((el) => ({
        start: el.getBoundingClientRect().top + scrollY,
        end:
          el.getBoundingClientRect().top +
          scrollY +
          Math.max(400, el.offsetHeight - innerHeight),
      }));
      await page.evaluate((y) => {
        document.documentElement.style.scrollBehavior = "auto";
        scrollTo(0, y);
      }, range.start);
      await page.waitForTimeout(1600);
      await page.evaluate(() => (window.rectReads = {}));
      const before = Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map((x) => [
          x.name,
          x.value,
        ]),
      );
      const frames = await page.evaluate(async (range) => {
        let start, previous;
        const deltas = [];
        await new Promise((resolve) => {
          function tick(t) {
            start ??= t;
            if (previous) deltas.push(t - previous);
            previous = t;
            const p = Math.min(1, (t - start) / 2800);
            scrollTo({
              top: range.start + (range.end - range.start) * p,
              behavior: "instant",
            });
            if (p < 1) requestAnimationFrame(tick);
            else resolve();
          }
          requestAnimationFrame(tick);
        });
        return {
          count: deltas.length,
          p95: deltas.sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)],
          over33: deltas.filter((x) => x > 34).length,
          over50: deltas.filter((x) => x > 50).length,
        };
      }, range);
      const after = Object.fromEntries(
        (await cdp.send("Performance.getMetrics")).metrics.map((x) => [
          x.name,
          x.value,
        ]),
      );
      report.profiles.push({
        mobile,
        selector,
        frames,
        rectReads: await page.evaluate(() => window.rectReads),
        ...Object.fromEntries(
          [
            "TaskDuration",
            "ScriptDuration",
            "LayoutDuration",
            "RecalcStyleDuration",
            "LayoutCount",
            "RecalcStyleCount",
          ].map((k) => [k, +(after[k] - before[k]).toFixed(4)]),
        ),
      });
    }
    await page.close();
  }
  await fs.writeFile(
    process.env.PROFILE_OUT || "evidence/scroll-performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
