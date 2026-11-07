import { readFile, writeFile } from 'node:fs/promises';

// Research-only: update the appendix in this task's new report from its saved inventory.
// No source XML, application files or generated gameplay assets are written.
const inventory = JSON.parse(await readFile(new URL('osm-inventory.json', import.meta.url), 'utf8'));
const reportUrl = new URL('../campus-realism.md', import.meta.url);
const identities = {
  '7650711': ['Birshreshtha Hamidur Rahman Auditorium', 'বীরশ্রেষ্ঠ হামিদুর রহমান মিলনায়তন', 'L08', 'Unknown; double-height hall; 2–3 photo bands do not establish floors'],
  '18079379': ['Applied Science and Technology Building', 'ফলিত বিজ্ঞান ও প্রযুক্তি অনুষদ ভবন', 'A04', '4 levels in OSM; overall height unmeasured'],
  '18079380': ['Existing administration', 'প্রশাসন ভবন', 'L06', 'Unknown'],
  '18079381': ['Older Faculty Building', 'অনুষদ ভবন', 'A01', '3–4 tentative; 10–16 m art inference'],
  '18079382': ['Rabindra–Nazrul Arts Building', 'রবীন্দ্র–নজরুল কলা ভবন', 'A02', 'Unknown'],
  '18079384': ['Ibn Sina Science Building', 'ইবনে সিনা বিজ্ঞান ভবন', 'A05', 'Unknown current state; post-2021 extension'],
  '18079386': ['Business Administration / BBA Building', 'ব্যবসায় প্রশাসন অনুষদ ভবন', 'A06', 'Unknown current state; post-2021 extension'],
  '532464097': ['Central Library', 'কেন্দ্রীয় গ্রন্থাগার', 'L05', 'Official 3 versus apparent 4 bands unresolved; 10–16 m art inference'],
  '532464636': ['Central Cafeteria', 'কেন্দ্রীয় ক্যাফেটেরিয়া', 'U', 'Unknown'],
  '532464653': ['Garage (raw name: “Grarage”)', 'গ্যারেজ (descriptive)', 'U', 'Unknown'],
  '532464712': ['Saddam Hossain Hall', 'সাদ্দাম হোসেন হল', 'H01', 'Unknown'],
  '532464760': ['Lalon Shah Hall', 'লালন শাহ হল', 'H02', 'Unknown'],
  '532464837': ['Shah Azizur Rahman Hall', 'শাহ আজিজুর রহমান হল', 'H04', 'About 4 photo storeys, tentative; 13–17 m art inference'],
  '532464846': ['July-36 Hall', 'জুলাই-৩৬ হল', 'H05', 'About 5 photo levels, tentative; 16–21 m art inference'],
  '532465115': ['IU Post Office', 'ইবি ডাকঘর (descriptive)', 'U', 'Unknown'],
  '929202651': ['New Administrative Building (raw typo “Builiding”)', 'নতুন প্রশাসন ভবন', 'L07', 'Ten storeys reported for new administration; confirm notice/footprint match; 32–42 m inference'],
  '929433965': ['New Teacher Dormitory (translation)', 'নতুন শিক্ষক ডরমিটরি', 'U', 'Unknown'],
  '929434313': ['Guest House, IU', 'অতিথিশালা (descriptive)', 'U', 'Unknown'],
  '930117137': ['Teacher Dormitory 2', 'শিক্ষক ডরমিটরি ২ (descriptive)', 'U', 'Unknown'],
  '967967197': ['Shahid Ziaur Rahman Hall', 'শহীদ জিয়াউর রহমান হল', 'H03', 'About 4 photo storeys, tentative; 13–17 m art inference'],
  '967967198': ['Shahid Anas Hall', 'শহীদ আনাছ হল', 'H08', 'Old block about 5 photo levels, tentative; 16–21 m inference'],
  '970015480': ['Khaleda Zia Hall', 'খালেদা জিয়া হল', 'H07', 'Unknown; differing wings'],
  '970015482': ["Ummul Mu'mineen Aisha Siddiqa Hall", 'উম্মুল মু’মিনীন আয়েশা সিদ্দিকা হল', 'H06', 'Unknown residential block; photo shows gate'],
  '970122772': ['Central Gymnasium, IU', 'কেন্দ্রীয় ব্যায়ামাগার (descriptive)', 'U', 'Unknown'],
  '1317423240': ['Mir Mosharraf Hossain Academic Building', 'মীর মোশাররফ হোসেন একাডেমিক ভবন', 'A03', 'Unknown; overhead photo cannot establish floors'],
  '1317423241': ['Islamic Institute of Education and Research / IIER', 'ইসলামিক শিক্ষা ও গবেষণা ইনস্টিটিউট (descriptive)', 'U', 'Unknown'],
  '1317423253': ['New Building (identity unresolved)', 'নতুন ভবন (descriptive)', 'U; candidate register H09/A07', 'Unknown; construction tag does not establish ten floors'],
  '1317423254': ['New Building (identity unresolved)', 'নতুন ভবন (descriptive)', 'U; candidate register H09/A07', 'Unknown; construction tag does not establish ten floors'],
  '1317423257': ['Vice-chancellor residence', 'উপাচার্যের বাসভবন', 'L10', 'About 2 photo levels, tentative; 6–9 m art inference'],
  '1317423259': ['Central Mosque', 'কেন্দ্রীয় মসজিদ', 'L02', 'Four storeys reported; dome 90 ft (~27.4 m) reported with unspecified datum'],
  '1317423300': ['Jia Hall Mosque (raw OSM spelling)', 'জিয়া হল মসজিদ (descriptive)', 'U', 'Unknown; hall-name heuristic is inappropriate evidence'],
  '1468680463': ['Islamic University Medical Centre', 'চিকিৎসা কেন্দ্র', 'L09', 'Three photo levels, tentative; 10–13 m art inference'],
};
const appearance = {
 L08: 'Brick-pink/red, pale arch trim; layered flat roofs; deep front arch; hall windows/bands; see L08',
 A04: 'Cream/yellow complex, arches, courtyard/flat roofs; per-block attribution unresolved; see A04',
 L06: 'Unknown material/color, roof, windows and distinctive exterior; see L06',
 A01: 'Cream/light, tall arched arcade; flat weathered roof, courtyard; see A01',
 A02: 'Cream/white wings, flat roof; rectangular open corridor bays/railing; see A02',
 A05: 'Historical cream/yellow science complex, arched bays/flat roofs; current extension unresolved; see A05',
 A06: 'Historical light/cream courtyard ring, flat roof/cores; windows unresolved; see A06',
 L05: 'Mustard/yellow with white piers/bands; flat overhang roof; gridded windows/arched recesses; see L05',
 H01: 'Pale gray/cream H-plan, recessed corridors; flat weathered roof; windows unresolved; see H01',
 H02: 'Pale cream/gray angular courtyard wings, flat roofs; windows unresolved; see H02',
 H04: 'Orange/salmon with pale bands; flat roofs; rectangular windows/corridors; see H04',
 H05: 'Cream/yellow with salmon accents; flat roof/triangular entry; dark rectangular windows; see H05',
 L07: 'Current facade/material, roof, windows and completed profile unknown; see L07',
 H03: 'Cream/white parallel wings, flat roof; dark rectangular windows/bridging corridors; see H03',
 H08: 'Orange/ochre, white bands, flat roof; tall window grids/framed entry; old block only; see H08',
 H07: 'Pale pink/cream courtyard wings/cores; flat roof, regular dark rectangular windows; see H07',
 H06: 'Residential facade, roof/windows unknown; source shows cream/red entrance gate only; see H06',
 A03: 'Pale cross/quadrant courtyard and central hub; flat roofs; windows unresolved; see A03',
 L10: 'Pale/white split wings, flat roofs, arched recess/formal lawn; window detail unresolved; see L10',
 L02: 'Off-white domes/drum/arches, unfinished sections and terrace; reported stone/ceramic; see L02',
 L09: 'Cream/white, flat roof, dark arched corridors/rounded balconies; see L09',
};
const esc = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const rows = inventory.gameDerived.buildings.map((b, index) => {
  const info = identities[b.id] ?? ['Unnamed' + (b.tags.building === 'school' ? ' school-tagged footprint' : ''), 'নাম অজানা', 'U', 'Unknown'];
  const [english, bangla, key, height] = info;
  const label = `${b.osmType === 'relation' ? 'r' : 'w'}${b.id}`;
  const detail = appearance[key] ?? 'Unknown facade material/color, roof, windows and distinctive exterior (U)';
  return `| ${index + 1} | [${label}](https://www.openstreetmap.org/${b.osmType}/${b.id}) | ${esc(english)} / ${esc(bangla)} | ${b.center.lat.toFixed(7)}, ${b.center.lon.toFixed(7)} | ${esc(height)} | **${b.height.toFixed(1)} m**; \`${b.heightSource}\` | ${esc(detail)} |`;
});
if (rows.length !== 57 || new Set(inventory.gameDerived.buildings.map(b => `${b.osmType}/${b.id}`)).size !== 57) throw Error('Expected 57 unique represented buildings');
const appendix = '\n| # | OSM object | English / Bangla name | Representative position (lat, lon) | Real storeys / height evidence | Current game height / provenance | Facade, roof, windows and distinctive features / detail key |\n|---|---|---|---|---|---|---|\n' + rows.join('\n') + '\n';
let report = await readFile(reportUrl, 'utf8');
const begin = '<!-- BUILDING_APPENDIX -->', end = '<!-- /BUILDING_APPENDIX -->';
const a = report.indexOf(begin), z = report.indexOf(end);
if (a < 0) throw Error('Appendix marker missing');
report = z >= 0 ? report.slice(0, a) + begin + appendix + end + report.slice(z + end.length) : report.replace(begin, begin + appendix + end);
await writeFile(reportUrl, report);
console.log(`Research appendix written: ${rows.length} unique building features.`);
