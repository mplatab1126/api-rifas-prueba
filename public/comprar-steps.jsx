// comprar-steps.jsx — Pantallas del flujo Comprar boleta

const { useState: useS, useMemo: useM, useEffect: useE, useRef: useR } = React;

// ═════════════════════════════════════════════════════════
//  LANDING (vista 0) — Hero + premios + condiciones + CTA
// ═════════════════════════════════════════════════════════
window.LandingComprar = function LandingComprar({ rifa, onComprar, onAtras }) {
  return (
    <React.Fragment>
      {/* Hero negro con eyebrow + título + carousel */}
      <div className="cb-hero">
        <div className="cb-hero-eyebrow">Evento actual</div>
        <h1 className="cb-hero-titulo">{rifa.nombre}</h1>
        <p className="cb-hero-edicion">{rifa.edicion}</p>
        <PremiosCarousel premios={rifa.premios} imagenes={rifa.imagenes} />
      </div>

      {/* Countdown */}
      <Countdown fechaObjetivo={rifa.fechaObjetivo} />

      {/* Disponibilidad */}
      <Disponibilidad rifa={rifa} />

      {/* CTA principal */}
      <div className="cb-cta-wrap">
        <div className="cb-cta-precio">
          <p className="cb-cta-precio-eyebrow">Cada boleta vale</p>
          <span className="cb-cta-precio-num">{window.formatCOP(rifa.precioBoleta)}</span>
          <span className="cb-cta-precio-unit"> COP</span>
        </div>
        <button className="cb-btn-primary" onClick={onComprar}>
          Comprar mi boleta
          <CompIcon name="arrowRight" size={20} />
        </button>
      </div>

      {/* Mecánica */}
      <div className="cb-section">
        <p className="cb-section-eyebrow">Así de fácil participas</p>
        <h2 className="cb-section-titulo">Tres pasos sencillos</h2>
        <div className="cb-pasos">
          <div className="cb-paso">
            <div className="cb-paso-num">1</div>
            <div className="cb-paso-content">
              <h3 className="cb-paso-titulo">Escoge tu número</h3>
              <p className="cb-paso-desc">Elija un número de cuatro cifras de la lista, o pida que se lo asignemos al azar.</p>
            </div>
          </div>
          <div className="cb-paso">
            <div className="cb-paso-num">2</div>
            <div className="cb-paso-content">
              <h3 className="cb-paso-titulo">Pague su boleta</h3>
              <p className="cb-paso-desc">Pague de una vez con tarjeta o PSE, o transfiera a la cuenta oficial Bancolombia y mande el comprobante.</p>
            </div>
          </div>
          <div className="cb-paso">
            <div className="cb-paso-num">3</div>
            <div className="cb-paso-content">
              <h3 className="cb-paso-titulo">Reciba su boleta</h3>
              <p className="cb-paso-desc">Le llegará al WhatsApp con su nombre y número. Listo. ¡Mucha suerte!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Anti-estafa */}
      <div className="cb-anti">
        <div className="cb-anti-icon cb-anti-icon-3d">
          <img src="assets/icon-3d-lock.png" alt="" />
        </div>
        <div>
          <p className="cb-anti-t">Cuídese de las estafas</p>
          <p className="cb-anti-d">
            Los pagos se reciben únicamente en la cuenta oficial <strong>LOS PLATA S.A.S.</strong> — Bancolombia Ahorros <strong>706-000025-93</strong>. No confíe en otras cuentas.
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="cb-faq">
        <p className="cb-section-eyebrow">Preguntas frecuentes</p>
        <h2 className="cb-section-titulo">Resolvamos sus dudas</h2>
        <FAQItem q="¿Cómo sé que el sorteo es real?">
          Somos <strong>LOS PLATA S.A.S.</strong>, empresa colombiana legalmente constituida (NIT 902.003.134-4). Cada sorteo cuenta con <strong>resolución de autorización expedida por EDSA</strong>, que puede consultar en su página oficial. Estamos amparados por la Ley 643 de 2001. Los sorteos se transmiten en vivo por nuestras redes y los ganadores se publican con foto y nombre.
        </FAQItem>
        <FAQItem q="¿Cuándo es el sorteo?">
          El <strong>premio anticipado</strong> (Yamaha NMAX) se sortea el <strong>18 de abril de 2026</strong>. El <strong>premio mayor</strong> (Nissan Frontier + KTM Duke) se sortea el <strong>2 de mayo de 2026</strong>.
        </FAQItem>
        <FAQItem q="¿El premio anticipado lo puedo ganar y luego ganar el mayor?">
          Sí. Su boleta participa en los dos sorteos. Si gana el anticipado, continúa participando por el premio mayor con el mismo número.
        </FAQItem>
        <FAQItem q="¿Cómo recibo mi boleta?">
          Le llegará por WhatsApp en máximo dos horas después del pago, con su nombre y el número asignado.
        </FAQItem>
        <FAQItem q="¿Qué pasa si gano?">
          Lo contactamos por el celular registrado. Coordinamos la entrega del premio en nuestra oficina en Chinchiná, Caldas, o lo llevamos hasta su ciudad si vive lejos.
        </FAQItem>
        <FAQItem q="¿Tengo que pagar algo más cuando reciba el premio?">
          Le entregamos el bien <strong>libre de gravámenes</strong> y con las certificaciones de ley. Como ocurre con cualquier bien que cambia de dueño en Colombia, los trámites para ponerlo a su nombre y los impuestos asociados los asume el ganador: la <strong>ganancia ocasional</strong> ante la DIAN (aplicable por ley a los premios de rifas) y, según el premio, los gastos de <strong>traspaso e impuesto de rodamiento</strong> del vehículo, o de <strong>escrituración y registro</strong> si fuera un inmueble. Lo acompañamos en cada paso para que sea sencillo.
        </FAQItem>
        <FAQItem q="¿Cuánto tiempo tengo para reclamar mi premio?">
          Cuenta con <strong>30 días hábiles</strong> desde la fecha del sorteo para contactarnos por los canales oficiales y reclamarlo. Pasado ese término sin justa causa, el premio podrá ser declarado desierto.
        </FAQItem>
      </div>

      {/* CTA final */}
      <div className="cb-cta-wrap" style={{ marginTop: 32 }}>
        <button className="cb-btn-primary dark" onClick={onComprar}>
          Comprar mi boleta ahora
          <CompIcon name="arrowRight" size={20} color="#9BFAB0" />
        </button>
      </div>

    </React.Fragment>
  );
};

// ─── Carousel de premios ───
function PremiosCarousel({ premios, imagenes }) {
  const [idx, setIdx] = useS(0);
  const total = premios.length;

  const go = (dir) => {
    setIdx(prev => Math.max(0, Math.min(total - 1, prev + dir)));
  };

  return (
    <div className="cb-carousel">
      <div className="cb-carousel-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {premios.map((p, i) => (
          <div className="cb-carousel-slide" key={i}>
            <div className="cb-carousel-img">
              {p.imagen ? (
                <img
                  src={p.imagen}
                  alt={p.nombre}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="cb-carousel-img-placeholder">foto · {p.nombre}</div>
              )}
            </div>
            <div className="cb-carousel-overlay">
              <span className={"cb-carousel-tipo " + (p.tipo === "ANTICIPADO" ? "anticipado" : p.tipo === "TODOS" ? "todos" : "")}>
                {p.tipo === "ANTICIPADO" ? "Premio anticipado" : p.tipo === "TODOS" ? "Todos los premios" : "Premio mayor"}
              </span>
              <h3 className="cb-carousel-nombre">{p.nombre}</h3>
              <p className="cb-carousel-desc">{p.descripcion}</p>
              <p className="cb-carousel-fecha">Sorteo: {p.fecha}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        className="cb-carousel-arrow prev"
        onClick={() => go(-1)}
        disabled={idx === 0}
        aria-label="Anterior"
      >
        <CompIcon name="arrowLeft" size={20} />
      </button>
      <button
        className="cb-carousel-arrow next"
        onClick={() => go(1)}
        disabled={idx === total - 1}
        aria-label="Siguiente"
      >
        <CompIcon name="arrowRight" size={20} />
      </button>

      <div className="cb-carousel-dots">
        {premios.map((_, i) => (
          <button
            key={i}
            className={"cb-carousel-dot" + (i === idx ? " active" : "")}
            onClick={() => setIdx(i)}
            aria-label={`Ir al premio ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Countdown ───
function Countdown({ fechaObjetivo }) {
  const [now, setNow] = useS(Date.now());
  useE(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(fechaObjetivo).getTime();
  const diff = Math.max(0, target - now);
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  const horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const segs = Math.floor((diff / 1000) % 60);
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="cb-countdown">
      <p className="cb-countdown-label">Faltan para el premio mayor</p>
      <div className="cb-countdown-grid">
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(dias)}</span>
          <span className="cb-countdown-unit">Días</span>
        </div>
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(horas)}</span>
          <span className="cb-countdown-unit">Horas</span>
        </div>
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(mins)}</span>
          <span className="cb-countdown-unit">Min</span>
        </div>
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(segs)}</span>
          <span className="cb-countdown-unit">Seg</span>
        </div>
      </div>
    </div>
  );
}

// ─── Disponibilidad ───
function Disponibilidad({ rifa }) {
  const pct = Math.min(100, Math.round((rifa.vendidas / rifa.totalBoletas) * 100));
  const restantes = rifa.totalBoletas - rifa.vendidas;
  return (
    <div className="cb-disponibilidad">
      <div className="cb-disp-row">
        <span className="cb-disp-label">Disponibilidad</span>
        <span className="cb-disp-num">
          {restantes.toLocaleString("es-CO")} / {rifa.totalBoletas.toLocaleString("es-CO")}
        </span>
      </div>
      <div className="cb-disp-bar">
        <div className="cb-disp-fill" style={{ width: pct + "%" }} />
      </div>
      <p className="cb-disp-percent">{pct}% vendido · quedan {restantes.toLocaleString("es-CO")} boletas</p>
    </div>
  );
}

// ─── FAQ Item ───
function FAQItem({ q, children }) {
  const [open, setOpen] = useS(false);
  return (
    <div className={"cb-faq-item" + (open ? " open" : "")}>
      <button className="cb-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className="cb-faq-icon">
          <CompIcon name={open ? "minus" : "plus"} size={16} />
        </span>
      </button>
      {open && <div className="cb-faq-a">{children}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  PASO 1 — Escoger números
// ═════════════════════════════════════════════════════════
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
          type="text"
          inputMode="numeric"
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

  const tipoDocLabel = (window.TIPOS_DOCUMENTO || []).find(t => t.code === datos.tipoDoc)?.code || datos.tipoDoc;

  const waMsg = encodeURIComponent(
    `Hola, quiero apartar mi boleta de *${rifa.nombre}*.

*Datos del titular*
• Nombre: ${datos.nombre} ${datos.apellido}
• ${tipoDocLabel}: ${datos.cedula}
• Celular: ${datos.pais.code} ${datos.celular}
• Ciudad: ${datos.ciudad}

*Boleta(s) escogida(s):* N° ${seleccionadas.join(", N° ")}
*Valor total:* ${window.formatCOP(total)}

Por favor envíenme la información para realizar el pago. ¡Gracias!`
  );
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waMsg}`;

  return (
    <React.Fragment>
      <div className="cb-intro">
        <p className="cb-intro-eyebrow">Paso 3 de 3</p>
        <h1 className="cb-intro-titulo">Confirme su compra</h1>
        <p className="cb-intro-mensaje">
          Revise sus datos. Al reclamar la boleta por WhatsApp, la apartaremos a su nombre y le enviaremos la boleta digital con los datos para el pago.
        </p>
      </div>

      {/* Resumen del pedido */}
      <div className="cb-resumen-card">
        <p className="cb-resumen-eyebrow">Su pedido</p>
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
          <span className="label">Ciudad</span>
          <span className="value">{datos.ciudad}</span>
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
          <span className="label">Valor total</span>
          <span className="value">{window.formatCOP(total)}</span>
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
        <a
          className="cb-btn-primary cb-btn-wa"
          href={waLink}
          target="_blank"
          rel="noopener"
          onClick={() => { if (onReservar) onReservar(); }}
        >
          <CompIcon name="wa" size={20} color="currentColor" />
          Reclamar mi boleta por WhatsApp
        </a>
        <p className="cb-confirm-tagline">
          Le respondemos en pocos minutos en horario hábil.
        </p>
      </div>

      {/* Anti-estafa */}
      <div className="cb-secure-note">
        <CompIcon name="shield" size={18} />
        <span>
          <strong>LOS PLATA S.A.S.</strong> nunca le pedirá su clave o tarjeta por WhatsApp. Solo pague en la cuenta oficial Bancolombia <strong>706-000025-93</strong>.
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

  const waMsg = encodeURIComponent(
    `Hola, ya solicité apartar mi boleta de *${rifa.nombre}*.

*Datos del titular*
• Nombre: ${datos.nombre} ${datos.apellido}
• ${tipoDocLabel}: ${datos.cedula}
• Celular: ${datos.pais.code} ${datos.celular}
• Ciudad: ${datos.ciudad}

*Boleta(s):* N° ${seleccionadas.join(", N° ")}
*Valor total:* ${window.formatCOP(total)}

Quisiera continuar con el pago. ¡Gracias!`
  );
  const waLink = `https://wa.me/${WA_NUMBER}?text=${waMsg}`;

  return (
    <React.Fragment>
      <div className="cb-exito">
        <div className="cb-exito-icon cb-exito-icon-3d">
          <img src="assets/icon-3d-tick.png" alt="" />
        </div>
        <h1 className="cb-exito-titulo">¡Su boleta está apartada!</h1>
        <p className="cb-exito-msg">
          Apartamos {seleccionadas.length === 1 ? "su número" : "sus números"} a su nombre por <strong>24 horas</strong>. La conversación continúa en WhatsApp: ahí le enviamos los datos de la cuenta para el pago y, una vez confirmado, su boleta digital.
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
      >
        <CompIcon name="wa" size={20} color="currentColor" />
        Volver a abrir WhatsApp
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

