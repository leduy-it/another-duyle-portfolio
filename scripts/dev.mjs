import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { Readable } from "node:stream";
import { createApplication } from "../src/server/application.mjs";
import { productionStore, MemoryStore } from "../src/server/store.mjs";
await import("./build.mjs");
const root = resolve(new URL("../dist", import.meta.url).pathname);
const port = Number(process.env.PORT || 4317);
const app = createApplication({
  store: productionStore(process.env) || new MemoryStore(),
});
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".pdf": "application/pdf",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith("/api/")) {
      const options = { method: req.method, headers: req.headers };
      if (!["GET", "HEAD"].includes(req.method)) {
        options.body = Readable.toWeb(req);
        options.duplex = "half";
      }
      const response = await app(new Request(url, options));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (path === root) path += "/index.html";
    else if (!extname(path)) path += ".html";
    let status = 200;
    try {
      await stat(path);
    } catch {
      path = root + "/404.html";
      status = 404;
    }
    const file = await readFile(path);
    res.writeHead(status, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : file);
  } catch {
    res.writeHead(500);
    res.end("Preview error");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Local: http://localhost:${port}`),
);
