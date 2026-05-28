// ver-house-app.jsx — Buscador "Ver mi boleta" para Casa Santa Teresita
// Tras encontrar la(s) boleta(s) del cliente, redirige a /boleta/[numero]?telefono=...
// La vista detallada vive en /boleta/[numero] (boleta.html) — única boleta del sistema.

const { useState: useStateVerH, useEffect: useEffectVerH } = React;

function VerHouseApp() {
  const [step, setStep] = useStateVerH("buscar"); // 'buscar' | 'lista'
  const [menuOpen, setMenuOpen] = useStateVerH(false);
  const [pais, setPais] = useStateVerH(window.PAISES[0]);
  const [telefono, setTelefono] = useStateVerH("");
  const [cliente, setCliente] = useStateVerH(null);
  const [error, setError] = useStateVerH(null);
  const [loading, setLoading] = useStateVerH(false);

  // Compatibilidad con links viejos: si llega con ?telefono=X&boleta=Y desde el
  // flujo antiguo, redirigimos directo a /boleta/Y?telefono=X y no mostramos nada.
  const [inicializando, setInicializando] = useStateVerH(() => {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.has("telefono") && p.has("boleta");
  });

  // Helper: navega a /boleta/[numero] con telefono como query param.
  const irABoletaUnica = (numero, telCompleto) => {
    const num = String(numero).padStart(4, "0");
    const tel = String(telCompleto).replace(/\D/g, "");
    window.location.href = `/boleta/${num}?telefono=${encodeURIComponent(tel)}`;
  };

  const buscar = async (opts) => {
    if (loading) return;
    const paisUsar = (opts && opts.pais) || pais;
    const telUsar = (opts && opts.telefono) || telefono;
    setError(null);
    setLoading(true);
    try {
      const numeroCompleto = (paisUsar.code || "").replace(/\+/g, "") + telUsar;
      const res = await fetch("/api/abonar/cliente?telefono=" + encodeURIComponent(numeroCompleto));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data.encontrado || !Array.isArray(data.boletas) || data.boletas.length === 0) {
        setError(`No encontramos boletas registradas con el número ${paisUsar.code} ${telUsar}. Verifica el número o escríbenos por WhatsApp.`);
        setLoading(false);
        return;
      }
      // Una sola boleta → redirigir directo a /boleta/[num]
      if (data.boletas.length === 1) {
        irABoletaUnica(data.boletas[0].numero, numeroCompleto);
        return; // No bajamos loading: la página se va a recargar
      }
      // Varias boletas → mostrar lista
      setCliente({
        nombre: data.nombre || "Cliente",
        apellido: data.apellido || "",
        ciudad: data.ciudad || "",
        telefonoCompleto: numeroCompleto,
        boletas: data.boletas,
      });
      setStep("lista");
    } catch (e) {
      console.error("[ver-boleta buscar]", e);
      setError("No pudimos consultar tu boleta en este momento. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  // Compatibilidad: links viejos con ?telefono=X&boleta=Y → redirige a /boleta/Y?telefono=X
  useEffectVerH(() => {
    const p = new URLSearchParams(window.location.search);
    const telParam = p.get("telefono");
    const boletaParam = p.get("boleta");
    if (telParam && boletaParam) {
      irABoletaUnica(boletaParam, telParam);
      return;
    }
    setInicializando(false);
  }, []);

  const volverAtras = () => {
    if (step === "buscar") {
      window.location.href = "/";
      return;
    }
    if (step === "lista") {
      setStep("buscar");
      return;
    }
  };

  const titulo = step === "lista" ? "Mis boletas" : "Ver mi boleta";

  if (inicializando) {
    return React.createElement("div", {
      style: {
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--cream-50, #FAFAF7)", color: "var(--ink-mute, #6E6E6E)",
        fontFamily: "Inter, sans-serif", fontSize: 16, padding: 20, textAlign: "center",
      }
    }, "Abriendo tu boleta...");
  }

  return (
    <React.Fragment>
      <div className="abonar">
        <div className="ab-topbar">
          <button className="ab-back" onClick={volverAtras} aria-label="Volver">
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
            <StepBuscarVerH
              pais={pais} setPais={setPais}
              telefono={telefono} setTelefono={setTelefono}
              error={error} loading={loading} onContinuar={buscar}
            />
          )}
          {step === "lista" && cliente && (
            <StepListaVerH cliente={cliente} onElegir={(boleta) => irABoletaUnica(boleta.numero, cliente.telefonoCompleto)} />
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

function StepBuscarVerH({ pais, setPais, telefono, setTelefono, error, loading, onContinuar }) {
  const [openSheet, setOpenSheet] = useStateVerH(false);
  const maxLen = pais.digits;
  const valid = telefono.length === maxLen && !loading;

  const onChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, maxLen);
    setTelefono(digits);
  };

  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Consultar boleta</p>
        <h1 className="ab-titulo">Encontremos tu boleta</h1>
      </div>
      <div className="ab-aviso">
        <div className="ab-aviso-icon"><AbIcon name="info" size={20} /></div>
        <div>
          <p className="ab-aviso-t">Importante</p>
          <p className="ab-aviso-d">Usa el número con el que compraste.</p>
        </div>
      </div>
      <form className="ab-form" onSubmit={(e) => { e.preventDefault(); if (valid) onContinuar(); }}>
        <div>
          <label className="ab-label" htmlFor="vbh-tel">¿Cuál es tu número de teléfono?</label>
          <div className="ab-phone-group">
            <button type="button" className="ab-country-btn" onClick={() => setOpenSheet(true)}
                    aria-label={`País: ${pais.name}, código ${pais.code}`}>
              <span className="ab-flag">{pais.flag}</span>
              <span className="ab-country-code">{pais.code}</span>
              <span className="ab-chevron"><AbIcon name="chevronDown" size={14} /></span>
            </button>
            <input id="vbh-tel" type="tel" inputMode="numeric" autoComplete="tel-national"
                   className="ab-phone-input" value={telefono} onChange={onChange}
                   placeholder={"0".repeat(maxLen)} maxLength={maxLen}/>
          </div>
          <p className="ab-help">{pais.iso === "CO" ? "Ejemplo: 3107334957" : `Ingresa los ${maxLen} dígitos de tu número en ${pais.name}.`}</p>
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
              <h3 className="vb-comprar-titulo">Compra la tuya y participa por Casa Santa Teresita</h3>
              <p className="vb-comprar-desc">
                Sorteo el <strong>4 de julio de 2026</strong> con la Lotería de Boyacá. Cada boleta vale $150.000 y puedes abonar desde $20.000.
              </p>
              <a href="/comprar-la-plata-house" className="ab-btn-primary ab-btn-mint vb-comprar-cta">
                Comprar mi boleta<span style={{ marginLeft: 4 }}>→</span>
              </a>
              <a href="https://wa.me/573107334957?text=Hola%2C%20quiero%20comprar%20una%20boleta%20de%20Casa%20Santa%20Teresita"
                 target="_blank" rel="noreferrer" className="vb-comprar-wa">
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
  const [filtro, setFiltro] = useStateVerH("");
  const lista = window.PAISES.filter((p) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.includes(q);
  });
  return (
    <div className="ab-sheet-backdrop" onClick={onClose}>
      <div className="ab-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ab-sheet-handle"></div>
        <div className="ab-sheet-header">
          <h2 className="ab-sheet-title">Selecciona tu país</h2>
          <input className="ab-sheet-search" placeholder="Buscar país..."
                 value={filtro} onChange={(e) => setFiltro(e.target.value)} autoFocus />
        </div>
        <div className="ab-sheet-list">
          {lista.map((p) => (
            <button key={p.iso}
                    className={"ab-sheet-item" + (p.iso === paisActual.iso ? " selected" : "")}
                    onClick={() => onSelect(p)}>
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

function StepListaVerH({ cliente, onElegir }) {
  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Tus boletas</p>
        <h1 className="ab-titulo">¡Hola, {cliente.nombre}!</h1>
        <p className="ab-mensaje">
          Tienes <strong>{cliente.boletas.length} boletas</strong> registradas. Toca la que quieres ver.
        </p>
      </div>
      <div className="ab-cliente-card">
        <p className="ab-cliente-eyebrow">Cliente</p>
        <p className="ab-cliente-nombre">{cliente.nombre} {cliente.apellido}</p>
        {cliente.ciudad && (
          <p className="ab-cliente-ciudad">
            <AbIcon name="pin" size={14} /> {cliente.ciudad}
          </p>
        )}
      </div>
      <h2 className="ab-section-titulo">Selecciona una boleta</h2>
      {cliente.boletas.map((b) => {
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
              <button type="button" className="vb-li-btn" onClick={() => onElegir(b)}>
                Ver mi boleta <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        );
      })}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(VerHouseApp, null));
