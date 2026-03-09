import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { G, BOLT_COOLDOWN, MAX_PITCH } from './state.js';
import { showCombatMessage, heroHitsBuilding, isPlayerDefeated } from './characters/combat.js';

// ── Character modules ──
import {
  hero, heroElectricGlow, flyModel as _flyModel, floatModel as _floatModel,
  TRAIL_CONFIGS,
  loadModels as loadThunderclapModels,
  fireLightning, updateThunderclapAI, updateThunderclapBolts,
} from './characters/thunderclap.js';
import {
  inferno,
  FIRE_TRAIL_CONFIGS,
  loadModel as loadInfernoModel,
  fireFirebolt, updateInfernoAI, updateInfernoBolts,
} from './characters/inferno.js';
import {
  icicle,
  ICE_TRAIL_CONFIGS,
  loadModel as loadIcicleModel,
  fireIcebolt, updateIcicleAI, updateIcicleBolts,
} from './characters/icicle.js';
import {
  foliage,
  VINE_TRAIL_CONFIGS,
  loadModel as loadFoliageModel,
  fireVines, updateFoliageAI, updateFoliageBolts,
} from './characters/foliage.js';

// Re-import mutable model refs via a live accessor (thunderclap exports let vars)
import * as TC from './characters/thunderclap.js';

// ─────────────────────────────────────────────
//  LOADING UI
// ─────────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingBar    = document.getElementById('loading-bar-fill');
const loadingStatus = document.getElementById('loading-status');

function setLoadProgress(pct, msg) {
  loadingBar.style.width = pct + '%';
  if (msg) loadingStatus.textContent = msg;
}

function hideLoadingScreen() {
  loadingScreen.classList.add('fade-out');
  setTimeout(() => loadingScreen.remove(), 900);
}

// ─────────────────────────────────────────────
//  RENDERER
// ─────────────────────────────────────────────
setLoadProgress(5, 'INITIALIZING RENDERER...');

const container = document.getElementById('canvas-container');
const renderer  = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled   = false;
renderer.toneMapping         = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
container.appendChild(renderer.domElement);

// ─────────────────────────────────────────────
//  SCENE / CAMERA
// ─────────────────────────────────────────────
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x3a6a9a);
scene.fog        = new THREE.FogExp2(0x3a6a9a, 0.0012);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 3000);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─────────────────────────────────────────────
//  LIGHTING
// ─────────────────────────────────────────────
setLoadProgress(10, 'SETTING UP LIGHTS...');

scene.add(new THREE.HemisphereLight(0x87ceeb, 0x6a9f5b, 2.2));

const sun = new THREE.DirectionalLight(0xfff8e0, 5.0);
sun.position.set(200, 400, 100);
sun.castShadow = false;
scene.add(sun);

const fill = new THREE.DirectionalLight(0xd0e8ff, 1.2);
fill.position.set(-150, 100, -200);
fill.castShadow = false;
scene.add(fill);

// ─────────────────────────────────────────────
//  GROUND  (streets + sidewalks + grass)
// ─────────────────────────────────────────────
setLoadProgress(15, 'LAYING GROUND...');

(function buildGround() {
  const S   = 2048;
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = S;
  const ctx = cvs.getContext('2d');

  // Dark asphalt base
  ctx.fillStyle = '#2e3138';
  ctx.fillRect(0, 0, S, S);

  // ── Warped grid of intersection points (6×6 → 5×5 city blocks) ──
  const COLS = 6, ROWS = 6;
  const CW = S / (COLS - 1), CH = S / (ROWS - 1);
  const pts = [];
  for (let r = 0; r < ROWS; r++) {
    pts[r] = [];
    for (let c = 0; c < COLS; c++) {
      const edge = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      pts[r][c] = {
        x: c * CW + (edge ? 0 : (Math.random() - 0.5) * CW * 0.42),
        y: r * CH + (edge ? 0 : (Math.random() - 0.5) * CH * 0.42),
      };
    }
  }

  // ── Pre-compute bezier control points for winding roads ──
  const hCP = [], vCP = [];
  for (let r = 0; r < ROWS; r++) {
    hCP[r] = [];
    for (let c = 0; c < COLS - 1; c++) {
      const mx = (pts[r][c].x + pts[r][c + 1].x) / 2 + (Math.random() - 0.5) * CW * 0.25;
      const my = (pts[r][c].y + pts[r][c + 1].y) / 2 + (Math.random() - 0.5) * CH * 0.25;
      hCP[r][c] = { x: mx, y: my };
    }
  }
  for (let c = 0; c < COLS; c++) {
    vCP[c] = [];
    for (let r = 0; r < ROWS - 1; r++) {
      const mx = (pts[r][c].x + pts[r + 1][c].x) / 2 + (Math.random() - 0.5) * CW * 0.25;
      const my = (pts[r][c].y + pts[r + 1][c].y) / 2 + (Math.random() - 0.5) * CH * 0.25;
      vCP[c][r] = { x: mx, y: my };
    }
  }

  // ── Draw grass patches inside each block ──
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const bl = pts[r][c], br = pts[r][c + 1];
      const tl = pts[r + 1][c];
      const inset = 0.18;
      const gx = bl.x + (br.x - bl.x) * inset + (tl.x - bl.x) * inset;
      const gy = bl.y + (br.y - bl.y) * inset + (tl.y - bl.y) * inset;
      const gw = (br.x - bl.x) * (1 - 2 * inset);
      const gh = (tl.y - bl.y) * (1 - 2 * inset);
      const hue  = 100 + (Math.random() - 0.5) * 20;
      const lght = 28  + (Math.random() - 0.5) * 8;
      ctx.fillStyle = `hsl(${hue},55%,${lght}%)`;
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.fill();
    }
  }

  // ── Helper: stroke a quadratic bezier road ──
  function drawRoad(x0, y0, cpx, cpy, x1, y1, w, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth   = w;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cpx, cpy, x1, y1);
    ctx.stroke();
  }

  const ROAD_W   = S * 0.045;
  const SIDE_W   = ROAD_W * 0.28;
  const MARK_W   = ROAD_W * 0.055;
  const MARK_GAP = S * 0.07;

  // ── Draw horizontal roads ──
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const p0 = pts[r][c], p1 = pts[r][c + 1], cp = hCP[r][c];
      drawRoad(p0.x, p0.y, cp.x, cp.y, p1.x, p1.y, ROAD_W,  '#3c3f47');
      drawRoad(p0.x, p0.y, cp.x, cp.y, p1.x, p1.y, SIDE_W,  '#888c96');
      ctx.setLineDash([MARK_GAP * 0.6, MARK_GAP * 0.4]);
      drawRoad(p0.x, p0.y, cp.x, cp.y, p1.x, p1.y, MARK_W,  '#ffffcc');
      ctx.setLineDash([]);
    }
  }
  // ── Draw vertical roads ──
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS - 1; r++) {
      const p0 = pts[r][c], p1 = pts[r + 1][c], cp = vCP[c][r];
      drawRoad(p0.x, p0.y, cp.x, cp.y, p1.x, p1.y, ROAD_W,  '#3c3f47');
      drawRoad(p0.x, p0.y, cp.x, cp.y, p1.x, p1.y, SIDE_W,  '#888c96');
      ctx.setLineDash([MARK_GAP * 0.6, MARK_GAP * 0.4]);
      drawRoad(p0.x, p0.y, cp.x, cp.y, p1.x, p1.y, MARK_W,  '#ffffcc');
      ctx.setLineDash([]);
    }
  }

  // ── Intersection blobs ──
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = '#3c3f47';
      ctx.beginPath();
      ctx.arc(pts[r][c].x, pts[r][c].y, ROAD_W * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex       = new THREE.CanvasTexture(cvs);
  tex.wrapS       = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  const groundGeo = new THREE.PlaneGeometry(2200, 2200);
  const groundMat = new THREE.MeshLambertMaterial({ map: tex });
  const ground    = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
})();

// ─────────────────────────────────────────────
//  ASSET LOADING  (buildings + trees)
// ─────────────────────────────────────────────
const gltfLoader = new GLTFLoader();

let totalAssets  = 0;
let loadedAssets = 0;

function onAssetLoaded() {
  loadedAssets++;
  setLoadProgress(20 + Math.round((loadedAssets / totalAssets) * 60),
    loadedAssets < totalAssets ? 'LOADING ASSETS...' : 'ASSEMBLING WORLD...');
}

const buildingFiles = [
  'city/building-type-a.glb','city/building-type-b.glb','city/building-type-c.glb',
  'city/building-type-d.glb','city/building-type-e.glb','city/building-type-f.glb',
  'city/building-type-g.glb','city/building-type-h.glb','city/building-type-i.glb',
  'city/building-type-j.glb','city/building-type-k.glb','city/building-type-l.glb',
  'city/building-type-m.glb','city/building-type-n.glb','city/building-type-o.glb',
  'city/building-type-p.glb','city/building-type-q.glb','city/building-type-r.glb',
  'city/building-type-s.glb','city/building-type-t.glb','city/building-type-u.glb',
];
const treeFiles = ['city/tree-large.glb', 'city/tree-small.glb'];

// 21 buildings + 2 trees + 2 hero models + 3 villain models = 28
totalAssets = buildingFiles.length + treeFiles.length + 2 + 3;

const buildingGLBs = [];
const treesGLBs    = [];

const buildingPromises = buildingFiles.map(f => new Promise(resolve => {
  gltfLoader.load(`assets/${f}`,
    gltf => { buildingGLBs.push(gltf.scene); onAssetLoaded(); resolve(); },
    undefined,
    ()  => { onAssetLoaded(); resolve(); }
  );
}));

const treePromises = treeFiles.map(f => new Promise(resolve => {
  gltfLoader.load(`assets/${f}`,
    gltf => { treesGLBs.push(gltf.scene); onAssetLoaded(); resolve(); },
    undefined,
    ()  => { onAssetLoaded(); resolve(); }
  );
}));

// ─────────────────────────────────────────────
//  ADD CHARACTER GROUPS TO SCENE
// ─────────────────────────────────────────────
scene.add(hero);
scene.add(inferno);
scene.add(icicle);
scene.add(foliage);

// Wire up shared state references
G.scene          = scene;
G.hero           = hero;
G.inferno        = inferno;
G.icicle         = icicle;
G.foliage        = foliage;
G.playerGroup    = hero;
G.spectatorGroup = hero;

// DOM elements
G.heroHealthFill    = document.getElementById('hero-health-fill');
G.infernoHealthFill = document.getElementById('inferno-health-fill');
G.icicleHealthFill  = document.getElementById('icicle-health-fill');
G.foliageHealthFill = document.getElementById('foliage-health-fill');
G.combatMessage     = document.getElementById('combat-message');

// ─────────────────────────────────────────────
//  LOAD CHARACTER MODELS
// ─────────────────────────────────────────────
const [heroFlyPromise, heroFloatPromise] = loadThunderclapModels(gltfLoader, onAssetLoaded);
const infernoModelPromise = loadInfernoModel(gltfLoader, onAssetLoaded);
const icicleModelPromise  = loadIcicleModel(gltfLoader, onAssetLoaded);
const foliageModelPromise = loadFoliageModel(gltfLoader, onAssetLoaded);

// ─────────────────────────────────────────────
//  TRAILS  (3 layered lines per entity)
// ─────────────────────────────────────────────
const TRAIL_LEN = 80;

function makeTrail(configs, initX, initY, initZ) {
  const bufs = configs.map(() => {
    const buf = new Float32Array(TRAIL_LEN * 3);
    for (let i = 0; i < TRAIL_LEN; i++) { buf[i*3] = initX; buf[i*3+1] = initY; buf[i*3+2] = initZ; }
    return buf;
  });
  const lines = configs.map(([color, opacity], idx) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(bufs[idx], 3));
    geo.setDrawRange(0, TRAIL_LEN);
    const mat  = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    scene.add(line);
    return { line, geo };
  });
  return { bufs, lines };
}

const { bufs: trailBufs,     lines: trailLines     } = makeTrail(TRAIL_CONFIGS,      0,    100,    0);
const { bufs: fireTrailBufs, lines: fireTrailLines  } = makeTrail(FIRE_TRAIL_CONFIGS, 300,  150, -400);
const { bufs: vineTrailBufs, lines: vineTrailLines  } = makeTrail(VINE_TRAIL_CONFIGS, 0,    150,  500);
const { bufs: iceTrailBufs,  lines: iceTrailLines   } = makeTrail(ICE_TRAIL_CONFIGS, -300,  150,  400);

let trailTick = 0;

const CHAR_TRAIL = {
  hero:    { bufs: trailBufs,     lines: trailLines,     configs: TRAIL_CONFIGS      },
  inferno: { bufs: fireTrailBufs, lines: fireTrailLines, configs: FIRE_TRAIL_CONFIGS },
  icicle:  { bufs: iceTrailBufs,  lines: iceTrailLines,  configs: ICE_TRAIL_CONFIGS  },
  foliage: { bufs: vineTrailBufs, lines: vineTrailLines, configs: VINE_TRAIL_CONFIGS },
};

// ─────────────────────────────────────────────
//  CITY PLACEMENT
// ─────────────────────────────────────────────
function buildCity() {
  console.log('[buildCity] buildingGLBs loaded:', buildingGLBs.length);
  if (buildingGLBs.length === 0) return;
  setLoadProgress(82, 'CONSTRUCTING CITY...');

  const CITY_RADIUS  = 650;
  const EXCLUDE_NEAR = 110;
  const MIN_DIST     = 80;
  const TARGET_COUNT = 230;
  const MAX_TRIES    = 12000;

  const placed = [];

  function tooClose(x, z) {
    if (Math.abs(x) < EXCLUDE_NEAR && Math.abs(z) < EXCLUDE_NEAR) return true;
    const minD2 = MIN_DIST * MIN_DIST;
    for (let i = 0; i < placed.length; i++) {
      const dx = x - placed[i].x, dz = z - placed[i].z;
      if (dx * dx + dz * dz < minD2) return true;
    }
    return false;
  }

  let tries = 0;
  while (placed.length < TARGET_COUNT && tries < MAX_TRIES) {
    tries++;
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.sqrt(Math.random()) * CITY_RADIUS;
    const x     = Math.cos(angle) * r;
    const z     = Math.sin(angle) * r;

    if (tooClose(x, z)) continue;
    placed.push({ x, z });

    const isSkyscraper = placed.length % 3 === 0;
    const src          = buildingGLBs[Math.floor(Math.random() * buildingGLBs.length)];
    const building     = src.clone(true);

    building.position.set(x, 0, z);
    building.rotation.y = Math.random() * Math.PI * 2;

    const s = (0.85 + Math.random() * 0.55) * 20;
    building.scale.multiplyScalar(s);

    if (isSkyscraper) building.scale.y *= 4 + Math.random() * 5;

    scene.add(building);

    const bMeshes = [];
    building.traverse(child => { if (child.isMesh) bMeshes.push(child); });
    const bbox = new THREE.Box3().setFromObject(building);
    const bcx = (bbox.min.x + bbox.max.x) / 2, bcz = (bbox.min.z + bbox.max.z) / 2;
    const bdx = bbox.max.x - bbox.min.x, bdz = bbox.max.z - bbox.min.z;
    G.buildingData.push({ cx: bcx, cz: bcz, xzRadius: Math.sqrt(bdx * bdx + bdz * bdz) / 2, maxY: bbox.max.y, meshes: bMeshes });
    if (G.buildingMeshes.length < 300) G.buildingMeshes.push(...bMeshes);

    if (treesGLBs.length > 0 && Math.random() < 0.18) {
      const tree = treesGLBs[Math.floor(Math.random() * treesGLBs.length)].clone(true);
      const ta   = Math.random() * Math.PI * 2;
      const td   = 45 + Math.random() * 15;
      tree.position.set(x + Math.cos(ta) * td, 0, z + Math.sin(ta) * td);
      tree.rotation.y = Math.random() * Math.PI * 2;
      scene.add(tree);
    }
  }
  console.log('[buildCity] placed:', placed.length, 'buildings');
  if (placed.length > 0) {
    const b = G.buildingData[0];
    console.log('[buildCity] first building bbox:', b);
  }
}

// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyH') toggleFloat();
  if (e.code === 'KeyB' && !isPlayerDefeated()) yawAngle += Math.PI;
  if (e.code === 'Digit0') toggleSpectatorMode();
  if (e.code === 'Digit1') G.spectatorMode ? switchSpectator(1) : switchCharacter(1);
  if (e.code === 'Digit2') G.spectatorMode ? switchSpectator(2) : switchCharacter(2);
  if (e.code === 'Digit3') G.spectatorMode ? switchSpectator(3) : switchCharacter(3);
  if (e.code === 'Digit4') G.spectatorMode ? switchSpectator(4) : switchCharacter(4);
  e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ─────────────────────────────────────────────
//  CHARACTER SELECT
// ─────────────────────────────────────────────
const CHAR_COLORS = {
  hero:    '#1144cc',
  inferno: '#ff3300',
  icicle:  '#aaeeff',
  foliage: '#44cc00',
};
const CHAR_LABELS = {
  hero:    'THUNDERCLAP',
  inferno: 'INFERNO',
  icicle:  'ICICLE',
  foliage: 'FOLIAGE',
};

function switchCharacter(n) {
  const names  = ['hero', 'inferno', 'icicle', 'foliage'];
  const groups = [hero, inferno, icicle, foliage];
  const idx = n - 1;
  if (idx < 0 || idx > 3) return;
  const newChar = names[idx];
  if (G.playerChar === newChar) return;

  G.playerChar  = newChar;
  G.playerGroup = groups[idx];

  // Inherit new character's current orientation
  const euler = new THREE.Euler().setFromQuaternion(G.playerGroup.quaternion, 'YXZ');
  yawAngle   = euler.y;
  pitchAngle = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x));

  // Snap camera to new character
  camCurrentPos.copy(G.playerGroup.position).add(new THREE.Vector3(0, 2, 20));
  camCurrentLook.copy(G.playerGroup.position);

  document.getElementById('title-badge').textContent = CHAR_LABELS[G.playerChar];

  ['hero-health-hud', 'inferno-health-hud', 'icicle-health-hud', 'foliage-health-hud'].forEach((id, i) => {
    document.getElementById(id).classList.toggle('player-controlled', i === idx);
  });

  showCombatMessage(`NOW PLAYING AS ${CHAR_LABELS[G.playerChar]}!`, CHAR_COLORS[G.playerChar], 2500);
}

function toggleSpectatorMode() {
  const names = ['hero', 'inferno', 'icicle', 'foliage'];
  if (!G.spectatorMode) {
    G.spectatorMode  = true;
    G.prevPlayerChar = G.playerChar;
    G.spectatorChar  = G.playerChar;
    G.spectatorGroup = G.playerGroup;
    G.playerChar = 'spectator';
    document.getElementById('title-badge').textContent = 'SPECTATOR';
    ['hero-health-hud', 'inferno-health-hud', 'icicle-health-hud', 'foliage-health-hud'].forEach(id => {
      document.getElementById(id).classList.remove('player-controlled');
    });
    showCombatMessage('SPECTATOR MODE — ALL AI CONTROLLED  |  1-4 TO SWITCH VIEW', '#ffffff', 3500);
  } else {
    G.spectatorMode = false;
    switchCharacter(names.indexOf(G.prevPlayerChar) + 1);
  }
}

function switchSpectator(n) {
  const names  = ['hero', 'inferno', 'icicle', 'foliage'];
  const groups = [hero, inferno, icicle, foliage];
  const idx = n - 1;
  if (idx < 0 || idx > 3) return;
  G.spectatorChar  = names[idx];
  G.spectatorGroup = groups[idx];
  showCombatMessage(`WATCHING ${CHAR_LABELS[G.spectatorChar]}`, CHAR_COLORS[G.spectatorChar], 1500);
}

function firePlayerWeapon(superBoosting = false) {
  switch (G.playerChar) {
    case 'hero':    fireLightning(superBoosting); break;
    case 'inferno': fireFirebolt(true);           break;
    case 'icicle':  fireIcebolt(true);            break;
    case 'foliage': fireVines(true);              break;
  }
}

// ─────────────────────────────────────────────
//  FLOAT MODE
// ─────────────────────────────────────────────
let isFloating      = false;
let staminaDepleted = false;
let wasFloatingBeforeDepletion = false;
const floatBtn = document.getElementById('float-btn');

function toggleFloat() {
  if (staminaDepleted && isFloating) return;

  isFloating    = !isFloating;
  G.isFloating  = isFloating;

  if (G.playerChar === 'hero') {
    if (TC.flyModel)   TC.flyModel.visible   = !isFloating;
    if (TC.floatModel) TC.floatModel.visible =  isFloating;
  }

  // Orient villain models upright when hovering, restore flight pose when flying
  [inferno, icicle, foliage].forEach(group => {
    // Find the first non-light child (the model)
    const model = group.children.find(c => !(c.isLight));
    if (!model) return;
    if (isFloating) {
      model.rotation.set(0, Math.PI / 2, 0);
    } else {
      model.rotation.order = 'ZXY';
      model.rotation.set(-Math.PI / 2 - 0.1, 0, -Math.PI / 2);
    }
  });

  floatBtn.textContent = isFloating ? '⏸ HOVER' : '▶ FLY';
  floatBtn.className   = isFloating ? 'hover-mode' : 'fly-mode';

  if (isFloating) pitchAngle = 0;
}

floatBtn.addEventListener('click', toggleFloat);

// ─────────────────────────────────────────────
//  FLIGHT PHYSICS
// ─────────────────────────────────────────────
const BASE_SPEED       = 40;
const BOOST_MULT       = 2.5;
const SUPER_BOOST_MULT = 10.0;
const PITCH_RATE       = 1.2;
const YAW_RATE         = 0.9;
const CAM_LERP         = 0.06;

let pitchAngle = 0;
let yawAngle   = 0;

const camCurrentPos  = new THREE.Vector3();
const camCurrentLook = new THREE.Vector3();

const _fwd       = new THREE.Vector3();
const _desiredP  = new THREE.Vector3();
const _desiredL  = new THREE.Vector3();
const _pitchAxis = new THREE.Vector3(1, 0, 0);
const _yawAxis   = new THREE.Vector3(0, 1, 0);
const _rollAxis  = new THREE.Vector3(0, 0, 1);
const _pitchQ    = new THREE.Quaternion();
const _yawQ      = new THREE.Quaternion();
const _rollQ     = new THREE.Quaternion();

const boostIndicator = document.getElementById('boost-indicator');

// ─────────────────────────────────────────────
//  STAMINA
// ─────────────────────────────────────────────
const STAMINA_DRAIN       = 0.18;
const STAMINA_REGEN       = 0.12;
const STAMINA_HOVER_REGEN = 0.45;

let stamina          = 1.0;
let lightningCooldown = 0;
const staminaFill = document.getElementById('stamina-fill');

// ─────────────────────────────────────────────
//  INIT SEQUENCE
// ─────────────────────────────────────────────
const clock = new THREE.Clock();
let   ready  = false;

const allPromises = [
  ...buildingPromises, ...treePromises,
  heroFlyPromise, heroFloatPromise,
  infernoModelPromise, icicleModelPromise, foliageModelPromise,
];

Promise.all(allPromises).then(() => {
  buildCity();
  setLoadProgress(98, 'READY FOR TAKEOFF...');

  camCurrentPos.copy(hero.position).add(new THREE.Vector3(0, 2, 20));
  camCurrentLook.copy(hero.position);

  setTimeout(() => {
    setLoadProgress(100, 'LAUNCHING...');
    setTimeout(() => {
      hideLoadingScreen();
      ready = true;
      clock.start();
      renderer.setAnimationLoop(animate);
    }, 400);
  }, 300);
});

// ─────────────────────────────────────────────
//  TRAIL UPDATE HELPER
// ─────────────────────────────────────────────
const _TRAIL_SPREADS = [0.3, 1.0, 1.8];

function updateVillainTrail(bufs, lines, entityPos, entityVisible, entityState) {
  for (let ti = 0; ti < bufs.length; ti++) {
    const buf    = bufs[ti];
    const spread = _TRAIL_SPREADS[ti];
    for (let i = TRAIL_LEN - 1; i > 0; i--) {
      buf[i * 3]     = buf[(i - 1) * 3];
      buf[i * 3 + 1] = buf[(i - 1) * 3 + 1];
      buf[i * 3 + 2] = buf[(i - 1) * 3 + 2];
    }
    buf[0] = entityPos.x + (Math.random() - 0.5) * spread * 1.2;
    buf[1] = entityPos.y + (Math.random() - 0.5) * spread * 1.2;
    buf[2] = entityPos.z + (Math.random() - 0.5) * spread * 1.2;
    lines[ti].geo.attributes.position.needsUpdate = true;
    lines[ti].line.visible = entityVisible && entityState === 'chase';
  }
}

// ─────────────────────────────────────────────
//  ANIMATION LOOP
// ─────────────────────────────────────────────
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!ready) return;

  const t = clock.elapsedTime;

  // ── Stamina ──
  const wantBoost      = !!keys['Space'] && !isFloating;
  const wantSuperBoost = !!keys['KeyS']  && !isFloating;
  const superBoosting  = wantSuperBoost && stamina > 0;
  const boosting       = wantBoost && stamina > 0 && !superBoosting;
  const firingLightning = !!keys['KeyF'] && stamina > 0 && !staminaDepleted;

  if (superBoosting) {
    stamina = Math.max(0, stamina - STAMINA_DRAIN * 2 * dt);
  } else if (boosting || firingLightning) {
    stamina = Math.max(0, stamina - STAMINA_DRAIN * dt);
  } else if (isFloating) {
    stamina = Math.min(1, stamina + STAMINA_HOVER_REGEN * dt);
  } else {
    stamina = Math.min(1, stamina + STAMINA_REGEN * dt);
  }

  staminaFill.style.width = (stamina * 100) + '%';
  staminaFill.classList.toggle('depleted', staminaDepleted);

  if (stamina === 0 && !staminaDepleted) {
    staminaDepleted = true;
    wasFloatingBeforeDepletion = isFloating;
    if (!isFloating) toggleFloat();
  }
  if (staminaDepleted && stamina >= 1.0) {
    staminaDepleted = false;
    if (!wasFloatingBeforeDepletion && isFloating) toggleFloat();
  }
  G.staminaDepleted            = staminaDepleted;
  G.wasFloatingBeforeDepletion = wasFloatingBeforeDepletion;

  // ── Input / flight ──
  if (!G.spectatorMode && !isPlayerDefeated()) {
    const speed = isFloating ? 0 : BASE_SPEED * (superBoosting ? SUPER_BOOST_MULT : boosting ? BOOST_MULT : 1.0);

    if (keys['ArrowUp'])    pitchAngle = Math.min(pitchAngle + PITCH_RATE * dt,  MAX_PITCH);
    if (keys['ArrowDown'])  pitchAngle = Math.max(pitchAngle - PITCH_RATE * dt, -MAX_PITCH);
    if (keys['ArrowLeft'])  yawAngle  += YAW_RATE * dt;
    if (keys['ArrowRight']) yawAngle  -= YAW_RATE * dt;

    if (isFloating || (!keys['ArrowUp'] && !keys['ArrowDown'])) pitchAngle *= 0.97;

    _pitchQ.setFromAxisAngle(_pitchAxis, pitchAngle);
    _yawQ.setFromAxisAngle(_yawAxis, yawAngle);
    const rollAmt = !isFloating && keys['ArrowLeft'] ? 0.38
                  : !isFloating && keys['ArrowRight'] ? -0.38 : 0;
    _rollQ.setFromAxisAngle(_rollAxis, rollAmt);
    G.playerGroup.quaternion.copy(_yawQ).multiply(_pitchQ).multiply(_rollQ);

    _fwd.set(0, 0, -1).applyQuaternion(G.playerGroup.quaternion).normalize();
    const _tentative = G.playerGroup.position.clone().addScaledVector(_fwd, speed * dt);
    _tentative.y = Math.max(4, _tentative.y);

    if (!heroHitsBuilding(_tentative)) {
      G.playerGroup.position.copy(_tentative);
    } else {
      const _vertOnly = new THREE.Vector3(G.playerGroup.position.x, _tentative.y, G.playerGroup.position.z);
      if (!heroHitsBuilding(_vertOnly)) G.playerGroup.position.y = _tentative.y;
    }
  } else {
    if (G.playerChar === 'hero') {
      // hero defeated update is handled inside updateThunderclapAI
    }
  }

  // Handle player angle reset after hero respawn
  if (hero._resetPlayerAngles) {
    hero._resetPlayerAngles = false;
    if (G.playerChar === 'hero') { pitchAngle = 0; yawAngle = 0; }
  }

  // ── Camera ──
  if (G.spectatorMode) {
    _desiredP.set(0, 80, 130).applyQuaternion(G.spectatorGroup.quaternion).add(G.spectatorGroup.position);
    _desiredL.copy(G.spectatorGroup.position).add(new THREE.Vector3(0, 10, 0));
    camCurrentPos.lerp(_desiredP,  0.015);
    camCurrentLook.lerp(_desiredL, 0.02);
  } else {
    const pitchCamY = 2 - pitchAngle * 12;
    _desiredP.set(0, pitchCamY, 20).applyQuaternion(_yawQ).add(G.playerGroup.position);
    _desiredL.copy(G.playerGroup.position).add(new THREE.Vector3(0, 3, 0));
    camCurrentPos.lerp(_desiredP,  CAM_LERP);
    camCurrentLook.lerp(_desiredL, CAM_LERP);
  }
  camera.position.copy(camCurrentPos);
  camera.lookAt(camCurrentLook);

  // ── Player trail ──
  trailTick++;
  const trailSpreads = [0.3, 1.0, 1.8];
  if (G.spectatorMode) {
    for (const data of Object.values(CHAR_TRAIL)) {
      data.lines.forEach(l => { l.line.visible = false; });
    }
  } else {
    for (const [ch, data] of Object.entries(CHAR_TRAIL)) {
      if (ch !== G.playerChar) data.lines.forEach(l => { l.line.visible = false; });
    }
    const { bufs: pBufs, lines: pLines, configs: pConfigs } = CHAR_TRAIL[G.playerChar] || CHAR_TRAIL['hero'];
    for (let ti = 0; ti < pBufs.length; ti++) {
      const buf    = pBufs[ti];
      const spread = trailSpreads[ti];
      for (let i = TRAIL_LEN - 1; i > 0; i--) {
        buf[i * 3]     = buf[(i - 1) * 3];
        buf[i * 3 + 1] = buf[(i - 1) * 3 + 1];
        buf[i * 3 + 2] = buf[(i - 1) * 3 + 2];
      }
      const jitter = superBoosting ? spread * 14.0 : boosting ? spread * 2.5 : spread * 1.2;
      buf[0] = G.playerGroup.position.x + (Math.random() - 0.5) * jitter;
      buf[1] = G.playerGroup.position.y + (Math.random() - 0.5) * jitter;
      buf[2] = G.playerGroup.position.z + (Math.random() - 0.5) * jitter;
      pLines[ti].geo.attributes.position.needsUpdate = true;
      pLines[ti].line.visible = boosting || superBoosting;
      pLines[ti].line.material.opacity = pConfigs[ti][1];
    }
  }

  // Electric glow: pulses during boost
  heroElectricGlow.intensity = superBoosting ? 22 + Math.sin(t * 45) * 8
                             : boosting      ?  5 + Math.sin(t * 22) * 2
                             : (isFloating   ? 0.5 : 1.0);

  // ── Weapon firing (rate-limited by BOLT_COOLDOWN) ──
  lightningCooldown -= dt;
  if (!G.spectatorMode && !isPlayerDefeated()) {
    if (firingLightning && lightningCooldown <= 0) {
      firePlayerWeapon(superBoosting);
      lightningCooldown = BOLT_COOLDOWN;
    }
  }

  // ── Thunderclap AI (when player controls a different character) ──
  if (G.playerChar !== 'hero') updateThunderclapAI(dt, t);
  updateThunderclapBolts(dt);

  // ── Inferno AI + trail + bolts ──
  updateInfernoAI(dt, t);
  if (G.playerChar !== 'inferno') updateVillainTrail(fireTrailBufs, fireTrailLines, inferno.position, inferno.visible, G.infernoState);
  updateInfernoBolts(dt);

  // ── Icicle AI + trail + bolts ──
  updateIcicleAI(dt, t);
  if (G.playerChar !== 'icicle') updateVillainTrail(iceTrailBufs, iceTrailLines, icicle.position, icicle.visible, G.icicleState);
  updateIcicleBolts(dt);

  // ── Foliage AI + trail + bolts ──
  updateFoliageAI(dt, t);
  if (G.playerChar !== 'foliage') updateVillainTrail(vineTrailBufs, vineTrailLines, foliage.position, foliage.visible, G.foliageState);
  updateFoliageBolts(dt);

  // ── HUD ──
  boostIndicator.classList.toggle('active', boosting || superBoosting);

  renderer.render(scene, camera);
}
