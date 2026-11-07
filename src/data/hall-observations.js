// Historical appearance evidence only. Names, footprints and dimensions remain
// caller-owned; photo colors are lighting-dependent art choices, not albedo.
const APPEARANCE_FIELDS = ['wallColor', 'roofColor', 'roofShape', 'facadeMaterial', 'windowPattern'];
const CAUTION = 'Historical photograph; the lighting-dependent art palette is not a current survey or measured material/color. Visible bands are not measured storeys.';
const unknown = reason => ({ value: null, status: 'unknown', confidence: 'unknown', sourceUrl: null, observedAt: null, reason });
function observation(referenceFile, sourceUrl, observedAt, values, notes = {}) {
  const fields = Object.fromEntries(APPEARANCE_FIELDS.map(field => [field,
    values[field] == null ? unknown(notes[field] ?? 'The photographed view does not establish this residential-block attribute.') : {
      value: values[field], status: 'observed', confidence: 'medium', sourceUrl, observedAt,
      reason: `${notes[field] ?? 'Visible on the photographed established hall block.'} ${CAUTION}`,
    },
  ]));
  return { referenceFile, sourceUrl, observedAt, fields };
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

export const HALL_OBSERVATIONS = freeze({
  'way/532464712': observation('saddam-hall.jpg',
    'https://commons.wikimedia.org/wiki/File:Saddam_Hossain_hall,Islamic_University.jpg', '2021-04-02', {
      wallColor: '#c6c0ad', roofColor: '#958c85',
      roofShape: 'Flat weathered roof slabs and low parapets across connected courtyard wings.',
    }, {
      wallColor: 'Pale cream/gray visible parapets and limited wall strips; aerial coverage is roof-dominant.',
      roofColor: 'Muted warm gray/brown roof tone averages sunlit patches and weathering; no roof-material identification.',
      windowPattern: 'Overhead view does not resolve a reliable residential window pattern.',
    }),
  'way/532464760': observation('lalon-hall.jpg',
    'https://commons.wikimedia.org/wiki/File:Lalon_Shah_Hall,_resident_hall_of_Islamic_University,_Bangladesh.jpg', '2021-04-02', {
      wallColor: '#c9c8b9', roofColor: '#9d968e',
      roofShape: 'Flat parapeted roofs on angular courtyard wings with projecting stair/core volumes.',
    }, {
      wallColor: 'Pale cream/gray exposed facade bands and parapets around the angular court.',
      roofColor: 'Weathered gray/beige roof surfaces vary strongly between sun and shadow.',
      windowPattern: 'Oblique/overhead corridor strips do not establish the individual window pattern.',
    }),
  'way/967967197': observation('shahid-zia-hall.jpg',
    'https://commons.wikimedia.org/wiki/File:Shahid_ziaur_rahman_hall.jpg', '2021-04-15', {
      wallColor: '#e0ddcc', roofColor: '#7e7771',
      roofShape: 'Flat parapeted roofs on long parallel wings, transverse bridges and raised stair enclosures.',
      windowPattern: 'Repeated dark courtyard bays with rounded upper profiles and continuous corridor bands; outer-window detail unresolved.',
    }, {
      wallColor: 'Cream/off-white courtyard-facing surfaces in the historical aerial view.',
      roofColor: 'Muted brown-gray weathered roof average; dark patches are not a roof-material claim.',
    }),
  'way/532464837': observation('shah-aziz-historical.jpg',
    'https://commons.wikimedia.org/wiki/File:Father_of_the_Nation_Bangabandhu_Sheikh_Mujibur_Rahman_Hall,_Islamic_University,_Bangladesh.jpg', '2021-04-02', {
      wallColor: '#ce8e72', roofColor: '#878180',
      roofShape: 'Flat parapeted roof slabs on connected wings and lower central volumes, with small raised enclosures.',
      windowPattern: 'Repeated rectangular dark bays, pale vertical piers and horizontal corridor/balcony bands; some rounded-top recessed bays.',
    }, {
      wallColor: 'Warm orange/salmon wall panels contrast with pale piers and bands; one wall color is an art approximation.',
      roofColor: 'Weathered warm-gray rooftop average excludes dark pooled/shadow patches.',
    }),
  'way/532464846': observation('july-36-historical.jpg',
    'https://commons.wikimedia.org/wiki/File:Deshratna_Sheikh_Hasina_Hall,_Islamic_University,_Bangladesh.jpg', '2021-04-16', {
      wallColor: '#d2c58f',
      roofShape: 'Flat parapeted main wings with projecting eaves; triangular canopy/pediment belongs to the entrance.',
      windowPattern: 'Narrow dark horizontal window bands and pale framing; salmon recessed vertical entry bays.',
    }, {
      wallColor: 'Backlit cream/light-yellow main facade, with salmon accents; exposure limits exact color interpretation.',
      roofColor: 'Ground-level backlit photograph does not show enough roof surface to establish its color.',
    }),
  'way/970015482': observation('aisha-hall-historical.jpg',
    'https://commons.wikimedia.org/wiki/File:Mother_of_the_Bengal_Begum_Fazilatunnesa_Mujib_Hall,_Islamic_University,_Bangladesh.jpg', '2021-04-16', {},
    Object.fromEntries(APPEARANCE_FIELDS.map(field => [field,
      'The historical photograph primarily shows the entrance gate. Gate colors, arches and grilles cannot establish residential-block appearance.']))),
  'way/970015480': observation('khaleda-hall.jpg',
    'https://commons.wikimedia.org/wiki/File:Ladies_hall_(khaleda_zia_hall).jpg', '2021-04-15', {
      wallColor: '#d3bfbb', roofColor: '#a29d98',
      roofShape: 'Flat parapeted roofs on courtyard wings of differing elevations, with raised stair/core enclosures.',
      windowPattern: 'Repeated dark rectangular openings in pale framed vertical bays; low courtyard connectors include arched openings.',
    }, {
      wallColor: 'Pale pink/cream courtyard wing surfaces in an oblique historical aerial photograph.',
      roofColor: 'Gray/beige weathered slab average varies by wing and sun exposure.',
    }),
  'way/967967198': observation('shahid-anas-historical.jpg',
    'https://commons.wikimedia.org/wiki/File:Sheikh_Russel_Hall_of_Islamic_University,_Bangladesh.jpg', '2021-04-02', {
      wallColor: '#d49650', roofColor: '#8c8982',
      roofShape: 'Flat parapeted roofs and raised white stair/core enclosures on the photographed old block.',
      windowPattern: 'Orange/ochre panels in a white rectangular grid, narrow dark horizontal openings and a tall framed entrance bay.',
    }, {
      wallColor: 'Ochre/orange panels contrast with white bands on the photographed old block only; no appearance claim for a later second block.',
      roofColor: 'Gray weathered roof surface on the old block only; dark patches are not a structural/material diagnosis.',
    }),
});

/** Fill unknown hall appearance only; retain prior evidence and caller activation. */
export function applyHallObservations(records) {
  if (!Array.isArray(records)) throw new TypeError('Hall observations require a landmark record array');
  return records.map(record => {
    const copy = structuredClone(record);
    const observed = HALL_OBSERVATIONS[`${record?.osmType}/${record?.osmId}`];
    if (!observed) return copy;
    for (const [field, evidence] of Object.entries(observed.fields)) {
      if (evidence.value === null || (copy.fields?.[field] && copy.fields[field].status !== 'unknown')) continue;
      copy.fields ??= {};
      copy.fields[field] = structuredClone(evidence);
      if (field === 'wallColor' || field === 'roofColor') {
        copy.renderAppearance ??= {};
        const target = field === 'wallColor' ? 'wall' : 'roof';
        // An existing explicit mapping remains caller-owned.
        copy.renderAppearance[target] ??= field;
      }
    }
    return copy;
  });
}
