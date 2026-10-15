import { initMotion } from "./motion.mjs";
import { initContact } from "./contact.mjs";

const preference = matchMedia("(prefers-reduced-motion: reduce)");
let dispose = initMotion(preference.matches);
preference.addEventListener("change", (event) => {
  dispose();
  dispose = initMotion(event.matches);
});
addEventListener("pagehide", () => dispose(), { once: true });
addEventListener("pageshow", (event) => {
  if (event.persisted) dispose = initMotion(preference.matches);
});
const toggle = document.querySelector(".menu-btn"),
  navigation = document.querySelector("#nav");
function closeMenu() {
  navigation?.classList.remove("open");
  toggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
}
toggle?.addEventListener("click", () => {
  const open = !navigation.classList.contains("open");
  navigation.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("menu-open", open);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    toggle?.getAttribute("aria-expanded") === "true"
  ) {
    closeMenu();
    toggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (navigation?.classList.contains("open") && !event.target.closest(".top"))
    closeMenu();
});
navigation?.addEventListener("click", (event) => {
  if (event.target.closest("a")) closeMenu();
});
matchMedia("(min-width: 1161px)").addEventListener("change", (event) => {
  if (event.matches) closeMenu();
});
document
  .querySelector(".back-top")
  ?.addEventListener("click", () =>
    scrollTo({ top: 0, behavior: preference.matches ? "instant" : "smooth" }),
  );
initContact();
