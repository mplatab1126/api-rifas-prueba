// ver-house-app.js — Buscador "Ver mi boleta" (Casa Santa Teresita)
// Al encontrar la(s) boleta(s) redirige a /boleta/[num]?telefono=... (vista detallada en boleta.html).
const { useState: useStateVerH, useEffect: useEffectVerH } = React;

function VerHouseApp() {
  const [step, setStep] = useStateVerH("buscar");
  const [menuOpen, setMenuOpen] = useStateVerH(false);
  const [pais, setPais] = useStateVerH(window.PAISES[0]);
  const [telefono, setTelefono] = useStateVerH("");
  const [cliente, setCliente] = useStateVerH(null);
  const [error, setError] = useStateVerH(null);
  const [loading, setLoading] = useStateVerH(false);
  const [inicializando, setInicializando] = useStateVerH(function () {
    if (typeof window === "undefined") return false;
    const p = new URLSearchParams(window.location.search);
    return p.has("telefono") && p.has("boleta");
  });

  const irABoletaUnica = (numero, telCompleto) => {
    const num = String(numero).padStart(4, "0");
    const tel = String(telCompleto).replace(/\D/g, "");
    window.location.href = "/boleta/" + num + "?telefono=" + encodeURIComponent(tel);
  };

  const buscar = async (opts) => {
    if (loading) return;
    const paisUsar = (opts && opts.pais) || pais;
    const telUsar = (opts && opts.telefono) || telefono;
    setError(null);
    setLoading(true);
    try {
      const numeroCompleto = (paisUsar.code || "").replace(/\+/g, "") + telUsar;
      const res = await fetch("/api/abonar/cliente?telefono=" + encodeURIComponent(numeroCompleto));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data.encontrado || !Array.isArray(data.boletas) || data.boletas.length === 0) {
        setError("No encontramos boletas registradas con el número " + paisUsar.code + " " + telUsar + ". Verifica el número o escríbenos por WhatsApp.");
        setLoading(false);
        return;
      }
      if (data.boletas.length === 1) {
        irABoletaUnica(data.boletas[0].numero, numeroCompleto);
        return;
      }
      setCliente({
        nombre: data.nombre || "Cliente",
        apellido: data.apellido || "",
        ciudad: data.ciudad || "",
        telefonoCompleto: numeroCompleto,
        boletas: data.boletas,
      });
      setStep("lista");
    } catch (e) {
      console.error("[ver-boleta buscar]", e);
      setError("No pudimos consultar tu boleta en este momento. Inténtalo de nuevo o escríbenos por WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  useEffectVerH(() => {
    const p = new URLSearchParams(window.location.search);
    const telParam = p.get("telefono");
    const boletaParam = p.get("boleta");
    if (telParam && boletaParam) {
      irABoletaUnica(boletaParam, telParam);
      return;
    }
    setInicializando(false);
  }, []);

  const volverAtras = () => {
    if (step === "buscar") { window.location.href = "/"; return; }
    if (step === "lista") { setStep("buscar"); return; }
  };

  const titulo = step === "lista" ? "Mis boletas" : "Ver mi boleta";

  if (inicializando) {
    return React.createElement("div", {
      style: {
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--cream-50, #FAFAF7)", color: "var(--ink-mute, #6E6E6E)",
        fontFamily: "Inter, sans-serif", fontSize: 16, padding: 20, textAlign: "center"
      }
    }, "Abriendo tu boleta...");
  }

  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "abonar" },
      React.createElement("div", { className: "ab-topbar" },
        React.createElement("button", { className: "ab-back", onClick: volverAtras, "aria-label": "Volver" },
          React.createElement("svg", { width: "22", height: "22", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.2", strokeLinecap: "round", strokeLinejoin: "round" },
            React.createElement("path", { d: "M15 18l-6-6 6-6" })
          )
        ),
        React.createElement("h1", { className: "ab-topbar-title" }, titulo),
        React.createElement(HamburgerBtn, { onClick: () => setMenuOpen(true) })
      ),
      React.createElement(NavDrawer, { open: menuOpen, onClose: () => setMenuOpen(false) }),
      React.createElement("div", { className: "ab-content" },
        step === "buscar" && React.createElement(StepBuscarVerH, {
          pais: pais, setPais: setPais, telefono: telefono, setTelefono: setTelefono,
          error: error, loading: loading, onContinuar: buscar
        }),
        step === "lista" && cliente && React.createElement(StepListaVerH, {
          cliente: cliente,
          onElegir: (boleta) => irABoletaUnica(boleta.numero, cliente.telefonoCompleto)
        })
      )
    ),
    React.createElement("a", { href: "https://wa.me/573107334957", className: "float-wa-ab", target: "_blank", rel: "noreferrer", "aria-label": "WhatsApp" },
      React.createElement("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" },
        React.createElement("path", { d: "M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3.1.8.8-3-.2-.3C4.1 15 3.7 13.5 3.7 12c0-4.6 3.7-8.3 8.3-8.3s8.3 3.7 8.3 8.3-3.7 8.2-8.3 8.2z" }),
        React.createElement("path", { d: "M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6 0-.3-.2-1.2-.5-2.4-1.5-.9-.8-1.5-1.8-1.6-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.3-.7.3-1.2.2-1.4-.1-.2-.3-.2-.6-.4z" })
      )
    )
  );
}

function StepBuscarVerH({ pais, setPais, telefono, setTelefono, error, loading, onContinuar }) {
  const [openSheet, setOpenSheet] = useStateVerH(false);
  const maxLen = pais.digits;
  const valid = telefono.length === maxLen && !loading;
  const onChange = (e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, maxLen));
  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "ab-intro" },
      React.createElement("p", { className: "ab-eyebrow" }, "Consultar boleta"),
      React.createElement("h1", { className: "ab-titulo" }, "Encontremos tu boleta")
    ),
    React.createElement("div", { className: "ab-aviso" },
      React.createElement("div", { className: "ab-aviso-icon" }, React.createElement(AbIcon, { name: "info", size: 20 })),
      React.createElement("div", null,
        React.createElement("p", { className: "ab-aviso-t" }, "Importante"),
        React.createElement("p", { className: "ab-aviso-d" }, "Usa el número con el que compraste.")
      )
    ),
    React.createElement("form", {
      className: "ab-form",
      onSubmit: (e) => { e.preventDefault(); if (valid) onContinuar(); }
    },
      React.createElement("div", null,
        React.createElement("label", { className: "ab-label", htmlFor: "vbh-tel" }, "¿Cuál es tu número de teléfono?"),
        React.createElement("div", { className: "ab-phone-group" },
          React.createElement("button", {
            type: "button", className: "ab-country-btn", onClick: () => setOpenSheet(true),
            "aria-label": "País: " + pais.name + ", código " + pais.code
          },
            React.createElement("span", { className: "ab-flag" }, pais.flag),
            React.createElement("span", { className: "ab-country-code" }, pais.code),
            React.createElement("span", { className: "ab-chevron" }, React.createElement(AbIcon, { name: "chevronDown", size: 14 }))
          ),
          React.createElement("input", {
            id: "vbh-tel", type: "tel", inputMode: "numeric", autoComplete: "tel-national",
            className: "ab-phone-input", value: telefono, onChange: onChange,
            placeholder: "0".repeat(maxLen), maxLength: maxLen
          })
        ),
        React.createElement("p", { className: "ab-help" },
          pais.iso === "CO" ? "Ejemplo: 3107334957" : "Ingresa los " + maxLen + " dígitos de tu número en " + pais.name + "."
        )
      ),
      error && React.createElement(React.Fragment, null,
        React.createElement("div", { className: "ab-aviso", style: { background: "#7A1F1F", marginBottom: 0 } },
          React.createElement("div", { className: "ab-aviso-icon", style: { background: "white", color: "#7A1F1F" } },
            React.createElement(AbIcon, { name: "alert", size: 20 })
          ),
          React.createElement("div", null,
            React.createElement("p", { className: "ab-aviso-t", style: { color: "white" } }, "No encontramos tu número"),
            React.createElement("p", { className: "ab-aviso-d" }, error)
          )
        ),
        React.createElement("div", { className: "vb-comprar-card" },
          React.createElement("p", { className: "vb-comprar-eyebrow" }, "¿Aún no tienes boleta?"),
          React.createElement("h3", { className: "vb-comprar-titulo" }, "Compra la tuya y participa por Casa Santa Teresita"),
          React.createElement("p", { className: "vb-comprar-desc" },
            "Sorteo el ",
            React.createElement("strong", null, "4 de julio de 2026"),
            " con la Lotería de Boyacá. Cada boleta vale $150.000 y puedes abonar desde $20.000."
          ),
          React.createElement("a", { href: "/comprar-la-plata-house", className: "ab-btn-primary ab-btn-mint vb-comprar-cta" },
            "Comprar mi boleta",
            React.createElement("span", { style: { marginLeft: 4 } }, "→")
          ),
          React.createElement("a", {
            href: "https://wa.me/573107334957?text=Hola%2C%20quiero%20comprar%20una%20boleta%20de%20Casa%20Santa%20Teresita",
            target: "_blank", rel: "noreferrer", className: "vb-comprar-wa"
          }, "O escríbenos por WhatsApp")
        )
      ),
      React.createElement("button", { type: "submit", className: "ab-btn-primary", disabled: !valid },
        loading ? "Consultando..." : "Ver mi boleta",
        !loading && React.createElement("span", { style: { marginLeft: 4 } }, "→")
      )
    ),
    openSheet && React.createElement(CountrySheetVerH, {
      paisActual: pais,
      onSelect: (p) => { setPais(p); setTelefono(""); setOpenSheet(false); },
      onClose: () => setOpenSheet(false)
    })
  );
}

function CountrySheetVerH({ paisActual, onSelect, onClose }) {
  const [filtro, setFiltro] = useStateVerH("");
  const lista = window.PAISES.filter((p) => {
    const q = filtro.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.code.includes(q);
  });
  return React.createElement("div", { className: "ab-sheet-backdrop", onClick: onClose },
    React.createElement("div", { className: "ab-sheet", onClick: (e) => e.stopPropagation() },
      React.createElement("div", { className: "ab-sheet-handle" }),
      React.createElement("div", { className: "ab-sheet-header" },
        React.createElement("h2", { className: "ab-sheet-title" }, "Selecciona tu país"),
        React.createElement("input", {
          className: "ab-sheet-search", placeholder: "Buscar país...",
          value: filtro, onChange: (e) => setFiltro(e.target.value), autoFocus: true
        })
      ),
      React.createElement("div", { className: "ab-sheet-list" },
        lista.map((p) => React.createElement("button", {
          key: p.iso,
          className: "ab-sheet-item" + (p.iso === paisActual.iso ? " selected" : ""),
          onClick: () => onSelect(p)
        },
          React.createElement("span", { className: "ab-flag" }, p.flag),
          React.createElement("span", { className: "ab-sheet-item-name" }, p.name),
          React.createElement("span", { className: "ab-sheet-item-code" }, p.code)
        ))
      )
    )
  );
}

function StepListaVerH({ cliente, onElegir }) {
  return React.createElement(React.Fragment, null,
    React.createElement("div", { className: "ab-intro" },
      React.createElement("p", { className: "ab-eyebrow" }, "Tus boletas"),
      React.createElement("h1", { className: "ab-titulo" }, "¡Hola, ", cliente.nombre, "!"),
      React.createElement("p", { className: "ab-mensaje" },
        "Tienes ",
        React.createElement("strong", null, cliente.boletas.length, " boletas"),
        " registradas. Toca la que quieres ver."
      )
    ),
    React.createElement("div", { className: "ab-cliente-card" },
      React.createElement("p", { className: "ab-cliente-eyebrow" }, "Cliente"),
      React.createElement("p", { className: "ab-cliente-nombre" }, cliente.nombre, " ", cliente.apellido),
      cliente.ciudad && React.createElement("p", { className: "ab-cliente-ciudad" },
        React.createElement(AbIcon, { name: "pin", size: 14 }), " ", cliente.ciudad
      )
    ),
    React.createElement("h2", { className: "ab-section-titulo" }, "Selecciona una boleta"),
    cliente.boletas.map((b) => {
      const pagada = b.saldoPendiente === 0;
      return React.createElement("div", { key: b.numero, className: "ab-boleta pendiente", role: "group" },
        React.createElement("div", { className: "ab-boleta-content" },
          React.createElement("div", { className: "ab-boleta-row1" },
            React.createElement("div", null,
              React.createElement("span", { className: "ab-boleta-numero-prefix" }, "Boleta"),
              React.createElement("span", { className: "ab-boleta-numero" }, "N° ", b.numero)
            ),
            React.createElement("span", { className: "ab-boleta-status " + (pagada ? "paga" : "pendiente") },
              pagada ? "Pagada" : "Pendiente"
            )
          ),
          React.createElement("div", { className: "ab-boleta-amounts" },
            React.createElement("div", { className: "ab-amount-block" },
              React.createElement("span", { className: "ab-amount-label" }, "Total abonado"),
              React.createElement("span", { className: "ab-amount-value" }, window.formatCOP(b.totalAbonado))
            ),
            React.createElement("div", { className: "ab-amount-block" },
              React.createElement("span", { className: "ab-amount-label" }, "Saldo pendiente"),
              React.createElement("span", { className: "ab-amount-value" }, window.formatCOP(b.saldoPendiente))
            )
          ),
          React.createElement("button", { type: "button", className: "vb-li-btn", onClick: () => onElegir(b) },
            "Ver mi boleta ", React.createElement("span", { "aria-hidden": "true" }, "→")
          )
        )
      );
    })
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(VerHouseApp, null));
