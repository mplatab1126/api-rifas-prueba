// canales-app.jsx — Componentes de la página Canales oficiales

const { useState: useStateCan, useRef: useRefCan } = React;

// ── Iconos ───────────────────────────────────────────────────────────────
function IconBack() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 5l7 7-7 7" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l4.5 4.5L19 7" />
    </svg>
  );
}
function IconVerificado() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-label="verificado">
      <path d="M12 1l2.5 2.2L17.8 3l1 3.2 3.2 1-.8 3.3L23 12l-2 2.5.8 3.3-3.2 1-1 3.2-3.3-.2L12 23l-2.5-2.2L6.2 21l-1-3.2-3.2-1 .8-3.3L1 12l2-2.5L2.2 6.2l3.2-1 1-3.2L9.7 2.2 12 1z"/>
      <path d="M9.5 12.5l2 2 4-4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}
function IconInstagram() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none" />
    </svg>
  );
}
function IconFacebook() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12z"/>
    </svg>
  );
}
function IconWA() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
      <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.1 15 3.7 13.5 3.7 12c0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.2-8.3 8.2z"/>
      <path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6 0-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4-.1-.2-.3-.2-.6-.4z"/>
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

// ── Topbar / Hero ────────────────────────────────────────────────────────
function CanalesTopbar({ onTab, tab, mostrarRevendedores }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <header className="canales-topbar">
      <div className="canales-topbar-row">
        <a href="/" className="canales-back" aria-label="Volver">
          <IconBack />
        </a>
        <h1 className="canales-topbar-title">Canales oficiales</h1>
        <HamburgerBtn onClick={() => setMenuOpen(true)} />
      </div>
      <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="canales-hero">
        <p className="canales-hero-sub">
          Estos son los <strong>únicos</strong> canales de contacto y pago verificados de LOS PLATA. Si alguien le contacta por otro medio, <strong>no es nosotros</strong>.
        </p>
      </div>

      {mostrarRevendedores && (
        <div className="canales-tabs" role="tablist">
          <button
            className={`canales-tab ${tab === 'oficial' ? 'is-active' : ''}`}
            onClick={() => onTab('oficial')}
            role="tab"
            aria-selected={tab === 'oficial'}
          >
            Oficial LOS PLATA
          </button>
          <button
            className={`canales-tab ${tab === 'revendedores' ? 'is-active' : ''}`}
            onClick={() => onTab('revendedores')}
            role="tab"
            aria-selected={tab === 'revendedores'}
          >
            Revendedores autorizados
          </button>
        </div>
      )}
    </header>
  );
}

// ── Sección genérica con eyebrow numerado ────────────────────────────────
function CanalesSeccion({ num, eyebrow, titulo, meta, children }) {
  return (
    <section className="canales-sec">
      <div className="canales-sec-head">
        <div className="canales-sec-head-left">
          <p className="canales-sec-eyebrow">
            <span className="num">{num}</span>
            {eyebrow}
          </p>
          {titulo && <h2 className="canales-sec-titulo">{titulo}</h2>}
        </div>
        {meta && <span className="canales-sec-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

// ── Tarjeta de red social ────────────────────────────────────────────────
function CanalRed({ canal }) {
  const isIG = canal.red === 'Instagram';
  return (
    <a href={canal.url} target="_blank" rel="noreferrer" className="canal canal-red">
      <div className={`canal-icon ${isIG ? 'is-instagram' : 'is-facebook'}`}>
        {isIG ? <IconInstagram /> : <IconFacebook />}
      </div>
      <div className="canal-body">
        <div className="canal-row">
          <p className="canal-handle">{canal.handle}</p>
          <span className="canal-verif" aria-label="verificado"><IconVerificado /></span>
        </div>
        <p className="canal-desc">{canal.descripcion}</p>
      </div>
      <span className="canal-cta">
        Abrir <IconArrow />
      </span>
    </a>
  );
}

// ── Tarjeta de WhatsApp ──────────────────────────────────────────────────
function CanalWA({ canal }) {
  const url = `https://wa.me/${canal.numeroLink}`;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="canal canal-wa">
      <div className="canal-icon"><IconWA /></div>
      <div className="canal-body">
        <p className="canal-wa-name">{canal.nombre}</p>
        <p className="canal-wa-numero">{canal.numero}</p>
      </div>
      <span className="canal-cta">
        Chatear <IconArrow />
      </span>
    </a>
  );
}

// ── Cuenta de pago con copiar ────────────────────────────────────────────
function CuentaPago({ cuenta, esHero, onCopy }) {
  const [copied, setCopied] = useStateCan(false);
  const handleCopy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const txt = cuenta.numeroLimpio;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    onCopy && onCopy(`Número ${cuenta.banco} copiado`);
    setTimeout(() => setCopied(false), 1800);
  };

  const bancoSlug = cuenta.banco.toLowerCase();
  const logoSrc = cuenta.banco === 'Bancolombia' ? 'assets/logo-bancolombia.png'
    : cuenta.banco === 'Nequi' ? 'assets/logo-nequi.png'
    : cuenta.banco === 'Daviplata' ? 'assets/logo-daviplata.png' : null;

  return (
    <div className={`cuenta ${esHero ? 'cuenta-hero cuenta-corp' : ''}`}>
      <div className="cuenta-head cuenta-head-simple">
        <p className="cuenta-banco-name">{cuenta.banco}</p>
      </div>

      <div className="cuenta-numero-block">
        <div className="cuenta-numero-text">
          <p className="cuenta-numero-label">Número</p>
          <p className="cuenta-numero">{cuenta.numero}</p>
        </div>
        <button
          className={`cuenta-copy-btn ${copied ? 'is-copied' : ''}`}
          onClick={handleCopy}
          type="button"
        >
          {copied ? <><IconCheck /> Copiado</> : 'Copiar'}
        </button>
      </div>

      <div className="cuenta-titular-block">
        <p className="cuenta-titular-label">Titular</p>
        <p className="cuenta-titular">{cuenta.titular}</p>
      </div>
    </div>
  );
}

// ── Aviso final + Footer simplificado ────────────────────────────────────
function CanalesAviso() {
  return (
    <div className="hub-aviso" style={{ marginTop: 18 }}>
      <div className="hub-aviso-icon hub-aviso-icon-3d">
        <img src="assets/icon-3d-lock.png" alt="" />
      </div>
      <div>
        <p className="hub-aviso-t">Cuídese de las estafas</p>
        <p className="hub-aviso-d">
          Si recibe contactos o pedidos de pago por <strong>otros números, otras cuentas u otras redes</strong>, no son LOS PLATA. Verifique siempre en esta página antes de pagar.
        </p>
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────────
function Toast({ mensaje, visible }) {
  return (
    <div className={`canales-toast ${visible ? 'is-visible' : ''}`} role="status" aria-live="polite">
      <IconCheck /> {mensaje}
    </div>
  );
}

window.CanalesTopbar = CanalesTopbar;
window.CanalesSeccion = CanalesSeccion;
window.CanalRed = CanalRed;
window.CanalWA = CanalWA;
window.CuentaPago = CuentaPago;
window.CanalesAviso = CanalesAviso;
window.CanalesToast = Toast;
