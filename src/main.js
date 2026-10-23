import './style.css';
import * as THREE from 'three';
import { loadMap } from './map/index.js';
import { buildWorld } from './world/index.js';
import { PlayerController, InputController, ThirdPersonCamera } from './player/index.js';
import { HUD } from './ui/hud.js';
import { InspectionCamera, InspectionSession } from './player/inspection.js';
import { PlaceLabels } from './ui/labels.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
let state = 'loading', renderer, scene, camera, world, mapData, player, input, chase, hud, sun;
let inspection, inspectionSession, labels, gameplayFog;
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
  input.setEnabled(false); inspectionSession.suspend();
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
  if (firstStart) { player.reset(mapData.spawn); chase.reset(mapData.spawn); }
  $('start-screen').hidden = true; $('pause-screen').hidden = true; $('play-hud').hidden = false;
  $('pause-button').disabled = false;
  $('view-toolbar').hidden = false;
  canvas.focus({ preventScroll: true });
  $('announcer').textContent = 'Explore Islamic University. WASD moves, Shift sprints, Space jumps. Escape pauses.';
  if (inspectionSession.active) { syncView(); return; }
  const locked = await input.requestPointerLock();
  if (!locked && state === 'playing') hud.toast('WASD to move. Hold right mouse and drag to look around.');
}
function resetPlayer() {
  if (inspectionSession.active) { inspectionSession.exit(); syncView(); }
  player.reset(mapData.spawn); chase.reset(mapData.spawn); accumulator = 0;
  hud.toast('Back at Main Gate. The campus is yours.');
}

function syncView() {
  const active = inspectionSession.active;
  scene.fog = active ? null : gameplayFog;
  document.body.classList.toggle('inspecting', active);
  $('inspection-button').setAttribute('aria-pressed', String(active));
  $('inspection-button').querySelector('span').textContent = active ? 'Back to student' : 'Inspect campus';
  $('inspection-banner').hidden = !active;
  $('announcer').textContent = active ? 'Inspection camera. Student paused. Mouse drag or arrows orbit, right drag or WASD pan, wheel zoom. I or Escape returns.' : 'Back to the student.';
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
  scene.add(new THREE.HemisphereLight(0xd9e6ec, 0x797c65, 1.4));
  sun = new THREE.DirectionalLight(0xffebcb, 2.0);
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
    chase.update(elapsed, player.position, input.consumeLook(elapsed));
    accumulator = Math.min(accumulator + elapsed, STEP * 5);
    while (accumulator >= STEP) {
      const controls = input.snapshot();
      if (controls.reset) { resetPlayer(); break; }
      else player.update(STEP, controls, chase.yaw);
      accumulator -= STEP;
    }
    player.animate(elapsed);
    chase.update(0, player.position);
    world.update(elapsed, player.position);
    sun.target.position.set(Math.round(player.position.x * 8) / 8, 0, Math.round(player.position.z * 8) / 8);
    sun.position.copy(sun.target.position).add(sunOffset);
    hud.update(elapsed, player, renderer, fps);
  } else if (state === 'inspection') {
    // No physics, character animation or catch-up accumulation in inspection.
    inspection.update(elapsed);
    hud.update(elapsed, player, renderer, fps, { inspection: true });
  } else if (state === 'ready') {
    world.update(elapsed, player.position);
  }
  if (renderer && scene && camera) {
    const activeCamera = inspectionSession.active ? inspection.camera : camera;
    renderer.render(scene, activeCamera);
    labels.update(elapsed, activeCamera, player.position, { inspection: inspectionSession.active, visible: ['playing', 'inspection'].includes(state), width: window.innerWidth, height: window.innerHeight });
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
    player = new PlayerController({ collisionGroup: world.collisionGroup, mapData });
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xb8cbd6);
    gameplayFog = new THREE.Fog(0xb8cbd6, 350, 1600); scene.fog = gameplayFog;
    scene.add(world.group, player.group);
    camera = new THREE.PerspectiveCamera(60, 1, .08, 2200);
    chase = new ThirdPersonCamera(camera, world.collisionGroup, { distance: 6 });
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
      canvas.dataset.position = `${player.position.x.toFixed(2)},${player.position.y.toFixed(2)},${player.position.z.toFixed(2)}`;
      canvas.dataset.grounded = String(player.grounded);
      canvas.dataset.cameraMode = inspectionSession.active ? 'inspection' : 'student';
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
  }
});
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); pause('focus'); $('pause-reason').textContent = 'The graphics context was lost. Reload the page to restore the campus.'; });
initialize();
