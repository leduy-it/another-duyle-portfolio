import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { load } from "cheerio";
const root = resolve(new URL("../dist", import.meta.url).pathname);
const files = (await readdir(root)).filter((f) => f.endsWith(".html"));
let checked = 0;
const failures = [];
for (const file of files) {
  const html = await readFile(resolve(root, file), "utf8"),
    $ = load(html);
  if ($("html").attr("lang") !== "en")
    failures.push(`${file}: English-only document expected`);
  if ($("main").length !== 1 || $("h1").length !== 1)
    failures.push(`${file}: expected one main landmark and title`);
  if (
    !html.includes('<meta name="description"') ||
    !$("link[rel=canonical]").length
  )
    failures.push(`${file}: missing metadata`);
  if (/foundable-badge|~flock\.js|assets\/index-.*\.js/.test(html))
    failures.push(`${file}: hosted builder runtime leaked into export`);
  for (const element of $("[href],[src]").toArray()) {
    const value = $(element).attr("href") || $(element).attr("src");
    if (!value || /^(https?:|mailto:|data:)/.test(value)) continue;
    const url = new URL(
      value,
      `https://another.duyle.me/${file === "index.html" ? "" : file.replace(".html", "")}`,
    );
    const path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const target = resolve(root, extname(path) ? path : `${path}.html`);
    try {
      await stat(target);
    } catch {
      failures.push(`${file}: missing ${value}`);
      continue;
    }
    if (url.hash && target.endsWith(".html")) {
      const targetHtml = load(await readFile(target, "utf8"));
      if (!targetHtml(`[id="${decodeURIComponent(url.hash.slice(1))}"]`).length)
        failures.push(`${file}: missing anchor ${value}`);
    }
    checked++;
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${files.length} HTML documents; ${checked} local links, assets and anchors; English-only metadata; independent runtime.`,
  );
