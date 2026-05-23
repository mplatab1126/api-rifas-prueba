// abonar-steps.jsx — Componentes de cada paso del flujo

const { useState, useMemo, useRef, useEffect } = React;

// ─────────────────────────────────────────────
// PASO 1 — Buscar boletas por teléfono
// ─────────────────────────────────────────────
window.StepBuscar = function StepBuscar({ pais, setPais, telefono, setTelefono, onContinuar, error, buscando }) {
  const [openSheet, setOpenSheet] = useState(false);
  const inputRef = useRef(null);

  const maxLen = pais.digits;
  const valid = telefono.length === maxLen;

  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, maxLen);
    setTelefono(digits);
  };

  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Paso 1 de 3</p>
        <h1 className="ab-titulo">Encontremos tus boletas</h1>
        <p className="ab-mensaje">
          El abono se aplicará a tu boleta de la rifa actual <strong>Casa Santa Teresita</strong>.
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
          <label className="ab-label" htmlFor="ab-tel">¿Cuál es tu número de teléfono?</label>
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
              id="ab-tel"
              ref={inputRef}
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
          <div className="ab-aviso" style={{ background: "#7A1F1F", marginBottom: 0 }}>
            <div className="ab-aviso-icon" style={{ background: "white", color: "#7A1F1F" }}>
              <AbIcon name="alert" size={20} />
            </div>
            <div>
              <p className="ab-aviso-t" style={{ color: "white" }}>No encontramos tu número</p>
              <p className="ab-aviso-d">{error}</p>
            </div>
          </div>
        )}

        <button type="submit" className="ab-btn-primary" disabled={!valid || buscando}>
          {buscando ? "Buscando..." : (
            <React.Fragment>
              Buscar mis boletas
              <span style={{ marginLeft: 4 }}>→</span>
            </React.Fragment>
          )}
        </button>
      </form>

      {openSheet && (
        <CountrySheet
          paisActual={pais}
          onSelect={(p) => { setPais(p); setTelefono(""); setOpenSheet(false); }}
          onClose={() => setOpenSheet(false)}
        />
      )}
    </React.Fragment>
  );
};

// ─────────────────────────────────────────────
// Country picker — modal sheet
// ─────────────────────────────────────────────
function CountrySheet({ paisActual, onSelect, onClose }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return window.PAISES;
    return window.PAISES.filter(p =>
      p.name.toLowerCase().includes(t) || p.code.includes(t)
    );
  }, [q]);

  return (
    <div className="ab-sheet-backdrop" onClick={onClose}>
      <div className="ab-sheet" onClick={e => e.stopPropagation()}>
        <div className="ab-sheet-handle" />
        <div className="ab-sheet-header">
          <h2 className="ab-sheet-title">Selecciona tu país</h2>
          <input
            className="ab-sheet-search"
            placeholder="Buscar país..."
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="ab-sheet-list">
          {filtered.map(p => (
            <button
              key={p.iso}
              className={"ab-sheet-item" + (p.iso === paisActual.iso ? " selected" : "")}
              onClick={() => onSelect(p)}
            >
              <span className="ab-flag">{p.flag}</span>
              <span className="ab-sheet-item-name">{p.name}</span>
              <span className="ab-sheet-item-code">{p.code}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p style={{ padding: "20px", color: "var(--ink-mute)", textAlign: "center" }}>
              No encontramos ningún país.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PASO 2 — Mostrar boletas del cliente
// ─────────────────────────────────────────────
window.StepBoletas = function StepBoletas({ cliente, seleccionadas, setSeleccionadas, onContinuar, onAtras }) {
  const pagas = cliente.boletas.filter(b => b.estado === "paga");
  const pendientes = cliente.boletas.filter(b => b.estado === "pendiente");
  const [expandida, setExpandida] = useState(null); // numero de boleta cuyo historial está abierto

  const togglar = (numero) => {
    setSeleccionadas(prev =>
      prev.includes(numero) ? prev.filter(n => n !== numero) : [...prev, numero]
    );
  };

  const totalAabonar = pendientes
    .filter(b => seleccionadas.includes(b.numero))
    .reduce((sum, b) => sum + b.saldoPendiente, 0);

  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Paso 2 de 3</p>
        <h1 className="ab-titulo">¡Perfecto, te encontramos!</h1>
        <p className="ab-mensaje">Estas son tus boletas registradas.</p>
      </div>

      <div className="ab-cliente-card">
        <p className="ab-cliente-eyebrow">Cliente</p>
        <p className="ab-cliente-nombre">{cliente.nombre} {cliente.apellido}</p>
        <p className="ab-cliente-ciudad">
          <AbIcon name="pin" size={14} /> {cliente.ciudad}
        </p>
      </div>

      {pagas.length > 0 && (
        <React.Fragment>
          <h2 className="ab-section-titulo">
            {pagas.length === 1 ? "Boleta ya pagada" : "Boletas ya pagadas"}
          </h2>
          {pagas.map(b => (
            <BoletaItem
              key={b.numero}
              boleta={b}
              tipo="paga"
              expandida={expandida === b.numero}
              onToggleHistorial={() => setExpandida(expandida === b.numero ? null : b.numero)}
            />
          ))}
        </React.Fragment>
      )}

      {pendientes.length > 0 && (
        <React.Fragment>
          <h2 className="ab-section-titulo">
            {pendientes.length === 1 ? "Boleta pendiente de abonar" : "Boletas pendientes de abonar"}
          </h2>
          {pendientes.map(b => (
            <BoletaItem
              key={b.numero}
              boleta={b}
              tipo="pendiente"
              seleccionada={seleccionadas.includes(b.numero)}
              onToggle={() => togglar(b.numero)}
              expandida={expandida === b.numero}
              onToggleHistorial={() => setExpandida(expandida === b.numero ? null : b.numero)}
            />
          ))}
        </React.Fragment>
      )}

      {pendientes.length === 0 && (
        <div className="ab-aviso" style={{ marginTop: 24 }}>
          <div className="ab-aviso-icon"><AbIcon name="check" size={18}/></div>
          <div>
            <p className="ab-aviso-t">Estás al día</p>
            <p className="ab-aviso-d">Todas tus boletas están totalmente pagadas. ¡Mucha suerte en el sorteo!</p>
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="ab-resumen-bar">
          <div className="ab-resumen-row">
            <span className="ab-resumen-label">
              {seleccionadas.length === 0
                ? "Selecciona una boleta"
                : seleccionadas.length === 1
                  ? "1 boleta · saldo total"
                  : `${seleccionadas.length} boletas · saldo total`}
            </span>
            <span className="ab-resumen-value">{window.formatCOP(totalAabonar)}</span>
          </div>
          <button
            className="ab-btn-primary"
            disabled={seleccionadas.length === 0}
            onClick={onContinuar}
          >
            Continuar
            <span style={{ marginLeft: 4 }}>→</span>
          </button>
        </div>
      )}
    </React.Fragment>
  );
};

function BoletaItem({ boleta, tipo, seleccionada, onToggle, expandida, onToggleHistorial }) {
  const isPaga = tipo === "paga";

  return (
    <div
      className={"ab-boleta " + tipo + (seleccionada ? " selected" : "")}
      onClick={!isPaga ? onToggle : undefined}
      role={!isPaga ? "button" : undefined}
      tabIndex={!isPaga ? 0 : undefined}
    >
      {!isPaga && (
        <div className="ab-check">
          {seleccionada && <AbIcon name="check" size={18} />}
        </div>
      )}

      <div className="ab-boleta-content">
        <div className="ab-boleta-row1">
          <div>
            <span className="ab-boleta-numero-prefix">Boleta</span>
            <span className="ab-boleta-numero">N° {boleta.numero}</span>
          </div>
          <span className={"ab-boleta-status " + tipo}>
            {isPaga ? "Pagada" : "Pendiente"}
          </span>
        </div>

        {isPaga ? (
          <p className="ab-boleta-paga-msg">
            Esta boleta ya está <strong>totalmente pagada</strong>. No necesitas abonar más. ¡Mucha suerte!
          </p>
        ) : (
          <div className="ab-boleta-amounts">
            <div className="ab-amount-block">
              <span className="ab-amount-label">Total abonado</span>
              <span className="ab-amount-value">{window.formatCOP(boleta.totalAbonado)}</span>
            </div>
            <div className="ab-amount-block">
              <span className="ab-amount-label">Saldo pendiente</span>
              <span className="ab-amount-value saldo">{window.formatCOP(boleta.saldoPendiente)}</span>
            </div>
          </div>
        )}

        {boleta.historial && boleta.historial.length > 0 && (
          <button
            className="ab-historial-toggle"
            onClick={(e) => { e.stopPropagation(); onToggleHistorial(); }}
          >
            <AbIcon name="history" size={14} />
            {expandida ? "Ocultar historial" : "Ver historial de pagos"}
          </button>
        )}

        {expandida && (
          <div className="ab-historial" onClick={e => e.stopPropagation()}>
            <p className="ab-historial-titulo">Historial de abonos</p>
            {boleta.historial.map((h, i) => (
              <div key={i} className="ab-historial-row">
                <span className="ab-historial-fecha">{h.fecha}</span>
                <span className="ab-historial-monto">{window.formatCOP(h.monto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PASO 3 — Confirmar monto + Wompi
// ─────────────────────────────────────────────
window.StepConfirmar = function StepConfirmar({ cliente, boletasPagar, monto, setMonto, opcion, setOpcion, onPagar, onAtras, pagando, error }) {
  const totalSaldo = boletasPagar.reduce((s, b) => s + b.saldoPendiente, 0);

  const handleCustom = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
    setMonto(parseInt(digits || "0", 10));
    setOpcion("custom");
  };

  const valid = monto >= 10000 && monto <= totalSaldo;
  const boletasLabel = boletasPagar.map(b => "N° " + b.numero).join(", ");

  return (
    <React.Fragment>
      <div className="ab-intro">
        <p className="ab-eyebrow">Paso 3 de 3</p>
        <h1 className="ab-titulo">¿Cuánto quieres abonar?</h1>
        <p className="ab-mensaje">
          {boletasPagar.length === 1
            ? <>Saldo pendiente de la boleta <strong>{boletasLabel}</strong>: <strong>{window.formatCOP(totalSaldo)}</strong></>
            : <>Saldo pendiente de las boletas <strong>{boletasLabel}</strong>: <strong>{window.formatCOP(totalSaldo)}</strong></>}
        </p>
      </div>

      <div className="ab-monto-custom">
        <span className="ab-monto-currency">$</span>
        <input
          className="ab-monto-input"
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={opcion === "custom" && monto > 0 ? monto.toLocaleString("es-CO") : ""}
          onChange={handleCustom}
          onFocus={() => setOpcion("custom")}
          autoFocus
        />
      </div>
      <p className="ab-help" style={{ marginTop: 8 }}>Mínimo {window.formatCOP(10000)} · Máximo {window.formatCOP(totalSaldo)}</p>

      <div style={{ height: 24 }} />

      <div className="ab-wompi-card">
        <div className="ab-wompi-logo-circle">W</div>
        <div className="ab-wompi-text">
          <p className="ab-wompi-t">Pago seguro con Wompi</p>
          <p className="ab-wompi-d">Te llevaremos a la pasarela de pagos. Allí elegirás cómo pagar.</p>
        </div>
      </div>

      <div className="ab-metodos">
        <span className="ab-metodo-chip">Tarjeta crédito/débito</span>
        <span className="ab-metodo-chip">PSE</span>
        <span className="ab-metodo-chip">Nequi</span>
        <span className="ab-metodo-chip">Bancolombia</span>
        <span className="ab-metodo-chip">Daviplata</span>
      </div>

      {error && (
        <div className="ab-aviso" style={{ background: "#7A1F1F", marginBottom: 16 }}>
          <div className="ab-aviso-icon" style={{ background: "white", color: "#7A1F1F" }}>
            <AbIcon name="alert" size={20} />
          </div>
          <div>
            <p className="ab-aviso-t" style={{ color: "white" }}>No pudimos iniciar el pago</p>
            <p className="ab-aviso-d">{error}</p>
          </div>
        </div>
      )}

      <button className="ab-btn-primary ab-btn-mint" disabled={!valid || pagando} onClick={onPagar}>
        {pagando ? "Conectando con Wompi..." : (
          <React.Fragment>
            <AbIcon name="lock" size={18} />
            Pagar {window.formatCOP(monto)} con Wompi
          </React.Fragment>
        )}
      </button>

      <div className="ab-secure-note">
        <AbIcon name="shield" size={18} />
        <span>
          Tu pago se procesa de forma segura. <strong>LOS PLATA S.A.S.</strong> nunca te pedirá tu clave o tarjeta por WhatsApp.
        </span>
      </div>
    </React.Fragment>
  );
};

// ─────────────────────────────────────────────
// PASO ÉXITO REAL — Cliente regresó de Wompi
// ─────────────────────────────────────────────
window.StepExitoPago = function StepExitoPago({ cargando, tx, onVolver }) {
  if (cargando) {
    return (
      <div className="ab-success" style={{ paddingTop: 40 }}>
        <p className="ab-success-msg">Verificando tu pago...</p>
      </div>
    );
  }

  if (!tx || tx.error) {
    return (
      <React.Fragment>
        <div className="ab-success">
          <h1 className="ab-success-titulo">No pudimos verificar tu pago</h1>
          <p className="ab-success-msg">
            {tx && tx.error ? tx.error : "Hubo un problema al consultar el estado del pago."}
          </p>
        </div>
        <button className="ab-btn-primary" onClick={onVolver}>Volver al inicio</button>
      </React.Fragment>
    );
  }

  const aprobado = tx.status === "APPROVED";
  const titulo = aprobado
    ? "¡Pago realizado!"
    : tx.status === "DECLINED" ? "Pago rechazado"
    : tx.status === "VOIDED" ? "Pago anulado"
    : tx.status === "ERROR" ? "Error en el pago"
    : "Pago en proceso";

  return (
    <React.Fragment>
      <div className="ab-success">
        {aprobado && (
          <div className="ab-success-icon ab-success-icon-3d">
            <img src="assets/icon-3d-tick.png" alt="" />
          </div>
        )}
        <h1 className="ab-success-titulo">{titulo}</h1>
        {aprobado ? (
          <p className="ab-success-msg">
            Recibimos tu abono de <strong>{window.formatCOP(tx.monto)}</strong>. En unos minutos verás reflejado el pago en tu boleta.
          </p>
        ) : (
          <p className="ab-success-msg">
            Estado: <strong>{tx.status}</strong>. Si crees que es un error, contáctanos por WhatsApp.
          </p>
        )}
      </div>

      <div className="ab-confirm-card">
        <div className="ab-confirm-row">
          <span className="ab-confirm-label">Referencia Wompi</span>
          <span className="ab-confirm-value">{tx.id}</span>
        </div>
        {tx.monto != null && (
          <div className="ab-confirm-row total">
            <span className="ab-confirm-label">Monto</span>
            <span className="ab-confirm-value">{window.formatCOP(tx.monto)}</span>
          </div>
        )}
      </div>

      {aprobado && (
        <p className="ab-mensaje" style={{ textAlign: "center", margin: "24px 0 16px" }}>
          Te enviaremos el comprobante a tu WhatsApp en unos minutos.
        </p>
      )}

      <button className="ab-btn-primary" onClick={onVolver}>Volver al inicio</button>
    </React.Fragment>
  );
};

// ─────────────────────────────────────────────
// PASO ÉXITO — Pago confirmado (mock)
// ─────────────────────────────────────────────
window.StepExito = function StepExito({ cliente, monto, boletasPagar, onVolver }) {
  const ref = "LP-" + Math.floor(100000 + Math.random() * 900000);
  return (
    <React.Fragment>
      <div className="ab-success">
        <div className="ab-success-icon ab-success-icon-3d">
          <img src="assets/icon-3d-tick.png" alt="" />
        </div>
        <h1 className="ab-success-titulo">¡Pago realizado!</h1>
        <p className="ab-success-msg">
          Recibimos tu abono de <strong>{window.formatCOP(monto)}</strong> a las boletas <strong>{boletasPagar.map(b => "N° " + b.numero).join(", ")}</strong>.
        </p>
      </div>

      <div className="ab-confirm-card">
        <div className="ab-confirm-row">
          <span className="ab-confirm-label">Referencia</span>
          <span className="ab-confirm-value">{ref}</span>
        </div>
        <div className="ab-confirm-row">
          <span className="ab-confirm-label">Cliente</span>
          <span className="ab-confirm-value">{cliente.nombre} {cliente.apellido}</span>
        </div>
        <div className="ab-confirm-row total">
          <span className="ab-confirm-label">Monto abonado</span>
          <span className="ab-confirm-value">{window.formatCOP(monto)}</span>
        </div>
      </div>

      <p className="ab-mensaje" style={{ textAlign: "center", margin: "24px 0 16px" }}>
        Te enviaremos el comprobante a tu WhatsApp en unos minutos.
      </p>

      <button className="ab-btn-primary" onClick={onVolver}>
        Volver al inicio
      </button>
    </React.Fragment>
  );
};
