import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseOsm, buildMapData } from '../../src/map/osm.js';

// Research-only inventory. Does not rewrite game data or generated assets.
const root = new URL('../../', import.meta.url);
const sourceBytes = await readFile(new URL('public/data/map.osm', root));
const parsed = parseOsm(sourceBytes.toString('utf8'));
const derived = buildMapData(parsed, { trimToCampus: true });
const bbox = [23.71545, 89.14043, 23.72694, 89.16244];
const inside = p => p && p.lat >= bbox[0] && p.lat <= bbox[2] && p.lon >= bbox[1] && p.lon <= bbox[3];
const midpoint = points => {
  const valid = points.filter(Boolean);
  return valid.length ? { lat: valid.reduce((n,p)=>n+p.lat,0)/valid.length,
    lon: valid.reduce((n,p)=>n+p.lon,0)/valid.length } : null;
};
function elementsFromParsed(p) {
  const result = [...p.nodes.values()].map(n=>({...n,type:'node',center:{lat:n.lat,lon:n.lon}}));
  for (const w of p.ways.values()) result.push({...w,type:'way',center:midpoint(w.refs.map(id=>p.nodes.get(id)))});
  for (const r of p.relations.values()) result.push({...r,type:'relation',center:midpoint(r.members.filter(m=>m.type==='way').flatMap(m=>p.ways.get(m.ref)?.refs.map(id=>p.nodes.get(id))??[]))});
  return result;
}
const local=elementsFromParsed(parsed);
const tagKeys = ['name','name:en','name:bn','building:levels','height','min_height','building:colour','building:material','roof:shape','roof:height','roof:colour','roof:material','width','surface','entrance','barrier','natural','water','landuse','leisure','highway'];
function inventory(elements) {
  const selected=elements.filter(e=>inside(e.center??e)), buildings=selected.filter(e=>e.tags?.building&&e.tags.building!=='no');
  const has=(key,list=selected)=>list.filter(e=>e.tags?.[key]!=null).length;
  return { scope:'Objects whose representative center lies in the stated bbox; not a campus-only survey. Coordinate averages for ways/relations; these are representative anchors, not surveyed entrances or polygon centroids.',
    elements:selected.length, types:Object.fromEntries(['node','way','relation'].map(t=>[t,selected.filter(e=>e.type===t).length])),
    buildings:buildings.length, buildingTagCoverage:Object.fromEntries(tagKeys.map(k=>[k,has(k,buildings)])),
    allTagCoverage:Object.fromEntries(tagKeys.map(k=>[k,has(k)])),
    tagValues:Object.fromEntries(['building','highway','landuse','leisure','natural','water','barrier'].map(k=>[k,Object.fromEntries([...new Set(selected.map(e=>e.tags?.[k]).filter(Boolean))].sort().map(v=>[v,selected.filter(e=>e.tags?.[k]===v).length]))])),
    named:selected.filter(e=>e.tags?.name||e.tags?.['name:en']||e.tags?.['name:bn']||e.tags?.ref).map(e=>({type:e.type,id:String(e.id),center:e.center??{lat:e.lat,lon:e.lon},tags:e.tags})) };
}
const localInventory=inventory(local);
const report={createdAt:new Date().toISOString(),bbox,sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),
  bundled:{rawCounts:{nodes:parsed.nodes.size,ways:parsed.ways.size,relations:parsed.relations.size},...localInventory},
  gameDerived:{origin:derived.origin,campus:derived.campus.id,counts:Object.fromEntries(['buildings','roads','greens','water','bridges','trees','treeRows','entrances','places'].map(k=>[k,derived[k].length])),
    diagnostics:derived.diagnostics,
    buildingTagCoverage:Object.fromEntries(tagKeys.map(k=>[k,derived.buildings.filter(b=>b.tags?.[k]!=null).length])),
    buildings:derived.buildings.map(b=>({id:b.id,name:b.name||null,tags:b.tags,height:b.height,heightSource:b.heightSource,sourceWayIds:b.sourceWayIds,
      osmType:parsed.relations.has(b.id)?'relation':'way',center:local.find(e=>e.id===b.id&&(e.type==='relation'||e.type==='way'))?.center})),
    namedBuildings:derived.buildings.filter(b=>b.name).map(b=>({id:b.id,name:b.name,tags:b.tags,height:b.height,heightSource:b.heightSource})),
    heightSources:Object.fromEntries([...new Set(derived.buildings.map(b=>b.heightSource))].map(s=>[s,derived.buildings.filter(b=>b.heightSource===s).length]))}};
try {
  let liveBytes,live;
  try {
    liveBytes=await readFile(new URL('overpass-private-coffee-2026-11-07.json',import.meta.url));
    live=JSON.parse(liveBytes.toString('utf8'));
    if(!Array.isArray(live.elements)) throw Error('Missing Overpass elements');
    live.elements=live.elements.map(e=>({...e,id:String(e.id),
      center:e.type==='node'?{lat:e.lat,lon:e.lon}:midpoint(e.geometry??e.members?.flatMap(m=>m.geometry??[])??[])??e.center,
      ...(e.nodes?{refs:e.nodes.map(String)}:{}),
      ...(e.members?{members:e.members.map(m=>({type:m.type,ref:String(m.ref),role:m.role??''}))}:{})}));
    report.liveEndpoint='https://overpass.private.coffee/api/interpreter';
  } catch {
    liveBytes=await readFile(new URL('osm-api-2026-11-07.osm',import.meta.url));
    const liveParsed=parseOsm(liveBytes.toString('utf8'));
    live={elements:elementsFromParsed(liveParsed)};
    report.liveEndpoint='https://api.openstreetmap.org/api/0.6/map?bbox=89.14043,23.71545,89.16244,23.72694';
    report.liveFallback='Official OSM map API used after Overpass endpoints failed; XML-derived representative centers use coordinate averages.';
    report.liveRawCounts={nodes:liveParsed.nodes.size,ways:liveParsed.ways.size,relations:liveParsed.relations.size};
  }
  if(!Array.isArray(live.elements)) throw Error('Missing Overpass elements');
  report.live={osmBase:live.osm3s?.timestamp_osm_base,sha256:createHash('sha256').update(liveBytes).digest('hex'),rawElementCounts:Object.fromEntries(['node','way','relation'].map(t=>[t,live.elements.filter(e=>e.type===t).length])),...inventory(live.elements)};
  const oldMap=new Map(local.map(e=>[`${e.type}/${e.id}`,e]));
  const comparisons=live.elements.filter(e=>inside(e.center??e)).map(e=>{
    const old=oldMap.get(`${e.type}/${e.id}`);
    if(!old) return {id:`${e.type}/${e.id}`,change:'not-in-bundled-extract',tags:e.tags??{}};
    const tags=e.tags??{}, oldTags=old.tags??{};
    const changes=[...new Set([...Object.keys(tags),...Object.keys(oldTags)])].filter(k=>tags[k]!==oldTags[k]).map(k=>({key:k,bundled:oldTags[k]??null,live:tags[k]??null}));
    if (e.type==='node'&&(e.lat!==old.lat||e.lon!==old.lon)) changes.push({key:'coordinates',bundled:[old.lat,old.lon],live:[e.lat,e.lon]});
    if (e.refs&&JSON.stringify(e.refs)!==JSON.stringify(old.refs)) changes.push({key:'nodeRefs',bundled:old.refs,live:e.refs});
    if (e.members&&JSON.stringify(e.members)!==JSON.stringify(old.members)) changes.push({key:'members',bundled:old.members,live:e.members});
    return changes.length?{id:`${e.type}/${e.id}`,change:'tags-differ',changes}:null;
  }).filter(Boolean);
  const liveIds=new Set(live.elements.map(e=>`${e.type}/${e.id}`));
  report.comparison={warning:'Absence from the live bbox query is not proof of deletion. Node coordinates and way references are compared when available (official XML fallback); no geometric shape matching for changed IDs.',changes:comparisons,
    bundledCentersAbsent:local.filter(e=>inside(e.center)&&!liveIds.has(`${e.type}/${e.id}`)).map(e=>`${e.type}/${e.id}`)};
  try {
    const officialBytes=await readFile(new URL('osm-api-2026-11-07.osm',import.meta.url));
    const official=parseOsm(officialBytes.toString('utf8')), officialElements=elementsFromParsed(official);
    const differences=[];
    for(const e of officialElements){
      const old=oldMap.get(`${e.type}/${e.id}`);
      const keys=e.type==='node'?['lat','lon','tags']:e.type==='way'?['refs','tags']:['members','tags'];
      if(!old||keys.some(k=>JSON.stringify(e[k])!==JSON.stringify(old[k]))) differences.push(`${e.type}/${e.id}`);
    }
    report.officialApiCrosscheck={endpoint:'https://api.openstreetmap.org/api/0.6/map?bbox=89.14043,23.71545,89.16244,23.72694',sha256:createHash('sha256').update(officialBytes).digest('hex'),rawCounts:{nodes:official.nodes.size,ways:official.ways.size,relations:official.relations.size},
      comparedFields:'Coordinates, tags, way node refs, relation members, as returned by parseOsm (metadata/version ordering excluded).',differentOrAddedIds:differences,
      absentFromResponse:local.filter(e=>!officialElements.some(o=>o.type===e.type&&o.id===e.id)).map(e=>`${e.type}/${e.id}`)};
  }catch(error){report.officialApiCrosscheckError=error.message;}
} catch(error) {report.liveError=error.message;}
const target=new URL('osm-inventory.json',import.meta.url);
await writeFile(target,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({target:fileURLToPath(target),bundled:report.bundled.rawCounts,bboxBuildings:localInventory.buildings,game:report.gameDerived.counts,heightSources:report.gameDerived.heightSources,
  live:report.live?{base:report.live.osmBase,buildings:report.live.buildings,types:report.live.types,tagCoverage:report.live.buildingTagCoverage}:report.liveError,
  changes:report.comparison?.changes.length},null,2));
