// hub-icons.jsx — Íconos grandes y claros para tarjetas (estilo amable, line+fill)

const HubIcon = ({ name, size = 44 }) => {
  const s = size;
  const stroke = "currentColor";
  switch (name) {
    case "ticket":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <path d="M8 14a3 3 0 0 1 3-3h26a3 3 0 0 1 3 3v5a3 3 0 0 0 0 6v5a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3v-5a3 3 0 0 0 0-6v-5z" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <path d="M22 14v20" stroke={stroke} strokeWidth="2.5" strokeDasharray="2 3" strokeLinecap="round"/>
          <circle cx="30" cy="24" r="2" fill={stroke}/>
        </svg>
      );
    case "money":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <rect x="6" y="14" width="36" height="22" rx="3" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <circle cx="24" cy="25" r="5.5" stroke={stroke} strokeWidth="2.5" fill="none"/>
          <path d="M24 21v8M22 23h4M22 27h4" stroke={stroke} strokeWidth="2" strokeLinecap="round"/>
          <circle cx="12" cy="25" r="1.5" fill={stroke}/>
          <circle cx="36" cy="25" r="1.5" fill={stroke}/>
        </svg>
      );
    case "bank":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <path d="M24 6 L42 16 L42 19 L6 19 L6 16 Z" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)" strokeLinejoin="round"/>
          <path d="M10 22v14M18 22v14M30 22v14M38 22v14" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M5 39h38" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="24" cy="14" r="1.5" fill={stroke}/>
        </svg>
      );
    case "users":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <circle cx="18" cy="18" r="6" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <circle cx="32" cy="20" r="5" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <path d="M6 38c0-5 5-9 12-9s12 4 12 9" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M28 30c5 0 14 2 14 8" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      );
    case "calendar":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <rect x="7" y="11" width="34" height="30" rx="3" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <path d="M7 19h34" stroke={stroke} strokeWidth="2.5"/>
          <path d="M16 6v8M32 6v8" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="16" cy="27" r="2" fill={stroke}/>
          <circle cx="24" cy="27" r="2" fill={stroke}/>
          <circle cx="32" cy="27" r="2" fill={stroke}/>
          <circle cx="16" cy="34" r="2" fill={stroke}/>
          <circle cx="24" cy="34" r="2" fill={stroke}/>
        </svg>
      );
    case "building":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <rect x="9" y="8" width="30" height="32" rx="2" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <rect x="15" y="14" width="5" height="5" stroke={stroke} strokeWidth="2"/>
          <rect x="28" y="14" width="5" height="5" stroke={stroke} strokeWidth="2"/>
          <rect x="15" y="23" width="5" height="5" stroke={stroke} strokeWidth="2"/>
          <rect x="28" y="23" width="5" height="5" stroke={stroke} strokeWidth="2"/>
          <rect x="20" y="32" width="8" height="8" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.25)"/>
          <path d="M5 40h38" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      );
    case "trophy":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <path d="M14 8h20v9a10 10 0 0 1-20 0V8z" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)" strokeLinejoin="round"/>
          <path d="M14 11h-5a4 4 0 0 0 5 7M34 11h5a4 4 0 0 1-5 7" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M20 28h8v6h-8z" stroke={stroke} strokeWidth="2.5"/>
          <path d="M16 38h16" stroke={stroke} strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M24 14l1.4 2.8 3 .4-2.2 2.1.5 3-2.7-1.4-2.7 1.4.5-3-2.2-2.1 3-.4z" fill={stroke}/>
        </svg>
      );
    case "chat":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <path d="M8 12a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H20l-8 7v-7h0a4 4 0 0 1-4-4V12z" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)" strokeLinejoin="round"/>
          <circle cx="17" cy="20" r="1.8" fill={stroke}/>
          <circle cx="24" cy="20" r="1.8" fill={stroke}/>
          <circle cx="31" cy="20" r="1.8" fill={stroke}/>
        </svg>
      );
    case "help":
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="17" stroke={stroke} strokeWidth="2.5" fill="rgba(255,255,255,0.18)"/>
          <path d="M19 19c.3-2.4 2.4-4 5-4 2.8 0 5 1.7 5 4.5 0 2-1.5 3.2-3 4-1.5.8-2 2-2 3.5" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <circle cx="24" cy="33" r="2" fill={stroke}/>
        </svg>
      );
    default:
      return null;
  }
};

window.HubIcon = HubIcon;
