const $ = id => document.getElementById(id);
    const feedback = $('searchFeedback');
    const topBar = $('topBar');
    const appShell = $('appShell');

    function activateAppMode() { topBar.classList.remove('hero-mode'); appShell.classList.add('visible'); const bg = $('heroBg'); if(bg){ bg.style.opacity='0'; setTimeout(()=>{ bg.style.display='none'; }, 500); } }
    function activateHeroMode() { topBar.classList.add('hero-mode'); appShell.classList.remove('visible'); $('smartInput').value = ''; $('smartInput').focus(); setMode('separar'); resetOcrZone('ocrDrop', 'ocrStatus'); resetOcrZone('ocrDropAbono', 'ocrStatusAbono'); const bg = $('heroBg'); if(bg){ bg.style.display='block'; setTimeout(()=>{ bg.style.opacity='1'; }, 10); } }

    function resetOcrZone(dropId, statusId) {
        const el = document.getElementById(dropId);
        if (el) el.innerHTML = `📋 Pega la imagen del comprobante aquí (Ctrl+V)<br><span id="${statusId}" style="color:var(--accent-2); font-weight:normal; margin-top:4px; display:block;"></span>`;
    }

    let modoVenta = 'separar'; 
    function setMode(mode) {
      modoVenta = mode;
      const btnAbono = $('btnModeAbono'); const btnSeparar = $('btnModeSeparar');
      const paySection = $('paymentSections'); const btnReg = $('btnRegistrarVenta');
      if (mode === 'separar') {
        btnSeparar.classList.add('active'); btnAbono.classList.remove('active');
        paySection.style.display = 'none';
        btnReg.textContent = 'Confirmar Separado ($0)'; btnReg.style.background = 'var(--accent-2)'; 
      } else {
        btnAbono.classList.add('active'); btnSeparar.classList.remove('active');
        paySection.style.display = 'block'; 
        btnReg.textContent = 'Registrar Venta'; btnReg.style.background = 'var(--accent)'; 
      }
    }

    const numList = $('numList');
    function makeNumPill(value=''){
      const wrap = document.createElement('div'); wrap.className='num-pill';
      const inp = document.createElement('input'); inp.type='text'; inp.maxLength=4; inp.value=value;
      const del = document.createElement('button'); del.className='chip-del'; del.textContent='✕';
      del.onclick = ()=>{ wrap.remove(); if(!numList.children.length) addDefaultPill(); };
      wrap.append(inp, del); return wrap;
    }
    function addDefaultPill(){ numList.appendChild(makeNumPill()); }
    $('btnAddNum').onclick = ()=> numList.appendChild(makeNumPill());

    const STORAGE_KEY = 'asesor_pwd';

    // ==========================================
    // SALDO DEL ASESOR
    // ==========================================
    let nombreAsesorActual = '';

    function cargarSaldoAsesor(nombre) {
        nombreAsesorActual = nombre;
        const saldo = parseInt(localStorage.getItem('saldo_asesor_' + nombre) || '0');
        actualizarDisplaySaldo(saldo);
        const nombreBadge = document.getElementById('nombreAsesorBadge');
        if (nombreBadge) {
            nombreBadge.innerHTML = '👤 ' + nombre;
        }
    }

    function actualizarSaldoAsesor(incremento) {
        if (!nombreAsesorActual) return;
        const saldo = parseInt(localStorage.getItem('saldo_asesor_' + nombreAsesorActual) || '0');
        const nuevoSaldo = saldo + incremento;
        localStorage.setItem('saldo_asesor_' + nombreAsesorActual, nuevoSaldo);
        actualizarDisplaySaldo(nuevoSaldo);
        celebrarSaldo(incremento);
    }

    function actualizarDisplaySaldo(saldo) {
        const cantidad = document.getElementById('saldoCantidad');
        if (!cantidad) return;
        if (saldoOculto) return;
        const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(saldo);
        cantidad.textContent = fmt;
    }

    function celebrarSaldo(incremento) {
        const badge = document.getElementById('saldoAsesor');
        if (!badge) return;

        // Pulso del badge
        badge.classList.remove('celebrando');
        void badge.offsetWidth;
        badge.classList.add('celebrando');
        badge.addEventListener('animationend', () => badge.classList.remove('celebrando'), { once: true });

        // Toast flotante
        const fmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(incremento);
        const toast = document.createElement('div');
        toast.className = 'saldo-toast';
        toast.textContent = '+' + fmt;

        const rect = badge.getBoundingClientRect();
        toast.style.top = (rect.top + window.scrollY - 4) + 'px';
        toast.style.right = (window.innerWidth - rect.right) + 'px';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);
    }

    let saldoOculto = false;

    function toggleSaldoVisibilidad() {
        saldoOculto = !saldoOculto;
        const cantidad = document.getElementById('saldoCantidad');
        const texto = document.getElementById('btnOcultarTexto');
        const btn = document.getElementById('btnOcultarSaldo');
        if (!cantidad || !btn) return;
        if (saldoOculto) {
            cantidad.textContent = '••••••';
            btn.childNodes[0].textContent = '🙈 ';
            if (texto) texto.textContent = 'Mostrar';
        } else {
            const saldo = parseInt(localStorage.getItem('saldo_asesor_' + nombreAsesorActual) || '0');
            actualizarDisplaySaldo(saldo);
            btn.childNodes[0].textContent = '👁 ';
            if (texto) texto.textContent = 'Ocultar';
        }
    }

    function preguntarReiniciarSaldo() { /* deshabilitado */ }

    function initLogin(){ const s=localStorage.getItem(STORAGE_KEY); if(s) verifyLogin(s,true); }
    $('btnLogin').onclick = ()=> verifyLogin($('loginPwd').value);
    $('btnLogout').onclick = ()=> { localStorage.removeItem(STORAGE_KEY); location.reload(); };
    
    async function verifyLogin(pwd, auto=false){
      if(!pwd) { 
          if(!auto) alert("Por favor ingresa la contraseña."); 
          return; 
      }
      const btn = $('btnLogin'); const msg = $('loginMsg');
      if(!auto) { btn.textContent = 'Verificando...'; btn.disabled = true; msg.textContent = ''; }
      try {
          const req = await fetch('/api/admin/login', {
              method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ contrasena: pwd })
          });
          const res = await req.json();
          if(!auto) { btn.textContent = 'Ingresar'; btn.disabled = false; }
          if(res.status === 'ok') {
              localStorage.setItem(STORAGE_KEY, pwd); 
              $('loginOverlay').style.display='none'; 
              topBar.style.display='block'; 
              $('asesorDisplay').textContent = res.asesor; 
              $('v_contrasena').value = pwd; 
              $('smartInput').focus();
              cargarPlataformas(); // <--- Hace que la lista se llene sola
              cargarSaldoAsesor(res.asesor);
          } else {
              if(!auto) msg.textContent = 'Contraseña incorrecta';
              localStorage.removeItem(STORAGE_KEY);
          }
      } catch (error) {
          if(!auto) { btn.textContent = 'Ingresar'; btn.disabled = false; msg.textContent = 'Error de conexión'; }
      }
    }

    // ==========================================
    // PORTAPAPELES MAGICO
    // ==========================================
    const smartInput = $('smartInput');
    smartInput.addEventListener('paste', (e) => {
        const pasteData = (e.clipboardData || window.clipboardData).getData('text');
        const lines = pasteData.split(/\r?\n/).map(l => l.trim()).filter(l => l);
        if (lines.length >= 3) {
            e.preventDefault();
            activateAppMode(); switchView('view-venta');
            if(lines.length>0) $('v_nombre').value = lines[0];
            if(lines.length>1) $('v_apellido').value = lines[1];
            if(lines.length>2) $('v_ciudad').value = lines[2];
            if(lines.length>3) {
                const nums = lines[3].split(',').map(n=>n.replace(/\D+/g,'')).filter(n=>n);
                numList.innerHTML=''; nums.forEach(n=>numList.appendChild(makeNumPill(n))); if(!nums.length) addDefaultPill();
            }
            if(lines.length>4) $('v_telefono').value = lines[4];
            showModal('Pegado Mágico', 'Datos distribuidos correctamente.'); smartInput.value = '';
        }
    });

    smartInput.onkeydown = (e)=>{ if(e.key==='Enter') runSearch(); };
    $('btnSearch').onclick = runSearch;
    function switchView(id){ document.querySelectorAll('.view-section').forEach(el=>el.classList.remove('active')); $(id).classList.add('active'); resetOcrZone('ocrDrop', 'ocrStatus'); resetOcrZone('ocrDropAbono', 'ocrStatusAbono'); }

    // ==========================================
    // PASTE GLOBAL PARA OCR DE COMPROBANTES
    // Intercepta Ctrl+V con imagen en cualquier punto de la página
    // y lo routea al formulario que esté visible en ese momento
    // ==========================================
    document.addEventListener('paste', (e) => {
        const items = (e.clipboardData || window.clipboardData)?.items;
        if (!items) return;
        const hasImage = Array.from(items).some(i => i.type.startsWith('image'));
        if (!hasImage) return; // Solo actúa si hay imagen; el texto lo maneja smartInput

        const paySection = $('paymentSections');
        const abonoSection = $('zonaPagosAbono');

        if (paySection && paySection.style.display !== 'none') {
            e.preventDefault();
            handleOCR(e, 'ocrStatus', 'v_idTransferencia', 'v_referenciaAbono', 'v_primerAbono', 'v_metodoPago', 'feedbackTransfer');
        } else if (abonoSection && abonoSection.style.display !== 'none') {
            e.preventDefault();
            handleOCR(e, 'ocrStatusAbono', 'a_idTransferencia', 'a_ref', 'a_monto', 'a_metodo', 'feedbackTransferAbono');
        }
    });

    // ==========================================
    // OCR: LECTURA DE COMPROBANTES
    // ==========================================
    async function preprocessBlobToCanvas(blob){
      return new Promise((resolve)=>{
        const img = new Image(); img.onload = ()=>{
          const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          const scale = Math.min(1.5, 1200 / Math.max(w,h));
          const W = Math.round(w*scale), H = Math.round(h*scale);
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, W, H); resolve(cv);
        }; img.onerror = ()=> resolve(null); img.src = URL.createObjectURL(blob);
      });
    }
    function extractRefFromText(txt){ return (txt.toUpperCase().match(/[A-Z0-9]{6,24}/g) || [])[0] || ''; }

    // NUEVA FUNCIÓN: Busca automáticamente en la base de datos
    async function autoBuscarPorReferencia(refVal, refId, montoId, metodoId, feedbackId, statusId) {
        try {
            const req = await fetch('/api/admin/transferencias', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ referencia: refVal })
            });
            const res = await req.json();
            
            if(res.status === 'ok' && res.lista.length > 0) {
                const t = res.lista[0];
                if(t.status === 'LIBRE') {
                    // Si la encuentra y está libre, la auto-selecciona y bloquea los campos
                    seleccionarTransferencia(refId, montoId, metodoId, feedbackId, t.referencia, t.monto, t.plataforma);
                    document.getElementById(statusId).textContent = "¡Datos encontrados y cargados! ✅";
                } else {
                    document.getElementById(statusId).textContent = "⚠️ La transferencia " + refVal + " ya está " + t.status;
                }
            } else {
                document.getElementById(statusId).textContent = "Ref: " + refVal + " (No encontrada en Base de Datos)";
            }
        } catch (e) {
            document.getElementById(statusId).textContent = "Ref: " + refVal + " (Error buscando en BD)";
        }
    }

    async function handleOCR(e, statusId, targetIdOculto, refId, montoId, metodoId, feedbackId) {
        const items = (e.clipboardData || e.originalEvent?.clipboardData || e.clipboardData).items;
        let blob = null;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") === 0) blob = items[i].getAsFile();
        }
        
        if (!blob) return;
        
        // Mostrar preview de la imagen pegada inmediatamente en el área OCR
        const dropElId = statusId === 'ocrStatus' ? 'ocrDrop' : 'ocrDropAbono';
        const dropEl = document.getElementById(dropElId);
        const localUrl = URL.createObjectURL(blob);

        const setStatus = (html) => {
            const el = document.getElementById(statusId);
            if (el) el.innerHTML = html;
        };

        if (dropEl) {
            dropEl.innerHTML = `
                <img src="${localUrl}" onclick="mostrarFoto('${localUrl}')" 
                     style="max-height:130px; max-width:100%; border-radius:8px; cursor:zoom-in; display:block; margin:0 auto; box-shadow:0 2px 10px rgba(0,0,0,0.15);">
                <span id="${statusId}" style="color:var(--muted); display:block; margin-top:8px; font-size:0.85rem; text-align:center;">🤖 IA leyendo comprobante...</span>`;
        }

        const telefonoAUsar = document.getElementById('v_telefono') ? document.getElementById('v_telefono').value : '';
        
        try {
            const base64 = await convertirABase64(blob);
            
            const reqIA = await fetch('/api/admin/procesar-ia', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ imagenBase64: base64, contrasena: localStorage.getItem(STORAGE_KEY), soloConsulta: true })
            });
            const resIA = await reqIA.json();
            
            // ── Helpers para los callbacks de aceptar/rechazar ──────────────
            const aceptarTransferencia = (t, fotoFinal) => {
                const dropEl2 = document.getElementById(dropElId);
                if (dropEl2) {
                    dropEl2.innerHTML = `
                        <img src="${fotoFinal}" onclick="mostrarFoto('${fotoFinal}')"
                             style="max-height:130px; max-width:100%; border-radius:8px; cursor:zoom-in; display:block; margin:0 auto; box-shadow:0 4px 16px rgba(0,0,0,0.15); border:2px solid var(--accent);">
                        <span id="${statusId}" style="display:block; margin-top:8px; font-size:0.85rem; text-align:center;"></span>`;
                }
                seleccionarTransferencia(targetIdOculto, refId, montoId, metodoId, feedbackId, t.id, t.referencia, t.monto, t.plataforma, fotoFinal);
                setStatus('<span style="color:var(--accent-2); font-weight:bold;">¡Pago enlazado y asegurado! ✅</span>');
            };

            const rechazarTransferencia = () => {
                const dropEl2 = document.getElementById(dropElId);
                if (dropEl2) {
                    dropEl2.innerHTML = `<span id="${statusId}" style="display:block; text-align:center; font-size:0.9rem; color:var(--muted);">📋 Pega la imagen del comprobante aquí (Ctrl+V)</span>`;
                }
                setStatus('<span style="color:var(--danger);">Rechazado. Pega otra imagen para intentar de nuevo.</span>');
            };

            if (resIA.status === 'duplicado') {
                // La transferencia existe en el sistema — buscar y mostrar sugerencia
                setStatus('<span style="color:var(--ink-2);">🔍 Verificando que esté disponible...</span>');
                const reqB = await fetch('/api/admin/buscar-transferencia-ia', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ datos_ia: resIA.clon, telefono_cliente: telefonoAUsar, contrasena: localStorage.getItem(STORAGE_KEY) })
                });
                const resB = await reqB.json();

                if (resB.status === 'ok') {
                    const t = resB.transferencia;
                    const fotoFinal = (t.url_comprobante && t.url_comprobante !== 'null') ? t.url_comprobante : null;
                    mostrarSugerencia(
                        dropElId, statusId, t, fotoFinal,
                        () => aceptarTransferencia(t, fotoFinal || localUrl),
                        rechazarTransferencia
                    );
                } else {
                    // No está LIBRE — usar el clon que ya identificó procesar-ia (es el correcto)
                    const clon = resIA.clon;
                    if (clon && clon.estado && clon.estado !== 'LIBRE') {
                        const montoFmt = new Intl.NumberFormat('es-CO').format(clon.monto);
                        setStatus(`<span style="color:var(--danger); font-weight:bold;">❌ Esta transferencia ($${montoFmt} · Ref: ${clon.referencia}) ya está ${clon.estado}. No puede reutilizarse.</span>`);
                    } else {
                        setStatus('<span style="color:var(--danger); font-weight:bold;">❌ ' + resB.mensaje + '</span>');
                    }
                }

            } else if (resIA.status === 'no_encontrada') {
                // Aunque procesar-ia no detectó duplicado, intentar buscar por hora+plataforma
                // (cubre el caso Nequi -> Bancolombia donde la referencia guardada es el teléfono)
                if (resIA.datosExtraidos && resIA.datosExtraidos.monto) {
                    setStatus('<span style="color:var(--ink-2);">🔍 Buscando transferencia equivalente en el sistema...</span>');
                    try {
                        const reqB = await fetch('/api/admin/buscar-transferencia-ia', {
                            method: 'POST', headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                datos_ia: resIA.datosExtraidos,
                                telefono_cliente: telefonoAUsar,
                                contrasena: localStorage.getItem(STORAGE_KEY)
                            })
                        });
                        const resB = await reqB.json();

                        if (resB.status === 'ok') {
                            const t = resB.transferencia;
                            const fotoFinal = (t.url_comprobante && t.url_comprobante !== 'null') ? t.url_comprobante : null;
                            mostrarSugerencia(
                                dropElId, statusId, t, fotoFinal,
                                () => aceptarTransferencia(t, fotoFinal || localUrl),
                                rechazarTransferencia
                            );
                        } else {
                            setStatus(`<span style="color:var(--danger); font-weight:600;">❌ ${resIA.mensaje}</span>`);
                        }
                    } catch (errB) {
                        setStatus(`<span style="color:var(--danger); font-weight:600;">❌ ${resIA.mensaje}</span>`);
                    }
                } else {
                    setStatus(`<span style="color:var(--danger); font-weight:600;">❌ ${resIA.mensaje}</span>`);
                }

            } else {
                setStatus('<span style="color:var(--danger); font-weight:bold;">❌ IA falló: ' + resIA.mensaje + '</span>');
            }
            
        } catch (error) {
            setStatus('<span style="color:var(--danger);">Error: ' + error.message + '</span>');
        }
    }

    function mostrarFoto(url) {
        const modal = document.getElementById('fotoModal');
        const img = document.getElementById('fotoModalImg');
        img.src = url;
        modal.style.display = 'flex';
    }

    function mostrarSugerencia(dropElId, statusId, t, fotoFinal, onAceptar, onRechazar) {
        const dropEl = document.getElementById(dropElId);
        if (!dropEl) return;
        const montoFmt = new Intl.NumberFormat('es-CO').format(t.monto);
        const fecha = t.fecha_pago + (t.hora_pago ? ' a las ' + t.hora_pago.substring(0,5) : '');

        dropEl.innerHTML = `
            <div style="display:grid; gap:8px; margin-top:4px;">
                <div id="sugerCard_${dropElId}" style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--ring); padding:10px; border-radius:10px; cursor:pointer; background:#fff; text-align:left; transition:background 0.2s;">
                    <div>
                        <div style="font-weight:600; color:var(--ink-2); font-size:0.9rem;">${t.plataforma} - $${montoFmt}</div>
                        <div style="font-size:0.8rem; color:var(--muted);">Ref: ${t.referencia} | Fecha: ${fecha}</div>
                        <div style="font-size:0.75rem; color:var(--accent-2); font-weight:500; margin-top:4px;">LIBRE</div>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                        ${fotoFinal ? `<button id="sugerVerFoto_${dropElId}" style="background:var(--pill); color:var(--accent-2); border:1px solid var(--accent); padding:6px 12px; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:pointer;">👁️ Ver Foto</button>` : ''}
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button id="sugerBtnRechazar_${dropElId}" style="flex:1; padding:9px; border:1.5px solid #d95a53; background:#fff; color:#d95a53; border-radius:8px; font-size:0.85rem; font-weight:600; cursor:pointer;">✕ No es este</button>
                    <button id="sugerBtnAceptar_${dropElId}" style="flex:2; padding:9px; border:none; background:#2d6b25; color:#fff; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer;">✓ Usar este pago</button>
                </div>
            </div>
            <span id="${statusId}" style="display:none;"></span>`;

        const btnA = document.getElementById(`sugerBtnAceptar_${dropElId}`);
        const btnR = document.getElementById(`sugerBtnRechazar_${dropElId}`);
        const btnFoto = document.getElementById(`sugerVerFoto_${dropElId}`);
        const card = document.getElementById(`sugerCard_${dropElId}`);

        if (btnA) btnA.onclick = onAceptar;
        if (btnR) btnR.onclick = onRechazar;
        if (btnFoto) btnFoto.onclick = (e) => { e.stopPropagation(); mostrarFoto(fotoFinal); };
        if (card) card.onclick = onAceptar;
        if (card) { card.onmouseover = () => card.style.background = 'var(--bg)'; card.onmouseout = () => card.style.background = '#fff'; }
    }
    
    // ==========================================
    // BUSCADOR INTELIGENTE DE TRANSFERENCIAS
    // ==========================================
    function seleccionarTransferencia(targetIdTransferencia, refId, montoId, metodoId, feedbackId, idReal, refVal, montoVal, metodoVal, urlFoto) {
        var idInput = document.getElementById(targetIdTransferencia);
        var refInput = document.getElementById(refId); 
        var montoInput = document.getElementById(montoId); 
        var metodoInput = document.getElementById(metodoId);
        
        if(idInput) idInput.value = idReal; 
        refInput.value = refVal; montoInput.value = montoVal; metodoInput.value = metodoVal;
        refInput.readOnly = true; montoInput.readOnly = true; metodoInput.readOnly = true;
        refInput.style.backgroundColor = "var(--pill)"; montoInput.style.backgroundColor = "var(--pill)"; metodoInput.style.backgroundColor = "var(--pill)";
        
        // Creamos el mensaje con el botón de la foto si existe
        let htmlFeedback = '<span style="color:var(--accent-2); font-weight:600; font-size: 0.9rem;">✅ Pago enlazado y asegurado. </span>';
        
        if (urlFoto && urlFoto !== 'null' && urlFoto !== 'undefined') {
            htmlFeedback += `<button onclick="mostrarFoto('${urlFoto}')" style="margin-left:10px; background:var(--pill); color:var(--accent-2); border:1px solid var(--accent); padding:4px 10px; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='var(--accent)'; this.style.color='#fff';" onmouseout="this.style.background='var(--pill)'; this.style.color='var(--accent-2)';">👁️ Ver Foto</button> `;
        }
        
        htmlFeedback += '<span style="color:var(--danger); cursor:pointer; font-size:0.85rem; font-weight:500; text-decoration:underline; margin-left:15px;" onclick="desbloquearCampos(\''+targetIdTransferencia+'\', \'' + refId + '\', \'' + montoId + '\', \'' + metodoId + '\', \'' + feedbackId + '\')">Quitar</span>';
        
        document.getElementById(feedbackId).innerHTML = htmlFeedback;
    }

    function desbloquearCampos(targetIdTransferencia, refId, montoId, metodoId, feedbackId) {
        var idInput = document.getElementById(targetIdTransferencia);
        var refInput = document.getElementById(refId); var montoInput = document.getElementById(montoId); var metodoInput = document.getElementById(metodoId);
        if(idInput) idInput.value = "";
        refInput.readOnly = false; montoInput.readOnly = false; metodoInput.readOnly = false;
        refInput.value = ""; montoInput.value = ""; metodoInput.value = "";
        refInput.style.backgroundColor = "transparent"; montoInput.style.backgroundColor = "transparent"; metodoInput.style.backgroundColor = "transparent";
        if(feedbackId) document.getElementById(feedbackId).innerHTML = '';
    }

    async function buscarTransferenciasUI(btnId, fechaId, horaId, montoIdFiltro, refIdFiltro, plataformaIdFiltro, estadoIdFiltro, feedbackId, targetRefId, targetMontoId, targetMetodoId) {
        var fechaVal = document.getElementById(fechaId).value; 
        var horaVal = document.getElementById(horaId).value;
        var montoVal = document.getElementById(montoIdFiltro).value;
        var refVal = document.getElementById(refIdFiltro).value;
        var platVal = document.getElementById(plataformaIdFiltro).value; 
        var estadoVal = document.getElementById(estadoIdFiltro).value; // ✨ NUEVO: Capturamos el estado
        var fb = document.getElementById(feedbackId);
        var btn = document.getElementById(btnId);

        // Si solo se selecciona el estado, pedimos más info para no sobrecargar el servidor
        if(!fechaVal && !montoVal && !refVal && !horaVal && !platVal) { fb.innerHTML = "<span class='hint err'>Ingresa al menos un dato de búsqueda (fecha, ref, monto...).</span>"; return; }

        var originalTxt = btn.textContent;
        btn.textContent = "Buscando..."; btn.disabled = true; fb.innerHTML = "";

        // Empacamos los datos
        var payload = { fecha: fechaVal, hora: horaVal, monto: montoVal, referencia: refVal, plataforma: platVal };

        try {
            const req = await fetch('/api/admin/transferencias', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const res = await req.json();

            btn.textContent = originalTxt; btn.disabled = false;

            if(res.status === 'ok') {
                // ✨ NUEVO: FILTRADO LOCAL POR ESTADO
                let listaFiltrada = res.lista;
                if(estadoVal === 'LIBRE') {
                    listaFiltrada = listaFiltrada.filter(t => t.status === 'LIBRE');
                } else if(estadoVal === 'ASIGNADA') {
                    listaFiltrada = listaFiltrada.filter(t => t.status !== 'LIBRE');
                }

                if(listaFiltrada.length === 0) {
                    fb.innerHTML = "<span class='hint err'>No se encontraron transferencias con esos filtros.</span>";
                } else {
                    var html = '<div style="display:grid; gap:8px; margin-top:10px;">';
                    for(var i=0; i<listaFiltrada.length; i++){
                        var t = listaFiltrada[i];
                        var montoFmt = new Intl.NumberFormat('es-CO').format(t.monto);
                        var refSafe = t.referencia ? t.referencia.replace(/'/g, "\\'") : ''; 
                        var platSafe = t.plataforma ? t.plataforma.replace(/'/g, "\\'") : '';
                        var esLibre = t.status === 'LIBRE';
                        let idOculto = targetRefId === 'v_referenciaAbono' ? 'v_idTransferencia' : 'a_idTransferencia'; 
                        let urlSegura = t.url_comprobante ? t.url_comprobante : '';
                        
                        if (esLibre) {
                            // Tarjeta clickeable (transferencia disponible)
                            html += '<div style="display:flex; justify-content:space-between; align-items:center; border:1px solid var(--ring); padding:10px; border-radius:10px; cursor:pointer; background:#fff; text-align:left; transition:background 0.2s;"';
                            html += ' onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'#fff\'"';
                            html += ' onclick="seleccionarTransferencia(\'' + idOculto + '\', \'' + targetRefId + '\', \'' + targetMontoId + '\', \'' + targetMetodoId + '\', \'' + feedbackId + '\', \'' + t.id + '\', \'' + refSafe + '\', ' + t.monto + ', \'' + platSafe + '\', \'' + urlSegura + '\')">';
                        } else {
                            // Tarjeta bloqueada (transferencia ya asignada)
                            html += '<div style="display:flex; justify-content:space-between; align-items:center; border:1px solid #e0e0e0; padding:10px; border-radius:10px; cursor:not-allowed; background:#f5f5f5; text-align:left; opacity:0.65;">';
                        }
                        
                        // Lado izquierdo: Textos de la transferencia
                        html += '<div>';
                        html += '<div style="font-weight:600; color:' + (esLibre ? 'var(--ink-2)' : '#999') + '; font-size:0.9rem;">' + t.plataforma + ' - $' + montoFmt + '</div>';
                        html += '<div style="font-size:0.8rem; color:var(--muted);">Ref: ' + t.referencia + ' | Fecha: ' + t.fecha + '</div>';
                        if (esLibre) {
                            html += '<div style="font-size:0.75rem; color:var(--accent-2); font-weight:600; margin-top:4px;">LIBRE ✓</div>';
                        } else {
                            html += '<div style="font-size:0.75rem; color:var(--danger); font-weight:600; margin-top:4px;">🔒 ' + (t.status || 'ASIGNADA') + '</div>';
                        }
                        html += '</div>';

                        // Lado derecho: Botón de "Ver Foto" o candado si asignada
                        html += '<div style="display:flex; align-items:center; gap:8px;">';
                        if (!esLibre) {
                            html += '<span style="font-size:1.2rem; color:#bbb;" title="No disponible">🔒</span>';
                        }
                        if (t.url_comprobante) {
                            html += `<button onclick="event.stopPropagation(); mostrarFoto('${t.url_comprobante}')" style="background:var(--pill); color:var(--accent-2); border:1px solid var(--accent); padding:6px 12px; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='var(--accent)'; this.style.color='#fff';" onmouseout="this.style.background='var(--pill)'; this.style.color='var(--accent-2)';">👁️ Ver Foto</button>`;
                        }
                        html += '</div>';

                        html += '</div>';
                    }
                    html += '</div>';
                    fb.innerHTML = html;
                }
            } else {
                fb.innerHTML = "<span class='hint err'>Error: " + res.mensaje + "</span>";
            }
        } catch(e) {
            btn.textContent = originalTxt; btn.disabled = false;
            fb.innerHTML = "<span class='hint err'>Error de conexión.</span>";
        }
    }


    // ==========================================
    // BUSCADOR EXCLUSIVO DE REFERENCIAS Y LIBERACIÓN
    // ==========================================
    async function buscarReferenciaEspecifica() {
        const ref = document.getElementById('inputBuscarRef').value.trim();
        const div = document.getElementById('resultadoReferencia');
        const btn = document.getElementById('btnBuscarRef');

        if(!ref) return alert('Por favor ingresa una referencia para buscar.');

        btn.textContent = "Buscando..."; btn.disabled = true;
        div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">Buscando en base de datos...</p>';

        try {
            const req = await fetch('/api/admin/buscar-referencia', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ referencia: ref, contrasena: localStorage.getItem(STORAGE_KEY) })
            });
            const res = await req.json();

            btn.textContent = "Buscar Referencia"; btn.disabled = false;

            if(res.status !== 'ok') {
                div.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem; font-weight:500;">${res.mensaje}</p>`;
                return;
            }

            const formatMoney = new Intl.NumberFormat('es-CO').format(res.transferencia?.monto || res.data?.monto || 0);

            if (res.tipo === 'LIBRE') {
                div.innerHTML = `
                  <div style="background:var(--pill); border:1px solid var(--ring-strong); padding:16px; border-radius:12px;">
                     <div style="font-weight:600; color:var(--ink); font-size:1.05rem;">${res.data.plataforma} - $${formatMoney}</div>
                     <div style="color:var(--muted); font-size:0.85rem; margin-top:4px;">Ref: ${res.data.referencia} | Fecha: ${new Date(res.data.fecha_pago).toLocaleDateString('es-CO')}</div>
                     <div style="margin-top:12px; display:inline-block; background:#e8f5e9; color:#2e7d32; padding:4px 12px; border-radius:8px; font-size:0.8rem; font-weight:600;">Estado: LIBRE</div>
                     <p style="font-size:0.8rem; color:var(--muted); margin-top:8px; margin-bottom:0;">Esta transferencia no está asignada a nadie, está lista para usarse.</p>
                  </div>
                `;
            } else if (res.tipo === 'ASIGNADA') {
                div.innerHTML = `
                  <div style="background:var(--bg); border:1px solid var(--ring-strong); padding:16px; border-radius:12px;">
                     <div style="font-weight:600; color:var(--ink); font-size:1.05rem;">${res.transferencia.plataforma} - $${formatMoney}</div>
                     <div style="color:var(--muted); font-size:0.85rem; margin-top:4px;">Ref: ${res.transferencia.referencia} | Fecha: ${new Date(res.transferencia.fecha_pago).toLocaleDateString('es-CO')}</div>
                     <div style="margin-top:12px; display:inline-block; background:var(--danger-bg); color:var(--danger); padding:4px 12px; border-radius:8px; font-size:0.8rem; font-weight:600;">Asignada a Boleta: ${res.abono.numero_boleta}</div>
                     
                     <button onclick="liberarReferenciaDesdeBusqueda('${res.abono.id}')" style="margin-top:16px; width:100%; background:transparent; border:1px solid var(--danger); color:var(--danger); padding:10px; border-radius:10px; font-weight:600; cursor:pointer; font-family:inherit; transition:0.2s;" onmouseover="this.style.background='var(--danger-bg)'" onmouseout="this.style.background='transparent'">
                         Liberar y Desasignar
                     </button>
                  </div>
                `;
            } else {
               div.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem; font-weight:500;">La transferencia está marcada como asignada, pero no se encontró la boleta vinculada.</p>`;
            }

        } catch(e) {
            btn.textContent = "Buscar Referencia"; btn.disabled = false;
            div.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem; font-weight:500;">Error de conexión.</p>`;
        }
    }

    async function liberarReferenciaDesdeBusqueda(idAbono) {
        if(!confirm("¿Seguro que deseas liberar esta transferencia? Esto eliminará el abono de la boleta y el cliente perderá este dinero en su deuda.")) return;

        try {
            // Reutilizamos tu API mágica de eliminar-abono que ya hace todo esto perfecto
            const req = await fetch('/api/admin/eliminar-abono', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: idAbono, contrasena: localStorage.getItem(STORAGE_KEY) })
            });
            const res = await req.json();
            
            if(res.status === 'ok') {
                showModal('Liberación Exitosa', 'El abono fue eliminado, la boleta fue actualizada y la transferencia volvió a quedar libre.');
                document.getElementById('resultadoReferencia').innerHTML = '';
                document.getElementById('inputBuscarRef').value = '';
            } else {
                showModal('Error', res.mensaje);
            }
        } catch(e) {
            showModal('Error', 'Error de conexión.');
        }
    }


    // ==========================================
    // CONEXION A VERCEL (BUSQUEDA, VENTA, ABONO)
    // ==========================================
    let esVentaPendiente = false; let esAbonoPendiente = false;
    $('btnForzarPendiente').onclick = ()=>{ if(!$('v_referenciaAbono').value) return alert('Pon referencia'); esVentaPendiente=true; $('feedbackTransfer').textContent='Modo Pendiente Activo'; };
    $('btnForzarPendienteAbono').onclick = ()=>{ if(!$('a_ref').value) return alert('Pon referencia'); esAbonoPendiente=true; $('feedbackTransferAbono').textContent='Modo Pendiente Activo'; };

    async function runSearch(){
      const q = smartInput.value.trim(); if(!q) return;
      feedback.textContent = "Buscando...";

      // --- NUEVO: LIMPIAR CAJAS DE PAGO INTELIGENTE AL BUSCAR ---
      
      // 1. Limpiamos los campos de la vista de "Boletas a separar" (Ventas)
      if(document.getElementById('t_ref')) document.getElementById('t_ref').value = '';
      if(document.getElementById('t_monto')) document.getElementById('t_monto').value = '';
      if(document.getElementById('t_fecha')) document.getElementById('t_fecha').value = '';
      if(document.getElementById('t_hora')) document.getElementById('t_hora').value = '';
      if(document.getElementById('t_plataforma')) document.getElementById('t_plataforma').value = '';
      if(document.getElementById('t_estado')) document.getElementById('t_estado').value = ''; // ✨ AQUÍ SE LIMPIA EL FILTRO NUEVO
      if(document.getElementById('ocrStatus')) document.getElementById('ocrStatus').textContent = '';
      if(document.getElementById('feedbackTransfer')) document.getElementById('feedbackTransfer').innerHTML = '';
      
      // 2. Limpiamos los campos de la vista de "Cliente Encontrado" (Abonos)
      if(document.getElementById('t_ref_abono')) document.getElementById('t_ref_abono').value = '';
      if(document.getElementById('t_monto_abono')) document.getElementById('t_monto_abono').value = '';
      if(document.getElementById('t_fecha_abono')) document.getElementById('t_fecha_abono').value = '';
      if(document.getElementById('t_hora_abono')) document.getElementById('t_hora_abono').value = '';
      if(document.getElementById('t_plataforma_abono')) document.getElementById('t_plataforma_abono').value = '';
      if(document.getElementById('t_estado_abono')) document.getElementById('t_estado_abono').value = ''; // ✨ AQUÍ SE LIMPIA EL FILTRO NUEVO
      if(document.getElementById('ocrStatusAbono')) document.getElementById('ocrStatusAbono').textContent = '';
      if(document.getElementById('feedbackTransferAbono')) document.getElementById('feedbackTransferAbono').innerHTML = '';

      // 3. Desbloqueamos los campos por si había un pago cargado previamente
      desbloquearCampos('v_referenciaAbono', 'v_primerAbono', 'v_metodoPago', 'feedbackTransfer');
      desbloquearCampos('a_ref', 'a_monto', 'a_metodo', 'feedbackTransferAbono');

      try {
        const response = await fetch('/api/admin/buscar?q=' + encodeURIComponent(q));
        const res = await response.json();
        feedback.textContent = "";
        if(res.tipo === 'ERROR_SERVIDOR') return showModal('Error', res.mensaje);
        if(res.tipo !== 'NO_EXISTE') activateAppMode();
        if(res.tipo==='BOLETA_DISPONIBLE'){ switchView('view-venta'); numList.innerHTML=''; numList.appendChild(makeNumPill(res.data.numero)); $('v_nombre').focus(); } 
        else if(res.tipo==='BOLETA_OCUPADA'){ switchView('view-cliente'); renderClienteInfo([res.data.infoVenta]); } 
        else if(res.tipo==='CLIENTE_ENCONTRADO'){ switchView('view-cliente'); renderClienteInfo(res.lista); } 
        else if(res.tipo==='CLIENTE_SIN_BOLETAS') {
            // 1. Escribimos el mensaje en el cuadro bonito y lo mostramos
            $('mcMsg').innerHTML = `El cliente <b>${res.data.nombre || ''} ${res.data.apellido || ''}</b> está registrado, pero NO tiene boletas en este momento.<br><br>¿Deseas agregarle nuevas boletas?`;
            $('modalConfirmAction').style.display = 'flex';
            
            // 2. Si el asesor presiona "Sí, agregar"
            $('mcBtnOk').onclick = function() {
                $('modalConfirmAction').style.display = 'none'; // Cierra el cuadro
                activateAppMode();
                switchView('view-venta');
                $('v_nombre').value = res.data.nombre || '';
                $('v_apellido').value = res.data.apellido || '';
                $('v_telefono').value = res.data.telefono || '';
                $('v_ciudad').value = res.data.ciudad || '';
                
                numList.innerHTML = '';
                addDefaultPill(); // Prepara el espacio para escribir la boleta
                setMode('separar');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            
            // 3. Si el asesor presiona "Cancelar"
            $('mcBtnCancel').onclick = function() {
                $('modalConfirmAction').style.display = 'none'; // Cierra el cuadro
                $('smartInput').value = '';
                $('smartInput').focus();
            };
        }
        else { showModal('No encontrado', res.mensaje || 'Intenta de nuevo'); }
      } catch (err) { feedback.textContent = ""; showModal('Error', err.message); }
    }

$('btnRegistrarVenta').onclick = async ()=>{
       const nums = Array.from(numList.querySelectorAll('input')).map(i=>i.value).filter(v=>v.length===4);
       if(!nums.length) return alert('Falta boleta válida');
       $('btnRegistrarVenta').textContent='Procesando...'; $('btnRegistrarVenta').disabled=true;
       
       let totalMoney=0, ref='', metodo='';
       if (modoVenta === 'separar') { totalMoney=0; ref='0'; metodo='Separado'; } 
       else { totalMoney=Number($('v_primerAbono').value)||0; ref=$('v_referenciaAbono').value; metodo=$('v_metodoPago').value; }

       const perNum = Math.floor(totalMoney/nums.length);
       const baseData = { 
           nombre: $('v_nombre').value, 
           apellido: $('v_apellido').value, 
           ciudad: $('v_ciudad').value, 
           telefono: $('v_telefono').value, 
           primerAbono: perNum, 
           referenciaAbono: ref, 
           metodoPago: metodo, 
           esPendiente: esVentaPendiente, 
           contrasena: localStorage.getItem(STORAGE_KEY),
           idTransferencia: $('v_idTransferencia').value // <-- ESTO ES LO NUEVO
       };
  
       let ok=0, fails=0;
       let detalleErrores = []; 

       for (let i=0; i < nums.length; i++) {
           try {
               // Solo la primera boleta consume y valida la transferencia.
               // Las siguientes omiten el ID para no chocar con la validación de "ya asignada".
               const ventaPayload = {
                   ...baseData,
                   numeroBoleta: nums[i],
                   idTransferencia: i === 0 ? baseData.idTransferencia : ''
               };
               const req = await fetch('/api/admin/venta', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(ventaPayload) });
               const res = await req.json();
               if(res.status === 'ok') { ok++; actualizarSaldoAsesor(800); } else { fails++; detalleErrores.push(`Boleta ${nums[i]}: ${res.mensaje}`); }
           } catch(e) { fails++; detalleErrores.push(`Boleta ${nums[i]}: Error de conexión`); }
       }
       $('btnRegistrarVenta').textContent= modoVenta === 'separar' ? 'Confirmar Separado ($0)' : 'Registrar Venta'; 
       $('btnRegistrarVenta').disabled=false;
       
       let mensajeFinal = `Registradas: ${ok} / Errores: ${fails}`;
       if (fails > 0) { mensajeFinal += `\n\nMotivos:\n` + detalleErrores.join('\n'); }
       
       $('mMsg').style.whiteSpace = 'pre-line'; 
       showModal('Resumen de Venta', mensajeFinal);
       
       if(fails===0){ 
           // LIMPIEZA DE DATOS PRINCIPALES
           $('v_nombre').value=''; $('v_apellido').value=''; $('v_telefono').value=''; $('v_ciudad').value=''; $('v_primerAbono').value=0; $('v_referenciaAbono').value=''; $('v_metodoPago').value='';
           
           // LIMPIEZA DE BÚSQUEDA INTELIGENTE Y OCR
           if(document.getElementById('t_ref')) document.getElementById('t_ref').value=''; 
           if(document.getElementById('t_monto')) document.getElementById('t_monto').value=''; 
           if(document.getElementById('t_fecha')) document.getElementById('t_fecha').value=''; 
           if(document.getElementById('t_hora')) document.getElementById('t_hora').value='';
           if(document.getElementById('t_plataforma')) document.getElementById('t_plataforma').value='';
           if(document.getElementById('ocrStatus')) document.getElementById('ocrStatus').textContent='';

           desbloquearCampos('v_referenciaAbono', 'v_primerAbono', 'v_metodoPago', 'feedbackTransfer');
           numList.innerHTML=''; addDefaultPill(); activateHeroMode();
       }
    };
    
    async function registrarAbono() {
        const btn = document.getElementById('btnRegistrarAbono');
        const checkboxes = document.querySelectorAll('.boleta-pay-checkbox:checked');
        const boletasTarget = Array.from(checkboxes).map(c => c.value);
        if(boletasTarget.length === 0) return alert("Selecciona al menos una boleta.");

        const ref = document.getElementById('a_ref').value;
        const metodo = document.getElementById('a_metodo').value;

        // Construir mapa de montos según el modo
        let montosPorBoleta = {};
        if (modoDistribucionAbono === 'manual' && boletasTarget.length > 1) {
            const inputs = document.querySelectorAll('.monto-manual-input');
            const totalTransferencia = Number(document.getElementById('a_monto').value) || 0;
            let distribuido = 0;
            let algoCero = false;
            inputs.forEach(inp => {
                const val = Number(inp.value) || 0;
                if (val <= 0) algoCero = true;
                montosPorBoleta[inp.dataset.boleta] = val;
                distribuido += val;
            });
            if (algoCero) return alert("Todos los montos deben ser mayores a 0.");
            if (totalTransferencia > 0 && distribuido !== totalTransferencia) {
                const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.abs(n));
                const diff = totalTransferencia - distribuido;
                if (diff > 0) return alert(`⚠️ Faltan ${fmt(diff)} por asignar. El total distribuido (${fmt(distribuido)}) debe ser igual al total de la transferencia (${fmt(totalTransferencia)}).`);
                else return alert(`🛑 Te pasaste por ${fmt(diff)}. El total distribuido (${fmt(distribuido)}) no puede superar la transferencia (${fmt(totalTransferencia)}).`);
            }
        } else {
            const montoTotal = Number(document.getElementById('a_monto').value);
            if (montoTotal <= 0) return alert("El monto debe ser mayor a 0.");
            const montoPorBoleta = Math.floor(montoTotal / boletasTarget.length);
            boletasTarget.forEach(b => montosPorBoleta[b] = montoPorBoleta);
        }

        const textoOriginal = btn.textContent; btn.textContent = 'Procesando...'; btn.disabled = true;

        const basePayload = {
            metodoPago: metodo,
            referencia: ref || 'efectivo',
            esPendiente: esAbonoPendiente,
            contrasena: localStorage.getItem(STORAGE_KEY),
            idTransferencia: document.getElementById('a_idTransferencia').value
        };

        let ok = 0; let fails = 0;
        let detalleErrores = [];

        for (let i=0; i < boletasTarget.length; i++) {
            try {
               // Solo la primera boleta consume y valida la transferencia (la marca como ASIGNADA).
               // Las siguientes llevan la referencia de texto pero no re-validan el ID para evitar el falso error de "ya asignada".
               const payload = {
                   ...basePayload,
                   numeroBoleta: boletasTarget[i],
                   valorAbono: montosPorBoleta[boletasTarget[i]],
                   idTransferencia: i === 0 ? basePayload.idTransferencia : ''
               };
               const req = await fetch('/api/admin/abono', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
               const res = await req.json();

               if(res.status === 'ok') { ok++; actualizarSaldoAsesor(400); } else { fails++; detalleErrores.push(`Boleta ${boletasTarget[i]}: ${res.mensaje}`); }
            } catch(e) { fails++; detalleErrores.push(`Boleta ${boletasTarget[i]}: Error de conexión del servidor`); }
        }
        
        btn.textContent = textoOriginal; btn.disabled = false;
        
        if (fails === 0) {
            showModal('Éxito', `Abono registrado correctamente.`);
            // LIMPIEZA DE DATOS PRINCIPALES
            document.getElementById('a_monto').value = ''; document.getElementById('a_ref').value = ''; document.getElementById('a_metodo').value = '';
            // Resetear modo de distribución
            modoDistribucionAbono = 'uniforme';
            if(document.getElementById('montosManualContainer')) document.getElementById('montosManualContainer').innerHTML = '';
            if(document.getElementById('toggleModoAbono')) document.getElementById('toggleModoAbono').style.display = 'none';
            if(document.getElementById('bloqueMontosManual')) document.getElementById('bloqueMontosManual').style.display = 'none';
            if(document.getElementById('bloqueMontoUniforme')) document.getElementById('bloqueMontoUniforme').style.display = 'block';
            if(document.getElementById('btnModoUniforme')) { document.getElementById('btnModoUniforme').classList.add('active'); document.getElementById('btnModoManual').classList.remove('active'); }

            // LIMPIEZA DE BÚSQUEDA INTELIGENTE Y OCR DE ABONOS
            document.getElementById('t_ref_abono').value='';
            document.getElementById('t_monto_abono').value='';
            document.getElementById('t_fecha_abono').value='';
            document.getElementById('t_hora_abono').value='';
            if(document.getElementById('ocrStatusAbono')) document.getElementById('ocrStatusAbono').textContent='';

            desbloquearCampos('a_ref', 'a_monto', 'a_metodo', 'feedbackTransferAbono');
            activateHeroMode(); 
        } else { 
            let mensajeFinal = `Se registraron ${ok}, fallaron ${fails}.\n\nMotivos del fallo:\n` + detalleErrores.join('\n');
            document.getElementById('mMsg').style.whiteSpace = 'pre-line';
            showModal('Aviso Importante', mensajeFinal); 
        }
    }

    function renderClienteInfo(lista){
       var c = lista[0]; 
       var boletasStr = [];
       var fmt = function(n) { return new Intl.NumberFormat('es-CO').format(n); };
       
       var html = '';
       
       // 1. CAJITAS DE SELECCIÓN (Desmarcadas si hay más de 1 boleta)
       html += '<div style="margin-bottom: 20px;">';
       html += '<label style="font-size:0.85rem; color:var(--ink-2); font-weight:600; margin-bottom:10px; display:block;">👇 Selecciona a qué boleta(s) vas a abonar:</label>';
       html += '<div style="display: flex; flex-direction: column; gap: 8px;">';

       var autoCheck = lista.length === 1 ? 'checked' : '';

       for(var i=0; i<lista.length; i++){
           var b = lista[i]; 
           var restante = Number(b.restante) || 0;
           boletasStr.push(b.numero);
           
           // Evaluamos si es diaria (2), 3 cifras o apto (4)
           var ticketEsDiaria = String(b.numero).length === 2;
           var ticketEs3Cifras = String(b.numero).length === 3;
           
           html += '<label style="display:flex; align-items:center; gap:8px; background:var(--bg); padding:10px; border-radius:10px; border:1px solid var(--ring-strong); cursor:pointer; font-size:0.9rem; width:100%; transition: 0.2s;">';
           html += '<input type="checkbox" value="' + b.numero + '" class="boleta-pay-checkbox" ' + autoCheck + ' onchange="verificarSeleccionAbonos()" style="accent-color: var(--accent); width:16px; height:16px; flex-shrink:0;">';
           
           // Textos con sus respectivas restas
           if (ticketEsDiaria) {
               html += '<span style="color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;"><b>' + b.numero + '</b> <span style="color:var(--muted); font-size:0.8rem;">(Diaria - Resta $' + fmt(restante) + ')</span></span>';
           } else if (ticketEs3Cifras) {
               html += '<span style="color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;"><b>' + b.numero + '</b> <span style="color:var(--muted); font-size:0.8rem;">(3 Cifras - Resta $' + fmt(restante) + ')</span></span>';
           } else {
               html += '<span style="color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;"><b>' + b.numero + '</b> <span style="color:var(--muted); font-size:0.8rem;">(Apto - Resta $' + fmt(restante) + ')</span></span>';
           }

           // Contenedor de Botones Laterales
           html += '<div style="display:flex; gap:6px; flex-shrink:0;">';
           
           // El botón de copiar link SOLO se muestra si es del Apartamento (4 cifras)
           if (String(b.numero).length === 4) {
               html += '<button type="button" onclick="event.preventDefault(); event.stopPropagation(); copiarLinkBoleta(\'' + b.numero + '\');" style="background:#fff; border:1px solid var(--ring-strong); color:var(--ink-2); padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:500; font-family:inherit; cursor:pointer; transition:0.2s;">Copiar Link</button>';
           }
           
           html += '<button type="button" onclick="event.preventDefault(); event.stopPropagation(); confirmarLiberarBoleta(\'' + b.numero + '\');" style="background:transparent; color:var(--danger); border:1px solid var(--danger); padding:4px 10px; border-radius:6px; font-size:0.75rem; font-weight:500; font-family:inherit; cursor:pointer; transition: 0.2s;">Liberar</button>';
           html += '</div>';
           
           html += '</label>';
       }
       html += '</div></div>';

       // 2. DATOS DEL CLIENTE
       // Revisamos si las boletas tienen un asesor asignado para mostrarlo
       var asesoresVenta = [...new Set(lista.map(b => b.asesor).filter(a => a))].join(', ');
       var htmlAsesor = asesoresVenta ? `<span style="color:var(--accent-2); font-weight:600; font-size:0.75rem; background:var(--pill); padding:2px 8px; border-radius:8px;">👤 Asesor: ${asesoresVenta}</span>` : '';

       html += '<div style="margin-bottom:20px; padding-top: 15px; border-top: 1px solid var(--ring);">';
       
       html += '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">';
       html += '  <label style="font-size:0.85rem; color:var(--ink-2); font-weight:500; margin:0;">Datos personales:</label>';
       html +=    htmlAsesor;
       html += '</div>';
       
       html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px;">';
       html += '  <input id="c_nombre" type="text" class="main-input" style="padding:8px 12px;" value="' + c.nombre + '">';
       html += '  <input id="c_apellido" type="text" class="main-input" style="padding:8px 12px;" value="' + c.apellido + '">';
       html += '</div>';
       html += '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px;">';
       html += '  <input id="c_telefono_display" type="text" class="main-input" style="padding:8px 12px; background:var(--bg); color:var(--muted);" value="' + c.telefono + '" disabled>';
       html += '  <input id="c_ciudad" type="text" class="main-input" style="padding:8px 12px;" value="' + c.ciudad + '">';
       html += '</div>';
       html += '<div style="display:flex; gap:10px; flex-wrap:wrap;">';        html += '  <button type="button" onclick="guardarCambiosCliente(\'' + c.telefono + '\', this)" class="cta" style="flex:1; padding:8px 20px; margin:0; font-size:0.85rem;">Guardar cambios</button>';        html += '  <button type="button" onclick="prepararNuevaVentaExistente(\'' + c.telefono + '\')" class="cta" style="flex:1; padding:8px 20px; margin:0; font-size:0.85rem; background:var(--ink);">➕ Agregar Boletas</button>';        html += '</div>';
       html += '</div>';

       // 3. ZONA DE HISTORIAL DE PAGOS (El bloque rojo global fue eliminado)
       html += '<div style="margin-top: 24px; padding-top: 15px; border-top: 1px solid var(--ring);">';
       html += '  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--ring); padding-bottom: 8px;">';
       html += '    <div style="font-weight: 600; color: var(--ink); font-size: 0.95rem;">HISTORIAL DE PAGOS</div>';
       
       html += '    <select id="boletaSelector" style="background:var(--bg); border:1px solid var(--ring-strong); border-radius:8px; padding:4px 8px; font-weight:500; font-size:0.85rem; color:var(--ink-2); outline:none; font-family:inherit;" onchange="cargarHistorialAbonos(this.value)">';
       for(var i=0; i<boletasStr.length; i++) {
           html += '<option value="'+boletasStr[i]+'">Boleta '+boletasStr[i]+'</option>';
       }
       html += '    </select>';
       html += '  </div>';
       html += '  <div id="historial-abonos-render"><p style="text-align:center; color:var(--muted); font-size:0.85rem; margin:10px 0;">Cargando...</p></div>';
       html += '</div>';
       
       document.getElementById('cliente-info-render').innerHTML = html;

       if(boletasStr.length > 0) cargarHistorialAbonos(boletasStr[0]);
       
       verificarSeleccionAbonos();
    }

    let modoDistribucionAbono = 'uniforme'; // 'uniforme' | 'manual'

    function setModoAbono(modo) {
        modoDistribucionAbono = modo;
        document.getElementById('btnModoUniforme').classList.toggle('active', modo === 'uniforme');
        document.getElementById('btnModoManual').classList.toggle('active', modo === 'manual');
        document.getElementById('bloqueMontosManual').style.display = modo === 'manual' ? 'block' : 'none';
        const lbl = document.getElementById('labelMontoAbono');
        if (lbl) lbl.textContent = modo === 'manual' ? 'Total de la transferencia (referencia)' : 'Valor total a repartir';
        if (modo === 'manual') renderMontosManual();
        else { const r = document.getElementById('totalManualResumen'); if(r) r.innerHTML = ''; }
    }

    function renderMontosManual() {
        const checkboxes = document.querySelectorAll('.boleta-pay-checkbox:checked');
        const container = document.getElementById('montosManualContainer');
        if (!container) return;
        container.innerHTML = '';
        Array.from(checkboxes).forEach(cb => {
            const boleta = cb.value;
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px;';
            row.innerHTML = `
                <span style="min-width:72px; font-weight:600; color:var(--ink); font-size:0.9rem;">Boleta ${boleta}</span>
                <div class="field" style="flex:1; margin:0;">
                  <input type="number" class="pill monto-manual-input" data-boleta="${boleta}" placeholder="0" min="0"
                    oninput="actualizarTotalManual()" style="font-size:0.95rem;">
                </div>`;
            container.appendChild(row);
        });
        actualizarTotalManual();
    }

    function actualizarTotalManual() {
        if (modoDistribucionAbono !== 'manual') return;
        const inputs = document.querySelectorAll('.monto-manual-input');
        const distribuido = Array.from(inputs).reduce((sum, inp) => sum + (Number(inp.value) || 0), 0);
        const totalTransferencia = Number(document.getElementById('a_monto').value) || 0;
        const restante = totalTransferencia - distribuido;
        const resumen = document.getElementById('totalManualResumen');
        const btn = document.getElementById('btnRegistrarAbono');
        if (!resumen) return;

        const fmt = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Math.abs(n));

        if (totalTransferencia === 0) {
            resumen.innerHTML = '';
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
            return;
        }

        if (restante === 0) {
            resumen.innerHTML = `<div class="manual-resumen ok">✅ Todo distribuido correctamente — ${fmt(distribuido)}</div>`;
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        } else if (restante > 0) {
            resumen.innerHTML = `<div class="manual-resumen warn">⚠️ Faltan <b>${fmt(restante)}</b> por asignar — se perderían sin ir a ninguna boleta.</div>`;
            if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
        } else {
            resumen.innerHTML = `<div class="manual-resumen err">🛑 Te pasaste por <b>${fmt(restante)}</b> — el total distribuido supera la transferencia.</div>`;
            if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
        }
    }

    function verificarSeleccionAbonos() {
        const checkboxes = document.querySelectorAll('.boleta-pay-checkbox:checked');
        const zonaPagos = document.getElementById('zonaPagosAbono');
        const lblInfo = document.getElementById('infoDivisionAbono');
        const toggleModo = document.getElementById('toggleModoAbono');

        if (checkboxes.length > 0) {
            const yaVisible = zonaPagos.style.display === 'block';
            zonaPagos.style.display = 'block';
            if (!yaVisible) { resetOcrZone('ocrDropAbono', 'ocrStatusAbono'); modoDistribucionAbono = 'uniforme'; }

            const esMultiple = checkboxes.length > 1;
            if (toggleModo) toggleModo.style.display = esMultiple ? 'block' : 'none';

            if (!esMultiple) {
                // Una sola boleta: volver a modo uniforme silenciosamente
                setModoAbono('uniforme');
            } else if (modoDistribucionAbono === 'manual') {
                renderMontosManual();
            }

            if (lblInfo) {
                if (checkboxes.length === 1) {
                    lblInfo.innerHTML = 'El abono irá 100% a la boleta <b>' + checkboxes[0].value + '</b>.';
                    lblInfo.style.color = 'var(--accent-2)';
                } else if (modoDistribucionAbono === 'uniforme') {
                    lblInfo.innerHTML = '⚠️ El dinero se dividirá uniformemente entre <b>' + checkboxes.length + '</b> boletas.';
                    lblInfo.style.color = 'var(--danger)';
                } else {
                    lblInfo.innerHTML = '✏️ Definiendo montos individuales para <b>' + checkboxes.length + '</b> boletas.';
                    lblInfo.style.color = 'var(--ink-2)';
                }
            }
        } else {
            zonaPagos.style.display = 'none';
        }
    }

    async function copiarLinkBoleta(numero) {
        var link = window.location.origin + '/boleta/' + numero;
        try { 
            await navigator.clipboard.writeText(link); 
            // Mostramos la ventana de aviso amigable
            showModal('¡Link Copiado!', 'Se copió el enlace de la boleta ' + numero + ' correctamente.'); 
        } catch(e) {
            alert('Error al copiar el link de la boleta.');
        }
    }

    async function cargarHistorialAbonos(numero) {
        const div = $('historial-abonos-render');
        div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">Cargando historial...</p>';
        try {
            const req = await fetch('/api/admin/historial?numero=' + numero);
            const res = await req.json();
            if(res.status === 'ok') renderTablaAbonos(res.lista);
            else div.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem;">${res.mensaje}</p>`;
        } catch(e) {
            div.innerHTML = '<p style="text-align:center; color:var(--danger); font-size:0.85rem;">Error cargando historial.</p>';
        }
    }

    function renderTablaAbonos(lista) {
        const div = $('historial-abonos-render');
        if(!lista || lista.length === 0) {
            div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem; margin:10px 0;">No hay abonos registrados.</p>';
            return;
        }

        let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">';
        html += '<thead><tr style="border-bottom:1px solid var(--ring-strong); color: var(--muted); font-weight:500;"><th style="padding:8px 4px;">Fecha</th><th style="padding:8px 4px;">Valor</th><th style="padding:8px 4px;">Ref</th><th style="padding:8px 4px; text-align:right;"></th></tr></thead><tbody>';
        
        lista.forEach(a => {
            const valFmt = new Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', minimumFractionDigits:0}).format(a.monto);
            const fechaLimpia = new Date(a.fecha_pago).toLocaleDateString('es-CO');
            
            html += `<tr style="border-bottom:1px solid var(--ring);">
                        <td style="padding:10px 4px; color:var(--ink-2);">${fechaLimpia}</td>
                        <td style="padding:10px 4px; font-weight:600; color:var(--ink);">${valFmt}</td>
                        <td style="padding:10px 4px; font-size:0.8rem; color:var(--muted); word-break: break-all;">${a.referencia_transferencia || '-'}</td>
                        <td style="padding:10px 4px; text-align:right;">
                            <button style="background:transparent; border:none; color:var(--danger); font-size:0.8rem; cursor:pointer; font-weight:500; font-family:inherit; padding:0;" 
                                onclick="confirmarEliminarAbono('${a.id}', this)">Borrar</button>
                        </td>
                    </tr>`;
        });
        html += '</tbody></table></div>';
        div.innerHTML = html;
    }

    async function confirmarEliminarAbono(idAbono, btnElement) {
        if(!confirm("¿Seguro de eliminar este abono? Si usó una transferencia de banco, quedará LIBRE nuevamente.")) return;
        
        btnElement.textContent = '...';
        btnElement.disabled = true;
        
        try {
            const req = await fetch('/api/admin/eliminar-abono', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ id: idAbono, contrasena: localStorage.getItem(STORAGE_KEY) })
            });
            const res = await req.json();
            
            if(res.status === 'ok') {
                showModal('Eliminado', 'Abono eliminado y saldos re-calculados.');
                runSearch(); 
            } else {
                showModal('Error', res.mensaje);
                btnElement.textContent = 'Borrar'; btnElement.disabled = false;
            }
        } catch(e) {
            showModal('Error', 'Error de conexión.');
            btnElement.textContent = 'Borrar'; btnElement.disabled = false;
        }
    }

    async function guardarCambiosCliente(telefono, btnElement) {
        const nombre = document.getElementById('c_nombre').value;
        const apellido = document.getElementById('c_apellido').value;
        const ciudad = document.getElementById('c_ciudad').value;
        const originalText = btnElement.innerHTML;

        btnElement.innerHTML = 'Guardando...';
        btnElement.disabled = true;

        try {
            const req = await fetch('/api/admin/actualizar-cliente', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    telefono: telefono,
                    nombre: nombre,
                    apellido: apellido,
                    ciudad: ciudad,
                    contrasena: localStorage.getItem(STORAGE_KEY)
                })
            });
            const res = await req.json();

            if (res.status === 'ok') {
                showModal('Guardado', res.mensaje);
            } else {
                showModal('Error', res.mensaje);
            }
        } catch(e) {
            showModal('Error', 'Error de conexión.');
        }
        
        btnElement.innerHTML = originalText;
        btnElement.disabled = false;
    }
    
    function showModal(title,msg){ $('mTitle').textContent=title; $('mMsg').textContent=msg; $('modalResult').style.display='flex'; }
    $('mBtn').onclick = function(){ $('modalResult').style.display='none'; };
    document.addEventListener('DOMContentLoaded', function() { initLogin(); if(typeof addDefaultPill === 'function') addDefaultPill(); $('loginPwd').addEventListener('keyup', function(e) { if (e.key === 'Enter') verifyLogin(this.value); }); });
  

async function confirmarLiberarBoleta(numero) {
        if(!confirm(`ATENCIÓN: ¿Seguro que quieres LIBERAR la boleta ${numero}? \n\nSe borrará su historial de pagos, se liberarán transferencias asociadas y podrá ser vendida de nuevo.`)) return;
        
        const btn = document.getElementById('btnRegistrarAbono'); 
        const originalText = btn.textContent;
        btn.textContent = `Liberando boleta ${numero}...`;
        btn.disabled = true;
        
        try {
            const req = await fetch('/api/admin/liberar-boleta', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ numeroBoleta: numero, contrasena: localStorage.getItem(STORAGE_KEY) })
            });
            const res = await req.json();
            
            if(res.status === 'ok') {
                showModal('Boleta Liberada', res.mensaje);
                activateHeroMode(); 
            } else {
                showModal('Error', res.mensaje);
            }
        } catch(e) {
            showModal('Error', 'Error de conexión.');
        }
        btn.textContent = originalText;
        btn.disabled = false;
    }
    
// ==========================================
    // HISTORIAL GLOBAL DE ÚLTIMOS MOVIMIENTOS
    // ==========================================
    async function cargarUltimosMovimientos() {
        const div = document.getElementById('tablaMovimientosRender');
        div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">Cargando movimientos...</p>';
        
        try {
            const req = await fetch('/api/admin/ultimos-movimientos', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ contrasena: localStorage.getItem(STORAGE_KEY) })
            });
            const res = await req.json();
            
            if (res.status === 'ok') {
                if(res.lista.length === 0) {
                    div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">No hay movimientos recientes.</p>';
                    return;
                }

                let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">';
                html += '<thead><tr style="border-bottom:1px solid var(--ring-strong); color: var(--muted); font-weight:500;"><th style="padding:8px 4px;">Fecha</th><th style="padding:8px 4px;">Asesor</th><th style="padding:8px 4px;">Acción</th><th style="padding:8px 4px;">Boleta</th><th style="padding:8px 4px;">Detalle</th></tr></thead><tbody>';
                
                res.lista.forEach(m => {
                    let fechaString = m.created_at;
if (!fechaString.includes('Z') && !fechaString.includes('+')) {
    fechaString += 'Z';
}
const fechaObj = new Date(fechaString);
const opcionesFecha = { timeZone: 'America/Bogota' };
const opcionesHora = { timeZone: 'America/Bogota', hour: '2-digit', minute:'2-digit' };
const fechaStr = fechaObj.toLocaleDateString('es-CO', opcionesFecha) + ' ' + fechaObj.toLocaleTimeString('es-CO', opcionesHora);
                    
                    let colorAccion = 'var(--ink)';
                    if (m.accion === 'Eliminar Abono' || m.accion === 'Liberar Boleta') colorAccion = 'var(--danger)';
                    if (m.accion === 'Nuevo Abono') colorAccion = 'var(--accent-2)';

                    html += `<tr style="border-bottom:1px solid var(--ring);">
                                <td style="padding:10px 4px; color:var(--ink-2); font-size:0.8rem; white-space: nowrap;">${fechaStr}</td>
                                <td style="padding:10px 4px; font-weight:600; color:var(--ink);">${m.asesor}</td>
                                <td style="padding:10px 4px; color:${colorAccion}; font-weight:600; white-space: nowrap;">${m.accion}</td>
                                <td style="padding:10px 4px; font-weight:800;">${m.boleta}</td>
                                <td style="padding:10px 4px; color:var(--muted); font-size:0.8rem;">${m.detalle}</td>
                            </tr>`;
                });
                html += '</tbody></table></div>';
                div.innerHTML = html;
            } else {
                div.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem;">${res.mensaje}</p>`;
            }
        } catch(e) {
            div.innerHTML = '<p style="text-align:center; color:var(--danger); font-size:0.85rem;">Error cargando movimientos.</p>';
        }
    }

 // Variables globales para los filtros
    let globalAbonos = [];
    let globalVentas = [];
    let chartLinea = null;
    let chartDona = null;

    async function cargarEstadisticas() {
        const div = document.getElementById('tablaEstadisticasRender');
        div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">Calculando rendimiento...</p>';
        try {
            const req = await fetch('/api/admin/estadisticas', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ contrasena: localStorage.getItem(STORAGE_KEY) })
            });
            const res = await req.json();
            
            if (res.status === 'ok') {
                prepararDashboard(res.abonos, res.ventas, res.globales);
            } else {
                div.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem;">${res.mensaje}</p>`;
            }
        } catch(e) {
            div.innerHTML = '<p style="text-align:center; color:var(--danger); font-size:0.85rem;">Error de conexión.</p>';
        }
    }

    function prepararDashboard(abonos, ventas, globales) {
        globalAbonos = abonos;
        globalVentas = ventas;

        // 1. Mostrar Datos Globales
        document.getElementById('kpi-global-registradas').textContent = globales.registradas;
        document.getElementById('kpi-global-cero').textContent = globales.separadas_cero;
        document.getElementById('kpi-global-libres').textContent = globales.libres;

        // 2. Llenar la lista de asesores con Checkboxes automáticamente
        const asesoresSet = new Set();
        ventas.forEach(v => asesoresSet.add(v.asesor || 'Sin Asesor'));
        abonos.forEach(a => asesoresSet.add(a.asesor || 'Sin Asesor'));
        
        const dropdownAsesores = document.getElementById('dropdown-asesores');
        let htmlCheckboxes = `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer; color:var(--ink); font-weight:600;"><input type="checkbox" id="chk-all-asesores" checked onchange="toggleAllAsesores(this)" style="accent-color: var(--accent);"> Seleccionar Todos</label><hr style="border:0; border-top:1px solid var(--ring); margin: 8px 0;">`;
        
        [...asesoresSet].sort().forEach(a => {
            htmlCheckboxes += `<label style="display:flex; gap:8px; margin-bottom:6px; cursor:pointer; font-size:0.85rem; color:var(--ink-2);"><input type="checkbox" value="${a}" class="asesor-chk" checked onchange="verificarAsesoresYFiltrar()" style="accent-color: var(--accent);"> ${a}</label>`;
        });
        dropdownAsesores.innerHTML = htmlCheckboxes;

        // 3. Aplicar filtros iniciales (Mostrará todo por defecto)
        aplicarFiltrosEstadisticas();
    }

    function aplicarFiltrosEstadisticas() {
        const fechaDesde = document.getElementById('filt-desde').value;
        const fechaHasta = document.getElementById('filt-hasta').value;
      
        // Obtenemos todos los checkboxes que estén marcados      
      const checkboxes = document.querySelectorAll('.asesor-chk:checked');      
      const asesoresSeleccionados = Array.from(checkboxes).map(chk => chk.value);

        // Función para estandarizar fechas
        const getFechaLocal = (isoString) => {
            let fString = isoString;
            if (!fString.includes('Z') && !fString.includes('+')) fString += 'Z';
            const date = new Date(fString);
            const offset = date.getTimezoneOffset() * 60000;
            return (new Date(date.getTime() - offset)).toISOString().split('T')[0];
        };

        // FILTRAR VENTAS
        const ventasFiltradas = globalVentas.filter(v => {
            const f = getFechaLocal(v.created_at);
            if (fechaDesde && f < fechaDesde) return false;
            if (fechaHasta && f > fechaHasta) return false;
            if (!asesoresSeleccionados.includes(v.asesor || 'Sin Asesor')) return false;
            return true;
        });

        // FILTRAR ABONOS
        const abonosFiltrados = globalAbonos.filter(a => {
            const f = getFechaLocal(a.fecha_pago);
            if (fechaDesde && f < fechaDesde) return false;
            if (fechaHasta && f > fechaHasta) return false;
            if (!asesoresSeleccionados.includes(a.asesor || 'Sin Asesor')) return false;
            return true;
        });

        // CALCULAR KPIs FILTRADOS
        let totalNuevas = ventasFiltradas.length;
        let nuevasConAbono = 0;
        ventasFiltradas.forEach(v => {
            // Si el texto del movimiento no dice "abono de $0", es porque dejó dinero.
            if (v.detalle && !v.detalle.includes('abono de $0')) nuevasConAbono++;
        });

        let totalPagos = abonosFiltrados.length;
        let dineroRecaudado = abonosFiltrados.reduce((acc, curr) => acc + Number(curr.monto), 0);

        const formatoPlata = new Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', minimumFractionDigits:0});

        document.getElementById('kpi-filt-nuevas').textContent = totalNuevas;
        document.getElementById('kpi-filt-con-abono').textContent = nuevasConAbono;
        document.getElementById('kpi-filt-abonos').textContent = totalPagos;
        document.getElementById('kpi-filt-recaudo').textContent = formatoPlata.format(dineroRecaudado);

        // ACTUALIZAR GRÁFICAS Y TABLA
        const stats = {};
        let recaudoPorDia = {};
        let recaudoPorAsesor = {};

        ventasFiltradas.forEach(v => {
            const f = getFechaLocal(v.created_at);
            const a = v.asesor || 'Sin Asesor';
            if(!stats[f]) stats[f] = {};
            if(!stats[f][a]) stats[f][a] = { nuevas: 0, conDinero: 0, recaudado: 0 };
            stats[f][a].nuevas++;
        });

        abonosFiltrados.forEach(a => {
            const f = getFechaLocal(a.fecha_pago);
            const as = a.asesor || 'Sin Asesor';
            const monto = Number(a.monto);
            recaudoPorDia[f] = (recaudoPorDia[f] || 0) + monto;
            recaudoPorAsesor[as] = (recaudoPorAsesor[as] || 0) + monto;
            
            if(!stats[f]) stats[f] = {};
            if(!stats[f][as]) stats[f][as] = { nuevas: 0, conDinero: 0, recaudado: 0 };
            stats[f][as].conDinero++;
            stats[f][as].recaudado += monto;
        });

        // GRAFICA 1: LÍNEAS
        const fechasOrdenadas = Object.keys(recaudoPorDia).sort();
        const dataLinea = fechasOrdenadas.map(f => recaudoPorDia[f]);
        const labelsLinea = fechasOrdenadas.map(f => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', {day:'2-digit', month:'short'}));

        if (chartLinea) chartLinea.destroy();
        const ctxLinea = document.getElementById('chartIngresos').getContext('2d');
        chartLinea = new Chart(ctxLinea, {
            type: 'line',
            data: { labels: labelsLinea, datasets: [{ label: 'Recaudo ($)', data: dataLinea, borderColor: '#4eb082', backgroundColor: 'rgba(78, 176, 130, 0.2)', borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: '#2b3a35' }] },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });

        // GRAFICA 2: DONA
        const asesoresNombres = Object.keys(recaudoPorAsesor);
        const dataDona = asesoresNombres.map(a => recaudoPorAsesor[a]);
        const colores = ['#4eb082', '#2b3a35', '#C5A059', '#d95a53', '#8ba89d', '#ff9800'];

        if (chartDona) chartDona.destroy();
        const ctxDona = document.getElementById('chartAsesores').getContext('2d');
        chartDona = new Chart(ctxDona, {
            type: 'doughnut',
            data: { labels: asesoresNombres, datasets: [{ data: dataDona, backgroundColor: colores, borderWidth: 0 }] },
            options: { responsive: true, cutout: '70%', plugins: { legend: { position: 'bottom' } } }
        });

        // TABLA DETALLADA
        const div = document.getElementById('tablaEstadisticasRender');
        const filas = [];
        Object.keys(stats).forEach(fecha => {
            Object.keys(stats[fecha]).forEach(as => { filas.push({ fecha: fecha, asesor: as, ...stats[fecha][as] }); });
        });
        filas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.recaudado - a.recaudado);

        if(filas.length === 0) {
            div.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem;">No hay datos para mostrar con estos filtros.</p>';
            return;
        }

        let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">';
        html += '<thead><tr style="border-bottom:2px solid var(--ring-strong); color: var(--ink); font-weight:600;"><th style="padding:10px 4px;">Día</th><th style="padding:10px 4px;">Asesor</th><th style="padding:10px 4px; text-align:center;">Nuevas</th><th style="padding:10px 4px; text-align:center;">Pagos</th><th style="padding:10px 4px; text-align:right;">Recaudo</th></tr></thead><tbody>';
        
        filas.forEach(f => {
            const fechaStr = new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-CO', {weekday:'short', day:'2-digit', month:'short'});
            html += `<tr style="border-bottom:1px solid var(--ring);">
                        <td style="padding:12px 4px; color:var(--ink-2); text-transform:capitalize;">${fechaStr}</td>
                        <td style="padding:12px 4px; font-weight:600; color:var(--ink);">👤 ${f.asesor}</td>
                        <td style="padding:12px 4px; text-align:center; font-weight:600; color:var(--muted);">${f.nuevas}</td>
                        <td style="padding:12px 4px; text-align:center; font-weight:600; color:var(--accent-2);">${f.conDinero}</td>
                        <td style="padding:12px 4px; text-align:right; font-weight:800; color:var(--ink);">${formatoPlata.format(f.recaudado)}</td>
                    </tr>`;
        });
        html += '</tbody></table></div>';
        div.innerHTML = html;
    }

    // ==========================================
    // CARGAR PLATAFORMAS AUTOMÁTICAMENTE
    // ==========================================
    async function cargarPlataformas() {
        try {
            const req = await fetch('/api/admin/plataformas');
            const res = await req.json();
            
            if (res.status === 'ok') {
                const datalist = document.getElementById('l_metodos');
                datalist.innerHTML = ''; // Limpiamos la lista vieja
                
                // Agregamos las nuevas opciones sacadas de la base de datos
                res.lista.forEach(plat => {
                    const option = document.createElement('option');
                    option.value = plat;
                    datalist.appendChild(option);
                });
            }
        } catch (e) {
            console.log("No se pudieron cargar las plataformas", e);
        }
    }

    // ==========================================
    // AGREGAR BOLETAS A CLIENTE EXISTENTE
    // ==========================================
    function prepararNuevaVentaExistente(telefono) {
        // 1. Recogemos los datos que ya están en la pantalla del cliente
        const nombre = document.getElementById('c_nombre').value;
        const apellido = document.getElementById('c_apellido').value;
        const ciudad = document.getElementById('c_ciudad').value;

        // 2. Cambiamos a la pestaña de "Ventas"
        activateAppMode();
        switchView('view-venta');

        // 3. Llenamos el formulario de venta automáticamente
        document.getElementById('v_nombre').value = nombre;
        document.getElementById('v_apellido').value = apellido;
        document.getElementById('v_telefono').value = telefono;
        document.getElementById('v_ciudad').value = ciudad;

        // 4. Limpiamos las cajas de boletas por si había algo escrito antes
        const listaNumeros = document.getElementById('numList');
        listaNumeros.innerHTML = '';
        addDefaultPill(); // Agrega una cajita vacía lista para escribir

        // 5. Subimos la pantalla arriba del todo y por defecto ponemos modo "Solo Separar"
        setMode('separar');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================
    // FUNCIONES DE MODALES Y ARRANQUE (RESTAURADAS)
    // ==========================================
    function showModal(title, msg) { 
        const mTitle = document.getElementById('mTitle');
        const mMsg = document.getElementById('mMsg');
        const modalRes = document.getElementById('modalResult');
        
        if(mTitle && mMsg && modalRes) {
            mTitle.textContent = title; 
            mMsg.textContent = msg; 
            modalRes.style.display = 'flex'; 
        } else {
            // Un respaldo de emergencia por si algo falla
            alert(title + "\n\n" + msg); 
        }
    }
    
    // Cerrar el modal al darle Aceptar
    const mBtn = document.getElementById('mBtn');
    if(mBtn) {
        mBtn.onclick = function() { 
            document.getElementById('modalResult').style.display='none'; 
        };
    }

    // Arranque automático al cargar la página
    document.addEventListener('DOMContentLoaded', function() { 
        initLogin(); 
        if(typeof addDefaultPill === 'function') addDefaultPill(); 
        
        const pwdInput = document.getElementById('loginPwd');
        if(pwdInput) {
            pwdInput.addEventListener('keyup', function(e) { 
                if (e.key === 'Enter') verifyLogin(this.value); 
            });
        }
    });

    // ==========================================
    // LÓGICA DE CARGA MASIVA CON INTELIGENCIA ARTIFICIAL
    // ==========================================
    let filaArchivosIA = [];

    // 1. Manejar cuando el asesor selecciona archivos
    function manejarSeleccionArchivosIA(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            filaArchivosIA.push({
                id: Date.now() + i, // ID único para cada archivo
                file: files[i],
                status: 'pendiente', // Estados: pendiente, procesando, exito, duplicado, error
                mensaje: 'Esperando en fila...'
            });
        }
        
        document.getElementById('fileInputIA').value = ""; // Limpiamos el input
        actualizarUIIA();
    }

    // 2. Permitir Arrastrar y Soltar (Drag & Drop)
    const dropZone = document.getElementById('dropZoneIA');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.background = 'var(--pill)';
            dropZone.style.borderColor = 'var(--accent-2)';
        });
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.background = 'var(--bg)';
            dropZone.style.borderColor = 'var(--accent)';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.background = 'var(--bg)';
            dropZone.style.borderColor = 'var(--accent)';
            if (e.dataTransfer.files.length > 0) {
                manejarSeleccionArchivosIA({ target: { files: e.dataTransfer.files } });
            }
        });
    }

    // 3. Dibujar la lista de progreso en la pantalla
    function actualizarUIIA() {
        const listaDiv = document.getElementById('listaProgresoIA');
        const btnIniciar = document.getElementById('btnIniciarIA');
        const contador = document.getElementById('statusContadorIA');

        if (filaArchivosIA.length === 0) {
            listaDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--muted); font-size: 0.85rem; border: 1px dashed var(--ring); border-radius: 8px;">Aún no hay archivos en la fila.</div>';
            btnIniciar.style.display = 'none';
            contador.textContent = '0 archivos listos';
            return;
        }

        const pendientes = filaArchivosIA.filter(f => f.status === 'pendiente').length;
        contador.textContent = `${filaArchivosIA.length} archivos totales (${pendientes} pendientes)`;
        btnIniciar.style.display = pendientes > 0 ? 'block' : 'none';

        let html = '';
        filaArchivosIA.forEach(item => {
            let icono = '⏳';
            let color = 'var(--muted)';
            if (item.status === 'procesando') { icono = '⚙️'; color = '#ff9800'; }
            if (item.status === 'exito') { icono = '✅'; color = 'var(--accent-2)'; }
            if (item.status === 'duplicado') { icono = '⚠️'; color = '#f57c00'; }
            if (item.status === 'error') { icono = '❌'; color = 'var(--danger)'; }

            html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border: 1px solid var(--ring); border-radius: 8px; background: #fff;">
                <div style="display: flex; align-items: center; gap: 10px; overflow: hidden; max-width: 50%;">
                    <span style="font-size: 1.2rem;">${icono}</span>
                    <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.85rem; font-weight: 500;">
                        ${item.file.name}
                    </div>
                </div>
                <div style="font-size: 0.75rem; color: ${color}; font-weight: 600; text-align: right; max-width: 55%;">
                    ${item.mensaje}
                </div>
            </div>`;
        });
        listaDiv.innerHTML = html;
        listaDiv.scrollTop = listaDiv.scrollHeight; // Auto-scroll hacia abajo
    }

    // 4. Iniciar el procesamiento (UNO POR UNO para no saturar)
    async function iniciarProcesamientoMasivoIA() {
        document.getElementById('btnIniciarIA').style.display = 'none';
        
        for (let i = 0; i < filaArchivosIA.length; i++) {
            let item = filaArchivosIA[i];
            
            if (item.status !== 'pendiente') continue;

            item.status = 'procesando';
            item.mensaje = 'Extrayendo datos con IA...';
            actualizarUIIA();

            try {
                // Si es PDF, lo convierte a imagen mágicamente
                let base64 = await convertirABase64(item.file);
                
                // Envía la imagen a nuestra nueva API en Vercel
                const req = await fetch('/api/admin/procesar-ia', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imagenBase64: base64,
                        contrasena: localStorage.getItem(STORAGE_KEY) 
                    })
                });
                
                const res = await req.json();

                if (res.status === 'ok') {
                    item.status = 'exito';
                    item.mensaje = res.mensaje;
                } else if (res.status === 'duplicado') {
                    item.status = 'duplicado';
                    // Aquí mostramos el detalle exacto de la transferencia con la que chocó
                    item.mensaje = `⚠️ Choca con Ref: <b>${res.clon.referencia}</b><br><span style="font-size:0.7rem; color:#888;">${res.mensaje} (${res.clon.estado})</span>`;
                } else {
                    item.status = 'error';
                    item.mensaje = res.mensaje || 'Error desconocido';
                }
            } catch (error) {
                item.status = 'error';
                item.mensaje = 'Fallo de conexión';
            }

            actualizarUIIA();
        }
    }

    // 5. Motor conversor (Imágenes pasan directo, PDFs se renderizan)
    async function convertirABase64(file) {
        return new Promise(async (resolve, reject) => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            } else if (file.type === 'application/pdf') {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfjsLib = window['pdfjs-dist/build/pdf'];
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                    
                    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                    const page = await pdf.getPage(1); // Tomamos solo la primera página del PDF
                    
                    const viewport = page.getViewport({ scale: 1.5 }); // Buena calidad para que la IA lo lea perfecto
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                    
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); // Convertimos a Base64
                } catch (e) {
                    reject(e);
                }
            } else {
                reject(new Error('El archivo no es una imagen ni un PDF'));
            }
        });
    }

    // ==========================================
    // FUNCIONES DEL NUEVO FILTRO MULTIPLE DE ASESORES
    // ==========================================
    function toggleAllAsesores(source) {
        const checkboxes = document.querySelectorAll('.asesor-chk');
        checkboxes.forEach(chk => chk.checked = source.checked);
        verificarAsesoresYFiltrar();
    }

    function verificarAsesoresYFiltrar() {
        const checkboxes = document.querySelectorAll('.asesor-chk');
        const allChecked = Array.from(checkboxes).every(chk => chk.checked);
        document.getElementById('chk-all-asesores').checked = allChecked;
        
        const seleccionados = Array.from(checkboxes).filter(chk => chk.checked).length;
        const lbl = document.getElementById('lbl-asesores-seleccionados');
        
        if (allChecked) {
            lbl.textContent = 'Todos los asesores ▼';
        } else if (seleccionados === 0) {
            lbl.textContent = 'Ninguno seleccionado ▼';
        } else {
            lbl.textContent = `${seleccionados} asesores filtrados ▼`;
        }
        
        aplicarFiltrosEstadisticas();
    }

    function limpiarFiltrosRendimiento() {
        document.getElementById('filt-desde').value = '';
        document.getElementById('filt-hasta').value = '';
        const chkAll = document.getElementById('chk-all-asesores');
        if (chkAll) {
            chkAll.checked = true;
            toggleAllAsesores(chkAll);
        } else {
            aplicarFiltrosEstadisticas();
        }
    }

    // Cierra los menús desplegables de asesores si hacen clic afuera
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('dropdown-asesores');
        const container = document.getElementById('asesor-dropdown-container');
        if (dropdown && container && !container.contains(event.target)) {
            dropdown.style.display = 'none';
        }

        const lbDropdown = document.getElementById('lb-dropdown-asesores');
        const lbContainer = document.getElementById('lb-asesor-dropdown-container');
        if (lbDropdown && lbContainer && !lbContainer.contains(event.target)) {
            lbDropdown.style.display = 'none';
        }
    });

    // ==========================================
    // LISTA DE BOLETAS VENDIDAS
    // ==========================================
    let _listaBoletasCompleta = [];

    async function cargarListaBoletas() {
        const contenedor = document.getElementById('lb-tabla-render');
        const contador = document.getElementById('lb-contador');
        contenedor.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem; padding:30px 0;">Cargando...</p>';
        contador.textContent = '';

        const pwd = localStorage.getItem(STORAGE_KEY) || '';
        try {
            const res = await fetch('/api/admin/lista-boletas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contrasena: pwd })
            });
            const data = await res.json();
            if (data.status !== 'ok') throw new Error(data.mensaje || 'Error desconocido');

            _listaBoletasCompleta = data.lista;
            poblarFiltroAsesorLB(data.lista);
            filtrarListaBoletas();
        } catch (e) {
            contenedor.innerHTML = `<p style="text-align:center; color:var(--danger); font-size:0.85rem; padding:20px 0;">❌ ${e.message}</p>`;
        }
    }

    function poblarFiltroAsesorLB(lista) {
        const dropdown = document.getElementById('lb-dropdown-asesores');
        const asesoresUnicos = [...new Set(lista.map(b => b.asesor).filter(a => a && a !== '—'))].sort();

        let html = `<label style="display:flex; gap:8px; margin-bottom:8px; cursor:pointer; color:var(--ink); font-weight:600;">
            <input type="checkbox" id="lb-chk-all" checked onchange="lbToggleAllAsesores(this)" style="accent-color:var(--accent);"> Seleccionar Todos
        </label><hr style="border:0; border-top:1px solid var(--ring); margin:8px 0;">`;

        asesoresUnicos.forEach(a => {
            html += `<label style="display:flex; gap:8px; margin-bottom:6px; cursor:pointer; font-size:0.85rem; color:var(--ink-2);">
                <input type="checkbox" value="${a}" class="lb-asesor-chk" checked onchange="lbVerificarAsesores()" style="accent-color:var(--accent);"> ${a}
            </label>`;
        });

        dropdown.innerHTML = html;
        lbActualizarLabel();
    }

    function lbToggleAllAsesores(source) {
        document.querySelectorAll('.lb-asesor-chk').forEach(chk => chk.checked = source.checked);
        lbActualizarLabel();
        filtrarListaBoletas();
    }

    function lbVerificarAsesores() {
        const todos = document.querySelectorAll('.lb-asesor-chk');
        const todosChecked = Array.from(todos).every(c => c.checked);
        const chkAll = document.getElementById('lb-chk-all');
        if (chkAll) chkAll.checked = todosChecked;
        lbActualizarLabel();
        filtrarListaBoletas();
    }

    function lbActualizarLabel() {
        const todos = document.querySelectorAll('.lb-asesor-chk');
        const seleccionados = Array.from(todos).filter(c => c.checked).length;
        const lbl = document.getElementById('lb-lbl-asesores');
        if (!lbl) return;
        if (seleccionados === todos.length) {
            lbl.textContent = 'Todos los asesores ▼';
        } else if (seleccionados === 0) {
            lbl.textContent = 'Ninguno seleccionado ▼';
        } else {
            lbl.textContent = `${seleccionados} asesores ▼`;
        }
    }

    function filtrarListaBoletas() {
        const texto = (document.getElementById('lb-filtro-texto').value || '').toLowerCase().trim();
        const tipo = document.getElementById('lb-filtro-tipo').value;
        const chks = document.querySelectorAll('.lb-asesor-chk:checked');
        const asesoresSeleccionados = Array.from(chks).map(c => c.value);

        let filtrada = _listaBoletasCompleta;

        if (tipo) filtrada = filtrada.filter(b => b.tipo === tipo);

        if (asesoresSeleccionados.length > 0 && asesoresSeleccionados.length < document.querySelectorAll('.lb-asesor-chk').length) {
            filtrada = filtrada.filter(b => asesoresSeleccionados.includes(b.asesor));
        }

        if (texto) {
            filtrada = filtrada.filter(b =>
                String(b.numero).includes(texto) ||
                b.nombre.toLowerCase().includes(texto) ||
                b.telefono.includes(texto) ||
                (b.asesor || '').toLowerCase().includes(texto)
            );
        }

        renderTablaListaBoletas(filtrada);
    }

    function lbFormatFecha(isoStr) {
        if (!isoStr) return '—';
        const d = new Date(isoStr);
        const dia = String(d.getDate()).padStart(2,'0');
        const mes = String(d.getMonth()+1).padStart(2,'0');
        const anio = d.getFullYear();
        const h = String(d.getHours()).padStart(2,'0');
        const min = String(d.getMinutes()).padStart(2,'0');
        return `${dia}/${mes}/${anio} ${h}:${min}`;
    }

    function renderTablaListaBoletas(lista) {
        const contenedor = document.getElementById('lb-tabla-render');
        const contador = document.getElementById('lb-contador');

        if (!lista.length) {
            contador.textContent = '';
            contenedor.innerHTML = '<p style="text-align:center; color:var(--muted); font-size:0.85rem; padding:30px 0;">No hay boletas que coincidan con los filtros.</p>';
            return;
        }

        // Agrupar por teléfono del cliente
        const grupos = {};
        lista.forEach(b => {
            const key = b.telefono || `_sin_${b.numero}`;
            if (!grupos[key]) {
                grupos[key] = { telefono: b.telefono, nombre: b.nombre, boletas: [], fechaMasAntigua: null, asesores: new Set() };
            }
            grupos[key].boletas.push(b);
            if (b.asesor && b.asesor !== '—') grupos[key].asesores.add(b.asesor);
            if (b.fecha_venta) {
                if (!grupos[key].fechaMasAntigua || new Date(b.fecha_venta) < new Date(grupos[key].fechaMasAntigua)) {
                    grupos[key].fechaMasAntigua = b.fecha_venta;
                }
            }
        });

        // Ordenar grupos por la boleta más antigua del cliente
        const gruposOrdenados = Object.values(grupos).sort((a, b) => {
            if (!a.fechaMasAntigua) return 1;
            if (!b.fechaMasAntigua) return -1;
            return new Date(a.fechaMasAntigua) - new Date(b.fechaMasAntigua);
        });

        const totalClientes = gruposOrdenados.length;
        contador.textContent = `${totalClientes} cliente${totalClientes !== 1 ? 's' : ''} · ${lista.length} boleta${lista.length !== 1 ? 's' : ''}`;

        const tipoBadge = { grande: '🏠', diaria2: '🎯', diaria3: '🎯' };
        const tipoColor = { grande: 'var(--pill)', diaria2: '#e8f5e9', diaria3: '#e3f2fd' };
        const tipoTextColor = { grande: 'var(--ink-2)', diaria2: '#1b5e20', diaria3: '#0d47a1' };

        let html = '<div style="overflow-x:auto;">';
        html += '<table style="width:100%; border-collapse:collapse; font-size:0.85rem;">';
        html += '<thead><tr style="border-bottom:2px solid var(--ring-strong); color:var(--muted); font-weight:600; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.04em;">';
        html += '<th style="padding:8px 6px; text-align:center;">📞</th>';
        html += '<th style="padding:8px 6px; text-align:center;">💰</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Boletas</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Nombre</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Teléfono</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Primera Compra</th>';
        html += '<th style="padding:8px 6px; text-align:left;">Asesor(es)</th>';
        html += '</tr></thead><tbody>';

        gruposOrdenados.forEach((g, i) => {
            // Un grupo se considera "llamado" si TODAS sus boletas tienen aviso
            const todasLlamadas = g.boletas.every(b => b.llamada);
            const algunaLlamada = g.boletas.some(b => b.llamada);
            // Tooltip: quién llamó y cuándo (primera boleta con aviso)
            const primeraConAviso = g.boletas.find(b => b.llamada);
            const tooltipLlamada = primeraConAviso
                ? `${primeraConAviso.llamada_asesor || '?'} · ${lbFormatFecha(primeraConAviso.llamada_fecha)}`
                : '';
            // Números de boletas para el toggle (todas del grupo)
            const numerosGrupo = JSON.stringify(g.boletas.map(b => ({ numero: b.numero, telefono: b.telefono })));

            // Estado cobro
            const todasCobros = g.boletas.every(b => b.cobro);
            const algunCobro = g.boletas.some(b => b.cobro);
            const primeraConCobro = g.boletas.find(b => b.cobro);
            const tooltipCobro = primeraConCobro
                ? `${primeraConCobro.cobro_asesor || '?'} · ${lbFormatFecha(primeraConCobro.cobro_fecha)}`
                : '';

            const bgRow = todasLlamadas
                ? '#f0fdf4'
                : algunaLlamada
                    ? '#fffbeb'
                    : (i % 2 === 0 ? '#fff' : 'var(--bg)');

            // Boletas ordenadas por fecha (más antigua primero) dentro del grupo
            const boletasOrdenadas = [...g.boletas].sort((a, b) => {
                if (!a.fecha_venta) return 1;
                if (!b.fecha_venta) return -1;
                return new Date(a.fecha_venta) - new Date(b.fecha_venta);
            });

            const boletasPills = boletasOrdenadas.map(b => {
                const llamadaBorde = b.llamada ? `outline:2px solid #16a34a;` : '';
                return `<span style="display:inline-block; font-weight:700; font-size:0.95rem; background:${tipoColor[b.tipo] || 'var(--pill)'}; color:${tipoTextColor[b.tipo] || 'var(--ink)'}; padding:2px 10px; border-radius:20px; margin:2px 2px; white-space:nowrap; ${llamadaBorde}">${b.numero} ${tipoBadge[b.tipo] || ''}</span>`;
            }).join('');

            const asesoresPills = [...g.asesores].map(a =>
                `<span style="display:inline-block; font-size:0.78rem; background:#e8f5e9; color:#1b5e20; padding:2px 8px; border-radius:20px; margin:2px 2px; font-weight:500; white-space:nowrap;">${a}</span>`
            ).join('') || '<span style="color:var(--muted)">—</span>';

            // Botón de llamada: marca/desmarca todas las boletas del grupo
            const btnLlamada = todasLlamadas
                ? `<button onclick="lbToggleLlamada(this, ${numerosGrupo.replace(/"/g, '&quot;')}, false)" title="Desmarcar llamada\n${tooltipLlamada}" style="border:none; background:none; cursor:pointer; font-size:1.3rem; line-height:1;">✅</button>`
                : `<button onclick="lbToggleLlamada(this, ${numerosGrupo.replace(/"/g, '&quot;')}, true)" title="Marcar como llamado" style="border:none; background:none; cursor:pointer; font-size:1.3rem; line-height:1; opacity:0.3;">☑️</button>`;

            // Botón de cobro azul: marca/desmarca todas las boletas del grupo
            const btnCobro = todasCobros
                ? `<button onclick="lbToggleCobro(this, ${numerosGrupo.replace(/"/g, '&quot;')}, false)" title="Desmarcar cobro\n${tooltipCobro}" style="border:none; background:none; cursor:pointer; font-size:1.3rem; line-height:1; filter:hue-rotate(200deg);">✅</button>`
                : `<button onclick="lbToggleCobro(this, ${numerosGrupo.replace(/"/g, '&quot;')}, true)" title="Marcar como cobrado" style="border:none; background:none; cursor:pointer; font-size:1.3rem; line-height:1; opacity:0.3; filter:hue-rotate(200deg);">☑️</button>`;

            html += `<tr style="background:${bgRow}; border-bottom:1px solid var(--ring); transition:background 0.3s;">`;
            html += `<td style="padding:9px 6px; text-align:center;">${btnLlamada}${tooltipLlamada ? `<div style="font-size:0.68rem; color:var(--muted); margin-top:2px; line-height:1.2;">${tooltipLlamada}</div>` : ''}</td>`;
            html += `<td style="padding:9px 6px; text-align:center;">${btnCobro}${tooltipCobro ? `<div style="font-size:0.68rem; color:var(--muted); margin-top:2px; line-height:1.2;">${tooltipCobro}</div>` : ''}</td>`;
            html += `<td style="padding:9px 6px; min-width:120px;"><div style="display:flex; flex-wrap:wrap; gap:2px;">${boletasPills}</div></td>`;
            html += `<td style="padding:9px 6px; font-weight:500; min-width:130px;">${g.nombre || '—'}</td>`;
            html += `<td style="padding:9px 6px; color:var(--ink-2); white-space:nowrap;">${g.telefono || '—'}</td>`;
            html += `<td style="padding:9px 6px; color:var(--ink-2); white-space:nowrap;">${lbFormatFecha(g.fechaMasAntigua)}</td>`;
            html += `<td style="padding:9px 6px;"><div style="display:flex; flex-wrap:wrap; gap:2px;">${asesoresPills}</div></td>`;
            html += '</tr>';
        });

        html += '</tbody></table></div>';
        contenedor.innerHTML = html;
    }

    async function lbToggleLlamada(btn, boletas, marcar) {
        btn.disabled = true;
        btn.style.opacity = '0.5';

        const pwd = localStorage.getItem(STORAGE_KEY) || '';
        const accion = marcar ? 'marcar' : 'desmarcar';

        try {
            // Marcar/desmarcar cada boleta del grupo en paralelo
            await Promise.all(boletas.map(b =>
                fetch('/api/admin/marcar-llamada', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contrasena: pwd, boleta: b.numero, telefono: b.telefono, accion })
                })
            ));

            // Actualizar en _listaBoletasCompleta para no recargar toda la tabla
            _listaBoletasCompleta.forEach(b => {
                if (boletas.some(x => String(x.numero) === String(b.numero))) {
                    b.llamada = marcar;
                    b.llamada_asesor = marcar ? nombreAsesorActual : null;
                    b.llamada_fecha = marcar ? new Date().toISOString() : null;
                }
            });

            filtrarListaBoletas();
        } catch (e) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    async function lbToggleCobro(btn, boletas, marcar) {
        btn.disabled = true;
        btn.style.opacity = '0.5';

        const pwd = localStorage.getItem(STORAGE_KEY) || '';
        const accion = marcar ? 'marcar' : 'desmarcar';

        try {
            await Promise.all(boletas.map(b =>
                fetch('/api/admin/marcar-cobro', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contrasena: pwd, boleta: b.numero, telefono: b.telefono, accion })
                })
            ));

            _listaBoletasCompleta.forEach(b => {
                if (boletas.some(x => String(x.numero) === String(b.numero))) {
                    b.cobro = marcar;
                    b.cobro_asesor = marcar ? nombreAsesorActual : null;
                    b.cobro_fecha = marcar ? new Date().toISOString() : null;
                }
            });

            filtrarListaBoletas();
        } catch (e) {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }
