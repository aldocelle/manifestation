function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
const allowedCategories = new Set([
  "travel",
  "vehicles",
  "work",
  "home",
  "garden",
  "style",
  "adventure",
  "daily",
  "shows",
  "learning",
  "wellbeing",
  "connection",
  "food",
  "freedom",
  "climate",
  "custom",
]);
const text = (v, max) => typeof v === "string" && v.length <= max;
const safeImage = (s) =>
  text(s, 3e6) &&
  (!s ||
    /^\/assets\/[\w.-]+\.(jpg|png|svg|webp)$/.test(s) ||
    /^\/media\/[a-f0-9-]+\/[a-f0-9-]+\.png$/.test(s) ||
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s));
export function validateState(s, userId) {
  if (
    !s ||
    !Array.isArray(s.dreams) ||
    s.dreams.length > 50 ||
    !Array.isArray(s.journal) ||
    s.journal.length > 2000 ||
    !Array.isArray(s.favorites) ||
    s.favorites.length > 500 ||
    !s.settings
  )
    fail(400, "Respaldo o tablero inválido");
  const ids = new Set();
  for (const d of s.dreams) {
    if (
      !text(d.id, 80) ||
      !d.id ||
      ids.has(d.id) ||
      !text(d.title, 100) ||
      !d.title.trim() ||
      !allowedCategories.has(d.category) ||
      !/^#[a-fA-F0-9]{6}$/.test(d.color) ||
      !text(d.style, 100) ||
      !text(d.climate, 100) ||
      !text(d.emotion, 100) ||
      !text(d.intention || "", 1000) ||
      !text(d.details || "", 1500) ||
      !text(d.place || "", 150) ||
      !safeImage(d.image || "") ||
      !["dreaming", "preparing", "achieved"].includes(d.status) ||
      !Array.isArray(d.pieces) ||
      d.pieces.length > 40
    )
      fail(400, "Uno de los sueños contiene datos inválidos");
    ids.add(d.id);
    for (const p of d.pieces) {
      if (
        !text(p.id, 80) ||
        !text(p.label, 120) ||
        !text(p.emoji || "", 20) ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 100 ||
        p.y < 0 ||
        p.y > 100 ||
        (p.scale !== undefined &&
          (!Number.isFinite(p.scale) || p.scale < 0.5 || p.scale > 2)) ||
        (p.rotation !== undefined &&
          (!Number.isFinite(p.rotation) || Math.abs(p.rotation) > 180)) ||
        (p.src && !safeImage(p.src))
      )
        fail(400, "Pieza inválida");
    }
    if (
      d.history &&
      (!Array.isArray(d.history) ||
        d.history.length > 100 ||
        d.history.some((h) => !safeImage(h.image)))
    )
      fail(400, "Historial inválido");
    if (
      userId &&
      d.image?.startsWith("/media/") &&
      !d.image.startsWith(`/media/${userId}/`)
    )
      fail(400, "Esta imagen pertenece a otra cuenta");
  }
  for (const j of s.journal)
    if (
      !text(j.id, 80) ||
      !text(j.text, 4000) ||
      !text(j.dream || "", 80) ||
      !["Reflexión", "Paso", "Gratitud", "Avance"].includes(j.type) ||
      !Number.isFinite(Date.parse(j.date))
    )
      fail(400, "Nota inválida");
  if (s.favorites.some((f) => !text(f, 80))) fail(400, "Favoritos inválidos");
  const t = s.settings;
  if (
    !text(t.name, 60) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time) ||
    !text(t.zone, 100) ||
    typeof t.email !== "boolean"
  )
    fail(400, "Preferencias inválidas");
  try {
    new Intl.DateTimeFormat("es", { timeZone: t.zone }).format();
  } catch {
    fail(400, "Zona horaria inválida");
  }
  if (s.active != null && !text(s.active, 80))
    fail(400, "Sueño activo inválido");
  return s;
}
