// canales-page.jsx — App de Canales oficiales (extraído de canales-oficiales.html)

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "ordenSecciones": "redes-wa-pagos",
  "mostrarRevendedoresTab": true,
  "mostrarHandleSeguidores": false,
  "tonoBotonCopiar": "negro"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = React.useState('oficial');
  const [toast, setToast] = React.useState({ visible: false, msg: '' });
  const toastTimer = React.useRef(null);

  const showToast = (msg) => {
    setToast({ visible: true, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast({ visible: false, msg }), 2000);
  };

  const cuentaCorp = CANALES_CUENTAS.find(c => c.id === 'bancolombia');
  const cuentasMateo = CANALES_CUENTAS.filter(c => c.titular === 'Mateo Plata Buitrago');
  const cuentasAlejandro = CANALES_CUENTAS.filter(c => c.titular === 'Alejandro Plata Buitrago');

  const ordenes = {
    'redes-wa-pagos': ['redes', 'wa', 'pagos'],
    'wa-pagos-redes': ['wa', 'pagos', 'redes'],
    'pagos-wa-redes': ['pagos', 'wa', 'redes'],
  };
  const orden = ordenes[t.ordenSecciones] || ordenes['redes-wa-pagos'];

  const seccionRedes = (
    <CanalesSeccion
      key="redes"
      num={orden.indexOf('redes') + 1}
      eyebrow="Redes sociales"
      meta={`${CANALES_REDES.length} cuentas`}
    >
      <div className="canales-list">
        {CANALES_REDES.map(c => <CanalRed key={c.id} canal={c} />)}
      </div>
    </CanalesSeccion>
  );

  const seccionWA = (
    <CanalesSeccion
      key="wa"
      num={orden.indexOf('wa') + 1}
      eyebrow="WhatsApp"
      meta={`${CANALES_WHATSAPP.length} líneas`}
    >
      <div className="canales-list">
        {CANALES_WHATSAPP.map(c => <CanalWA key={c.id} canal={c} />)}
      </div>
    </CanalesSeccion>
  );

  const seccionPagos = (
    <CanalesSeccion
      key="pagos"
      num={orden.indexOf('pagos') + 1}
      eyebrow="Cuentas de pago"
      meta={`${CANALES_CUENTAS.length} cuentas`}
    >
      <div className="canales-list">
        <div className="cuenta-grupo">
          <div className="cuenta-grupo-head">
            <span className="cuenta-grupo-num">1</span>
            <div className="cuenta-grupo-info">
              <p className="cuenta-grupo-eyebrow">Cuenta a nombre de</p>
              <p className="cuenta-grupo-titular">LOS PLATA S.A.S.</p>
            </div>
          </div>
          <div className="cuenta-grupo-list">
            <CuentaPago cuenta={cuentaCorp} esHero={true} onCopy={showToast} />
          </div>
        </div>

        <div className="cuenta-grupo">
          <div className="cuenta-grupo-head">
            <span className="cuenta-grupo-num">2</span>
            <div className="cuenta-grupo-info">
              <p className="cuenta-grupo-eyebrow">Cuentas a nombre de</p>
              <p className="cuenta-grupo-titular">Mateo Plata Buitrago</p>
            </div>
          </div>
          <div className="cuenta-grupo-list">
            {cuentasMateo.map(c => (
              <CuentaPago key={c.id} cuenta={c} esHero={false} onCopy={showToast} />
            ))}
          </div>
        </div>

        <div className="cuenta-grupo">
          <div className="cuenta-grupo-head">
            <span className="cuenta-grupo-num">3</span>
            <div className="cuenta-grupo-info">
              <p className="cuenta-grupo-eyebrow">Cuentas a nombre de</p>
              <p className="cuenta-grupo-titular">Alejandro Plata Buitrago</p>
            </div>
          </div>
          <div className="cuenta-grupo-list">
            {cuentasAlejandro.map(c => (
              <CuentaPago key={c.id} cuenta={c} esHero={false} onCopy={showToast} />
            ))}
          </div>
        </div>
      </div>
      <p className="canales-note">
        <IconInfoSm />
        <span>La cuenta principal de la empresa es <strong>Bancolombia 706-000025-93 a nombre de LOS PLATA S.A.S.</strong> Las cuentas Nequi/Daviplata son de los socios de la empresa para pagos pequeños.</span>
      </p>
    </CanalesSeccion>
  );

  const secciones = { redes: seccionRedes, wa: seccionWA, pagos: seccionPagos };

  const seccionRevendedores = (
    <div className="canales-pending">
      <p className="canales-pending-eyebrow">Próximamente</p>
      <h2 className="canales-pending-title">Revendedores autorizados</h2>
      <p className="canales-pending-desc">
        Aquí van a aparecer los revendedores autorizados con su número de WhatsApp y su página propia. Esta sección se llena en la próxima ronda con la lista que nos pases.
      </p>
    </div>
  );

  return (
    <React.Fragment>
      <div className="canales">
        <CanalesTopbar
          tab={tab}
          onTab={setTab}
          mostrarRevendedores={t.mostrarRevendedoresTab}
        />
        <div className="canales-body">
          {tab === 'oficial' || !t.mostrarRevendedoresTab
            ? orden.map(k => secciones[k])
            : seccionRevendedores
          }
          {(tab === 'oficial' || !t.mostrarRevendedoresTab) && <CanalesAviso />}
        </div>
        <SharedFooter />
      </div>
      <FloatWA />
      <CanalesToast mensaje={toast.msg} visible={toast.visible} />

      <TweaksPanel>
        <TweakSection label="Orden de secciones" />
        <TweakRadio
          label="Orden"
          value={t.ordenSecciones}
          onChange={(v) => setTweak('ordenSecciones', v)}
          options={[
            { value: 'redes-wa-pagos', label: 'Redes · WA · Pagos' },
            { value: 'wa-pagos-redes', label: 'WA · Pagos · Redes' },
            { value: 'pagos-wa-redes', label: 'Pagos · WA · Redes' },
          ]}
        />
        <TweakSection label="Sección de revendedores" />
        <TweakToggle
          label="Mostrar pestaña Revendedores"
          value={t.mostrarRevendedoresTab}
          onChange={(v) => setTweak('mostrarRevendedoresTab', v)}
        />
      </TweaksPanel>
    </React.Fragment>
  );
}

function IconInfoSm() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
