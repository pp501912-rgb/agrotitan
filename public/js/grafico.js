/* ═══════════════════════════════════════════════════════════════════
   AGROTITAN · GRÁFICO DE SENSIBILIDAD
   El capítulo 06 del informe, en vivo.

   Modelo ILUSTRATIVO de una inversión frutal, expresado en índice: la
   inversión inicial vale 100. No representa ningún proyecto real ni
   ningún cliente. Sirve para que el visitante entienda, moviendo dos
   perillas, qué significa "el proyecto deja de cerrar".

   La curva es el flujo de fondos ACUMULADO y DESCONTADO. Arranca
   negativa (la inversión, más los años improductivos del monte) y
   cruza el cero cuando el proyecto termina de repagarse.
   ═══════════════════════════════════════════════════════════════════ */

"use strict";

(function () {
  var svg = document.getElementById("grafico");
  if (!svg) return;                       // la página no tiene el gráfico

  /* ── Parámetros del modelo ilustrativo ───────────────────────── */
  var HORIZONTE = 20;        // años
  var TASA = 0.09;           // costo de oportunidad del capital
  var INVERSION = 100;       // índice: todo se mide contra esto
  var MANTENIMIENTO = 12;    // costo anual mientras el monte no produce
  var INGRESO_PLENO = 62;    // ingreso anual a plena producción
  var COSTO_FIJO = 10;
  var COSTO_VARIABLE = 14;

  // Cómo entra en producción el monte: recién al 4º año, y de a poco
  var NIVEL = { 4: 0.30, 5: 0.60, 6: 0.85 };

  /* ── Geometría ───────────────────────────────────────────────── */
  var NS = "http://www.w3.org/2000/svg";
  var W = 520, H = 300;
  var ML = 46, MR = 18, MT = 16, MB = 34;   // márgenes
  var IW = W - ML - MR, IH = H - MT - MB;
  var Y_MIN = -180, Y_MAX = 250;

  var tip = document.getElementById("tip");
  var capa = document.createElementNS(NS, "g");   // lo que se redibuja
  svg.appendChild(capa);

  function px(anio) { return ML + (anio / HORIZONTE) * IW; }
  function py(valor) { return MT + (Y_MAX - valor) / (Y_MAX - Y_MIN) * IH; }

  function nivel(anio) {
    if (anio < 4) return 0;
    return NIVEL[anio] !== undefined ? NIVEL[anio] : 1;
  }

  /* ── El modelo ───────────────────────────────────────────────── */
  function modelo(factorPrecio, factorRinde) {
    var flujos = [], acumulado = [], suma = 0;

    for (var a = 0; a <= HORIZONTE; a++) {
      var f;
      if (a === 0) {
        f = -INVERSION;
      } else if (a < 4) {
        f = -MANTENIMIENTO;
      } else {
        var n = nivel(a) * (1 + factorRinde);
        f = INGRESO_PLENO * n * (1 + factorPrecio)
            - (COSTO_FIJO + COSTO_VARIABLE * nivel(a));
      }
      flujos.push(f);
      suma += f / Math.pow(1 + TASA, a);   // descontado al presente
      acumulado.push(suma);
    }
    return { flujos: flujos, acumulado: acumulado, van: suma };
  }

  /* TIR por bisección: la tasa que hace que el VAN sea cero */
  function tir(flujos) {
    function van(r) {
      var s = 0;
      for (var i = 0; i < flujos.length; i++) s += flujos[i] / Math.pow(1 + r, i);
      return s;
    }
    if (van(0) <= 0) return null;          // ni sin descontar recupera
    var bajo = 0, alto = 1.5;
    if (van(alto) > 0) return alto;
    for (var k = 0; k < 60; k++) {
      var medio = (bajo + alto) / 2;
      if (van(medio) > 0) bajo = medio; else alto = medio;
    }
    return (bajo + alto) / 2;
  }

  function repago(acumulado) {
    for (var a = 0; a < acumulado.length; a++) if (acumulado[a] >= 0) return a;
    return null;
  }

  /* ── Dibujo ──────────────────────────────────────────────────── */
  function elemento(nombre, atributos, texto) {
    var n = document.createElementNS(NS, nombre);
    for (var k in atributos) n.setAttribute(k, atributos[k]);
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function ruta(acumulado) {
    var d = "";
    for (var a = 0; a <= HORIZONTE; a++) {
      d += (a ? "L" : "M") + px(a).toFixed(1) + " " + py(acumulado[a]).toFixed(1);
    }
    return d;
  }

  /* El área se parte en el cero: el signo lleva color, y además va
     rotulado con palabras, porque el color solo no alcanza. */
  function areas(acumulado) {
    var y0 = py(0), cruce = null;

    for (var a = 1; a <= HORIZONTE; a++) {
      if (acumulado[a - 1] < 0 && acumulado[a] >= 0) {
        cruce = a - 1 + (0 - acumulado[a - 1]) / (acumulado[a] - acumulado[a - 1]);
        break;
      }
    }

    var finNegativo = cruce === null ? HORIZONTE : cruce;
    var neg = "M" + px(0) + " " + y0;
    for (var b = 0; b <= Math.floor(finNegativo); b++) {
      neg += "L" + px(b).toFixed(1) + " " + py(acumulado[b]).toFixed(1);
    }
    neg += "L" + px(finNegativo).toFixed(1) + " " +
           (cruce === null ? py(acumulado[HORIZONTE]).toFixed(1) : y0) +
           "L" + px(finNegativo).toFixed(1) + " " + y0 + "Z";

    var pos = "";
    if (cruce !== null) {
      pos = "M" + px(cruce).toFixed(1) + " " + y0;
      for (var c = Math.ceil(cruce); c <= HORIZONTE; c++) {
        pos += "L" + px(c).toFixed(1) + " " + py(acumulado[c]).toFixed(1);
      }
      pos += "L" + px(HORIZONTE) + " " + y0 + "Z";
    }

    return { neg: neg, pos: pos, cruce: cruce };
  }

  var datos = null;

  function dibujar(factorPrecio, factorRinde) {
    var m = modelo(factorPrecio, factorRinde);
    datos = m;
    while (capa.firstChild) capa.removeChild(capa.firstChild);

    // Grilla horizontal y eje Y
    [-100, 0, 100, 200].forEach(function (v) {
      var esCero = v === 0;
      capa.appendChild(elemento("line", {
        x1: ML, x2: W - MR, y1: py(v), y2: py(v),
        stroke: esCero ? "rgba(242,240,233,.42)" : "rgba(242,240,233,.09)",
        "stroke-width": esCero ? 1.4 : 1
      }));
      capa.appendChild(elemento("text", {
        x: ML - 9, y: py(v) + 4, "text-anchor": "end",
        fill: "rgba(242,240,233,.50)", "font-size": 11,
        "font-family": "IBM Plex Mono, monospace"
      }, v));
    });

    // Eje X
    [0, 5, 10, 15, 20].forEach(function (a) {
      capa.appendChild(elemento("text", {
        x: px(a), y: H - MB + 19, "text-anchor": "middle",
        fill: "rgba(242,240,233,.50)", "font-size": 11,
        "font-family": "IBM Plex Mono, monospace"
      }, a));
    });
    capa.appendChild(elemento("text", {
      x: ML + IW / 2, y: H - 2, "text-anchor": "middle",
      fill: "rgba(242,240,233,.40)", "font-size": 10.5
    }, "años desde la inversión"));
    capa.appendChild(elemento("text", {
      x: ML - 34, y: MT - 4,
      fill: "rgba(242,240,233,.40)", "font-size": 10.5
    }, "índice · inversión inicial = 100"));

    // Áreas
    var A = areas(m.acumulado);
    if (A.neg) capa.appendChild(elemento("path", { d: A.neg, fill: "rgba(196,103,74,.22)", stroke: "none" }));
    if (A.pos) capa.appendChild(elemento("path", { d: A.pos, fill: "rgba(229,193,88,.26)", stroke: "none" }));

    // La curva
    capa.appendChild(elemento("path", {
      d: ruta(m.acumulado), fill: "none", stroke: "#F2F0E9",
      "stroke-width": 2, "stroke-linejoin": "round",
      "stroke-linecap": "round", opacity: .92
    }));

    // Rótulo del pozo: el color no viaja solo
    var minAnio = 0, minValor = 0;
    for (var a = 0; a <= HORIZONTE; a++) {
      if (m.acumulado[a] < minValor) { minValor = m.acumulado[a]; minAnio = a; }
    }
    if (minValor < -20) {
      capa.appendChild(elemento("text", {
        x: px(minAnio) + 8, y: py(minValor) + 16, fill: "#D98A6E",
        "font-size": 10.5, "font-family": "IBM Plex Mono, monospace"
      }, "capital inmovilizado"));
    }

    // Línea del repago
    var r = repago(m.acumulado);
    if (r !== null && A.cruce !== null) {
      capa.appendChild(elemento("line", {
        x1: px(A.cruce), x2: px(A.cruce), y1: MT, y2: H - MB,
        stroke: "#E5C158", "stroke-width": 1.2,
        "stroke-dasharray": "3 3", opacity: .75
      }));
      var etiquetaX = Math.min(px(A.cruce) + 7, W - MR - 88);
      capa.appendChild(elemento("text", {
        x: etiquetaX, y: MT + 13, fill: "#F1D98C", "font-size": 11,
        "font-family": "IBM Plex Mono, monospace"
      }, "repago · año " + r));
    }

    // Punto final
    var valorFinal = m.acumulado[HORIZONTE];
    capa.appendChild(elemento("circle", {
      cx: px(HORIZONTE), cy: py(valorFinal), r: 4.5,
      fill: valorFinal >= 0 ? "#E5C158" : "#C4674A",
      stroke: "#1B1E19", "stroke-width": 2
    }));

    actualizarLectura(m);
  }

  function fmt(n) {
    return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(0);
  }

  function actualizarLectura(m) {
    var r = repago(m.acumulado), t = tir(m.flujos);

    document.getElementById("van").textContent = fmt(m.van);
    document.getElementById("tir").textContent =
      t === null ? "sin retorno" : (t * 100).toFixed(1) + " %";
    document.getElementById("repago").textContent =
      r === null ? "no repaga" : "año " + r;

    var v = document.getElementById("veredicto");
    var cierra = m.van > 0 && t !== null && t > TASA;
    v.setAttribute("data-estado", cierra ? "cierra" : "no");
    v.innerHTML = cierra
      ? "<b>Sigue cerrando.</b>&nbsp;El retorno queda por encima del costo de " +
        "oportunidad del capital, fijado acá en " + (TASA * 100).toFixed(0) + " %."
      : "<b>Deja de cerrar.</b>&nbsp;El retorno cae por debajo del costo de " +
        "oportunidad (" + (TASA * 100).toFixed(0) + " %): ese mismo dinero " +
        "rendiría más en otro lado.";
  }

  /* ── Puntero sobre el gráfico ────────────────────────────────── */
  var cursor = null;

  svg.addEventListener("pointermove", function (e) {
    if (!datos) return;
    var caja = svg.getBoundingClientRect();
    var x = (e.clientX - caja.left) / caja.width * W;
    var a = Math.round((x - ML) / IW * HORIZONTE);
    if (a < 0 || a > HORIZONTE) { ocultar(); return; }

    if (!cursor) {
      cursor = elemento("g", {});
      cursor.appendChild(elemento("line", { stroke: "rgba(242,240,233,.35)", "stroke-width": 1 }));
      cursor.appendChild(elemento("circle", { r: 4, fill: "#E5C158", stroke: "#1B1E19", "stroke-width": 2 }));
    }
    if (cursor.parentNode !== svg) svg.appendChild(cursor);

    var vx = px(a), vy = py(datos.acumulado[a]);
    cursor.firstChild.setAttribute("x1", vx);
    cursor.firstChild.setAttribute("x2", vx);
    cursor.firstChild.setAttribute("y1", MT);
    cursor.firstChild.setAttribute("y2", H - MB);
    cursor.lastChild.setAttribute("cx", vx);
    cursor.lastChild.setAttribute("cy", vy);

    tip.textContent = "Año " + a + " · acumulado " + fmt(datos.acumulado[a]);
    tip.classList.add("visible");
    var izq = vx / W * caja.width;
    tip.style.left = Math.max(0, Math.min(izq - tip.offsetWidth / 2,
                                          caja.width - tip.offsetWidth)) + "px";
    tip.style.top = Math.max(0, vy / H * caja.height - tip.offsetHeight - 12) + "px";
  });

  function ocultar() {
    tip.classList.remove("visible");
    if (cursor && cursor.parentNode) cursor.parentNode.removeChild(cursor);
  }
  svg.addEventListener("pointerleave", ocultar);

  /* ── Perillas ────────────────────────────────────────────────── */
  var iPrecio = document.getElementById("precio");
  var iRinde = document.getElementById("rinde");

  function refrescar() {
    var p = +iPrecio.value, r = +iRinde.value;
    document.getElementById("precio-val").textContent = (p > 0 ? "+" : "") + p + " %";
    document.getElementById("rinde-val").textContent = (r > 0 ? "+" : "") + r + " %";
    dibujar(p / 100, r / 100);
  }

  iPrecio.addEventListener("input", refrescar);
  iRinde.addEventListener("input", refrescar);
  refrescar();
})();
