/* ===== Guiones LOGI · Ganchos y CTA: banco, biblioteca, palabras clave y calificador ===== */
(() => {
"use strict";
const L = window.__logi;
const { sb, h, $, $$, toast, fallo } = L;

const ESTADOS_P = { en_uso: "En uso", potencial: "Con potencial", usado: "Usado", descartado: "Descartado" };
const OBJETIVOS_CTA = ["Seguidores", "Guardados", "Comentarios", "Venta", "Viralidad"];
const HERRAMIENTAS = ["Cloxia", "Waichat", "Logigho", "MarketLab", "KORVEX", "WCL", "People Flow"];
const P = { piezas: [], tipos: [], palabras: [], votos: [], vista: "banco", editando: null, borrador: null };

const palabras = s => (s || "").trim() ? s.trim().split(/\s+/).length : 0;
const fmt = n => (Math.round(n * 10) / 10).toLocaleString("es-CO");
const prom = arr => arr.length ? arr.reduce((s, v) => s + v.puntaje, 0) / arr.length : null;
const hoy6 = () => { const d = new Date(), z = n => String(n).padStart(2, "0"); return z(d.getDate()) + z(d.getMonth() + 1) + String(d.getFullYear()).slice(2); };
const sinTildes = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- calificador (preguntas del curso; algunas las responde la web) ----------
const PREG = {
  gancho: [
    { k: "corto", t: "¿Se entiende en menos de 3 s? (12 palabras o menos)", auto: d => palabras(d.texto) <= 12 },
    { k: "cinco50", t: "¿Pasa el 5-50? (lo entiende un niño de 5 años y le gusta a 50 de 100)" },
    { k: "curiosidad", t: "¿Abre una curiosidad sin revelar la respuesta?" },
    { k: "visual", t: "¿Tiene algo visual además de lo que se dice?", auto: d => !!(d.visual || "").trim() },
    { k: "concreto", t: "¿Es concreto? (número, tiempo o resultado)", auto: d => /\d|\b(uno|dos|tres|cuatro|cinco|seis|siete|diez|cien|mil)\b/i.test(d.texto || "") },
    { k: "resultado", t: "¿Habla del resultado o del dolor, no de la herramienta?" },
    { k: "verdad", t: "¿Es verdad y lo podemos respaldar?" }
  ],
  cta: [
    { k: "una", t: "¿Pide una sola acción?" },
    { k: "objetivo", t: "¿Coincide con el objetivo del guion?", auto: d => { const g = guionDe(d.guion_id); return g ? (!g.objetivo || !d.objetivo || g.objetivo === d.objetivo) : null; } },
    { k: "razon", t: "¿Da una razón de peso o algo concreto a cambio? («Sígueme para más» no cuenta)" },
    { k: "corto", t: "¿Tiene 10 palabras o menos?", auto: d => palabras(d.texto) <= 10 },
    { k: "palabra", t: "Si usa palabra clave: ¿es corta, sin tildes y no se confunde?", auto: d => { const k = P.palabras.find(x => x.id === Number(d.palabra_clave_id)); return k ? (k.palabra.length <= 12 && k.palabra === sinTildes(k.palabra) && !/\s/.test(k.palabra)) : null; } }
  ]
};
function respuestas(d) {
  return PREG[d.clase].map(q => {
    const a = q.auto ? q.auto(d) : null;
    return { ...q, valor: a != null ? a : (d.checklist?.[q.k] ?? null), esAuto: a != null };
  });
}
function nota(d) {
  const r = respuestas(d).filter(x => x.valor != null);
  return { si: r.filter(x => x.valor).length, total: PREG[d.clase].length, contestadas: r.length };
}
const guionDe = id => (L.G?.lista || []).find(g => g.id === Number(id));

// ---------- datos ----------
async function cargar() {
  const [p, t, k, v] = await Promise.all([
    sb.from("pieza_resumen").select("*").order("creado_en", { ascending: false }),
    sb.from("gancho_tipo").select("*").order("familia").order("numero"),
    sb.from("palabra_clave").select("*").order("palabra"),
    sb.from("voto_pieza").select("*")]);
  if (p.error) return fallo(p.error, "cargar ganchos y CTA (¿corriste 06_ganchos_cta.sql?)");
  P.piezas = p.data; P.tipos = t.data || []; P.palabras = k.data || []; P.votos = v.data || [];
  if (!L.G?.lista?.length) await L.cargarGuiones?.();
}

// =====================================================================
//  VISTA
// =====================================================================
async function vista() {
  await cargar();
  pintar();
}
$$("#gcTabs button").forEach(b => b.onclick = () => { P.vista = b.dataset.sub; pintar(); });
["gcFiltroClase", "gcFiltroEstado", "gcBuscar"].forEach(id => $("#" + id).addEventListener("input", () => pintar()));
$("#gcNuevoGancho").onclick = () => abrirPieza({ clase: "gancho" });
$("#gcNuevoCta").onclick = () => abrirPieza({ clase: "cta" });

function pintar() {
  $$("#gcTabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.sub === P.vista));
  $("#gcFiltros").hidden = P.vista !== "banco";
  const cont = $("#gcContenido");
  if (P.vista === "banco") cont.replaceChildren(banco());
  else if (P.vista === "biblioteca") cont.replaceChildren(biblioteca());
  else cont.replaceChildren(palabrasClave());
}

// ---------- banco ----------
function banco() {
  const fc = $("#gcFiltroClase").value, fe = $("#gcFiltroEstado").value, q = $("#gcBuscar").value.trim().toLowerCase();
  const lista = P.piezas.filter(p => (!fc || p.clase === fc) && (!fe || p.estado === fe) && (!q || (p.texto + " " + (p.nota || "")).toLowerCase().includes(q)));
  if (!lista.length) return h("div", { class: "empty" }, h("b", {}, P.piezas.length ? "Nada coincide con los filtros" : "Todavía no hay ganchos ni CTA"),
    "Crea uno con «+ Gancho» o «+ CTA», o desde la Biblioteca de ganchos.");
  const orden = ["en_uso", "potencial", "usado", "descartado"];
  return h("div", {}, orden.map(est => {
    const grupo = lista.filter(p => p.estado === est);
    if (!grupo.length) return null;
    return h("section", { class: "lote-grupo" },
      h("div", { class: "lote-head" }, h("h3", {}, ESTADOS_P[est]), h("span", { class: "lote-n" }, `${grupo.length}`)),
      h("div", { class: "list" }, grupo.map(tarjeta)));
  }));
}
function tarjeta(p) {
  const vs = P.votos.filter(v => v.pieza_id === p.id), pr = prom(vs), n = nota(p);
  const yo = L.state.usuario, mio = yo && vs.find(v => v.votante_id === yo.id);
  return h("article", { class: "pieza " + p.clase + (mio ? " votada" : ""), tabindex: 0, onclick: () => abrirPieza(p), onkeydown: e => { if (e.key === "Enter") abrirPieza(p); } },
    h("span", { class: "pz-clase" }, p.clase === "gancho" ? "GANCHO" : "CTA"),
    h("div", {},
      h("p", { class: "pz-texto" }, `“${p.texto}”`),
      h("div", { class: "chips" },
        mio && h("span", { class: "chip votaste" }, `✓ Votaste ★${mio.puntaje}`),
        p.tipo_nombre && h("span", { class: "chip" }, `${p.tipo_nombre} · ${p.tipo_familia}`),
        p.clase === "cta" && p.objetivo && h("span", { class: "chip" }, p.objetivo),
        p.palabra && h("span", { class: "chip nivel" }, "Palabra: " + p.palabra),
        p.guion_id && h("span", { class: "chip estado-calificada" }, `Guion ${p.guion_numero ?? ""}`),
        p.estado === "usado" && p.resultado && h("span", { class: "chip estado-en_guion" }, "Resultado " + "★".repeat(p.resultado)),
        p.nota && h("span", { class: "chip", title: p.nota }, "📝 nota"))),
    h("div", { class: "scores" },
      h("div", { class: "score voto" + (pr != null && pr >= 4 ? " alto" : "") }, h("b", {}, pr != null ? "★ " + fmt(pr) : "★ –"), h("small", {}, `${vs.length} voto${vs.length === 1 ? "" : "s"}`)),
      h("div", { class: "score" + (n.si / n.total >= .7 ? " alto" : "") }, h("b", {}, `${n.si}/${n.total}`), h("small", {}, "calificador"))));
}

// ---------- biblioteca ----------
function biblioteca() {
  const familias = [...new Set(P.tipos.map(t => t.familia))];
  return h("div", {},
    h("p", { class: "hint" }, `${P.tipos.length} tipos de gancho del curso, en ${familias.length} familias, con ejemplos adaptados a nuestros temas. «Usar» crea un gancho nuevo con su plantilla.`),
    familias.map(f => h("section", { class: "lote-grupo" },
      h("div", { class: "lote-head" }, h("h3", {}, f)),
      h("div", { class: "biblio" }, P.tipos.filter(t => t.familia === f).map(t => h("article", { class: "tipo" + (t.advertencia?.startsWith("Evitar") ? " evitar" : "") },
        h("div", { class: "tipo-head" }, h("b", {}, t.nombre), h("small", {}, "#" + t.numero)),
        h("p", {}, t.mecanismo),
        t.plantilla !== "—" && h("p", { class: "tpl" }, t.plantilla),
        t.ejemplo !== "—" && h("p", { class: "ej" }, `Ej.: «${t.ejemplo}»`),
        t.advertencia && h("p", { class: "adv" }, "⚠ " + t.advertencia),
        !t.advertencia?.startsWith("Evitar") && h("button", { class: "btn small", onclick: () => abrirPieza({ clase: "gancho", gancho_tipo_id: t.id, texto: t.ejemplo }) }, "Usar")))))));
}

// ---------- palabras clave ----------
function palabrasClave() {
  const f = { palabra: h("input", { type: "text", placeholder: "CALCULADORA" }), variantes: h("input", { type: "text", placeholder: "calculadoras, calculador" }),
    recurso: h("input", { type: "text", placeholder: "Qué recibe quien la escribe" }),
    herramienta: h("select", {}, h("option", { value: "" }, "—"), HERRAMIENTAS.map(x => h("option", { value: x }, x))) };
  const crear = async () => {
    const palabra = sinTildes(f.palabra.value).toUpperCase().replace(/\s+/g, "");
    if (!palabra) return toast("Escribe la palabra", true);
    const { error } = await sb.from("palabra_clave").insert({ palabra, variantes: f.variantes.value.trim() || null, recurso: f.recurso.value.trim() || null,
      herramienta: f.herramienta.value || null, codigo: `${palabra} ${hoy6()}` });
    if (error) return fallo(error, "guardar la palabra clave");
    toast("Palabra clave guardada"); await cargar(); pintar();
  };
  const usos = id => P.piezas.filter(p => p.palabra_clave_id === id).length;
  return h("div", {},
    h("p", { class: "hint" }, "La palabra que la gente escribe en comentarios o por mensaje para recibir algo concreto. Corta, sin tildes y sin espacios. El código (palabra + fecha) sirve para medir de qué video llegó cada persona."),
    h("div", { class: "pk-form" }, h("label", { class: "f" }, "Palabra", f.palabra), h("label", { class: "f" }, "Variantes", f.variantes),
      h("label", { class: "f" }, "Recurso que recibe", f.recurso), h("label", { class: "f" }, "Responde", f.herramienta),
      h("button", { class: "btn primary", onclick: crear }, "Agregar")),
    P.palabras.length ? h("table", { class: "imp-tabla pk-tabla" },
      h("thead", {}, h("tr", {}, ["Palabra", "Variantes", "Recurso", "Responde", "Código", "Usos", "Activa"].map(x => h("th", {}, x)))),
      h("tbody", {}, P.palabras.map(k => h("tr", { class: k.activa ? "" : "inactiva" },
        h("td", {}, h("b", {}, k.palabra)), h("td", {}, k.variantes || "—"), h("td", {}, k.recurso || "—"),
        h("td", {}, k.herramienta || "—"), h("td", {}, h("code", {}, k.codigo || "—")), h("td", {}, usos(k.id)),
        h("td", {}, h("input", { type: "checkbox", checked: k.activa, "aria-label": "Activa", onchange: async e => {
          const { error } = await sb.from("palabra_clave").update({ activa: e.target.checked }).eq("id", k.id);
          if (error) { e.target.checked = !e.target.checked; return fallo(error, "cambiar la palabra"); }
          k.activa = e.target.checked;
        } })))))) : h("div", { class: "empty" }, h("b", {}, "Todavía no hay palabras clave")));
}

// =====================================================================
//  DIÁLOGO DE GANCHO / CTA
// =====================================================================
const dlg = $("#dlgPieza"), form = $("#piezaForm");

function abrirPieza(p, opciones = {}) {
  const nueva = !p.id;
  P.editando = nueva ? null : p;
  P.borrador = { clase: p.clase, texto: p.texto || "", visual: p.visual || "", gancho_tipo_id: p.gancho_tipo_id || "", objetivo: p.objetivo || "",
    palabra_clave_id: p.palabra_clave_id || "", guion_id: p.guion_id || opciones.guion_id || "", estado: p.estado || (opciones.guion_id ? "en_uso" : "potencial"),
    checklist: { ...(p.checklist || {}) }, resultado: p.resultado || null, nota: p.nota || "",
    votos: Object.fromEntries(P.votos.filter(v => v.pieza_id === p.id).map(v => [v.votante_id, v.puntaje])) };
  $("#pzTitulo").textContent = p.clase === "gancho" ? (nueva ? "Nuevo gancho" : "Gancho") : (nueva ? "Nuevo CTA" : "CTA");
  $("#pzBorrar").hidden = nueva;
  pintarForm();
  dlg.showModal();
  L.arriba(dlg);
}

function pintarForm() {
  const d = P.borrador, esG = d.clase === "gancho";
  const set = (k, v, repintar) => { d[k] = v; if (repintar) pintarForm(); else { pintarCheck(); contar(); } };
  const wc = h("small", { class: "wc", id: "pzWc" });
  const contar = () => { const n = palabras(d.texto); $("#pzWc") && ($("#pzWc").textContent = `${n} palabras · ≈ ${Math.max(1, Math.round(n / 3))} s`); };
  const guiones = (L.G?.lista || []);
  const tipoSel = P.tipos.find(t => t.id === Number(d.gancho_tipo_id));
  $("#pzCampos").replaceChildren(...[
    h("label", { class: "f" }, h("span", {}, esG ? "Gancho (lo que se dice) " : "CTA (lo que se dice) ", wc),
      h("textarea", { rows: 3, required: true, oninput: e => set("texto", e.target.value) }, d.texto)),
    h("label", { class: "f" }, esG ? "Lo que se ve (texto en pantalla, acción u objeto)" : "Lo que se ve (texto o botón en pantalla)",
      h("input", { type: "text", value: d.visual, oninput: e => set("visual", e.target.value) })),
    esG
      ? h("label", { class: "f" }, "Tipo de gancho",
          h("select", { onchange: e => set("gancho_tipo_id", e.target.value, true) }, h("option", { value: "" }, "—"),
            [...new Set(P.tipos.map(t => t.familia))].map(f => h("optgroup", { label: f },
              P.tipos.filter(t => t.familia === f && !t.advertencia?.startsWith("Evitar")).map(t => h("option", { value: t.id, selected: t.id === Number(d.gancho_tipo_id) }, t.nombre))))))
      : h("div", { class: "row2" },
          h("label", { class: "f" }, "Objetivo", h("select", { onchange: e => set("objetivo", e.target.value) }, h("option", { value: "" }, "—"),
            OBJETIVOS_CTA.map(o => h("option", { value: o, selected: o === d.objetivo }, o)))),
          h("label", { class: "f" }, "Palabra clave", h("select", { onchange: e => set("palabra_clave_id", e.target.value) }, h("option", { value: "" }, "Ninguna"),
            P.palabras.filter(k => k.activa || k.id === Number(d.palabra_clave_id)).map(k => h("option", { value: k.id, selected: k.id === Number(d.palabra_clave_id) }, k.palabra))))),
    tipoSel ? h("p", { class: "hint tpl-hint" }, h("b", {}, tipoSel.nombre + ": "), tipoSel.mecanismo, " Plantilla: ", h("i", {}, tipoSel.plantilla), tipoSel.advertencia ? h("span", { class: "adv" }, " ⚠ " + tipoSel.advertencia) : null) : null,
    h("div", { class: "row2" },
      h("label", { class: "f" }, "Guion", h("select", { onchange: e => set("guion_id", e.target.value, true) }, h("option", { value: "" }, "Sin asignar"),
        guiones.map(g => h("option", { value: g.id, selected: g.id === Number(d.guion_id) }, `Guion ${g.numero ?? "–"} · ${g.titulo}`)))),
      h("label", { class: "f" }, "Estado", h("select", { onchange: e => set("estado", e.target.value, true) },
        Object.entries(ESTADOS_P).map(([k, v]) => h("option", { value: k, selected: k === d.estado }, v))))),
    d.estado === "en_uso" && d.guion_id ? h("label", { class: "chk" }, h("input", { type: "checkbox", id: "pzCopiar", checked: true }),
      `Usarlo como ${esG ? "gancho" : "CTA"} del guion y copiar el texto a su escena`) : null,
    d.estado === "usado" ? h("div", { class: "resultado" },
      h("span", {}, "¿Cómo funcionó al publicarse?"),
      h("div", { class: "estrellas" }, [1, 2, 3, 4, 5].map(n => h("button", { type: "button", class: d.resultado >= n ? "on" : "",
        onclick: () => { d.resultado = d.resultado === n ? null : n; pintarForm(); } }, "★")))) : null,
    h("label", { class: "f" }, d.estado === "usado" ? "Nota (qué tal funcionó, retención, comentarios…)" : "Nota",
      h("textarea", { rows: 2, oninput: e => set("nota", e.target.value) }, d.nota))].filter(Boolean));
  contar();
  pintarCheck();
  pintarVotosP();
}

function pintarCheck() {
  const d = P.borrador, n = nota(d);
  $("#pzCheck").replaceChildren(...respuestas(d).map(q => h("div", { class: "crit" },
    h("div", {}, q.t, q.esAuto ? h("small", {}, "La web lo revisa sola") : null),
    q.esAuto ? h("span", { class: "auto " + (q.valor ? "si" : "no") }, q.valor ? "Sí" : "No")
      : h("div", { class: "seg" },
          h("button", { type: "button", class: "si" + (q.valor === true ? " on" : ""), onclick: () => { d.checklist[q.k] = true; pintarCheck(); } }, "Sí"),
          h("button", { type: "button", class: "no" + (q.valor === false ? " on" : ""), onclick: () => { d.checklist[q.k] = false; pintarCheck(); } }, "No")))));
  $("#pzNota").textContent = `${n.si} de ${n.total}`;
}

// El voto se guarda al instante (sin botón Guardar) cuando el gancho o CTA ya existe
async function guardarVotoP(piezaId, votanteId, valor) {
  const r = valor
    ? await sb.from("voto_pieza").upsert({ pieza_id: piezaId, votante_id: votanteId, puntaje: valor })
    : await sb.from("voto_pieza").delete().eq("pieza_id", piezaId).eq("votante_id", votanteId);
  if (r.error) return fallo(r.error, "guardar el voto");
  P.votos = P.votos.filter(v => !(v.pieza_id === piezaId && v.votante_id === votanteId));
  if (valor) P.votos.push({ pieza_id: piezaId, votante_id: votanteId, puntaje: valor });
  toast(valor ? "Voto guardado" : "Voto quitado");
  if (!$("#view-ganchos").hidden) pintar();
}

function pintarVotosP() {
  const d = P.borrador;
  $("#pzVotos").replaceChildren(...L.state.votantes.filter(v => v.activo).map(vt => L.filaVoto(vt, d.votos[vt.id], valor => {
    d.votos[vt.id] = valor;
    pintarVotosP();
    if (P.editando) guardarVotoP(P.editando.id, vt.id, valor);
  })));
  const vals = Object.values(d.votos).filter(Boolean);
  $("#pzProm").textContent = vals.length ? `Promedio ★ ${fmt(vals.reduce((a, b) => a + b, 0) / vals.length)} · ${vals.length} voto${vals.length === 1 ? "" : "s"}` : "Sin votos";
}

// Usa una pieza como gancho/CTA de un guion: la anterior queda «con potencial»
async function asignar(pieza, guionId, copiar) {
  const g = guionDe(guionId);
  if (!g) return;
  const campo = pieza.clase === "gancho" ? "gancho_id" : "cta_id";
  const anterior = g[campo];
  if (anterior && anterior !== pieza.id) await sb.from("pieza").update({ estado: "potencial" }).eq("id", anterior);
  const { error } = await sb.from("guion").update({ [campo]: pieza.id }).eq("id", g.id);
  if (error) return fallo(error, "asignar al guion");
  g[campo] = pieza.id;
  if (copiar) {
    const { data: esc } = await sb.from("bloque").select("id, tipo, orden").eq("guion_id", g.id).order("orden");
    const destino = pieza.clase === "gancho" ? esc?.find(e => e.tipo === "gancho") : [...(esc || [])].reverse().find(e => e.tipo === "cta");
    if (destino) await sb.from("bloque").update({ dialogo: pieza.texto }).eq("id", destino.id);
    else if (pieza.clase === "cta") toast("La última escena es «Moraleja / CTA»: copia el CTA a mano en el editor.", true);
  }
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  const d = P.borrador;
  if (!d.texto.trim()) return toast("Escribe el texto", true);
  const fila = { clase: d.clase, texto: d.texto.trim(), visual: d.visual.trim() || null, gancho_tipo_id: d.gancho_tipo_id ? Number(d.gancho_tipo_id) : null,
    objetivo: d.objetivo || null, palabra_clave_id: d.palabra_clave_id ? Number(d.palabra_clave_id) : null,
    guion_id: d.guion_id ? Number(d.guion_id) : null, estado: d.estado, checklist: d.checklist,
    resultado: d.estado === "usado" ? d.resultado : null, nota: d.nota.trim() || null };
  let id;
  if (P.editando) {
    const { error } = await sb.from("pieza").update(fila).eq("id", P.editando.id);
    if (error) return fallo(error, "guardar");
    id = P.editando.id;
  } else {
    const { data, error } = await sb.from("pieza").insert(fila).select().single();
    if (error) return fallo(error, "guardar");
    id = data.id;
  }
  // votos
  const antes = Object.fromEntries(P.votos.filter(v => v.pieza_id === id).map(v => [v.votante_id, v.puntaje]));
  const ups = Object.entries(d.votos).filter(([k, p]) => p && antes[k] !== p).map(([k, p]) => ({ pieza_id: id, votante_id: Number(k), puntaje: p }));
  if (ups.length) { const r = await sb.from("voto_pieza").upsert(ups); if (r.error) fallo(r.error, "guardar los votos"); }
  for (const k of Object.keys(antes).filter(k => !d.votos[k])) await sb.from("voto_pieza").delete().eq("pieza_id", id).eq("votante_id", Number(k));
  // asignación al guion
  if (fila.estado === "en_uso" && fila.guion_id) await asignar({ ...fila, id }, fila.guion_id, $("#pzCopiar")?.checked);
  dlg.close();
  toast("Guardado");
  await L.cargarGuiones?.();
  await cargar();
  if (!$("#view-ganchos").hidden) pintar();
  if (P.alGuardar) { const f = P.alGuardar; P.alGuardar = null; f(); }
});
$("#pzBorrar").onclick = async () => {
  if (!P.editando || !confirm("¿Eliminar este " + (P.editando.clase === "gancho" ? "gancho" : "CTA") + "? Esto no se puede deshacer.")) return;
  const { error } = await sb.from("pieza").delete().eq("id", P.editando.id);
  if (error) return fallo(error, "eliminar");
  dlg.close(); toast("Eliminado"); await cargar(); pintar();
};

// =====================================================================
//  EN EL EDITOR DE GUION: elegir gancho y CTA
// =====================================================================
L.pintarGanchoCta = async function (g) {
  await cargar();
  const cont = $("#edGanchoCta");
  const caja = clase => {
    const campo = clase === "gancho" ? "gancho_id" : "cta_id";
    const actual = P.piezas.find(p => p.id === g[campo]);
    const opciones = P.piezas.filter(p => p.clase === clase && (p.estado === "potencial" || p.guion_id === g.id || p.id === g[campo]) && p.estado !== "descartado");
    const sel = h("select", { onchange: async e => {
      const p = P.piezas.find(x => x.id === Number(e.target.value));
      if (!p) return;
      await sb.from("pieza").update({ estado: "en_uso", guion_id: g.id }).eq("id", p.id);
      await asignar(p, g.id, confirm("¿Copiar el texto a la escena del guion? (Si no, solo queda enlazado)"));
      toast(`${clase === "gancho" ? "Gancho" : "CTA"} elegido. Recarga el editor para ver la escena.`);
      L.abrirGuion(g.id);
    } }, h("option", { value: "" }, actual ? "Cambiar por otro…" : "Elegir del banco…"),
      opciones.filter(p => p.id !== g[campo]).map(p => {
        const pr = prom(P.votos.filter(v => v.pieza_id === p.id));
        return h("option", { value: p.id }, `${pr != null ? "★" + fmt(pr) + " · " : ""}${p.texto.slice(0, 80)}`);
      }));
    return h("div", { class: "gc-caja " + (actual ? "ok" : "falta") },
      h("b", {}, clase === "gancho" ? "Gancho" : "CTA"),
      actual ? h("p", {}, `“${actual.texto}”`, actual.tipo_nombre ? h("small", {}, " · " + actual.tipo_nombre) : null) : h("p", { class: "falta-txt" }, "Sin elegir"),
      h("div", { class: "gc-acc" }, sel,
        h("button", { type: "button", class: "btn small", onclick: () => { P.alGuardar = () => L.abrirGuion(g.id); abrirPieza({ clase }, { guion_id: g.id }); } }, "+ Nuevo"),
        actual ? h("button", { type: "button", class: "btn small ghost", onclick: () => abrirPieza(actual) }, "Ver / votar") : null));
  };
  cont.replaceChildren(caja("gancho"), caja("cta"));
};

L.vistas.ganchos = vista;
})();
