export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const links = [
  ["/", "Home"],
  ["/about", "About"],
  ["/experience", "Experience"],
  ["/projects", "Projects"],
  ["/writing", "Writing"],
  ["/life", "Life"],
  ["/contact", "Contact"],
];

export function navigation(path) {
  return `<header class="top"><div class="bar"><a class="brand" href="/"><b aria-hidden="true"></b>Michael Le</a><nav id="nav" aria-label="Main">${links.map(([url, label]) => `<a href="${url}" ${path === url ? 'aria-current="page"' : ""}>${label}</a>`).join("")}<a class="mobile-original" href="https://duyle.me" target="_blank" rel="noopener">Original portfolio ↗</a></nav><div class="header-actions"><a class="original-link mono" href="https://duyle.me" target="_blank" rel="noopener">Original ↗</a><button class="menu-btn" type="button" aria-controls="nav" aria-expanded="false">Menu<span class="menu-icon" aria-hidden="true"><i></i><i></i></span></button></div></div></header>`;
}
export function footer() {
  return `<footer class="foot dark"><div class="wrap"><div class="footer-socials mono"><a href="mailto:levduyit@gmail.com">Email ↗</a><a href="https://github.com/leduy-it" target="_blank" rel="noopener">GitHub ↗</a><a href="https://www.linkedin.com/in/leduy-it/" target="_blank" rel="noopener">LinkedIn ↗</a><a href="/Le_Van_Duy_Resume.pdf" download>CV ↓</a><a href="https://duyle.me" target="_blank" rel="noopener">Original portfolio ↗</a></div><div class="grid mono"><span>Michael Le — AI Engineer, Ho Chi Minh City</span><nav aria-label="Footer">${links.map(([url, label]) => `<a href="${url}">${label}</a>`).join("")}</nav><span>© ${new Date().getUTCFullYear()} · Built with curiosity and code</span></div></div><div class="bigname" aria-hidden="true">Michael Le.</div></footer>`;
}
export function contactForm() {
  return `<section class="sec contact-section" id="write"><div class="wrap contact-grid"><div><p class="mono sig">&gt; A note, a beginning</p><h2 class="h2">What’s on<br>your mind?</h2><p class="mute">A project, an engineering question, or just a hello. I’ll reply to the email you leave here.</p><a href="mailto:levduyit@gmail.com" class="email-address">levduyit@gmail.com ↗</a><div class="contact-socials mono"><a href="https://www.linkedin.com/in/leduy-it/" target="_blank" rel="noopener">LinkedIn ↗</a><a href="https://github.com/leduy-it" target="_blank" rel="noopener">GitHub ↗</a><a href="/Le_Van_Duy_Resume.pdf" download>Download CV ↓</a></div></div><form id="contact-form"><div class="form-row"><label>Your name<input name="name" autocomplete="name" maxlength="80" required placeholder="You go by…"></label><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com"></label></div><label>Subject<input name="subject" maxlength="160" minlength="2" required placeholder="We could build…"></label><label>Your message<textarea name="message" rows="6" minlength="10" maxlength="8000" required placeholder="Tell me a little about your idea."></textarea></label><div class="honeypot" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="form-privacy mute">Your note is stored privately for up to 90 days and relayed through FormSubmit. Your email is used to reply. Unsent drafts stay in this browser until cleared.</p><div class="form-actions"><button class="solid-button" type="submit"><span>Send message</span><span aria-hidden="true">↗</span></button><button class="text-button" type="button" data-clear-draft>Clear draft</button></div><div id="contact-status" class="contact-status" role="status" tabindex="-1"></div><a class="mail-fallback link" data-mail-fallback href="mailto:levduyit@gmail.com">Use your email app ↗</a></form></div></section>`;
}
export function shell({
  path = "/",
  title,
  description,
  content,
  noindex = false,
}) {
  const canonical = `https://another.duyle.me${path}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)} — Michael Le</title><meta name="description" content="${escape(description)}">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ""}<link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${escape(title)} — Michael Le"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="https://another.duyle.me/images/share.png"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#fafaf8"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/inter-tight-77fefe8ca19b9f69.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/styles/fonts.css"><link rel="stylesheet" href="/styles/base.css"><link rel="stylesheet" href="/styles/parsing.css"><link rel="stylesheet" href="/styles/enhancements.css"><script type="module" src="/client/main.mjs"></script></head><body data-page="${path.slice(1) || "home"}"><a class="skip" href="#main">Skip to content</a><div class="reading-progress" aria-hidden="true"><i></i></div>${navigation(path)}${content}${footer()}<button class="back-top" type="button" aria-label="Back to top">↑</button></body></html>`;
}
