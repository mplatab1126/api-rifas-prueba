// ver-house-app.jsx — Flujo "Ver mi boleta" para La Plata House
// Estructura idéntica al de La Perla Roja; cambia la rifa, los premios y las fotos.

const { useState: useStateVerH } = React;

function VerHouseApp() {
  const [step, setStep] = useStateVerH("buscar"); // 'buscar' | 'lista' | 'detalle'
  const [menuOpen, setMenuOpen] = useStateVerH(false);
  const [pais, setPais] = useStateVerH(window.PAISES[0]);
  const [telefono, setTelefono] = useStateVerH("");
  const [cliente, setCliente] = useStateVerH(null);
  const [boletaActiva, setBoletaActiva] = useStateVerH(null);
  const [error, setError] = useStateVerH(null);
  const [loading, setLoading] = useStateVerH(false);

  const buscar = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const indicativo = (pais.code || "").replace(/\+/g, "");
      const numeroCompleto = indicativo + telefono;
      const res = await fetch("/api/abonar/cliente?telefono=" + encodeURIComponent(numeroCompleto));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();

      if (!data.encontrado || !Array.isArray(data.boletas) || data.boletas.length === 0) {
        setError(`No encontramos boletas registradas con el número ${pais.code} ${telefono}. Verifica el número o escríbenos por WhatsApp.`);
        setLoading(false);
        return;
      }

      const found = {
        nombre: data.nombre || "Cliente",
        apellido: data.apellido || "",
        ciudad: data.ciudad || "",
        telefono: data.telefono ? `${pais.code} ${String(data.telefono).replace(/\D/g, "").slice(-10)}` : `${pais.code} ${telefono}`,
        documento: (data.documento_tipo || data.documento_numero)
          ? { tipo: data.documento_tipo || "CC", numero: data.documento_numero || "—" }
          : null,
        boletas: data.boletas
      };

      setCliente(found);
      if (found.boletas.length === 1) {
        setBoletaActiva(found.boletas[0]);
        setStep("detalle");
      } else {
        setStep("lista");
      }
    } catch (err) {
      console.error("[ver-boleta buscar]", err);
      setError("No pudimos consultar tu boleta en este momento. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step === "buscar") { window.location.href = "/"; return; }
    if (step === "lista") { setStep("buscar"); return; }
    if (step === "detalle") {
      if (cliente && cliente.boletas.length > 1) setStep("lista");
      else setStep("buscar");
      return;
    }
  };

  const titulo = step === "detalle" && boletaActiva
    ? `Boleta N° ${boletaActiva.numero}`
    : step === "lista" ? "Mis boletas" : "Ver mi boleta";

  return (
    <React.Fragment>
      <div className="abonar">
        <div className="ab-topbar">
          <button className="ab-back" onClick={handleBack} aria-label="Volver">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <h1 className="ab-topbar-title">{titulo}</h1>
          <HamburgerBtn onClick={() => setMenuOpen(true)} />
        </div>
        <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div className="ab-content">
          {step === "buscar" && (
            <StepBuscarVerH pais={pais} setPais={setPais}
              telefono={telefono} setTelefono={setTelefono}
              error={error} loading={loading} onContinuar={buscar} />
          )}
          {step === "lista" && cliente && (
            <StepListaVerH cliente={cliente}
              onElegir={(b) => { setBoletaActiva(b); setStep("detalle"); }} />
          )}
          {step === "detalle" && boletaActiva && cliente && (
            <BoletaDetalleHouse cliente={cliente} boleta={boletaActiva} />
          )}
        </div>
      </div>
      <a href="https://wa.me/573107334957" className="float-wa-ab" target="_blank" rel="noreferrer" aria-label="WhatsApp">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.1 15 3.7 13.5 3.7 12c0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.2-8.3 8.2z"/>
          <path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6 0-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4-.1-.2-.3-.2-.6-.4z"/>
        </svg>
      </a>
    </React.Fragment>
  );
}

// ─── Paso 1: Buscar ─────────────────────────────────────────────
function StepBuscarVerH({ pais, setPais, telefono, setTelefono, error, loading, onContinuar }) {
  const [openSheet, setOpenSheet] = useStateVerH(false);
  const maxLen = pais.digits;
  const valid = telefono.length === maxLen && !loading;

  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, maxLen);
    setTelefono(digits);
  };

  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Consultar boleta</p>
        <h1 className="ab-titulo">Encontremos tu boleta</h1>
        <p className="ab-mensaje">
          Te mostraremos tu boleta de la rifa <strong>La Plata House</strong>.
        </p>
      </div>

      <div className="ab-aviso">
        <div className="ab-aviso-icon">
          <AbIcon name="info" size={20} />
        </div>
        <div>
          <p className="ab-aviso-t">Importante</p>
          <p className="ab-aviso-d">
            Usa el mismo número de teléfono con el que compraste tu boleta.
          </p>
        </div>
      </div>

      <form className="ab-form" onSubmit={(e) => { e.preventDefault(); if (valid) onContinuar(); }}>
        <div>
          <label className="ab-label" htmlFor="vbh-tel">¿Cuál es tu número de teléfono?</label>
          <div className="ab-phone-group">
            <button
              type="button"
              className="ab-country-btn"
              onClick={() => setOpenSheet(true)}
              aria-label={`País: ${pais.name}, código ${pais.code}`}
            >
              <span className="ab-flag">{pais.flag}</span>
              <span className="ab-country-code">{pais.code}</span>
              <span className="ab-chevron">
                <AbIcon name="chevronDown" size={14} />
              </span>
            </button>
            <input
              id="vbh-tel"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              className="ab-phone-input"
              value={telefono}
              onChange={handlePhoneChange}
              placeholder={"0".repeat(maxLen)}
              maxLength={maxLen}
            />
          </div>
          <p className="ab-help">
            {pais.iso === "CO"
              ? "Sin el 57 al inicio. Ejemplo: 3107334957"
              : `Ingresa los ${maxLen} dígitos de tu número en ${pais.name}.`}
          </p>
        </div>

        {error && (
          <React.Fragment>
            <div className="ab-aviso" style={{ background: "#7A1F1F", marginBottom: 0 }}>
              <div className="ab-aviso-icon" style={{ background: "white", color: "#7A1F1F" }}>
                <AbIcon name="alert" size={20} />
              </div>
              <div>
                <p className="ab-aviso-t" style={{ color: "white" }}>No encontramos tu número</p>
                <p className="ab-aviso-d">{error}</p>
              </div>
            </div>

            <div className="vb-comprar-card">
              <p className="vb-comprar-eyebrow">¿Aún no tienes boleta?</p>
              <h3 className="vb-comprar-titulo">Compra la tuya y participa por La Plata House</h3>
              <p className="vb-comprar-desc">Sorteo el <strong>4 de julio de 2026</strong> con la Lotería de Boyacá. Cada boleta vale $150.000 y puedes abonar desde $20.000.</p>
              <a href="/comprar-la-plata-house" className="ab-btn-primary ab-btn-mint vb-comprar-cta">
                Comprar mi boleta
                <span style={{ marginLeft: 4 }}>→</span>
              </a>
              <a href="https://wa.me/573107334957?text=Hola%2C%20quiero%20comprar%20una%20boleta%20de%20La%20Plata%20House" target="_blank" rel="noreferrer" className="vb-comprar-wa">
                O escríbenos por WhatsApp
              </a>
            </div>
          </React.Fragment>
        )}

        <button type="submit" className="ab-btn-primary" disabled={!valid}>
          {loading ? "Consultando..." : "Ver mi boleta"}
          {!loading && <span style={{ marginLeft: 4 }}>→</span>}
        </button>
      </form>

      {openSheet && (
        <CountrySheetVerH
          paisActual={pais}
          onSelect={(p) => { setPais(p); setTelefono(""); setOpenSheet(false); }}
          onClose={() => setOpenSheet(false)}
        />
      )}
    </React.Fragment>
  );
}

function CountrySheetVerH({ paisActual, onSelect, onClose }) {
  const [q, setQ] = useStateVerH("");
  const filtered = window.PAISES.filter(p => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return p.name.toLowerCase().includes(t) || p.code.includes(t);
  });
  return (
    <div className="ab-sheet-backdrop" onClick={onClose}>
      <div className="ab-sheet" onClick={e => e.stopPropagation()}>
        <div className="ab-sheet-handle"></div>
        <div className="ab-sheet-header">
          <h2 className="ab-sheet-title">Selecciona tu país</h2>
          <input className="ab-sheet-search" placeholder="Buscar país..." value={q} onChange={e => setQ(e.target.value)} autoFocus />
        </div>
        <div className="ab-sheet-list">
          {filtered.map(p => (
            <button key={p.iso} className={"ab-sheet-item" + (p.iso === paisActual.iso ? " selected" : "")} onClick={() => onSelect(p)}>
              <span className="ab-flag">{p.flag}</span>
              <span className="ab-sheet-item-name">{p.name}</span>
              <span className="ab-sheet-item-code">{p.code}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Lista (cuando hay varias boletas) ─────────────────────────
function StepListaVerH({ cliente, onElegir }) {
  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Tus boletas</p>
        <h1 className="ab-titulo">¡Hola, {cliente.nombre}!</h1>
        <p className="ab-mensaje">Tienes <strong>{cliente.boletas.length} boletas</strong> registradas. Toca la que quieres ver.</p>
      </div>

      <div className="ab-cliente-card">
        <p className="ab-cliente-eyebrow">Cliente</p>
        <p className="ab-cliente-nombre">{cliente.nombre} {cliente.apellido}</p>
        <p className="ab-cliente-ciudad">
          <AbIcon name="pin" size={14} /> {cliente.ciudad}
        </p>
      </div>

      <h2 className="ab-section-titulo">Selecciona una boleta</h2>
      {cliente.boletas.map(b => {
        const pagada = b.saldoPendiente === 0;
        return (
          <div key={b.numero} className="ab-boleta pendiente" role="group">
            <div className="ab-boleta-content">
              <div className="ab-boleta-row1">
                <div>
                  <span className="ab-boleta-numero-prefix">Boleta</span>
                  <span className="ab-boleta-numero">N° {b.numero}</span>
                </div>
                <span className={"ab-boleta-status " + (pagada ? "paga" : "pendiente")}>
                  {pagada ? "Pagada" : "Pendiente"}
                </span>
              </div>
              <div className="ab-boleta-amounts">
                <div className="ab-amount-block">
                  <span className="ab-amount-label">Total abonado</span>
                  <span className="ab-amount-value">{window.formatCOP(b.totalAbonado)}</span>
                </div>
                <div className="ab-amount-block">
                  <span className="ab-amount-label">Saldo pendiente</span>
                  <span className="ab-amount-value">{window.formatCOP(b.saldoPendiente)}</span>
                </div>
              </div>
              <button
                type="button"
                className="vb-li-btn"
                onClick={() => onElegir(b)}
              >
                Ver mi boleta <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        );
      })}
    </React.Fragment>
  );
}

// ─── Carrusel del hero (boleta) ───────────────────────────────
function VbHeroCarousel({ items }) {
  const [idx, setIdx] = useStateVerH(0);
  const startX = React.useRef(null);
  const total = items.length;

  const go = (dir) => setIdx(prev => (prev + dir + total) % total);

  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

  if (total === 0) return null;

  return (
    <div className="vb-carousel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="vb-carousel-track">
        {items.map((it, i) => (
          <div className={"vb-carousel-slide" + (i === idx ? " active" : "")} key={i}>
            <img src={it.url} alt={it.titulo}
                 loading={i === 0 ? "eager" : "lazy"}
                 onError={(e) => { e.target.style.display='none'; }} />
            {it.titulo && <span className="vb-carousel-cap">{it.titulo}</span>}
          </div>
        ))}
      </div>

      {total > 1 && (
        <React.Fragment>
          <button type="button" className="vb-carousel-arrow prev" onClick={() => go(-1)} aria-label="Foto anterior">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <button type="button" className="vb-carousel-arrow next" onClick={() => go(1)} aria-label="Foto siguiente">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>

          <div className="vb-carousel-counter">{idx + 1} / {total}</div>

          <div className="vb-carousel-dots">
            {items.map((_, i) => (
              <button
                type="button"
                key={i}
                className={"vb-carousel-dot" + (i === idx ? " active" : "")}
                onClick={() => setIdx(i)}
                aria-label={`Ir a la foto ${i + 1}`}
              />
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

// ─── Boleta detalle (La Plata House) ──────────────────────────
function BoletaDetalleHouse({ cliente, boleta }) {
  const pagada = boleta.saldoPendiente === 0;
  const doc = cliente.documento || { tipo: "CC", numero: "—" };

  return (
    <React.Fragment>
      <div className="vb-detalle">
        {/* Hero */}
        <div className="vb-hero-head">
          <h1 className="vb-hero-titulo">{boleta.rifa}</h1>
          <p className="vb-hero-sub">Boleta número {boleta.numero}</p>
        </div>
        <div className="vb-hero-img">
          <VbHeroCarousel items={window.HOUSE_GALERIA || [{ url: window.HOUSE_HERO_IMG, titulo: "La Plata House" }]} />
        </div>

        {/* Titular */}
        <h2 className="ab-section-titulo vb-sec-icon">
          <img src="assets/icon-3d-document.png" alt="" />
          Titular de la boleta
        </h2>
        <div className="ab-cliente-card">
          <div className="vb-grid">
            <div>
              <p className="vb-grid-label">Nombre</p>
              <p className="vb-grid-val">{cliente.nombre} {cliente.apellido}</p>
            </div>
            <div>
              <p className="vb-grid-label">{doc.tipo}</p>
              <p className="vb-grid-val">{doc.numero}</p>
            </div>
            <div>
              <p className="vb-grid-label">Celular</p>
              <p className="vb-grid-val">{cliente.telefono}</p>
            </div>
            <div>
              <p className="vb-grid-label">Ciudad</p>
              <p className="vb-grid-val">{cliente.ciudad}</p>
            </div>
            <div>
              <p className="vb-grid-label">Sorteo</p>
              <p className="vb-grid-val">Lotería de Boyacá</p>
            </div>
            <div>
              <p className="vb-grid-label">Ubicación de la casa</p>
              <p className="vb-grid-val">Chinchiná, Caldas</p>
            </div>
          </div>
        </div>

        {/* Estado de pago */}
        <h2 className="ab-section-titulo vb-sec-icon">
          <img src="assets/icon-3d-calculator.png" alt="" />
          Estado de pago
        </h2>
        <div className="ab-cliente-card">
          <div className="ab-boleta-amounts" style={{ marginTop: 6 }}>
            <div className="ab-amount-block">
              <span className="ab-amount-label">Total abonado</span>
              <span className="ab-amount-value">{window.formatCOP(boleta.totalAbonado)}</span>
            </div>
            <div className="ab-amount-block">
              <span className="ab-amount-label">{pagada ? "Estado" : "Saldo pendiente"}</span>
              <span className="ab-amount-value">{pagada ? "Pagada ✓" : window.formatCOP(boleta.saldoPendiente)}</span>
            </div>
          </div>
          {pagada && (
            <p className="ab-boleta-paga-msg">
              Esta boleta está <strong>totalmente pagada</strong>. ¡Mucha suerte en el sorteo!
            </p>
          )}

          {boleta.historial && boleta.historial.length > 0 ? (
            <details className="vb-historial">
              <summary className="vb-historial-summary">
                <span>Ver abonos realizados <span className="vb-historial-count">({boleta.historial.length})</span></span>
                <svg className="vb-historial-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </summary>
              <ul className="vb-historial-list">
                {boleta.historial.map((h, i) => (
                  <li key={i} className="vb-historial-item">
                    <span className="vb-historial-fecha">{h.fecha}</span>
                    <span className="vb-historial-monto">{window.formatCOP(h.monto)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="vb-historial-empty">Aún no hay abonos registrados para esta boleta.</p>
          )}
        </div>

        {/* Premios */}
        <h2 className="ab-section-titulo vb-sec-icon">
          <img src="assets/icon-3d-gift.png" alt="" />
          Premios
        </h2>
        <div className="ab-cliente-card">
          <div className="vb-premio">
            <p className="vb-premio-fecha">Premio Mayor — Sábado 4 de julio de 2026</p>
            <p className="vb-premio-titulo">La Plata House</p>
            <p className="vb-premio-desc">Casa de dos plantas en el barrio Santa Teresita, Chinchiná, Caldas.</p>
            <p className="vb-premio-bonus">Si no la quiere, le compramos la casa por <strong>$300.000.000 en efectivo</strong>.</p>
          </div>
          <div className="vb-divider"></div>
          <div className="vb-premio">
            <p className="vb-premio-fecha">El Sueldazo — Miércoles 3 de junio de 2026</p>
            <p className="vb-premio-titulo">$1.500.000 al mes · 6 meses</p>
            <p className="vb-premio-desc">Un único ganador recibe un millón y medio de pesos cada mes durante medio año. Total: <strong>$9.000.000</strong>.</p>
          </div>
          <div className="vb-divider"></div>
          <div className="vb-premio">
            <p className="vb-premio-fecha">Premios semanales — 7 sábados antes del sorteo</p>
            <p className="vb-premio-titulo">$5.000.000 cada sábado</p>
            <p className="vb-premio-desc">Si abonas mínimo $20.000 esa semana, juegas por cinco millones con la Lotería de Boyacá.</p>
          </div>
        </div>

        {/* Condiciones */}
        <h2 className="ab-section-titulo vb-sec-icon">
          <img src="assets/icon-3d-shield.png" alt="" />
          Condiciones para ganar
        </h2>
        <div className="ab-cliente-card">
          <p className="vb-cond"><strong>Premio Mayor — La casa (4 de julio):</strong> tu boleta debe estar 100% pagada ($150.000) al momento del sorteo.</p>
          <div className="vb-divider"></div>
          <p className="vb-cond"><strong>El Sueldazo (3 de junio):</strong> haber abonado mínimo $50.000 antes de esa fecha.</p>
          <div className="vb-divider"></div>
          <p className="vb-cond"><strong>Premios semanales ($5M):</strong> abonar mínimo $20.000 en la semana del sorteo correspondiente.</p>
          <div className="vb-divider"></div>
          <p className="vb-cond">Todos los sorteos juegan con la <strong>Lotería de Boyacá</strong> (últimas 4 cifras del resultado oficial).</p>
        </div>

        {/* Términos y condiciones */}
        <h2 className="ab-section-titulo vb-sec-icon">
          <img src="assets/icon-3d-lock.png" alt="" />
          Términos y condiciones
        </h2>
        <details className="vb-terminos">
          <summary className="vb-terminos-summary">
            <span>Ver cláusulas de la rifa</span>
            <svg className="vb-terminos-chevron" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </summary>
          <div className="vb-terminos-body">
            <div className="vb-clausula">
              <p className="vb-clausula-num">1. Organizador</p>
              <p>La rifa es organizada por <strong>LOS PLATA S.A.S.</strong>, NIT 902.003.134-4, sociedad domiciliada en Colombia y registrada ante la Cámara de Comercio. La marca LOS PLATA está registrada ante la Superintendencia de Industria y Comercio (SIC).</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">2. Marco legal y autorización</p>
              <p>Cada sorteo se realiza al amparo de la <strong>resolución de autorización expedida por EDSA</strong> para la edición correspondiente, en cumplimiento de la <strong>Ley 643 de 2001</strong>. La resolución vigente puede consultarse en la página oficial de EDSA, lo que evidencia la legalidad de la rifa.</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">3. Premios</p>
              <ul>
                <li><strong>Premio Mayor — La Plata House:</strong> casa de dos plantas en el barrio Santa Teresita, Chinchiná, Caldas. Sorteo: sábado 4 de julio de 2026.</li>
                <li><strong>El Sueldazo:</strong> $1.500.000 mensuales durante seis (6) meses para un único ganador. Sorteo: miércoles 3 de junio de 2026.</li>
                <li><strong>Premios semanales:</strong> $5.000.000 a un único abonado cada uno de los siete sábados previos al sorteo mayor.</li>
              </ul>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">4. Sorteo</p>
              <p>Los sorteos se realizan con la lotería oficial correspondiente a cada premio:</p>
              <ul>
                <li><strong>Premio Mayor (La Plata House) y premios semanales ($5M):</strong> juegan con la <strong>Lotería de Boyacá</strong>.</li>
                <li><strong>El Sueldazo:</strong> juega con la <strong>Lotería de Manizales</strong> el miércoles correspondiente.</li>
              </ul>
              <p>En todos los casos, el número ganador corresponde a las <strong>últimas 4 cifras</strong> del resultado oficial publicado en la fecha del sorteo.</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">5. Condiciones para ganar</p>
              <ul>
                <li><strong>Premios semanales:</strong> el cliente debe haber abonado mínimo $20.000 antes de la fecha del sorteo correspondiente.</li>
                <li><strong>El Sueldazo (3 de junio):</strong> el cliente debe haber abonado mínimo $50.000 antes de esa fecha.</li>
                <li><strong>Premio Mayor (La Plata House):</strong> la boleta debe estar 100% pagada ($150.000) al momento del sorteo.</li>
              </ul>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">6. Vendedores autorizados y pagos oficiales</p>
              <p><strong>LOS PLATA S.A.S.</strong> únicamente se hace responsable de las boletas vendidas por sus <strong>vendedores autorizados</strong> y de los pagos realizados a la cuenta oficial: <strong>Bancolombia Ahorros 706-000025-93</strong>.</p>
              <p>Puede consultar la lista actualizada de vendedores autorizados y canales de venta en <a href="/canales-oficiales" className="vb-link">Canales oficiales</a>. No realice pagos a cuentas personales ni compre boletas a personas no listadas en esa página; LOS PLATA no responde por transacciones realizadas por fuera de los canales oficiales.</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">7. Entrega de premios</p>
              <p>El premio se entrega al titular registrado en la boleta ganadora, previa validación de identidad con el documento registrado, y comprobante de pago. La entrega se realiza en Colombia.</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">8. Trámites y obligaciones del premio</p>
              <p>Le entregamos su premio <strong>libre de gravamenes y al día</strong> con las certificaciones de ley vigentes al momento de la entrega. Como ocurre con cualquier bien que cambia de dueño en Colombia, los <strong>trámites para ponerlo a su nombre y los impuestos correspondientes los asume el ganador</strong>. Esto incluye, según el tipo de premio:</p>
              <ul>
                <li>La <strong>ganancia ocasional</strong> ante la DIAN, aplicable por ley a los premios de rifas.</li>
                <li>Para <strong>vehículos:</strong> los entregamos con <strong>SOAT y revisión tecnomecánica al día</strong>. El ganador asume el <strong>traspaso, RUNT, impuesto de rodamiento</strong> y demás gastos de registro.</li>
                <li>Para la <strong>casa:</strong> el ganador asume la <strong>escrituración, gastos notariales y registro</strong> ante la Oficina de Instrumentos Públicos.</li>
              </ul>
              <p>Lo acompañamos en cada paso para que el proceso sea claro y sencillo.</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">9. Plazo para reclamar el premio</p>
              <p>El ganador cuenta con <strong>30 días hábiles</strong> desde la fecha del sorteo para contactarnos por los canales oficiales y reclamar su premio. Pasado ese término sin justa causa, el premio podrá ser declarado desierto o reasignado conforme a las normas vigentes.</p>
            </div>
            <div className="vb-clausula">
              <p className="vb-clausula-num">10. Soporte</p>
              <p>Cualquier consulta debe realizarse por nuestros canales oficiales: WhatsApp +57 310 733 4957 o nuestras redes sociales verificadas.</p>
            </div>
            <p className="vb-terminos-meta">Última actualización: mayo de 2026.</p>
          </div>
        </details>

        {/* Acciones */}
        <div className="vb-actions">
          {!pagada && (
            <a href="/abonar" className="ab-btn-primary ab-btn-mint">
              Abonar a esta boleta →
            </a>
          )}
          <a href={`https://wa.me/573107334957?text=Hola%2C%20mi%20boleta%20de%20La%20Plata%20House%20es%20la%20${boleta.numero}`} target="_blank" rel="noreferrer" className="ab-btn-secondary">
            Compartir por WhatsApp
          </a>
        </div>

        <p className="vb-legal">
          Documento oficial de participación en la rifa "{boleta.rifa}". <strong>LOS PLATA S.A.S.</strong> · NIT 902.003.134-4. Aplican términos y condiciones.
        </p>
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<VerHouseApp />);
