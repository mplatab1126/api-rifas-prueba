// house-landing.jsx — Landing custom para Casa Santa Teresita
// Define window.HouseLanding (lo consume house-app.jsx)

const { useState: useHL, useEffect: useHE, useRef: useHR } = React;

window.HouseLanding = function HouseLanding({ rifa, onComprar, tweaks }) {
  const carruselStyle = (tweaks && tweaks.carruselStyle) || "editorial";
  const accent = (tweaks && tweaks.accent) || "#9BFAB0";

  // Aplicar acento como CSS variable
  useHE(() => {
    const root = document.documentElement;
    root.style.setProperty("--house-accent", accent);
    // Si el acento es muy oscuro, ink debe ser claro
    const dark = ["#0A0A0A", "#1F8A5B", "#2A6FDB"].includes(accent.toUpperCase());
    root.style.setProperty("--house-accent-ink", dark ? "#FAFAF7" : "#0A0A0A");
  }, [accent]);

  return (
    <React.Fragment>
      {/* PREMIO MAYOR — primero, antes de las fotos */}
      <div className="house-section-wrap house-premio-intro">
        <p className="eyebrow">El premio mayor</p>
        <h2>Una casa de dos plantas.</h2>
        <p className="lead">Si no la quiere, se la compramos en $300.000.000 en efectivo.</p>
      </div>

      {/* HERO — carrusel: video oficial + fotos verticales */}
      <HouseHeroSlider items={(rifa.galeria || []).filter(g => g.vertical !== false)} />
      <div className="house-premio-mayor">
        <p className="hpm-intro">Si gana el premio mayor, tiene dos opciones:</p>
        <div className="hpm-opt">
          <div className="hpm-icon"><img src={window.ICONS_3D.key} alt="" /></div>
          <p className="hpm-eyebrow">Opción 1</p>
          <p className="hpm-titulo">Quédese con la casa</p>
          <p className="hpm-desc">Le entregamos Casa Santa Teresita tal cual la ve en las fotos.</p>
        </div>
        <div className="hpm-divider"><span>o</span></div>
        <div className="hpm-opt">
          <div className="hpm-icon"><img src={window.ICONS_3D.moneyBag} alt="" /></div>
          <p className="hpm-eyebrow">Opción 2</p>
          <p className="hpm-titulo">Se la compramos</p>
          <p className="hpm-desc">Le pagamos $300.000.000 en efectivo por la casa.</p>
        </div>
      </div>

      {/* CTA principal — sube acá, justo después de las opciones */}
      <div className="cb-cta-wrap">
        <div className="cb-cta-precio">
          <p className="cb-cta-precio-eyebrow">Cada boleta vale</p>
          <span className="cb-cta-precio-num">{window.formatCOP(rifa.precioBoleta)}</span>
          <span className="cb-cta-precio-unit"> COP</span>
        </div>
        <button className="cb-btn-primary" onClick={onComprar}>
          Comprar mi boleta
          <CompIcon name="arrowRight" size={20} />
        </button>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--ink-mute)", textAlign: "center", letterSpacing: 0.2 }}>
          o abone desde {window.formatCOP(rifa.abonoMinimo)} y termine de pagar antes del sorteo
        </p>
      </div>

      {/* DATOS DEL SORTEO — 4 mini-cards */}
      <div className="house-section-wrap house-section-spaced">
        <p className="eyebrow">Datos del sorteo</p>
        <h2>Todo lo que debe saber</h2>
      </div>
      <div className="house-datos">
        <div className="hd-card">
          <img className="hd-icon" src={window.ICONS_3D.calendar} alt="" />
          <p className="hd-label">Fecha del premio mayor</p>
          <p className="hd-value">4 de julio de 2026</p>
        </div>
        <div className="hd-card">
          <img className="hd-icon" src={window.ICONS_3D.target} alt="" />
          <p className="hd-label">Juega con</p>
          <p className="hd-value">Lotería de Boyacá</p>
        </div>
        <div className="hd-card">
          <img className="hd-icon" src={window.ICONS_3D.location} alt="" />
          <p className="hd-label">Ubicación de la casa</p>
          <p className="hd-value">Chinchiná, Caldas</p>
        </div>
        <div className="hd-card">
          <img className="hd-icon" src={window.ICONS_3D.trophy} alt="" />
          <p className="hd-label">Cuántos ganadores</p>
          <p className="hd-value">9 ganadores</p>
        </div>
      </div>

      {/* LOS TRES PREMIOS — sección negra destacada */}
      <div className="house-premios">
        <div className="hp-head">
          <h2 className="hp-titulo">Con una sola boleta participa en las nueve oportunidades.</h2>
        </div>

        <div className="hp-list">
          {/* 1 — Semanales */}
          <article className="hp-card">
            <div className="hp-card-top">
              <span className="hp-badge">01 · Semanal</span>
              <span className="hp-when">7 sábados</span>
            </div>
            <div className="hp-card-body">
              <img className="hp-icon" src={window.ICONS_3D.money} alt="" />
              <h3 className="hp-prize">$5.000.000</h3>
              <p className="hp-prize-sub">en bonos · cada sábado</p>
              <p className="hp-loteria">Juega con Lotería de Boyacá</p>
            </div>
          </article>

          {/* 2 — El Sueldazo */}
          <article className="hp-card hp-card-featured">
            <div className="hp-card-top">
              <span className="hp-badge">02 · Premio adicional</span>
              <span className="hp-when">Miércoles 3 de junio</span>
            </div>
            <div className="hp-card-body">
              <img className="hp-icon" src={window.ICONS_3D.moneyBag} alt="" />
              <p className="hp-prize-name">El Sueldazo</p>
              <h3 className="hp-prize">$1.500.000</h3>
              <p className="hp-prize-sub">en bonos · cada mes · 6 meses</p>
              <p className="hp-loteria">Juega con Lotería de Manizales</p>
            </div>
          </article>

          {/* 3 — Premio mayor */}
          <article className="hp-card hp-card-main">
            <div className="hp-card-top">
              <span className="hp-badge">03 · Premio mayor</span>
              <span className="hp-when">Sábado 4 de julio</span>
            </div>
            <div className="hp-card-body">
              <img className="hp-icon" src={window.ICONS_3D.key} alt="" />
              <p className="hp-prize-name">Casa Santa Teresita</p>
              <h3 className="hp-prize">Una casa</h3>
              <p className="hp-prize-sub">o $300.000.000 en efectivo</p>
              <p className="hp-loteria">Juega con Lotería de Boyacá</p>
            </div>
          </article>
        </div>
      </div>

      {/* QUIÉNES SOMOS — proof points visuales */}
      <div className="house-quienes">
        <p className="hq-eyebrow">Quiénes somos</p>
        <h2 className="hq-titulo">LOS PLATA S.A.S.</h2>
        <p className="hq-lead">Empresa colombiana de rifas legalmente constituida, con oficina en Chinchiná, Caldas.</p>
        <div className="hq-grid">
          <div className="hq-item">
            <img className="hq-ico" src={window.ICONS_3D.shield} alt="" />
            <p className="hq-l">Empresa legal</p>
            <p className="hq-v">NIT 902.003.134-4</p>
          </div>
          <div className="hq-item">
            <img className="hq-ico" src={window.ICONS_3D.fileText} alt="" />
            <p className="hq-l">Autorización oficial</p>
            <p className="hq-v">Autorizados por EDSA</p>
          </div>
        </div>
      </div>

      {/* CANALES OFICIALES (anti-estafa) — match home page aviso */}
      <div className="hub-aviso">
        <div className="hub-aviso-icon hub-aviso-icon-3d">
          <img src="assets/icon-3d-lock.png" alt="" />
        </div>
        <div>
          <p className="hub-aviso-t">Cuídese de las estafas</p>
          <p className="hub-aviso-d">Solo aceptamos pagos a cuentas a nombre de <strong>LOS PLATA S.A.S.</strong> Si tiene dudas, escríbanos al WhatsApp oficial <strong>+57 310 733 4957</strong>.</p>
        </div>
      </div>

      {/* FAQ — reducido a esenciales */}
      <div className="cb-faq">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <img src={window.ICONS_3D.chat} alt="" style={{ width: 48, height: 48 }} />
          <div>
            <p className="cb-section-eyebrow" style={{ margin: 0 }}>Preguntas frecuentes</p>
            <h2 className="cb-section-titulo" style={{ margin: 0 }}>Dudas comunes</h2>
          </div>
        </div>
        <FAQItem q="¿Cómo sé que el sorteo es real?">
          Somos <strong>LOS PLATA S.A.S.</strong> (NIT 902.003.134-4), empresa colombiana legalmente constituida con oficina en Chinchiná. Cada sorteo cuenta con <strong>resolución de EDSA</strong> (consultable en su página oficial) y se rige por la <strong>Ley 643 de 2001</strong>. Jugamos con la <strong>{rifa.loteria}</strong>.
        </FAQItem>
        <FAQItem q="¿Qué pasa si gano y prefiero el dinero?">
          Le pagamos <strong>$300.000.000 en efectivo</strong> a la cuenta que usted indique, una vez verificada su identidad.
        </FAQItem>
        <FAQItem q="¿Cómo recibo mi boleta?">
          Por WhatsApp, máximo dos horas después del primer pago, con su nombre y número asignado.
        </FAQItem>
        <FAQItem q="¿Tengo que pagar impuestos si gano?">
          Como con cualquier bien que cambia de dueño en Colombia, el ganador asume la <strong>ganancia ocasional</strong> ante la DIAN y los gastos de <strong>escrituración</strong>. Lo acompañamos en cada paso.
        </FAQItem>
        <FAQItem q="¿Cuánto tiempo tengo para reclamar mi premio?">
          <strong>30 días hábiles</strong> desde la fecha del sorteo.
        </FAQItem>
      </div>

      {/* CTA final */}
      <div className="cb-cta-wrap" style={{ marginTop: 32, marginBottom: 100 }}>
        <button className="cb-btn-primary dark" onClick={onComprar}>
          Comprar mi boleta ahora
          <CompIcon name="arrowRight" size={20} color="var(--house-accent)" />
        </button>
      </div>

      {/* Barra inferior sticky: aparece al scrollear para que el CTA esté
          siempre a un tap de distancia, sin tener que volver arriba */}
      <StickyBuyBar onComprar={onComprar} rifa={rifa} />
    </React.Fragment>
  );
};

// ─── Sticky buy bar (aparece al scrollear, ocupada solo durante la landing) ───
function StickyBuyBar({ onComprar, rifa }) {
  const [visible, setVisible] = useHL(false);
  useHE(() => {
    const handler = () => setVisible(window.scrollY > 520);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(250, 250, 247, 0.92)",
        backdropFilter: "blur(14px) saturate(150%)",
        WebkitBackdropFilter: "blur(14px) saturate(150%)",
        borderTop: "1px solid rgba(10,10,10,0.08)",
        padding: "12px 16px calc(12px + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 -10px 30px rgba(0,0,0,0.08)",
        transform: visible ? "translateY(0)" : "translateY(110%)",
        transition: "transform 0.34s cubic-bezier(.3,.7,.4,1), opacity 0.34s",
        opacity: visible ? 1 : 0,
        zIndex: 90,
        pointerEvents: visible ? "auto" : "none"
      }}
    >
      <div style={{
        maxWidth: 480,
        margin: "0 auto",
        display: "flex",
        alignItems: "center",
        gap: 14
      }}>
        <div style={{ flex: "0 0 auto", lineHeight: 1.1 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#6E6E6E",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 2
          }}>
            Cada boleta
          </div>
          <div style={{
            fontSize: 19,
            fontWeight: 800,
            color: "#0A0A0A",
            letterSpacing: "-0.01em"
          }}>
            {window.formatCOP(rifa.precioBoleta)}
          </div>
        </div>
        <button
          type="button"
          onClick={onComprar}
          style={{
            flex: 1,
            padding: "14px 16px",
            background: "#9BFAB0",
            color: "#0A0A0A",
            border: 0,
            borderRadius: 100,
            fontFamily: "Inter, sans-serif",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 20px rgba(155,250,176,0.4)",
            transition: "background 0.18s, transform 0.18s"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#C4FBD0"}
          onMouseLeave={e => e.currentTarget.style.background = "#9BFAB0"}
        >
          Comprar mi boleta
          <CompIcon name="arrowRight" size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── Slider full-width del hero (foto + caption pill) ───
function HouseHeroSlider({ items }) {
  const [idx, setIdx] = useHL(0);
  const [videoOpen, setVideoOpen] = useHL(false);
  const total = items.length;
  const go = (dir) => setIdx(prev => (prev + dir + total) % total);

  // Swipe táctil
  const startX = useHR(null);
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    startX.current = null;
  };

  // Auto-scroll de la tira de miniaturas para mantener la activa centrada
  const thumbsRef = useHR(null);
  useHE(() => {
    const container = thumbsRef.current;
    if (!container) return;
    const activeThumb = container.children[idx];
    if (!activeThumb) return;
    const targetLeft = activeThumb.offsetLeft - container.clientWidth / 2 + activeThumb.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [idx]);

  return (
    <div className="house-hero-slider natural" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="hhs-track">
        {items.map((it, i) => (
          <div className={"hhs-slide" + (i === idx ? " active" : "")} key={i}>
            {it.tipo === "video" ? (
              <React.Fragment>
                <img src={it.posterUrl} alt={it.titulo} loading={i === 0 ? "eager" : "lazy"} />
                <button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  aria-label={`Ver: ${it.titulo}`}
                  style={{
                    position: "absolute", inset: 0,
                    border: 0, padding: 0, cursor: "pointer",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.6) 100%)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 14
                  }}
                >
                  <span style={{
                    width: 76, height: 76, borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.95)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.35)"
                  }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="#0A0A0A" aria-hidden="true">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </span>
                  <span style={{
                    fontSize: 17, fontWeight: 600, color: "white",
                    letterSpacing: "0.02em", textShadow: "0 2px 8px rgba(0,0,0,0.6)"
                  }}>
                    Ver video de la casa
                  </span>
                </button>
              </React.Fragment>
            ) : (
              <img src={it.url} alt={it.titulo} loading={i === 0 ? "eager" : "lazy"} />
            )}
            {it.titulo && it.tipo !== "video" && <span className="hhs-cap">{it.titulo}</span>}
          </div>
        ))}
      </div>

      <button className="hhs-arrow prev" onClick={() => go(-1)} aria-label="Anterior">
        <CompIcon name="arrowLeft" size={20} />
      </button>
      <button className="hhs-arrow next" onClick={() => go(1)} aria-label="Siguiente">
        <CompIcon name="arrowRight" size={20} />
      </button>

      <div className="hhs-counter">{idx + 1} / {total}</div>

      <div
        ref={thumbsRef}
        style={{
          display: "flex",
          gap: 8,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "14px 16px 6px",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch"
        }}
      >
        {items.map((it, i) => {
          const isActive = i === idx;
          const thumbSrc = it.tipo === "video" ? it.posterUrl : it.url;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Ir a la foto ${i + 1}${it.titulo ? ": " + it.titulo : ""}`}
              style={{
                flex: "0 0 auto",
                width: 52, height: 68,
                padding: 0, border: 0, cursor: "pointer",
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
                opacity: isActive ? 1 : 0.5,
                boxShadow: isActive
                  ? "0 0 0 2px var(--gold, #9BFAB0), 0 4px 12px rgba(0,0,0,0.18)"
                  : "0 0 0 1px rgba(0,0,0,0.08)",
                transform: isActive ? "translateY(-2px)" : "none",
                transition: "opacity 0.18s, transform 0.18s, box-shadow 0.18s",
                background: "var(--cream-100, #F2F1EC)"
              }}
            >
              <img src={thumbSrc} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {it.tipo === "video" && (
                <span aria-hidden="true" style={{
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.32)"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {videoOpen && (() => {
        const v = items.find(it => it.tipo === "video");
        return v ? <VideoLightbox videoId={v.videoId} titulo={v.titulo} onClose={() => setVideoOpen(false)} /> : null;
      })()}
    </div>
  );
}

// ─── Lightbox del video (pantalla completa, aspect 16:9 correcto) ───
function VideoLightbox({ videoId, titulo, onClose }) {
  useHE(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.94)",
        zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "0 12px"
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar video"
        style={{
          position: "fixed", top: 16, right: 16,
          width: 42, height: 42, borderRadius: "50%",
          border: 0, background: "rgba(255,255,255,0.15)",
          color: "white", fontSize: 22, cursor: "pointer",
          backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}
      >
        ✕
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 960,
          aspectRatio: "16 / 9",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          background: "#000"
        }}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&autoplay=1&playsinline=1&vq=hd1080`}
          title={titulo}
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ─── Carrusel del hero (3 estilos) ───
function HouseCarousel({ imagenes, galeria, variant }) {
  const [idx, setIdx] = useHL(0);
  const total = imagenes.length;
  const go = (dir) => setIdx(prev => Math.max(0, Math.min(total - 1, prev + dir)));

  // título asociado a la foto (busco en galería)
  const tituloDe = (url) => {
    const found = galeria.find(g => g.url === url);
    return found ? found.titulo : "";
  };

  return (
    <div className={"cb-carousel house-mode style-" + variant}>
      <div className="cb-carousel-track" style={{ transform: `translateX(-${idx * 100}%)` }}>
        {imagenes.map((url, i) => (
          <div className="cb-carousel-slide" key={i}>
            {variant === "magazine" && (
              <div className="cb-carousel-counter">{String(i + 1).padStart(2, "0")}</div>
            )}
            <div className="cb-carousel-img">
              <img src={url} alt={tituloDe(url)} />
            </div>
            {variant !== "minimal" && (
              <div className="cb-carousel-overlay">
                <span className="cb-carousel-tipo">Su nueva casa</span>
                <h3 className="cb-carousel-nombre">{tituloDe(url)}</h3>
                {variant === "editorial" ? (
                  <p className="cb-carousel-desc">Foto {i + 1} de {total}</p>
                ) : (
                  <p className="cb-carousel-fecha">Sorteo: 4 de julio de 2026</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <button className="cb-carousel-arrow prev" onClick={() => go(-1)} disabled={idx === 0} aria-label="Anterior">
        <CompIcon name="arrowLeft" size={20} />
      </button>
      <button className="cb-carousel-arrow next" onClick={() => go(1)} disabled={idx === total - 1} aria-label="Siguiente">
        <CompIcon name="arrowRight" size={20} />
      </button>

      <div className="cb-carousel-dots">
        {imagenes.map((_, i) => (
          <button
            key={i}
            className={"cb-carousel-dot" + (i === idx ? " active" : "")}
            onClick={() => setIdx(i)}
            aria-label={`Ir a la foto ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Countdown ───
function Countdown({ fechaObjetivo }) {
  const [now, setNow] = useHL(Date.now());
  useHE(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(fechaObjetivo).getTime();
  const diff = Math.max(0, target - now);
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
  const horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const segs = Math.floor((diff / 1000) % 60);
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div className="cb-countdown">
      <p className="cb-countdown-label">Faltan para el sorteo de la casa</p>
      <div className="cb-countdown-grid">
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(dias)}</span>
          <span className="cb-countdown-unit">Días</span>
        </div>
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(horas)}</span>
          <span className="cb-countdown-unit">Horas</span>
        </div>
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(mins)}</span>
          <span className="cb-countdown-unit">Min</span>
        </div>
        <div className="cb-countdown-cell">
          <span className="cb-countdown-num">{pad(segs)}</span>
          <span className="cb-countdown-unit">Seg</span>
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Item ───
function FAQItem({ q, children }) {
  const [open, setOpen] = useHL(false);
  return (
    <div className={"cb-faq-item" + (open ? " open" : "")}>
      <button className="cb-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className="cb-faq-icon">
          <CompIcon name={open ? "minus" : "plus"} size={16} />
        </span>
      </button>
      {open && <div className="cb-faq-a">{children}</div>}
    </div>
  );
}

// ─── Galería ───
function Galeria({ items }) {
  const [open, setOpen] = useHL(-1);

  // Patrón: 1ª wide, luego pares, cada 5 una wide
  const layout = items.map((_, i) => (i === 0 || i % 5 === 0) ? "wide" : "");

  const close = () => setOpen(-1);
  const prev = () => setOpen(i => Math.max(0, i - 1));
  const next = () => setOpen(i => Math.min(items.length - 1, i + 1));

  useHE(() => {
    if (open < 0) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <React.Fragment>
      <div className="house-galeria-grid">
        {items.map((item, i) => (
          <div
            key={i}
            className={"house-galeria-item " + layout[i]}
            onClick={() => setOpen(i)}
          >
            <img src={item.url} alt={item.titulo} loading="lazy" />
            <span className="house-galeria-cap">{item.titulo}</span>
          </div>
        ))}
      </div>

      {open >= 0 && (
        <div className="house-lightbox" onClick={close}>
          <button className="house-lb-close" onClick={(e) => { e.stopPropagation(); close(); }} aria-label="Cerrar">
            <CompIcon name="x" size={18} />
          </button>
          <div className="house-lb-img" onClick={(e) => e.stopPropagation()}>
            <img src={items[open].url} alt={items[open].titulo} />
          </div>
          <div className="house-lb-cap">
            {items[open].titulo} · {open + 1} de {items.length}
          </div>
          <button
            className="house-lb-nav prev"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            disabled={open === 0}
            aria-label="Anterior"
          >
            <CompIcon name="arrowLeft" size={20} />
          </button>
          <button
            className="house-lb-nav next"
            onClick={(e) => { e.stopPropagation(); next(); }}
            disabled={open === items.length - 1}
            aria-label="Siguiente"
          >
            <CompIcon name="arrowRight" size={20} />
          </button>
        </div>
      )}
    </React.Fragment>
  );
}

// Exponer también el FAQItem para que comprar-steps pueda reusarlo si quiere
window.HouseFAQItem = FAQItem;
