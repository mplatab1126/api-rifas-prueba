/*
 * ui-modal.js — Modales bonitos para reemplazar alert() y confirm() nativos del browser.
 *
 * Uso:
 *   alert("Mensaje")                              → se ve bonito automáticamente (override)
 *   await modalAlert("Mensaje", { tipo: 'exito' })→ retorna Promise<void>
 *   await modalConfirm("¿Seguro?", { titulo:'X' })→ retorna Promise<boolean>
 *
 * Tipos soportados: 'info' (default), 'exito', 'error', 'advertencia'.
 */
(function () {
  if (window.__lpModalReady) return;
  window.__lpModalReady = true;

  // Estilos. Usa las variables CSS del admin si están definidas, con fallback a la paleta.
  const css = `
  .lp-modal-overlay {
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    background: rgba(15, 32, 16, 0.55);
    padding: 20px;
    font-family: 'Poppins', system-ui, -apple-system, sans-serif;
    animation: lpFadeIn .18s ease-out;
  }
  .lp-modal {
    background: #ffffff;
    border-radius: 18px;
    max-width: 440px; width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    overflow: hidden;
    animation: lpScaleIn .22s cubic-bezier(.2,.9,.3,1.2);
  }
  .lp-modal-header {
    padding: 22px 24px 8px 24px;
    display: flex; align-items: center; gap: 12px;
  }
  .lp-modal-icon {
    width: 44px; height: 44px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; flex-shrink: 0;
  }
  .lp-modal-icon-info       { background: #e8f5e9; color: #2e7d32; }
  .lp-modal-icon-exito      { background: #e8f5e9; color: #2e7d32; }
  .lp-modal-icon-error      { background: #fcf2f2; color: #c62828; }
  .lp-modal-icon-advertencia{ background: #fff3e0; color: #e65100; }
  .lp-modal-title {
    font-size: 1.05rem; font-weight: 700;
    color: #2b3a35; margin: 0; line-height: 1.3;
  }
  .lp-modal-body {
    padding: 4px 24px 22px 24px;
    font-size: 0.95rem; line-height: 1.5;
    color: #52665e;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .lp-modal-actions {
    padding: 0 20px 20px 20px;
    display: flex; gap: 10px; justify-content: flex-end;
  }
  .lp-modal-btn {
    padding: 11px 22px;
    border-radius: 12px;
    border: none;
    font-family: inherit;
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    transition: filter .15s, transform .05s;
    min-width: 96px;
  }
  .lp-modal-btn:hover  { filter: brightness(0.95); }
  .lp-modal-btn:active { transform: scale(0.98); }
  .lp-modal-btn-primary {
    background: #4eb082; color: #fff;
  }
  .lp-modal-btn-primary.danger {
    background: #d95a53; color: #fff;
  }
  .lp-modal-btn-secondary {
    background: #f0f7f3; color: #2b3a35;
    border: 1px solid #d1e3da;
  }
  @keyframes lpFadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lpScaleIn { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
  @media (max-width: 480px) {
    .lp-modal { border-radius: 16px; }
    .lp-modal-actions { flex-direction: column-reverse; }
    .lp-modal-btn { width: 100%; }
  }
  `;
  const styleEl = document.createElement('style');
  styleEl.id = 'lp-modal-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // Detecta automáticamente el tipo del mensaje según emojis comunes.
  function detectarTipo(mensaje) {
    const m = String(mensaje || '');
    if (/^\s*(❌|🚫|🛑|⛔)/.test(m)) return 'error';
    if (/^\s*(⚠️|⚠)/.test(m))         return 'advertencia';
    if (/^\s*(✅|🎉|✔️)/.test(m))       return 'exito';
    return 'info';
  }

  const ICONOS = {
    info: 'ℹ️',
    exito: '✅',
    error: '❌',
    advertencia: '⚠️'
  };

  const TITULOS = {
    info: 'Atención',
    exito: '¡Listo!',
    error: 'Hubo un problema',
    advertencia: 'Atención'
  };

  function quitarPrefijoEmoji(mensaje) {
    return String(mensaje || '').replace(/^\s*(❌|🚫|🛑|⛔|⚠️|⚠|✅|🎉|✔️)\s*/, '');
  }

  function crearModal({ mensaje, titulo, tipo, botones, esConfirm }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'lp-modal-overlay';

      const tipoFinal = tipo || detectarTipo(mensaje);
      const tituloFinal = titulo || TITULOS[tipoFinal];
      const cuerpoFinal = quitarPrefijoEmoji(mensaje);

      const btnPrimary  = (botones && botones.aceptar) || (esConfirm ? 'Sí' : 'Entendido');
      const btnSecondary = (botones && botones.cancelar) || 'Cancelar';
      const peligro = tipoFinal === 'advertencia' || tipoFinal === 'error';

      overlay.innerHTML = `
        <div class="lp-modal" role="dialog" aria-modal="true">
          <div class="lp-modal-header">
            <div class="lp-modal-icon lp-modal-icon-${tipoFinal}">${ICONOS[tipoFinal]}</div>
            <h3 class="lp-modal-title"></h3>
          </div>
          <div class="lp-modal-body"></div>
          <div class="lp-modal-actions">
            ${esConfirm ? `<button class="lp-modal-btn lp-modal-btn-secondary" data-action="cancel">${btnSecondary}</button>` : ''}
            <button class="lp-modal-btn lp-modal-btn-primary${peligro && esConfirm ? ' danger' : ''}" data-action="ok">${btnPrimary}</button>
          </div>
        </div>`;

      // Usar textContent para evitar inyección si el mensaje viene de datos del usuario.
      overlay.querySelector('.lp-modal-title').textContent = tituloFinal;
      overlay.querySelector('.lp-modal-body').textContent = cuerpoFinal;

      function cerrar(valor) {
        document.removeEventListener('keydown', onKey);
        overlay.style.animation = 'lpFadeIn .15s ease-out reverse';
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 140);
        resolve(valor);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); cerrar(false); }
        if (e.key === 'Enter')  { e.preventDefault(); cerrar(true); }
      }

      overlay.addEventListener('click', e => {
        if (e.target === overlay && esConfirm) return; // Click fuera no cierra confirms (decisión consciente)
        if (e.target === overlay && !esConfirm) cerrar();
        const action = e.target.dataset && e.target.dataset.action;
        if (action === 'ok') cerrar(true);
        if (action === 'cancel') cerrar(false);
      });

      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      const okBtn = overlay.querySelector('[data-action="ok"]');
      if (okBtn) setTimeout(() => okBtn.focus(), 40);
    });
  }

  window.modalAlert = function (mensaje, opts) {
    opts = opts || {};
    return crearModal({
      mensaje,
      titulo: opts.titulo,
      tipo: opts.tipo,
      botones: opts.botones,
      esConfirm: false
    });
  };

  window.modalConfirm = function (mensaje, opts) {
    opts = opts || {};
    return crearModal({
      mensaje,
      titulo: opts.titulo,
      tipo: opts.tipo || 'advertencia',
      botones: opts.botones || { aceptar: 'Sí, continuar', cancelar: 'Cancelar' },
      esConfirm: true
    });
  };

  // Sobreescribir alert nativo: cualquier alert(...) existente se ve bonito sin cambios.
  const _alertNativo = window.alert;
  window.alert = function (mensaje) {
    try { return window.modalAlert(mensaje); }
    catch (e) { return _alertNativo.call(window, mensaje); }
  };
})();
