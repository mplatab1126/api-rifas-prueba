// comprar-steps.jsx — Pantallas del flujo Comprar boleta

const { useState: useS, useMemo: useM, useEffect: useE, useRef: useR } = React;

// ═══════════════════════════════════════════════════════════
//  PASO 1 — Escoger números
// ═══════════════════════════════════════════════════════════
window.StepEscoger = function StepEscoger({ rifa, seleccionadas, setSeleccionadas, onContinuar }) {
  const [modo, setModo] = useS("manual"); // 'manual' | 'aleatorio'
  const [busqueda, setBusqueda] = useS("");
  const [visibles, setVisibles] = useS(50); // boletas mostradas en la grilla (5 por serie x 10 series)
  const [disponibles, setDisponibles] = useS([]);
  const [loading, setLoading] = useS(true);
  const [sinMas, setSinMas] = useS(false);
  const [busquedaEstado, setBusquedaEstado] = useS(null); // null | 'buscando' | 'tomada' | 'no-existe'

  // Carga inicial: pide 50 sin exclusiones
  const cargarInicial = React.useCallback(async () => {
    setLoading(true);
    setSinMas(false);
    const nuevas = await window.fetchBoletasDisponibles([]);
    setDisponibles(nuevas);
    setVisibles(50);
    setLoading(false);
  }, []);

  // "Mostrar más": pide 50 frescos excluyendo los que ya están y reemplaza
  const mostrarMas = React.useCallback(async () => {
    setLoading(true);
    const anteriores = disponibles.slice();
    const nuevas = await window.fetchBoletasDisponibles(anteriores);
    if (nuevas.length === 0) {
      setSinMas(true);
    } else {
      setDisponibles(nuevas);
      setVisibles(50);
      setSinMas(nuevas.length < 50);
    }
    setLoading(false);
  }, [disponibles]);

  useE(() => { cargarInicial(); }, [cargarInicial]);

  // Cuando el cliente escribe 4 dígitos completos, consultar la API real
  // para verificar disponibilidad en TODA la rifa (no solo en la muestra de 50)
  useE(() => {
    const num = busqueda.trim();
    if (!/^\d{4}$/.test(num)) {
      setBusquedaEstado(null);
      return;
    }
    // Si ya lo tenemos en la lista actual, no hace falta consultar
    if (disponibles.includes(num)) {
      setBusquedaEstado(null);
      return;
    }
    let cancelado = false;
    setBusquedaEstado('buscando');
    fetch('/api/rifa/verificar?numero=' + encodeURIComponent(num))
      .then(r => r.json())
      .then(data => {
        if (cancelado) return;
        if (!data || !data.existe) {
          setBusquedaEstado('no-existe');
        } else if (data.disponible) {
          // Está libre — lo agrego a la lista para que el cliente lo pueda tocar
          setDisponibles(prev => {
            if (prev.includes(num)) return prev;
            return [...prev, num].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
          });
          setBusquedaEstado(null);
        } else {
          setBusquedaEstado('tomada');
        }
      })
      .catch(() => {
        if (!cancelado) setBusquedaEstado(null);
      });
    return () => { cancelado = true; };
  }, [busqueda, disponibles]);

  const filtradas = useM(() => {
    if (!busqueda) return disponibles;
    return disponibles.filter(n => n.startsWith(busqueda));
  }, [busqueda, disponibles]);

  const toggle = (num) => {
    setSeleccionadas(prev => {
      if (prev.includes(num)) return prev.filter(n => n !== num);
      if (prev.length >= 10) return prev; // máx 10
      return [...prev, num];
    });
  };

  const aleatorios = (cantidad) => {
    const restante = 10 - seleccionadas.length;
    const n = Math.min(cantidad, restante);
    const candidatos = disponibles.filter(d => !seleccionadas.includes(d));
    const nuevos = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * candidatos.length);
      nuevos.push(candidatos.splice(idx, 1)[0]);
    }
    setSeleccionadas(prev => [...prev, ...nuevos]);
  };

  const total = seleccionadas.length * rifa.precioBoleta;

  return (
    <React.Fragment>
      <div className="cb-intro">
        <p className="cb-intro-eyebrow">Paso 1 de 3</p>
        <h1 className="cb-intro-titulo">Escoja sus números</h1>
      </div>

      <div className="cb-search">
        <span className="cb-search-icon">
          <CompIcon name="search" size={20} />
        </span>
        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className="cb-search-input"
          placeholder="Buscar número (ej: 1234)"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </div>

      <div className="cb-grid">
        {filtradas.slice(0, visibles).map(n => (
          <button
            key={n}
            className={"cb-num" + (seleccionadas.includes(n) ? " selected" : "")}
            onClick={() => toggle(n)}
            disabled={!seleccionadas.includes(n) && seleccionadas.length >= 10}
          >
            {n}
          </button>
        ))}
      </div>

      {loading && disponibles.length === 0 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--ink-mute)" }}>
          Cargando números disponibles...
        </div>
      )}

      {busquedaEstado === 'buscando' && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--ink-mute)" }}>
          Verificando el número {busqueda}...
        </div>
      )}

      {busquedaEstado === 'tomada' && (
        <div style={{ textAlign: "center", padding: "20px 24px", color: "var(--ink-soft)", lineHeight: 1.5 }}>
          El número <strong>{busqueda}</strong> ya fue asignado a otra persona. Escoja otro o búsquelo en la lista.
        </div>
      )}

      {busquedaEstado === 'no-existe' && (
        <div style={{ textAlign: "center", padding: "20px 24px", color: "var(--ink-soft)", lineHeight: 1.5 }}>
          El número <strong>{busqueda}</strong> no está en esta rifa.
        </div>
      )}

      {!loading && !busquedaEstado && filtradas.length === 0 && busqueda && busqueda.length < 4 && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--ink-mute)" }}>
          No hay números disponibles que comiencen por "{busqueda}" en la muestra actual.
        </div>
      )}

      {!loading && disponibles.length === 0 && !busqueda && (
        <div style={{ textAlign: "center", padding: "20px", color: "var(--ink-mute)" }}>
          No hay boletas disponibles en este momento. Escríbanos por WhatsApp.
        </div>
      )}

      {!loading && disponibles.length > 0 && !busqueda && !sinMas && (
        <button className="cb-load-more" onClick={mostrarMas}>
          Mostrar más números disponibles
        </button>
      )}

      {!loading && sinMas && (
        <div style={{ textAlign: "center", padding: "12px 20px", color: "var(--ink-mute)", fontSize: 14 }}>
          Ya no quedan más números para mostrar. Escríbenos por WhatsApp si necesitas otro.
        </div>
      )}

      {/* Sticky bar — muestra los chips de números seleccionados arriba del precio */}
      <div className="cb-sticky-bar">
        {seleccionadas.length > 0 && (
          <div className="cb-sticky-chips">
            {seleccionadas.map(n => (
              <span key={n} className="cb-chip">
                {n}
                <button
                  className="cb-chip-x"
                  onClick={() => setSeleccionadas(prev => prev.filter(x => x !== n))}
                  aria-label={`Quitar ${n}`}
                >
                  <CompIcon name="x" size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="cb-sticky-row">
          <span className="cb-sticky-label">
            {seleccionadas.length === 0 ? "Sin números" :
             seleccionadas.length === 1 ? "1 boleta" :
             `${seleccionadas.length} boletas`}
          </span>
          <div style={{ textAlign: "right" }}>
            <span className="cb-sticky-value">{window.formatCOP(total)}</span>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ink-mute)", fontWeight: 500, letterSpacing: 0 }}>
              o abone desde {window.formatCOP(20000)}
            </p>
          </div>
        </div>
        <button
          className="cb-btn-primary"
          disabled={seleccionadas.length === 0}
          onClick={onContinuar}
        >
          Continuar
          <CompIcon name="arrowRight" size={20} />
        </button>
      </div>
    </React.Fragment>
  );
};

function SeleccionChips({ seleccionadas, onRemove, onClear }) {
  if (seleccionadas.length === 0) {
    return (
      <div className="cb-seleccion">
        <p className="cb-seleccion-empty">Aún no ha escogido números</p>
      </div>
    );
  }
  return (
    <div className="cb-seleccion">
      <div className="cb-seleccion-row">
        <span className="cb-seleccion-label">
          Sus números ({seleccionadas.length}/10)
        </span>
        <button className="cb-seleccion-clear" onClick={onClear}>Quitar todos</button>
      </div>
      <div className="cb-seleccion-chips">
        {seleccionadas.map(n => (
          <span key={n} className="cb-chip">
            {n}
            <button className="cb-chip-x" onClick={() => onRemove(n)} aria-label={`Quitar ${n}`}>
              <CompIcon name="x" size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  PASO 2 — Datos del cliente
// ═════════════════════════════════════════════════════════
window.StepDatos = function StepDatos({ datos, setDatos, seleccionadas, rifa, onContinuar }) {
  const [openSheet, setOpenSheet] = useS(false);
  const [openDocSheet, setOpenDocSheet] = useS(false);

  const total = seleccionadas.length * rifa.precioBoleta;
  const tipoDocActual = (window.TIPOS_DOCUMENTO || []).find(t => t.code === datos.tipoDoc) || window.TIPOS_DOCUMENTO[0];
  const celularValido = datos.pais.iso === "OTHER"
    ? (datos.pais.code.length >= 2 && datos.celular.length >= 6)
    : datos.celular.length === datos.pais.digits;
  const valid = datos.nombre.trim() && datos.apellido.trim() && datos.cedula.trim().length >= 6 &&
                celularValido && datos.ciudad.trim();

  const update = (k, v) => setDatos(prev => ({ ...prev, [k]: v }));

  return (
    <React.Fragment>
      <div className="cb-intro">
        <p className="cb-intro-eyebrow">Paso 2 de 3</p>
        <h1 className="cb-intro-titulo">Datos del titular de la boleta</h1>
      </div>

      <form className="cb-form" onSubmit={(e) => { e.preventDefault(); if (valid) onContinuar(); }}>
        <div>
          <label className="cb-field-label" htmlFor="cb-nombre">Nombre</label>
          <input
            id="cb-nombre"
            className="cb-input"
            placeholder="Ej: Juan"
            value={datos.nombre}
            onChange={(e) => update("nombre", e.target.value)}
            autoComplete="given-name"
          />
        </div>

        <div>
          <label className="cb-field-label" htmlFor="cb-apellido">Apellido</label>
          <input
            id="cb-apellido"
            className="cb-input"
            placeholder="Ej: Pérez"
            value={datos.apellido}
            onChange={(e) => update("apellido", e.target.value)}
            autoComplete="family-name"
          />
        </div>

        <div>
          <label className="cb-field-label" htmlFor="cb-cedula">Número de documento</label>
          <div className="cb-phone-group">
            <button
              type="button"
              className="cb-country-btn cb-doc-btn"
              onClick={() => setOpenDocSheet(true)}
            >
              <span>{tipoDocActual.code}</span>
              <CompIcon name="chevronDown" size={14} />
            </button>
            <input
              id="cb-cedula"
              type="text"
              inputMode={datos.tipoDoc === "PA" ? "text" : "numeric"}
              className="cb-input"
              style={{ flex: 1 }}
              placeholder={datos.tipoDoc === "PA" ? "Ej: AB1234567" : "Ej: 1234567890"}
              value={datos.cedula}
              onChange={(e) => {
                const raw = e.target.value;
                const cleaned = datos.tipoDoc === "PA"
                  ? raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12)
                  : raw.replace(/\D/g, "").slice(0, 12);
                update("cedula", cleaned);
              }}
              autoComplete="off"
            />
          </div>
        </div>

        <div>
          <label className="cb-field-label" htmlFor="cb-cel">Celular (WhatsApp)</label>
          <div className="cb-phone-group">
            <button
              type="button"
              className="cb-country-btn"
              onClick={() => setOpenSheet(true)}
            >
              <span className="cb-flag">{datos.pais.flag}</span>
              <span>{datos.pais.code}</span>
              <CompIcon name="chevronDown" size={14} />
            </button>
            <input
              id="cb-cel"
              type="tel"
              inputMode="numeric"
              className="cb-input"
              style={{ flex: 1 }}
              placeholder={datos.pais.iso === "OTHER" ? "Su número" : "0".repeat(datos.pais.digits)}
              value={datos.celular}
              onChange={(e) => update("celular", e.target.value.replace(/\D/g, "").slice(0, datos.pais.digits))}
            />
          </div>
        </div>

        <div>
          <label className="cb-field-label" htmlFor="cb-ciudad">Ciudad</label>
          <input
            id="cb-ciudad"
            className="cb-input"
            placeholder="Ej: Pereira, Risaralda"
            value={datos.ciudad}
            onChange={(e) => update("ciudad", e.target.value)}
            autoComplete="address-level2"
          />
        </div>
      </form>

      <div className="cb-sticky-bar">
        <div className="cb-sticky-row">
          <span className="cb-sticky-label">
            {seleccionadas.length} {seleccionadas.length === 1 ? "boleta" : "boletas"}
          </span>
          <div style={{ textAlign: "right" }}>
            <span className="cb-sticky-value">{window.formatCOP(total)}</span>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ink-mute)", fontWeight: 500, letterSpacing: 0 }}>
              o abone desde {window.formatCOP(20000)}
            </p>
          </div>
        </div>
        <button
          className="cb-btn-primary"
          disabled={!valid}
          onClick={onContinuar}
        >
          Continuar
          <CompIcon name="arrowRight" size={20} />
        </button>
      </div>

      {openSheet && (
        <CountrySheetCB
          paisActual={datos.pais}
          onSelect={(p) => { update("pais", p); update("celular", ""); setOpenSheet(false); }}
          onClose={() => setOpenSheet(false)}
        />
      )}
      {openDocSheet && (
        <DocSheetCB
          tipoActual={datos.tipoDoc}
          onSelect={(code) => { update("tipoDoc", code); update("cedula", ""); setOpenDocSheet(false); }}
          onClose={() => setOpenDocSheet(false)}
        />
      )}
    </React.Fragment>
  );
};

function CountrySheetCB({ paisActual, onSelect, onClose }) {
  const [q, setQ] = useS("");
  const [customMode, setCustomMode] = useS(false);
  const [customCode, setCustomCode] = useS(paisActual.iso === "OTHER" ? paisActual.code.replace("+", "") : "");

  const filtered = useM(() => {
    const t = q.trim().toLowerCase();
    if (!t) return window.PAISES;
    return window.PAISES.filter(p =>
      p.name.toLowerCase().includes(t) || p.code.includes(t)
    );
  }, [q]);

  const handlePick = (p) => {
    if (p.iso === "OTHER") {
      setCustomMode(true);
      return;
    }
    onSelect(p);
  };

  const confirmCustom = () => {
    const trimmed = customCode.replace(/[^0-9]/g, "").slice(0, 4);
    if (trimmed.length < 1) return;
    onSelect({
      code: "+" + trimmed,
      iso: "OTHER",
      name: "Otro país",
      flag: "🌐",
      digits: 15,
      custom: true
    });
  };

  return (
    <div className="ab-sheet-backdrop" onClick={onClose}>
      <div className="ab-sheet" onClick={e => e.stopPropagation()}>
        <div className="ab-sheet-handle" />
        <div className="ab-sheet-header">
          <h2 className="ab-sheet-title">
            {customMode ? "Escriba su indicativo" : "Selecciona tu país"}
          </h2>
          {!customMode && (
            <input
              className="ab-sheet-search"
              placeholder="Buscar país..."
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          )}
        </div>
        {customMode ? (
          <div className="ab-sheet-custom">
            <p className="ab-sheet-custom-help">
              Si su país no aparece en la lista, escriba aquí el indicativo telefónico (ejemplo: <strong>+44</strong> para Reino Unido).
            </p>
            <div className="ab-sheet-custom-input">
              <span className="ab-sheet-custom-prefix">+</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="44"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                autoFocus
              />
            </div>
            <div className="ab-sheet-custom-actions">
              <button className="ab-sheet-custom-back" onClick={() => setCustomMode(false)}>
                ← Volver a la lista
              </button>
              <button
                className="ab-sheet-custom-ok"
                onClick={confirmCustom}
                disabled={customCode.length < 1}
              >
                Aceptar
              </button>
            </div>
          </div>
        ) : (
          <div className="ab-sheet-list">
            {filtered.map(p => (
              <button
                key={p.iso}
                className={"ab-sheet-item" + (p.iso === paisActual.iso ? " selected" : "")}
                onClick={() => handlePick(p)}
              >
                <span className="ab-flag">{p.flag}</span>
                <span className="ab-sheet-item-name">{p.name}</span>
                <span className="ab-sheet-item-code">{p.iso === "OTHER" ? "Indicativo →" : p.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocSheetCB({ tipoActual, onSelect, onClose }) {
  const tipos = window.TIPOS_DOCUMENTO || [];
  return (
    <div className="ab-sheet-backdrop" onClick={onClose}>
      <div className="ab-sheet" onClick={e => e.stopPropagation()}>
        <div className="ab-sheet-handle" />
        <div className="ab-sheet-header">
          <h2 className="ab-sheet-title">Tipo de documento</h2>
        </div>
        <div className="ab-sheet-list">
          {tipos.map(t => (
            <button
              key={t.code}
              className={"ab-sheet-item" + (t.code === tipoActual ? " selected" : "")}
              onClick={() => onSelect(t.code)}
            >
              <span className="ab-sheet-item-code-pill">{t.code}</span>
              <span className="ab-sheet-item-name">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  PASO 3 — Confirmación (Reservar por WhatsApp)
// ═════════════════════════════════════════════════════════
window.StepPago = function StepPago({ datos, seleccionadas, rifa, onReservar }) {
  const total = seleccionadas.length * rifa.precioBoleta;
  const WA_NUMBER = "573107334957"; // LOS PLATA WhatsApp oficial

  const [reservando, setReservando] = useS(false);
  const [errorReserva, setErrorReserva] = useS(null);

  const tipoDocLabel = (window.TIPOS_DOCUMENTO || []).find(t => t.code === datos.tipoDoc)?.code || datos.tipoDoc;

  const boletasTextoMsg = seleccionadas.length === 1
    ? `la boleta N° ${seleccionadas[0]}`
    : `las boletas N° ${seleccionadas.join(", N° ")}`;

  const waMsg = encodeURIComponent(
    `Hola, acabo de reservar ${boletasTextoMsg} en la página web de *${rifa.nombre}*.

*Datos del titular*
• Nombre: ${datos.nombre} ${datos.apellido}
• ${tipoDocLabel}: ${datos.cedula}
• Celular: ${datos.pais.code} ${datos.celular}
• Ciudad: ${datos.ciudad}

*Valor total a pagar:* ${window.formatCOP(total)}

Por favor envíenme los datos para realizar el pago. ¡Gracias!`
  );
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waMsg}`;

  const reservarYAbrirWA = async () => {
    if (reservando) return;

    // PRE-ABRIR la pestaña de WhatsApp SÍNCRONAMENTE para preservar el "user
    // gesture". Si esperamos a que termine el fetch, Safari iOS pierde el
    // gesto y bloquea window.open/anchor.click como popup no deseado.
    // Esta pestaña queda en "about:blank" mientras se hace la reserva, y se
    // redirige a wa.me cuando llega la respuesta.
    const waWindow = window.open("about:blank", "_blank");

    setReservando(true);
    setErrorReserva(null);

    const esColombia = datos.pais && datos.pais.iso === "CO";
    const telefonoParaApi = esColombia
      ? datos.celular
      : (datos.pais.code || "").replace(/\+/g, "") + datos.celular;

    try {
      const res = await fetch("/api/rifa/reservar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeros: seleccionadas,
          nombre: datos.nombre,
          apellido: datos.apellido,
          ciudad: datos.ciudad,
          telefono: telefonoParaApi,
          esColombia: esColombia,
          documento_tipo: datos.tipoDoc,
          documento_numero: datos.cedula
        })
      });
      const data = await res.json();

      if (!data.exito) {
        if (waWindow && !waWindow.closed) waWindow.close();
        setErrorReserva(data.error || "No pudimos apartar la boleta. Inténtalo de nuevo.");
        setReservando(false);
        return;
      }

      // Reserva OK: redirigimos la pestaña ya abierta a WhatsApp.
      if (waWindow && !waWindow.closed) {
        waWindow.location.href = waLink;
      } else {
        // Plan B: el navegador bloqueó la pre-apertura. Redirigimos la pestaña
        // actual a WhatsApp para que el cliente igual llegue al asesor.
        window.location.href = waLink;
      }

      // Cambiamos la vista a "éxito" para que, si el cliente vuelve a la
      // pestaña del sitio, vea la confirmación con su resumen y el botón
      // para reabrir WhatsApp si se cerró antes de escribir.
      if (onReservar) onReservar();
    } catch (e) {
      console.error("[reservar]", e);
      if (waWindow && !waWindow.closed) waWindow.close();
      setErrorReserva("Hubo un problema de conexión. Inténtalo de nuevo o escríbenos por WhatsApp.");
      setReservando(false);
    }
  };

  return (
    <React.Fragment>
      <div className="cb-intro">
        <p className="cb-intro-eyebrow">Paso 3 de 3</p>
        <h1 className="cb-intro-titulo">Confirme su reserva</h1>
      </div>

      {/* Resumen del pedido */}
      <div className="cb-resumen-card">
        <div className="cb-resumen-hero">
          <p className="cb-resumen-hero-eyebrow">
            Está reservando {seleccionadas.length === 1 ? "la boleta" : `${seleccionadas.length} boletas`}
          </p>
          <div className="cb-resumen-nums-hero">
            {seleccionadas.map(n => (
              <span key={n} className="cb-resumen-num-hero">N° {n}</span>
            ))}
          </div>
          <p className="cb-resumen-hero-rifa">{rifa.nombre}</p>
        </div>

        <p className="cb-resumen-datos-label">Sus datos</p>
        <div className="cb-resumen-row">
          <span className="label">Titular</span>
          <span className="value">{datos.nombre} {datos.apellido}</span>
        </div>
        <div className="cb-resumen-row">
          <span className="label">{tipoDocLabel}</span>
          <span className="value">{datos.cedula}</span>
        </div>
        <div className="cb-resumen-row">
          <span className="label">Celular</span>
          <span className="value">{datos.pais.code} {datos.celular}</span>
        </div>
        <div className="cb-resumen-row">
          <span className="label">Ciudad</span>
          <span className="value">{datos.ciudad}</span>
        </div>
      </div>

      {/* Aviso de qué pasa después */}
      <div className="cb-confirm-note">
        <span className="cb-confirm-note-ico">
          <CompIcon name="wa" size={20} color="currentColor" />
        </span>
        <div>
          <p className="cb-confirm-note-titulo">¿Qué pasa después?</p>
          <ol className="cb-confirm-note-list">
            <li>Apartamos su boleta a su nombre por <strong>24 horas</strong>.</li>
            <li>Por WhatsApp le enviamos la <strong>cuenta Bancolombia</strong> oficial para el pago.</li>
            <li>Una vez confirmamos el pago, recibe su <strong>boleta digital</strong>.</li>
          </ol>
        </div>
      </div>

      {/* Sticky bar con CTA WhatsApp */}
      <div className="cb-sticky-bar">
        <div className="cb-sticky-row">
          <span className="cb-sticky-label">Total a pagar</span>
          <span className="cb-sticky-value">{window.formatCOP(total)}</span>
        </div>

        {errorReserva && (
          <div style={{ padding: "12px 14px", marginBottom: 10, background: "rgba(127,31,31,0.08)", color: "#7A1F1F", borderRadius: 10, fontSize: 14, lineHeight: 1.45 }}>
            {errorReserva}
          </div>
        )}

        <button
          type="button"
          className="cb-btn-primary cb-btn-wa"
          onClick={reservarYAbrirWA}
          disabled={reservando}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            whiteSpace: "nowrap",
            ...(reservando ? { opacity: 0.7, cursor: "not-allowed" } : {})
          }}
        >
          <CompIcon name="wa" size={22} color="currentColor" />
          <span>{reservando ? "Confirmando..." : "Confirmar mi reserva"}</span>
        </button>
        <p className="cb-confirm-tagline">
          Respondemos en minutos (horario hábil).
        </p>
      </div>

      {/* Anti-estafa */}
      <div className="cb-secure-note">
        <CompIcon name="shield" size={18} />
        <span>
          Pague solo a Bancolombia <strong>706-000025-93</strong>. Nunca le pediremos clave ni tarjeta por WhatsApp.
        </span>
      </div>
    </React.Fragment>
  );
};

// ═════════════════════════════════════════════════════════
//  ÉXITO
// ═════════════════════════════════════════════════════════
window.StepExitoCompra = function StepExitoCompra({ datos, seleccionadas, rifa, onVolver }) {
  const total = seleccionadas.length * rifa.precioBoleta;
  const WA_NUMBER = "573107334957";

  const tipoDocLabel = (window.TIPOS_DOCUMENTO || []).find(t => t.code === datos.tipoDoc)?.code || datos.tipoDoc;

  const boletasTexto = seleccionadas.length === 1
    ? `la boleta N° ${seleccionadas[0]}`
    : `las boletas N° ${seleccionadas.join(", N° ")}`;

  const waMsg = encodeURIComponent(
    `Hola, acabo de reservar ${boletasTexto} en la página web de *${rifa.nombre}*.

*Datos del titular*
• Nombre: ${datos.nombre} ${datos.apellido}
• ${tipoDocLabel}: ${datos.cedula}
• Celular: ${datos.pais.code} ${datos.celular}
• Ciudad: ${datos.ciudad}

*Valor total a pagar:* ${window.formatCOP(total)}

Por favor envíenme los datos para realizar el pago. ¡Gracias!`
  );
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waMsg}`;

  return (
    <React.Fragment>
      <div className="cb-exito">
        <div className="cb-exito-icon cb-exito-icon-3d">
          <img src="assets/icon-3d-tick.png" alt="" />
        </div>
        <h1 className="cb-exito-titulo">¡Su boleta ha sido apartada!</h1>
        <p className="cb-exito-msg">
          Reservamos {seleccionadas.length === 1 ? "su número" : "sus números"} a su nombre por <strong>24 horas</strong>. Para recibir los datos de pago y la boleta digital, reclámela por WhatsApp con un solo toque.
        </p>
      </div>

      <div className="cb-resumen-card">
        <p className="cb-resumen-eyebrow">Su reserva</p>
        <p className="cb-resumen-titulo">{rifa.nombre}</p>
        <div className="cb-resumen-row">
          <span className="label">Titular</span>
          <span className="value">{datos.nombre} {datos.apellido}</span>
        </div>
        <div className="cb-resumen-row">
          <span className="label">{tipoDocLabel}</span>
          <span className="value">{datos.cedula}</span>
        </div>
        <div className="cb-resumen-row">
          <span className="label">Celular</span>
          <span className="value">{datos.pais.code} {datos.celular}</span>
        </div>
        <div className="cb-resumen-row">
          <span className="label">Boletas ({seleccionadas.length})</span>
          <span className="value">{window.formatCOP(rifa.precioBoleta)} c/u</span>
        </div>
        <div className="cb-resumen-nums">
          {seleccionadas.map(n => (
            <span key={n} className="cb-resumen-num">N° {n}</span>
          ))}
        </div>
        <div className="cb-resumen-row total">
          <span className="label">Valor a pagar</span>
          <span className="value">{window.formatCOP(total)}</span>
        </div>
      </div>

      <a
        className="cb-btn-primary cb-btn-wa"
        href={waLink}
        target="_blank"
        rel="noopener"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          whiteSpace: "nowrap"
        }}
      >
        <CompIcon name="wa" size={22} color="currentColor" />
        <span>Reclamar boleta</span>
      </a>

      <button className="cb-btn-secondary" onClick={onVolver} style={{ marginTop: 12 }}>
        Volver al inicio
      </button>

      <div className="cb-secure-note" style={{ marginTop: 18 }}>
        <CompIcon name="shield" size={18} />
        <span>
          Pague únicamente en la cuenta oficial <strong>Bancolombia Ahorros 706-000025-93 · LOS PLATA S.A.S.</strong> No realice pagos a cuentas personales.
        </span>
      </div>
    </React.Fragment>
  );
};

