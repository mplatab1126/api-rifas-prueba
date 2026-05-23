// index-page.jsx — App principal del home (extraído de index.html para precompilar)

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "rifaNombre": "Casa Santa Teresita",
  "rifaEdicion": "",
  "rifaFechaSorteo": "4 de julio de 2026",
  "rifaHref": "/comprar-la-plata-house",
  "imagenUrl": "https:\/\/losplata.s3.us-east-2.amazonaws.com\/casa+santa+teresita+1\/Comedor+foto+1.jpg",
  "premioMayor": "Casa de dos plantas",
  "obsequioLabel": "Si no quiere la casa, se la compramos en",
  "obsequio": "$300.000.000 en efectivo",
  "ordenSecciones": "pagos-wa-redes"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const rifaForBanner = {
    nombre: t.rifaNombre,
    edicion: t.rifaEdicion,
    fechaSorteo: t.rifaFechaSorteo,
    href: t.rifaHref,
    imagenUrl: t.imagenUrl,
    premioMayor: t.premioMayor,
    obsequioLabel: t.obsequioLabel,
    obsequio: t.obsequio
  };

  return (
    <React.Fragment>
      <div className="hub">
        <HubHeader />
        <div className="evento-section">
          <h3 className="evento-titulo">Evento actual</h3>
          <SorteoBanner rifa={rifaForBanner} />
        </div>
        <HubSaludo />
        <HubGrid />
        <HubAvisoSeguro />
        <HubFooter />
      </div>
      <FloatWA />
      <TweaksPanel>
        <TweakSection label="Sorteo activo (banner)" />
        <TweakText label="Nombre" value={t.rifaNombre} onChange={(v) => setTweak('rifaNombre', v)} />
        <TweakText label="Edición" value={t.rifaEdicion} onChange={(v) => setTweak('rifaEdicion', v)} />
        <TweakText label="Premio mayor" value={t.premioMayor} onChange={(v) => setTweak('premioMayor', v)} />
        <TweakText label="Obsequio / extra (etiqueta)" value={t.obsequioLabel} onChange={(v) => setTweak('obsequioLabel', v)} />
        <TweakText label="Obsequio / extra (valor)" value={t.obsequio} onChange={(v) => setTweak('obsequio', v)} />
        <TweakText label="Fecha sorteo" value={t.rifaFechaSorteo} onChange={(v) => setTweak('rifaFechaSorteo', v)} />
        <TweakText label="Link comprar boleta" value={t.rifaHref} onChange={(v) => setTweak('rifaHref', v)} />
        <TweakText label="URL imagen del banner" value={t.imagenUrl} onChange={(v) => setTweak('imagenUrl', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
