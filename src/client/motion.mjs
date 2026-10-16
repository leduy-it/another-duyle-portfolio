import { frameLoop, geometryCache } from "./motion-runtime.mjs";

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value) => value * value * (3 - 2 * value);

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
      word.style.setProperty("--word-delay", `${Math.min(index * 28, 280)}ms`),
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
    dots = [];
  const constrained =
    reduced ||
    matchMedia("(pointer:coarse)").matches ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    navigator.hardwareConcurrency <= 4;
  const dark = canvas.hasAttribute("data-dark");
  const resize = () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, constrained ? 1 : 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    lastPaint = 0;
    const bounds = canvas.getBoundingClientRect();
    const exclusions = [...host.querySelectorAll("h1,.lede")].map((el) => {
      const box = el.getBoundingClientRect();
      return [
        box.left - bounds.left - 24,
        box.top - bounds.top - 20,
        box.right - bounds.left + 24,
        box.bottom - bounds.top + 20,
      ];
    });
    dots = [];
    const gap = width < 650 ? 24 : 28;
    const rows = Math.ceil(height / gap),
      columns = Math.ceil(width / gap);
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const x = column * gap,
          y = row * gap,
          depth = row / rows;
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
        if (exclusion)
          dots.push({
            x,
            y,
            row,
            column,
            depth,
            alpha:
              (0.06 + depth * 0.4) *
              (0.2 + clamp(depth / 0.35) * 0.8) *
              exclusion,
          });
      }
    frames.request();
  };
  const paint = () => {
    context.clearRect(0, 0, width, height);
    const pointerActive = mouse[0] > -5000;
    const rowWaves = [],
      columnWaves = [],
      diagonalWaves = [];
    for (const dot of dots) {
      const { x, row, column, depth, alpha } = dot;
      rowWaves[row] ??= Math.cos(row * 0.17 - phase * 0.4);
      columnWaves[column] ??= Math.sin(column * 0.13 + phase * 0.6);
      diagonalWaves[row + column] ??= Math.sin(
        (row + column) * 0.07 + phase * 0.3,
      );
      const wave =
        columnWaves[column] * rowWaves[row] + diagonalWaves[row + column];
      let y = dot.y - wave * depth * depth * 14;
      const influence = pointerActive
        ? clamp(1 - Math.hypot(x - mouse[0], y - mouse[1]) / 150)
        : 0;
      y -= influence * 16;
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
  if (!constrained && matchMedia("(pointer:fine)").matches) {
    host.addEventListener("pointermove", pointer);
    host.addEventListener("pointerleave", leave);
  }
  cleanup.push(
    frames.add((time) => {
      if (!active) return false;
      if (constrained || width < 650) {
        if (!lastPaint) {
          paint();
          lastPaint = time;
        }
        return false;
      }
      mouse[0] += (target[0] - mouse[0]) * 0.16;
      mouse[1] += (target[1] - mouse[1]) * 0.16;
      if (time - lastPaint >= (mouse[0] > -5000 ? 16 : 40)) {
        phase = time * 0.0003;
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
    return {
      el,
      a,
      b: Math.max(a + 0.001, b),
      c,
      d: Math.max(c + 0.001, d),
      last: "",
    };
  });
}
function renderTimed(elements, progress) {
  for (const item of elements) {
    const { el, a, b, c, d } = item;
    const enter = a <= 0 ? 1 : smooth(clamp((progress - a) / (b - a)));
    const exit = smooth(clamp((progress - c) / (d - c)));
    const state = `${enter.toFixed(4)}:${exit.toFixed(4)}`;
    if (item.last === state) continue;
    item.last = state;
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
  let current = -1;
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
      if (current === index) return;
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

function story(section, frames, geometry, reduced, cleanup) {
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
  const box = geometry.track(section);
  let progress = 0,
    lastChapter = -1,
    initial = true;
  cleanup.push(
    frames.add((_, delta) => {
      const target = clamp(
        (scrollY - box.top) / Math.max(1, box.height - innerHeight),
      );
      if (!initial && target === progress) return false;
      progress =
        initial || Math.abs(target - progress) > 0.3
          ? target
          : progress + (target - progress) * (1 - Math.exp(-delta / 50));
      initial = false;
      if (Math.abs(target - progress) < 0.0004) progress = target;
      renderTimed(elements, progress);
      const chapter =
        progress < 0.265 ? 0 : progress < 0.525 ? 1 : progress < 0.775 ? 2 : 3;
      if (chapter !== lastChapter) {
        chapters.forEach((el, index) =>
          el.classList.toggle("on", index === chapter),
        );
        lastChapter = chapter;
      }
      if (bar) bar.style.transform = `scaleX(${progress})`;
      controls.update(chapter);
      return Math.abs(target - progress) > 0.0004;
    }),
  );
  cleanup.push(() => controls.remove());
  fitBox(field);
}

function parsingConnections(section, geometry) {
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
  // Use final layout boxes, excluding animated transforms. Connectors can draw
  // once toward their destination instead of forcing layout on every frame.
  const layoutBox = (el) => {
    let left = 0,
      top = 0;
    for (let node = el; node && node !== field; node = node.offsetParent) {
      left += node.offsetLeft;
      top += node.offsetTop;
    }
    return {
      left,
      top,
      right: left + el.offsetWidth,
      bottom: top + el.offsetHeight,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
  };
  const anchor = (rect, side, offset = 0) => ({
    x:
      side === "left"
        ? rect.left - 5
        : side === "right"
          ? rect.right + 5
          : rect.left + rect.width * 0.5,
    y:
      side === "top"
        ? rect.top - 5
        : side === "bottom"
          ? rect.bottom + 5
          : rect.top + rect.height * (0.5 + offset),
  });
  let size = "",
    dirty = true,
    lastIndex = -1;
  geometry.observe(field);
  const stop = geometry.read(() => {
    if (innerWidth <= 900) return;
    size = `0 0 ${field.clientWidth} ${field.clientHeight}`;
    for (const route of routes) {
      const a = anchor(layoutBox(route.source), route.exit),
        b = anchor(layoutBox(route.target), route.entry, route.offset);
      const vertical = ["top", "bottom"].includes(route.exit);
      const middle = vertical ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
      route.d = vertical
        ? `M${a.x},${a.y} C${a.x},${middle} ${b.x},${middle} ${b.x},${b.y}`
        : `M${a.x},${a.y} C${middle},${a.y} ${middle},${b.y} ${b.x},${b.y}`;
      route.b = b;
    }
    dirty = true;
  });
  return {
    update(index) {
      if (innerWidth <= 900 || (!dirty && index === lastIndex)) return;
      if (dirty) {
        svg.setAttribute("viewBox", size);
        for (const route of routes) {
          route.path.setAttribute("d", route.d);
          route.dot.setAttribute("cx", route.b.x);
          route.dot.setAttribute("cy", route.b.y);
        }
        dirty = false;
      }
      if (index !== lastIndex) {
        for (const route of routes) {
          route.path.classList.toggle("on", index >= route.stage);
          route.dot.classList.toggle("on", index >= route.stage);
        }
        lastIndex = index;
      }
    },
    remove() {
      stop();
      svg.remove();
    },
  };
}

function parsing(section, frames, geometry, reduced, cleanup) {
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
    connections = parsingConnections(section, geometry),
    box = geometry.track(section),
    bar = section.querySelector(".f1-bar i"),
    scanner = section.querySelector(".f1-scan");
  let previous = -1,
    lastProgress = -1,
    lastScan = -1;
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
    frames.add(() => {
      const progress = clamp(
        (scrollY - box.top) / Math.max(1, box.height - innerHeight),
      );
      if (progress !== lastProgress) {
        bar.style.transform = `scaleX(${progress})`;
        lastProgress = progress;
      }
      const scan = clamp((progress * 6 - 1) / 0.9);
      if (scan !== lastScan) {
        scanner.style.transform = `translate3d(0,${scan * 100}%,0)`;
        lastScan = scan;
      }
      const index = Math.min(5, Math.floor(progress * 5.999));
      if (index === previous) {
        connections.update(index);
        return false;
      }
      previous = index;
      section.dataset.s = String(index);

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
      return false;
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
    geometry = geometryCache(frames),
    cleanup = [
      () => frames.destroy(),
      () => geometry.destroy(),
      reveals(reduced),
    ];
  document.documentElement.classList.toggle("reduce-motion", reduced);
  document.documentElement.classList.add("motion-ready");
  document
    .querySelectorAll("canvas.terrain")
    .forEach((canvas) => terrain(canvas, frames, reduced, cleanup));
  const study = document.querySelector(".story");
  if (study) story(study, frames, geometry, reduced, cleanup);
  const parse = document.querySelector(".f1");
  if (parse) parsing(parse, frames, geometry, reduced, cleanup);
  const parallax = [...document.querySelectorAll("[data-par]")].map((el) => ({
    el,
    box: geometry.track(el.closest("section,article")),
    amount: Number(el.dataset.par),
  }));
  const list = document.querySelector(".pipe-list"),
    listBox = geometry.track(list),
    rail = list?.querySelector(".pipe-rail i");
  const axis = document.querySelector(".axis"),
    axisBox = geometry.track(axis),
    fill = axis?.querySelector(".fill");
  const reading = document.querySelector(".reading-progress i"),
    back = document.querySelector(".back-top");
  const pipeSteps = [...document.querySelectorAll(".pipe-step")].map((el) => ({
    el,
    box: geometry.track(el),
  }));
  const toc = [...document.querySelectorAll(".pipe-toc a")];
  const pinnedScenes = [...document.querySelectorAll(".story,.f1")].map((el) =>
    geometry.track(el),
  );
  cleanup.push(
    frames.add(() => {
      const y = scrollY,
        height = innerHeight,
        total = geometry.height - height;
      if (reading)
        reading.style.transform = `scaleX(${total > 0 ? y / total : 0})`;
      const inScene =
        !reduced &&
        pinnedScenes.some(
          (box) => box.top <= y && box.top + box.height >= y + height,
        );
      back?.classList.toggle("visible", y > 1000 && !inScene);
      if (!reduced)
        for (const { el, box, amount } of parallax) {
          const top = box.top - y;
          if (top + box.height < 0 || top > height) continue;
          el.style.transform = `translate3d(0,${clamp(-top * amount, -48, 80)}px,0)`;
        }
      if (rail)
        rail.style.transform = `scaleY(${reduced ? 1 : clamp((height * 0.55 - listBox.top + y) / listBox.height)})`;
      if (fill)
        fill.style.transform = `scaleY(${reduced ? 1 : clamp((height * 0.6 - axisBox.top + y) / axisBox.height)})`;
      let current = null;
      for (const { el, box } of pipeSteps) {
        const active = box.top - y < height * 0.65;
        el.classList.toggle("on", active || reduced);
        if (active) current = el.id;
      }
      for (const a of toc) {
        if (a.hash === `#${current}`) a.setAttribute("aria-current", "step");
        else a.removeAttribute("aria-current");
      }
      return false;
    }),
  );
  interactions(frames, reduced, cleanup);
  frames.request();
  return () => {
    cleanup.reverse().forEach((fn) => fn());
    parallax.forEach(({ el }) => el.style.removeProperty("transform"));
  };
}
