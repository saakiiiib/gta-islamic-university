import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { enrichPlaceNames, searchPlaces } from '../src/map/placeNames.js';
import { mountPlaceSearch } from '../src/ui/placeSearch.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });

test('actual existing places gain bilingual/current/alias search fields without changing source anchors or label count', () => {
  const before = JSON.stringify(map.places), result = enrichPlaceNames(map.places);
  assert.equal(JSON.stringify(map.places), before); assert.equal(result.length, map.places.length);
  assert.equal(new Set(result.map(p => p.id)).size, result.length);
  for (const [index, place] of result.entries()) {
    const original = map.places[index];
    for (const field of ['name', 'nameTag', 'sourceIds', 'buildingId', 'x', 'y', 'z']) assert.deepEqual(place[field], original[field]);
    assert.notEqual(place, original); assert.notEqual(place.sourceIds, original.sourceIds);
    assert.equal(typeof place.displayName, 'string'); assert.equal(typeof place.searchText, 'string');
    assert.ok(place.aliases.every(alias => typeof alias === 'string'));
  }
  const anas = result.find(p => p.buildingId === '967967198');
  assert.equal(anas.names.en, 'Shahid Anas Hall'); assert.match(anas.names.bn, /আনাছ/);
  assert.ok(anas.aliases.includes('Sheikh Russel Hall')); assert.ok(anas.displayName.includes(anas.names.bn));
  assert.deepEqual(enrichPlaceNames(result), result, 'enrichment can be safely applied again');
  assert.deepEqual(enrichPlaceNames([]), [], 'registry does not synthesize unplaced identities');
});

test('building source IDs resolve only unambiguous registry identities and reject mismatches or unrelated node IDs', () => {
  const sample = { id: 'fixture', sourceIds: ['buildings:967967198'], name: 'Old source name', nameTag: 'name', x: 1, y: 2, z: 3 };
  assert.equal(enrichPlaceNames([sample])[0].names.en, 'Shahid Anas Hall');
  for (const place of [
    { ...sample, buildingId: '532464837' },
    { ...sample, sourceIds: ['node:967967198'] },
    { ...sample, sourceIds: ['buildings:relation/967967198'] },
    { ...sample, sourceIds: ['buildings:967967198', 'buildings:532464837'] },
    { ...sample, sourceIds: ['buildings:99999999999'] },
  ]) assert.equal(enrichPlaceNames([place])[0].displayName, 'Old source name');
  const typed = enrichPlaceNames([{ ...sample, sourceIds: ['way/967967198'] }])[0];
  assert.equal(typed.names.en, 'Shahid Anas Hall');
});

test('search matches English/Bangla/current/raw/historical names and never invents 2026 unplaced names', () => {
  const places = enrichPlaceNames(map.places), before = JSON.stringify(places);
  for (const query of ['sHaHiD aNaS', 'Sheikh Russel', 'আনাছ', 'আনাস']) {
    assert.ok(searchPlaces(places, query).some(p => p.buildingId === '967967198'));
  }
  assert.ok(searchPlaces(places, 'Deshratna Sheikh Hasina').some(p => p.buildingId === '532464846'));
  assert.ok(searchPlaces(places, 'জুলাই-৩৬').some(p => p.buildingId === '532464846'));
  assert.deepEqual(searchPlaces(places, 'Kobi Golam Mostafa'), []);
  assert.deepEqual(searchPlaces(places, 'Shahid Abrar Fahad'), []);
  assert.equal(JSON.stringify(places), before);
});

test('unknown source names/aliases remain available, NFC equivalents match and ranking is stable and bounded', () => {
  const source = [
    { id: 'alias', kind: 'building', name: 'Another building', aliases: ['Café'], sourceIds: [] },
    { id: 'exact', kind: 'building', name: 'Café', nameTag: 'name:en', sourceIds: [] },
    { id: 'prefix', kind: 'building', name: 'Café annex', nameTag: 'name', sourceIds: [] },
    { id: 'bn', kind: 'entrance', name: 'অজানা ফটক', nameTag: 'name:bn', sourceIds: [] },
  ];
  const before = structuredClone(source), places = enrichPlaceNames(source);
  assert.deepEqual(source, before); assert.ok(places[0].aliases.includes('Café'));
  assert.equal(places[3].names.bn, source[3].name); assert.equal(places[3].names.en, null);
  assert.deepEqual(searchPlaces(places, 'CAFE\u0301').map(p => p.id), ['exact', 'prefix', 'alias']);
  assert.deepEqual(searchPlaces(places, 'café').map(p => p.id), searchPlaces(places, 'CAFE\u0301').map(p => p.id));
  assert.equal(searchPlaces(places, '', 2).length, 2); assert.equal(searchPlaces(places, ' ', 0).length, 0);
  assert.deepEqual(searchPlaces([...places, places[1]], 'café').map(p => p.id), ['exact', 'prefix', 'alias']);
  assert.deepEqual(searchPlaces(places, 'অজানা').map(p => p.id), ['bn']);
  assert.equal(searchPlaces(Array.from({ length: 80 }, (_, i) => ({ ...places[1], id: String(i) })), '', 100).length, 50);
  for (const limit of [-1, 1.5, Infinity, NaN]) assert.throws(() => searchPlaces(places, '', limit), /limit/);
  assert.throws(() => enrichPlaceNames(null), /array/); assert.throws(() => searchPlaces(null), /array/);
  assert.throws(() => mountPlaceSearch({ places, onSelect() {}, parent: null }), /parent DOM/);
});
import { sourceName, buildPlaceMetadata } from '../src/map/places.js';

test('metadata imports Bangla-only nodes and retains two mapped languages without a registry', () => {
  assert.deepEqual(sourceName({'name:bn':'বাংলা নাম'}), {name:'বাংলা নাম',nameTag:'name:bn'});
  const metadata=buildPlaceMetadata({bounds:{minX:-10,maxX:10,minZ:-10,maxZ:10},buildings:[],greens:[],water:[],roads:[],bridges:[]},
    new Map([['42',{id:'42',tags:{amenity:'cafe','name:en':'Campus Cafe','name:bn':'ক্যাম্পাস ক্যাফে'}}],['43',{id:'43',tags:{tourism:'artwork','name:bn':'বাংলা নাম'}}]]),
    new Map([['42',[0,0]],['43',[4,4]]]));
  assert.equal(metadata.places.length,2);
  assert.equal(metadata.places[0].name,'Campus Cafe');
  assert.equal(metadata.places[0].names.bn,'ক্যাম্পাস ক্যাফে');
  assert.equal(searchPlaces(metadata.places,'ক্যাফে')[0].id,'node:42');
  assert.equal(metadata.places[1].nameTag,'name:bn');
});
