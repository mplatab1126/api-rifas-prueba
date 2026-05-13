// abonar-app.jsx — App principal del flujo Abonar a mi boleta

const { useState: useState_app, useEffect: useEffect_app } = React;

function detectarRetornoWompi() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const enRutaExito = window.location.pathname === '/abonar/exito' || window.location.pathname.startsWith('/abonar/exito');
  if (id && enRutaExito) return id;
  if (id && params.get('env')) return id;
  return null;
}

function AbonarApp() {
  // Paso actual: 'buscar' | 'no-encontrado' | 'boletas' | 'confirmar' | 'exito-pago'
  const wompiTxId = detectarRetornoWompi();
  const [step, setStep] = useState_app(wompiTxId ? "exito-pago" : "buscar");

  // Estado del formulario
  const [pais, setPais] = useState_app(window.PAISES[0]); // Colombia por defecto
  const [telefono, setTelefono] = useState_app("");
  const [error, setError] = useState_app(null);

  // Cliente encontrado
  const [cliente, setCliente] = useState_app(null);

  // Boletas seleccionadas (números)
  const [seleccionadas, setSeleccionadas] = useState_app([]);

  // Monto y opción
  const [monto, setMonto] = useState_app(0);
  const [opcion, setOpcion] = useState_app(null);

  // Cargando búsqueda y pago
  const [buscando, setBuscando] = useState_app(false);
  const [pagando, setPagando] = useState_app(false);

  // Menú lateral (hamburger)
  const [menuOpen, setMenuOpen] = useState_app(false);

  // Datos de transacción Wompi (cuando regresa)
  const [txWompi, setTxWompi] = useState_app(null);
  const [cargandoTx, setCargandoTx] = useState_app(!!wompiTxId);

  // Si venimos de Wompi, consultamos el estado de la transacción
  useEffect_app(() => {
    if (!wompiTxId) return;
    fetch(`/api/abonar/transaccion?id=${encodeURIComponent(wompiTxId)}`)
      .then(r => r.json())
      .then(data => { setTxWompi(data); setCargandoTx(false); })
      .catch(() => { setTxWompi({ error: 'No pudimos consultar el estado del pago.' }); setCargandoTx(false); });
  }, [wompiTxId]);

  // ── Acciones ──
  const buscarBoletas = async () => {
    setError(null);
    setBuscando(true);
    try {
      const r = await fetch(`/api/abonar/cliente?telefono=${encodeURIComponent(telefono)}`);
      const data = await r.json();
      if (!r.ok) {
        setError("Hubo un problema al buscar tus boletas. Intenta de nuevo.");
        setBuscando(false);
        return;
      }
      if (!data.encontrado) {
        setBuscando(false);
        setStep("no-encontrado");
        return;
      }
      setCliente(data);
      const primera = data.boletas.find(b => b.estado === "pendiente");
      if (primera) setSeleccionadas([primera.numero]);
      setBuscando(false);
      setStep("boletas");
    } catch (e) {
      setError("No pudimos conectarnos al sistema. Verifica tu conexión a internet.");
      setBuscando(false);
    }
  };

  const irAConfirmar = () => {
    if (seleccionadas.length === 0) return;
    const total = cliente.boletas
      .filter(b => seleccionadas.includes(b.numero))
      .reduce((s, b) => s + b.saldoPendiente, 0);
    setMonto(total);
    setOpcion("full");
    setStep("confirmar");
  };

  const procesarPago = async () => {
    if (pagando) return;
    setError(null);
    setPagando(true);
    try {
      const r = await fetch('/api/abonar/iniciar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefono: telefono,
          boletas: boletasPagar.map(b => b.numero),
          monto: monto
        })
      });
      const data = await r.json();
      if (!r.ok || !data.url) {
        setError(data.error || 'No pudimos iniciar el pago. Intenta de nuevo.');
        setPagando(false);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setError('No pudimos conectarnos al sistema. Verifica tu conexión a internet.');
      setPagando(false);
    }
  };

  const volverInicio = () => {
    window.location.href = "/";
  };

  // Botón atrás según el paso
  const handleBack = () => {
    if (step === "buscar") {
      window.location.href = "/";
    } else if (step === "no-encontrado") {
      setStep("buscar");
    } else if (step === "boletas") {
      setStep("buscar");
    } else if (step === "confirmar") {
      setStep("boletas");
    } else if (step === "exito" || step === "exito-pago") {
      window.location.href = "/";
    }
  };

  // Boletas a pagar (objetos)
  const boletasPagar = cliente
    ? cliente.boletas.filter(b => seleccionadas.includes(b.numero))
    : [];

  // ── Stepper ──
  const stepNumber =
    step === "buscar" || step === "no-encontrado" ? 1 :
    step === "boletas" ? 2 :
    step === "confirmar" ? 3 : 3;

  return (
    <React.Fragment>
      <div className="abonar">
        {/* Top bar */}
        <div className="ab-topbar">
          <button className="ab-back" onClick={handleBack} aria-label="Volver">
            <AbIcon name="back" size={22} />
          </button>
          <h1 className="ab-topbar-title">Abonar boleta</h1>
          <HamburgerBtn onClick={() => setMenuOpen(true)} />
        </div>
        <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

        {/* Stepper */}
        {step !== "exito" && step !== "exito-pago" && (
          <div className="ab-stepper">
            <div className={"ab-step-dot" + (stepNumber >= 1 ? " active" : "")} />
            <div className={"ab-step-dot" + (stepNumber >= 2 ? " active" : "")} />
            <div className={"ab-step-dot" + (stepNumber >= 3 ? " active" : "")} />
          </div>
        )}

        <div className="ab-content">
          {step === "buscar" && (
            <StepBuscar
              pais={pais}
              setPais={setPais}
              telefono={telefono}
              setTelefono={setTelefono}
              onContinuar={buscarBoletas}
              error={error}
              buscando={buscando}
            />
          )}

          {step === "no-encontrado" && (
            <StepNoEncontrado
              pais={pais}
              telefono={telefono}
              onReintentar={() => setStep("buscar")}
            />
          )}

          {step === "boletas" && cliente && (
            <StepBoletas
              cliente={cliente}
              seleccionadas={seleccionadas}
              setSeleccionadas={setSeleccionadas}
              onContinuar={irAConfirmar}
              onAtras={() => setStep("buscar")}
            />
          )}

          {step === "confirmar" && cliente && (
            <StepConfirmar
              cliente={cliente}
              boletasPagar={boletasPagar}
              monto={monto}
              setMonto={setMonto}
              opcion={opcion}
              setOpcion={setOpcion}
              onPagar={procesarPago}
              onAtras={() => setStep("boletas")}
              pagando={pagando}
              error={error}
            />
          )}

          {step === "exito" && cliente && (
            <StepExito
              cliente={cliente}
              monto={monto}
              boletasPagar={boletasPagar}
              onVolver={volverInicio}
            />
          )}

          {step === "exito-pago" && (
            <StepExitoPago
              cargando={cargandoTx}
              tx={txWompi}
              onVolver={volverInicio}
            />
          )}
        </div>
      </div>

      {/* Floating WhatsApp */}
      <a
        className="float-wa-ab"
        href="https://wa.me/573107334957"
        target="_blank"
        rel="noopener"
        aria-label="Hablar con un asesor por WhatsApp"
      >
        <AbIcon name="wa" size={32} color="white" />
      </a>
    </React.Fragment>
  );
}

// ─── Pantalla: número no encontrado ───
function StepNoEncontrado({ pais, telefono, onReintentar }) {
  const waMsg = encodeURIComponent(
    `Hola, intenté abonar a mi boleta con el número ${pais.code} ${telefono} pero no me encontró el sistema. ¿Pueden ayudarme?`
  );
  return (
    <React.Fragment>
      <div className="ab-empty">
        <div className="ab-empty-icon">
          <AbIcon name="ghost" size={48} />
        </div>
        <h1 className="ab-empty-titulo">No encontramos tu número</h1>
        <p className="ab-empty-msg">
          No tenemos boletas registradas con el número <strong>{pais.code} {telefono}</strong>. Verifica que el número sea el mismo con el que compraste tu boleta.
        </p>
        <div className="ab-empty-actions">
          <button className="ab-btn-primary" onClick={onReintentar}>
            Probar otro número
          </button>
          <a
            className="ab-btn-secondary ab-btn-wa"
            href={"https://wa.me/573107334957?text=" + waMsg}
            target="_blank"
            rel="noopener"
            style={{ borderColor: "var(--whatsapp)" }}
          >
            <AbIcon name="wa" size={18} color="white" />
            Hablar con un asesor
          </a>
        </div>
      </div>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AbonarApp />);
