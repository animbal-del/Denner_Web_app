// "What's included" — reads the furniture list out of a flat's description
// ("Included in the home: Bed, Wardrobe, Sofa, …") and shows it as icons.
// Items we don't recognise are skipped here; they still appear in the description.

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

const ICONS = {
  bed: <><path d="M3 18V7" {...P}/><path d="M3 14h18v4" {...P}/><path d="M21 18v-4a3 3 0 0 0-3-3h-7v3" {...P}/><circle cx="7" cy="11" r="1.6" {...P}/></>,
  wardrobe: <><rect x="5" y="3" width="14" height="18" rx="1.5" {...P}/><path d="M12 3v18M10 11v2M14 11v2" {...P}/></>,
  sofa: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" {...P}/><path d="M3 13a2 2 0 0 1 4 0v1h10v-1a2 2 0 0 1 4 0v4H3z" {...P}/><path d="M5 17v2M19 17v2" {...P}/></>,
  tv: <><rect x="3" y="5" width="18" height="12" rx="1.5" {...P}/><path d="M8 21h8M12 17v4" {...P}/></>,
  fridge: <><rect x="6" y="2.5" width="12" height="19" rx="2" {...P}/><path d="M6 10h12M9 6v2M9 13v3" {...P}/></>,
  washer: <><rect x="4" y="3" width="16" height="18" rx="2" {...P}/><circle cx="12" cy="13" r="4.5" {...P}/><path d="M7.5 6.5h1M11 6.5h1" {...P}/></>,
  ac: <><rect x="3" y="5" width="18" height="8" rx="1.5" {...P}/><path d="M6 10h12M8 16v3M12 16v4M16 16v3" {...P}/></>,
  dining: <><path d="M3 10h18M5 10v9M19 10v9M8 10l-1-4h10l-1 4" {...P}/></>,
  ctable: <><path d="M3 11h18M6 11v7M18 11v7" {...P}/></>,
  table: <><path d="M3 9h18M6 9v10M18 9v10M6 14h12" {...P}/></>,
  chair: <><path d="M7 3v9h10V3M7 12v8M17 12v8M7 16h10" {...P}/></>,
  geyser: <><rect x="7" y="3" width="10" height="14" rx="5" {...P}/><path d="M10 20v1M14 20v1M12 7v5" {...P}/></>,
  microwave: <><rect x="3" y="5" width="18" height="13" rx="1.5" {...P}/><rect x="6" y="8" width="9" height="7" rx="1" {...P}/><path d="M18 9v1M18 13v1" {...P}/></>,
  kitchen: <><path d="M4 21V11h16v10M4 15h16M12 11v10M3 11h18" {...P}/><path d="M7 4v4M10 4v4M7 6h3" {...P}/></>,
  chimney: <><path d="M10 3h4v6l5 5H5l5-5z" {...P}/><path d="M5 17h14" {...P}/></>,
  stove: <><rect x="3" y="10" width="18" height="8" rx="1.5" {...P}/><circle cx="8" cy="14" r="1.6" {...P}/><circle cx="16" cy="14" r="1.6" {...P}/><path d="M8 4c-1 1.5 1 2 0 4M16 4c-1 1.5 1 2 0 4" {...P}/></>,
  water: <><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" {...P}/></>,
  fan: <><circle cx="12" cy="12" r="1.8" {...P}/><path d="M12 10.2C11 6 13 3 15.5 4.5S14 10 12 10.2zM13.6 12.9c3.2 2.9 2.8 6.6.1 6.5s-2.5-5.2-.1-6.5zM10.4 12.9C6.3 14 3.4 11.9 4.9 9.6s5 1.1 5.5 3.3z" {...P}/></>,
  light: <><path d="M9 18h6M10 21h4" {...P}/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" {...P}/></>,
  curtains: <><path d="M3 3h18M5 3c0 7 2 12 4 18M19 3c0 7-2 12-4 18M5 21h4M15 21h4" {...P}/></>,
  inverter: <><rect x="4" y="7" width="16" height="12" rx="1.5" {...P}/><path d="M8 7V5M16 7V5M12.5 10l-2 3h3l-2 3" {...P}/></>,
  mirror: <><ellipse cx="12" cy="10" rx="5.5" ry="7" {...P}/><path d="M9 21h6M12 17v4" {...P}/></>,
  shoe: <><rect x="5" y="4" width="14" height="16" rx="1.5" {...P}/><path d="M5 9.5h14M5 15h14" {...P}/></>,
  generic: <><rect x="4" y="4" width="16" height="16" rx="3" {...P}/><path d="M8.5 12.5l2.5 2.5 4.5-5" {...P}/></>,
};

// Order matters: more specific phrases first ("dining table" before "table").
const ITEMS = [
  { key: 'bed', label: 'Bed', plural: 'Beds', re: /\b(?:double |single |queen |king )?beds?\b|\bcots?\b|\bmattress(?:es)?\b/ },
  { key: 'wardrobe', label: 'Wardrobe', plural: 'Wardrobes', re: /\bwardrobes?\b|\bcupboards?\b|\balmirah?s?\b/ },
  { key: 'sofa', label: 'Sofa', plural: 'Sofas', re: /\bsofa(?:\s*set)?s?\b|\bcouch(?:es)?\b|\bsettee\b/ },
  { key: 'tv', label: 'TV', plural: 'TVs', re: /\b(?:tv|tvs|television|televisions|led tv|smart tv)\b/ },
  { key: 'fridge', label: 'Fridge', plural: 'Fridges', re: /\bfridges?\b|\brefrigerators?\b/ },
  { key: 'washer', label: 'Washing machine', plural: 'Washing machines', re: /\bwashing\s*machines?\b|\bwasher\b/ },
  { key: 'ac', label: 'AC', plural: 'ACs', re: /\bacs?\b|\bair\s*condition(?:er|ers|ing)\b/ },
  { key: 'dining', label: 'Dining table', plural: 'Dining tables', re: /\bdining(?:\s*table)?s?\b/ },
  { key: 'table', label: 'Study table', plural: 'Study tables', re: /\b(?:study|work|office)\s*(?:table|desk)s?\b|\bdesks?\b|\bworkstations?\b/ },
  { key: 'ctable', label: 'Centre table', plural: 'Centre tables', re: /\b(?:centre|center|coffee)\s*tables?\b/ },
  { key: 'chair', label: 'Chairs', plural: 'Chairs', re: /\bchairs?\b/ },
  { key: 'geyser', label: 'Geyser', plural: 'Geysers', re: /\bgeysers?\b|\bwater\s*heaters?\b/ },
  { key: 'microwave', label: 'Microwave', plural: 'Microwaves', re: /\bmicrowaves?\b|\botg\b|\boven\b/ },
  { key: 'kitchen', label: 'Modular kitchen', plural: 'Modular kitchen', re: /\bmodular\s*kitchen\b|\bkitchen\s*(?:cabinets?|trolleys?)\b/ },
  { key: 'chimney', label: 'Chimney', plural: 'Chimneys', re: /\bchimneys?\b|\bexhaust\b/ },
  { key: 'stove', label: 'Gas stove', plural: 'Gas stoves', re: /\b(?:gas\s*)?stoves?\b|\bhob\b|\bgas\s*(?:connection|pipeline)\b/ },
  { key: 'water', label: 'Water purifier', plural: 'Water purifiers', re: /\b(?:ro|water\s*purifier|aquaguard|purifier)s?\b/ },
  { key: 'fan', label: 'Fans', plural: 'Fans', re: /\b(?:ceiling\s*)?fans?\b/ },
  { key: 'light', label: 'Lights', plural: 'Lights', re: /\blights?\b|\blighting\b|\btube\s*lights?\b/ },
  { key: 'curtains', label: 'Curtains', plural: 'Curtains', re: /\bcurtains?\b|\bblinds\b/ },
  { key: 'inverter', label: 'Inverter', plural: 'Inverters', re: /\binverters?\b|\bpower\s*backup\b/ },
  { key: 'mirror', label: 'Dressing table', plural: 'Dressing tables', re: /\bdressing\s*(?:table|unit)s?\b|\bmirrors?\b/ },
  { key: 'shoe', label: 'Shoe rack', plural: 'Shoe racks', re: /\bshoe\s*racks?\b/ },
];

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

// Pull out the comma-separated list after "Included in the home:" (or a
// "Furniture:"/"Amenities included:" line), up to the end of that sentence.
export function extractFurnitureText(description) {
  const text = String(description || '');
  const m = text.match(/(?:included\s+in\s+the\s+home|furniture(?:\s+(?:list|provided|included))?)\s*[:\-–]\s*([^\n]+?)(?:\.(?:\s|$)|\n|$)/i);
  return m ? m[1] : '';
}

export function parseFurniture(description) {
  const list = extractFurnitureText(description);
  if (!list) return [];
  const found = new Map();
  for (const rawPart of list.split(/,|;|\/|\band\b|&|\+/i)) {
    const part = rawPart.trim().toLowerCase();
    if (!part) continue;
    for (const item of ITEMS) {
      if (!item.re.test(part)) continue;
      const n = part.match(/^(\d+|one|two|three|four|five|six)\b/)?.[1];
      const count = n ? (NUM_WORDS[n] || Number(n)) : 0;
      const prev = found.get(item.key);
      found.set(item.key, { ...item, count: (prev?.count || 0) + count });
      break; // one icon per list entry
    }
  }
  return [...found.values()];
}

export default function FurnitureIcons({ description }) {
  const items = parseFurniture(description);
  if (!items.length) return null;
  return (
    <div className="detail-furniture">
      <h3 className="detail-specs-heading">What's included</h3>
      <ul className="detail-furniture-grid">
        {items.map((item) => (
          <li key={item.key} className="detail-furniture-item">
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">{ICONS[item.key] || ICONS.generic}</svg>
            <span>{item.count > 1 ? `${item.count} ${item.plural}` : item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
