/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR DE NAVEGACIÓN COMPARTIDO — Los Plata S.A.S.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const STORAGE_KEY = 'asesor_pwd';
  const STORAGE_NAME = 'asesor_nombre';
  const PERMISOS_CACHE_KEY = 'asesor_permisos';
  const PERMISOS_CACHE_TTL = 5 * 60 * 1000;

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
    { id: 'permisos',    label: 'Permisos',              icon: '🔐', href: '/permisos',              section: 'admin',     roles: 'mateo' },
  ];

  function detectCurrentPage() {
    const path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/admin';
    for (const p of PAGES) {
      const clean = p.href.replace(/\.html$/, '');
      if (path === clean || path === clean.replace(/^\//, '')) return p.id;
    }
    return null;
  }

  function getCachedPermisos() {
    try {
      const raw = localStorage.getItem(PERMISOS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > PERMISOS_CACHE_TTL) return null;
      return parsed.permisos;
    } catch (e) {
      return null;
    }
  }

  function canAccess(page, asesorName) {
    if (!asesorName) return false;
    const name = asesorName.toLowerCase().trim();

    const dbPermisos = getCachedPermisos();
    if (dbPermisos && typeof dbPermisos[page.id] !== 'undefined') {
      return dbPermisos[page.id];
    }

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

    let lastSection = 'principal';

    for (const page of PAGES) {
      if (!canAccess(page, asesorName)) continue;

      if (page.section !== lastSection) {
        const sectionLabels = {
          gerencia: 'Gerencia',
          finanzas: 'Finanzas',
          admin: 'Administración'
        };
        if (sectionLabels[page.section]) {
          html += `<div class="snav-section-label">${sectionLabels[page.section]}</div>`;
          lastSection = page.section;
        }
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

  function prefetchPages(asesorName) {
    const currentPage = detectCurrentPage();
    for (const page of PAGES) {
      if (page.id === currentPage) continue;
      if (!canAccess(page, asesorName)) continue;
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = page.href;
      document.head.appendChild(link);
    }
  }

  let _refreshingPermisos = false;

  async function refreshPermisosBackground(asesorName) {
    if (_refreshingPermisos) return;
    _refreshingPermisos = true;

    try {
      const pwd = localStorage.getItem(STORAGE_KEY);
      if (!pwd) return;

      const r = await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contrasena: pwd })
      });
      const data = await r.json();

      if (data.status === 'ok' && data.permisos) {
        const oldCache = localStorage.getItem(PERMISOS_CACHE_KEY);
        const newPayload = JSON.stringify({ permisos: data.permisos, ts: Date.now() });

        let changed = !oldCache;
        if (oldCache) {
          try {
            const old = JSON.parse(oldCache);
            changed = JSON.stringify(old.permisos) !== JSON.stringify(data.permisos);
          } catch (e) { changed = true; }
        }

        localStorage.setItem(PERMISOS_CACHE_KEY, newPayload);

        if (changed) {
          const currentPage = detectCurrentPage();
          const currentPageObj = PAGES.find(p => p.id === currentPage);
          if (currentPageObj && !data.permisos[currentPage]) {
            window.location.href = '/admin';
            return;
          }
          window.__snavRefresh();
        }
      }
    } catch (e) {
      // Silent fail, use cached
    } finally {
      _refreshingPermisos = false;
    }
  }

  function checkCurrentPageAccess(asesorName) {
    const currentPage = detectCurrentPage();
    if (!currentPage) return;
    const page = PAGES.find(p => p.id === currentPage);
    if (!page) return;
    if (!canAccess(page, asesorName)) {
      window.location.href = '/admin';
    }
  }

  function injectSidebar() {
    const asesorName = localStorage.getItem(STORAGE_NAME);
    if (!asesorName) return;

    checkCurrentPageAccess(asesorName);

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
        localStorage.removeItem(PERMISOS_CACHE_KEY);
        window.location.href = '/admin';
      });
    }

    prefetchPages(asesorName);
    refreshPermisosBackground(asesorName);
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
    localStorage.removeItem(PERMISOS_CACHE_KEY);
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
  window.__snavInvalidatePermisos = function () {
    localStorage.removeItem(PERMISOS_CACHE_KEY);
  };
})();
