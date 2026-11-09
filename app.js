/* ===== Guiones LOGI · Fase 1: acceso, banco de ideas y calificación ===== */
(() => {
"use strict";

// Detectar si venimos de un enlace de invitación o de recuperar contraseña (antes de que Supabase limpie la URL)
const hashTipo = new URLSearchParams(location.hash.slice(1)).get("type");
let debeCrearClave = hashTipo === "invite" || hashTipo === "recovery";

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

const CRITERIOS = ["nino_5", "gusta_50", "ref_viral", "mercado_viral", "tendencia", "controversia"];
const ESTADOS = { nueva: "Nueva", calificada: "Calificada", aprobada: "Aprobada", descartada: "Descartada", en_guion: "En guion" };
const CAT_TIPOS = { pilar: "Pilares", tematica: "Temáticas", formato: "Formatos", objetivo: "Objetivos", presentador: "Presentadores" };

const state = { ideas: [], catalogo: [], pesos: [], editando: null, borrador: null };

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
  return 8;
}

// ---------- acceso ----------
function mostrarAuth(modo, mensaje, ok) {
  $("#app").hidden = true;
  $("#auth").hidden = false;
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
  $("#auth").hidden = true;
  $("#app").hidden = false;
  if (dentro) return;
  dentro = true;
  await cargarTodo();
  const h0 = location.hash.slice(1);
  irA(TONOS[h0] ? h0 : "ideas");
}

// ---------- datos ----------
async function cargarTodo() {
  const [cat, pesos, ideas] = await Promise.all([
    sb.from("catalogo").select("*").order("tipo").order("orden"),
    sb.from("peso_viralidad").select("*"),
    sb.from("idea_con_puntaje").select("*")
  ]);
  if (cat.error) return fallo(cat.error, "cargar las listas");
  if (pesos.error) return fallo(pesos.error, "cargar los pesos");
  if (ideas.error) return fallo(ideas.error, "cargar las ideas");
  state.catalogo = cat.data;
  state.pesos = pesos.data;
  state.ideas = ideas.data;
  llenarSelects();
  pintarIdeas();
  pintarAjustes();
}
async function recargarIdeas() {
  const { data, error } = await sb.from("idea_con_puntaje").select("*");
  if (error) return fallo(error, "cargar las ideas");
  state.ideas = data;
  pintarIdeas();
}
const valores = tipo => state.catalogo.filter(c => c.tipo === tipo && c.activo).map(c => c.valor);

function llenarSelect(sel, opciones, vacio) {
  const actual = sel.value;
  sel.replaceChildren(h("option", { value: "" }, vacio), ...opciones.map(o => h("option", { value: o }, o)));
  sel.value = opciones.includes(actual) ? actual : "";
}
function llenarSelects() {
  llenarSelect($("#fPilar"), valores("pilar"), "Todos");
  llenarSelect($("#fTematica"), valores("tematica"), "Todas");
  const est = $("#fEstado");
  const actual = est.value;
  est.replaceChildren(h("option", { value: "" }, "Todos"), ...Object.entries(ESTADOS).map(([k, v]) => h("option", { value: k }, v)));
  est.value = actual;
  $$("select[data-cat]").forEach(s => llenarSelect(s, valores(s.dataset.cat), "—"));
}

// ---------- navegación ----------
const TONOS = {
  ideas:   ["rgba(242,106,46,.16)", "rgba(30,64,175,.28)", 15, 20, 85, 80],
  guiones: ["rgba(245,166,35,.18)", "rgba(16,25,89,.40)", 80, 15, 20, 85],
  storyboard: ["rgba(229,37,53,.14)", "rgba(30,64,175,.30)", 50, 10, 50, 95],
  ajustes: ["rgba(108,99,255,.20)", "rgba(242,106,46,.14)", 80, 20, 20, 85]
};
const vistas = {};   // otras pestañas (guiones.js) registran aquí su función de carga
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

// ---------- lista de ideas ----------
$("#fUmbral").value = getUmbral();
["fText", "fPilar", "fTematica", "fEstado", "fOrden", "fUmbral"].forEach(id => $("#" + id).addEventListener("input", () => {
  if (id === "fUmbral") { try { localStorage.setItem("umbral", $("#fUmbral").value); } catch {} }
  pintarIdeas();
}));

function pintarIdeas() {
  const q = $("#fText").value.trim().toLowerCase();
  const fp = $("#fPilar").value, ft = $("#fTematica").value, fe = $("#fEstado").value, orden = $("#fOrden").value;
  const umbral = parseFloat($("#fUmbral").value) || 0;
  const max = puntajeMax();

  let lista = state.ideas.filter(i =>
    (!fp || i.pilar === fp) && (!ft || i.tematica === ft) && (!fe || i.estado === fe) &&
    (!q || [i.titulo, i.texto_base, i.palabras_clave].some(t => (t || "").toLowerCase().includes(q))));
  const por = {
    puntaje: (a, b) => (b.calificada - a.calificada) || (b.puntaje_total - a.puntaje_total) || (a.numero - b.numero),
    numero: (a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9),
    reciente: (a, b) => new Date(b.creado_en) - new Date(a.creado_en)
  }[orden];
  lista.sort(por);

  const total = state.ideas.length;
  const calificadas = state.ideas.filter(i => i.calificada).length;
  const sobre = state.ideas.filter(i => i.calificada && i.estado !== "descartada" && Number(i.puntaje_total) >= umbral).length;
  const aprobadas = state.ideas.filter(i => i.estado === "aprobada" || i.estado === "en_guion").length;
  $("#stats").replaceChildren(
    h("span", {}, h("b", {}, total), "ideas"),
    h("span", {}, h("b", {}, calificadas), "calificadas"),
    h("span", {}, h("b", {}, sobre), `con ${fmt(umbral)} o más`),
    h("span", {}, h("b", {}, aprobadas), "aprobadas"),
    h("span", {}, "Máximo posible: ", h("b", {}, fmt(max)))
  );

  if (!lista.length) {
    $("#list").replaceChildren(h("div", { class: "empty" },
      h("b", {}, total ? "Ninguna idea coincide con los filtros" : "Todavía no hay ideas"),
      total ? "Cambia los filtros o la búsqueda." : "Agrega la primera con «+ Nueva idea» o pega varias de una vez."));
    return;
  }

  $("#list").replaceChildren(...lista.map(i => {
    const p = Number(i.puntaje_total);
    const alto = i.calificada && p >= umbral && i.estado !== "descartada";
    return h("article", { class: "idea" + (alto ? " top" : "") + (i.estado === "descartada" ? " descartada" : ""), tabindex: 0,
      onclick: () => abrirIdea(i), onkeydown: e => { if (e.key === "Enter") abrirIdea(i); } },
      h("div", { class: "n" }, i.numero ?? "–"),
      h("div", {},
        h("h3", {}, i.titulo),
        h("div", { class: "chips" },
          i.pilar && h("span", { class: "chip " + pilarClass(i.pilar) }, i.pilar),
          i.tematica && h("span", { class: "chip" }, i.tematica),
          i.formato && h("span", { class: "chip" }, i.formato),
          i.presentador && h("span", { class: "chip" }, i.presentador),
          h("span", { class: "chip estado-" + i.estado }, ESTADOS[i.estado])),
        i.calificada && h("div", { class: "dots", title: "Criterios en Sí" }, CRITERIOS.map(c => h("i", { class: i[c] ? "on" : "" })))),
      i.calificada
        ? h("div", { class: "score" + (alto ? " alto" : "") }, h("b", {}, fmt(p)), h("small", {}, "de " + fmt(max)))
        : h("div", { class: "score sin" }, h("b", {}, "Sin calificar"))
    );
  }));
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
  const t = puntaje(d), max = puntajeMax();
  $("#calcTotal").textContent = fmt(t);
  $("#calcMax").textContent = "de " + fmt(max);
  $("#calcBar").style.width = (max ? Math.min(100, t / max * 100) : 0) + "%";
}
form.formato.addEventListener("change", pintarCalc);

function abrirIdea(idea) {
  state.editando = idea || null;
  state.borrador = Object.fromEntries(CRITERIOS.map(c => [c, idea ? !!idea[c] : false]));
  form.reset();
  llenarSelects();
  const campos = ["titulo", "texto_base", "pilar", "tematica", "presentador", "origen", "referencia_url", "contexto", "palabras_clave", "formato"];
  if (idea) campos.forEach(c => { if (form[c]) form[c].value = idea[c] ?? ""; });
  if (!form.origen.value) form.origen.value = "manual";
  $("#ideaTitle").textContent = idea ? `Idea ${idea.numero ?? ""}` : "Nueva idea";
  $("#btnDelete").hidden = !idea;
  $("#btnAprobar").hidden = !idea || idea.estado === "aprobada" || idea.estado === "en_guion";
  $("#btnDescartar").hidden = !idea || idea.estado === "descartada";
  pintarCalc();
  dlg.showModal();
}
$("#btnNew").onclick = () => abrirIdea(null);

function datosForm() {
  const f = new FormData(form);
  const v = k => { const x = (f.get(k) || "").toString().trim(); return x || null; };
  return {
    titulo: v("titulo"), texto_base: v("texto_base"), pilar: v("pilar"), tematica: v("tematica"),
    presentador: v("presentador"), origen: v("origen") || "manual", referencia_url: v("referencia_url"),
    contexto: v("contexto"), palabras_clave: v("palabras_clave"), formato: v("formato"),
    ...state.borrador
  };
}

async function guardarIdea(estadoNuevo) {
  if (!form.reportValidity()) return false;
  const d = datosForm();
  delete d.undefined;
  const yaCalificada = state.editando?.calificada;
  const tocoCriterios = CRITERIOS.some(c => d[c]) || !!d.formato;
  d.calificada = !!(yaCalificada || tocoCriterios);
  const estadoActual = state.editando?.estado || "nueva";
  d.estado = estadoNuevo || (estadoActual === "nueva" && d.calificada ? "calificada" : estadoActual);

  let res;
  if (state.editando) {
    res = await sb.from("idea").update(d).eq("id", state.editando.id);
  } else {
    d.numero = Math.max(0, ...state.ideas.map(i => i.numero || 0)) + 1;
    res = await sb.from("idea").insert(d);
  }
  if (res.error) { fallo(res.error, "guardar la idea"); return false; }
  dlg.close();
  toast(estadoNuevo === "aprobada" ? "Idea aprobada para guion" : estadoNuevo === "descartada" ? "Idea descartada" : "Idea guardada");
  await recargarIdeas();
  return true;
}
form.addEventListener("submit", e => { e.preventDefault(); guardarIdea(); });
$("#btnAprobar").onclick = () => guardarIdea("aprobada");
$("#btnDescartar").onclick = () => guardarIdea("descartada");
$("#btnDelete").onclick = async () => {
  if (!state.editando || !confirm(`¿Eliminar la idea «${state.editando.titulo}»? Esto no se puede deshacer.`)) return;
  const { error } = await sb.from("idea").delete().eq("id", state.editando.id);
  if (error) return fallo(error, "eliminar la idea");
  dlg.close(); toast("Idea eliminada"); recargarIdeas();
};

// ---------- pegar varias ----------
const dlgBulk = $("#dlgBulk");
$("#btnBulk").onclick = () => { $("#bulkForm").reset(); llenarSelects(); dlgBulk.showModal(); };
$("#bulkForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const lineas = (f.get("lineas") || "").split(/\r?\n/).map(l => l.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean);
  if (!lineas.length) return toast("Pega al menos una idea", true);
  let n = Math.max(0, ...state.ideas.map(i => i.numero || 0));
  const filas = lineas.map(titulo => ({ titulo, numero: ++n, pilar: f.get("pilar") || null, origen: f.get("origen") }));
  const { error } = await sb.from("idea").insert(filas);
  if (error) return fallo(error, "agregar las ideas");
  dlgBulk.close();
  toast(`${filas.length} ideas agregadas`);
  recargarIdeas();
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
window.__logi = { state, pintarIdeas, abrirIdea, pintarAjustes, llenarSelects, entrar,
  sb, h, $, $$, toast, fallo, valores, irA, vistas };
})();
