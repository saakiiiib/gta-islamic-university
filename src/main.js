import './style.css';
import './ui/reactions.css';
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

const $ = id => document.getElementById(id);
const canvas = $('game');
let state = 'loading', renderer, scene, camera, world, mapData, player, input, chase, hud, sun;
let inspection, inspectionSession, labels, gameplayFog;
let simulation;
let reactions;
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
  inspection?.resize(width / Math.max(1, height));
}
function pause(reason = 'escape') {
  if (!['playing', 'inspection'].includes(state)) return;
  state = 'paused'; accumulator = 0;
  input.setEnabled(false); inspectionSession.suspend(); simulation.setSuspended(true);
  reactions?.setSuspended(true);
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  $('pause-reason').textContent = reason === 'focus' ? 'The game paused while you stepped away.' : 'Your campus is waiting.';
  $('pause-screen').hidden = false;
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
  if (firstStart) { simulation.reset(); chase.setDriving(false); chase.reset(mapData.spawn); }
  $('start-screen').hidden = true; $('pause-screen').hidden = true; $('play-hud').hidden = false;
  $('pause-button').disabled = false;
  $('view-toolbar').hidden = false;
  canvas.focus({ preventScroll: true });
  $('announcer').textContent = 'Explore campus. WASD moves, Shift sprints, Space jumps. Approach the parked electric van and press E to drive.';
  if (inspectionSession.active) { syncView(); return; }
  const locked = await input.requestPointerLock();
  if (!locked && state === 'playing') hud.toast(firstStart ? 'WASD to move. Right-drag to look. The electric van is parked ahead; approach and press E.' : 'Hold right mouse and drag to look around.', 6500);
  else if (firstStart) hud.toast('The electric van is parked ahead. Approach it and press E to drive.', 5500);
}
function resetPlayer() {
  if (inspectionSession.active) { inspectionSession.exit(); syncView(); }
  simulation.reset(); simulation.setSuspended(false); chase.setDriving(false); chase.reset(mapData.spawn); accumulator = 0;
  reactions?.reset();
  hud.toast('Back at Main Gate. All eight vans repaired and parked.');
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
  $('inspection-banner').hidden = !active;
  $('announcer').textContent = active ? 'Inspection camera. Student, van and pedestrians paused. Mouse drag or arrows orbit, right drag or WASD pan, wheel zoom. I or Escape returns.' : simulation.session.driving ? 'Back to the electric van.' : 'Back to the student.';
  labels.elapsed = 1;
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
  scene.add(new THREE.HemisphereLight(0xd9edf4, 0x6f805e, 1.25));
  sun = new THREE.DirectionalLight(0xffeed0, 2.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 58, bottom: -58, near: 1, far: 210 });
  sun.shadow.bias = -.00015; sun.shadow.normalBias = .035;
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
    accumulator = Math.min(accumulator + elapsed, STEP * 5);
    while (accumulator >= STEP) {
      const controls = input.snapshot();
      if (controls.reset) { resetPlayer(); break; }
      const event = simulation.update(STEP, controls, chase.yaw);
      if (event.message) hud.toast(event.message);
      if (event.changed) { input.clear(); chase.setDriving(simulation.session.driving); }
      accumulator -= STEP;
    }
    simulation.animate(elapsed);
    reactions.consume(simulation.drainEvents(), simulation.entity.position, chase.yaw);
    reactions.update(elapsed, simulation.entity.position, chase.yaw, simulation.crowd.agents);
    chase.updateTravel(0, simulation.entity);
    world.update(elapsed, simulation.entity.position);
    sun.target.position.set(Math.round(simulation.entity.position.x * 8) / 8, 0, Math.round(simulation.entity.position.z * 8) / 8);
    sun.position.copy(sun.target.position).add(sunOffset);
    hud.update(elapsed, simulation.entity, renderer, fps, { simulation });
  } else if (state === 'inspection') {
    // No physics, character animation or catch-up accumulation in inspection.
    inspection.update(elapsed);
    hud.update(elapsed, simulation.entity, renderer, fps, { inspection: true, simulation });
  } else if (state === 'ready') {
    world.update(elapsed, player.position);
  }
  if (renderer && scene && camera) {
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
    progress(76, 'Preparing movement and collision geometry…');
    progress(82, 'Parking eight vans and preparing thirty campus pedestrians…');
    simulation = new CampusSimulation(mapData, world.collisionGroup); player = simulation.player;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xb0d0df);
    gameplayFog = new THREE.Fog(0xb0d0df, 350, 1600); scene.fog = gameplayFog;
    scene.add(world.group, player.group, simulation.fleetGroup, simulation.occupants.group, simulation.crowd.group);
    camera = new THREE.PerspectiveCamera(60, 1, .08, 2200);
    chase = new TravelCamera(camera, world.collisionGroup);
    chase.reset(mapData.spawn);
    input = new InputController(canvas, { onPause: reason => {
      if (reason === 'escape' && state === 'inspection') toggleInspection();
      else if (reason === 'escape' && state === 'paused') play();
      else pause(reason);
    } });
    inspection = new InspectionCamera(new THREE.PerspectiveCamera(52, 1, .5, 3500), mapData.bounds);
    inspection.attach(canvas, pause);
    inspectionSession = new InspectionSession(input, inspection, document);
    labels = new PlaceLabels($('place-labels'), world.labelAnchors, world.buildingMeshes);
    lighting(); resize();
    hud = new HUD(mapData);
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
