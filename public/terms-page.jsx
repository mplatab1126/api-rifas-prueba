// terms-page.jsx — App de términos y condiciones (extraído de terminos-y-condiciones.html)

function TermsApp() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <React.Fragment>
      <div className="terms">
        <div className="ab-topbar">
          <button className="ab-back" onClick={() => history.length > 1 ? history.back() : (location.href='/')} aria-label="Volver">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h1 className="ab-topbar-title">Términos y condiciones</h1>
          <HamburgerBtn onClick={() => setMenuOpen(true)} />
        </div>
        <NavDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div className="terms-content">
          <p className="ab-eyebrow">Rifa "La Plata House"</p>

          <h2>1. Organizador</h2>
          <p>La rifa es organizada por <strong>LOS PLATA S.A.S.</strong>, NIT 902.003.134-4, sociedad domiciliada en Chinchiná, Caldas, Colombia, y registrada ante la Cámara de Comercio. La marca LOS PLATA está registrada ante la Superintendencia de Industria y Comercio (SIC).</p>

          <h2>2. Marco legal y autorización</h2>
          <p>Cada sorteo de esta rifa se realiza al amparo de la <strong>resolución de autorización expedida por EDSA</strong> para la edición correspondiente, en cumplimiento de la <strong>Ley 643 de 2001</strong> y demás normas que regulan los juegos de suerte y azar en Colombia. La resolución vigente puede consultarse públicamente en la página oficial de EDSA, lo que evidencia la legalidad y trazabilidad de la rifa.</p>

          <h2>3. Premios</h2>
          <ul>
            <li><strong>Premio Mayor — La Plata House:</strong> casa de dos plantas ubicada en el barrio Santa Teresita, Chinchiná, Caldas, entregada con todo lo que se aprecia en las fotografías oficiales. Sorteo: <strong>sábado 4 de julio de 2026</strong>.</li>
            <li><strong>Opción de canje:</strong> si el ganador prefiere no recibir la casa, LOS PLATA S.A.S. se la compra por <strong>$300.000.000 COP en efectivo</strong>.</li>
            <li><strong>El Sueldazo:</strong> $1.500.000 mensuales durante seis (6) meses ($9.000.000 totales) para un único ganador. Sorteo: <strong>miércoles 3 de junio de 2026</strong>.</li>
            <li><strong>Premios semanales:</strong> $5.000.000 a un único ganador cada uno de los siete (7) sábados previos al sorteo mayor.</li>
          </ul>

          <h2>4. Sorteo</h2>
          <p>Los sorteos se realizan con la lotería oficial correspondiente a cada premio:</p>
          <ul>
            <li><strong>Premio Mayor (La Plata House) y premios semanales ($5.000.000):</strong> juegan con la <strong>Lotería de Boyacá</strong>.</li>
            <li><strong>El Sueldazo:</strong> juega con la <strong>Lotería de Manizales</strong> el miércoles correspondiente.</li>
          </ul>
          <p>En todos los casos, el número ganador corresponde a las <strong>últimas 4 cifras</strong> del resultado oficial publicado en la fecha del sorteo.</p>

          <h2>5. Condiciones para ganar</h2>
          <ul>
            <li><strong>Premio Mayor (La Plata House):</strong> la boleta debe estar 100% pagada ($150.000) al momento del sorteo.</li>
            <li><strong>El Sueldazo (3 de junio):</strong> el cliente debe haber abonado mínimo $50.000 antes de esa fecha.</li>
            <li><strong>Premios semanales ($5.000.000):</strong> el cliente debe haber abonado mínimo $20.000 antes de la fecha del sorteo correspondiente.</li>
          </ul>

          <h2>6. Vendedores autorizados y pagos oficiales</h2>
          <p><strong>LOS PLATA S.A.S.</strong> únicamente se hace responsable de las boletas vendidas por sus vendedores autorizados y de los pagos realizados a la cuenta oficial: <strong>Bancolombia Ahorros 706-000025-93</strong>.</p>
          <p>Puede consultar la lista actualizada de canales y vendedores autorizados en <a href="/canales-oficiales" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>Canales oficiales</a>. No realice pagos a cuentas personales ni compre boletas a personas no listadas en esa página; LOS PLATA no responde por transacciones realizadas por fuera de los canales oficiales.</p>

          <h2>7. Entrega de premios</h2>
          <p>El premio se entrega al titular registrado en la boleta ganadora, previa validación de identidad con el documento registrado y comprobante de pago. La entrega se realiza en Colombia.</p>

          <h2>8. Trámites y obligaciones del premio</h2>
          <p>Le entregamos su premio <strong>libre de gravámenes y al día</strong> con las certificaciones de ley vigentes al momento de la entrega. Como ocurre con cualquier bien que cambia de dueño en Colombia, los <strong>trámites para ponerlo a su nombre y los impuestos correspondientes los asume el ganador</strong>. Esto incluye, según el tipo de premio:</p>
          <ul>
            <li>La <strong>ganancia ocasional</strong> ante la DIAN, aplicable por ley a los premios de rifas.</li>
            <li>Para la <strong>casa:</strong> el ganador asume la <strong>escrituración, gastos notariales y registro</strong> ante la Oficina de Instrumentos Públicos.</li>
            <li>Para premios en <strong>efectivo:</strong> retención en la fuente y demás obligaciones tributarias aplicables.</li>
          </ul>
          <p>Lo acompañamos en cada paso para que el proceso sea claro y sencillo.</p>

          <h2>9. Plazo para reclamar el premio</h2>
          <p>El ganador cuenta con <strong>30 días hábiles</strong> contados desde la fecha del sorteo para contactarnos por los canales oficiales y reclamar su premio. Pasado ese término sin que medie justa causa, el premio podrá ser declarado desierto o reasignado conforme a las normas vigentes.</p>

          <h2>10. Soporte</h2>
          <p>Cualquier consulta debe realizarse por nuestros canales oficiales: WhatsApp <strong>+57 310 733 4957</strong> o nuestras redes sociales verificadas listadas en <a href="/canales-oficiales" style={{ color: 'var(--ink)', textDecoration: 'underline' }}>Canales oficiales</a>.</p>

          <p className="terms-meta">Última actualización: mayo de 2026. Aplican términos y condiciones generales publicados en losplata.com.co.</p>
        </div>
        <SharedFooter />
      </div>
    </React.Fragment>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<TermsApp />);
