/**
 * Named US region → ISO 3166-2 state code mappings.
 *
 * Used by getAirportsByRegion() to resolve natural-language region names
 * (e.g. "midwest", "west coast") into the state codes stored in OurAirports CSV.
 *
 * Keys are lower-cased at lookup time, so capitalisation in user queries does not matter.
 * Common hyphenated and spaced variants are included as separate entries.
 */
export const NAMED_REGIONS: Record<string, string[]> = {
  // ── Northeast ──────────────────────────────────────────────────────────────
  'new england': ['US-MA', 'US-CT', 'US-RI', 'US-NH', 'US-ME', 'US-VT'],
  'mid-atlantic': [
    'US-NY',
    'US-NJ',
    'US-PA',
    'US-DE',
    'US-MD',
    'US-VA',
    'US-WV',
  ],
  'mid atlantic': [
    'US-NY',
    'US-NJ',
    'US-PA',
    'US-DE',
    'US-MD',
    'US-VA',
    'US-WV',
  ],
  northeast: [
    'US-MA',
    'US-CT',
    'US-RI',
    'US-NH',
    'US-ME',
    'US-VT',
    'US-NY',
    'US-NJ',
    'US-PA',
    'US-DE',
    'US-MD',
  ],

  // ── South ──────────────────────────────────────────────────────────────────
  southeast: [
    'US-NC',
    'US-SC',
    'US-GA',
    'US-FL',
    'US-AL',
    'US-MS',
    'US-TN',
    'US-KY',
  ],
  'south east': [
    'US-NC',
    'US-SC',
    'US-GA',
    'US-FL',
    'US-AL',
    'US-MS',
    'US-TN',
    'US-KY',
  ],
  south: [
    'US-TX',
    'US-OK',
    'US-AR',
    'US-LA',
    'US-NC',
    'US-SC',
    'US-GA',
    'US-FL',
    'US-AL',
    'US-MS',
    'US-TN',
    'US-KY',
  ],
  'gulf coast': ['US-TX', 'US-LA', 'US-MS', 'US-AL', 'US-FL'],

  // ── Midwest ────────────────────────────────────────────────────────────────
  midwest: [
    'US-OH',
    'US-IN',
    'US-IL',
    'US-MI',
    'US-WI',
    'US-MN',
    'US-IA',
    'US-MO',
    'US-ND',
    'US-SD',
    'US-NE',
    'US-KS',
  ],
  'great plains': [
    'US-ND',
    'US-SD',
    'US-NE',
    'US-KS',
    'US-MN',
    'US-IA',
    'US-MO',
  ],

  // ── Mountain / West ────────────────────────────────────────────────────────
  'mountain west': ['US-MT', 'US-ID', 'US-WY', 'US-CO', 'US-UT'],
  mountain: ['US-MT', 'US-ID', 'US-WY', 'US-CO', 'US-UT'],
  'rocky mountain': ['US-MT', 'US-ID', 'US-WY', 'US-CO', 'US-UT'],
  southwest: ['US-AZ', 'US-NM', 'US-NV', 'US-TX'],
  'south west': ['US-AZ', 'US-NM', 'US-NV', 'US-TX'],
  west: [
    'US-WA',
    'US-OR',
    'US-CA',
    'US-NV',
    'US-ID',
    'US-MT',
    'US-WY',
    'US-CO',
    'US-UT',
    'US-AZ',
    'US-NM',
  ],

  // ── Pacific ────────────────────────────────────────────────────────────────
  'pacific northwest': ['US-WA', 'US-OR'],
  'west coast': ['US-WA', 'US-OR', 'US-CA'],
  'pacific coast': ['US-WA', 'US-OR', 'US-CA'],

  // ── Individual states (common query targets) ───────────────────────────────
  california: ['US-CA'],
  texas: ['US-TX'],
  florida: ['US-FL'],
  'new york': ['US-NY'],
  alaska: ['US-AK'],
  hawaii: ['US-HI'],
};
