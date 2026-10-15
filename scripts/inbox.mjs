import { productionStore } from "../src/server/store.mjs";
const env = {
  ...process.env,
  ...(process.argv.includes("--production")
    ? { VERCEL_ENV: "production" }
    : {}),
};
const store = productionStore(env);
if (!store) throw new Error("Server-only Redis configuration is required.");
const notes = await store.listContacts();
for (const note of notes) {
  console.log(`${note.createdAt} · ${note.status} · ${note.requestId}`);
  console.log(`${note.name} <${note.email}> — ${note.subject}`);
  console.log(note.message);
  console.log("");
}
console.log(
  `${notes.length} recent records. A submission acknowledgement is not inbox-delivery evidence.`,
);
