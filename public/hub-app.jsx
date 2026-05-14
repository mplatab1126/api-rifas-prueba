// hub-app.jsx — Aplicación principal del hub estilo dashboard

const { useState: useStateApp, useEffect: useEffectApp } = React;

function HubHeader() {
  const { open, openMenu, closeMenu } = useNavMenu();
  return (
    <React.Fragment>
      <header className="hub-header">
        <div className="hub-header-inner">
          <span className="hub-menu-spacer" aria-hidden="true"></span>
          <div className="hub-brand">
            <img src="assets/logo-losplata-tight.png" alt="LOS PLATA" />
          </div>
          <HamburgerBtn onClick={openMenu} />
        </div>
      </header>
      <NavDrawer open={open} onClose={closeMenu} />
    </React.Fragment>
  );
}

function SorteoBanner({ rifa }) {
  const imgUrl = rifa.imagenUrl || `${rifa.imagenBase || ""}${rifa.imagenIndex || 1}.png`;
  return (
    <a href={rifa.href || "Comprar boleta.html"} className="sorteo-banner">
      <div className="sb-img">
        <img src={imgUrl} alt={rifa.nombre} onError={(e) => { e.target.style.display='none'; }} />
      </div>
      <div className="sb-body">
        {rifa.edicion ? <p className="sb-edicion">{rifa.edicion}</p> : null}
        <h2 className="sb-titulo">{rifa.nombre}</h2>
        <ul className="sb-premios">
          <li><span className="sb-premio-label">Premio mayor</span><span className="sb-premio-val">{rifa.premioMayor || "—"}</span></li>
          <li><span className="sb-premio-label">{rifa.obsequioLabel || "Obsequio"}</span><span className="sb-premio-val">{rifa.obsequio || "—"}</span></li>
        </ul>
        <div className="sb-cta">
          <span className="sb-cta-text">Comprar boleta</span>
          <span className="sb-arrow">→</span>
        </div>
        <p className="sb-fecha">El premio mayor juega el {rifa.fechaSorteo}</p>
      </div>
    </a>
  );
}

function HubSaludo() {
  return (
    <div className="hub-saludo">
      <p className="hs-greet">Bienvenido</p>
      <h2 className="hs-pregunta">¿En qué le podemos ayudar?</h2>
      <p className="hs-sub">Toque la opción que necesite</p>
    </div>
  );
}

function TarjetaHub({ tarjeta, destacada }) {
  const isExternal = tarjeta.href.startsWith('http');
  const proximamente = !!tarjeta.proximamente;
  return (
    <a
      href={tarjeta.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      onClick={proximamente ? (e) => e.preventDefault() : undefined}
      aria-disabled={proximamente ? "true" : undefined}
      style={proximamente ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
      className={`tarjeta tarjeta-${tarjeta.color} ${destacada ? 'tarjeta-destacada' : ''}`}
    >
      <div className="tarjeta-icono tarjeta-icono-3d">
        {tarjeta.icono3d
          ? <img src={tarjeta.icono3d} alt="" className="tarjeta-icono-img" />
          : <HubIcon name={tarjeta.icono} size={destacada ? 56 : 44}/>}
      </div>
      <div className="tarjeta-texto">
        <h3 className="tarjeta-titulo">{tarjeta.titulo}</h3>
        {tarjeta.subtitulo && <p className="tarjeta-subtitulo">{tarjeta.subtitulo}</p>}
      </div>
      {tarjeta.badge && <span className="tarjeta-badge">{tarjeta.badge}</span>}
      <span className="tarjeta-arrow" aria-hidden="true">→</span>
    </a>
  );
}

function HubGrid() {
  return (
    <div className="hub-grid-wrap">
      <div className="hub-grid">
        {HUB_TARJETAS.map(t => <TarjetaHub key={t.id} tarjeta={t} />)}
      </div>
    </div>
  );
}

function HubAvisoSeguro() {
  return (
    <div className="hub-aviso">
      <div className="hub-aviso-icon hub-aviso-icon-3d">
        <img src="assets/icon-3d-lock.png" alt="" />
      </div>
      <div>
        <p className="hub-aviso-t">Cuídese de las estafas</p>
        <p className="hub-aviso-d">Solo aceptamos pagos a cuentas a nombre de <strong>LOS PLATA S.A.S.</strong> Si tiene dudas, escríbanos al WhatsApp oficial <strong>+57 310 733 4957</strong>.</p>
      </div>
    </div>
  );
}

function HubFooter() {
  return (
    <footer className="hub-footer">
      <div className="hf-logo">
        <img src="assets/logo-losplata.png" alt="LOS PLATA" />
      </div>
      <div className="hf-info">
        <p className="hf-nombre">LOS PLATA S.A.S.</p>
        <p className="hf-line">NIT 902.003.134-4</p>
        <p className="hf-line">Carrera 6 #12-04 local 2</p>
        <p className="hf-line">Chinchiná, Caldas</p>
      </div>
      <div className="hf-redes">
        <a href="https://wa.me/573107334957" target="_blank" rel="noreferrer" aria-label="WhatsApp">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.1 15 3.7 13.5 3.7 12c0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.2-8.3 8.2z"/><path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6 0-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4-.1-.2-.3-.2-.6-.4z"/></svg>
        </a>
        <a href="https://instagram.com/losplata_" target="_blank" rel="noreferrer" aria-label="Instagram">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
        </a>
        <a href="https://facebook.com/rifaslosplata" target="_blank" rel="noreferrer" aria-label="Facebook">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12z"/></svg>
        </a>
      </div>
      <p className="hf-copy">© 2026 LOS PLATA S.A.S.</p>
    </footer>
  );
}

function FloatWA() {
  return (
    <a href="https://wa.me/573107334957" className="float-wa-hub" target="_blank" rel="noreferrer" aria-label="WhatsApp">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.1 15 3.7 13.5 3.7 12c0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.2-8.3 8.2z"/>
        <path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6 0-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4-.1-.2-.3-.2-.6-.4z"/>
      </svg>
    </a>
  );
}

window.HubHeader = HubHeader;
window.SorteoBanner = SorteoBanner;
window.HubSaludo = HubSaludo;
window.HubGrid = HubGrid;
window.HubAvisoSeguro = HubAvisoSeguro;
window.HubFooter = HubFooter;
window.FloatWA = FloatWA;
