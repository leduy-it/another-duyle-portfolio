import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const rect = Element.prototype.getBoundingClientRect;
    window.sceneReads = { story: 0, parsing: 0 };
    Element.prototype.getBoundingClientRect = function () {
      for (const key of ["story", "parsing"])
        if (this.closest?.("#" + key)) window.sceneReads[key]++;
      return rect.call(this);
    };
  });
  await page.goto(process.env.TEST_URL || "http://localhost:4317", {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1800);
  const reads = await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = "auto";
    window.sceneReads = { story: 0, parsing: 0 };
    for (let i = 0; i < 40; i++) {
      scrollTo({ top: i * 4, behavior: "instant" });
      await new Promise(requestAnimationFrame);
    }
    return window.sceneReads;
  });
  assert.deepEqual(
    reads,
    { story: 0, parsing: 0 },
    "Offscreen scenes must not measure layout on every scroll frame",
  );
  const scrollToStage = async (index) => {
    await page.evaluate((index) => {
      const el = document.querySelector("#parsing");
      scrollTo({
        top:
          el.offsetTop + ((el.offsetHeight - innerHeight) * (index + 0.5)) / 6,
        behavior: "instant",
      });
    }, index);
    await page.waitForFunction(
      (index) => document.querySelector("#parsing").dataset.s === String(index),
      index,
    );
  };
  await scrollToStage(2);
  await page.waitForTimeout(1600);
  const activeReads = await page.evaluate(async () => {
    window.sceneReads = { story: 0, parsing: 0 };
    const y = scrollY;
    for (let i = 0; i < 40; i++) {
      scrollTo({ top: y + i, behavior: "instant" });
      await new Promise(requestAnimationFrame);
    }
    return window.sceneReads;
  });
  assert.equal(
    activeReads.parsing,
    0,
    "Scrolling inside a stage must reuse measured geometry",
  );
  const anchors = await page.evaluate(() =>
    [...document.querySelectorAll(".parsing-links path")].map((path) =>
      path.getAttribute("d"),
    ),
  );
  assert.ok(
    anchors.every((d) => d && !/NaN/.test(d)),
    "Source links must still have valid measured endpoints",
  );
  // Browser zoom/orientation/font reflow must invalidate cached dimensions.
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.waitForTimeout(250);
  await scrollToStage(4);
  assert.notDeepEqual(
    await page
      .locator(".parsing-links path")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d"))),
    anchors,
  );
  const figure = await page.evaluate(() => {
    const svg = document
        .querySelector(".trajectory-art")
        .getBoundingClientRect(),
      region = document.querySelector(".f1-crop.c2").getBoundingClientRect();
    return {
      inside:
        svg.left >= region.left &&
        svg.right <= region.right &&
        svg.top >= region.top &&
        svg.bottom <= region.bottom,
    };
  });
  assert.equal(
    figure.inside,
    true,
    "The figure asset must fit inside its detected source region",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() =>
    document.querySelector("#parsing").classList.contains("f1-rm"),
  );
  assert.equal(await page.locator(".scene-controls").count(), 0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(
    () => document.querySelectorAll(".scene-controls").length === 2,
  );
  await scrollToStage(3);
  await page.locator('#nav a[href="/about"]').click();
  await page.waitForURL("**/about");
  await page.goBack();
  await page.waitForFunction(
    () => document.querySelectorAll(".scene-controls").length === 2,
  );
  assert.equal(await page.locator(".parsing-links").count(), 1);
  assert.equal(await page.locator(".ocr-box").count(), 1);
  await scrollToStage(4);
  await page.waitForTimeout(200);
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(200);
    for (let index = 0; index < 6; index++) {
      await scrollToStage(index);
      await page.waitForTimeout(750);
      const visible = await page
        .locator(".f1-field>.now")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, height: innerHeight };
          }),
        );
      assert.ok(
        visible.every((r) => r.top >= 60 && r.bottom <= r.height + 1),
        `Laptop scene is clipped: ${JSON.stringify({ viewport, index, visible })}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      offscreenLayoutReads: reads,
      activeStageLayoutReads: activeReads,
      resizeRecomputed: true,
      figureRegion: true,
      liveMotionToggle: true,
      historyReturn: true,
    }),
  );
} finally {
  await browser.close();
}
