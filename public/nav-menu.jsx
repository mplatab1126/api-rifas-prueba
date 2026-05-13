// nav-menu.jsx — Menú hamburguesa + drawer compartido entre todas las páginas

const NAV_ITEMS = [
  { id: "inicio",    label: "Inicio",                 href: "/" },
  { id: "comprar",   label: "Comprar boleta",         href: "/comprar-la-plata-house" },
  { id: "ver",       label: "Ver mi boleta",          href: "/ver-mi-boleta-la-plata-house" },
  { id: "abonar",    label: "Abonar a mi boleta",     href: "/abonar" },
  { id: "canales",   label: "Canales oficiales",      href: "/canales-oficiales" },
  { id: "terminos",  label: "Términos y condiciones", href: "/terminos-y-condiciones" },
  { id: "oficina",   label: "Oficina y documentos",   href: "#", proximamente: true },
  { id: "ganadores", label: "Ganadores anteriores",   href: "#", proximamente: true },
];

function NavDrawer({ open, onClose }) {
  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const onKey = (e) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", onKey);
      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener("keydown", onKey);
      };
    }
  }, [open]);

  return (
    <div className={`nav-drawer-root ${open ? "nav-drawer-open" : ""}`} aria-hidden={!open}>
      <div className="nav-drawer-backdrop" onClick={onClose}></div>
      <aside className="nav-drawer" role="dialog" aria-label="Menú de navegación">
        <div className="nav-drawer-top">
          <img src="assets/logo-losplata-tight.png" alt="LOS PLATA" className="nav-drawer-logo" />
          <button type="button" className="nav-drawer-close" onClick={onClose} aria-label="Cerrar menú">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6 L18 18 M18 6 L6 18"/>
            </svg>
          </button>
        </div>
        <nav className="nav-drawer-list">
          {NAV_ITEMS.map(it => (
            <a
              key={it.id}
              href={it.href}
              className="nav-drawer-item"
              onClick={it.proximamente ? (e) => e.preventDefault() : undefined}
              aria-disabled={it.proximamente ? "true" : undefined}
              style={it.proximamente ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            >
              <span className="nav-drawer-label">
                {it.label}
                {it.proximamente && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.7 }}>· Pronto</span>}
              </span>
              <span className="nav-drawer-arrow" aria-hidden="true">→</span>
            </a>
          ))}
        </nav>
        <div className="nav-drawer-foot">
          <p className="nav-drawer-rs">LOS PLATA S.A.S.</p>
          <p className="nav-drawer-nit">NIT 902.003.134-4</p>
        </div>
      </aside>
    </div>
  );
}

function HamburgerBtn({ onClick, theme }) {
  // theme: "dark" (white lines, default) | "light" (negro lines)
  const cls = `hub-menu-btn ${theme === "light" ? "hub-menu-btn-light" : ""}`.trim();
  return (
    <button type="button" className={cls} onClick={onClick} aria-label="Abrir menú">
      <span></span><span></span><span></span>
    </button>
  );
}

// Hook útil para cualquier página que necesite el drawer
function useNavMenu() {
  const [open, setOpen] = React.useState(false);
  return {
    open,
    openMenu: () => setOpen(true),
    closeMenu: () => setOpen(false),
  };
}

window.NAV_ITEMS = NAV_ITEMS;
window.NavDrawer = NavDrawer;
window.HamburgerBtn = HamburgerBtn;
window.useNavMenu = useNavMenu;
