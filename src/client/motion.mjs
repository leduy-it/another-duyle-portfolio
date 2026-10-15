const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);

/** One frame owner for all scroll, pointer and canvas effects. No perpetual rAF list. */
function frameLoop() {
  const tasks = new Map();
  let pending = 0,
    previous = 0;
  const tick = (time) => {
    pending = 0;
    if (document.hidden) return;
    const delta = Math.min(64, time - (previous || time - 16));
    previous = time;
    let continueAnimating = false;
    for (const [task, active] of tasks) {
      if (!active) continue;
      const again = Boolean(task(time, delta));
      tasks.set(task, again);
      continueAnimating ||= again;
    }
    if (continueAnimating) schedule();
  };
  const schedule = () => {
    if (!pending && !document.hidden) pending = requestAnimationFrame(tick);
  };
  const request = () => {
    for (const task of tasks.keys()) tasks.set(task, true);
    schedule();
  };
  const visible = () => {
    previous = 0;
    if (document.hidden) {
      cancelAnimationFrame(pending);
      pending = 0;
    } else request();
  };
  document.addEventListener("visibilitychange", visible);
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request);
  return {
    add(task) {
      tasks.set(task, true);
      request();
      return () => tasks.delete(task);
    },
    request,
    destroy() {
      cancelAnimationFrame(pending);
      tasks.clear();
      document.removeEventListener("visibilitychange", visible);
      removeEventListener("scroll", request);
      removeEventListener("resize", request);
    },
  };
}

function reveals(reduced) {
  document.querySelectorAll("[data-reveal-words]").forEach((heading) => {
    if (heading.classList.contains("split")) return;
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((word) => {
        if (!word.trim()) return fragment.append(document.createTextNode(word));
        const mask = document.createElement("span");
        mask.className = "w";
        const inner = document.createElement("span");
        inner.textContent = word;
        mask.append(inner);
        fragment.append(mask);
      });
      node.replaceWith(fragment);
    });
    heading.classList.add("split");
  });
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        if (entry.target.classList.contains("diagram"))
          entry.target.classList.add("draw");
        observer.unobserve(entry.target);
      }),
    { threshold: 0.1, rootMargin: "0px 0px -24px 0px" },
  );
  document.querySelectorAll(".rv,.split,.diagram").forEach((el) => {
    el.querySelectorAll(".w>span").forEach((word, index) =>
      word.style.setProperty("--word-delay", `${Math.min(index * 45, 420)}ms`),
    );
    if (reduced) el.classList.add("in", "draw");
    else observer.observe(el);
  });
  return () => observer.disconnect();
}

function terrain(canvas, frames, reduced, cleanup) {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;
  const host = canvas.parentElement;
  let width = 0,
    height = 0,
    ratio = 1,
    phase = 0,
    active = false,
    lastPaint = 0;
  let mouse = [-9000, -9000],
    target = [-9000, -9000],
    exclusions = [];
  const dark = canvas.hasAttribute("data-dark");
  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    lastPaint = 0;
    const bounds = canvas.getBoundingClientRect();
    exclusions = [...host.querySelectorAll("h1,.lede")].map((el) => {
      const box = el.getBoundingClientRect();
      return [
        box.left - bounds.left - 24,
        box.top - bounds.top - 20,
        box.right - bounds.left + 24,
        box.bottom - bounds.top + 20,
      ];
    });
    frames.request();
  };
  const paint = () => {
    context.clearRect(0, 0, width, height);
    const gap = width < 650 ? 22 : 24;
    const rows = Math.ceil(height / gap),
      columns = Math.ceil(width / gap);
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const x = column * gap,
          depth = row / rows;
        const wave =
          Math.sin(column * 0.13 + phase * 0.6) *
            Math.cos(row * 0.17 - phase * 0.4) +
          Math.sin((column + row) * 0.07 + phase * 0.3);
        let y = row * gap - wave * depth * depth * 14;
        const distance = Math.hypot(x - mouse[0], y - mouse[1]);
        const influence = clamp(1 - distance / 150);
        y -= influence * 16;
        let alpha = (0.06 + depth * 0.4) * (0.2 + clamp(depth / 0.35) * 0.8);
        let exclusion = 1;
        for (const [left, top, right, bottom] of exclusions)
          exclusion = Math.min(
            exclusion,
            clamp(
              Math.hypot(
                Math.max(left - x, 0, x - right),
                Math.max(top - y, 0, y - bottom),
              ) / 58,
            ),
          );
        if (!exclusion) continue;
        alpha *= exclusion;
        context.fillStyle =
          influence > 0.35
            ? `rgba(47,91,255,${Math.min(0.9, alpha + influence * 0.6)})`
            : `${dark ? "rgba(250,250,248," : "rgba(11,11,12,"}${alpha})`;
        const size = 0.65 + Math.max(0, wave) * depth * 0.85 + influence * 1.35;
        context.fillRect(x - size, y - size, size * 2, size * 2);
      }
  };
  const pointer = (event) => {
    const rect = canvas.getBoundingClientRect();
    target = [event.clientX - rect.left, event.clientY - rect.top];
    if (mouse[0] < -5000) mouse = [...target];
    frames.request();
  };
  const leave = () => {
    mouse = target = [-9000, -9000];
    frames.request();
  };
  const observer = new IntersectionObserver((entries) => {
    active = entries[0].isIntersecting;
    frames.request();
  });
  observer.observe(host);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(canvas);
  if (!reduced && matchMedia("(pointer:fine)").matches) {
    host.addEventListener("pointermove", pointer);
    host.addEventListener("pointerleave", leave);
  }
  cleanup.push(
    frames.add((time, delta) => {
      if (!active) return false;
      if (reduced) {
        if (!lastPaint) {
          paint();
          lastPaint = time;
        }
        return false;
      }
      mouse[0] += (target[0] - mouse[0]) * 0.16;
      mouse[1] += (target[1] - mouse[1]) * 0.16;
      if (time - lastPaint >= 32) {
        phase += delta * 0.00065;
        paint();
        lastPaint = time;
      }
      return true;
    }),
  );
  cleanup.push(() => {
    observer.disconnect();
    sizeObserver.disconnect();
    host.removeEventListener("pointermove", pointer);
    host.removeEventListener("pointerleave", leave);
  });
  resize();
}

function timedElements(root) {
  return [...root.querySelectorAll("[data-t]")].map((el) => {
    const [a = 0, b = a + 0.01, c = 2, d = 2] = el.dataset.t
      .split(/\s+/)
      .map(Number);
    return { el, a, b: Math.max(a + 0.001, b), c, d: Math.max(c + 0.001, d) };
  });
}
function renderTimed(elements, progress) {
  for (const { el, a, b, c, d } of elements) {
    const enter = a <= 0 ? 1 : smooth(clamp((progress - a) / (b - a)));
    const exit = smooth(clamp((progress - c) / (d - c)));
    el.style.setProperty("--e", enter.toFixed(4));
    el.style.setProperty("--x", exit.toFixed(4));
    const hidden = enter < 0.001 || exit > 0.999;
    if (el.classList.contains("sc")) el.classList.toggle("off", hidden);
    if (el.classList.contains("copy"))
      el.style.visibility = hidden ? "hidden" : "";
  }
}
function fitBox(field) {
  const box = field?.querySelector(".box");
  if (!box) return;
  const style = getComputedStyle(box),
    width = parseFloat(style.getPropertyValue("--bw")) || 640,
    height = parseFloat(style.getPropertyValue("--bh")) || 520;
  const scale = Math.min(
    1,
    field.clientWidth / width,
    field.clientHeight / height,
  );
  box.style.setProperty("--s", String(scale > 0 ? scale : 1));
}
function sceneControls(section, count, label) {
  const controls = document.createElement("div");
  controls.className = "scene-controls mono";
  const previous = document.createElement("button"),
    next = document.createElement("button"),
    progress = document.createElement("span");
  previous.type = next.type = "button";
  previous.textContent = "←";
  next.textContent = "→";
  previous.setAttribute("aria-label", "Previous scene");
  next.setAttribute("aria-label", "Next scene");
  progress.setAttribute("aria-live", "off");
  controls.append(previous, progress, next);
  const skip = document.createElement("a");
  skip.textContent = "Skip scene ↓";
  skip.href = section.id === "story" ? "#parsing" : "#intro";
  controls.append(skip);
  (
    section.querySelector(".f1-copy>div:last-child") ||
    section.querySelector(".stage-copy") ||
    section
  ).append(controls);
  let current = 0;
  const go = (direction) => {
    const index = clamp(current + direction, 0, count - 1);
    const bounds = section.getBoundingClientRect();
    const p = (index + 0.5) / count;
    scrollTo({
      top: scrollY + bounds.top + (bounds.height - innerHeight) * p,
      behavior: "smooth",
    });
  };
  previous.addEventListener("click", () => go(-1));
  next.addEventListener("click", () => go(1));
  return {
    update(index) {
      current = index;
      progress.textContent = `${label} ${String(index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`;
      previous.disabled = index === 0;
      next.disabled = index === count - 1;
    },
    remove() {
      controls.remove();
    },
  };
}

function story(section, frames, reduced, cleanup) {
  const field = section.querySelector(".field"),
    copies = [...section.querySelectorAll(".copies .copy")];
  const fieldObserver = new ResizeObserver(() => {
    fitBox(field);
    frames.request();
  });
  if (field) fieldObserver.observe(field);
  cleanup.push(() => fieldObserver.disconnect());
  if (reduced) {
    const gallery = document.createElement("div");
    gallery.className = "rm-frames";
    const snapshots = [0.17, 0.46, 0.7, 1];
    copies.forEach((copy, index) => {
      const panel = document.createElement("div");
      panel.className = "rm-frame";
      const caption = copy.cloneNode(true);
      caption.removeAttribute("style");
      caption.removeAttribute("data-t");
      const illustration = field.cloneNode(true);
      panel.append(caption, illustration);
      gallery.append(panel);
      renderTimed(timedElements(illustration), snapshots[index]);
    });
    section.classList.add("rm");
    section.querySelector(".stage-copy").after(gallery);
    const size = () => gallery.querySelectorAll(".field").forEach(fitBox);
    const observer = new ResizeObserver(size);
    observer.observe(gallery);
    size();
    cleanup.push(() => {
      observer.disconnect();
      gallery.remove();
      section.classList.remove("rm");
    });
    return;
  }
  const elements = timedElements(section),
    chapters = [...section.querySelectorAll(".chaps li")];
  const bar = section.querySelector(".pbar i"),
    controls = sceneControls(section, 4, "SC.");
  let progress = 0,
    initial = true;
  cleanup.push(
    frames.add((_, delta) => {
      const bounds = section.getBoundingClientRect(),
        target = clamp(-bounds.top / Math.max(1, bounds.height - innerHeight));
      progress =
        initial || Math.abs(target - progress) > 0.3
          ? target
          : progress + (target - progress) * (1 - Math.exp(-delta / 75));
      initial = false;
      if (Math.abs(target - progress) < 0.0004) progress = target;
      renderTimed(elements, progress);
      const chapter =
        progress < 0.265 ? 0 : progress < 0.525 ? 1 : progress < 0.775 ? 2 : 3;
      chapters.forEach((el, index) =>
        el.classList.toggle("on", index === chapter),
      );
      if (bar) bar.style.transform = `scaleX(${progress})`;
      controls.update(chapter);
      return Math.abs(target - progress) > 0.0004;
    }),
  );
  cleanup.push(() => controls.remove());
  fitBox(field);
}

function parsingConnections(section) {
  const ns = "http://www.w3.org/2000/svg",
    field = section.querySelector(".f1-field");
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("parsing-links");
  svg.setAttribute("aria-hidden", "true");
  const routes = [
    [".f1-crop.c1", ".f1-parsed", "right", "left", 2, -0.19],
    [".f1-crop.c2", ".f1-parsed", "right", "left", 2, 0.18],
    [".f1-parsed", ".f1-chunks", "bottom", "top", 3, 0],
    [".f1-chunks", ".f1-space", "left", "right", 4, 0],
    [".f1-space", ".f1-answer", "bottom", "top", 5, 0],
  ].map(([source, target, exit, entry, stage, offset]) => {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("pathLength", "1");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("r", "2");
    svg.append(path, dot);
    return {
      source: field.querySelector(source),
      target: field.querySelector(target),
      exit,
      entry,
      stage,
      offset,
      path,
      dot,
    };
  });
  field.append(svg);
  const anchor = (rect, side, bounds, offset = 0) => ({
    x:
      (side === "left"
        ? rect.left - 5
        : side === "right"
          ? rect.right + 5
          : rect.left + rect.width * 0.5) - bounds.left,
    y:
      (side === "top"
        ? rect.top - 5
        : side === "bottom"
          ? rect.bottom + 5
          : rect.top + rect.height * (0.5 + offset)) - bounds.top,
  });
  return {
    update(index) {
      if (innerWidth <= 900) return;
      const bounds = field.getBoundingClientRect();
      svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
      for (const route of routes) {
        if (!route.source || !route.target) continue;
        const a = anchor(
            route.source.getBoundingClientRect(),
            route.exit,
            bounds,
          ),
          b = anchor(
            route.target.getBoundingClientRect(),
            route.entry,
            bounds,
            route.offset,
          );
        const vertical = ["top", "bottom"].includes(route.exit);
        const middle = vertical ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
        const d = vertical
          ? `M${a.x},${a.y} C${a.x},${middle} ${b.x},${middle} ${b.x},${b.y}`
          : `M${a.x},${a.y} C${middle},${a.y} ${middle},${b.y} ${b.x},${b.y}`;
        if (route.path.getAttribute("d") !== d) route.path.setAttribute("d", d);
        route.dot.setAttribute("cx", b.x);
        route.dot.setAttribute("cy", b.y);
        route.path.classList.toggle("on", index >= route.stage);
        route.dot.classList.toggle("on", index >= route.stage);
      }
    },
    remove() {
      svg.remove();
    },
  };
}

function parsing(section, frames, reduced, cleanup) {
  const steps = [...section.querySelectorAll(".f1-steps li")];
  if (reduced) {
    section.classList.add("f1-rm");
    section.dataset.s = "5";
    section
      .querySelectorAll(".f1-card,.f1-crop,.f1-chunks,.f1-space,.f1-answer")
      .forEach((el) => el.classList.add("on"));
    cleanup.push(() => section.classList.remove("f1-rm"));
    return;
  }
  const controls = sceneControls(section, 6, "ST."),
    connections = parsingConnections(section);
  let previous = -1,
    settlingUntil = 0;
  section
    .querySelectorAll(".f1-space .pt,.f1-space .hit")
    .forEach((point, i) => {
      point.style.setProperty(
        "--vector-x",
        `${18 + (i % 3) * 13 - Number(point.getAttribute("cx"))}px`,
      );
      point.style.setProperty(
        "--vector-y",
        `${20 + Math.floor(i / 3) * 13 - Number(point.getAttribute("cy"))}px`,
      );
      point.style.transitionDelay = `${i * 32}ms`;
    });
  const states = [
    [".f1-photo", [0, 1]],
    [".f1-parsed", [2]],
    [".f1-chunks", [3]],
    [".f1-space", [4]],
    [".f1-answer", [5]],
  ];
  cleanup.push(
    frames.add((time) => {
      const bounds = section.getBoundingClientRect(),
        progress = clamp(
          -bounds.top / Math.max(1, bounds.height - innerHeight),
        );
      section.style.setProperty("--p", progress.toFixed(4));
      section.style.setProperty(
        "--scan",
        String(clamp((progress * 6 - 1) / 0.9)),
      );
      const index = Math.min(5, Math.floor(progress * 5.999));
      if (index === previous) {
        connections.update(index);
        return (
          time < settlingUntil && bounds.bottom > 0 && bounds.top < innerHeight
        );
      }
      previous = index;
      section.dataset.s = String(index);
      settlingUntil = time + 1400;
      steps.forEach((step, n) => {
        step.classList.toggle("on", index >= n);
        step.classList.toggle("cur", index === n);
        if (n === index) step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
      });
      section.querySelector(".f1-photo")?.classList.toggle("flat", index >= 1);
      section
        .querySelectorAll(".f1-crop")
        .forEach((el) => el.classList.toggle("on", index >= 1));
      for (const [selector, active] of states)
        section.querySelectorAll(selector).forEach((el) => {
          el.classList.toggle("now", active.includes(index));
          el.classList.toggle("on", index >= (active[0] || 0));
        });
      section
        .querySelectorAll(".f1-chunk")
        .forEach((el) => el.classList.toggle("on", index >= 3));
      controls.update(index);
      connections.update(index);
      return bounds.bottom > 0 && bounds.top < innerHeight;
    }),
  );
  cleanup.push(() => {
    controls.remove();
    connections.remove();
  });
}

function interactions(frames, reduced, cleanup) {
  const heading = document.querySelector(".hero h1"),
    hero = heading?.closest(".hero");
  if (heading && hero && !reduced && matchMedia("(pointer:fine)").matches) {
    const box = document.createElement("div");
    box.className = "ocr-box";
    box.setAttribute("aria-hidden", "true");
    const label = document.createElement("i");
    box.append(label);
    hero.append(box);
    let active = null;
    const position = () => {
      if (!active) return false;
      const rect = active.getBoundingClientRect(),
        parent = hero.getBoundingClientRect();
      box.style.transform = `translate(${rect.left - parent.left - 6}px,${rect.top - parent.top - 6}px)`;
      box.style.width = `${rect.width + 12}px`;
      box.style.height = `${rect.height + 12}px`;
      return false;
    };
    const enter = (event) => {
      const word = event.target.closest(".w>span");
      if (!word) return;
      active = word;
      label.textContent = `tok_${String([...heading.querySelectorAll(".w>span")].indexOf(word) + 1).padStart(2, "0")} · conf 0.99`;
      position();
      box.classList.add("on");
    };
    const leave = () => {
      active = null;
      box.classList.remove("on");
    };
    heading.addEventListener("pointerover", enter);
    heading.addEventListener("pointerleave", leave);
    cleanup.push(frames.add(position), () => {
      heading.removeEventListener("pointerover", enter);
      heading.removeEventListener("pointerleave", leave);
      box.remove();
    });
  }
  const paws = document.querySelector(".paws");
  if (paws && !reduced && matchMedia("(pointer:fine)").matches) {
    let time = 0,
      direction = 1;
    const timers = new Set();
    const trail = (event) => {
      if (performance.now() - time < 110) return;
      time = performance.now();
      direction *= -1;
      const rect = paws.getBoundingClientRect(),
        paw = document.createElement("span");
      paw.className = "p";
      paw.setAttribute("aria-hidden", "true");
      paw.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="16" rx="5" ry="4"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="9.5" cy="6" r="2.2"/><circle cx="14.5" cy="6" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/></svg>';
      paw.style.left = `${event.clientX - rect.left + direction * 9}px`;
      paw.style.top = `${event.clientY - rect.top}px`;
      paw.style.setProperty(
        "--rot",
        `${(Math.atan2(event.movementY || 0, event.movementX || 1) * 180) / Math.PI + 90}deg`,
      );
      paws.append(paw);
      const timer = setTimeout(() => {
        timers.delete(timer);
        paw.remove();
      }, 2500);
      timers.add(timer);
    };
    paws.addEventListener("pointermove", trail);
    cleanup.push(() => {
      paws.removeEventListener("pointermove", trail);
      timers.forEach(clearTimeout);
      paws.querySelectorAll(".p").forEach((p) => p.remove());
    });
  }
}

export function initMotion(reduced) {
  const frames = frameLoop(),
    cleanup = [() => frames.destroy(), reveals(reduced)];
  document.documentElement.classList.toggle("reduce-motion", reduced);
  document.documentElement.classList.add("motion-ready");
  document
    .querySelectorAll("canvas.terrain")
    .forEach((canvas) => terrain(canvas, frames, reduced, cleanup));
  const study = document.querySelector(".story");
  if (study) story(study, frames, reduced, cleanup);
  const parse = document.querySelector(".f1");
  if (parse) parsing(parse, frames, reduced, cleanup);
  const parallax = [...document.querySelectorAll("[data-par]")];
  const list = document.querySelector(".pipe-list"),
    axis = document.querySelector(".axis"),
    fill = axis?.querySelector(".fill");
  const pipeSteps = [...document.querySelectorAll(".pipe-step")];
  const pinnedScenes = [...document.querySelectorAll(".story,.f1")];
  cleanup.push(
    frames.add(() => {
      const total = document.documentElement.scrollHeight - innerHeight;
      document
        .querySelector(".reading-progress i")
        ?.style.setProperty("--read", String(total > 0 ? scrollY / total : 0));
      const inScene =
        !reduced &&
        pinnedScenes.some((scene) => {
          const bounds = scene.getBoundingClientRect();
          return bounds.top <= 0 && bounds.bottom >= innerHeight;
        });
      document
        .querySelector(".back-top")
        ?.classList.toggle("visible", scrollY > 1000 && !inScene);
      if (!reduced)
        parallax.forEach((el) => {
          const parent = el.closest("section,article"),
            bounds = parent?.getBoundingClientRect();
          if (!bounds || bounds.bottom < 0 || bounds.top > innerHeight) return;
          el.style.transform = `translate3d(0,${clamp(-bounds.top * Number(el.dataset.par), -48, 80)}px,0)`;
        });
      if (list) {
        const bounds = list.getBoundingClientRect();
        list.style.setProperty(
          "--pp",
          String(
            reduced
              ? 1
              : clamp((innerHeight * 0.55 - bounds.top) / bounds.height),
          ),
        );
      }
      if (fill) {
        const bounds = axis.getBoundingClientRect();
        fill.style.setProperty(
          "--fill",
          `${reduced ? 100 : clamp((innerHeight * 0.6 - bounds.top) / bounds.height) * 100}%`,
        );
      }
      let current = null;
      pipeSteps.forEach((step) => {
        const rect = step.getBoundingClientRect();
        const active = rect.top < innerHeight * 0.65;
        step.classList.toggle("on", active || reduced);
        if (active) current = step.id;
      });
      document.querySelectorAll(".pipe-toc a").forEach((a) => {
        if (a.hash === `#${current}`) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      });
      return false;
    }),
  );
  interactions(frames, reduced, cleanup);
  frames.request();
  return () => {
    cleanup.reverse().forEach((fn) => fn());
    parallax.forEach((el) => el.style.removeProperty("transform"));
  };
}
