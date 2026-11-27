/* ===== ReelLab · Teleprompter: el diálogo del guion sube solo, a la velocidad que elijas ===== */
(() => {
"use strict";
const L = window.__logi;
const { h, $ } = L;

const CLAVE = "teleprompter_ajustes";
const T = { vel: 4, tam: innerWidth < 600 ? 34 : 54, espejo: false, escenas: true, cuenta: true, guion: null };
try { Object.assign(T, JSON.parse(localStorage.getItem(CLAVE) || "{}")); } catch { /* sin almacenamiento */ }
const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(T)); } catch { /* sin almacenamiento */ } };

const TIPOS = { gancho: "Gancho", historia: "Historia", moraleja: "Moraleja", cta: "CTA", moraleja_cta: "Moraleja / CTA" };
const S = { y: 0, corriendo: false, ultimo: 0, raf: 0, segundos: 0, total: 0, cuentaTimer: 0 };
const ventana = $("#tpVentana"), texto = $("#tpTexto");
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// px por segundo: escala con el tamaño de letra para que la velocidad «se sienta» igual
const pxPorSeg = () => (10 + T.vel * 9) * (T.tam / 54);

// Indicaciones que no se leen: «Guía, no texto: …» y lo que va entre paréntesis
function frase(t) {
  const guia = t.match(/^(Guía, no texto:[^«]*)([\s\S]*)$/);
  const partes = [];
  let resto = t;
  if (guia) { partes.push(h("span", { class: "tp-ind" }, guia[1].trim() + " ")); resto = guia[2]; }
  resto.split(/(\([^)]*\))/).forEach(x => { if (x) partes.push(/^\(.*\)$/.test(x) ? h("span", { class: "tp-ind" }, x) : x); });
  return partes;
}

async function pintar() {
  const g = (L.G.lista || []).find(x => x.id === T.guion);
  if (!g) { texto.replaceChildren(h("p", { class: "tp-vacio" }, "Elige un guion para empezar.")); return; }
  texto.replaceChildren(h("p", { class: "tp-vacio" }, "Cargando…"));
  const escenas = await L.cargarEscenas([g.id]);
  let palabras = 0;
  texto.replaceChildren(
    h("div", { class: "tp-inicio" }, `GUION ${g.numero ?? ""} · ${g.titulo}`),
    ...escenas.map((e, i) => {
      const tomas = (e.dialogo || "").split(/\s+[–—]\s+/).map(x => x.trim()).filter(Boolean);
      palabras += (e.dialogo || "").replace(/\([^)]*\)|Guía, no texto:[^«]*/g, "").split(/\s+/).filter(Boolean).length;
      return h("section", { class: "tp-escena" },
        T.escenas ? h("div", { class: "tp-tag" }, `${String(i + 1).padStart(2, "0")} · ${(TIPOS[e.tipo] || e.tipo).toUpperCase()}`) : null,
        ...tomas.map((t, k) => [k ? h("div", { class: "tp-corte", "aria-hidden": "true" }, "corte") : null, h("p", {}, ...frase(t))]).flat().filter(Boolean));
    }),
    h("div", { class: "tp-fin" }, "■ FIN"));
  S.total = Math.round(palabras / 3);
  reiniciar();
}

function aplicar() {
  texto.style.fontSize = T.tam + "px";
  texto.classList.toggle("espejo", T.espejo);
  $("#tpVelVal").textContent = T.vel;
  $("#tpTamVal").textContent = T.tam + " px";
  $("#tpVel").value = T.vel; $("#tpTam").value = T.tam;
  $("#tpEspejo").checked = T.espejo; $("#tpEscenas").checked = T.escenas; $("#tpCuenta").checked = T.cuenta;
}
function mover() {
  // El primer renglón arranca sobre la línea roja (30 % del alto) y el último puede llegar hasta ella
  const alto = ventana.clientHeight;
  texto.style.paddingTop = Math.max(0, alto * 0.30 - T.tam * 0.5) + "px";
  texto.style.paddingBottom = alto * 0.75 + "px";
  const max = Math.max(0, texto.scrollHeight - ventana.clientHeight * 0.35);
  if (S.y > max) { S.y = max; pausar(); }
  texto.style.transform = `translateY(${-S.y}px)` + (T.espejo ? " scaleX(-1)" : "");
  $("#tpReloj").textContent = `${mmss(S.segundos)} / ${mmss(S.total)}`;
}
function paso(t) {
  if (!S.corriendo) return;
  const dt = Math.min(0.25, (t - (S.ultimo || t)) / 1000);
  S.ultimo = t; S.y += pxPorSeg() * dt; S.segundos += dt;
  mover();
  S.raf = requestAnimationFrame(paso);
}
function estado() {
  $("#tpPlay").textContent = S.corriendo ? "❚❚ Pausa" : "▶ Iniciar";
  $("#tpRec").classList.toggle("on", S.corriendo);
}
function arrancar() {
  S.corriendo = true; S.ultimo = 0; estado();
  S.raf = requestAnimationFrame(paso);
}
function iniciar() {
  if (S.corriendo || S.cuentaTimer) return;
  if (!T.cuenta) return arrancar();
  const n = $("#tpCuentaNum"); let k = 3;
  n.hidden = false; n.textContent = k;
  S.cuentaTimer = setInterval(() => {
    k -= 1;
    if (k > 0) { n.textContent = k; return; }
    clearInterval(S.cuentaTimer); S.cuentaTimer = 0; n.hidden = true; arrancar();
  }, 800);
}
function pausar() {
  if (S.cuentaTimer) { clearInterval(S.cuentaTimer); S.cuentaTimer = 0; $("#tpCuentaNum").hidden = true; }
  S.corriendo = false; cancelAnimationFrame(S.raf); estado();
}
const alternar = () => (S.corriendo || S.cuentaTimer) ? pausar() : iniciar();
function reiniciar() { pausar(); S.y = 0; S.segundos = 0; mover(); }
function velocidad(d) { T.vel = Math.max(1, Math.min(10, T.vel + d)); guardar(); aplicar(); }

// ---------- controles ----------
$("#tpPlay").onclick = alternar;
$("#tpReiniciar").onclick = reiniciar;
$("#tpMas").onclick = () => velocidad(1);
$("#tpMenos").onclick = () => velocidad(-1);
$("#tpVel").oninput = e => { T.vel = Number(e.target.value); guardar(); aplicar(); };
$("#tpTam").oninput = e => { T.tam = Number(e.target.value); guardar(); aplicar(); mover(); };
$("#tpEspejo").onchange = e => { T.espejo = e.target.checked; guardar(); aplicar(); mover(); };
$("#tpEscenas").onchange = e => { T.escenas = e.target.checked; guardar(); pintar(); };
$("#tpCuenta").onchange = e => { T.cuenta = e.target.checked; guardar(); };
$("#tpGuion").onchange = e => { T.guion = Number(e.target.value); guardar(); pintar(); };
ventana.onclick = alternar;
// Rueda o arrastre del dedo para ajustar dónde va el texto sin perder la velocidad
ventana.addEventListener("wheel", e => { e.preventDefault(); S.y = Math.max(0, S.y + e.deltaY * 0.6); mover(); }, { passive: false });
let toque = null;
ventana.addEventListener("touchstart", e => { toque = { y: e.touches[0].clientY, base: S.y, movio: false }; }, { passive: true });
ventana.addEventListener("touchmove", e => { if (!toque) return; const d = toque.y - e.touches[0].clientY; if (Math.abs(d) > 6) toque.movio = true; S.y = Math.max(0, toque.base + d); mover(); }, { passive: true });
ventana.addEventListener("touchend", e => { if (toque?.movio) e.preventDefault(); toque = null; });

const marco = $("#tpMarco");
$("#tpPantalla").onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else (marco.requestFullscreen || marco.webkitRequestFullscreen)?.call(marco);
};
document.addEventListener("fullscreenchange", () => { marco.classList.toggle("lleno", document.fullscreenElement === marco); mover(); });

document.addEventListener("keydown", e => {
  if ($("#view-teleprompter").hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector("dialog[open]")) return;
  if (e.code === "Space") { e.preventDefault(); alternar(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); velocidad(1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); velocidad(-1); }
  else if (e.key === "r" || e.key === "R") reiniciar();
  else if (e.key === "f" || e.key === "F") $("#tpPantalla").click();
});

// ---------- vista ----------
async function vista() {
  if (!L.G.lista?.length) await L.cargarGuiones();
  const sel = $("#tpGuion");
  sel.replaceChildren(...L.porMes(L.G.lista).map(m => h("optgroup", { label: m.etiqueta },
    m.items.map(g => h("option", { value: g.id }, `Guion ${g.numero ?? "–"} · ${g.titulo}`)))));
  if (!L.G.lista.some(g => g.id === T.guion)) T.guion = L.G.sbGuion || L.G.lista[0]?.id || null;
  if (T.guion) sel.value = String(T.guion);
  aplicar();
  await pintar();
}
L.vistas.teleprompter = vista;
// Al salir de la pestaña se pausa
new MutationObserver(() => { if ($("#view-teleprompter").hidden) pausar(); })
  .observe($("#view-teleprompter"), { attributes: true, attributeFilter: ["hidden"] });
aplicar();
})();
