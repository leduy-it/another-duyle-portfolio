/** Scroll only invalidates animation state. Geometry is read in a separate phase. */
export function frameLoop() {
  const tasks = new Map(),
    measurements = new Set();
  let pending = 0,
    previous = 0;
  const schedule = () => {
    if (!pending && !document.hidden) pending = requestAnimationFrame(tick);
  };
  const request = () => {
    for (const task of tasks.keys()) tasks.set(task, true);
    schedule();
  };
  const tick = (time) => {
    pending = 0;
    if (document.hidden) return;
    const delta = Math.min(64, time - (previous || time - 16));
    previous = time;
    // All geometry reads finish before any animated style or SVG is written.
    const reads = [...measurements];
    measurements.clear();
    reads.forEach((read) => read());
    let again = false;
    for (const [task, active] of tasks) {
      if (!active) continue;
      const running = Boolean(task(time, delta));
      tasks.set(task, running);
      again ||= running;
    }
    if (again || measurements.size) schedule();
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
    measure(read) {
      measurements.add(read);
      request();
    },
    request,
    destroy() {
      cancelAnimationFrame(pending);
      tasks.clear();
      measurements.clear();
      document.removeEventListener("visibilitychange", visible);
      removeEventListener("scroll", request);
      removeEventListener("resize", request);
    },
  };
}

/** Stable document coordinates; resize, font loading and content reflow refresh them. */
export function geometryCache(frames) {
  const entries = new Map(),
    readers = new Set();
  let alive = true;
  const geometry = { height: 0 };
  const refresh = () => {
    geometry.height = document.documentElement.scrollHeight;
    const y = scrollY;
    for (const [el, box] of entries) {
      const rect = el.getBoundingClientRect();
      Object.assign(box, {
        top: rect.top + y,
        height: rect.height,
        width: rect.width,
      });
    }
    readers.forEach((read) => read());
  };
  const invalidate = () => {
    if (alive) frames.measure(refresh);
  };
  const observer = new ResizeObserver(invalidate);
  observer.observe(document.body);
  addEventListener("resize", invalidate);
  document.fonts.ready.then(invalidate);
  return Object.assign(geometry, {
    track(el) {
      if (!el) return null;
      if (!entries.has(el)) {
        entries.set(el, {});
        observer.observe(el);
        invalidate();
      }
      return entries.get(el);
    },
    read(callback) {
      readers.add(callback);
      invalidate();
      return () => readers.delete(callback);
    },
    observe(el) {
      observer.observe(el);
    },
    invalidate,
    destroy() {
      alive = false;
      observer.disconnect();
      removeEventListener("resize", invalidate);
      entries.clear();
      readers.clear();
    },
  });
}
