import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const json = (body, status = 200, headers = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...headers },
  });
const failure = (error, status) => json({ error }, status);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
const validId = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{20,80}$/.test(value);
const fields = new Set([
  "name",
  "email",
  "subject",
  "message",
  "requestId",
  "website",
]);
function validateContact(body) {
  if (
    !body ||
    Object.keys(body).some((k) => !fields.has(k)) ||
    !validId(body.requestId)
  )
    return null;
  const limits = {
    name: [1, 80],
    email: [3, 254],
    subject: [2, 160],
    message: [10, 8000],
  };
  const clean = { requestId: body.requestId };
  for (const [key, [min, max]] of Object.entries(limits)) {
    if (typeof body[key] !== "string") return null;
    const value = body[key].trim();
    if (
      value.length < min ||
      value.length > max ||
      (key !== "message" && /[\r\n\x00]/.test(value))
    )
      return null;
    clean[key] = value;
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(clean.email) || body.website)
    return null;
  return clean;
}

export function createApplication({
  env = process.env,
  store,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const fingerprint = (request) =>
    createHmac("sha256", env.CONTACT_SECRET || "development")
      .update(
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown",
      )
      .digest("hex")
      .slice(0, 32);
  const allowedOrigin = (request) => {
    const origin = request.headers.get("origin");
    const own = new URL(request.url).origin;
    const canonical = env.SITE_URL || "https://another.duyle.me";
    const deploymentOrigins = [
      env.VERCEL_URL,
      env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .filter(Boolean)
      .map((host) => `https://${host}`);
    // Vercel metadata names one production domain, not every attached alias.
    const additionalOrigins = (env.SITE_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" && url.origin === value;
        } catch {
          return false;
        }
      });
    return (
      origin === canonical ||
      deploymentOrigins.includes(origin) ||
      additionalOrigins.includes(origin) ||
      (env.NODE_ENV !== "production" &&
        origin === own &&
        /^(localhost|127\.0\.0\.1)$/.test(new URL(own).hostname))
    );
  };
  const limit = async (request, type, maximum) =>
    store &&
    (await store.increment(`limit:${type}:${fingerprint(request)}`, 3600)) <=
      maximum;

  async function contact(request, body) {
    const input = validateContact(body);
    if (!input) return failure("invalid_contact", 400);
    if (!store) return failure("storage_unavailable", 503);
    const identity = fingerprint(request);
    const contentHash = hash(JSON.stringify(input));
    const savedReceipt = async (previous) => {
      if (
        previous.identity !== identity ||
        previous.contentHash !== contentHash
      )
        return failure("request_conflict", 409);
      // A prior write may have stored the body but failed to index it.
      // Confirm both writes before telling the browser it can clear its draft.
      await store.saveContact(previous);
      return json(
        {
          status:
            previous.status === "submitted" || previous.status === "accepted"
              ? previous.status
              : "stored",
          requestId: input.requestId,
        },
        202,
      );
    };
    const previous = await store.getContact(input.requestId);
    if (previous) return savedReceipt(previous);
    if (!(await limit(request, "contact", 5)))
      return failure("rate_limited", 429);
    const lock = `lock:${input.requestId}`;
    if (!(await store.set(lock, true, 60, true)))
      return json({ status: "processing", requestId: input.requestId }, 202);
    try {
      const duplicate = await store.getContact(input.requestId);
      if (duplicate) return savedReceipt(duplicate);
      const record = {
        ...input,
        createdAt: new Date(now()).toISOString(),
        contentHash,
        identity,
        status: "stored",
      };
      // Store first. A failed write must never authorize a browser send.
      await store.saveContact(record);
      if (
        env.CONTACT_PROVIDER === "resend" &&
        env.RESEND_API_KEY &&
        env.CONTACT_FROM_EMAIL
      ) {
        record.status = "sending";
        await store.saveContact(record);
        try {
          const response = await fetchImpl("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Idempotency-Key": `another-${input.requestId}`,
            },
            body: JSON.stringify({
              from: env.CONTACT_FROM_EMAIL,
              to: ["levduyit@gmail.com"],
              reply_to: input.email,
              subject: `Another view / ${input.subject}`,
              text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
            }),
            signal: AbortSignal.timeout(12_000),
          });
          const receipt = await response.json();
          if (!response.ok || typeof receipt.id !== "string")
            throw new Error("provider_unavailable");
          record.status = "accepted";
          record.providerId = receipt.id;
          record.provider = "resend";
        } catch {
          record.status = "delivery_uncertain";
        }
        await store.saveContact(record);
        return json(
          {
            status: record.status === "accepted" ? "accepted" : "stored",
            requestId: input.requestId,
          },
          202,
        );
      }
      if (env.CONTACT_PROVIDER && env.CONTACT_PROVIDER !== "formsubmit")
        return json({ status: "stored", requestId: input.requestId }, 202);
      const relayNonce = randomBytes(24).toString("base64url");
      record.status = "relay_pending";
      record.relayNonce = hash(relayNonce);
      await store.saveContact(record);
      return json(
        { status: "relay_required", requestId: input.requestId, relayNonce },
        202,
      );
    } finally {
      await store.remove(lock);
    }
  }

  async function acknowledge(request, body) {
    if (!store) return failure("storage_unavailable", 503);
    if (
      !validId(body?.requestId) ||
      typeof body?.relayNonce !== "string" ||
      body.relayNonce.length > 100
    )
      return failure("invalid_request", 400);
    const record = await store.getContact(body.requestId);
    if (
      !record ||
      record.identity !== fingerprint(request) ||
      !equal(record.relayNonce, hash(body.relayNonce))
    )
      return failure("invalid_acknowledgement", 403);
    record.status = "submitted";
    record.reportedBy = "browser";
    record.submittedAt = new Date(now()).toISOString();
    delete record.relayNonce;
    await store.saveContact(record);
    return json({ status: "submitted", requestId: body.requestId });
  }

  return async (request) => {
    try {
      const path = new URL(request.url).pathname
        .replace(/^\/api\/?/, "")
        .replace(/\/$/, "");
      if (path === "health" && request.method === "GET")
        return json({ status: "ok", contactStorage: Boolean(store) });
      if (request.method !== "POST") return failure("method_not_allowed", 405);
      if (!allowedOrigin(request)) return failure("origin_not_allowed", 403);
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        return failure("invalid_content_type", 415);
      if (Number(request.headers.get("content-length") || 0) > 48000)
        return failure("request_too_large", 413);
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 48000)
        return failure("request_too_large", 413);
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return failure("invalid_json", 400);
      }
      if (path === "contact") return await contact(request, body);
      if (path === "contact/ack") return await acknowledge(request, body);
      return failure("not_found", 404);
    } catch {
      return failure("service_unavailable", 503);
    }
  };
}
