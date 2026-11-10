/* ===== Guiones LOGI · Fase 1: acceso, banco de ideas y calificación ===== */
(() => {
"use strict";

// Detectar si venimos de un enlace de invitación o de recuperar contraseña (antes de que Supabase limpie la URL)
const hashTipo = new URLSearchParams(location.hash.slice(1)).get("type");
let debeCrearClave = hashTipo === "invite" || hashTipo === "recovery";

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

const CRITERIOS = ["nino_5", "gusta_50", "ref_viral", "mercado_viral", "tendencia", "controversia"];
const ESTADOS = { nueva: "Nueva", calificada: "Calificada", aprobada: "Aprobada", en_espera: "En espera", descartada: "Descartada", en_guion: "En guion" };
const CAT_TIPOS = { pilar: "Pilares", tematica: "Temáticas", formato: "Formatos", objetivo: "Objetivos", presentador: "Presentadores", herramienta: "Herramientas WIL360" };

const state = { ideas: [], catalogo: [], pesos: [], lotes: [], votantes: [], votos: [], editando: null, borrador: null };

// ---------- utilidades ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style") e.style.cssText = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const fmt = n => (Math.round(n * 10) / 10).toLocaleString("es-CO");
let toastTimer;
function toast(texto, error = false) {
  $(".toast")?.remove();
  const t = h("div", { class: "toast" + (error ? " err" : "") }, texto);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), error ? 6000 : 2500);
}
function fallo(error, que) {
  console.error(que, error);
  toast(`No se pudo ${que}: ${error.message || error}`, true);
}
const pilarClass = p => p === "Importación" ? "imp" : p === "E-commerce" ? "ecom" : "";

// ---------- puntaje (mismo cálculo que la vista idea_con_puntaje) ----------
const peso = clave => Number(state.pesos.find(p => p.clave === clave)?.peso || 0);
function puntaje(idea) {
  let t = 0;
  for (const c of CRITERIOS) if (idea[c]) t += peso(c);
  if (idea.formato) t += peso("formato:" + idea.formato);
  return t;
}
function puntajeMax() {
  const crit = CRITERIOS.reduce((s, c) => s + peso(c), 0);
  const formatos = state.pesos.filter(p => p.clave.startsWith("formato:")).map(p => Number(p.peso));
  return crit + (formatos.length ? Math.max(...formatos) : 0);
}
function getUmbral() {
  try { const v = parseFloat(localStorage.getItem("umbral")); if (!isNaN(v)) return v; } catch {}
  return 6;
}

// ---------- acceso ----------
function mostrarAuth(modo, mensaje, ok) {
  $("#app").hidden = true;
  $("#auth").hidden = false;
  $("#userForm").hidden = true;
  $("#loginForm").hidden = modo !== "login";
  $("#resetForm").hidden = modo !== "reset";
  $("#newPassForm").hidden = modo !== "nueva";
  $("#authTitle").textContent = { login: "Inicia sesión", reset: "Recuperar contraseña", nueva: "Crea tu contraseña" }[modo];
  $("#authSub").textContent = {
    login: "Solo para el equipo. Si no tienes cuenta, pide una invitación.",
    reset: "Te enviaremos un enlace a tu correo.",
    nueva: "Elige una contraseña de al menos 8 caracteres."
  }[modo];
  const m = $("#authMsg");
  m.hidden = !mensaje;
  if (mensaje) { m.textContent = mensaje; m.className = "msg " + (ok ? "ok" : "err"); }
}

$("#toReset").onclick = () => mostrarAuth("reset");
$("#toLogin").onclick = () => mostrarAuth("login");

$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.submitter; btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: f.get("email"), password: f.get("password") });
  btn.disabled = false;
  if (error) mostrarAuth("login", error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
};

$("#resetForm").onsubmit = async e => {
  e.preventDefault();
  const email = new FormData(e.target).get("email");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) mostrarAuth("reset", error.message);
  else mostrarAuth("login", "Si el correo está registrado, te llegará un enlace para cambiar la contraseña.", true);
};

$("#newPassForm").onsubmit = async e => {
  e.preventDefault();
  const password = new FormData(e.target).get("password");
  const { error } = await sb.auth.updateUser({ password });
  if (error) return mostrarAuth("nueva", error.message);
  debeCrearClave = false;
  history.replaceState(null, "", location.pathname);
  const { data } = await sb.auth.getSession();
  if (data.session) entrar(data.session);
};

$("#logout").onclick = () => sb.auth.signOut();

// Sin login por ahora: config.js → REQUIERE_LOGIN = false. Para volver a exigirlo, ponerlo en true
// y correr de nuevo las políticas "equipo_todo" de schema.sql.
if (!window.REQUIERE_LOGIN) {
  $("#logout").hidden = true;
  setTimeout(() => entrar(null));
} else sb.auth.onAuthStateChange((evento, session) => {
  if (evento === "PASSWORD_RECOVERY") { debeCrearClave = true; mostrarAuth("nueva"); return; }
  if (!session) { mostrarAuth("login"); return; }
  if (debeCrearClave) { mostrarAuth("nueva"); return; }
  if (evento === "SIGNED_IN" || evento === "INITIAL_SESSION") entrar(session);
});

let dentro = false;
async function entrar(session) {
  $("#userEmail").textContent = session ? session.user.email : "";
  if (!dentro) {
    dentro = true;
    await cargarTodo();
    if (!window.REQUIERE_LOGIN && !usuarioGuardado()) return elegirUsuario();
    abrirApp();
  } else abrirApp();
}
function abrirApp() {
  $("#auth").hidden = true;
  $("#app").hidden = false;
  if (!window.REQUIERE_LOGIN) {
    $("#userEmail").textContent = "👤 " + (state.usuario?.nombre || "");
    $("#cambiarUsuario").hidden = false;
  }
  const h0 = location.hash.slice(1);
  irA(TONOS[h0] ? h0 : "ideas");
}

// ---------- usuario (sin contraseña): quién vota ----------
const ADMIN_VOTOS = "Juan Vargas"; // puede votar en la casilla de cualquiera
function usuarioGuardado() {
  let id = null;
  try { id = Number(localStorage.getItem("usuario")); } catch {}
  state.usuario = state.votantes.find(v => v.id === id && v.activo) || null;
  return state.usuario;
}
function elegirUsuario() {
  $("#app").hidden = true;
  $("#auth").hidden = false;
  ["#loginForm", "#resetForm", "#newPassForm", "#authMsg"].forEach(s => $(s).hidden = true);
  $("#userForm").hidden = false;
  $("#authTitle").textContent = "Entrar";
  $("#authSub").textContent = "Elige tu nombre para votar con tu usuario.";
  const sel = $("#userSelect");
  sel.replaceChildren(h("option", { value: "" }, "Selecciona…"),
    ...state.votantes.filter(v => v.activo).map(v => h("option", { value: v.id }, v.nombre)));
  sel.value = state.usuario ? String(state.usuario.id) : "";
}
$("#userForm").onsubmit = e => {
  e.preventDefault();
  const id = Number($("#userSelect").value);
  state.usuario = state.votantes.find(v => v.id === id) || null;
  if (!state.usuario) return;
  try { localStorage.setItem("usuario", String(id)); } catch {}
  abrirApp();
  pintarIdeas();
  window.__logi.vistas.ganchos && !$("#view-ganchos").hidden && window.__logi.vistas.ganchos();
};
$("#cambiarUsuario").onclick = () => elegirUsuario();
const esAdminVotos = () => state.usuario?.nombre === ADMIN_VOTOS;
const puedeVotar = votanteId => window.REQUIERE_LOGIN || esAdminVotos() || state.usuario?.id === votanteId;

// Fila de estrellas de un votante. onPick(valor|null) se llama al hacer clic, si tiene permiso.
function filaVoto(vt, valor, onPick) {
  const puede = puedeVotar(vt.id), yo = state.usuario?.id === vt.id;
  return h("div", { class: "voto-row" + (puede ? "" : " bloq") + (yo ? " yo" : ""), title: puede ? "" : "Solo " + vt.nombre + " puede votar aquí" },
    h("span", {}, vt.nombre, yo ? h("small", {}, " (tú)") : null),
    h("div", { class: "estrellas" }, [1, 2, 3, 4, 5].map(n => h("button", {
      type: "button", class: valor >= n ? "on" : "", disabled: !puede, "aria-label": `${vt.nombre}: ${n}`,
      onclick: () => onPick(valor === n ? null : n) }, "★"))));
}

// ---------- datos ----------
async function cargarTodo() {
  const [cat, pesos, ideas, lotes, votantes, votos] = await Promise.all([
    sb.from("catalogo").select("*").order("tipo").order("orden"),
    sb.from("peso_viralidad").select("*"),
    sb.from("idea_con_puntaje").select("*"),
    sb.from("lote").select("*").order("numero"),
    sb.from("votante").select("*").order("orden"),
    sb.from("voto").select("*")
  ]);
  if (cat.error) return fallo(cat.error, "cargar las listas");
  if (pesos.error) return fallo(pesos.error, "cargar los pesos");
  if (ideas.error) return fallo(ideas.error, "cargar las ideas");
  if (lotes.error) return fallo(lotes.error, "cargar los lotes (¿corriste 05_lotes.sql?)");
  state.catalogo = cat.data;
  state.pesos = pesos.data;
  state.ideas = ideas.data;
  state.lotes = lotes.data;
  state.votantes = votantes.data || [];
  state.votos = votos.data || [];
  llenarSelects();
  pintarIdeas();
  pintarAjustes();
}
async function recargarIdeas() {
  const [ideas, lotes, votos] = await Promise.all([
    sb.from("idea_con_puntaje").select("*"), sb.from("lote").select("*").order("numero"), sb.from("voto").select("*")]);
  if (ideas.error) return fallo(ideas.error, "cargar las ideas");
  state.ideas = ideas.data;
  if (!lotes.error) state.lotes = lotes.data;
  if (!votos.error) state.votos = votos.data;
  llenarSelects();
  pintarIdeas();
}
const valores = tipo => state.catalogo.filter(c => c.tipo === tipo && c.activo).map(c => c.valor);

function llenarSelect(sel, opciones, vacio) {
  const actual = sel.value;
  sel.replaceChildren(h("option", { value: "" }, vacio), ...opciones.map(o => h("option", { value: o }, o)));
  sel.value = opciones.includes(actual) ? actual : "";
}
function llenarSelects() {
  const fl = $("#fLote"), actualL = fl.value;
  fl.replaceChildren(h("option", { value: "" }, "Todos"), ...[...state.lotes].sort((a, b) => b.numero - a.numero).map(l => h("option", { value: l.id }, l.nombre)));
  fl.value = state.lotes.some(l => String(l.id) === actualL) ? actualL : "";
  llenarSelect($("#fPilar"), valores("pilar"), "Todos");
  llenarSelect($("#fTematica"), valores("tematica"), "Todas");
  const est = $("#fEstado");
  const actual = est.value;
  est.replaceChildren(h("option", { value: "" }, "Todos"), ...Object.entries(ESTADOS).map(([k, v]) => h("option", { value: k }, v)));
  est.value = actual;
  $$("select[data-cat]").forEach(s => llenarSelect(s, valores(s.dataset.cat), "—"));
  // En la calculadora, cada formato muestra lo que suma
  const fs = $("#ideaForm select[name=formato]");
  [...fs.options].forEach(o => { if (o.value) o.textContent = `${o.value} (+${fmt(peso("formato:" + o.value))})`; });
}

// ---------- navegación ----------
const TONOS = {
  ideas:   ["rgba(242,106,46,.16)", "rgba(30,64,175,.28)", 15, 20, 85, 80],
  guiones: ["rgba(245,166,35,.18)", "rgba(16,25,89,.40)", 80, 15, 20, 85],
  storyboard: ["rgba(229,37,53,.14)", "rgba(30,64,175,.30)", 50, 10, 50, 95],
  ganchos: ["rgba(108,99,255,.20)", "rgba(245,166,35,.16)", 20, 80, 85, 15],
  ajustes: ["rgba(108,99,255,.20)", "rgba(242,106,46,.14)", 80, 20, 20, 85]
};
const vistas = { ideas: () => recargarIdeas() };   // cada pestaña registra aquí su función de carga
function irA(vista, sinCargar) {
  if (!sinCargar && vistas[vista]) vistas[vista]();
  $$("#tabs button[data-view]").forEach(b => b.setAttribute("aria-selected", b.dataset.view === vista));
  $$(".view").forEach(v => v.hidden = v.id !== "view-" + vista);
  const [c1, c2, x1, y1, x2, y2] = TONOS[vista];
  const st = $("#glow").style;
  st.setProperty("--g1", c1); st.setProperty("--g2", c2);
  st.setProperty("--g1x", x1 + "%"); st.setProperty("--g1y", y1 + "%");
  st.setProperty("--g2x", x2 + "%"); st.setProperty("--g2y", y2 + "%");
  history.replaceState(null, "", "#" + vista);
}
$$("#tabs button[data-view]").forEach(b => b.onclick = () => irA(b.dataset.view));

// ---------- utilidades de ideas ----------
const dosD = n => String(n).padStart(2, "0");
const nombreLote = n => { const d = new Date(); return `LOTE ${n} · ${dosD(d.getDate())}/${dosD(d.getMonth() + 1)}/${d.getFullYear()}`; };
const loteReciente = () => [...state.lotes].sort((a, b) => b.numero - a.numero)[0] || null;
const siguienteNumero = () => Math.max(0, ...state.ideas.map(i => i.numero || 0)) + 1;
const votosDe = id => state.votos.filter(v => v.idea_id === id);
const promedio = arr => arr.length ? arr.reduce((s, v) => s + v.puntaje, 0) / arr.length : null;

const NIVELES = [
  ["0", "No sabe que tiene el problema"],
  ["1", "Sabe que tiene el problema"],
  ["2", "Sabe cómo se soluciona"],
  ["3", "Sabe quién lo soluciona"],
  ["4", "Sabe con qué producto"]
];
// Sugerencia: si la entiende un niño de 5 años y le gusta a 50 de 100, habla a los niveles bajos (0-1)
function sugerirNivel(d) {
  if (d.pilar === "Herramientas") return 3;
  const marcados = CRITERIOS.some(c => d[c]);
  if (!marcados) return null;
  const base = (d.nino_5 ? 1 : 0) + (d.gusta_50 ? 1 : 0);
  return base === 2 ? 1 : base === 1 ? 2 : 3;
}

// Parecido entre ideas (palabras en común, sin tildes ni palabras vacías)
const VACIAS = new Set("para como cuando porque pero este esta esto estos estas tienes tiene sobre desde hasta donde entre todo toda todos todas solo sola cada antes despues mismo misma otra otro otros nada algo hace hacer haces muy mas menos sino ellos ellas nosotros usted tu tus mis sus que con los las del una uno unos unas por sin hay son ser fue era".split(" "));
const tokens = s => new Set((s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ")
  .split(/\s+/).filter(w => w.length > 3 && !VACIAS.has(w)).map(w => w.slice(0, 4)));   // raíz: chino/china, vender/vendes
function parecidas(titulo, texto, excluirId) {
  const tA = tokens(titulo), fA = tokens(titulo + " " + (texto || "").split(/\s+/).slice(0, 40).join(" "));
  if (!tA.size) return [];
  return state.ideas.filter(i => i.id !== excluirId).map(i => {
    const tB = tokens(i.titulo), fB = tokens(i.titulo + " " + (i.texto_base || "").split(/\s+/).slice(0, 40).join(" "));
    const enComunT = [...tA].filter(w => tB.has(w)).length, enComunF = [...fA].filter(w => fB.has(w)).length;
    const comT = enComunT >= 2 ? enComunT / Math.max(1, Math.min(tA.size, tB.size)) : 0;   // al menos 2 palabras en común
    const comF = enComunF >= 3 ? enComunF / Math.max(1, new Set([...fA, ...fB]).size) : 0;
    return { i, s: Math.max(comT, comF * 1.6) };
  }).filter(x => x.s >= 0.5).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.i);
}
const resumenIdea = i => {
  const v = votosDe(i.id), p = promedio(v);
  return `#${i.numero ?? "–"} «${i.titulo}» · ${i.lote_nombre || "sin lote"}` + (p != null ? ` · ★ ${fmt(p)}` : "") + (i.calificada ? ` · calc. ${fmt(Number(i.puntaje_total))}` : "") + ` · ${ESTADOS[i.estado] || i.estado}`;
};

// ---------- lista de ideas ----------
$("#fUmbral").value = getUmbral();
["fText", "fLote", "fPilar", "fTematica", "fEstado", "fOrden", "fUmbral"].forEach(id => $("#" + id).addEventListener("input", () => {
  if (id === "fUmbral") { try { localStorage.setItem("umbral", $("#fUmbral").value); } catch {} }
  pintarIdeas();
}));

function tarjetaIdea(i, umbral, max) {
  const p = Number(i.puntaje_total), v = votosDe(i.id), prom = promedio(v);
  const alto = i.calificada && p >= umbral && i.estado !== "descartada";
  const mio = state.usuario && v.find(x => x.votante_id === state.usuario.id);
  return h("article", { class: "idea" + (alto ? " top" : "") + (mio ? " votada" : "") + (i.estado === "descartada" ? " descartada" : ""), tabindex: 0,
    onclick: () => abrirIdea(i), onkeydown: e => { if (e.key === "Enter") abrirIdea(i); } },
    h("div", { class: "n" }, i.numero ?? "–"),
    h("div", {},
      h("h3", {}, i.titulo),
      h("div", { class: "chips" },
        mio && h("span", { class: "chip votaste" }, `✓ Votaste ★${mio.puntaje}`),
        i.pilar && h("span", { class: "chip " + pilarClass(i.pilar) }, i.pilar),
        i.tematica && h("span", { class: "chip" }, i.tematica),
        i.herramienta && h("span", { class: "chip" }, "🔧 " + i.herramienta),
        i.nivel_conciencia != null && h("span", { class: "chip nivel" }, "Nivel " + i.nivel_conciencia),
        i.rescatada_de && h("span", { class: "chip" }, "Rescatada"),
        h("span", { class: "chip estado-" + i.estado }, ESTADOS[i.estado])),
      i.calificada && h("div", { class: "dots", title: "Criterios en Sí" }, CRITERIOS.map(c => h("i", { class: i[c] ? "on" : "" })))),
    h("div", { class: "scores" },
      h("div", { class: "score voto" + (prom != null && prom >= 4 ? " alto" : "") },
        h("b", {}, prom != null ? "★ " + fmt(prom) : "★ –"), h("small", {}, `${v.length} voto${v.length === 1 ? "" : "s"}`)),
      h("div", { class: "score" + (alto ? " alto" : "") + (i.calificada ? "" : " sin") },
        h("b", {}, i.calificada ? fmt(p) : "–"), h("small", {}, i.calificada ? "calc. de " + fmt(max) : "sin calcular"))));
}

function pintarIdeas() {
  const q = $("#fText").value.trim().toLowerCase();
  const fl = $("#fLote").value, fp = $("#fPilar").value, ft = $("#fTematica").value, fe = $("#fEstado").value, orden = $("#fOrden").value;
  const umbral = parseFloat($("#fUmbral").value) || 0;
  const max = puntajeMax();
  const enGuion = i => i.estado === "en_guion" || i.guion_id != null;

  const coincide = i => (!fl || String(i.lote_id) === fl) && (!fp || i.pilar === fp) && (!ft || i.tematica === ft) &&
    (!q || [i.titulo, i.texto_base, i.palabras_clave].some(t => (t || "").toLowerCase().includes(q)));
  const activas = state.ideas.filter(i => !enGuion(i) && coincide(i) && (!fe || i.estado === fe));
  const usadas = state.ideas.filter(i => enGuion(i) && coincide(i));
  const prom = i => promedio(votosDe(i.id)) ?? -1;
  const por = {
    voto: (a, b) => prom(b) - prom(a) || (b.puntaje_total - a.puntaje_total),
    puntaje: (a, b) => (b.calificada - a.calificada) || (b.puntaje_total - a.puntaje_total) || prom(b) - prom(a),
    numero: (a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9),
    reciente: (a, b) => new Date(b.creado_en) - new Date(a.creado_en)
  }[orden];

  const todas = state.ideas.filter(i => !enGuion(i));
  $("#stats").replaceChildren(
    h("span", {}, h("b", {}, todas.length), "ideas disponibles"),
    h("span", {}, h("b", {}, todas.filter(i => i.estado === "en_espera").length), "en espera"),
    h("span", {}, h("b", {}, todas.filter(i => i.calificada).length), "con calculadora"),
    h("span", {}, h("b", {}, state.ideas.filter(enGuion).length), "en guion"),
    h("span", {}, h("b", {}, state.lotes.length), state.lotes.length === 1 ? "lote" : "lotes"));

  // Agrupar por lote, el más reciente primero
  const grupos = new Map();
  for (const i of activas) {
    const k = i.lote_id ?? 0;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(i);
  }
  const lotesOrden = [...grupos.keys()].sort((a, b) =>
    (state.lotes.find(l => l.id === b)?.numero ?? -1) - (state.lotes.find(l => l.id === a)?.numero ?? -1));
  const reciente = loteReciente();

  const bloques = lotesOrden.map(k => {
    const l = state.lotes.find(x => x.id === k);
    const lista = grupos.get(k).sort(por);
    return h("section", { class: "lote-grupo" },
      h("div", { class: "lote-head" },
        h("h3", {}, l ? l.nombre : "Sin lote"),
        l && reciente && l.id === reciente.id && h("span", { class: "chip estado-calificada" }, "Más reciente"),
        h("span", { class: "lote-n" }, `${lista.length} idea${lista.length === 1 ? "" : "s"}`)),
      h("div", { class: "list" }, lista.map(i => tarjetaIdea(i, umbral, max))));
  });

  const cont = [];
  if (!bloques.length) cont.push(h("div", { class: "empty" },
    h("b", {}, state.ideas.length ? "Ninguna idea coincide con los filtros" : "Todavía no hay ideas"),
    state.ideas.length ? "Cambia los filtros o la búsqueda." : "Sube tu Excel de ideas o agrega una con «+ Nueva idea»."));
  else cont.push(...bloques);

  if (usadas.length) cont.push(h("details", { class: "ya-guion" },
    h("summary", {}, `Ya en guion (${usadas.length})`),
    h("div", { class: "list" }, usadas.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0)).map(i =>
      h("div", { class: "usada" },
        h("span", { class: "n" }, i.numero ?? "–"),
        h("span", { class: "t" }, i.titulo, h("small", {}, ` · ${i.lote_nombre || "sin lote"}`)),
        h("button", { class: "btn small", onclick: () => abrirIdea(i) }, "Ver idea"),
        i.guion_id && h("button", { class: "btn small primary", onclick: () => window.__logi.abrirGuion?.(i.guion_id) }, "Ver guion"))))));
  $("#list").replaceChildren(...cont);
}

// ---------- diálogo de idea ----------
const dlg = $("#dlgIdea");
const form = $("#ideaForm");
$$("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());

function pintarCalc() {
  const d = state.borrador;
  $("#crits").replaceChildren(...CRITERIOS.map(c => {
    const etiqueta = state.pesos.find(p => p.clave === c)?.etiqueta || c;
    const seg = h("div", { class: "seg" },
      h("button", { type: "button", class: "si" + (d[c] ? " on" : ""), onclick: () => { d[c] = true; pintarCalc(); } }, "Sí"),
      h("button", { type: "button", class: "no" + (!d[c] ? " on" : ""), onclick: () => { d[c] = false; pintarCalc(); } }, "No"));
    return h("div", { class: "crit" }, h("div", {}, etiqueta, h("small", {}, `+${fmt(peso(c))} puntos`)), seg);
  }));
  d.formato = form.formato.value || null;
  d.pilar = form.pilar.value || null;
  const vals = state.pesos.filter(p => p.clave.startsWith("formato:")).sort((a, b) => b.peso - a.peso)
    .map(p => `${p.clave.slice(8)} +${fmt(p.peso)}`);
  $("#formatoValor").textContent = (d.formato ? `Este formato suma +${fmt(peso("formato:" + d.formato))}. ` : "") + "Valor por formato: " + vals.join(" · ");
  const t = puntaje(d), max = puntajeMax();
  $("#calcTotal").textContent = fmt(t);
  $("#calcMax").textContent = "de " + fmt(max);
  $("#calcBar").style.width = (max ? Math.min(100, t / max * 100) : 0) + "%";
  pintarNivel();
}
form.formato.addEventListener("change", pintarCalc);
form.pilar.addEventListener("change", pintarCalc);

function pintarNivel() {
  const d = state.borrador, sug = sugerirNivel(d);
  $("#nivelSug").textContent = sug == null ? "Marca la calculadora para ver una sugerencia." : `Sugerido: nivel ${sug}. Confírmalo o elige otro.`;
  $("#niveles").replaceChildren(...NIVELES.map(([n, txt]) => h("button", {
    type: "button", class: "nivel-b" + (String(d.nivel_conciencia) === n ? " on" : "") + (String(sug) === n ? " sug" : ""),
    title: txt, onclick: () => { d.nivel_conciencia = String(d.nivel_conciencia) === n ? null : Number(n); pintarNivel(); } },
    h("b", {}, n), h("small", {}, txt))));
}

function pintarVotos() {
  const d = state.borrador;
  const activos = state.votantes.filter(v => v.activo);
  $("#votos").replaceChildren(...activos.map(vt => filaVoto(vt, d.votos[vt.id], valor => {
    d.votos[vt.id] = valor;
    pintarVotos();
    if (state.editando) guardarVoto(state.editando.id, vt.id, valor);
  })));
  const vals = Object.values(d.votos).filter(Boolean);
  $("#votoProm").textContent = vals.length ? `Promedio ★ ${fmt(vals.reduce((a, b) => a + b, 0) / vals.length)} · ${vals.length} voto${vals.length === 1 ? "" : "s"}` : "Sin votos";
}

function pintarParecidas() {
  const id = state.editando?.id;
  const lista = parecidas(form.titulo.value, form.texto_base.value, id);
  const box = $("#parecidas");
  box.hidden = !lista.length;
  box.replaceChildren(h("b", {}, "Se parece a ideas ya escritas:"), h("ul", {}, lista.map(i => h("li", {}, resumenIdea(i)))));
}
let tParecidas;
form.titulo.addEventListener("input", () => { clearTimeout(tParecidas); tParecidas = setTimeout(pintarParecidas, 300); });

function llenarLoteSelect(sel, actual) {
  const nuevo = (Math.max(0, ...state.lotes.map(l => l.numero)) + 1);
  sel.replaceChildren(
    ...[...state.lotes].sort((a, b) => b.numero - a.numero).map(l => h("option", { value: l.id }, l.nombre)),
    h("option", { value: "nuevo" }, `+ ${nombreLote(nuevo)}`));
  sel.value = actual != null ? String(actual) : (loteReciente() ? String(loteReciente().id) : "nuevo");
}

function abrirIdea(idea) {
  state.editando = idea || null;
  state.borrador = Object.fromEntries(CRITERIOS.map(c => [c, idea ? !!idea[c] : false]));
  state.borrador.nivel_conciencia = idea?.nivel_conciencia ?? null;
  state.borrador.votos = Object.fromEntries((idea ? votosDe(idea.id) : []).map(v => [v.votante_id, v.puntaje]));
  form.reset();
  llenarSelects();
  llenarLoteSelect(form.lote_id, idea?.lote_id);
  const campos = ["titulo", "texto_base", "texto_pantalla", "pilar", "tematica", "presentador", "origen", "referencia_url", "contexto", "palabras_clave", "formato", "herramienta"];
  if (idea) campos.forEach(c => { if (form[c]) form[c].value = idea[c] ?? ""; });
  if (!form.origen.value) form.origen.value = "manual";
  const enGuion = idea && (idea.estado === "en_guion" || idea.guion_id != null);
  const reciente = loteReciente();
  $("#ideaTitle").textContent = idea ? `Idea ${idea.numero ?? ""}` + (idea.lote_nombre ? ` · ${idea.lote_nombre}` : "") : "Nueva idea";
  $("#btnDelete").hidden = !idea || enGuion;
  $("#btnEspera").hidden = !idea || enGuion || idea.estado === "en_espera";
  $("#btnDescartar").hidden = !idea || enGuion || idea.estado === "descartada";
  $("#btnCrearGuion").hidden = !idea || enGuion;
  $("#btnVerGuion").hidden = !enGuion || !idea.guion_id;
  $("#btnRescatar").hidden = !idea || enGuion || !reciente || idea.lote_id === reciente.id;
  if (!$("#btnRescatar").hidden) $("#btnRescatar").textContent = `Rescatar a ${reciente.nombre.split(" · ")[0]}`;
  pintarCalc();
  pintarVotos();
  pintarParecidas();
  dlg.showModal();
  arriba(dlg);
}
// Al abrir otra tarjeta, el detalle empieza desde arriba
function arriba(d) { [d, ...d.querySelectorAll("*")].forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); }
$("#btnNew").onclick = () => abrirIdea(null);

async function asegurarLote(valor) {
  if (valor && valor !== "nuevo") return Number(valor);
  const numero = Math.max(0, ...state.lotes.map(l => l.numero)) + 1;
  const { data, error } = await sb.from("lote").insert({ numero, nombre: nombreLote(numero) }).select().single();
  if (error) { fallo(error, "crear el lote"); return null; }
  state.lotes.push(data);
  return data.id;
}

function datosForm() {
  const f = new FormData(form);
  const v = k => { const x = (f.get(k) || "").toString().trim(); return x || null; };
  const d = state.borrador;
  return {
    titulo: v("titulo"), texto_base: v("texto_base"), texto_pantalla: v("texto_pantalla"), pilar: v("pilar"), tematica: v("tematica"),
    presentador: v("presentador"), origen: v("origen") || "manual", referencia_url: v("referencia_url"),
    contexto: v("contexto"), palabras_clave: v("palabras_clave"), formato: v("formato"), herramienta: v("herramienta"),
    nivel_conciencia: d.nivel_conciencia ?? null,
    ...Object.fromEntries(CRITERIOS.map(c => [c, !!d[c]]))
  };
}

// El voto se guarda al instante (sin botón Guardar) cuando la idea ya existe
async function guardarVoto(ideaId, votanteId, valor) {
  const r = valor
    ? await sb.from("voto").upsert({ idea_id: ideaId, votante_id: votanteId, puntaje: valor })
    : await sb.from("voto").delete().eq("idea_id", ideaId).eq("votante_id", votanteId);
  if (r.error) return fallo(r.error, "guardar el voto");
  state.votos = state.votos.filter(v => !(v.idea_id === ideaId && v.votante_id === votanteId));
  if (valor) state.votos.push({ idea_id: ideaId, votante_id: votanteId, puntaje: valor });
  toast(valor ? "Voto guardado" : "Voto quitado");
  pintarIdeas();
}

async function guardarVotos(ideaId) {
  const antes = Object.fromEntries(votosDe(ideaId).map(v => [v.votante_id, v.puntaje]));
  const ahora = state.borrador.votos;
  const upserts = Object.entries(ahora).filter(([k, p]) => p && antes[k] !== p).map(([k, p]) => ({ idea_id: ideaId, votante_id: Number(k), puntaje: p }));
  const borrar = Object.keys(antes).filter(k => !ahora[k]);
  if (upserts.length) { const { error } = await sb.from("voto").upsert(upserts); if (error) { fallo(error, "guardar los votos"); return false; } }
  for (const k of borrar) { const { error } = await sb.from("voto").delete().eq("idea_id", ideaId).eq("votante_id", Number(k)); if (error) { fallo(error, "borrar un voto"); return false; } }
  return true;
}

async function guardarIdea(estadoNuevo, cerrar = true) {
  if (!form.reportValidity()) return null;
  const d = datosForm();
  const yaCalificada = state.editando?.calificada;
  d.calificada = !!(yaCalificada || CRITERIOS.some(c => d[c]));
  const estadoActual = state.editando?.estado || "nueva";
  d.estado = estadoNuevo || (estadoActual === "nueva" && d.calificada ? "calificada" : estadoActual);
  d.lote_id = await asegurarLote(form.lote_id.value);
  if (d.lote_id == null) return null;

  let id;
  if (state.editando) {
    const { error } = await sb.from("idea").update(d).eq("id", state.editando.id);
    if (error) { fallo(error, "guardar la idea"); return null; }
    id = state.editando.id;
  } else {
    d.numero = siguienteNumero();
    const { data, error } = await sb.from("idea").insert(d).select().single();
    if (error) { fallo(error, "guardar la idea"); return null; }
    id = data.id;
  }
  if (!(await guardarVotos(id))) return null;
  if (cerrar) dlg.close();
  toast({ en_espera: "Idea en espera", descartada: "Idea descartada" }[estadoNuevo] || "Idea guardada");
  await recargarIdeas();
  return state.ideas.find(i => i.id === id);
}
form.addEventListener("submit", e => { e.preventDefault(); guardarIdea(); });
$("#btnEspera").onclick = () => guardarIdea("en_espera");
$("#btnDescartar").onclick = () => guardarIdea("descartada");
$("#btnCrearGuion").onclick = async () => {
  const idea = await guardarIdea(null, false);
  if (!idea) return;
  dlg.close();
  await window.__logi.crearGuion?.(idea);
};
$("#btnVerGuion").onclick = () => { dlg.close(); window.__logi.abrirGuion?.(state.editando.guion_id); };
$("#btnRescatar").onclick = async () => {
  const o = state.editando, reciente = loteReciente();
  if (!o || !reciente) return;
  const copia = { numero: siguienteNumero(), lote_id: reciente.id, rescatada_de: o.id, estado: "nueva", origen: o.origen,
    titulo: o.titulo, texto_base: o.texto_base, texto_pantalla: o.texto_pantalla, pilar: o.pilar, tematica: o.tematica,
    formato: o.formato, presentador: o.presentador, referencia_url: o.referencia_url, contexto: o.contexto,
    palabras_clave: o.palabras_clave, herramienta: o.herramienta };
  const { error } = await sb.from("idea").insert(copia);
  if (error) return fallo(error, "rescatar la idea");
  dlg.close(); toast(`Idea rescatada en ${reciente.nombre}. La original sigue en su lote.`);
  recargarIdeas();
};
$("#btnDelete").onclick = async () => {
  if (!state.editando || !confirm(`¿Eliminar la idea «${state.editando.titulo}»? Esto no se puede deshacer.`)) return;
  const { error } = await sb.from("idea").delete().eq("id", state.editando.id);
  if (error) return fallo(error, "eliminar la idea");
  dlg.close(); toast("Idea eliminada"); recargarIdeas();
};

// ---------- subir Excel ----------
const ALIAS = {
  titulo: /^(idea|t[ií]tulo|idea\s*\/\s*t[ií]tulo|idea central)/i,
  pilar: /^pilar/i, tematica: /^tem[aá]tica/i, formato: /^formato/i, origen: /^origen/i,
  texto_base: /^(guion|texto base|guion\s*\/\s*texto base)/i, texto_pantalla: /pantalla/i, duracion_aprox_s: /^duraci/i,
  referencia_url: /^(referencia|link)/i, contexto: /^contexto/i, palabras_clave: /clave/i, herramienta: /^herramienta/i
};
const ORIGEN = s => /ia/i.test(s || "") && !/referencia/i.test(s) ? "ia" : /referencia/i.test(s || "") ? "referencia" : "manual";
let importacion = [];

$("#btnExcel").onclick = () => $("#fileExcel").click();
$("#fileExcel").onchange = async e => {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  if (!window.XLSX) return toast("No se pudo cargar el lector de Excel. Revisa la conexión.", true);
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer()); } catch (err) { return fallo(err, "leer el Excel"); }
  const hoja = wb.Sheets[wb.SheetNames.find(n => /^ideas$/i.test(n)) || wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
  const hi = filas.findIndex(r => r.some(c => ALIAS.titulo.test(String(c).trim())));
  if (hi < 0) return toast("No encontré la columna «Idea / Título». Usa la plantilla.", true);
  const cab = filas[hi].map(c => String(c).trim());
  const col = {};
  for (const [k, re] of Object.entries(ALIAS)) { const j = cab.findIndex(c => re.test(c)); if (j >= 0) col[k] = j; }
  // Nombres anteriores de las columnas de votos (plantillas viejas)
  const ANTES = { "juan vargas": ["juan"], "willington": ["wilinton", "wilington"], "juan grillo": ["juan g"], "thiago": ["santi"] };
  const esDe = (c, v) => { const n = v.nombre.toLowerCase(), x = c.toLowerCase(); return x === n || (ANTES[n] || []).includes(x); };
  const votCols = state.votantes.map(v => [v, cab.findIndex(c => esDe(c, v))]).filter(([, j]) => j >= 0);
  const ignorados = cab.filter((c, j) => c && !Object.values(col).includes(j) && !votCols.some(([, k]) => k === j) && !/puntuaci|promedio|top|^#$|fecha|estado|origen/i.test(c));

  importacion = filas.slice(hi + 1).map(r => {
    const g = k => col[k] != null ? String(r[col[k]] ?? "").trim() : "";
    let titulo = g("titulo"), texto = g("texto_base");
    if (!titulo && texto) titulo = texto.split(/\r?\n/)[0].slice(0, 120);
    if (!titulo || /^\(EJEMPLO/i.test(titulo)) return null;
    const votos = votCols.map(([v, j]) => [v.id, Number(r[j])]).filter(([, p]) => p >= 1 && p <= 5);
    return { incluir: true, votos, d: {
      titulo, texto_base: texto || null, texto_pantalla: g("texto_pantalla") || null,
      pilar: g("pilar") || null, tematica: g("tematica") || null, formato: g("formato") || null,
      origen: ORIGEN(g("origen")), duracion_aprox_s: Number(g("duracion_aprox_s")) || null,
      referencia_url: g("referencia_url") || null, contexto: g("contexto") || null,
      palabras_clave: g("palabras_clave") || null, herramienta: g("herramienta") || null } };
  }).filter(Boolean);
  importacion.forEach(x => { x.parecidas = parecidas(x.d.titulo, x.d.texto_base); });
  if (!importacion.length) return toast("El Excel no tiene ideas para subir", true);
  pintarImportacion(file.name, ignorados);
  $("#dlgExcel").showModal();
};

function pintarImportacion(nombre, ignorados) {
  llenarLoteSelect($("#impLote"), "nuevo");
  $("#impInfo").textContent = `${nombre}: ${importacion.length} ideas` + (ignorados.length ? ` · columnas que no se usan: ${ignorados.join(", ")}` : "");
  const conParecida = importacion.filter(x => x.parecidas.length).length;
  $("#impAviso").hidden = !conParecida;
  $("#impAviso").textContent = `${conParecida} idea${conParecida === 1 ? " se parece" : "s se parecen"} a otras ya escritas. Revísalas y desmarca las repetidas.`;
  $("#impTabla").replaceChildren(...importacion.map(x => h("tr", { class: x.parecidas.length ? "dup" : "" },
    h("td", {}, h("input", { type: "checkbox", checked: x.incluir, "aria-label": "Incluir", onchange: e => { x.incluir = e.target.checked; contarImport(); } })),
    h("td", {}, h("b", {}, x.d.titulo), x.parecidas.length ? h("ul", { class: "parec" }, x.parecidas.map(i => h("li", {}, "Se parece a " + resumenIdea(i)))) : null),
    h("td", {}, [x.d.pilar, x.d.tematica].filter(Boolean).join(" · ") || "—"),
    h("td", {}, x.votos.length ? `★ ${fmt(x.votos.reduce((s, [, p]) => s + p, 0) / x.votos.length)} (${x.votos.length})` : "—"))));
  contarImport();
}
function contarImport() { $("#impSubir").textContent = `Subir ${importacion.filter(x => x.incluir).length} ideas`; }

$("#excelForm").addEventListener("submit", async e => {
  e.preventDefault();
  const sel = importacion.filter(x => x.incluir);
  if (!sel.length) return toast("No hay ideas marcadas", true);
  const loteId = await asegurarLote($("#impLote").value);
  if (loteId == null) return;
  let n = siguienteNumero() - 1;
  const filas = sel.map(x => ({ ...x.d, numero: ++n, lote_id: loteId, estado: "nueva" }));
  const { data, error } = await sb.from("idea").insert(filas).select("id, numero");
  if (error) return fallo(error, "subir las ideas");
  const votos = [];
  sel.forEach((x, k) => { const id = data.find(r => r.numero === filas[k].numero)?.id; x.votos.forEach(([vid, p]) => votos.push({ idea_id: id, votante_id: vid, puntaje: p })); });
  if (votos.length) { const r = await sb.from("voto").insert(votos); if (r.error) fallo(r.error, "subir los votos"); }
  $("#dlgExcel").close();
  toast(`${filas.length} ideas subidas`);
  await cargarTodo();
  $("#fLote").value = String(loteId);
  pintarIdeas();
});

// ---------- ajustes ----------
function pintarAjustes() {
  const orden = [...state.pesos].sort((a, b) => (a.clave.startsWith("formato:") - b.clave.startsWith("formato:")) || b.peso - a.peso);
  $("#pesos").replaceChildren(...orden.map(p => h("div", { class: "peso" },
    h("span", {}, p.etiqueta),
    h("input", { type: "number", step: "0.1", min: "0", value: p.peso, "data-clave": p.clave }))));

  $("#catalogos").replaceChildren(...Object.entries(CAT_TIPOS).map(([tipo, titulo]) => {
    const items = state.catalogo.filter(c => c.tipo === tipo && c.activo);
    const input = h("input", { type: "text", placeholder: "Agregar…" });
    const agregar = async () => {
      const valor = input.value.trim();
      if (!valor) return;
      const existente = state.catalogo.find(c => c.tipo === tipo && c.valor.toLowerCase() === valor.toLowerCase());
      const res = existente
        ? await sb.from("catalogo").update({ activo: true }).eq("id", existente.id)
        : await sb.from("catalogo").insert({ tipo, valor, orden: items.length + 1 });
      if (res.error) return fallo(res.error, "agregar a la lista");
      if (tipo === "formato" && !state.pesos.some(p => p.clave === "formato:" + valor)) {
        await sb.from("peso_viralidad").insert({ clave: "formato:" + valor, etiqueta: "Formato " + valor, peso: 0 });
      }
      await cargarTodo();
    };
    input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); agregar(); } });
    return h("div", { class: "cat-group" },
      h("h4", {}, titulo),
      h("div", { class: "cat-items" }, items.length ? items.map(c => h("span", { class: "chip" }, c.valor,
        h("button", { title: "Quitar de la lista", onclick: async () => {
          const { error } = await sb.from("catalogo").update({ activo: false }).eq("id", c.id);
          if (error) return fallo(error, "quitar de la lista");
          cargarTodo();
        } }, "×"))) : h("span", { class: "chip" }, "Vacío")),
      h("div", { class: "cat-add" }, input, h("button", { class: "btn small", onclick: agregar }, "Agregar")));
  }));

  // Votantes del equipo
  const inV = h("input", { type: "text", placeholder: "Nombre de la persona…" });
  const agregarV = async () => {
    const nombre = inV.value.trim();
    if (!nombre) return;
    const ex = state.votantes.find(v => v.nombre.toLowerCase() === nombre.toLowerCase());
    const res = ex ? await sb.from("votante").update({ activo: true }).eq("id", ex.id)
      : await sb.from("votante").insert({ nombre, orden: state.votantes.length + 1 });
    if (res.error) return fallo(res.error, "agregar la persona");
    toast(`${nombre} ya puede votar`);
    cargarTodo();
  };
  inV.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); agregarV(); } });
  $("#votantes").replaceChildren(
    h("div", { class: "cat-items" }, state.votantes.filter(v => v.activo).map(v => h("span", { class: "chip" }, v.nombre,
      h("button", { title: "Quitar de la votación (sus votos se conservan)", onclick: async () => {
        const { error } = await sb.from("votante").update({ activo: false }).eq("id", v.id);
        if (error) return fallo(error, "quitar a la persona");
        cargarTodo();
      } }, "×")))),
    h("div", { class: "cat-add" }, inV, h("button", { class: "btn small", onclick: agregarV }, "Agregar persona")));
}
$("#savePesos").onclick = async () => {
  const filas = $$("#pesos input").map(i => ({ clave: i.dataset.clave, peso: Number(i.value) || 0 }));
  const cambios = filas.filter(f => Number(state.pesos.find(p => p.clave === f.clave)?.peso) !== f.peso);
  if (!cambios.length) return toast("No hay cambios");
  for (const c of cambios) {
    const { error } = await sb.from("peso_viralidad").update({ peso: c.peso }).eq("clave", c.clave);
    if (error) return fallo(error, "guardar los pesos");
  }
  toast("Pesos guardados");
  cargarTodo();
};

// ---------- partículas de fondo ----------
(() => {
  const cv = $("#particles"), ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
  addEventListener("resize", fit); fit();
  const nueva = p => Object.assign(p, {
    x: Math.random() * cv.width, y: Math.random() * cv.height, r: Math.random() * 2.2 + .8,
    vx: (Math.random() - .5) * .45, vy: (Math.random() - .5) * .45,
    c: Math.random() > .45 ? "rgba(242,106,46," : "rgba(30,64,175,", o: Math.random() * .5 + .15 });
  const P = Array.from({ length: 38 }, () => nueva({}));
  (function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!reduce) { p.x += p.vx; p.y += p.vy; }
      if (p.x < 0 || p.x > cv.width || p.y < 0 || p.y > cv.height) nueva(p);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c + p.o + ")"; ctx.fill();
      for (let j = i + 1; j < P.length; j++) {
        const d = Math.hypot(p.x - P[j].x, p.y - P[j].y);
        if (d < 110) { ctx.beginPath(); ctx.strokeStyle = `rgba(242,106,46,${.08 * (1 - d / 110)})`; ctx.lineWidth = .6; ctx.moveTo(p.x, p.y); ctx.lineTo(P[j].x, P[j].y); ctx.stroke(); }
      }
    }
    if (!reduce) requestAnimationFrame(frame);
  })();
})();

// Para pruebas desde la consola del navegador
window.__logi = { state, pintarIdeas, abrirIdea, pintarAjustes, llenarSelects, entrar, filaVoto, arriba,
  sb, h, $, $$, toast, fallo, valores, irA, vistas };
})();
