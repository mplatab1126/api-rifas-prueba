// house-app.jsx — Orquestador del flujo Comprar boleta · Casa Santa Teresita
// Reusa StepEscoger / StepDatos / StepPago / StepExitoCompra de comprar-steps.jsx
// pero usa su propia landing (HouseLanding).

const { useState: useStateApp, useEffect: useEffectApp } = React;

const HOUSE_TWEAKS_DEFAULT = /*EDITMODE-BEGIN*/{
  "carruselStyle": "editorial",
  "accent": "#9BFAB0"
}/*EDITMODE-END*/;

function HouseApp() {
  const [vista, setVista] = useStateApp("landing");
  const [menuOpen, setMenuOpen] = useStateApp(false);
  const [seleccionadas, setSeleccionadas] = useStateApp([]);
  const [datos, setDatos] = useStateApp({
    nombre: "",
    apellido: "",
    tipoDoc: "CC",
    cedula: "",
    pais: window.PAISES[0],
    celular: "",
    ciudad: "",
    correo: ""
  });
  const [metodo, setMetodo] = useStateApp("wompi");
  const [tipoAbono, setTipoAbono] = useStateApp("total");
  const [montoAbono, setMontoAbono] = useStateApp(0);

  // Tweaks state — useTweaks returns [values, setTweak]
  const [tweaks, setTweak] = window.useTweaks
    ? window.useTweaks(HOUSE_TWEAKS_DEFAULT)
    : [HOUSE_TWEAKS_DEFAULT, () => {}];

  // Swatches curados para el acento (3-4 colores per BRAND.md)
  const ACCENT_OPTIONS = [
    { value: "#9BFAB0", label: "Menta" },
    { value: "#F2C94C", label: "Ámbar" },
    { value: "#FF8A4C", label: "Naranja" },
    { value: "#FAFAF7", label: "Crema" }
  ];

  const rifa = window.RIFA_INFO;

  // Cuando estamos en "exito", pintamos el body de negro para que el fondo
  // negro cubra todo el ancho del viewport (no solo la columna central).
  useEffectApp(() => {
    if (vista === "exito") {
      document.body.classList.add("cb-body-exito");
      return () => document.body.classList.remove("cb-body-exito");
    }
  }, [vista]);

  const handleBack = () => {
    if (vista === "landing") {
      window.location.href = "/";
    } else if (vista === "escoger") {
      setVista("landing");
    } else if (vista === "datos") {
      setVista("escoger");
    } else if (vista === "pago") {
      setVista("datos");
    } else if (vista === "exito") {
      window.location.href = "/";
    }
  };

  const onPagar = () => setTimeout(() => setVista("exito"), 100);
  const onReservar = () => setVista("exito");
  const volverInicio = () => { window.location.href = "/"; };

  const stepNumber =
    vista === "escoger" ? 1 :
    vista === "datos" ? 2 :
    vista === "pago" ? 3 : 0;

  return (
    <React.Fragment>
      <div className={"cb" + (vista === "exito" ? " cb--exito" : "")}>
        <div className="cb-topbar">
          <button className="cb-back" onClick={handleBack} aria-label="Volver">
            <CompIcon name="back" size={22} />
          </button>
          <h1 className="cb-topbar-title">
            {vista === "landing" ? "Casa Santa Teresita" :
             vista === "escoger" ? "Escoger n\u00fameros" :
             vista === "datos" ? "Sus datos" :
             vista === "pago" ? "Confirmar" : "Listo"}
          </h1>
          <HamburgerBtn onClick={() => setMenuOpen(true)} />
        </div>
        <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

        {stepNumber > 0 && (
          <div className="cb-stepper">
            <div className={"cb-step-dot" + (stepNumber >= 1 ? " active" : "")} />
            <div className={"cb-step-dot" + (stepNumber >= 2 ? " active" : "")} />
            <div className={"cb-step-dot" + (stepNumber >= 3 ? " active" : "")} />
          </div>
        )}

        {vista === "landing" && (
          <HouseLanding
            rifa={rifa}
            tweaks={tweaks}
            onComprar={() => setVista("escoger")}
          />
        )}

        {vista !== "landing" && (
          <div className="cb-content">
            {vista === "escoger" && (
              <StepEscoger
                rifa={rifa}
                seleccionadas={seleccionadas}
                setSeleccionadas={setSeleccionadas}
                onContinuar={() => setVista("datos")}
              />
            )}
            {vista === "datos" && (
              <StepDatos
                rifa={rifa}
                datos={datos}
                setDatos={setDatos}
                seleccionadas={seleccionadas}
                onContinuar={() => setVista("pago")}
              />
            )}
            {vista === "pago" && (
              <StepPago
                rifa={rifa}
                datos={datos}
                seleccionadas={seleccionadas}
                metodo={metodo}
                setMetodo={setMetodo}
                tipoAbono={tipoAbono}
                setTipoAbono={setTipoAbono}
                montoAbono={montoAbono}
                setMontoAbono={setMontoAbono}
                onPagar={onPagar}
                onReservar={onReservar}
              />
            )}
            {vista === "exito" && (
              <StepExitoCompra
                rifa={rifa}
                datos={datos}
                seleccionadas={seleccionadas}
                metodo={metodo}
                tipoAbono={tipoAbono}
                montoAbono={montoAbono}
                onVolver={volverInicio}
              />
            )}
          </div>
        )}
      </div>

      {/* Floating WhatsApp */}
      <a
        className="float-wa-cb"
        href="https://wa.me/573107334957"
        target="_blank"
        rel="noopener"
        aria-label="Hablar con un asesor por WhatsApp"
      >
        <CompIcon name="wa" size={32} color="white" />
      </a>

      {/* Tweaks panel — se auto-muestra/oculta según el toolbar */}
      {window.TweaksPanel && (
        <window.TweaksPanel title="Tweaks">
          <window.TweakSection label="Carrusel del hero">
            <window.TweakRadio
              label="Estilo"
              value={tweaks.carruselStyle}
              options={[
                { value: "editorial", label: "Editorial" },
                { value: "magazine",  label: "Magazine" },
                { value: "minimal",   label: "Minimal" }
              ]}
              onChange={(v) => setTweak("carruselStyle", v)}
            />
          </window.TweakSection>

          <window.TweakSection label="Color del CTA">
            <div style={{ display: "flex", gap: 8, padding: "6px 12px 10px", flexWrap: "wrap" }}>
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTweak("accent", opt.value)}
                  title={opt.label}
                  aria-label={opt.label}
                  style={{
                    width: 36, height: 36,
                    borderRadius: "50%",
                    background: opt.value,
                    border: tweaks.accent === opt.value
                      ? "2px solid #0A0A0A"
                      : "1px solid rgba(0,0,0,0.15)",
                    boxShadow: tweaks.accent === opt.value
                      ? "0 0 0 2px white inset, 0 2px 6px rgba(0,0,0,.2)"
                      : "0 1px 3px rgba(0,0,0,.08)",
                    cursor: "pointer",
                    padding: 0
                  }}
                />
              ))}
            </div>
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<HouseApp />);
