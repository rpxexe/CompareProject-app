// Pure helpers (also unit-tested under Node).
export const isPresent = (v) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
export const orNA = (v) => (isPresent(v) ? (Array.isArray(v) ? v.join(', ') : String(v)) : 'N/A');

// "8" + 27 -> "8 of 27". Scraped floors often carry the total already ("9th of 20 Floors"),
// so the total is only appended when the floor text doesn't mention it.
export function floorText(p) {
  const floor = String(p?.floor ?? '').trim();
  const total = String(p?.totalFloors ?? '').trim();
  if (!total || /\bof\b/i.test(floor)) return floor;
  return [floor, `of ${total}`].filter(Boolean).join(' ');
}

export function formatInr(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 10000000) return `₹${+(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${+(n / 100000).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function timeAgo(date, now = Date.now()) {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d} d ago`;
  const mo = Math.round(d / 30); if (mo < 12) return `${mo} mo ago`;
  return `${Math.round(mo / 12)} y ago`;
}

export const maskPhone = (p) => (p && p.length === 10 ? `+91 ${p.slice(0, 2)}••• ••${p.slice(-3)}` : p || '');
// Groups a partially typed 10-digit mobile as "98765 43210" for display in inputs.
export const formatMobileInput = (digits) => {
  const d = String(digits || '').replace(/\D/g, '').slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
};

// Stored role/purpose values shown to people; `broker` is still the value in the database.
export const roleLabel = (v) => (v === 'broker' ? 'agent' : v || '');

export const formatPhone = (p) => (p && p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p || '');

// An RK is one room plus a kitchen; posted listings store it as "1RK", filters as "rk".
export const isRk = (b) => /rk/i.test(String(b ?? ''));

// Bedroom configuration as people read it: "2" -> "2 BHK", "1RK" -> "1 RK", and a comma list
// (a saved search's filter) "rk,2,3" -> "1 RK, 2, 3 BHK".
// BHKs a card offers: every configuration of a grouped project ("2, 3 BHK"), else the listing's own.
export const bhkSummary = (p) => bhkLabel(p?.bhkOptions?.length ? p.bhkOptions.join(',') : p?.bhk);

// Lowest price to advertise ("₹1.38 Cr"): the project's starting price, else the listing's lowest.
export const fromPrice = (p) => p?.priceFrom || p?.priceMin || p?.price || '';

export function bhkLabel(b) {
  const parts = String(b ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  const nums = parts.filter((x) => !isRk(x));
  return [parts.some(isRk) && '1 RK', nums.length && `${nums.join(', ')} BHK`].filter(Boolean).join(', ');
}

export function propertyFacts(p) {
  return [
    bhkLabel(p.bhk),
    p.area,
    p.propertyType,
  ].filter(Boolean);
}

export function ratingLabel(r) {
  if (!r || !r.count) return '';
  return `${r.average.toFixed(1)} (${r.count})`;
}

// Listing titles read "3 BHK Apartments in DGS Sheetal Sky Tower, Oshiwara, ..."; cards head
// with the project name when there is one (not when the "in ..." part is just the locality).
export function listingName(p) {
  // The project name (e.g. "Lodha Altus") is what cards show. Only when a listing has none (or it
  // comes from older saved data without it) fall back to a name pulled from the title.
  const project = String(p.projectName ?? '').trim();
  if (project) return project;
  const m = String(p.title || '').match(/\bin\s+([^,]+)/i);
  const name = m && m[1].trim();
  return name && name.toLowerCase() !== String(p.locality || '').toLowerCase() && name.toLowerCase() !== String(p.city || '').toLowerCase()
    ? name
    : p.title;
}
