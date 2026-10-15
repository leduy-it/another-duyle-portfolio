const DRAFT_KEY = "another-duy:contact-draft:v1";
const post = (path, body) =>
  fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

export function initContact() {
  const form = document.querySelector("#contact-form");
  if (!form) return;
  const status = document.querySelector("#contact-status"),
    submit = form.querySelector("[type=submit]"),
    fallback = form.querySelector("[data-mail-fallback]");
  const names = ["name", "email", "subject", "message"];
  let requestId = crypto.randomUUID(),
    busy = false,
    finished = false;
  const values = () =>
    Object.fromEntries(names.map((name) => [name, form.elements[name].value]));
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved) {
      names.forEach((name) => {
        if (typeof saved[name] === "string")
          form.elements[name].value = saved[name];
      });
      if (/^[a-zA-Z0-9_-]{20,80}$/.test(saved.requestId || ""))
        requestId = saved.requestId;
    }
  } catch {
    /* Browser storage is optional. */
  }
  function updateFallback() {
    const data = values();
    fallback.href = `mailto:levduyit@gmail.com?subject=${encodeURIComponent(data.subject || "Hello from Another view")}&body=${encodeURIComponent(`${data.message}\n\n${data.name}${data.email ? ` <${data.email}>` : ""}`)}`;
  }
  function save() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...values(), requestId }),
      );
    } catch {
      /* The form still works in private mode. */
    }
    updateFallback();
  }
  function clear() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* Optional. */
    }
  }
  form.addEventListener("input", () => {
    if (finished) {
      finished = false;
      requestId = crypto.randomUUID();
      submit.disabled = false;
      status.textContent = "";
    }
    save();
  });
  form.querySelector("[data-clear-draft]")?.addEventListener("click", () => {
    if (busy) return;
    form.reset();
    clear();
    requestId = crypto.randomUUID();
    finished = false;
    submit.disabled = false;
    status.textContent = "Draft cleared from this browser.";
    updateFallback();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || finished || !form.reportValidity()) return;
    busy = true;
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    save();
    const body = {
      ...values(),
      requestId,
      website: form.elements.website.value,
    };
    names.forEach((name) => (form.elements[name].readOnly = true));
    status.className = "contact-status pending";
    status.textContent = "Saving your note…";
    try {
      const response = await post("contact", body),
        receipt = await response.json();
      if (!response.ok) {
        if (response.status === 429) throw new Error("rate_limited");
        if (response.status === 409) {
          requestId = crypto.randomUUID();
          save();
        }
        throw new Error("unconfirmed");
      }
      let state = receipt.status;
      if (state === "relay_required" && receipt.relayNonce) {
        status.textContent = "Your note is saved. Submitting the email…";
        // Exactly one dispatch. A timeout may still have sent the email: never auto-retry.
        try {
          const relayed = await fetch(
            "https://formsubmit.co/ajax/levduyit@gmail.com",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                name: body.name,
                email: body.email,
                _replyto: body.email,
                subject: body.subject,
                message: body.message,
                _subject: `Another view / ${body.subject}`,
                _url: `${location.origin}/contact`,
                _captcha: "false",
                _template: "table",
              }),
              signal: AbortSignal.timeout(15_000),
            },
          );
          const result = await relayed.json();
          if (relayed.ok && [true, "true"].includes(result.success)) {
            const acknowledged = await post("contact/ack", {
              requestId,
              relayNonce: receipt.relayNonce,
            });
            if (acknowledged.ok) state = "submitted";
            else state = "stored";
          } else state = "stored";
        } catch {
          state = "stored";
        }
      }
      if (state === "accepted")
        status.textContent =
          "Your note was accepted for email delivery. Duy can reply to the address you left.";
      else if (state === "submitted")
        status.textContent =
          "Your note is saved and the email relay acknowledged submission. Thank you — Duy can reply to your email.";
      else if (state === "processing") {
        status.textContent =
          "This note is already being processed. Your draft is kept here; please wait before checking again.";
        return;
      } else
        status.textContent =
          "Your note is saved in Duy’s private inbox. Email submission has not been confirmed. You can also use your email app below.";
      status.className = `contact-status ${["accepted", "submitted"].includes(state) ? "success" : "saved"}`;
      const reference = document.createElement("small");
      reference.className = "mono";
      reference.textContent = `${"Reference"}: ${requestId.slice(0, 8)}`;
      status.append(reference);
      finished = true;
      clear();
      status.focus({ preventScroll: true });
    } catch (error) {
      status.className = "contact-status error";
      status.textContent =
        error.message === "rate_limited"
          ? "A few too many notes in a short time. Your draft is safe here; please try later or use your email app."
          : "We couldn’t confirm submission. Your draft is still here. Try again or use your email app below.";
      status.focus({ preventScroll: true });
    } finally {
      busy = false;
      submit.disabled = finished;
      form.removeAttribute("aria-busy");
      names.forEach((name) => (form.elements[name].readOnly = false));
    }
  });
  updateFallback();
}
