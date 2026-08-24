/**
 * E.164 country calling codes, keyed by ISO 3166-1 alpha-2 — the same keys `COUNTRY_OPTIONS` uses.
 *
 * ── Why a hand-maintained map ─────────────────────────────────────────────────────────────────
 *
 * Country NAMES come from CLDR via ICU (see `candidate.js`), but dial codes do not: `Intl` carries
 * no telephony data at all. The only library that would supply them is `libphonenumber`, ~500 KB for one
 * lookup table, which is not a trade worth making for a settings field. So this is ITU-T E.164
 * reference data, committed as literals and validated structurally by the tests below it.
 *
 * ── Codes are NOT unique, and that is the whole design constraint ─────────────────────────────
 *
 * `+1` covers the United States, Canada and about twenty NANP territories. `+44` covers the UK,
 * Jersey, Guernsey and the Isle of Man. `+7` covers Russia and Kazakhstan. `+262` covers Réunion
 * and Mayotte. `+590`, `+599`, `+672`, `+358`, `+47`, `+61`, `+212`, `+290`, `+500`, `+39`, `+64`
 * are all shared too.
 *
 * The consequence is the reason `users.phoneCountry` exists: a stored string of "+1 5551234567"
 * cannot tell you which of twenty-odd countries the person picked, so the selection has to be
 * stored alongside the number rather than inferred back out of it. Anything that tries to recover
 * the country from the dial code alone is guessing.
 *
 * Territories with no assigned code are simply absent (Bouvet Island routes via Norway, so it
 * carries +47; Antarctica has +672 by convention). A country absent from this map cannot be
 * selected as a dialling country, which is why `OTHER` ("Elsewhere") does not appear — it is not a
 * place you can telephone.
 */

import { COUNTRY_OPTIONS } from './candidate.js';

export const CALLING_CODES = Object.freeze({
  AD: '+376', AE: '+971', AF: '+93',  AG: '+1',   AI: '+1',   AL: '+355', AM: '+374', AO: '+244',
  AQ: '+672', AR: '+54',  AS: '+1',   AT: '+43',  AU: '+61',  AW: '+297', AX: '+358', AZ: '+994',
  BA: '+387', BB: '+1',   BD: '+880', BE: '+32',  BF: '+226', BG: '+359', BH: '+973', BI: '+257',
  BJ: '+229', BL: '+590', BM: '+1',   BN: '+673', BO: '+591', BQ: '+599', BR: '+55',  BS: '+1',
  BT: '+975', BV: '+47',  BW: '+267', BY: '+375', BZ: '+501',
  CA: '+1',   CC: '+61',  CD: '+243', CF: '+236', CG: '+242', CH: '+41',  CI: '+225', CK: '+682',
  CL: '+56',  CM: '+237', CN: '+86',  CO: '+57',  CR: '+506', CU: '+53',  CV: '+238', CW: '+599',
  CX: '+61',  CY: '+357', CZ: '+420',
  DE: '+49',  DJ: '+253', DK: '+45',  DM: '+1',   DO: '+1',   DZ: '+213',
  EC: '+593', EE: '+372', EG: '+20',  EH: '+212', ER: '+291', ES: '+34',  ET: '+251',
  FI: '+358', FJ: '+679', FK: '+500', FM: '+691', FO: '+298', FR: '+33',
  GA: '+241', GB: '+44',  GD: '+1',   GE: '+995', GF: '+594', GG: '+44',  GH: '+233', GI: '+350',
  GL: '+299', GM: '+220', GN: '+224', GP: '+590', GQ: '+240', GR: '+30',  GS: '+500', GT: '+502',
  GU: '+1',   GW: '+245', GY: '+592',
  HK: '+852', HM: '+672', HN: '+504', HR: '+385', HT: '+509', HU: '+36',
  ID: '+62',  IE: '+353', IL: '+972', IM: '+44',  IN: '+91',  IO: '+246', IQ: '+964', IR: '+98',
  IS: '+354', IT: '+39',
  JE: '+44',  JM: '+1',   JO: '+962', JP: '+81',
  KE: '+254', KG: '+996', KH: '+855', KI: '+686', KM: '+269', KN: '+1',   KP: '+850', KR: '+82',
  KW: '+965', KY: '+1',   KZ: '+7',
  LA: '+856', LB: '+961', LC: '+1',   LI: '+423', LK: '+94',  LR: '+231', LS: '+266', LT: '+370',
  LU: '+352', LV: '+371', LY: '+218',
  MA: '+212', MC: '+377', MD: '+373', ME: '+382', MF: '+590', MG: '+261', MH: '+692', MK: '+389',
  ML: '+223', MM: '+95',  MN: '+976', MO: '+853', MP: '+1',   MQ: '+596', MR: '+222', MS: '+1',
  MT: '+356', MU: '+230', MV: '+960', MW: '+265', MX: '+52',  MY: '+60',  MZ: '+258',
  NA: '+264', NC: '+687', NE: '+227', NF: '+672', NG: '+234', NI: '+505', NL: '+31',  NO: '+47',
  NP: '+977', NR: '+674', NU: '+683', NZ: '+64',
  OM: '+968',
  PA: '+507', PE: '+51',  PF: '+689', PG: '+675', PH: '+63',  PK: '+92',  PL: '+48',  PM: '+508',
  PN: '+64',  PR: '+1',   PS: '+970', PT: '+351', PW: '+680', PY: '+595',
  QA: '+974',
  RE: '+262', RO: '+40',  RS: '+381', RU: '+7',   RW: '+250',
  SA: '+966', SB: '+677', SC: '+248', SD: '+249', SE: '+46',  SG: '+65',  SH: '+290', SI: '+386',
  SJ: '+47',  SK: '+421', SL: '+232', SM: '+378', SN: '+221', SO: '+252', SR: '+597', SS: '+211',
  ST: '+239', SV: '+503', SX: '+1',   SY: '+963', SZ: '+268',
  TC: '+1',   TD: '+235', TF: '+262', TG: '+228', TH: '+66',  TJ: '+992', TK: '+690', TL: '+670',
  TM: '+993', TN: '+216', TO: '+676', TR: '+90',  TT: '+1',   TV: '+688', TW: '+886', TZ: '+255',
  UA: '+380', UG: '+256', UM: '+1',   US: '+1',   UY: '+598', UZ: '+998',
  VA: '+39',  VC: '+1',   VE: '+58',  VG: '+1',   VI: '+1',   VN: '+84',  VU: '+678',
  WF: '+681', WS: '+685',
  YE: '+967', YT: '+262',
  ZA: '+27',  ZM: '+260', ZW: '+263',
});

/** @returns {string|null} the dial code for an ISO alpha-2, or null when it has none. */
export function callingCodeFor(iso) {
  if (!iso) return null;
  return CALLING_CODES[String(iso).trim().toUpperCase()] ?? null;
}

/** True when this ISO code is a place you can select as a dialling country. */
export function isDiallableCountry(iso) {
  return callingCodeFor(iso) !== null;
}

/**
 * Composes what gets STORED in `users.phone`.
 *
 * Deliberately a display-shaped string ("+91 9876543210") rather than strict E.164: `phone` is
 * account identity a human reads back, its existing validation accepts free text, and narrowing
 * the format now would reject numbers people legitimately have. The country is carried separately
 * in `phoneCountry`, so nothing depends on parsing this back.
 */
export function composePhone(iso, nationalNumber) {
  const national = String(nationalNumber ?? '').trim();
  if (!national) return '';

  const code = callingCodeFor(iso);
  if (!code) return national;

  /* Already prefixed — do not double it. */
  if (national.startsWith('+')) return national;

  return `${code} ${national}`;
}

/**
 * Best-effort decomposition of a stored `phone` when no `phoneCountry` is recorded.
 *
 * Only for legacy or seeded rows: everything written through the settings form stores the country
 * explicitly. It splits ONLY when the dial code is unambiguous — `+91` belongs to India alone, so
 * that is safe, while `+1` belongs to twenty-odd countries and guessing one would be worse than
 * not guessing. When it cannot tell, it returns the string untouched with no country, which
 * renders exactly what was stored and loses nothing.
 *
 * @returns {{ iso: string|null, national: string }}
 */
export function splitStoredPhone(stored) {
  const raw = String(stored ?? '').trim();
  if (!raw.startsWith('+')) return { iso: null, national: raw };

  const compact = raw.replace(/[\s-]/g, '');

  /* Longest code first, so +1268 is tried before +1. */
  const byLength = Object.entries(CALLING_CODES).sort((a, b) => b[1].length - a[1].length);

  for (const [, code] of byLength) {
    if (!compact.startsWith(code)) continue;

    const owners = Object.keys(CALLING_CODES).filter((iso) => CALLING_CODES[iso] === code);
    /* Shared code — the country is genuinely unknowable from the string. Leave it alone. */
    if (owners.length !== 1) return { iso: null, national: raw };

    return { iso: owners[0], national: raw.slice(code.length).trim() };
  }

  return { iso: null, national: raw };
}

/**
 * The dial-country picker's options, in the same alphabetical order as `COUNTRY_OPTIONS`.
 *
 * The label is `"India (+91)"` — name FIRST, deliberately. It is what the searchable combobox
 * matches on, and `rankOptions` puts label-prefix matches in its second tier, so leading with the
 * name is what makes typing "ind" surface India rather than burying it. Leading with the code (or
 * a flag emoji) would demote every country to a mid-string match.
 *
 * Both halves are still searchable: "india" hits the prefix tier, "91" and "+91" hit the substring
 * tier, and "IN" is an exact match on the option VALUE, which ranks first of all.
 *
 * `OTHER` is absent because it has no dial code — you cannot telephone "Elsewhere".
 */
export const CALLING_CODE_OPTIONS = Object.freeze(
  COUNTRY_OPTIONS.filter((country) => CALLING_CODES[country.value]).map((country) => ({
    value: country.value,
    label: `${country.label} (${CALLING_CODES[country.value]})`,
  })),
);
