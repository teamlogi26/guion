/* ===== ReelLab · Fase 2-3: editor de guiones y storyboard ===== */
(() => {
"use strict";
const L = window.__logi;
const { sb, h, $, $$, toast, fallo } = L;

const PALABRAS_POR_SEG = 3;               // igual que el Excel del equipo
const TIPOS = { gancho: "Gancho", historia: "Historia", moraleja: "Moraleja", cta: "CTA", moraleja_cta: "Moraleja / CTA" };
const ESTADOS_G = { pendiente: "Pendiente", guion_listo: "Guion listo", grabado: "Grabado", editado: "Editado", publicado: "Publicado" };
const PLANOS = ["Medio frontal", "Medio corto (frontal)", "Medio (frontal)", "Medio (3/4)", "Medio (perfil ligero)", "Medio + B-roll", "Medio + insertos", "Medio + planos de apoyo", "Medio (detalle del celular)", "Cercano (directo a cámara)", "Medio (ligero contrapicado)"];
const CAMARAS = ["Estática", "Estática / B-roll", "Estática / leve acercamiento", "Estática (con sutil acercamiento)"];

const G = { lista: [], editando: null, escenas: [], sbGuion: null };
const palabras = s => (s || "").trim() ? s.trim().split(/\s+/).length : 0;
const seg = n => Math.round(n / PALABRAS_POR_SEG);
const fmtT = n => (n == null || n === "") ? "" : String(Number(n)).replace(".", ",");
const pilarClass = p => p === "Importación" ? "imp" : p === "E-commerce" ? "ecom" : "";

// ---------- datos ----------
async function cargarGuiones() {
  const { data, error } = await sb.from("guion_resumen").select("*").order("numero", { nullsFirst: false }).order("id");
  if (error) { fallo(error, "cargar los guiones"); return []; }
  G.lista = data;
  return data;
}
async function cargarEscenas(guionIds) {
  const { data, error } = await sb.from("bloque").select("*").in("guion_id", guionIds).order("guion_id").order("orden");
  if (error) { fallo(error, "cargar las escenas"); return []; }
  return data;
}

// =====================================================================
//  LISTA DE GUIONES
// =====================================================================
async function vistaGuiones() {
  $("#gEditor").hidden = true;
  $("#gLista").hidden = false;
  await cargarGuiones();
  pintarLista();
}
function pintarLista() {
  const cont = $("#gCards");
  if (!G.lista.length) {
    cont.replaceChildren(h("div", { class: "empty" }, h("b", {}, "Todavía no hay guiones"),
      "Crea uno desde una idea aprobada con «+ Nuevo guion», o corre supabase/04_storyboard.sql para cargar los 6 elegidos."));
    return;
  }
  cont.replaceChildren(...G.lista.map(g => {
    const dur = Number(g.duracion_estimada_s), max = Number(g.duracion_max_s) || 30;
    const estado = h("select", { class: "estado-sel", onclick: e => e.stopPropagation(), onchange: async e => {
      const { error } = await sb.from("guion").update({ estado: e.target.value }).eq("id", g.id);
      if (error) return fallo(error, "cambiar el estado");
      g.estado = e.target.value; toast("Estado: " + ESTADOS_G[g.estado]);
    } }, Object.entries(ESTADOS_G).map(([k, v]) => h("option", { value: k, selected: k === g.estado }, v)));
    return h("article", { class: "gcard" },
      h("div", { class: "gnum" }, String(g.numero ?? "–").padStart(2, "0")),
      h("div", { class: "gbody" },
        h("h3", {}, g.titulo),
        h("div", { class: "chips" },
          g.pilar && h("span", { class: "chip " + pilarClass(g.pilar) }, g.pilar),
          g.tematica && h("span", { class: "chip" }, g.tematica),
          g.objetivo && h("span", { class: "chip" }, g.objetivo),
          h("span", { class: "chip" + (dur > max ? " warn" : "") }, `≈ ${dur} s de ${max} s · ${g.palabras} palabras`)),
        h("div", { class: "progress" },
          barra("Grabado", g.escenas_grabadas, g.escenas),
          barra("Exportado", g.escenas_exportadas, g.escenas))),
      h("div", { class: "gactions" }, estado,
        h("button", { class: "btn small", onclick: () => abrirEditor(g.id) }, "Editar"),
        h("button", { class: "btn small primary", onclick: () => { G.sbGuion = g.id; L.irA("storyboard"); } }, "Storyboard")));
  }));
}
function barra(nombre, n, total) {
  const pct = total ? Math.round(n / total * 100) : 0;
  return h("div", { class: "pbar" }, h("span", {}, `${nombre} ${n}/${total}`), h("i", {}, h("b", { style: `width:${pct}%` })));
}

// ---------- nuevo guion ----------
$("#btnNuevoGuion").onclick = () => {
  const ideas = L.state.ideas.filter(i => i.estado !== "descartada" && i.estado !== "en_guion" && i.guion_id == null)
    .sort((a, b) => (b.estado === "aprobada") - (a.estado === "aprobada") || Number(b.puntaje_total) - Number(a.puntaje_total));
  const sel = $("#ngIdea");
  sel.replaceChildren(...ideas.map(i => h("option", { value: i.id }, `${i.numero ?? ""} · ${i.titulo}${i.estado === "aprobada" ? "  ✓ aprobada" : ""}`)));
  if (!ideas.length) return toast("Primero agrega una idea en la pestaña Ideas", true);
  $("#dlgNuevoGuion").showModal();
};
$("#nuevoGuionForm").addEventListener("submit", async e => {
  e.preventDefault();
  const idea = L.state.ideas.find(i => String(i.id) === $("#ngIdea").value);
  if (!idea) return;
  $("#dlgNuevoGuion").close();
  await crearGuion(idea);
});

// Crea un guion a partir de una idea, con el texto base como punto de partida
async function crearGuion(idea) {
  await cargarGuiones();
  const numero = Math.max(0, ...G.lista.map(g => g.numero || 0)) + 1;
  const parte = 1 + G.lista.filter(g => g.idea_id === idea.id).length;
  const { data, error } = await sb.from("guion").insert({
    idea_id: idea.id, parte, numero, titulo: idea.titulo, objetivo: null, estado: "pendiente", locacion: "Oficina / estudio", duracion_max_s: 60
  }).select().single();
  if (error) return fallo(error, "crear el guion");
  // Reparte el texto base como punto de partida: 1.ª línea → gancho, última → CTA, el resto → historia
  const lineas = (idea.texto_base || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const textos = lineas.length >= 3
    ? [lineas[0], lineas.slice(1, -1).join(" "), "", lineas.at(-1)]
    : [lineas[0] || "", lineas[1] || "", "", ""];
  const base = [["gancho", 0, 5], ["historia", 5, 18], ["moraleja", 18, 26], ["cta", 26, 30]];
  const { error: e2 } = await sb.from("bloque").insert(base.map(([tipo, a, b], i) => ({
    guion_id: data.id, orden: i + 1, tipo, inicio_s: a, fin_s: b, dialogo: textos[i],
    texto_pantalla: i === 0 ? (idea.texto_pantalla || "") : "",
    plano: "Medio corto (frontal)", camara: "Estática" })));
  if (e2) return fallo(e2, "crear las escenas");
  await sb.from("idea").update({ estado: "en_guion" }).eq("id", idea.id);
  toast("Guion creado. Revisa cómo quedó repartido el texto en las escenas.");
  await cargarGuiones();
  abrirEditor(data.id);
}
L.crearGuion = crearGuion;
L.cargarGuiones = cargarGuiones;
L.G = G;
L.abrirGuion = id => abrirEditor(id);

// =====================================================================
//  EDITOR
// =====================================================================
async function abrirEditor(id) {
  await cargarGuiones();
  const g = G.lista.find(x => x.id === id);
  if (!g) return;
  G.editando = g;
  G.escenas = (await cargarEscenas([id])).map(e => ({ ...e, edicion: e.edicion || [] }));
  L.irA("guiones", true);
  $("#gLista").hidden = true;
  $("#gEditor").hidden = false;
  const f = $("#guionForm");
  f.titulo.value = g.titulo || "";
  f.numero.value = g.numero ?? "";
  f.objetivo.replaceChildren(h("option", { value: "" }, "—"), ...L.valores("objetivo").map(v => h("option", { value: v, selected: v === g.objetivo }, v)));
  f.estado.replaceChildren(...Object.entries(ESTADOS_G).map(([k, v]) => h("option", { value: k, selected: k === g.estado }, v)));
  f.duracion_max_s.value = String(g.duracion_max_s || 60);
  f.locacion.value = g.locacion || "";
  f.iluminacion.value = g.iluminacion || "";
  f.tono.value = g.tono || "";
  f.formato_grabacion.value = g.formato_grabacion || "";
  f.ganchos.value = (g.ganchos_alternativos || []).join("\n");
  f.notas.value = (g.notas || []).join("\n");
  $("#edMeta").textContent = [g.pilar, g.tematica, g.formato].filter(Boolean).join(" · ");
  pintarEscenas();
  L.pintarGanchoCta?.(g);
  scrollTo(0, 0);
}
$("#edVolver").onclick = () => vistaGuiones();
$("#edStoryboard").onclick = async () => { if (await guardarGuion(true)) { G.sbGuion = G.editando.id; L.irA("storyboard"); } };
$("#guionForm").addEventListener("input", actualizarConteo);

function actualizarConteo() {
  const total = G.escenas.reduce((s, e) => s + palabras(e.dialogo), 0);
  const max = Number($("#guionForm").duracion_max_s.value) || 30;
  const s = seg(total);
  const el = $("#edConteo");
  el.textContent = `${total} palabras · ≈ ${s} s (curso: 50–60 s · máx. ${max} s)`;
  el.className = "conteo" + (s > max ? " warn" : "");
}

// ---------- sketches: prompt para generar y banco para reutilizar ----------
const ESTILO_SKETCH = "Boceto de storyboard a lápiz: grafito en blanco y negro sobre papel blanco, trazo limpio con sombreado suave, " +
  "formato horizontal 3:2, sin colores. El presentador es el hombre de la foto adjunta (usa su cara como referencia), " +
  "en una oficina, camiseta oscura. Si hay texto, que sea corto y en español. Escena: ";
function copiarPrompt(e) {
  const pant = (e.texto_pantalla || "").replace(/^\d+:\d\d\s*/gm, "").trim();
  const t = ESTILO_SKETCH + (e.sketch_prompt || e.dialogo || "") + (e.plano ? ` Plano: ${e.plano}.` : "") + (pant ? ` Texto visible: «${pant}».` : "");
  navigator.clipboard.writeText(t).then(() => toast("Prompt copiado. Pégalo en ChatGPT o Gemini con una foto de Wilber."), () => prompt("Copia el prompt:", t));
}

let dlgBanco;
async function abrirBanco(alElegir) {
  const { data, error } = await sb.from("bloque").select("sketch_url, dialogo, plano, tipo, guion_id, orden").not("sketch_url", "is", null);
  if (error) return fallo(error, "cargar el banco de sketches");
  const vistos = new Map();
  for (const b of data) if (!vistos.has(b.sketch_url)) vistos.set(b.sketch_url, b);
  const items = [...vistos.values()].map(b => {
    const g = G.lista.find(x => x.id === b.guion_id);
    return { ...b, guion: g ? `Guion ${g.numero}` : "", generado: !/\/simples\//.test(b.sketch_url) };
  }).sort((a, b) => (b.generado - a.generado) || ((G.lista.find(x => x.id === a.guion_id)?.numero ?? 0) - (G.lista.find(x => x.id === b.guion_id)?.numero ?? 0)) || a.orden - b.orden);
  if (!dlgBanco) { dlgBanco = h("dialog", { id: "dlgBanco" }); document.body.append(dlgBanco); }
  const grid = h("div", { class: "banco-grid" });
  const pintar = q => {
    const t = (q || "").toLowerCase();
    grid.replaceChildren(...items.filter(b => !t || `${b.dialogo} ${b.plano} ${b.guion} ${b.tipo}`.toLowerCase().includes(t)).map(b =>
      h("button", { type: "button", class: "banco-item", title: b.dialogo || "", onclick: () => { dlgBanco.close(); alElegir(b.sketch_url); } },
        h("img", { src: b.sketch_url, alt: "", loading: "lazy" }),
        h("small", {}, `${b.guion} · esc. ${b.orden} · ${b.generado ? "imagen" : "simple"}`),
        h("span", {}, (b.dialogo || "").slice(0, 70)))));
  };
  dlgBanco.replaceChildren(h("div", { class: "cloud banco" },
    h("div", { class: "dlg-head" }, h("h2", {}, "Banco de sketches"), h("button", { class: "x", type: "button", "aria-label": "Cerrar", onclick: () => dlgBanco.close() }, "×")),
    h("p", { class: "hint" }, `${items.length} sketches usados en los guiones. Busca por lo que dice la escena, el plano o el guion, y haz clic para usarlo.`),
    h("input", { type: "search", placeholder: "Buscar: pizza, mapa, celular, Guion 7…", oninput: ev => pintar(ev.target.value) }),
    grid));
  pintar("");
  dlgBanco.showModal();
}

function pintarEscenas() {
  const cont = $("#edEscenas");
  cont.replaceChildren(...G.escenas.map((e, i) => {
    const set = (k, v) => { e[k] = v; if (k === "dialogo") { actualizarConteo(); wc.textContent = `${palabras(v)} palabras · ≈ ${seg(palabras(v))} s`; } };
    const ta = (k, rows, ph, val) => h("textarea", { rows, placeholder: ph, oninput: ev => set(k, ev.target.value) }, val ?? e[k] ?? "");
    const wc = h("small", { class: "wc" }, `${palabras(e.dialogo)} palabras · ≈ ${seg(palabras(e.dialogo))} s`);
    const img = h("div", { class: "sk-prev" }, e.sketch_url ? h("img", { src: e.sketch_url, alt: "Sketch de la escena " + (i + 1) }) : h("span", {}, "Sin sketch"));
    const urlIn = h("input", { type: "text", placeholder: "URL o ruta del sketch", value: e.sketch_url || "", oninput: ev => {
      e.sketch_url = ev.target.value.trim() || null;
      img.replaceChildren(e.sketch_url ? h("img", { src: e.sketch_url, alt: "" }) : h("span", {}, "Sin sketch"));
    } });
    const file = h("input", { type: "file", accept: "image/*", hidden: true, onchange: async ev => {
      const fl = ev.target.files[0]; if (!fl) return;
      const ext = (fl.name.split(".").pop() || "jpg").toLowerCase();
      const path = `guion-${G.editando.id}/escena-${i + 1}-${Date.now()}.${ext}`;
      toast("Subiendo imagen…");
      const { error } = await sb.storage.from("sketches").upload(path, fl, { upsert: true, contentType: fl.type });
      if (error) return fallo(error, "subir la imagen");
      const url = sb.storage.from("sketches").getPublicUrl(path).data.publicUrl;
      e.sketch_url = url; urlIn.value = url;
      img.replaceChildren(h("img", { src: url, alt: "" }));
      toast("Imagen subida. Recuerda guardar.");
    } });
    const tipo = h("select", { onchange: ev => set("tipo", ev.target.value) },
      Object.entries(TIPOS).map(([k, v]) => h("option", { value: k, selected: k === e.tipo }, v)));
    const num = (k, ph) => h("input", { type: "number", step: "0.5", min: "0", placeholder: ph, value: e[k] ?? "", oninput: ev => set(k, ev.target.value === "" ? null : Number(ev.target.value)) });
    const mover = d => { const j = i + d; if (j < 0 || j >= G.escenas.length) return; [G.escenas[i], G.escenas[j]] = [G.escenas[j], G.escenas[i]]; pintarEscenas(); };
    const check = (k, label) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: !!e[k], onchange: ev => set(k, ev.target.checked) }), label);

    return h("section", { class: "escena t-" + e.tipo },
      h("div", { class: "esc-head" },
        h("b", {}, "Escena " + String(i + 1).padStart(2, "0")), tipo,
        h("span", { class: "tiempo" }, num("inicio_s", "inicio"), "–", num("fin_s", "fin"), " s"),
        h("span", { class: "sp" }),
        check("grabado", "Grabado"), check("exportado", "Exportado"),
        h("button", { type: "button", class: "btn small ghost", title: "Subir", onclick: () => mover(-1) }, "↑"),
        h("button", { type: "button", class: "btn small ghost", title: "Bajar", onclick: () => mover(1) }, "↓"),
        h("button", { type: "button", class: "btn small bad", title: "Quitar escena", onclick: () => { if (confirm("¿Quitar esta escena?")) { G.escenas.splice(i, 1); pintarEscenas(); } } }, "×")),
      h("div", { class: "esc-grid" },
        h("div", { class: "sk" }, img,
          h("div", { class: "sk-btns" },
            h("button", { type: "button", class: "btn small", onclick: () => file.click() }, "Subir imagen"), file,
            h("button", { type: "button", class: "btn small", onclick: () => abrirBanco(url => {
              e.sketch_url = url; urlIn.value = url;
              img.replaceChildren(h("img", { src: url, alt: "" }));
              toast("Sketch elegido. Recuerda guardar.");
            }) }, "Del banco"),
            h("button", { type: "button", class: "btn small", title: "Copia el prompt con el estilo lápiz para ChatGPT o Gemini", onclick: () => copiarPrompt(e) }, "Copiar prompt")),
          urlIn,
          h("details", {}, h("summary", {}, "Prompt del sketch"), ta("sketch_prompt", 3, "Descripción usada para generar la imagen"))),
        h("div", { class: "esc-fields" },
          h("label", { class: "f" }, h("span", {}, "Diálogo / voz en cámara ", wc), ta("dialogo", 4, "Lo que dice el presentador")),
          h("label", { class: "f" }, "Texto en pantalla (una línea por texto: «0:04 10 PEDIDOS»)", ta("texto_pantalla", 3, "0:00 TEXTO DEL GANCHO")),
          h("div", { class: "row2" },
            h("label", { class: "f" }, "Plano", h("input", { type: "text", list: "dlPlanos", value: e.plano || "", oninput: ev => set("plano", ev.target.value) })),
            h("label", { class: "f" }, "Cámara", h("input", { type: "text", list: "dlCamaras", value: e.camara || "", oninput: ev => set("camara", ev.target.value) }))),
          h("label", { class: "f" }, "Edición (una indicación por línea)",
            h("textarea", { rows: 3, oninput: ev => set("edicion", ev.target.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) }, (e.edicion || []).join("\n"))))));
  }));
  actualizarConteo();
}
$("#edAgregar").onclick = () => {
  const last = G.escenas.at(-1);
  G.escenas.push({ tipo: "historia", inicio_s: last?.fin_s ?? 0, fin_s: null, dialogo: "", texto_pantalla: "", plano: "Medio corto (frontal)", camara: "Estática", edicion: [], grabado: false, exportado: false });
  pintarEscenas();
};

async function guardarGuion(silencioso) {
  const f = $("#guionForm");
  if (!f.reportValidity()) return false;
  const lineas = s => s.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const g = G.editando;
  const datos = {
    titulo: f.titulo.value.trim(), numero: f.numero.value === "" ? null : Number(f.numero.value),
    objetivo: f.objetivo.value || null, estado: f.estado.value, duracion_max_s: Number(f.duracion_max_s.value) || 30,
    locacion: f.locacion.value.trim() || null, iluminacion: f.iluminacion.value.trim() || null, tono: f.tono.value.trim() || null,
    formato_grabacion: f.formato_grabacion.value.trim() || "1 toma en oficina + edición",
    ganchos_alternativos: lineas(f.ganchos.value), notas: lineas(f.notas.value)
  };
  const r1 = await sb.from("guion").update(datos).eq("id", g.id);
  if (r1.error) { fallo(r1.error, "guardar el guion"); return false; }
  const r2 = await sb.from("bloque").delete().eq("guion_id", g.id);
  if (r2.error) { fallo(r2.error, "guardar las escenas"); return false; }
  if (G.escenas.length) {
    const filas = G.escenas.map((e, i) => ({
      guion_id: g.id, orden: i + 1, tipo: e.tipo, inicio_s: e.inicio_s ?? null, fin_s: e.fin_s ?? null,
      dialogo: e.dialogo || "", texto_pantalla: e.texto_pantalla || "", plano: e.plano || null, camara: e.camara || null,
      edicion: e.edicion || [], sketch_url: e.sketch_url || null, sketch_prompt: e.sketch_prompt || null,
      grabado: !!e.grabado, exportado: !!e.exportado }));
    const r3 = await sb.from("bloque").insert(filas);
    if (r3.error) { fallo(r3.error, "guardar las escenas"); return false; }
  }
  Object.assign(g, datos);
  if (!silencioso) toast("Guion guardado");
  return true;
}
$("#guionForm").addEventListener("submit", e => { e.preventDefault(); guardarGuion(); });
$("#edBorrar").onclick = async () => {
  const g = G.editando;
  if (!g || !confirm(`¿Eliminar el guion «${g.titulo}» y sus escenas? Esto no se puede deshacer.`)) return;
  const { error } = await sb.from("guion").delete().eq("id", g.id);
  if (error) return fallo(error, "eliminar el guion");
  toast("Guion eliminado"); vistaGuiones();
};

// =====================================================================
//  STORYBOARD
// =====================================================================
async function vistaStoryboard() {
  await cargarGuiones();
  const sel = $("#sbSelect");
  sel.replaceChildren(...G.lista.map(g => h("option", { value: g.id }, `Guion ${g.numero ?? "–"} · ${g.titulo}`)));
  if (!G.lista.length) {
    $("#sbHojas").replaceChildren(h("div", { class: "empty" }, h("b", {}, "No hay guiones para mostrar"), "Crea uno en la pestaña Guiones."));
    return;
  }
  if (!G.lista.some(g => g.id === G.sbGuion)) G.sbGuion = G.lista[0].id;
  sel.value = G.sbGuion;
  await pintarStoryboard([G.sbGuion]);
}
$("#sbSelect").onchange = e => { G.sbGuion = Number(e.target.value); pintarStoryboard([G.sbGuion]); };
const esperarImagenes = () => Promise.all($$("#sbHojas img").map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
$("#sbImprimir").onclick = async () => { await esperarImagenes(); window.print(); };
$("#sbTodos").onclick = async () => {
  await pintarStoryboard(G.lista.map(g => g.id));
  await esperarImagenes();
  window.print();
  pintarStoryboard([G.sbGuion]);
};
// Al imprimir: modo compacto y, si una hoja no cabe en un A4, se reduce para que quede en una sola página
const ALTO_A4 = 1020;   // px útiles de un A4 con márgenes de 8 mm (con un poco de holgura)
addEventListener("beforeprint", () => {
  document.body.classList.add("imprimiendo");
  $$(".sheet").forEach(s => {
    s.style.zoom = "";
    const alto = s.getBoundingClientRect().height;
    if (alto > ALTO_A4) s.style.zoom = (ALTO_A4 / alto).toFixed(3);
  });
});
addEventListener("afterprint", () => {
  document.body.classList.remove("imprimiendo");
  $$(".sheet").forEach(s => { s.style.zoom = ""; });
});
$("#sbEditar").onclick = () => abrirEditor(G.sbGuion);

async function pintarStoryboard(ids) {
  const escenas = await cargarEscenas(ids);
  const total = G.lista.length;
  $("#sbHojas").replaceChildren(...ids.map(id => hoja(G.lista.find(g => g.id === id), escenas.filter(e => e.guion_id === id), total)));
}

function hoja(g, escenas, total) {
  const dur = Number(g.duracion_estimada_s);
  const meta = (icono, k, v) => h("div", { class: "m" }, h("span", { class: "ic", "aria-hidden": "true" }, icono), h("div", {}, h("b", {}, k), h("span", {}, v || "—")));
  const filas = escenas.map((e, i) => {
    const chk = (k, label) => h("label", { class: "sb-chk" + (e[k] ? " on" : "") },
      h("input", { type: "checkbox", checked: !!e[k], onchange: async ev => {
        const v = ev.target.checked;
        const { error } = await sb.from("bloque").update({ [k]: v }).eq("id", e.id);
        if (error) { ev.target.checked = !v; return fallo(error, "guardar el check"); }
        e[k] = v; ev.target.closest(".sb-chk").classList.toggle("on", v);
        const gl = G.lista.find(x => x.id === g.id);
        if (gl) gl[k === "grabado" ? "escenas_grabadas" : "escenas_exportadas"] += v ? 1 : -1;
      } }),
      h("span", { class: "box", "aria-hidden": "true" }), label);
    const textos = (e.texto_pantalla || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return h("tr", {},
      h("td", { class: "c-num" },
        h("b", {}, String(i + 1).padStart(2, "0")),
        h("span", { class: "tag" }, TIPOS[e.tipo] || e.tipo),
        h("span", { class: "t" }, `${fmtT(e.inicio_s)} – ${fmtT(e.fin_s)} s`),
        h("div", { class: "checks" }, chk("grabado", "Grabado"), chk("exportado", "Exportado"))),
      h("td", { class: "c-sk" }, e.sketch_url ? h("img", { src: e.sketch_url, alt: "Sketch escena " + (i + 1) }) : h("div", { class: "sk-vacio" }, "Sin sketch")),
      h("td", { class: "c-dlg" }, e.dialogo ? `“${e.dialogo}”` : h("i", {}, "Sin diálogo")),
      h("td", { class: "c-tec" },
        h("p", {}, h("b", {}, "Plano: "), e.plano || "—"),
        h("p", {}, h("b", {}, "Cámara: "), e.camara || "—"),
        (e.edicion || []).length ? [h("p", {}, h("b", {}, "Edición:")), h("ul", {}, e.edicion.map(x => h("li", {}, x)))] : null,
        textos.length ? [h("p", {}, h("b", {}, "Texto en pantalla:")), h("ul", { class: "tp" }, textos.map(x => h("li", {}, x)))] : null));
  });
  const falta = [!g.gancho_id && "el gancho", !g.cta_id && "el CTA"].filter(Boolean);
  return h("article", { class: "sheet" },
    falta.length ? h("p", { class: "sb-falta no-print" }, `Falta elegir ${falta.join(" y ")}. Hazlo en el editor del guion o en «Ganchos y CTA» antes de grabar.`) : null,
    h("header", { class: "sh-head" },
      h("div", { class: "sh-tag" }, h("b", {}, "STORYBOARD"), h("span", {}, `GUION ${g.numero ?? "–"} DE ${total}`)),
      h("h2", {}, g.titulo)),
    h("div", { class: "sh-meta" },
      meta("🛒", "Pilar", g.pilar), meta("◈", "Temática", g.tematica), meta("◎", "Objetivo", g.objetivo),
      meta("◷", "Duración", `≈ ${dur} s`), meta("▶", "Formato", g.formato_grabacion)),
    h("table", { class: "sh-tabla" },
      h("thead", {}, h("tr", {}, h("th", {}, "# / Tiempo"), h("th", {}, "Sketch (referencia visual)"), h("th", {}, "Diálogo / voz en cámara"), h("th", {}, "Plano / Cámara / Edición"))),
      h("tbody", {}, filas)),
    h("footer", { class: "sh-foot" },
      h("div", { class: "nt" }, h("b", {}, "Notas técnicas de producción"),
        h("ul", {}, h("li", {}, h("b", {}, "Locación: "), g.locacion || "—"), h("li", {}, h("b", {}, "Iluminación: "), g.iluminacion || "—"), h("li", {}, h("b", {}, "Tono: "), g.tono || "—"))),
      h("div", { class: "dt" }, "Duración total:", h("b", {}, `≈ ${dur} segundos`))));
}

// ---------- registro de vistas ----------
L.vistas.guiones = vistaGuiones;
L.vistas.storyboard = vistaStoryboard;

// listas de sugerencias para plano y cámara
document.body.append(
  h("datalist", { id: "dlPlanos" }, PLANOS.map(p => h("option", { value: p }))),
  h("datalist", { id: "dlCamaras" }, CAMARAS.map(c => h("option", { value: c }))));
})();
