import { readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { load } from "cheerio";
import { shell, escape as e, contactForm } from "../src/templates/site.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const data = JSON.parse(await read("src/data/portfolio.json"));
const out = new URL("dist/", root);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL("public/", root), out, { recursive: true });
for (const directory of ["styles", "client"])
  await cp(new URL(`src/${directory}/`, root), new URL(`${directory}/`, out), {
    recursive: true,
  });

const pages = {
  home: [
    "/",
    "Agents that help students get unstuck.",
    "Michael Le — AI engineer in Ho Chi Minh City, building practical systems with LLMs, agents, OCR and automation.",
  ],
  about: [
    "/about",
    "Curious by nature. Focused by experience.",
    "The person behind the systems: Michael Le, an AI engineer based in Ho Chi Minh City.",
  ],
  experience: [
    "/experience",
    "Experience",
    "Building AI systems across product and research — GrowtricsAI, GMO-Z.com RUNSYSTEM and SmartPay.",
  ],
  projects: [
    "/projects",
    "Three systems, drawn out.",
    "Agent workflows, edtech systems and multilingual document OCR.",
  ],
  writing: [
    "/writing",
    "Writing & research",
    "Engineering notes on agents, OCR and building systems people can rely on.",
  ],
  life: [
    "/life",
    "Life, off the clock.",
    "Cinema, quiet moments and a few furry companions.",
  ],
  contact: [
    "/contact",
    "Let’s build something.",
    "Write to Michael Le about a project, collaboration or an interesting engineering problem.",
  ],
};
const writingLinks = (posts) =>
  `<ul class="idx">${posts.map((p, i) => `<li><a href="https://duyle.me/blog/${e(p.slug)}" target="_blank" rel="noopener"><span class="mono mute">Note ${String(i + 1).padStart(2, "0")}<small>${e(p.date)}</small></span><span class="t">${e(p.title)}</span><span class="mute">${e(p.excerpt)}</span><span aria-hidden="true">↗</span></a></li>`).join("")}</ul>`;

for (const [name, [path, title, description]] of Object.entries(pages)) {
  const $ = load(await read(`src/pages/${name}.html`), {}, false);
  if (name === "home") {
    const writing = $('[aria-labelledby="wr-h"]');
    writing
      .find("h2")
      .html(
        'Ideas, notes, and explorations.<br><span class="mute">From the actual work.</span>',
      );
    writing.find(".idx").replaceWith(writingLinks(data.writing.slice(0, 3)));
    $(".hero-foot .mono.mute").append(
      '<br><a class="hero-cv" href="/Le_Van_Duy_Resume.pdf" download>Download CV ↓</a>',
    );
    $("#parsing").next("section").attr("id", "intro");
    $(".f1-parsed").append(
      '<div class="schema-check mono"><i aria-hidden="true">✓</i> Normalized text · regions linked</div>',
    );
    $(".f1-chunks").append(
      '<p class="chunk-check mono"><span aria-hidden="true">✓</span> Schema checked · source preserved</p>',
    );
    $(".f1-photo").attr("data-region-source", "");
  }
  if (name === "about")
    $(".dossier dl").append(
      '<dt class="mono mute">Connect</dt><dd><a href="https://www.linkedin.com/in/leduy-it/" target="_blank" rel="noopener">LinkedIn ↗</a> · <a href="https://github.com/leduy-it" target="_blank" rel="noopener">GitHub ↗</a></dd><dt class="mono mute">Resume</dt><dd><a href="/Le_Van_Duy_Resume.pdf" download>Download CV ↓</a></dd>',
    );
  if (name === "experience")
    $(".entry").each((index, entry) => {
      const item = data.experience[index];
      if (!item) return;
      $(entry)
        .find(".when")
        .append(`<p class="mono mute career-date">${e(item.dates)}</p>`);
      $(entry)
        .find(".body")
        .append(
          `<p class="career-story"><a class="link" href="https://duyle.me/experience/${e(item.slug)}" target="_blank" rel="noopener">Full story ↗</a></p>`,
        );
    });
  if (name === "writing") {
    $(".pubhead>div")
      .last()
      .html(
        `<p>Field notes on RAG, multilingual OCR, agent systems, and the decisions behind production AI.</p><p class="mono sig" style="margin-top:16px">${data.writing.length} published notes · on duyle.me</p>`,
      );
    $("details.note").first().before(writingLinks(data.writing));
    $("details.note").remove();
    $("section")
      .last()
      .find("p.mono.mute")
      .last()
      .html(
        'The full essays live on <a href="https://duyle.me/blog" target="_blank" rel="noopener">the original portfolio ↗</a>.',
      );
  }
  if (name === "life") {
    $(".phead .lede")
      .first()
      .after(
        '<p class="life-link"><a class="link" href="https://duyle.me/movie" target="_blank" rel="noopener">The cinema wall ↗</a></p>',
      );
    $(".paws").after(
      '<p class="life-link"><a class="link" href="https://duyle.me/pets" target="_blank" rel="noopener">Visit the pet world ↗</a></p>',
    );
  }
  if (name === "contact") {
    const best = $(".card-line>div").last();
    best.find(".mono").text("Email");
    best
      .find("p:not(.mono)")
      .html('<a href="mailto:levduyit@gmail.com">levduyit@gmail.com ↗</a>');
    $(".finale>.wrap")
      .last()
      .append(
        '<p class="contact-jump"><a class="link" href="#write">Write a note ↓</a></p>',
      );
    $("#main").append(contactForm());
  }
  $(".pipe-rail").replaceWith(
    '<li class="pipe-rail" aria-hidden="true" role="presentation"><i></i></li>',
  );
  $('a[target="_blank"]').attr("rel", "noopener noreferrer");
  await writeFile(
    new URL(name === "home" ? "index.html" : `${name}.html`, out),
    shell({ path, title, description, content: $.html() }),
  );
}
const urls = Object.values(pages)
  .map(([route]) => `<url><loc>https://another.duyle.me${route}</loc></url>`)
  .join("");
await writeFile(
  new URL("sitemap.xml", out),
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
);
await writeFile(
  new URL("robots.txt", out),
  "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://another.duyle.me/sitemap.xml\n",
);
await writeFile(
  new URL("404.html", out),
  shell({
    path: "/404",
    title: "A small detour.",
    description: "Find your way back to Michael Le’s portfolio.",
    noindex: true,
    content:
      '<main id="main"><section class="phead"><div class="wrap"><p class="mono sig">404 / wrong turn</p><h1 class="h1">A small detour.</h1><p class="lede" style="margin-top:32px">This page isn’t here. The work, writing and stories still are.</p><p style="margin-top:32px"><a href="/" class="link">Back home ↗</a></p></div></section></main>',
  }),
);
console.log(
  "Built the 7 authored pages, sitemap and 404. Original palette and fonts preserved. No Foundable runtime.",
);
