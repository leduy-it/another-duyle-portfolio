import test from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../src/server/application.mjs";
import { MemoryStore, RedisStore } from "../src/server/store.mjs";

const env = {
  SITE_URL: "https://another.duyle.me",
  CONTACT_SECRET: "a".repeat(48),
  CONTACT_PROVIDER: "formsubmit",
};
const draft = {
  name: "Test Visitor",
  email: "visitor@example.com",
  subject: "A collaboration",
  message: "I would like to discuss an OCR project.",
  requestId: "7ef7977b-8be1-4a02-a01f-284c48b7c644",
};
const request = (path, body, headers = {}) =>
  new Request(`https://another.duyle.me/api/${path}`, {
    method: "POST",
    headers: {
      origin: env.SITE_URL,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.4",
      ...headers,
    },
    body: JSON.stringify(body),
  });
function setup(extra = {}) {
  const store = new MemoryStore();
  return { store, app: createApplication({ env, store, ...extra }) };
}

test("contact rejects a cross-origin request before storing private text", async () => {
  const { app, store } = setup();
  assert.equal(
    (
      await app(
        request("contact", draft, { origin: "https://attacker.example" }),
      )
    ).status,
    403,
  );
  assert.equal((await store.listContacts()).length, 0);
});
test("contact rejects invalid reply-to, oversized text and unknown fields", async () => {
  const { app } = setup();
  for (const change of [
    { email: "a@b.com\r\nBcc:other@example.com" },
    { message: "a".repeat(8001) },
    { email: "" },
    { to: "other@example.com" },
  ]) {
    assert.equal(
      (await app(request("contact", { ...draft, ...change }))).status,
      400,
    );
  }
});
test("a contact is durable before authorizing a single browser relay", async () => {
  const { app, store } = setup();
  const response = await app(request("contact", draft));
  assert.equal(response.status, 202);
  const receipt = await response.json();
  assert.equal(receipt.status, "relay_required");
  assert.ok(receipt.relayNonce);
  const saved = (await store.listContacts())[0];
  assert.equal(saved.message, draft.message);
  assert.equal(saved.email, draft.email);
  assert.equal(saved.status, "relay_pending");
});
test("retry and concurrent clicks never authorize duplicate relay sends", async () => {
  const { app } = setup();
  const receipts = await Promise.all(
    Array.from({ length: 3 }, () =>
      app(request("contact", draft)).then((r) => r.json()),
    ),
  );
  assert.equal(receipts.filter((r) => r.status === "relay_required").length, 1);
  assert.equal(receipts.filter((r) => r.relayNonce).length, 1);
});
test("a request ID cannot replace an existing message", async () => {
  const { app } = setup();
  await app(request("contact", draft));
  assert.equal(
    (
      await app(
        request("contact", { ...draft, message: "Different private content." }),
      )
    ).status,
    409,
  );
});
test("relay acknowledgement is bound to its one-use nonce and remains a submission report", async () => {
  const { app, store } = setup();
  const receipt = await (await app(request("contact", draft))).json();
  assert.equal(
    (
      await app(
        request("contact/ack", {
          requestId: draft.requestId,
          relayNonce: "wrong",
        }),
      )
    ).status,
    403,
  );
  const response = await app(
    request("contact/ack", {
      requestId: draft.requestId,
      relayNonce: receipt.relayNonce,
    }),
  );
  assert.equal((await response.json()).status, "submitted");
  const saved = (await store.listContacts())[0];
  assert.equal(saved.status, "submitted");
  assert.equal(saved.reportedBy, "browser");
  assert.equal(saved.delivered, undefined);
  assert.equal(saved.relayNonce, undefined);
});
test("unavailable durable storage cannot produce a success confirmation", async () => {
  const app = createApplication({ env, store: null });
  assert.equal((await app(request("contact", draft))).status, 503);
});
test("contact rate limiting is enforced across different request IDs", async () => {
  const { app } = setup();
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await app(
          request("contact", {
            ...draft,
            requestId: `request_${String(i).padStart(24, "0")}`,
          }),
        )
      ).status,
      202,
    );
  assert.equal(
    (
      await app(
        request("contact", {
          ...draft,
          requestId: "request_000000000000000000000099",
        }),
      )
    ).status,
    429,
  );
});

test("a partial contact write is repaired before confirming the saved note", async () => {
  const values = new Map(),
    index = new Set();
  let failFirstIndexWrite = true;
  const store = new RedisStore("https://redis.invalid", "test-token", {
    namespace: "test",
    fetchImpl: async (_url, options) => {
      const [command, key, ...args] = JSON.parse(options.body);
      let result;
      if (command === "GET") result = values.get(key) ?? null;
      else if (command === "SET") {
        if (args.includes("NX") && values.has(key)) result = null;
        else {
          values.set(key, args[0]);
          result = "OK";
        }
      } else if (command === "DEL") {
        values.delete(key);
        result = 1;
      } else if (command === "INCR") {
        result = Number(values.get(key) || 0) + 1;
        values.set(key, String(result));
      } else if (command === "EXPIRE") result = 1;
      else if (command === "ZADD") {
        if (failFirstIndexWrite) {
          failFirstIndexWrite = false;
          return Response.json(
            { error: "temporary index outage" },
            { status: 503 },
          );
        }
        index.add(args[1]);
        result = 1;
      } else if (command === "ZREVRANGE") result = [...index];
      else throw new Error(`Unexpected Redis command: ${command}`);
      return Response.json({ result });
    },
  });
  const app = createApplication({ env, store });
  assert.equal((await app(request("contact", draft))).status, 503);
  assert.equal((await store.listContacts()).length, 0);
  assert.equal(
    (await store.getContact(draft.requestId)).message,
    draft.message,
  );
  const retry = await app(request("contact", draft));
  assert.equal(retry.status, 202);
  assert.equal((await retry.json()).status, "stored");
  assert.equal((await store.listContacts()).length, 1);
});
