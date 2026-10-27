import './style.css';
import './ui/reactions.css';
import './ui/touch.css';
import * as THREE from 'three';
import { loadMap } from './map/index.js';
import { buildWorld } from './world/index.js';
import { InputController } from './player/index.js';
import { HUD } from './ui/hud.js';
import { InspectionCamera, InspectionSession } from './player/inspection.js';
import { PlaceLabels } from './ui/labels.js';
import { CampusSimulation } from './game/simulation.js';
import { TravelCamera } from './vehicle/camera.js';
import { ReactionAudio } from './audio/reactions.js';
import { TouchControls } from './player/touch.js';
import { deviceProfile, renderPixelRatio } from './platform/device.js';
import { applyWorldAssets } from './world/assets.js';
import { MAIN_GATE_CONFIG } from './world/mainGate.js';
import { CampusVisibility } from './activity/visibility.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const device = deviceProfile(window);
document.body.classList.toggle('touch-device', device.touch);
$('touch-instructions').hidden = !device.touch;
let state = 'loading', renderer, scene, camera, world, mapData, player, input, chase, hud, sun;
let inspection, inspectionSession, labels, gameplayFog;
let simulation;
let reactions;
let touch, shadowElapsed = Infinity;
let visibility;
let accumulator = 0, lastTime = performance.now(), fps = 60;
const STEP = 1 / 60;
const sunOffset = new THREE.Vector3(-55, 110, -40);

function progress(percent, message) {
  $('loading-fill').style.width = `${percent}%`;
  $('loading-percent').textContent = `${percent}%`;
  $('loading-message').textContent = message;
}
function resize() {
  if (!renderer) return;
  const width = window.innerWidth, height = window.innerHeight;
  renderer.setPixelRatio(renderPixelRatio(device, width, height, window.devicePixelRatio));
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
  inspection?.resize(width / Math.max(1, height));
  input?.clear(); // Rotation/browser chrome changes cannot leave a captured stick held.
}
function syncTouch() {
  document.body.dataset.gameState = state;
  if (!touch) return;
  touch.setMode(inspectionSession.active ? 'inspection' : simulation.session.driving ? 'van' : 'foot');
  touch.setEnabled(['playing', 'inspection'].includes(state));
  $('orientation-hint').hidden = !touch.enabled;
}
function pause(reason = 'escape') {
  if (!['playing', 'inspection'].includes(state)) return;
  state = 'paused'; accumulator = 0;
  input.setEnabled(false); inspectionSession.suspend(); simulation.setSuspended(true);
  reactions?.setSuspended(true);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  $('pause-reason').textContent = reason === 'focus' ? 'The game paused while you stepped away.' : 'Your campus is waiting.';
  $('pause-screen').hidden = false;
  syncTouch();
  $('announcer').textContent = 'Game paused.';
  $('resume-button').focus({ preventScroll: true });
}
async function play() {
  if (!['ready', 'paused'].includes(state) || document.hidden) return;
  const firstStart = state === 'ready';
  state = inspectionSession.active ? 'inspection' : 'playing'; accumulator = 0; lastTime = performance.now();
  inspectionSession.resume();
  simulation.setSuspended(inspectionSession.active);
  reactions?.setSuspended(inspectionSession.active);
  if (!inspectionSession.active) reactions?.unlock();
  if (firstStart) { simulation.reset(); simulation.player.teleport(MAIN_GATE_CONFIG.exteriorSpawn, MAIN_GATE_CONFIG.exteriorSpawn.yaw); chase.setDriving(false); chase.reset(MAIN_GATE_CONFIG.exteriorSpawn); }
  $('start-screen').hidden = true; $('pause-screen').hidden = true; $('play-hud').hidden = false;
  $('pause-button').disabled = false;
  $('view-toolbar').hidden = false;
  syncTouch();
  canvas.focus({ preventScroll: true });
  $('announcer').textContent = device.touch ? 'Use the left stick to move, swipe the right side to look, and approach a van to tap Enter.' : 'Explore campus. WASD moves, Shift sprints, Space jumps. Walk through the Main Gate and drive the IU Red Bus or vans.';
  if (inspectionSession.active) { syncView(); return; }
  const locked = await input.requestPointerLock();
  if (device.touch && state === 'playing') hud.toast(firstStart ? 'Left stick: move · Swipe right: look · Approach the van and tap Enter.' : 'Touch controls ready.', 5000);
  else if (!locked && state === 'playing') hud.toast(firstStart ? 'WASD to move. Right-drag to look. The electric van is parked ahead; approach and press E.' : 'Hold right mouse and drag to look around.', 6500);
  else if (firstStart) hud.toast('Walk through the Main Gate into campus. The iconic IU Red Bus is parked ahead!', 5500);
}
function resetPlayer() {
  if (inspectionSession.active) { inspectionSession.exit(); syncView(); }
  simulation.reset(); simulation.setSuspended(false); chase.setDriving(false); chase.reset(MAIN_GATE_CONFIG.exteriorSpawn); accumulator = 0;
  reactions?.reset();
  input.clear(); syncTouch();
  hud.toast('Back at Main Gate. Eight vans repaired; campus traffic restored.');
}

function syncView() {
  const active = inspectionSession.active;
  scene.fog = active ? null : gameplayFog;
  simulation.setSuspended(active);
  reactions?.setSuspended(active);
  if (!active && state === 'playing') reactions?.unlock();
  document.body.classList.toggle('inspecting', active);
  $('inspection-button').setAttribute('aria-pressed', String(active));
  $('inspection-button').querySelector('span').textContent = active ? simulation.session.driving ? 'Back to van' : 'Back to student' : 'Inspect campus';
  if (device.touch) $('inspection-button').querySelector('kbd').textContent = active ? 'Back' : 'View';
  $('inspection-banner').hidden = !active;
  $('announcer').textContent = active ? device.touch ? 'Inspection camera. Simulation paused. Left stick pans, swipe right to orbit, use zoom buttons. Tap Back to return.' : 'Inspection camera. Student, van and pedestrians paused. Mouse drag or arrows orbit, right drag or WASD pan, wheel zoom. I or Escape returns.' : simulation.session.driving ? 'Back to the electric van.' : 'Back to the student.';
  labels.elapsed = 1;
  syncTouch();
}
function toggleInspection() {
  if (!['playing', 'inspection'].includes(state)) return;
  accumulator = 0; lastTime = performance.now();
  if (inspectionSession.active) {
    inspectionSession.exit(); state = 'playing'; syncView();
    canvas.focus({ preventScroll: true }); input.requestPointerLock();
  } else {
    state = 'inspection'; inspectionSession.enter(); syncView();
    canvas.focus({ preventScroll: true });
  }
}
function toggleLabels() {
  if (!labels) return;
  labels.setEnabled(!labels.enabled);
  $('labels-button').setAttribute('aria-pressed', String(labels.enabled));
  hud.toast(`Place labels ${labels.enabled ? 'on' : 'off'}.`, 1800);
}
function toggleAlignment() {
  if (!world) return;
  world.footprintDebug.visible = !world.footprintDebug.visible;
  $('alignment-button').setAttribute('aria-pressed', String(world.footprintDebug.visible));
  hud.toast(world.footprintDebug.visible ? 'Map alignment: cyan roads · amber building outlines.' : 'Map alignment hidden.', 2400);
}

function lighting() {
  scene.add(new THREE.HemisphereLight(0xe4edf2, 0x829272, 1.6));
  sun = new THREE.DirectionalLight(0xfff1dc, 2.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(device.shadowSize, device.shadowSize);
  const extent = device.shadowExtent;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 210 });
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .035;
  sun.shadow.intensity = .72;
  scene.add(sun, sun.target);
  sun.position.copy(player.position).add(sunOffset); sun.target.position.copy(player.position);
}
function tick(t) {
  const elapsed = Math.max(0, Math.min((t - lastTime) / 1000, .1)); lastTime = t;
  fps += ((1 / Math.max(.001, elapsed)) - fps) * .06;
  if (state === 'playing') {
    // Consume camera motion once per render; one-shot jump/reset on each physics tick.
    chase.setDriving(simulation.session.driving);
    chase.updateTravel(elapsed, simulation.entity, input.consumeLook(elapsed));
    visibility.prepare(camera);
    simulation.crowd.setView?.({ position: simulation.entity.position, camera, visible: visibility.visible });
    accumulator = Math.min(accumulator + elapsed, STEP * 5);
    while (accumulator >= STEP) {
      const controls = input.snapshot();
      if (controls.reset) { resetPlayer(); break; }
      const event = simulation.update(STEP, controls, chase.yaw);
      if (event.message) {
        if (device.touch && event.changed) {
          $('toast').hidden = true;
          $('announcer').textContent = simulation.session.driving ? 'Riding behind the driver. Hold Go to accelerate, Brake / Reverse to slow down or reverse, and Exit to jump off at any speed.' : 'You jumped off the van. Use the stick to move after landing.';
        } else hud.toast(event.message);
      }
      if (event.changed) { input.clear(); chase.setDriving(simulation.session.driving); syncTouch(); }
      accumulator -= STEP;
    }
    simulation.animate(elapsed);
    reactions.consume(simulation.drainEvents(), simulation.entity.position, chase.yaw);
    reactions.update(elapsed, simulation.entity.position, chase.yaw, simulation.crowd.agents);
    for (const agent of simulation.crowd.agents) {
      agent.voicePlaying = String(agent.id) === reactions.active?.npcId;
      if (agent.voicePlaying) agent.lastVoiceAt = simulation.crowd.time;
    }
    chase.updateTravel(0, simulation.entity);
    world.update(elapsed, simulation.entity.position);
    world.scenery?.update(simulation.entity.position);
    sun.target.position.set(Math.round(simulation.entity.position.x * 8) / 8, 0, Math.round(simulation.entity.position.z * 8) / 8);
    sun.position.copy(sun.target.position).add(sunOffset);
    hud.update(elapsed, simulation.entity, renderer, fps, { simulation, visibility: visibility.sample(elapsed, simulation, simulation.entity.position) });
  } else if (state === 'inspection') {
    // No physics, character animation or catch-up accumulation in inspection.
    if (touch?.enabled) {
      const control = touch.snapshot(), look = touch.consumeLook();
      const speed = inspection.distance * .35 * elapsed;
      if (control.moveX || control.moveZ) inspection.pan(control.moveX * speed, -control.moveZ * speed);
      if (look.dx || look.dy) inspection.orbit(look.dx, look.dy);
      if (control.zoom) inspection.zoom(control.zoom * elapsed * 500);
    }
    inspection.update(elapsed);
    visibility.prepare(inspection.camera);
    hud.update(elapsed, simulation.entity, renderer, fps, { inspection: true, simulation, visibility: visibility.sample(elapsed, simulation, simulation.entity.position) });
  } else if (state === 'ready') {
    world.update(elapsed, player.position);
    world.scenery?.update(player.position);
  }
  if (renderer && scene && camera) {
    if (device.touch) {
      shadowElapsed += elapsed;
      if (shadowElapsed >= device.shadowInterval) { renderer.shadowMap.needsUpdate = true; shadowElapsed = 0; }
    }
    const activeCamera = inspectionSession.active ? inspection.camera : camera;
    renderer.render(scene, activeCamera);
    labels.update(elapsed, activeCamera, simulation.entity.position, { inspection: inspectionSession.active, visible: ['playing', 'inspection'].includes(state), width: window.innerWidth, height: window.innerHeight });
  }
  requestAnimationFrame(tick);
}

async function initialize() {
  try {
    progress(5, 'Reading the supplied campus map…');
    mapData = await loadMap(`${import.meta.env.BASE_URL}data/map.osm`, message => progress(24, message));
    progress(42, 'Creating roads, courtyards, gardens and water…');
    // Yield so loading feedback reaches the screen before geometry construction.
    await new Promise(resolve => requestAnimationFrame(resolve));
    world = buildWorld(mapData, { onProgress: message => progress(62, message) });
    progress(70, 'Loading campus materials and furniture…');
    await applyWorldAssets(world, { baseURL: import.meta.env.BASE_URL, mobile: device.touch });
    progress(76, 'Preparing movement and collision geometry…');
    progress(82, 'Starting campus traffic and gathering thirty students…');
    simulation = new CampusSimulation(mapData, world.collisionGroup, { scenery: world.scenery }); player = simulation.player;
    visibility = new CampusVisibility([player.world, player.sceneryWorld]);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: device.antialias, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = device.touch ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = !device.touch; renderer.shadowMap.needsUpdate = true;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xb3d5e6);
    gameplayFog = new THREE.Fog(0xb3d5e6, 300, 1500); scene.fog = gameplayFog;
    scene.add(world.group, player.group, simulation.fleetGroup, simulation.busGroup, simulation.occupants.group, simulation.crowd.group);
    camera = new THREE.PerspectiveCamera(60, 1, .08, 2200);
    const cameraColliders = new THREE.Group();
    cameraColliders.add(world.collisionGroup);
    if (world.scenery?.collisionGroup) cameraColliders.add(world.scenery.collisionGroup);
    chase = new TravelCamera(camera, cameraColliders);
    chase.reset(mapData.spawn);
    input = new InputController(canvas, { onPause: reason => {
      if (reason === 'escape' && state === 'inspection') toggleInspection();
      else if (reason === 'escape' && state === 'paused') play();
      else pause(reason);
    } });
    if (device.touch) {
      touch = new TouchControls({ root: $('touch-controls'), canvas, onPause: pause, allowMouse: device.preview,
        onGesture: () => { if (!reactions?.unlocked) reactions?.unlock(); } });
      input.setTouchControls(touch);
    }
    inspection = new InspectionCamera(new THREE.PerspectiveCamera(52, 1, .5, 3500), mapData.bounds);
    inspection.attach(canvas, pause);
    inspectionSession = new InspectionSession(input, inspection, document);
    labels = new PlaceLabels($('place-labels'), world.labelAnchors, world.buildingMeshes);
    lighting(); resize();
    if (device.touch) {
      $('inspection-banner').querySelector('p').textContent = 'Left stick: pan · Swipe right: orbit · Zoom buttons · Tap Back to return';
      $('pause-screen').querySelector('.pause-hint').textContent = 'Left stick moves or steers. Swipe right to look. Sprint toggles. Hold Go or Brake / Reverse to drive. Exit works at any speed.';
    }
    hud = new HUD(mapData, { touch: device.touch });
    if (device.touch) {
      for (const [id, title] of [['labels-button', 'Names'], ['inspection-button', 'View'], ['alignment-button', 'Map'], ['sound-button', 'Sound']]) $(id).querySelector('kbd').textContent = title;
    }
    reactions = new ReactionAudio({ baseURL: `${import.meta.env.BASE_URL}audio/`, onStatus: status => {
      $('sound-button').setAttribute('aria-pressed', String(status.muted));
      $('sound-label').textContent = status.muted ? 'Sound off' : 'Sound on';
      $('sound-status').textContent = status.mode === 'recorded-clips' ? 'Recorded voices' : 'Voice unavailable';
    } });
    try {
      const preferences = JSON.parse(localStorage.getItem('iu-reaction-audio') ?? '{}');
      reactions.setVolume(Number.isFinite(preferences.volume) ? preferences.volume : .55); reactions.setMuted(preferences.muted === true);
    } catch { reactions.setVolume(.55); }
    $('sound-volume').value = Math.round(reactions.volume * 100);
    // The opening view looks inward from the actual Main Gate spawn.
    const facing = new THREE.Vector3(-Math.sin(mapData.spawn.yaw), 0, -Math.cos(mapData.spawn.yaw));
    const focus = player.position.clone().addScaledVector(facing, 20);
    camera.position.copy(player.position).addScaledVector(facing, -28).add(new THREE.Vector3(0, 15, 0));
    camera.lookAt(focus.x, 2.5, focus.z);
    progress(100, `${mapData.buildings.length} buildings · ${mapData.roads.length} routes · one real campus.`);
    $('start-label').textContent = 'STEP INTO CAMPUS'; $('start-button').disabled = false;
    state = 'ready'; document.body.dataset.gameState = state;
    $('announcer').textContent = 'Campus ready. Select Step into campus to play.';
    console.info('Campus data loaded', mapData.diagnostics.counts);
    if (mapData.diagnostics.repairs.length) console.info('Documented source geometry repairs', mapData.diagnostics.repairs);
    // DOM diagnostics support QA without exposing or changing game controls.
    setInterval(() => {
      document.body.dataset.gameState = state;
      const entity = simulation.entity;
      canvas.dataset.position = `${entity.position.x.toFixed(2)},${entity.position.y.toFixed(2)},${entity.position.z.toFixed(2)}`;
      canvas.dataset.grounded = String(entity.grounded);
      canvas.dataset.cameraMode = inspectionSession.active ? 'inspection' : simulation.session.driving ? 'vehicle' : 'student';
      canvas.dataset.vehicleSpeed = simulation.van.speed.toFixed(2); canvas.dataset.pedestrians = simulation.crowd.agents.length;
      canvas.dataset.vans = simulation.vans.length; canvas.dataset.durability = simulation.van.durability.toFixed(1);
      canvas.dataset.inputMode = device.touch ? 'touch' : 'desktop';
      canvas.dataset.pixelRatio = renderer.getPixelRatio().toFixed(2);
      canvas.dataset.cameraHeading = (inspectionSession.active ? inspection.yaw : chase.yaw).toFixed(3);
      canvas.dataset.nearbyNpcs = visibility.stats.npcNearby ?? 0;
      canvas.dataset.visibleNpcs = visibility.stats.npcVisible ?? 0;
      canvas.dataset.visibleVans = visibility.stats.vanVisible ?? 0;
      canvas.dataset.movingVans = visibility.stats.vanMoving ?? 0;
    }, 250);
    lastTime = performance.now(); requestAnimationFrame(tick);
  } catch (error) {
    state = 'error'; document.body.dataset.gameState = state;
    const message = error?.message || String(error);
    $('error-message').textContent = /webgl|context/i.test(message)
      ? 'This prototype needs WebGL 2. Enable browser hardware acceleration and try a modern Chrome, Edge, or Firefox browser.'
      : message;
    $('error-message').hidden = false;
    $('start-label').textContent = 'UNABLE TO START';
    progress(0, 'Campus loading stopped. See the message above.');
    console.error('Campus initialization failed', error);
  }
}

$('start-button').addEventListener('click', play);
$('resume-button').addEventListener('click', play);
$('pause-button').addEventListener('click', () => pause());
$('reset-button').addEventListener('click', () => { resetPlayer(); play(); });
$('inspection-button').addEventListener('click', toggleInspection);
$('labels-button').addEventListener('click', toggleLabels);
$('alignment-button').addEventListener('click', toggleAlignment);
function saveAudioPreferences() { try { localStorage.setItem('iu-reaction-audio', JSON.stringify({ muted: reactions.muted, volume: reactions.volume })); } catch { /* Storage is optional. */ } }
function toggleSound() { if (!reactions) return; reactions.setMuted(!reactions.muted); if (!reactions.muted) reactions.unlock(); saveAudioPreferences(); }
$('sound-button').addEventListener('click', toggleSound);
$('sound-volume').addEventListener('input', event => { if (!reactions) return; reactions.setVolume(Number(event.target.value) / 100); reactions.unlock(); saveAudioPreferences(); });
document.querySelector('.wordmark').addEventListener('click', event => { event.preventDefault(); pause(); });
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('keydown', event => {
  if (event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName ?? '')) return;
  if (event.code === 'F3') { event.preventDefault(); hud?.toggleDebug(); }
  if (event.code === 'Enter' && state === 'ready') { event.preventDefault(); play(); }
  if (['playing', 'inspection'].includes(state)) {
    if (event.code === 'KeyI') { event.preventDefault(); toggleInspection(); }
    if (event.code === 'KeyL') { event.preventDefault(); toggleLabels(); }
    if (event.code === 'KeyG') { event.preventDefault(); toggleAlignment(); }
    if (event.code === 'KeyM') { event.preventDefault(); toggleSound(); }
  }
});
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause('focus'); $('pause-reason').textContent = 'The graphics context was lost. Reload the page to restore the campus.'; });
initialize();
