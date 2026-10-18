import { validateState } from "./schema.js";
import {
  categories,
  catalog,
  styles,
  climates,
  emotions,
  colors,
  objects,
  categoryById,
  dailyTip,
  scenePrompt,
  trendSource,
  imageFor,
} from "./catalog.js";
const $ = (s) => document.querySelector(s),
  uid = () => crypto.randomUUID(),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const key = "manifestation-v1";
const defaults = () => ({
  dreams: [],
  journal: [],
  settings: {
    name: "Soñador",
    time: "09:00",
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    email: false,
    notifications: false,
  },
  favorites: [],
  active: null,
});
let state;
try {
  state = JSON.parse(localStorage.getItem(key)) || defaults();
} catch {
  state = defaults();
}
state = {
  ...defaults(),
  ...state,
  settings: { ...defaults().settings, ...state.settings },
};
let backendConnected = false;
let view = "world",
  filter = "all",
  search = "",
  account = null,
  capabilities = {},
  dirty = false,
  syncing = false,
  syncTimer;
const nav = [
  ["world", "◈", "Mi mundo"],
  ["explore", "⌕", "Explorar sueños"],
  ["daily", "☀", "Para ti, hoy"],
  ["journal", "✎", "Mi diario"],
  ["settings", "⚙", "Mi espacio"],
];
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    toast(
      "El espacio de este navegador está lleno. Exporta un respaldo y reduce las imágenes.",
    );
  }
  dirty = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 700);
}
async function api(path, body, method) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "No se pudo completar la solicitud");
  return data;
}
async function sync() {
  if (!account || !dirty || syncing) return;
  syncing = true;
  dirty = false;
  try {
    await api("state", { state }, "PUT");
  } catch (e) {
    dirty = true;
    toast("Tus cambios están guardados en este dispositivo. " + e.message);
  } finally {
    syncing = false;
    if (dirty) syncTimer = setTimeout(sync, 5000);
  }
}
const active = () =>
  state.dreams.find((d) => d.id === state.active) || state.dreams[0];
const photo = (d, cls = "") =>
  `<img class="${cls}" src="${esc(imageFor(d))}" alt="Referencia visual: ${esc(d.title)}" loading="lazy" onerror="this.src='/assets/fallback.svg';this.onerror=null">`;
const btn = (text, action, cls = "button", data = "") =>
  `<button class="${cls}" data-action="${action}" ${data}>${text}</button>`;
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function render() {
  const a = active();
  $("#app").innerHTML =
    `<aside class="sidebar"><a href="#" class="brand" aria-label="Manifestation inicio" data-view="world"><span class="brandmark">m<span>✦</span></span><strong>manifestation<span>UN MUNDO DE POSIBILIDADES</span></strong></a><div class="nav-label">TU PRÓXIMO CAPÍTULO</div><nav>${nav.map(([id, icon, label]) => `<button data-view="${id}" class="nav-item ${view === id ? "selected" : ""}" ${view === id ? 'aria-current="page"' : ""}><span>${icon}</span>${label}${id === "daily" ? "<i></i>" : ""}</button>`).join("")}</nav><div class="sidebar-bottom"><div class="little-note"><span>✳</span><p>Todo empieza<br>con imaginarlo.</p><small>A tu manera. A tu ritmo.</small></div><button class="profile" data-action="account"><span class="avatar">${esc((state.settings.name || "T").slice(0, 1).toUpperCase())}</span><span>${esc(account?.name || state.settings.name)}<small>${account ? "Cuenta sincronizada" : "Tu espacio personal"}</small></span><span>↗</span></button></div></aside><main id="main"><header class="topbar"><span>Tu vida, a tu manera <span class="tiny-star">✦</span></span><div><span class="date">${new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long" }).format(new Date())}</span>${btn("＋ Crear un sueño", "create", "button small")}</div></header>${view === "world" ? world(a) : view === "explore" ? explore() : view === "daily" ? daily() : view === "journal" ? journal() : settings()}<footer>Hecho para imaginar. Un pequeño paso para acercarte. <button data-action="credits">Referencias y créditos ↗</button></footer></main>`;
  bindBoard();
}
function world(a) {
  return `<section class="page-heading"><div><div class="eyebrow">IMAGINA · CONSTRUYE · VIVE</div><h1>Hay una vida que<br>solo tú puedes <em>imaginar.</em></h1><p>Este es tu lugar para empezar a darle forma.</p></div><div class="heading-doodle">Un poquito más cerca<br>de eso que te emociona <span>⤵</span></div></section><div class="workspace"><section class="world-column"><div class="section-line"><h2>Mi mundo <span>${state.dreams.length} sueños</span></h2>${btn("Ver mis sueños ↗", "list", "text-button")}</div>${a ? scene(a) : `<div class="empty-world"><div class="empty-collage"><img src="/assets/travel.jpg" alt="Costa italiana" onerror="this.src='/assets/fallback.svg'"><img src="/assets/vehicles.jpg" alt="Auto deportivo" onerror="this.src='/assets/fallback.svg'"><img src="/assets/adventure.jpg" alt="Montañas" onerror="this.src='/assets/fallback.svg'"><span>✦</span></div><div class="empty-copy"><span class="eyebrow">NO HAY SUEÑOS DEMASIADO PEQUEÑOS</span><h2>¿Y si empiezas<br>por eso que tanto quieres?</h2><p>Un viaje, un auto, tu próximo trabajo o algo que solo tú puedes imaginar.</p>${btn("Construir mi primer sueño ↗", "create")}</div></div>`}<div class="catalog-strip"><div class="section-line"><h3>Pequeñas piezas, grandes posibilidades</h3>${btn("Explorar todo ↗", "explore", "text-button")}</div><div class="object-row">${objects
    .slice(0, 8)
    .map(
      ([name, emoji]) =>
        `<button data-action="object" data-name="${name}" data-emoji="${emoji}"><span>${emoji}</span><small>${name}</small></button>`,
    )
    .join(
      "",
    )}${btn("＋<small>Tu pieza</small>", "textpiece", "object-add")}</div></div></section><aside class="companion"><div class="companion-title"><span>☀</span> Un momento para ti</div><article class="inspiration-card"><div class="inspiration-photo"><img src="${a ? esc(imageFor(a)) : "/assets/beach.jpg"}" alt="Inspiración del día" onerror="this.src='/assets/fallback.svg'"><span>HOY ES UN BUEN DÍA</span></div><div class="card-body"><span class="eyebrow">${a ? esc(categoryById(a.category).name) : "TU PRÓXIMO CAPÍTULO"}</span><h3>${a ? esc(a.title) : "Dale espacio a<br>lo que te ilusiona."}</h3><p>${a ? esc(dailyTip(a)) : "No tienes que tener todo resuelto. Empieza por imaginar cómo te gustaría sentirte."}</p>${btn("Mi inspiración de hoy ↗", "daily", "text-button")}</div></article><article class="question-card"><span>✧</span><h3>¿Qué te gustaría<br>sentir al llegar?</h3><div class="emotion-pills">${emotions
    .slice(0, 4)
    .map((e) => btn(e, "emotion", "pill", `data-emotion="${e}"`))
    .join(
      "",
    )}</div></article><button class="reminder-card" data-view="settings"><span>◷</span><span>Un ratito para tus sueños<small>${esc(state.settings.time)} · ${state.settings.email ? "Correo diario activado" : "Ajusta tu recordatorio"}</small></span><b>↗</b></button></aside></div><section class="discover"><div class="section-line"><div><span class="eyebrow">TANTAS VIDAS COMO PUEDAS IMAGINAR</span><h2>¿Hacia dónde quieres ir?</h2></div>${btn("Ver las 16 categorías ↗", "explore", "text-button")}</div><div class="category-grid">${categories.slice(0, 6).map(categoryCard).join("")}</div></section>`;
}
function scene(d) {
  return `<div class="scene" id="board" style="--accent:${esc(d.color)}"><img class="scene-bg" src="${esc(imageFor(d))}" alt="Tu visión: ${esc(d.title)}" onerror="this.src='/assets/fallback.svg'"><div class="scene-shade"></div><div class="scene-top"><span class="glass-label">${categoryById(d.category).icon} ${esc(categoryById(d.category).name)}</span><div>${btn("◷", "history", "icon-button", `aria-label="Historial de escenas"`)}${btn("✎", "edit", "icon-button", `aria-label="Editar sueño"`)}${btn("⤓", "export-image", "icon-button", `aria-label="Descargar imagen"`)}</div></div><div class="scene-copy"><span>${esc(d.emotion)} · ${esc(d.style)}${d.ai ? " · Escena creada con IA" : " · Referencia visual"}</span><h2>${esc(d.title)}</h2><p>${esc(d.intention || "Estoy construyendo mi próximo capítulo, a mi ritmo.")}</p></div>${d.category === "vehicles" ? `<div class="car-scene">${carSvg(d.color)}</div>` : ""}<div class="pieces">${(d.pieces || []).map((p) => `<button class="piece ${p.type === "image" ? "photo-piece" : ""}" data-piece="${p.id}" style="left:${p.x}%;top:${p.y}%;transform:rotate(${p.rotation || 0}deg) scale(${p.scale || 1})" aria-label="Mover ${esc(p.label)}">${p.type === "image" ? `<img src="${esc(p.src)}" alt="${esc(p.label)}">` : `<span>${esc(p.emoji || "")}</span><small>${esc(p.label)}</small>`}</button>`).join("")}</div><div class="scene-bottom"><span>Arrastra las piezas para hacerlas tuyas</span>${btn("✦ Crear escena con IA", "generate", "glass-button")}</div></div><div class="dream-tabs">${state.dreams.map((d) => btn(`${categoryById(d.category).icon} ${esc(d.title)}`, "select", `dream-tab ${active()?.id === d.id ? "active" : ""}`, `data-id="${d.id}"`)).join("")}${btn("＋", "create", "dream-tab", `aria-label="Crear otro sueño"`)}</div>`;
}
function carSvg(color) {
  return `<svg viewBox="0 0 600 230" aria-label="Tu vehículo en el color elegido" role="img"><ellipse cx="300" cy="196" rx="240" ry="18" fill="#0003"/><path d="M48 161L70 120l96-18 63-64h167l81 72 65 16 21 37-15 20H46Z" fill="${esc(color || "#e56c4c")}" stroke="#263332" stroke-width="4"/><path d="M187 100l51-51h65v51zm132 0V49h69l58 51z" fill="#b5d8de" stroke="#263332" stroke-width="4"/><path d="M321 112v57m-20-57v57M86 145h441" stroke="#263332" stroke-width="3" opacity=".5"/><path d="M62 130h40v18H55m462-12h30v17h-28" fill="#fff4d4"/><g fill="#25302f" stroke="#eee4d4" stroke-width="6"><circle cx="150" cy="178" r="39"/><circle cx="458" cy="178" r="39"/></g><g fill="#acb4b1"><circle cx="150" cy="178" r="19"/><circle cx="458" cy="178" r="19"/></g></svg>`;
}
function categoryCard(c) {
  return `<button class="category-card" data-action="category" data-category="${c.id}"><img src="/assets/${c.id}.jpg" alt="" loading="lazy" onerror="this.src='/assets/fallback.svg'"><div><span>${c.icon}</span><h3>${c.name}</h3><small>${c.subtitle}</small></div><b>↗</b></button>`;
}
function explore() {
  const list = catalog.filter(
    (c) =>
      (filter === "all" ||
        c.category === filter ||
        (filter === "favorites" && state.favorites.includes(c.id))) &&
      (c.title + " " + c.tags.join(" "))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return `<section class="page-heading compact"><div><div class="eyebrow">UN CATÁLOGO ABIERTO A TU IMAGINACIÓN</div><h1>No todos soñamos <em>lo mismo.</em></h1><p>192 puntos de partida. Infinitas formas de hacerlos tuyos.</p></div></section><div class="explore-tools"><label class="search">⌕ <input id="search" type="search" placeholder="Un auto, Japón, música, tranquilidad…" value="${esc(search)}" aria-label="Buscar sueños"></label><select id="category-filter" aria-label="Categoría"><option value="all">Todas las categorías</option>${categories.map((c) => `<option value="${c.id}" ${filter === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select></div><div class="filter-pills">${[["all", "Todo"], ["favorites", "♡ Mis favoritos"], ...categories.map((c) => [c.id, c.icon + " " + c.name])].map(([id, t]) => btn(t, "filter", `pill ${filter === id ? "active" : ""}`, `data-category="${id}"`)).join("")}</div><div class="results-line">${list.length} posibilidades para explorar <span>Referencias fotográficas · personalización libre</span></div><div class="dream-grid">${list
    .slice(0, 60)
    .map(
      (c) =>
        `<article class="dream-card"><button class="card-image" data-action="template" data-id="${c.id}"><img src="${templateImage(c)}" alt="Referencia de ${esc(c.title)}" loading="lazy" onerror="this.src='/assets/fallback.svg'"><span>${categoryById(c.category).name}</span></button><button class="favorite ${state.favorites.includes(c.id) ? "on" : ""}" data-action="favorite" data-id="${c.id}" aria-label="${state.favorites.includes(c.id) ? "Quitar de" : "Agregar a"} favoritos">${state.favorites.includes(c.id) ? "♥" : "♡"}</button><div class="dream-card-body"><h3>${esc(c.title)}</h3><p>${esc(c.subtitle)}</p><div class="section-line">${btn("Hacerlo mío ＋", "template", "text-button", `data-id="${c.id}"`)}${btn("⊞", "reference-piece", "icon-button", `data-id="${c.id}" aria-label="Añadir referencia al tablero actual"`)}</div></div></article>`,
    )
    .join(
      "",
    )}</div>${list.length > 60 ? '<p class="hint">Elige una categoría o usa el buscador para explorar más referencias.</p>' : ""}<div class="trend-note">✧ Inspiración 2026: Neo Deco, Cool Blue, Poetcore, Glamoratti y más. <a href="${trendSource.url}" target="_blank" rel="noopener">Ver fuente editorial ↗</a></div>`;
}
const imageVariants = {
  travel: [
    "italy",
    "japan",
    "mountains",
    "snow",
    "beach",
    "mountains",
    "city",
    "desert",
    "city",
    "forest",
    "pizza",
    "mountains",
  ],
  vehicles: [
    "car",
    "road",
    "car",
    "car",
    "van",
    "road",
    "daily",
    "beach",
    "van",
    "car",
    "road",
    "car",
  ],
  home: [
    "interior",
    "bedroom",
    "forest",
    "work",
    "interior",
    "home",
    "books",
    "kitchen",
    "beach",
    "bedroom",
    "home",
    "work",
  ],
  style: [
    "fashion",
    "style",
    "books",
    "fashion",
    "style",
    "fashion",
    "style",
    "fashion",
    "style",
    "fashion",
    "style",
    "fashion",
  ],
  climate: [
    "forest",
    "snow",
    "beach",
    "desert",
    "forest",
    "flowers",
    "beach",
    "mountains",
    "city",
    "road",
    "snow",
    "home",
  ],
  shows: [
    "shows",
    "shows",
    "shows",
    "city",
    "shows",
    "music",
    "guitar",
    "shows",
    "shows",
    "learning",
    "learning",
    "music",
  ],
  adventure: [
    "mountains",
    "surf",
    "beach",
    "camp",
    "road",
    "mountains",
    "beach",
    "forest",
    "mountains",
    "road",
    "snow",
    "road",
  ],
};
function templateImage(c) {
  const i = Number(c.id.split("-").at(-1));
  return `/assets/${imageVariants[c.category]?.[i] || c.category}.jpg`;
}
function daily() {
  const dreams = state.dreams,
    day = new Date().toLocaleDateString("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  return `<section class="page-heading compact"><div><div class="eyebrow">${esc(day.toUpperCase())}</div><h1>Un momento para <em>volver a ti.</em></h1><p>Una imagen, una pregunta y un pequeño paso. Sin prisa.</p></div>${btn("◌ Respirar un momento", "ritual", "button secondary")}</section>${dreams.length ? `<div class="daily-grid">${dreams.map((d) => `<article class="daily-card">${photo(d)}<div><span class="eyebrow">${esc(d.emotion)} · TU VISIÓN</span><h2>${esc(d.title)}</h2><p>${esc(dailyTip(d))}</p><blockquote>“${esc(d.intention || "Puedo acercarme a esta visión con pequeños pasos.")}”</blockquote><div class="button-row">${btn("Escribir sobre esto", "reflect", "button secondary", `data-id="${d.id}"`)}${btn("✦ Una nueva escena", "daily-generate", "text-button", `data-id="${d.id}"`)}</div></div></article>`).join("")}</div>` : `<div class="blank"><span>☀</span><h2>Tu inspiración empieza con un deseo.</h2>${btn("Crear mi primer sueño", "create")}</div>`}<article class="daily-exercise"><span>01 / UNA PEQUEÑA ACCIÓN</span><h2>¿Qué puedes preparar hoy?</h2><p>Elige algo de diez minutos: investigar una ruta, practicar una habilidad, ordenar un rincón o escribir una idea.</p>${btn("Anotar mi siguiente paso ＋", "new-entry", "button secondary")}</article>`;
}
function journal() {
  return `<section class="page-heading compact"><div><div class="eyebrow">LO QUE VAS DESCUBRIENDO</div><h1>Tu historia, <em>paso a paso.</em></h1><p>Intenciones, avances, dudas y cosas que hoy agradeces.</p></div>${btn("＋ Escribir una nota", "new-entry")}</section><div class="journal-stats"><div><b>${state.journal.length}</b><span>momentos registrados</span></div><div><b>${state.journal.filter((e) => e.done).length}</b><span>pasos completados</span></div><div><b>${state.dreams.filter((d) => d.status === "achieved").length}</b><span>sueños celebrados</span></div></div>${
    state.journal.length
      ? `<div class="journal-list">${[...state.journal]
          .reverse()
          .map(
            (e) =>
              `<article><div class="journal-date">${new Date(e.date).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}<span>${esc(e.type)}</span></div><div><h3>${esc(state.dreams.find((d) => d.id === e.dream)?.title || "Mi camino")}</h3><p>${esc(e.text)}</p>${e.type === "Paso" ? btn(e.done ? "✓ Completado" : "○ Marcar como hecho", "toggle-step", `pill ${e.done ? "active" : ""}`, `data-id="${e.id}"`) : ""}</div>${btn("×", "delete-entry", "icon-button", `data-id="${e.id}" aria-label="Eliminar nota"`)}</article>`,
          )
          .join("")}</div>`
      : '<div class="blank"><span>✎</span><h2>Todo avance merece su espacio.</h2><p>Guarda tu primera intención o un paso que quieras dar.</p></div>'
  }`;
}
function settings() {
  return `<section class="page-heading compact"><div><div class="eyebrow">A TU MANERA. A TU RITMO.</div><h1>Un espacio <em>que sea tuyo.</em></h1><p>Tú eliges cómo y cuándo volver a tus sueños.</p></div></section><form id="settings-form" class="settings-form"><section><h2>Tu acompañamiento</h2><label>¿Cómo te llamamos?<input name="name" value="${esc(state.settings.name)}" maxlength="60" required></label><div class="form-two"><label>Hora del recordatorio<input name="time" type="time" value="${esc(state.settings.time)}" required></label><label>Zona horaria<input name="zone" value="${esc(state.settings.zone)}" required></label></div><label class="check"><input type="checkbox" name="notifications" ${state.settings.notifications ? "checked" : ""}>Recordatorio en este dispositivo mientras la app está abierta</label><label class="check"><input type="checkbox" name="email" ${state.settings.email ? "checked" : ""} ${!account || !capabilities.email || !capabilities.verified ? "disabled" : ""}>Recibir inspiración diaria en mi correo</label><label class="check"><input type="checkbox" name="dailyAI" ${state.settings.dailyAI ? "checked" : ""} ${!account || !capabilities.ai || !capabilities.email ? "disabled" : ""}>Crear una imagen nueva con IA en el correo diario (usa mi cupo)</label>${account && capabilities.email && !capabilities.verified ? btn("Verificar mi correo", "verify-email", "button secondary") : ""}<p class="hint">${account ? (capabilities.email ? "El envío incluye tu visión y una pregunta. Puedes desactivarlo aquí." : "El envío por correo estará disponible cuando el administrador configure el servicio.") : "Inicia sesión para sincronizar y recibir correos. Puedes usar el tablero sin cuenta."}</p><button class="button" type="submit">Guardar preferencias</button></section><section><h2>Tu cuenta y tus datos</h2><p>${account ? "Tus sueños se sincronizan con tu cuenta." : "Tus sueños se guardan en este navegador. Exporta un respaldo o crea tu cuenta para conservarlos en el servidor."}</p><div class="button-row">${btn(account ? "Mi cuenta" : "Crear cuenta / Iniciar sesión", "account", "button secondary")}${btn("Exportar respaldo", "backup", "button secondary")}${btn("Importar respaldo", "import", "button secondary")}</div><p class="hint">Puedes exportar todo como JSON e importar el archivo en otro dispositivo.</p></section><section><h2>Tu imaginación, con IA</h2><p>${capabilities.ai ? "La creación de escenas está disponible. Cada solicitud genera una imagen nueva y consume el cupo diario de tu cuenta." : "Puedes construir, personalizar y descargar tus tableros desde ahora. La generación de escenas nuevas necesita que el administrador configure OpenAI en el servidor."}</p><p class="hint">Las referencias del catálogo son fotografías; las imágenes nuevas se identifican como creaciones con IA. Los detalles escritos se conservan entre escenas; la coincidencia visual exacta no está garantizada.</p></section></form>`;
}
function showModal(html) {
  const m = $("#modal");
  m.innerHTML = `<button class="close" data-action="close" aria-label="Cerrar">×</button>${html}`;
  m.showModal();
}
function create(template, existing) {
  const d = existing || {
    category: template?.category || "custom",
    title: template?.title || "",
    image: template ? templateImage(template) : "",
    style: styles[0],
    climate: climates[0],
    emotion: emotions[0],
    color: colors[0],
    status: "dreaming",
  };
  showModal(
    `<div class="eyebrow">${existing ? "SIGUE DÁNDOLE FORMA" : "TU PRÓXIMO CAPÍTULO EMPIEZA AQUÍ"}</div><h2>${existing ? "Tu sueño evoluciona." : "¿Qué te gustaría vivir?"}</h2><p>Puede ser algo enorme o un pequeño cambio cotidiano.</p><form id="dream-form" data-edit="${existing?.id || ""}"><label>Tu sueño<input name="title" placeholder="Recorrer el sur en mi camioneta" maxlength="100" value="${esc(d.title)}" required autofocus></label><label>¿En qué mundo vive?<select name="category">${categories.map((c) => `<option value="${c.id}" ${c.id === d.category ? "selected" : ""}>${c.icon} ${c.name}</option>`).join("")}</select></label><label>¿Por qué lo quieres? Tu intención<textarea name="intention" maxlength="1000" placeholder="Quiero sentir libertad, viajar con mi familia…">${esc(d.intention)}</textarea></label><label>Detalles que quieres conservar<textarea name="details" maxlength="1500" placeholder="Modelo, herramientas, personas, colores, profesión, gustos…">${esc(d.details)}</textarea></label><div class="form-two"><label>Lugar<input name="place" maxlength="150" value="${esc(d.place)}" placeholder="Chile, carretera junto al mar"></label><label>Cómo quieres sentirte<select name="emotion">${emotions.map((e) => `<option ${e === d.emotion ? "selected" : ""}>${e}</option>`).join("")}</select></label></div><div class="form-two"><label>Estilo<select name="style">${styles.map((s) => `<option ${s === d.style ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Clima<select name="climate">${climates.map((s) => `<option ${s === d.climate ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><label>Tu color<input name="color" type="color" value="${esc(d.color)}"></label><label>Tu imagen de referencia (opcional)<input type="file" name="reference" accept="image/jpeg,image/png,image/webp"></label><label>Estado<select name="status"><option value="dreaming" ${d.status === "dreaming" ? "selected" : ""}>Lo estoy imaginando</option><option value="preparing" ${d.status === "preparing" ? "selected" : ""}>Me estoy preparando</option><option value="achieved" ${d.status === "achieved" ? "selected" : ""}>¡Lo estoy viviendo!</option></select></label><input type="hidden" name="image" value="${esc(d.image || "")}"><button class="button full" type="submit">${existing ? "Guardar mi visión" : "Crear mi mundo"} ↗</button>${existing ? btn("Eliminar este sueño", "delete-dream", "danger", `data-id="${d.id}"`) : ""}</form>`,
  );
}
async function readImage(file) {
  if (file.size > 8 * 1024 * 1024)
    throw Error("Elige una imagen de menos de 8 MB");
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(Error("No pudimos leer la imagen"));
    r.onload = () => {
      const i = new Image();
      i.onload = () => {
        const scale = Math.min(1, 1200 / i.width),
          c = document.createElement("canvas");
        c.width = i.width * scale;
        c.height = i.height * scale;
        c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      i.onerror = () => reject(Error("Usa una imagen JPG, PNG o WebP válida"));
      i.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function note(dream) {
  showModal(
    `<div class="eyebrow">UN MOMENTO PARA TI</div><h2>¿Qué te llevas de hoy?</h2><form id="entry-form"><label>Relacionado con<select name="dream"><option value="">Mi camino</option>${state.dreams.map((d) => `<option value="${d.id}" ${d.id === dream ? "selected" : ""}>${esc(d.title)}</option>`).join("")}</select></label><label>Tipo<select name="type"><option>Reflexión</option><option>Paso</option><option>Gratitud</option><option>Avance</option></select></label><label>Escribe aquí<textarea name="text" required maxlength="4000" placeholder="Hoy puedo acercarme a mi sueño haciendo…" rows="5"></textarea></label><button class="button" type="submit">Guardar en mi diario</button></form>`,
  );
}
function addPiece(p) {
  const d = active();
  if (!d) {
    toast("Primero crea un sueño para agregar piezas.");
    create();
    return;
  }
  d.pieces ??= [];
  if (d.pieces.length >= 40)
    return toast(
      "Tu tablero ya tiene 40 piezas. Puedes eliminar alguna para agregar más.",
    );
  d.pieces.push({
    id: uid(),
    x: 20 + Math.random() * 50,
    y: 20 + Math.random() * 35,
    scale: 1,
    rotation: 0,
    ...p,
  });
  save();
  render();
}
function pieceEditor(p) {
  showModal(
    `<h2>Una pieza de tu mundo</h2><form id="piece-form" data-id="${p.id}"><label>Significado<input name="label" maxlength="120" value="${esc(p.label)}" required></label><label>Tamaño<input type="range" name="scale" min="0.6" max="1.8" step="0.1" value="${p.scale || 1}"></label><label>Rotación<input type="range" name="rotation" min="-30" max="30" value="${p.rotation || 0}"></label><button class="button">Guardar pieza</button>${btn("Eliminar pieza", "delete-piece", "danger", `data-id="${p.id}"`)}</form>`,
  );
}
function bindBoard() {
  document.querySelectorAll("[data-piece]").forEach((el) => {
    let start,
      moved = false;
    el.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!start) return;
      const box = $("#board").getBoundingClientRect();
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4)
        moved = true;
      if (!moved) return;
      const p = active().pieces.find((p) => p.id === el.dataset.piece);
      p.x = Math.max(
        5,
        Math.min(85, (100 * (e.clientX - box.left)) / box.width),
      );
      p.y = Math.max(
        15,
        Math.min(78, (100 * (e.clientY - box.top)) / box.height),
      );
      el.style.left = p.x + "%";
      el.style.top = p.y + "%";
    });
    el.addEventListener("pointerup", () => {
      start = null;
      if (moved) save();
      else pieceEditor(active().pieces.find((p) => p.id === el.dataset.piece));
    });
    el.addEventListener("pointercancel", () => {
      start = null;
      save();
    });
    el.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const p = active().pieces.find((p) => p.id === el.dataset.piece);
        p.x = Math.max(
          5,
          Math.min(
            85,
            p.x + (e.key === "ArrowRight" ? 2 : e.key === "ArrowLeft" ? -2 : 0),
          ),
        );
        p.y = Math.max(
          15,
          Math.min(
            78,
            p.y + (e.key === "ArrowDown" ? 2 : e.key === "ArrowUp" ? -2 : 0),
          ),
        );
        save();
        render();
        document.querySelector(`[data-piece="${p.id}"]`)?.focus();
      }
    });
  });
}
async function generate(d, daily = false) {
  if (!d) return create();
  if (!account)
    return accountModal("Inicia sesión para crear una escena con IA.");
  if (!capabilities.ai)
    return toast(
      "La IA todavía necesita su clave en el servidor. Tu tablero funciona con las referencias y tus propias imágenes.",
    );
  showModal(
    `<div class="eyebrow">UNA NUEVA FORMA DE IMAGINARLO</div><h2>Crear una escena con IA</h2><p>Se conservarán tus detalles escritos y se creará una nueva interpretación visual. Esta solicitud usa tu cupo de generación.</p><form id="generate-form" data-id="${d.id}" data-daily="${daily}"><label>¿Qué quieres vivir en esta escena?<textarea name="scene" maxlength="1000" required placeholder="Conduciendo al amanecer por una carretera junto al mar">${daily ? "Una nueva escena cotidiana relacionada con mi sueño." : ""}</textarea></label><p class="hint">Tu imagen anterior quedará en el historial del sueño.</p><button class="button" type="submit">✦ Generar mi escena</button></form>`,
  );
}
function accountModal(message = "") {
  if (!backendConnected) {
    showModal(
      "<h2>Tu mundo se guarda aquí.</h2><p>En esta versión puedes crear y guardar tus sueños en este navegador. Exporta un respaldo desde Mi espacio para llevarlos contigo.</p><p>Las cuentas, la sincronización y los correos necesitan la instalación con servidor.</p>",
    );
    return;
  }
  showModal(
    `<div class="eyebrow">TU MUNDO TE ACOMPAÑA</div><h2>${account ? "Tu cuenta" : "Guarda tu próximo capítulo."}</h2>${message ? `<p>${esc(message)}</p>` : ""}${account ? `<p>${esc(account.email)}</p><p>Tus cambios de este dispositivo se guardan en tu cuenta.</p>${btn("Cerrar sesión", "logout", "button secondary")}` : `<form id="auth-form"><label>Nombre (para crear cuenta)<input name="name" autocomplete="name" maxlength="60" value="${esc(state.settings.name)}"></label><label>Correo<input name="email" type="email" autocomplete="email" required></label><label>Contraseña (mínimo 10 caracteres)<input name="password" type="password" autocomplete="current-password" minlength="10" maxlength="200" required></label><div class="button-row"><button class="button" name="mode" value="register">Crear mi cuenta</button><button class="button secondary" name="mode" value="login">Iniciar sesión</button></div><p class="hint">Al crear cuenta se guarda tu tablero actual. Al iniciar sesión podrás elegir entre tu tablero local y el de tu cuenta.</p></form>`}`,
  );
}
function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function exportImage() {
  const d = active();
  if (!d) return;
  try {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    const x = c.getContext("2d"),
      img = await loadImg(imageFor(d));
    const s = Math.max(1600 / img.width, 1000 / img.height);
    x.drawImage(
      img,
      (1600 - img.width * s) / 2,
      (1000 - img.height * s) / 2,
      img.width * s,
      img.height * s,
    );
    const gradient = x.createLinearGradient(0, 300, 0, 1000);
    gradient.addColorStop(0, "#0000");
    gradient.addColorStop(1, "#000b");
    x.fillStyle = gradient;
    x.fillRect(0, 0, 1600, 1000);
    if (d.category === "vehicles") {
      const car = await loadImg(
        "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(carSvg(d.color)),
      );
      x.drawImage(car, 300, 250, 1000, 383);
    }
    for (const p of d.pieces || []) {
      x.save();
      x.translate(p.x * 16, p.y * 10);
      x.rotate(((p.rotation || 0) * Math.PI) / 180);
      x.scale(p.scale || 1, p.scale || 1);
      if (p.type === "image") {
        const im = await loadImg(p.src);
        x.drawImage(im, 0, 0, 160, 120);
      } else {
        x.font = "60px sans-serif";
        x.fillText(p.emoji || "✦", 0, 0);
        x.fillStyle = "white";
        x.font = "22px sans-serif";
        x.fillText(p.label, 0, 30);
      }
      x.restore();
    }
    x.fillStyle = "white";
    x.font = "54px Georgia";
    x.fillText(d.title.slice(0, 50), 65, 850);
    x.font = "24px sans-serif";
    x.fillText((d.intention || "Mi próximo capítulo.").slice(0, 110), 65, 905);
    x.font = "17px sans-serif";
    x.fillText("manifestation · " + d.emotion, 65, 960);
    c.toBlob((b) => {
      if (b) download(b, "mi-vision.png", "image/png");
    });
    toast("Preparando tu imagen…");
  } catch {
    toast(
      "No se pudo exportar esta imagen. Prueba con una foto subida desde tu dispositivo.",
    );
  }
}
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}
let ritualTimer;
function ritual() {
  showModal(
    `<div class="ritual"><span class="eyebrow">UN MINUTO PARA CONECTAR</span><h2>Respira a tu ritmo.</h2><div class="breathing-orb">◌</div><p>Si te acomoda, afloja los hombros.<br>Piensa en cómo te gustaría sentirte.</p><b id="countdown">60</b><p>Si prefieres, mantén los ojos abiertos y observa tu entorno.</p>${btn("Escribir mi intención", "new-entry", "button secondary")}</div>`,
  );
  let n = 60;
  clearInterval(ritualTimer);
  ritualTimer = setInterval(() => {
    const el = $("#countdown");
    if (!el || !$("#modal").open) {
      clearInterval(ritualTimer);
      return;
    }
    el.textContent = --n;
    if (!n) {
      clearInterval(ritualTimer);
      el.textContent = "A tu ritmo. Ya estás aquí.";
    }
  }, 1000);
}
document.addEventListener("click", async (e) => {
  const v = e.target.closest("[data-view]");
  if (v) {
    e.preventDefault();
    view = v.dataset.view;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action,
    d = active();
  try {
    switch (action) {
      case "close":
        $("#modal").close();
        break;
      case "create":
        create();
        break;
      case "edit":
        create(null, d);
        break;
      case "explore":
      case "daily":
        view = action;
        render();
        break;
      case "category":
      case "filter":
        filter = b.dataset.category;
        view = "explore";
        render();
        break;
      case "template":
        create(catalog.find((c) => c.id === b.dataset.id));
        break;
      case "reference-piece": {
        const c = catalog.find((c) => c.id === b.dataset.id);
        addPiece({ label: c.title, type: "image", src: templateImage(c) });
        view = "world";
        render();
        toast("Referencia agregada a tu tablero.");
        break;
      }
      case "select":
        state.active = b.dataset.id;
        save();
        render();
        break;
      case "list":
        showModal(
          `<h2>Todo lo que estás imaginando</h2><div class="dream-list">${state.dreams.map((d) => `<button data-action="open-dream" data-id="${d.id}">${photo(d)}<span>${esc(d.title)}<small>${esc(d.status === "achieved" ? "¡Lo estoy viviendo!" : d.emotion)}</small></span>↗</button>`).join("") || "<p>Todavía no has creado un sueño.</p>"}</div>${btn("＋ Crear otro sueño", "create")}`,
        );
        break;
      case "open-dream":
        state.active = b.dataset.id;
        view = "world";
        save();
        $("#modal").close();
        render();
        break;
      case "favorite":
        state.favorites = state.favorites.includes(b.dataset.id)
          ? state.favorites.filter((id) => id !== b.dataset.id)
          : [...state.favorites, b.dataset.id];
        save();
        b.classList.toggle("on");
        b.textContent = b.classList.contains("on") ? "♥" : "♡";
        break;
      case "object":
        addPiece({ label: b.dataset.name, emoji: b.dataset.emoji });
        break;
      case "textpiece":
        if (!d) {
          create();
          break;
        }
        showModal(
          '<h2>Lo que esta pieza significa</h2><form id="text-form"><label>Tu intención o símbolo<input name="label" maxlength="120" required placeholder="Tiempo con mi familia"></label><button class="button">Agregar a mi mundo</button></form>',
        );
        break;
      case "delete-piece":
        d.pieces = d.pieces.filter((p) => p.id !== b.dataset.id);
        save();
        $("#modal").close();
        render();
        break;
      case "emotion":
        if (d) {
          d.emotion = b.dataset.emotion;
          save();
          render();
          toast("Tu visión ahora guarda esa emoción.");
        } else create();
        break;
      case "new-entry":
        note();
        break;
      case "reflect":
        note(b.dataset.id);
        break;
      case "toggle-step": {
        const entry = state.journal.find((j) => j.id === b.dataset.id);
        entry.done = !entry.done;
        save();
        render();
        break;
      }
      case "delete-entry":
        showModal(
          `<h2>¿Eliminar esta nota?</h2><p>Esta acción no se puede deshacer.</p>${btn("Eliminar nota", "confirm-delete-entry", "button", `data-id="${b.dataset.id}"`)}`,
        );
        break;
      case "confirm-delete-entry":
        state.journal = state.journal.filter((j) => j.id !== b.dataset.id);
        save();
        $("#modal").close();
        render();
        break;
      case "delete-dream":
        showModal(
          `<h2>¿Eliminar este sueño?</h2><p>Sus notas permanecerán en tu diario.</p>${btn("Eliminar sueño", "confirm-delete-dream", "button", `data-id="${b.dataset.id}"`)}`,
        );
        break;
      case "confirm-delete-dream":
        state.dreams = state.dreams.filter((j) => j.id !== b.dataset.id);
        state.active = state.dreams[0]?.id;
        save();
        $("#modal").close();
        render();
        break;
      case "generate":
        generate(d);
        break;
      case "history":
        showModal(
          `<h2>Las formas de tu sueño</h2><div class="dream-list">${(d.history || []).map((h, i) => `<button data-action="restore-scene" data-index="${i}"><img src="${esc(h.image)}" alt="Escena anterior"><span>${new Date(h.date).toLocaleDateString("es-CL")}<small>Volver a esta escena</small></span>↗</button>`).join("") || "<p>Aquí se guardarán tus escenas anteriores al generar nuevas imágenes.</p>"}</div>`,
        );
        break;
      case "restore-scene": {
        const h = d.history[Number(b.dataset.index)],
          prev = d.image;
        d.image = h.image;
        h.image = prev;
        save();
        $("#modal").close();
        render();
        break;
      }
      case "daily-generate":
        generate(
          state.dreams.find((d) => d.id === b.dataset.id),
          true,
        );
        break;
      case "account":
        accountModal();
        break;
      case "verify-email":
        await api("send-verification", {});
        showModal(
          '<h2>Revisa tu correo</h2><p>Ingresa el código de seis dígitos. Vence en 15 minutos.</p><form id="verify-form"><label>Código<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="button">Verificar correo</button></form>',
        );
        break;
      case "logout":
        await sync();
        await api("logout", {});
        account = null;
        state = defaults();
        localStorage.removeItem(key);
        dirty = false;
        $("#modal").close();
        render();
        toast("Sesión cerrada. Tu tablero sigue en tu cuenta.");
        break;
      case "backup":
        download(
          JSON.stringify(
            { version: 1, exported: new Date().toISOString(), state },
            null,
            2,
          ),
          "manifestation-respaldo.json",
          "application/json",
        );
        break;
      case "import": {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async () => {
          try {
            const file = input.files[0];
            if (file.size > 20e6) throw Error("El respaldo supera los 20 MB");
            const data = JSON.parse(await file.text());
            if (
              data.version !== 1 ||
              !data.state ||
              !Array.isArray(data.state.dreams)
            )
              throw Error("Este archivo no es un respaldo compatible");
            validateState(data.state);
            store("imported", data.state);
            showModal(
              `<h2>¿Restaurar este respaldo?</h2><p>Contiene ${data.state.dreams.length} sueños. Reemplazará el tablero actual; exporta una copia antes si quieres conservarlo.</p>${btn("Restaurar respaldo", "confirm-import")}`,
            );
          } catch (err) {
            toast(err.message);
          }
        };
        input.click();
        break;
      }
      case "confirm-import":
        state = load("imported");
        save();
        $("#modal").close();
        render();
        toast("Respaldo restaurado.");
        break;
      case "export-image":
        await exportImage();
        break;
      case "ritual":
        ritual();
        break;
      case "credits":
        showModal(
          `<h2>Imágenes e inspiración</h2><p>Referencias fotográficas de Unsplash, distribuidas bajo su licencia. Cada fotografía es una referencia editorial y puede representar varios sueños relacionados.</p><p><a href="/assets/credits.json" target="_blank" rel="noopener">Consultar todas las fuentes de imágenes ↗</a></p><p>Estilos 2026: <a href="${trendSource.url}" target="_blank" rel="noopener">Pinterest Predicts 2026 ↗</a>. Selección consultada el 18 de octubre de 2026. Sin actualización automática.</p><p>Manifestation es una herramienta creativa de visualización y preparación personal. Tú eliges qué imaginar y qué acciones realizar.</p>`,
        );
        break;
    }
  } catch (err) {
    toast(err.message);
  }
});
const memory = {};
function store(k, v) {
  memory[k] = v;
}
function load(k) {
  return memory[k];
}
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    const pos = e.target.selectionStart;
    search = e.target.value;
    render();
    $("#search").focus();
    try {
      $("#search").setSelectionRange(pos, pos);
    } catch {}
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "category-filter") {
    filter = e.target.value;
    render();
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target,
    data = new FormData(form),
    b = e.submitter;
  try {
    if (form.id === "verify-form") {
      await api("verify-email", { code: data.get("code") });
      capabilities.verified = true;
      $("#modal").close();
      render();
      toast("Correo verificado. Ya puedes activar tu recordatorio.");
    } else if (form.id === "dream-form") {
      let d = state.dreams.find((d) => d.id === form.dataset.edit);
      if (!d && state.dreams.length >= 50)
        throw Error("Puedes guardar hasta 50 sueños por tablero.");
      const values = Object.fromEntries(
        [...data].filter(([k]) => k !== "reference"),
      );
      const file = data.get("reference");
      if (file?.size) values.image = await readImage(file);
      if (
        values.image.startsWith("/assets/") &&
        d &&
        d.category !== values.category
      )
        values.image = "";
      if (!values.image) values.image = `/assets/${values.category}.jpg`;
      if (d) Object.assign(d, values);
      else {
        d = {
          ...values,
          id: uid(),
          created: new Date().toISOString(),
          pieces: [],
          history: [],
        };
        state.dreams.push(d);
      }
      state.active = d.id;
      view = "world";
      save();
      $("#modal").close();
      render();
      toast("Tu mundo ya tiene una nueva posibilidad.");
    } else if (form.id === "entry-form") {
      state.journal.push({
        ...Object.fromEntries(data),
        id: uid(),
        date: new Date().toISOString(),
        done: false,
      });
      save();
      $("#modal").close();
      view = "journal";
      render();
    } else if (form.id === "text-form") {
      addPiece({ label: data.get("label"), emoji: "✦" });
      $("#modal").close();
    } else if (form.id === "piece-form") {
      Object.assign(
        active().pieces.find((p) => p.id === form.dataset.id),
        {
          label: data.get("label"),
          scale: Number(data.get("scale")),
          rotation: Number(data.get("rotation")),
        },
      );
      save();
      $("#modal").close();
      render();
    } else if (form.id === "settings-form") {
      new Intl.DateTimeFormat("es", { timeZone: data.get("zone") });
      let notifications = data.has("notifications");
      if (notifications && "Notification" in window)
        notifications = (await Notification.requestPermission()) === "granted";
      else if (notifications) {
        notifications = false;
        toast("Este navegador no admite notificaciones.");
      }
      Object.assign(state.settings, {
        name: data.get("name"),
        time: data.get("time"),
        zone: data.get("zone"),
        email: data.has("email"),
        dailyAI: data.has("dailyAI"),
        notifications,
      });
      save();
      render();
      toast("Tus preferencias están guardadas.");
    } else if (form.id === "auth-form") {
      b.disabled = true;
      const result = await api(b.value, Object.fromEntries(data));
      account = result.user;
      capabilities = (await api("session")).capabilities;
      if (b.value === "login" && result.state) {
        store("remote", result.state);
        showModal(
          `<h2>¿Con qué mundo seguimos?</h2><p>Tu cuenta tiene ${result.state.dreams.length} sueños y este dispositivo ${state.dreams.length}.</p>${btn("Abrir el mundo de mi cuenta", "remote-state")}${btn("Conservar el de este dispositivo", "local-state", "button secondary")}`,
        );
      } else {
        await api("state", { state }, "PUT");
        dirty = false;
        $("#modal").close();
        render();
        toast("Tu cuenta está lista y tu mundo guardado.");
      }
    } else if (form.id === "generate-form") {
      b.disabled = true;
      b.textContent = "Creando tu escena… puede tardar un momento";
      const d = state.dreams.find((d) => d.id === form.dataset.id);
      await sync();
      const result = await api("generate", {
        dreamId: d.id,
        scene: data.get("scene"),
      });
      d.history ??= [];
      d.history.push({ image: imageFor(d), date: new Date().toISOString() });
      if (d.history.length > 100) d.history.shift();
      d.image = result.image;
      d.ai = true;
      save();
      $("#modal").close();
      view = "world";
      state.active = d.id;
      render();
      toast("Tu nueva escena ya está en tu mundo.");
    }
  } catch (err) {
    toast(err.message);
    if (b) {
      b.disabled = false;
      if (form.id === "generate-form") b.textContent = "Volver a intentar";
    }
  }
});
document.addEventListener("click", async (e) => {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "remote-state") {
    state = load("remote");
    localStorage.setItem(key, JSON.stringify(state));
    dirty = false;
    $("#modal").close();
    render();
  }
  if (action === "local-state") {
    save();
    await sync();
    $("#modal").close();
    render();
  }
});
setInterval(() => {
  if (
    !state.settings.notifications ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  )
    return;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: state.settings.zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value])),
    date = `${p.year}-${p.month}-${p.day}`;
  if (
    `${p.hour}:${p.minute}` === state.settings.time &&
    state.settings.lastNotice !== date
  ) {
    const d = active();
    if (!d) return;
    new Notification("Un ratito para tus sueños", {
      body: dailyTip(d),
      icon: "/icon.svg",
    });
    state.settings.lastNotice = date;
    save();
  }
}, 30000);
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").close();
});
render();
try {
  const result = await api("session");
  backendConnected = true;
  capabilities = result.capabilities;
  account = result.user;
  if (account && result.state) {
    state = result.state;
    localStorage.setItem(key, JSON.stringify(state));
  }
  render();
} catch {
  toast("Modo local: tu mundo se guarda en este dispositivo.");
}
