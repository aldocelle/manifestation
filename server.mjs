import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dailyTip, scenePrompt } from "./public/catalog.js";
import { validateState } from "./public/schema.js";
export { validateState } from "./public/schema.js";
const text = (v, max) => typeof v === "string" && v.length <= max;
const scrypt = promisify(scryptCallback),
  root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, ".data"));
await mkdir(dataDir, { recursive: true });
await mkdir(path.join(dataDir, "images"), { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "manifestation.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,state TEXT,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS verification(user_id TEXT PRIMARY KEY,code TEXT,expires INTEGER,attempts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS verified(user_id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,day TEXT,status TEXT,image TEXT,error TEXT,PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS usage(user_id TEXT,day TEXT,count INTEGER DEFAULT 0,PRIMARY KEY(user_id,day));`);
const publicURL = new URL(
    process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`,
  ),
  secure = process.env.COOKIE_SECURE === "true",
  limit = Number(process.env.AI_DAILY_LIMIT || 5);
const caps = () => ({
  ai: !!process.env.OPENAI_API_KEY,
  email: !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM),
});
function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
const hash = (s) => createHash("sha256").update(s).digest("hex");
function session(req) {
  const raw = (req.headers.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("manifestation="))
    ?.slice(14);
  if (!raw) return null;
  return (
    db
      .prepare(
        "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
      )
      .get(hash(raw), Date.now()) || null
  );
}
function setSession(res, id) {
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    id,
    Date.now() + 30 * 86400000,
  );
  res.setHeader(
    "Set-Cookie",
    `manifestation=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure ? "; Secure" : ""}`,
  );
}
const userPublic = (u) =>
  u ? { id: u.id, email: u.email, name: u.name } : null;
async function body(req) {
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 20 * 1024 * 1024)
      fail(
        413,
        "Los datos superan los 20 MB. Exporta un respaldo y reduce las imágenes.",
      );
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    fail(400, "JSON inválido");
  }
}
const authRate = new Map();
function rate(req, scope, max = 15, window = 900000) {
  const k = scope + ":" + req.socket.remoteAddress,
    now = Date.now();
  let a = authRate.get(k);
  if (!a || now > a.reset) {
    a = { n: 0, reset: now + window };
    authRate.set(k, a);
  }
  if (++a.n > max) fail(429, "Demasiados intentos. Inténtalo más tarde.");
  if (authRate.size > 10000)
    for (const [k, a] of authRate) if (a.reset < now) authRate.delete(k);
}
function requireUser(req) {
  const u = session(req);
  if (!u) fail(401, "Inicia sesión para continuar");
  return u;
}
function csrf(req) {
  if (!["GET", "HEAD"].includes(req.method)) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      fail(415, "Usa JSON");
    if (req.headers.origin && req.headers.origin !== publicURL.origin)
      fail(403, "Origen no autorizado");
  }
}
const inFlight = new Set();
async function makeImage(user, d, scene) {
  if (!caps().ai)
    fail(503, "La generación de imágenes aún no está configurada");
  if (inFlight.has(user.id))
    fail(409, "Ya hay una escena en creación para esta cuenta");
  const day = new Date().toISOString().slice(0, 10);
  db.prepare("INSERT OR IGNORE INTO usage VALUES(?,?,0)").run(user.id, day);
  const count = db
    .prepare("SELECT count FROM usage WHERE user_id=? AND day=?")
    .get(user.id, day).count;
  if (count >= limit)
    fail(
      429,
      "Ya usaste tu cupo diario de escenas. Puedes seguir decorando tu tablero.",
    );
  inFlight.add(user.id);
  db.prepare("UPDATE usage SET count=count+1 WHERE user_id=? AND day=?").run(
    user.id,
    day,
  );
  try {
    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
          prompt: scenePrompt(d, scene),
          size: "1536x1024",
          n: 1,
        }),
        signal: AbortSignal.timeout(180000),
      },
    );
    if (!response.ok)
      fail(
        502,
        "El proveedor no pudo crear la imagen. Revisa la configuración o inténtalo más tarde.",
      );
    const result = await response.json(),
      b64 = result.data?.[0]?.b64_json;
    if (!b64) fail(502, "El proveedor no devolvió una imagen válida");
    const dir = path.join(dataDir, "images", user.id);
    await mkdir(dir, { recursive: true });
    const filename = randomUUID() + ".png";
    await writeFile(path.join(dir, filename), Buffer.from(b64, "base64"));
    return `/media/${user.id}/${filename}`;
  } catch (e) {
    db.prepare(
      "UPDATE usage SET count=MAX(0,count-1) WHERE user_id=? AND day=?",
    ).run(user.id, day);
    throw e;
  } finally {
    inFlight.delete(user.id);
  }
}
function zonedDate(zone, now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}
let ticking = false;
export async function tick(now = new Date()) {
  if (ticking || !caps().email) return;
  ticking = true;
  try {
    for (const u of db
      .prepare("SELECT * FROM users WHERE state IS NOT NULL")
      .all()) {
      let state;
      try {
        state = validateState(JSON.parse(u.state));
      } catch {
        continue;
      }
      const settings = state.settings;
      if (
        !settings.email ||
        !state.dreams.length ||
        !db.prepare("SELECT user_id FROM verified WHERE user_id=?").get(u.id)
      )
        continue;
      const { day, time } = zonedDate(settings.zone, now);
      if (time < settings.time) continue;
      const previous = db
        .prepare("SELECT * FROM jobs WHERE user_id=? AND day=?")
        .get(u.id, day);
      if (previous?.status === "sent") continue;
      db.prepare(
        "INSERT INTO jobs(user_id,day,status) VALUES(?,?,'pending') ON CONFLICT(user_id,day) DO UPDATE SET status='pending',error=NULL",
      ).run(u.id, day);
      try {
        const d =
          state.dreams.find((d) => d.id === state.active) || state.dreams[0];
        let image = previous?.image;
        if (!image && settings.dailyAI && caps().ai) {
          image = await makeImage(
            u,
            d,
            `Daily scene for ${day}: a different lived moment, same dream and personal details.`,
          );
          db.prepare("UPDATE jobs SET image=? WHERE user_id=? AND day=?").run(
            image,
            u.id,
            day,
          );
        }
        const imagePath = image || d.image || `/assets/${d.category}.jpg`;
        let attachment;
        if (imagePath.startsWith(`/media/${u.id}/`)) {
          attachment = await readFile(
            path.join(dataDir, "images", u.id, path.basename(imagePath)),
          );
        } else if (/^\/assets\/[\w.-]+\.jpg$/.test(imagePath)) {
          attachment = await readFile(path.join(root, "public", imagePath));
        } else if (imagePath.startsWith("data:image/")) {
          attachment = Buffer.from(imagePath.split(",")[1], "base64");
        }
        const result = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `daily-${u.id}-${day}`,
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM,
            to: [u.email],
            subject: "Un ratito para tus sueños · " + d.title,
            text: `Hola ${u.name},\n\n${d.title}\n${d.intention || ""}\n\n${dailyTip(d, now)}\n\n¿Quieres agregar algo a tu manifestación?\n${publicURL.href}\n\nPuedes desactivar estos correos en Mi espacio.`,
            ...(attachment
              ? {
                  attachments: [
                    {
                      filename:
                        "tu-vision." +
                        (imagePath.includes(".png") ? "png" : "jpg"),
                      content: attachment.toString("base64"),
                    },
                  ],
                }
              : {}),
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!result.ok) throw Error("Email provider returned " + result.status);
        db.prepare(
          "UPDATE jobs SET status='sent',error=NULL WHERE user_id=? AND day=?",
        ).run(u.id, day);
      } catch (e) {
        db.prepare(
          "UPDATE jobs SET status='failed',error=? WHERE user_id=? AND day=?",
        ).run(e.message.slice(0, 200), u.id, day);
        console.error("Daily reminder failed", u.id, e.message);
      }
    }
  } finally {
    ticking = false;
  }
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
export const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  try {
    const url = new URL(req.url, "http://localhost"),
      p = url.pathname;
    if (p.startsWith("/api/")) {
      csrf(req);
      if (p === "/api/session" && req.method === "GET") {
        const u = session(req);
        return json(res, 200, {
          user: userPublic(u),
          state: u?.state ? JSON.parse(u.state) : null,
          capabilities: {
            ...caps(),
            verified: u
              ? !!db
                  .prepare("SELECT user_id FROM verified WHERE user_id=?")
                  .get(u.id)
              : false,
          },
        });
      }
      if (p === "/api/validate-state" && req.method === "POST") {
        rate(req, "validate", 30, 60000);
        const { state } = await body(req);
        validateState(state);
        return json(res, 200, { valid: true });
      }
      if (
        (p === "/api/register" || p === "/api/login") &&
        req.method === "POST"
      ) {
        rate(req, "auth");
        const data = await body(req),
          email = String(data.email || "")
            .trim()
            .toLowerCase(),
          password = data.password;
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          !text(password, 200) ||
          password.length < 10
        )
          fail(
            400,
            "Revisa el correo y usa una contraseña de al menos 10 caracteres",
          );
        let u = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        if (p === "/api/register") {
          if (u)
            fail(
              409,
              "No se pudo crear la cuenta con ese correo. Prueba iniciar sesión.",
            );
          const salt = randomBytes(16).toString("hex"),
            derived = await scrypt(password, salt, 64);
          const id = randomUUID(),
            name = String(data.name || "Soñador")
              .trim()
              .slice(0, 60);
          db.prepare(
            "INSERT INTO users(id,email,name,password,created) VALUES(?,?,?,?,?)",
          ).run(
            id,
            email,
            name,
            salt + ":" + derived.toString("hex"),
            new Date().toISOString(),
          );
          u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
        } else {
          const [salt, expected] = (
            u?.password ||
            "0000000000000000:" + Buffer.alloc(64).toString("hex")
          ).split(":");
          const actual = await scrypt(password, salt, 64);
          if (!u || !timingSafeEqual(Buffer.from(expected, "hex"), actual))
            fail(401, "Correo o contraseña incorrectos");
        }
        setSession(res, u.id);
        return json(res, 200, {
          user: userPublic(u),
          state: u.state ? JSON.parse(u.state) : null,
        });
      }
      if (p === "/api/logout" && req.method === "POST") {
        const token = (req.headers.cookie || "").match(
          /(?:^|;\s*)manifestation=([^;]+)/,
        )?.[1];
        if (token)
          db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
        res.setHeader(
          "Set-Cookie",
          `manifestation=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`,
        );
        return json(res, 200, { ok: true });
      }
      const u = requireUser(req);
      if (p === "/api/send-verification" && req.method === "POST") {
        rate(req, "verification", 3, 3600000);
        if (!caps().email) fail(503, "El correo aún no está configurado");
        const code = String(randomInt(100000, 1000000));
        db.prepare(
          "INSERT INTO verification VALUES(?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code,expires=excluded.expires,attempts=0",
        ).run(u.id, hash(code), Date.now() + 900000);
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.MAIL_FROM,
            to: [u.email],
            subject: "Verifica tu correo en Manifestation",
            text: `Tu código es ${code}. Vence en 15 minutos. Si no lo pediste, ignora este correo.`,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok)
          fail(502, "No se pudo enviar el código. Inténtalo más tarde.");
        return json(res, 200, { sent: true });
      }
      if (p === "/api/verify-email" && req.method === "POST") {
        rate(req, "verify-code", 10, 900000);
        const { code } = await body(req),
          record = db
            .prepare("SELECT * FROM verification WHERE user_id=?")
            .get(u.id);
        if (!record || record.expires < Date.now() || record.attempts >= 5)
          fail(400, "El código venció o se agotaron los intentos");
        db.prepare(
          "UPDATE verification SET attempts=attempts+1 WHERE user_id=?",
        ).run(u.id);
        if (!text(code, 6) || hash(code) !== record.code)
          fail(400, "Código incorrecto");
        db.prepare("INSERT OR IGNORE INTO verified VALUES(?)").run(u.id);
        db.prepare("DELETE FROM verification WHERE user_id=?").run(u.id);
        return json(res, 200, { verified: true });
      }
      if (p === "/api/state" && req.method === "PUT") {
        const { state } = await body(req);
        validateState(state, u.id);
        if (
          state.settings.email &&
          !db.prepare("SELECT user_id FROM verified WHERE user_id=?").get(u.id)
        )
          fail(403, "Verifica tu correo antes de activar el envío diario");
        if (state.settings.email && !caps().email)
          fail(503, "El correo todavía no está configurado");
        db.prepare("UPDATE users SET state=?,name=? WHERE id=?").run(
          JSON.stringify(state),
          state.settings.name,
          u.id,
        );
        return json(res, 200, { saved: true });
      }
      if (p === "/api/generate" && req.method === "POST") {
        rate(req, "generate", 10, 60000);
        const { dreamId, scene } = await body(req);
        if (!text(scene, 1000) || !scene.trim())
          fail(400, "Describe una escena de hasta 1000 caracteres");
        const state = u.state ? JSON.parse(u.state) : null,
          d = state?.dreams.find((d) => d.id === dreamId);
        if (!d) fail(404, "Guarda primero este sueño en tu cuenta");
        const image = await makeImage(u, d, scene);
        return json(res, 200, { image });
      }
      fail(404, "Ruta no encontrada");
    }
    if (!["GET", "HEAD"].includes(req.method)) fail(405, "Método no permitido");
    let file;
    if (p.startsWith("/media/")) {
      const u = requireUser(req);
      if (!new RegExp(`^/media/${u.id}/[a-f0-9-]+\\.png$`).test(p))
        fail(404, "Imagen no encontrada");
      file = path.join(dataDir, "images", u.id, path.basename(p));
      res.setHeader("Cache-Control", "private, max-age=86400");
    } else {
      const decoded = decodeURIComponent(p);
      file = path.resolve(
        root,
        "public",
        "." + (decoded === "/" ? "/index.html" : decoded),
      );
      if (!file.startsWith(path.join(root, "public") + path.sep))
        fail(403, "Ruta no permitida");
      res.setHeader(
        "Cache-Control",
        p.startsWith("/assets/") ? "public, max-age=86400" : "no-cache",
      );
    }
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Content-Length": content.length,
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (e) {
    const status =
      e.status || (e.code === "ENOENT" || e.code === "EISDIR" ? 404 : 500);
    if (status === 500) console.error(e);
    if (!res.headersSent)
      json(res, status, {
        error:
          status === 500
            ? "No pudimos completar la solicitud. Inténtalo de nuevo."
            : e.message,
      });
    else res.end();
  }
});
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () => console.log(`Manifestation ready at ${publicURL.href}`),
  );
  const timer = setInterval(() => tick().catch(console.error), 60000);
  timer.unref();
  tick().catch(console.error);
  const cleanup = setInterval(
    () => db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now()),
    3600000,
  );
  cleanup.unref();
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
