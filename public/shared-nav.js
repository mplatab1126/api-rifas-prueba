/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR DE NAVEGACIÓN COMPARTIDO — Los Plata S.A.S.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const STORAGE_KEY = 'asesor_pwd';
  const STORAGE_NAME = 'asesor_nombre';

  const GERENCIA = ['mateo', 'alejo p', 'alejo plata'];
  const SOLO_MATEO = ['mateo'];

  const PAGES = [
    { id: 'admin',       label: 'Panel de Ventas',       icon: '🏠', href: '/admin',                  section: 'principal', roles: 'todos' },
    { id: 'caja',        label: 'Cuadre de Caja',        icon: '💰', href: '/caja',                   section: 'principal', roles: 'todos' },
    { id: 'rendimiento', label: 'Rendimiento',           icon: '📊', href: '/rendimiento',           section: 'gerencia',  roles: 'gerencia' },
    { id: 'llamadas',    label: 'Llamadas IA',           icon: '📞', href: '/llamadas',              section: 'gerencia',  roles: 'gerencia' },
    { id: 'horarios',    label: 'Gestión de Horarios',   icon: '🗓️', href: '/admin-horarios',        section: 'gerencia',  roles: 'gerencia' },
    { id: 'rifas',       label: 'Centro Financiero',     icon: '🎰', href: '/rifas',                 section: 'finanzas',  roles: 'mateo' },
    { id: 'estado',      label: 'Estado de Resultados',  icon: '💼', href: '/estado-resultados',     section: 'finanzas',  roles: 'mateo' },
  ];

  function detectCurrentPage() {
    const path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/admin';
    for (const p of PAGES) {
      const clean = p.href.replace(/\.html$/, '');
      if (path === clean || path === clean.replace(/^\//, '')) return p.id;
    }
    return null;
  }

  function canAccess(page, asesorName) {
    if (!asesorName) return false;
    const name = asesorName.toLowerCase().trim();
    if (page.roles === 'todos') return true;
    if (page.roles === 'gerencia') return GERENCIA.includes(name);
    if (page.roles === 'mateo') return SOLO_MATEO.includes(name);
    return false;
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2);
  }

  function buildSidebar(asesorName) {
    const currentPage = detectCurrentPage();
    const name = (asesorName || '').toLowerCase().trim();
    const isGerencia = GERENCIA.includes(name);
    const isMateo = SOLO_MATEO.includes(name);

    let html = `
      <div class="snav-logo-area">
        <img src="https://losplata.s3.us-east-2.amazonaws.com/Logo.png" alt="Los Plata">
        <div>
          <div class="snav-logo-text">Los Plata S.A.S.</div>
          <div class="snav-logo-sub">Sistema de Rifas</div>
        </div>
      </div>
      <div class="snav-links">
        <div class="snav-section-label">Principal</div>
    `;

    for (const page of PAGES) {
      if (!canAccess(page, asesorName)) continue;

      if (page.section === 'gerencia' && html.indexOf('Gerencia') === -1) {
        html += '<div class="snav-section-label">Gerencia</div>';
      }
      if (page.section === 'finanzas' && html.indexOf('Finanzas') === -1) {
        html += '<div class="snav-section-label">Finanzas</div>';
      }

      const active = page.id === currentPage ? ' active' : '';
      html += `
        <a class="snav-link${active}" href="${page.href}">
          <span class="snav-link-icon">${page.icon}</span>
          ${page.label}
        </a>
      `;
    }

    html += `
      </div>
      <div class="snav-bottom">
        <div class="snav-asesor-badge">
          <div class="snav-asesor-avatar">${getInitials(asesorName)}</div>
          <div class="snav-asesor-name">${asesorName || '—'}</div>
        </div>
        <button class="snav-logout" id="snavLogout">
          <span>🚪</span> Cerrar Sesión
        </button>
      </div>
    `;

    return html;
  }

  function injectSidebar() {
    const asesorName = localStorage.getItem(STORAGE_NAME);
    if (!asesorName) return;

    const sidebar = document.createElement('nav');
    sidebar.className = 'snav-sidebar';
    sidebar.id = 'snavSidebar';
    sidebar.innerHTML = buildSidebar(asesorName);

    const hamburger = document.createElement('button');
    hamburger.className = 'snav-hamburger';
    hamburger.id = 'snavHamburger';
    hamburger.innerHTML = '☰';
    hamburger.setAttribute('aria-label', 'Abrir menú');

    const overlay = document.createElement('div');
    overlay.className = 'snav-overlay';
    overlay.id = 'snavOverlay';

    document.body.prepend(overlay);
    document.body.prepend(sidebar);
    document.body.prepend(hamburger);

    const pageContent = document.getElementById('snavPageContent');
    if (pageContent) {
      // already wrapped
    }

    hamburger.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('visible');
      hamburger.innerHTML = sidebar.classList.contains('open') ? '✕' : '☰';
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      hamburger.innerHTML = '☰';
    });

    const logoutBtn = document.getElementById('snavLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_NAME);
        window.location.href = '/admin';
      });
    }
  }

  function saveAsesorName(name) {
    if (name) localStorage.setItem(STORAGE_NAME, name);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSidebar);
  } else {
    injectSidebar();
  }

  window.__snavSaveAsesor = saveAsesorName;
  window.__snavShowLogin = function () {
    document.documentElement.classList.remove('snav-authed');
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_NAME);
  };
  window.__snavRefresh = function () {
    const existing = document.getElementById('snavSidebar');
    if (existing) existing.remove();
    const ham = document.getElementById('snavHamburger');
    if (ham) ham.remove();
    const ov = document.getElementById('snavOverlay');
    if (ov) ov.remove();
    injectSidebar();
  };
})();
