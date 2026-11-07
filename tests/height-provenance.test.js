import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData, estimateHeight, parseMetres } from '../src/map/index.js';
import { validateCampusLandmarks, CAMPUS_LANDMARKS } from '../src/data/campus-landmarks.js';
import { heightPolicyChanges } from './helpers/phase1-height-policy.js';
const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
test('height units are complete positive dimensions, never prefixes or ambiguous ranges', () => {
  assert.equal(parseMetres('30 ft'), 9.144); assert.equal(parseMetres(' .5 metres '), .5);
  for (const value of ['12 garbage','12;15','10-12 m','Infinity','-4 m','0 m','4.2.1']) assert.equal(parseMetres(value), null);
});
test('OSM height/levels take precedence over sourced art, and worship outranks Hall', () => {
  const art={renderHeight:true,fields:{heightMeters:{value:18,status:'reported',confidence:'medium',sourceUrl:'https://iu.ac.bd/',observedAt:'2026-11-07'}}};
  assert.equal(estimateHeight({height:'30 ft','building:levels':'4'},art).height,9.144);
  assert.equal(estimateHeight({'building:levels':'4'},art).height,12.8);
  assert.deepEqual(estimateHeight({name:'Jia Hall Mosque'}),{height:9.6,heightSource:'estimate:worship'});
  assert.equal(estimateHeight({building:'university',name:'Faculty Hall'}).heightSource,'estimate:academic');
  assert.equal(estimateHeight({building:'construction',name:'New Hall'}).heightSource,'estimate:construction');
  assert.equal(estimateHeight({},art).heightSource,'art:reported');
  art.fields.heightMeters.status='planned'; assert.equal(estimateHeight({},art).height,9.6);
  assert.equal(estimateHeight({'building:levels':'4;6'}).heightSource,'estimate:unclassified');
});
test('all imported buildings expose honest height provenance without claiming measurement', () => {
  for (const b of map.buildings) {
    assert.ok(b.heightEvidence); assert.equal(b.heightEvidence.measured,false);
    if(b.heightSource.startsWith('estimate:')) { assert.equal(b.heightEvidence.status,'inferred'); assert.equal(b.heightEvidence.sourceUrl,null); }
    if(b.heightSource==='building:levels') { assert.equal(b.heightEvidence.source,'osm'); assert.equal(b.heightEvidence.metresPerStorey,3.2); }
  }
  for(const c of heightPolicyChanges) {
    const b=map.buildings.find(b=>b.id===c.id); assert.equal(b.height,c.after.height); assert.equal(b.heightSource,c.after.heightSource);
  }
  assert.deepEqual(heightPolicyChanges.filter(c=>c.before.height!==c.after.height).map(c=>c.id),['1317423300']);
});
test('planned dimensions cannot be activated in the registry', () => {
  const r=structuredClone(CAMPUS_LANDMARKS[0]); r.renderHeight=true;
  r.fields.heightMeters={value:45.7,status:'planned',confidence:'medium',sourceUrl:'https://iu.ac.bd/',observedAt:'2026-11-07'};
  assert.throws(()=>validateCampusLandmarks([r]),/Unverified height/);
});
