import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  categories,
  catalog,
  dailyTip,
  scenePrompt,
} from "../public/catalog.js";
const temp = await mkdtemp(path.join(os.tmpdir(), "manifestation-test-"));
process.env.DATA_DIR = temp;
delete process.env.OPENAI_API_KEY;
delete process.env.RESEND_API_KEY;
const { server, validateState, tick } = await import("../server.mjs");
let base, cookie;
before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
});
const state = () => ({
  dreams: [
    {
      id: "dream-1",
      title: "Mi camioneta",
      category: "vehicles",
      color: "#e56c4c",
      style: "Natural",
      climate: "Soleado",
      emotion: "Libertad",
      status: "dreaming",
      image: "/assets/vehicles.jpg",
      pieces: [],
      history: [],
      details: "Una camioneta azul con portaequipaje",
    },
  ],
  journal: [],
  favorites: [],
  active: "dream-1",
  settings: {
    name: "Tomba",
    time: "09:00",
    zone: "America/Santiago",
    email: false,
  },
});
async function request(route, method = "GET", body, sessionCookie = cookie) {
  return fetch(base + "/api/" + route, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
test("16 categories and 192 unique editable catalog entries", () => {
  assert.equal(categories.length, 16);
  assert.equal(catalog.length, 192);
  assert.equal(new Set(catalog.map((x) => x.id)).size, 192);
});
test("daily inspiration stable within a day and prompt retains identity details", () => {
  const d = state().dreams[0];
  assert.equal(
    dailyTip(d, new Date("2026-10-18T10:00:00Z")),
    dailyTip(d, new Date("2026-10-18T20:00:00Z")),
  );
  assert.match(scenePrompt(d), /portaequipaje/);
});
test("reject unsafe image URLs, malformed coordinates and invalid timezone", () => {
  let s = state();
  assert.equal(validateState(s), s);
  s.dreams[0].image = "javascript:alert(1)";
  assert.throws(() => validateState(s));
  s = state();
  s.settings.zone = "Mars/City";
  assert.throws(() => validateState(s));
  s = state();
  s.dreams[0].pieces = [{ id: "a", label: "a", x: 900, y: 30 }];
  assert.throws(() => validateState(s));
  s = state();
  s.dreams[0].color = "red; position:fixed";
  assert.throws(() => validateState(s));
});
test("anonymous session discloses capabilities without secrets", async () => {
  const r = await request("session");
  assert.equal(r.status, 200);
  const x = await r.json();
  assert.equal(x.user, null);
  assert.equal(x.capabilities.ai, false);
  assert.equal(x.capabilities.email, false);
});
test("register, store state, fetch state, authenticate and reject bad password", async () => {
  let r = await request("register", "POST", {
    name: "Tomba",
    email: "tomba@example.com",
    password: "my-long-test-password",
  });
  assert.equal(r.status, 200);
  cookie = r.headers.get("set-cookie").split(";")[0];
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  assert.match(r.headers.get("set-cookie"), /SameSite=Lax/);
  r = await request("state", "PUT", { state: state() });
  assert.equal(r.status, 200);
  r = await request("session");
  assert.equal((await r.json()).state.dreams[0].title, "Mi camioneta");
  r = await request("login", "POST", {
    email: "tomba@example.com",
    password: "wrong-password",
  });
  assert.equal(r.status, 401);
  r = await request("login", "POST", {
    email: "tomba@example.com",
    password: "my-long-test-password",
  });
  assert.equal(r.status, 200);
});
test("second account cannot read first account state or private images", async () => {
  let r = await request(
    "register",
    "POST",
    {
      name: "Other",
      email: "other@example.com",
      password: "another-long-password",
    },
    null,
  );
  const otherCookie = r.headers.get("set-cookie").split(";")[0];
  r = await request("session", "GET", null, otherCookie);
  assert.equal((await r.json()).state, null);
  r = await fetch(base + "/media/not-my-account/a.png", {
    headers: { Cookie: otherCookie },
  });
  assert.equal(r.status, 404);
  r = await request("state", "PUT", { state: state() }, "");
  assert.equal(r.status, 401);
});
test("CSRF and invalid JSON are rejected", async () => {
  let r = await fetch(base + "/api/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  r = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "broken",
  });
  assert.equal(r.status, 400);
});
test("unconfigured AI returns explicit failure without fabricating a result", async () => {
  const r = await request("generate", "POST", {
    dreamId: "dream-1",
    scene: "Conduciendo por el sur",
  });
  assert.equal(r.status, 503);
});
test("email opt-in requires mailbox verification", async () => {
  const s = state();
  s.settings.email = true;
  const r = await request("state", "PUT", { state: s });
  assert.equal(r.status, 403);
  await tick();
});
test("configured providers: verify address, generate private scene, send one daily email", async () => {
  const originalFetch = globalThis.fetch;
  let code,
    sent = 0,
    generations = 0;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.RESEND_API_KEY = "test-key";
  process.env.MAIL_FROM = "Manifestation <test@example.com>";
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url === "https://api.resend.com/emails") {
      const payload = JSON.parse(options.body);
      if (payload.subject.includes("Verifica"))
        code = payload.text.match(/\d{6}/)[0];
      else {
        sent++;
        assert.ok(payload.attachments[0].content);
        assert.match(options.headers["Idempotency-Key"], /^daily-/);
      }
      return new Response('{"id":"mail-test"}', { status: 200 });
    }
    if (url === "https://api.openai.com/v1/images/generations") {
      generations++;
      assert.match(JSON.parse(options.body).prompt, /portaequipaje/);
      return Response.json({
        data: [
          {
            b64_json:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBp8AAAAASUVORK5CYII=",
          },
        ],
      });
    }
    return originalFetch(input, options);
  };
  try {
    let r = await request("send-verification", "POST", {});
    assert.equal(r.status, 200);
    assert.ok(code);
    r = await request("verify-email", "POST", { code: "000000" });
    assert.equal(r.status, 400);
    r = await request("verify-email", "POST", { code });
    assert.equal(r.status, 200);
    const s = state();
    s.settings.email = true;
    s.settings.dailyAI = true;
    s.settings.time = "00:00";
    s.settings.zone = "UTC";
    r = await request("state", "PUT", { state: s });
    assert.equal(r.status, 200);
    r = await request("generate", "POST", {
      dreamId: "dream-1",
      scene: "Un viaje junto al mar",
    });
    assert.equal(r.status, 200);
    const generated = await r.json();
    assert.match(generated.image, /^\/media\//);
    r = await originalFetch(base + generated.image, {
      headers: { Cookie: cookie },
    });
    assert.equal(r.status, 200);
    r = await originalFetch(base + generated.image);
    assert.equal(r.status, 401);
    await tick(new Date("2026-10-18T12:00:00Z"));
    await tick(new Date("2026-10-18T13:00:00Z"));
    assert.equal(sent, 1);
    assert.equal(generations, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
  }
});
test("all local references are real images and client syntax assets served", async () => {
  const credits = JSON.parse(
    await readFile(new URL("../public/assets/credits.json", import.meta.url)),
  );
  assert.ok(credits.length >= 35);
  for (const c of categories) {
    const buf = await readFile(
      new URL(`../public/assets/${c.id}.jpg`, import.meta.url),
    );
    assert.equal(buf[0], 0xff, `${c.id} must be jpeg`);
  }
  let r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(await r.text(), /lang="es"/);
  r = await fetch(base + "/app.js");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /javascript/);
});
test("logout revokes session token", async () => {
  const r = await request("logout", "POST", {});
  assert.equal(r.status, 200);
  const next = await request("session");
  assert.equal((await next.json()).user, null);
});
