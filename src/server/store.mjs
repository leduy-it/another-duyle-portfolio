/** Test/local-only storage. Production fails closed if durable storage is absent. */
export class MemoryStore {
  values = new Map();
  contacts = new Map();
  async get(key) {
    const item = this.values.get(key);
    if (!item || item.until < Date.now()) return null;
    return structuredClone(item.value);
  }
  async set(key, value, ttl = 86400, nx = false) {
    const previous = this.values.get(key);
    if (nx && previous && previous.until >= Date.now()) return false;
    this.values.set(key, {
      value: structuredClone(value),
      until: Date.now() + ttl * 1000,
    });
    return true;
  }
  async remove(key) {
    this.values.delete(key);
  }
  async increment(key, ttl) {
    const n = ((await this.get(key)) || 0) + 1;
    await this.set(key, n, ttl);
    return n;
  }
  async saveContact(contact) {
    this.contacts.set(contact.requestId, structuredClone(contact));
  }
  async getContact(id) {
    return structuredClone(this.contacts.get(id) || null);
  }
  async listContacts() {
    return [...this.contacts.values()]
      .map((c) => structuredClone(c))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class RedisStore {
  constructor(
    url,
    token,
    { namespace = "anotherportfolio:production", fetchImpl = fetch } = {},
  ) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.namespace = namespace;
    this.fetchImpl = fetchImpl;
  }
  key(key) {
    return `${this.namespace}:${key}`;
  }
  async command(...command) {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("storage_unavailable");
    const payload = await response.json();
    if (payload.error) throw new Error("storage_unavailable");
    return payload.result;
  }
  async get(key) {
    const result = await this.command("GET", this.key(key));
    return result == null
      ? null
      : typeof result === "string"
        ? JSON.parse(result)
        : result;
  }
  async set(key, value, ttl = 86400, nx = false) {
    return (
      (await this.command(
        "SET",
        this.key(key),
        JSON.stringify(value),
        "EX",
        ttl,
        ...(nx ? ["NX"] : []),
      )) === "OK"
    );
  }
  async remove(key) {
    await this.command("DEL", this.key(key));
  }
  async increment(key, ttl) {
    const count = await this.command("INCR", this.key(key));
    // Set an expiry on every call so a failed first call cannot leave a permanent counter.
    await this.command("EXPIRE", this.key(key), ttl);
    return count;
  }
  async saveContact(contact) {
    const remaining = Math.ceil(
      (Date.parse(contact.createdAt) + 90 * 86400_000 - Date.now()) / 1000,
    );
    if (remaining <= 0) throw new Error("record_expired");
    await this.set(`contact:${contact.requestId}`, contact, remaining);
    await this.command(
      "ZADD",
      this.key("contacts"),
      Date.parse(contact.createdAt),
      contact.requestId,
    );
  }
  async getContact(id) {
    return this.get(`contact:${id}`);
  }
  async listContacts() {
    const ids = await this.command("ZREVRANGE", this.key("contacts"), 0, 199);
    return (await Promise.all(ids.map((id) => this.getContact(id)))).filter(
      Boolean,
    );
  }
}

export function productionStore(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token
    ? new RedisStore(url, token, {
        namespace: `anotherportfolio:${env.VERCEL_ENV || "development"}`,
      })
    : null;
}
