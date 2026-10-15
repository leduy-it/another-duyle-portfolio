import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.TEST_URL || "http://localhost:4317";
const evidence = new URL("../evidence/", import.meta.url).pathname;
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const report = {
  base,
  checkedAt: new Date().toISOString(),
  pages: [],
  story: [],
  parsing: [],
  mobile: [],
  contact: [],
};
const photo = (name) =>
  page.screenshot({ path: `${evidence}/${name}.png`, animations: "disabled" });
async function ready(path = "/") {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}
async function scene(selector, progress) {
  await page.evaluate(
    ({ selector, progress }) => {
      document.documentElement.style.scrollBehavior = "auto";
      const el = document.querySelector(selector);
      scrollTo(0, el.offsetTop + (el.offsetHeight - innerHeight) * progress);
    },
    { selector, progress },
  );
}
async function withinPage() {
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  assert.ok(
    width.scroll <= width.viewport + 1,
    `Overflow: ${JSON.stringify(width)}`,
  );
}
try {
  for (const path of [
    "/",
    "/about",
    "/experience",
    "/projects",
    "/writing",
    "/life",
    "/contact",
  ]) {
    await ready(path);
    await withinPage();
    assert.equal(await page.locator("main").count(), 1);
    assert.equal(await page.locator("h1").count(), 1);
    const computed = await page.locator("h1").evaluate((el) => ({
      font: getComputedStyle(el).fontFamily,
      paper: getComputedStyle(document.documentElement)
        .getPropertyValue("--paper")
        .trim(),
      cobalt: getComputedStyle(document.documentElement)
        .getPropertyValue("--sig")
        .trim(),
    }));
    assert.ok(computed.font.includes("Inter Tight"));
    assert.equal(computed.paper, "#fafaf8");
    assert.equal(computed.cobalt, "#2f5bff");
    report.pages.push({ path, ...computed });
  }
  await ready("/");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".hero .w>span")].every((e) =>
      ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(
        getComputedStyle(e).transform,
      ),
    ),
  );
  await photo("desktop-home");
  for (const [index, p] of [0.15, 0.42, 0.67, 0.92].entries()) {
    await scene("#story", p);
    await page.waitForFunction((index) => {
      const el = document.querySelectorAll(".copies .copy")[index];
      return Number(getComputedStyle(el).opacity) > 0.95;
    }, index);
    report.story.push(await page.locator(".chaps .on").innerText());
    await photo(`desktop-story-${index + 1}`);
  }
  for (let index = 0; index < 6; index++) {
    await scene("#parsing", (index + 0.45) / 6);
    await page.waitForFunction(
      (index) => document.querySelector("#parsing").dataset.s === String(index),
      index,
    );
    if (index === 1)
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".f1-crop")].every(
          (e) => Number(getComputedStyle(e).opacity) > 0.99,
        ),
      );
    if (index === 2)
      await page.waitForFunction(
        () =>
          Number(
            getComputedStyle(document.querySelector(".f1-parsed code")).opacity,
          ) > 0.99,
      );
    if (index === 3)
      await page.waitForFunction(
        () =>
          Number(
            getComputedStyle(document.querySelector(".chunk-check")).opacity,
          ) > 0.99,
      );
    if (index === 5)
      await page.waitForFunction(
        () =>
          Number(getComputedStyle(document.querySelector(".f1-a")).opacity) >
          0.99,
      );
    await page.waitForTimeout(1100);
    report.parsing.push(
      await page.evaluate(() => ({
        state: document.querySelector("#parsing").dataset.s,
        label: document.querySelector(".f1-steps .cur .f1-k").textContent,
        boxes: document.querySelectorAll(".f1-crop.on").length,
        traces: document.querySelectorAll(".parsing-links path.on").length,
        schemaChecked: document
          .querySelector(".f1-chunks")
          .classList.contains("on"),
        embeddingVisible: document
          .querySelector(".f1-space")
          .classList.contains("on"),
      })),
    );
    await photo(`desktop-parsing-${index + 1}`);
  }
  assert.equal(report.parsing[2].embeddingVisible, false);
  assert.equal(report.parsing[3].schemaChecked, true);
  assert.equal(report.parsing[4].embeddingVisible, true);
  for (const width of [375, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await ready("/");
    await withinPage();
    await page.getByRole("button", { name: "Menu", exact: false }).click();
    assert.equal(
      await page.locator(".menu-btn").getAttribute("aria-expanded"),
      "true",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".menu-btn").getAttribute("aria-expanded"),
      "false",
    );
    for (const index of [0, 1, 2, 3, 4, 5]) {
      await scene("#parsing", (index + 0.5) / 6);
      await page.waitForFunction(
        (i) => document.querySelector("#parsing").dataset.s === String(i),
        index,
      );
      await page.waitForTimeout(1000);
      await withinPage();
      const active = await page
        .locator(".f1-field>.now")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              top: r.top,
              bottom: r.bottom,
              left: r.left,
              right: r.right,
              viewport: innerHeight,
              width: innerWidth,
            };
          }),
        );
      assert.ok(active.length > 0);
      for (const rect of active) {
        assert.ok(
          rect.left >= 0 && rect.right <= rect.width + 1,
          `Cropped mobile scene: ${JSON.stringify(rect)}`,
        );
        assert.ok(
          rect.top >= 60 && rect.bottom <= rect.viewport + 1,
          `Scene outside viewport: ${JSON.stringify(rect)}`,
        );
      }
      report.mobile.push({ width, stage: index, active });
      if (width === 390 && [1, 4].includes(index))
        await photo(`mobile-parsing-${index + 1}`);
    }
    for (const path of [
      "/about",
      "/experience",
      "/projects",
      "/writing",
      "/life",
      "/contact",
    ]) {
      await ready(path);
      await withinPage();
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready("/");
  assert.equal(await page.locator(".rm-frame").count(), 4);
  assert.ok(
    await page
      .locator("#parsing")
      .evaluate((el) => el.classList.contains("f1-rm")),
  );
  assert.equal(await page.locator(".scene-controls").count(), 0);
  await page.locator("#parsing").scrollIntoViewIfNeeded();
  await photo("reduced-motion");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready("/contact");
  let relayCalls = 0,
    contactCalls = 0;
  await page.route("**/api/contact", (route) => {
    contactCalls++;
    return route.fulfill({
      status: 202,
      json: { status: "relay_required", relayNonce: "synthetic-nonce" },
    });
  });
  await page.route("**/api/contact/ack", (route) =>
    route.fulfill({ status: 200, json: { status: "submitted" } }),
  );
  await page.route("https://formsubmit.co/**", (route) => {
    relayCalls++;
    return route.fulfill({ status: 200, json: { success: true } });
  });
  for (const [name, value] of Object.entries({
    name: "Synthetic test",
    email: "test@example.com",
    subject: "Browser form verification",
    message: "Synthetic browser test. No actual email is dispatched.",
  }))
    await page.locator(`[name=${name}]`).fill(value);
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector("#contact-status")
      .textContent.includes("acknowledged submission"),
  );
  assert.equal(relayCalls, 1);
  assert.equal(contactCalls, 1);
  assert.equal(
    await page.getByRole("button", { name: "Send message" }).isDisabled(),
    true,
  );
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("another-duy:contact-draft:v1"),
    ),
    null,
  );
  report.contact.push(
    "One dispatch; stored acknowledgement; no inbox-delivery claim; draft cleared. Provider calls were intercepted.",
  );
  await page.unroute("**/api/contact");
  await page.route("**/api/contact", (route) =>
    route.fulfill({ status: 503, json: { error: "storage_unavailable" } }),
  );
  await page
    .locator("[name=message]")
    .fill("Another synthetic draft, preserved when service is unavailable.");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.waitForFunction(() =>
    document.querySelector("#contact-status").classList.contains("error"),
  );
  await ready("/contact");
  assert.match(
    await page.locator("[name=message]").inputValue(),
    /preserved when service/,
  );
  report.contact.push("Service failure preserves the draft across a reload.");
  assert.deepEqual(errors, []);
  report.javascriptErrors = errors;
  await writeFile(
    `${evidence}/browser-report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `PASS: 7 pages; original fonts/palette; 4 story moments; 6 parsing states; 18 mobile scene checks; reduced-motion reading; contact success/failure with intercepted delivery. No JavaScript errors.`,
  );
} finally {
  await browser.close();
}
