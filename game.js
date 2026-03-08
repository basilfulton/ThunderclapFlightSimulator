import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
//  GROUND (streets + sidewalks + grass)
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
      hCP[r][c] = {
        x: (pts[r][c].x + pts[r][c+1].x) / 2 + (Math.random() - 0.5) * 44,
        y: (pts[r][c].y + pts[r][c+1].y) / 2 + (Math.random() - 0.5) * 44,
      };
    }
  }
  for (let r = 0; r < ROWS - 1; r++) {
    vCP[r] = [];
    for (let c = 0; c < COLS; c++) {
      vCP[r][c] = {
        x: (pts[r][c].x + pts[r+1][c].x) / 2 + (Math.random() - 0.5) * 44,
        y: (pts[r][c].y + pts[r+1][c].y) / 2 + (Math.random() - 0.5) * 44,
      };
    }
  }

  // ── Draw roads as wide bezier strokes ──
  ctx.strokeStyle = '#2e3138';
  ctx.lineWidth   = 30;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      ctx.beginPath();
      ctx.moveTo(pts[r][c].x, pts[r][c].y);
      ctx.quadraticCurveTo(hCP[r][c].x, hCP[r][c].y, pts[r][c+1].x, pts[r][c+1].y);
      ctx.stroke();
    }
  }
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(pts[r][c].x, pts[r][c].y);
      ctx.quadraticCurveTo(vCP[r][c].x, vCP[r][c].y, pts[r+1][c].x, pts[r+1][c].y);
      ctx.stroke();
    }
  }

  // ── Fill city blocks: sidewalk + organic grass ──
  const GREENS = ['#1f4a12', '#254f14', '#163309', '#2a5c18', '#1c420f'];
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const tl = pts[r][c], tr = pts[r][c+1], bl = pts[r+1][c], br = pts[r+1][c+1];
      const mcx = (tl.x + tr.x + bl.x + br.x) / 4;
      const mcy = (tl.y + tr.y + bl.y + br.y) / 4;
      const inset = (p, f) => ({ x: p.x + (mcx - p.x) * f, y: p.y + (mcy - p.y) * f });

      // Sidewalk polygon
      const [stl, str, sbl, sbr] = [tl, tr, bl, br].map(p => inset(p, 0.09));
      ctx.fillStyle = '#6b6e75';
      ctx.beginPath();
      ctx.moveTo(stl.x, stl.y); ctx.lineTo(str.x, str.y);
      ctx.lineTo(sbr.x, sbr.y); ctx.lineTo(sbl.x, sbl.y);
      ctx.closePath(); ctx.fill();

      // Grass base
      const [gtl, gtr, gbl, gbr] = [tl, tr, bl, br].map(p => inset(p, 0.17));
      ctx.fillStyle = '#1a3a0e';
      ctx.beginPath();
      ctx.moveTo(gtl.x, gtl.y); ctx.lineTo(gtr.x, gtr.y);
      ctx.lineTo(gbr.x, gbr.y); ctx.lineTo(gbl.x, gbl.y);
      ctx.closePath(); ctx.fill();

      // Clip to grass quad for random patches
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gtl.x, gtl.y); ctx.lineTo(gtr.x, gtr.y);
      ctx.lineTo(gbr.x, gbr.y); ctx.lineTo(gbl.x, gbl.y);
      ctx.closePath(); ctx.clip();

      for (let p = 0; p < 65; p++) {
        const u = Math.random(), v = Math.random();
        const tx = gtl.x*(1-u)*(1-v) + gtr.x*u*(1-v) + gbl.x*(1-u)*v + gbr.x*u*v;
        const ty = gtl.y*(1-u)*(1-v) + gtr.y*u*(1-v) + gbl.y*(1-u)*v + gbr.y*u*v;
        const pw = 8 + Math.random() * 45, ph = 5 + Math.random() * 25;
        ctx.save();
        ctx.translate(tx, ty); ctx.rotate(Math.random() * Math.PI);
        ctx.fillStyle = GREENS[Math.floor(Math.random() * GREENS.length)];
        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
        ctx.fillRect(-pw/2, -ph/2, pw, ph);
        ctx.restore();
      }
      ctx.globalAlpha = 1.0;

      for (let p = 0; p < 7; p++) {
        const u = Math.random(), v = Math.random();
        const tx = gtl.x*(1-u)*(1-v) + gtr.x*u*(1-v) + gbl.x*(1-u)*v + gbr.x*u*v;
        const ty = gtl.y*(1-u)*(1-v) + gtr.y*u*(1-v) + gbl.y*(1-u)*v + gbr.y*u*v;
        ctx.fillStyle = 'rgba(60,40,20,0.35)';
        ctx.beginPath();
        ctx.ellipse(tx, ty, 6 + Math.random()*15, 4 + Math.random()*11, Math.random()*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── Lane markings following the bezier curves ──
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth   = 1.8;
  ctx.setLineDash([16, 13]);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      ctx.beginPath();
      ctx.moveTo(pts[r][c].x, pts[r][c].y);
      ctx.quadraticCurveTo(hCP[r][c].x, hCP[r][c].y, pts[r][c+1].x, pts[r][c+1].y);
      ctx.stroke();
    }
  }
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(pts[r][c].x, pts[r][c].y);
      ctx.quadraticCurveTo(vCP[r][c].x, vCP[r][c].y, pts[r+1][c].x, pts[r+1][c].y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
})();

// ─────────────────────────────────────────────
//  KENNEY CITY ASSETS
// ─────────────────────────────────────────────
setLoadProgress(20, 'LOADING CITY ASSETS...');

const BUILDING_FILES = [
  'building-type-a', 'building-type-b', 'building-type-c',
  'building-type-d', 'building-type-e', 'building-type-f',
  'building-type-g', 'building-type-h', 'building-type-i',
  'building-type-j', 'building-type-k', 'building-type-l',
  'building-type-m', 'building-type-n', 'building-type-o',
  'building-type-p', 'building-type-q', 'building-type-r',
  'building-type-s', 'building-type-t', 'building-type-u',
];
const TREE_FILES  = ['tree-large', 'tree-small'];
const ASSETS_PATH = 'assets/city/';

const gltfLoader     = new GLTFLoader();
const buildingGLBs   = [];
const treesGLBs      = [];

// ── Recolor building textures: white→gray, green→dark gray ──
const processedTextures = new Set();
function recolorTexture(tex) {
  if (!tex || !tex.image || processedTextures.has(tex.uuid)) return;
  processedTextures.add(tex.uuid);
  const img = tex.image;
  const cvs = document.createElement('canvas');
  cvs.width  = img.width  || img.naturalWidth  || 512;
  cvs.height = img.height || img.naturalHeight || 512;
  const ctx  = cvs.getContext('2d');
  ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
  const id   = ctx.getImageData(0, 0, cvs.width, cvs.height);
  const d    = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    if (r > 180 && g > 180 && b > 180) {
      // white-ish → gray
      d[i] = d[i+1] = d[i+2] = 130;
    } else if (g > r + 25 && g > b + 20 && g > 80) {
      // green-ish → dark gray
      d[i] = d[i+1] = d[i+2] = 65;
    }
  }
  ctx.putImageData(id, 0, 0);
  tex.image = cvs;
  tex.needsUpdate = true;
}
const buildingMeshes = [];
const buildingData   = []; // { cx, cz, xzRadius, maxY, meshes } per building

let totalAssets  = BUILDING_FILES.length + TREE_FILES.length + 5; // +2 for fly + float hero, +1 for Inferno, +1 for Icicle, +1 for Foliage
let loadedAssets = 0;

function onAssetLoaded() {
  loadedAssets++;
  const pct = 20 + Math.round((loadedAssets / totalAssets) * 60);
  setLoadProgress(pct, `LOADING ASSETS... ${loadedAssets}/${totalAssets}`);
}

const buildingPromises = BUILDING_FILES.map(name =>
  new Promise(resolve => {
    gltfLoader.load(`${ASSETS_PATH}${name}.glb`,
      gltf => {
        const root = gltf.scene;
        root.scale.setScalar(28);
        root.traverse(child => {
          if (child.isMesh) {
            child.castShadow    = false;
            child.receiveShadow = false;
            if (child.material) {
              const old = child.material;
              if (old.map) recolorTexture(old.map);
              child.material = new THREE.MeshLambertMaterial({
                map:         old.map         || null,
                color:       old.color       || new THREE.Color(1, 1, 1),
                transparent: old.transparent || false,
                alphaTest:   old.alphaTest   || 0,
              });
              old.dispose();
            }
          }
        });
        buildingGLBs.push(root);
        onAssetLoaded();
        resolve();
      },
      undefined,
      () => { onAssetLoaded(); resolve(); }
    );
  })
);

const treePromises = TREE_FILES.map(name =>
  new Promise(resolve => {
    gltfLoader.load(`${ASSETS_PATH}${name}.glb`,
      gltf => {
        const root = gltf.scene;
        root.scale.setScalar(10);
        root.traverse(child => {
          if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; }
        });
        treesGLBs.push(root);
        onAssetLoaded();
        resolve();
      },
      undefined,
      () => { onAssetLoaded(); resolve(); }
    );
  })
);

// ─────────────────────────────────────────────
//  HERO GROUP
// ─────────────────────────────────────────────
const hero = new THREE.Group();
scene.add(hero);
hero.position.set(0, 100, 0);

// ─────────────────────────────────────────────
//  INFERNO GROUP
// ─────────────────────────────────────────────
const inferno = new THREE.Group();
scene.add(inferno);
inferno.position.set(300, 150, -400);

// ─────────────────────────────────────────────
//  ICICLE GROUP
// ─────────────────────────────────────────────
const icicle = new THREE.Group();
scene.add(icicle);
icicle.position.set(-300, 150, 400);

// ─────────────────────────────────────────────
//  FOLIAGE GROUP
// ─────────────────────────────────────────────
const foliage = new THREE.Group();
scene.add(foliage);
foliage.position.set(0, 150, 500);

let flyModel   = null;  // Thunderclap (1).glb  — shown while flying
let floatModel = null;  // Thunderclap2.glb     — shown while hovering

// ── Shared helper: orient a loaded GLB for flying pose ──
function orientModelForFlight(model) {
  const box0   = new THREE.Box3().setFromObject(model);
  const size0  = box0.getSize(new THREE.Vector3());
  const maxDim = Math.max(size0.x, size0.y, size0.z);
  model.scale.setScalar(5 / maxDim);

  model.rotation.order = 'ZXY';
  model.rotation.x = -Math.PI / 2 - 0.1; // slight left tilt for level flight
  model.rotation.z = -Math.PI / 2;

  const box1   = new THREE.Box3().setFromObject(model);
  const centre = box1.getCenter(new THREE.Vector3());
  model.position.sub(centre);

  model.traverse(child => {
    if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; }
  });
}

// ── Fly model (Thunderclap (1).glb) ──
const heroFlyPromise = new Promise(resolve => {
  gltfLoader.load('assets/Thunderclap (1).glb',
    gltf => {
      flyModel = gltf.scene;
      orientModelForFlight(flyModel);
      flyModel.visible = true;
      hero.add(flyModel);
      onAssetLoaded();
      resolve();
    },
    undefined,
    err => {
      console.warn('Fly model failed, using placeholder:', err);
      flyModel = buildPlaceholderHero();
      flyModel.visible = true;
      onAssetLoaded();
      resolve();
    }
  );
});

// ── Float model (Thunderclap2.glb) ──
const heroFloatPromise = new Promise(resolve => {
  gltfLoader.load('assets/Thunderclap2.glb',
    gltf => {
      floatModel = gltf.scene;
      // Float model stays upright — just scale and centre it
      const box0   = new THREE.Box3().setFromObject(floatModel);
      const size0  = box0.getSize(new THREE.Vector3());
      const maxDim = Math.max(size0.x, size0.y, size0.z);
      floatModel.scale.setScalar(5 / maxDim);

      const box1   = new THREE.Box3().setFromObject(floatModel);
      const centre = box1.getCenter(new THREE.Vector3());
      floatModel.position.sub(centre);

      floatModel.traverse(child => {
        if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; }
      });

      // Model faces +X natively; rotate +90° around Y so back (-X) faces camera (+Z)
      floatModel.rotation.set(0, Math.PI / 2, 0);

      floatModel.visible = false;
      hero.add(floatModel);
      onAssetLoaded();
      resolve();
    },
    undefined,
    err => {
      console.warn('Float model (Thunderclap2.glb) not found, reusing fly model for hover.');
      // Graceful fallback: just use a copy of the placeholder
      floatModel = buildPlaceholderHero();
      floatModel.visible = false;
      onAssetLoaded();
      resolve();
    }
  );
});

function buildPlaceholderModel(parent, bodyColor, accentColor, accentEmissive) {
  const group     = new THREE.Group();
  const bodyMat   = new THREE.MeshLambertMaterial({ color: bodyColor });
  const accentMat = new THREE.MeshLambertMaterial({ color: accentColor, emissive: accentEmissive });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 2.4), bodyMat);
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.65, 16, 12), bodyMat);
  head.position.set(0, 0.2, -1.9);
  group.add(head);

  [-1.9, 1.9].forEach(x => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.45), bodyMat);
    arm.position.set(x, 0, 0);
    group.add(arm);
  });

  [-0.45, 0.45].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.8), bodyMat);
    leg.position.set(x, 0, 2.0);
    group.add(leg);
  });

  const accent = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.0), accentMat);
  accent.position.set(0.2, -0.52, 0);
  group.add(accent);

  parent.add(group);
  return group;
}

function buildPlaceholderHero() {
  return buildPlaceholderModel(hero, 0x2255aa, 0x00cfff, 0x006688);
}

let infernoModel = null;
const infernoModelPromise = new Promise(resolve => {
  gltfLoader.load('assets/Inferno.glb',
    gltf => {
      infernoModel = gltf.scene;
      orientModelForFlight(infernoModel);
      inferno.add(infernoModel);
      onAssetLoaded();
      resolve();
    },
    undefined,
    err => {
      console.warn('Inferno.glb failed, using placeholder:', err);
      infernoModel = buildPlaceholderModel(inferno, 0xaa1111, 0xff6600, 0x992200);
      onAssetLoaded();
      resolve();
    }
  );
});

const infernoFireGlow = new THREE.PointLight(0xff4400, 3, 40);
inferno.add(infernoFireGlow);

let icicleModel = null;
const icicleModelPromise = new Promise(resolve => {
  gltfLoader.load('assets/Icicle.glb',
    gltf => {
      icicleModel = gltf.scene;
      orientModelForFlight(icicleModel);
      icicle.add(icicleModel);
      onAssetLoaded();
      resolve();
    },
    undefined,
    err => {
      console.warn('Icicle.glb failed, using placeholder:', err);
      icicleModel = buildPlaceholderModel(icicle, 0x88ccee, 0xaaeeff, 0x224466);
      onAssetLoaded();
      resolve();
    }
  );
});

const icicleIceGlow = new THREE.PointLight(0x88ddff, 3, 40);
icicle.add(icicleIceGlow);

let foliageModel = null;
const foliageModelPromise = new Promise(resolve => {
  gltfLoader.load('assets/Foliage.glb',
    gltf => {
      foliageModel = gltf.scene;
      orientModelForFlight(foliageModel);
      foliage.add(foliageModel);
      onAssetLoaded();
      resolve();
    },
    undefined,
    err => {
      console.warn('Foliage.glb failed, using placeholder:', err);
      foliageModel = buildPlaceholderModel(foliage, 0x1a6600, 0x44cc00, 0x113300);
      onAssetLoaded();
      resolve();
    }
  );
});

const foliageVineGlow = new THREE.PointLight(0x44cc00, 3, 40);
foliage.add(foliageVineGlow);

// ─────────────────────────────────────────────
//  TRAILS  (3 layered lines per entity for thickness + glow)
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

// Per-trail config: [color, opacity]
const TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // bright white core
  [0x88eeff, 0.85],  // cyan mid
  [0x2299ff, 0.65],  // blue outer
];

const { bufs: trailBufs, lines: trailLines } = makeTrail(TRAIL_CONFIGS, 0, 100, 0);

// Persistent electric glow that follows the hero
const heroElectricGlow = new THREE.PointLight(0x55ccff, 4, 40);
hero.add(heroElectricGlow);

let trailTick = 0; // counts frames, used to control jitter frequency

// FIRE TRAIL  (Inferno — orange / red glow)
const FIRE_TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // white core
  [0xff8822, 0.85],  // orange mid
  [0xff2200, 0.65],  // red outer
];
const { bufs: fireTrailBufs, lines: fireTrailLines } = makeTrail(FIRE_TRAIL_CONFIGS, 300, 150, -400);

// VINE TRAIL  (Foliage — dark / bright green)
const VINE_TRAIL_CONFIGS = [
  [0x88ff44, 1.0],   // bright green core
  [0x2d9900, 0.85],  // mid green
  [0x0d5500, 0.65],  // dark green outer
];
const { bufs: vineTrailBufs, lines: vineTrailLines } = makeTrail(VINE_TRAIL_CONFIGS, 0, 150, 500);

// ICE TRAIL  (Icicle — white / light-blue glow)
const ICE_TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // white core
  [0xaaeeff, 0.85],  // light blue mid
  [0x55ccff, 0.65],  // cyan-blue outer
];
const { bufs: iceTrailBufs, lines: iceTrailLines } = makeTrail(ICE_TRAIL_CONFIGS, -300, 150, 400);

// ─────────────────────────────────────────────
//  CITY PLACEMENT
// ─────────────────────────────────────────────
function buildCity() {
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

    const s = 0.85 + Math.random() * 0.55;
    building.scale.multiplyScalar(s);

    if (isSkyscraper) building.scale.y *= 4 + Math.random() * 5;

    scene.add(building);

    const bMeshes = [];
    building.traverse(child => { if (child.isMesh) bMeshes.push(child); });
    const bbox = new THREE.Box3().setFromObject(building);
    const bcx = (bbox.min.x + bbox.max.x) / 2, bcz = (bbox.min.z + bbox.max.z) / 2;
    const bdx = bbox.max.x - bbox.min.x, bdz = bbox.max.z - bbox.min.z;
    buildingData.push({ cx: bcx, cz: bcz, xzRadius: Math.sqrt(bdx * bdx + bdz * bdz) / 2, maxY: bbox.max.y, meshes: bMeshes });
    if (buildingMeshes.length < 300) buildingMeshes.push(...bMeshes);

    if (treesGLBs.length > 0 && Math.random() < 0.18) {
      const tree = treesGLBs[Math.floor(Math.random() * treesGLBs.length)].clone(true);
      const ta   = Math.random() * Math.PI * 2;
      const td   = 45 + Math.random() * 15;
      tree.position.set(x + Math.cos(ta) * td, 0, z + Math.sin(ta) * td);
      tree.rotation.y = Math.random() * Math.PI * 2;
      scene.add(tree);
    }
  }
}

// ─────────────────────────────────────────────
//  COMBAT STATE
// ─────────────────────────────────────────────
const HERO_MAX_HEALTH       = 100;
const HERO_AI_SPEED         = 38;
const HERO_CHASE_RANGE      = 350;
const HERO_ATTACK_RANGE     = 130;
const HERO_FIRE_COOLDOWN    = 0.055;
const INFERNO_MAX_HEALTH    = 100;
const INFERNO_AI_SPEED      = 38;
const INFERNO_CHASE_RANGE   = 350;
const INFERNO_ATTACK_RANGE  = 130;
const INFERNO_FIRE_COOLDOWN = 0.10;  // seconds between shots (continuous stream)
const INFERNO_FIRE_DAMAGE   = 3;    // damage per firebolt hit (reduced since firing rapidly)
const LIGHTNING_DAMAGE      = 18;   // damage per lightning hit (player-controlled)
const LIGHTNING_DAMAGE_AI   = 3;    // damage when Thunderclap is AI-controlled (matches villain damage)

const ICICLE_MAX_HEALTH    = 100;
const ICICLE_AI_SPEED      = 38;
const ICICLE_CHASE_RANGE   = 350;
const ICICLE_ATTACK_RANGE  = 130;
const ICICLE_FIRE_COOLDOWN = 0.10;
const ICICLE_BEAM_DAMAGE   = 3;

const FOLIAGE_MAX_HEALTH    = 100;
const FOLIAGE_AI_SPEED      = 38;
const FOLIAGE_CHASE_RANGE   = 350;
const FOLIAGE_ATTACK_RANGE  = 130;
const FOLIAGE_FIRE_COOLDOWN = 0.10;
const FOLIAGE_VINE_DAMAGE   = 3;

let heroHealth    = HERO_MAX_HEALTH;
let infernoHealth = INFERNO_MAX_HEALTH;
let icicleHealth  = ICICLE_MAX_HEALTH;

let heroDefeated        = false;
let heroDefeatedTimer   = 0;
let heroDefeatedVelY    = 0;
let heroRespawning      = false;

let heroAIState        = 'patrol';   // 'patrol' | 'chase' | 'attack'
let heroAttackTarget   = 'inferno';  // 'inferno' | 'icicle' | 'foliage'
const heroWaypoint     = new THREE.Vector3(0, 100, 0);
let   heroWaypointTimer   = 0;
let   heroAIYaw           = 0;
let   heroAIPitch         = 0;
let   heroFireCooldown    = 0;
let   heroBoltGroup       = null;
let   heroBoltTimer       = 0;

let infernoState         = 'patrol';  // 'patrol' | 'chase' | 'attack' | 'defeated'
let infernoAttackTarget  = 'hero';    // 'hero' | 'icicle'
const infernoWaypoint    = new THREE.Vector3(300, 150, -400);
let   infernoWaypointTimer  = 0;
let   infernoAIYaw          = 0;
let   infernoAIPitch        = 0;
let   infernoFireCooldown   = 0;
let   infernoBoltGroup      = null;
let   infernoBoltTimer      = 0;
let   infernoDefeatedTimer  = 0;
let   infernoDefeatedVelY   = 0;
let   infernoRespawning     = false;

let icicleState         = 'patrol';  // 'patrol' | 'chase' | 'attack' | 'defeated'
let icicleAttackTarget  = 'hero';    // 'hero' | 'inferno' | 'foliage'
const icicleWaypoint    = new THREE.Vector3(-300, 150, 400);
let   icicleWaypointTimer  = 0;
let   icicleAIYaw          = 0;
let   icicleAIPitch        = 0;
let   icicleFireCooldown   = 0;
let   icicleBoltGroup      = null;
let   icicleBoltTimer      = 0;
let   icicleDefeatedTimer  = 0;
let   icicleDefeatedVelY   = 0;
let   icicleRespawning     = false;

let foliageState         = 'patrol';  // 'patrol' | 'chase' | 'attack' | 'defeated'
let foliageAttackTarget  = 'hero';    // 'hero' | 'inferno' | 'icicle'
const foliageWaypoint    = new THREE.Vector3(0, 150, 500);
let   foliageWaypointTimer  = 0;
let   foliageAIYaw          = 0;
let   foliageAIPitch        = 0;
let   foliageFireCooldown   = 0;
let   foliageBoltGroup      = null;
let   foliageBoltTimer      = 0;
let   foliageDefeatedTimer  = 0;
let   foliageDefeatedVelY   = 0;
let   foliageRespawning     = false;
let   foliageHealth         = FOLIAGE_MAX_HEALTH;

const heroHealthFill    = document.getElementById('hero-health-fill');
const infernoHealthFill = document.getElementById('inferno-health-fill');
const icicleHealthFill  = document.getElementById('icicle-health-fill');
const foliageHealthFill = document.getElementById('foliage-health-fill');
const combatMessage     = document.getElementById('combat-message');

// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyH') toggleFloat();
  if (e.code === 'KeyB' && !isPlayerDefeated()) yawAngle += Math.PI;
  if (e.code === 'Digit1') switchCharacter(1);
  if (e.code === 'Digit2') switchCharacter(2);
  if (e.code === 'Digit3') switchCharacter(3);
  if (e.code === 'Digit4') switchCharacter(4);
  e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ─────────────────────────────────────────────
//  CHARACTER SELECT
// ─────────────────────────────────────────────
let playerChar  = 'hero'; // 'hero' | 'inferno' | 'icicle' | 'foliage'
let playerGroup = hero;   // reference to whichever group the player controls

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

function isPlayerDefeated() {
  switch (playerChar) {
    case 'hero':    return heroDefeated;
    case 'inferno': return infernoState === 'defeated';
    case 'icicle':  return icicleState  === 'defeated';
    case 'foliage': return foliageState === 'defeated';
  }
  return false;
}

function switchCharacter(n) {
  const names  = ['hero', 'inferno', 'icicle', 'foliage'];
  const groups = [hero, inferno, icicle, foliage];
  const idx = n - 1;
  if (idx < 0 || idx > 3) return;
  const newChar = names[idx];
  if (playerChar === newChar) return;

  playerChar  = newChar;
  playerGroup = groups[idx];

  // Inherit new character's current orientation
  const euler = new THREE.Euler().setFromQuaternion(playerGroup.quaternion, 'YXZ');
  yawAngle   = euler.y;
  pitchAngle = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x));

  // Snap camera to new character
  camCurrentPos.copy(playerGroup.position).add(new THREE.Vector3(0, 2, 20));
  camCurrentLook.copy(playerGroup.position);

  // Update title badge
  document.getElementById('title-badge').textContent = CHAR_LABELS[playerChar];

  // Highlight the active character's health bar
  ['hero-health-hud', 'inferno-health-hud', 'icicle-health-hud', 'foliage-health-hud'].forEach((id, i) => {
    document.getElementById(id).classList.toggle('player-controlled', i === idx);
  });

  showCombatMessage(`NOW PLAYING AS ${CHAR_LABELS[playerChar]}!`, CHAR_COLORS[playerChar], 2500);
}

function firePlayerWeapon(superBoosting = false) {
  switch (playerChar) {
    case 'hero':    fireLightning(superBoosting); break;
    case 'inferno': fireFirebolt(true); break;
    case 'icicle':  fireIcebolt(true); break;
    case 'foliage': fireVines(true); break;
  }
}

// ─────────────────────────────────────────────
//  FLOAT MODE
// ─────────────────────────────────────────────
let isFloating   = false;
let staminaDepleted = false;          // true while forced into hover due to empty stamina
let wasFloatingBeforeDepletion = false; // remember pre-depletion hover state
const floatBtn   = document.getElementById('float-btn');

function toggleFloat() {
  // Block leaving hover while stamina is depleted
  if (staminaDepleted && isFloating) return;

  isFloating = !isFloating;

  if (playerChar === 'hero') {
    if (flyModel)   flyModel.visible   = !isFloating;
    if (floatModel) floatModel.visible =  isFloating;
  }

  floatBtn.textContent = isFloating ? '⏸ HOVER' : '▶ FLY';
  floatBtn.className   = isFloating ? 'hover-mode' : 'fly-mode';

  // Level out pitch so hover looks natural
  if (isFloating) pitchAngle = 0;
}

floatBtn.addEventListener('click', toggleFloat);

// ─────────────────────────────────────────────
//  FLIGHT PHYSICS
// ─────────────────────────────────────────────
const BASE_SPEED       = 40;
const BOOST_MULT       = 2.5;
const SUPER_BOOST_MULT = 10.0;
const PITCH_RATE = 1.2;
const YAW_RATE   = 0.9;
const MAX_PITCH  = Math.PI / 2.2;
const CAM_LERP   = 0.06;

let pitchAngle = 0;
let yawAngle   = 0;


const camCurrentPos  = new THREE.Vector3();
const camCurrentLook = new THREE.Vector3();

// Reusable per-frame objects (zero allocations in animate)
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
const STAMINA_DRAIN       = 0.18;  // per second while boosting
const STAMINA_REGEN       = 0.12;  // per second while flying normally
const STAMINA_HOVER_REGEN = 0.45;  // per second while hovering

let stamina = 1.0;

const staminaFill = document.getElementById('stamina-fill');

// ─────────────────────────────────────────────
//  LIGHTNING  (continuous stream while F held)
// ─────────────────────────────────────────────
const raycaster        = new THREE.Raycaster();
let   boltGroup        = null;  // THREE.Group holding all bolt lines

// ── Mesh-accurate building collision ──
const colRaycaster   = new THREE.Raycaster();
const HERO_COL_RADIUS = 2;
const COL_DIRS = [
  new THREE.Vector3( 1, 0,  0), new THREE.Vector3(-1, 0,  0),
  new THREE.Vector3( 0, 0,  1), new THREE.Vector3( 0, 0, -1),
  new THREE.Vector3( 0.707, 0,  0.707), new THREE.Vector3(-0.707, 0,  0.707),
  new THREE.Vector3( 0.707, 0, -0.707), new THREE.Vector3(-0.707, 0, -0.707),
];

function heroHitsBuilding(pos) {
  for (const bd of buildingData) {
    if (pos.y > bd.maxY + HERO_COL_RADIUS) continue;
    const dx = pos.x - bd.cx, dz = pos.z - bd.cz;
    const threshold = bd.xzRadius + HERO_COL_RADIUS;
    if (dx * dx + dz * dz > threshold * threshold) continue;
    colRaycaster.far = HERO_COL_RADIUS;
    for (const dir of COL_DIRS) {
      colRaycaster.set(pos, dir);
      if (colRaycaster.intersectObjects(bd.meshes, false).length > 0) return true;
    }
  }
  return false;
}
let   boltTimer        = 0;
let   lightningCooldown = 0;
const BOLT_DURATION    = 0.10;
const BOLT_COOLDOWN    = 0.055;

// Bolt layers: [color, jitter multiplier] — white core + progressively wider cyan/blue
const BOLT_LAYERS = [
  [0xffffff, 0.3],
  [0x88ddff, 0.8],
  [0x44aaff, 1.4],
  [0x2266ff, 2.0],
];

function fireLightning(superBoosting = false) {
  _fwd.set(0, 0, -1).applyQuaternion(hero.quaternion).normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(hero.quaternion);
  const origin     = hero.position.clone().add(handOffset);

  raycaster.set(origin, _fwd);
  const hits     = raycaster.intersectObjects(buildingMeshes, false);
  const endPoint = hits.length > 0
    ? hits[0].point.clone()
    : origin.clone().addScaledVector(_fwd, 400);

  if (boltGroup) { scene.remove(boltGroup); boltGroup = null; }

  const boltScale = superBoosting ? 17.5 : 1.0;
  boltGroup = new THREE.Group();
  // Super boost adds 4 extra thick outer layers for massive width
  const layers = superBoosting
    ? [...BOLT_LAYERS,
       [0x44aaff, 3.0], [0x2266ff, 4.2], [0x0033cc, 5.8], [0x001888, 7.5]]
    : BOLT_LAYERS;
  for (const [color, jitterMult] of layers) {
    const pts  = buildJaggedLine(origin, endPoint, 18, 3.5 * jitterMult * boltScale);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 })
    );
    boltGroup.add(line);
  }
  boltTimer = BOLT_DURATION;
  scene.add(boltGroup);

  // Check if bolt hits Inferno
  if (infernoState !== 'defeated' && infernoHealth > 0 &&
      distToSegment(origin, endPoint, inferno.position) < 9) {
    takeDamage('inferno', LIGHTNING_DAMAGE);
  }
  // Check if bolt hits Icicle
  if (icicleState !== 'defeated' && icicleHealth > 0 &&
      distToSegment(origin, endPoint, icicle.position) < 9) {
    takeDamage('icicle', LIGHTNING_DAMAGE);
  }
  // Check if bolt hits Foliage
  if (foliageState !== 'defeated' && foliageHealth > 0 &&
      distToSegment(origin, endPoint, foliage.position) < 9) {
    takeDamage('foliage', LIGHTNING_DAMAGE);
  }

  const impactStr = superBoosting ? 180 : 60;
  const impactRng = superBoosting ? 350 : 150;
  const impact = new THREE.PointLight(0x88ddff, impactStr, impactRng);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), superBoosting ? 200 : 120);

  const muzzleStr = superBoosting ? 220 : 80;
  const muzzleRng = superBoosting ? 130 : 50;
  const muzzle = new THREE.PointLight(0xffffff, muzzleStr, muzzleRng);
  muzzle.position.copy(origin);
  scene.add(muzzle);
  setTimeout(() => scene.remove(muzzle), superBoosting ? 140 : 80);
}

function buildJaggedLine(from, to, segments, maxOffset) {
  const pts = [from.clone()];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(from, to, t);
    p.x += (Math.random() - 0.5) * maxOffset * 2;
    p.y += (Math.random() - 0.5) * maxOffset * 2;
    p.z += (Math.random() - 0.5) * maxOffset * 2;
    pts.push(p);
    if (Math.random() < 0.3 && i < segments - 3) {
      const forkEnd = to.clone().add(new THREE.Vector3(
        (Math.random()-0.5)*40, (Math.random()-0.5)*40, (Math.random()-0.5)*40
      ));
      buildJaggedLine(p.clone(), forkEnd, 5, maxOffset * 0.5).forEach(fp => pts.push(fp));
      pts.push(p.clone());
    }
  }
  pts.push(to.clone());
  return pts;
}

// ─────────────────────────────────────────────
//  INFERNO COMBAT FUNCTIONS
// ─────────────────────────────────────────────

// Returns shortest distance from point p to line segment a→b
function distToSegment(a, b, p) {
  const ab   = new THREE.Vector3().subVectors(b, a);
  const len2 = ab.lengthSq();
  if (len2 === 0) return a.distanceTo(p);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / len2));
  return new THREE.Vector3().copy(a).addScaledVector(ab, t).distanceTo(p);
}

function showCombatMessage(text, color, ms = 0) {
  combatMessage.textContent = text;
  combatMessage.style.color = color;
  combatMessage.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
  combatMessage.classList.add('visible');
  if (ms > 0) setTimeout(hideCombatMessage, ms);
}

function hideCombatMessage() {
  combatMessage.classList.remove('visible');
}

function takeDamage(target, amount) {
  if (target === 'hero') {
    if (heroHealth <= 0 || heroDefeated) return;
    heroHealth = Math.max(0, heroHealth - amount);
    heroHealthFill.style.width = (heroHealth / HERO_MAX_HEALTH * 100) + '%';
    if (heroHealth <= 0) {
      heroDefeated       = true;
      heroDefeatedTimer  = 4.0;
      heroDefeatedVelY   = 10;
      showCombatMessage('THUNDERCLAP IS DOWN!', '#1144cc', 4000);
    }
  } else if (target === 'inferno') {
    if (infernoHealth <= 0 || infernoState === 'defeated') return;
    infernoHealth = Math.max(0, infernoHealth - amount);
    infernoHealthFill.style.width = (infernoHealth / INFERNO_MAX_HEALTH * 100) + '%';
    if (infernoHealth <= 0) {
      infernoState        = 'defeated';
      infernoDefeatedTimer = 4.0;
      infernoDefeatedVelY  = 10;
      showCombatMessage('INFERNO DEFEATED!', '#ff3300', 4000);
    }
  } else if (target === 'icicle') {
    if (icicleHealth <= 0 || icicleState === 'defeated') return;
    icicleHealth = Math.max(0, icicleHealth - amount);
    icicleHealthFill.style.width = (icicleHealth / ICICLE_MAX_HEALTH * 100) + '%';
    if (icicleHealth <= 0) {
      icicleState        = 'defeated';
      icicleDefeatedTimer = 4.0;
      icicleDefeatedVelY  = 10;
      showCombatMessage('ICICLE DEFEATED!', '#aaeeff', 4000);
    }
  } else if (target === 'foliage') {
    if (foliageHealth <= 0 || foliageState === 'defeated') return;
    foliageHealth = Math.max(0, foliageHealth - amount);
    foliageHealthFill.style.width = (foliageHealth / FOLIAGE_MAX_HEALTH * 100) + '%';
    if (foliageHealth <= 0) {
      foliageState        = 'defeated';
      foliageDefeatedTimer = 4.0;
      foliageDefeatedVelY  = 10;
      showCombatMessage('FOLIAGE DEFEATED!', '#44cc00', 4000);
    }
  }
}

// Particle layers for the fire bolt — innermost to outermost
// [color, pointSize, particleCount, radialSpread]
const FIRE_PARTICLE_LAYERS = [
  [0xffffff, 6,  30,  1.5 ],  // white-hot core
  [0xffee55, 11, 60,  4.0 ],  // yellow
  [0xff7700, 18, 100, 8.0 ],  // orange
  [0xff2200, 26, 80,  13.0],  // red
  [0x771100, 34, 45,  18.0],  // dark ember
];

function fireFirebolt(fromPlayer = false) {
  // Shoot forward in Inferno's facing direction, just like Thunderclap's lightning
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(inferno.quaternion);

  // Spread — Inferno is inaccurate, especially at range
  boltDir.x += (Math.random() - 0.5) * 0.35;
  boltDir.y += (Math.random() - 0.5) * 0.28;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(inferno.quaternion);
  const origin     = inferno.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  // Clip bolt at buildings and block damage if a building is in the way
  raycaster.set(origin, boltDir);
  const bHits   = raycaster.intersectObjects(buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  // Hit check — hero priority, then whichever enemy inferno is targeting
  if (fromPlayer) {
    // Player-controlled: hit any target in path (except self)
    if (!blocked && !heroDefeated && playerChar !== 'hero' &&
        distToSegment(origin, endPoint, hero.position) < 9)
      takeDamage('hero', INFERNO_FIRE_DAMAGE);
    if (!blocked && icicleState !== 'defeated' && playerChar !== 'icicle' &&
        distToSegment(origin, endPoint, icicle.position) < 9)
      takeDamage('icicle', INFERNO_FIRE_DAMAGE);
    if (!blocked && foliageState !== 'defeated' && playerChar !== 'foliage' &&
        distToSegment(origin, endPoint, foliage.position) < 9)
      takeDamage('foliage', INFERNO_FIRE_DAMAGE);
  } else {
    // AI-controlled: use target priority; target 'hero' means playerGroup
    if (!blocked && infernoAttackTarget === 'hero' && distToSegment(origin, endPoint, playerGroup.position) < 9) {
      takeDamage(playerChar, INFERNO_FIRE_DAMAGE);
    } else if (!blocked && infernoAttackTarget === 'icicle' && icicleState !== 'defeated' &&
               distToSegment(origin, endPoint, icicle.position) < 9) {
      takeDamage('icicle', INFERNO_FIRE_DAMAGE);
    } else if (!blocked && infernoAttackTarget === 'foliage' && foliageState !== 'defeated' &&
               distToSegment(origin, endPoint, foliage.position) < 9) {
      takeDamage('foliage', INFERNO_FIRE_DAMAGE);
    }
  }

  // ── Particle-cloud fire bolt (no lines) ──
  const boltLen = origin.distanceTo(endPoint);

  const _up    = Math.abs(boltDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp1  = new THREE.Vector3().crossVectors(boltDir, _up).normalize();
  const perp2  = new THREE.Vector3().crossVectors(boltDir, perp1).normalize();

  if (infernoBoltGroup) { scene.remove(infernoBoltGroup); infernoBoltGroup = null; }
  infernoBoltGroup = new THREE.Group();

  for (const [color, ptSize, count, spread] of FIRE_PARTICLE_LAYERS) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t        = Math.random();
      // Bell-shaped envelope: dense in the middle, thin at both ends
      const envelope = Math.sin(t * Math.PI);
      const s        = spread * envelope;

      const p = new THREE.Vector3().copy(origin).addScaledVector(boltDir, t * boltLen);
      p.addScaledVector(perp1, (Math.random() - 0.5) * s * 2);
      p.addScaledVector(perp2, (Math.random() - 0.5) * s * 2);
      p.y += Math.random() * s * 0.45;   // fire rises upward

      pos[i * 3]     = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    infernoBoltGroup.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color, size: ptSize, sizeAttenuation: true,
                                  transparent: true, opacity: 0.88 })
    ));
  }

  infernoBoltTimer = 0.12;
  scene.add(infernoBoltGroup);

  const impact = new THREE.PointLight(0xff5500, 90, 180);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), 200);

  const muzzle = new THREE.PointLight(0xff9900, 80, 60);
  muzzle.position.copy(origin);
  scene.add(muzzle);
  setTimeout(() => scene.remove(muzzle), 120);
}

// ─────────────────────────────────────────────
//  ICICLE COMBAT FUNCTIONS
// ─────────────────────────────────────────────

const ICE_PARTICLE_LAYERS = [
  [0xffffff, 6,  30,  1.5 ],  // pure white core
  [0xe8f8ff, 11, 60,  4.0 ],  // near-white
  [0xaaeeff, 18, 100, 8.0 ],  // light blue
  [0x55ccff, 26, 80,  13.0],  // cyan-blue
  [0x2299cc, 34, 45,  18.0],  // deeper blue outer
];

function fireIcebolt(fromPlayer = false) {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(icicle.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.35;
  boltDir.y += (Math.random() - 0.5) * 0.28;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(icicle.quaternion);
  const origin     = icicle.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  raycaster.set(origin, boltDir);
  const bHits   = raycaster.intersectObjects(buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  // Hit check — hero priority, then whichever enemy icicle is targeting
  if (fromPlayer) {
    // Player-controlled: hit any target in path (except self)
    if (!blocked && !heroDefeated && playerChar !== 'hero' &&
        distToSegment(origin, endPoint, hero.position) < 9)
      takeDamage('hero', ICICLE_BEAM_DAMAGE);
    if (!blocked && infernoState !== 'defeated' && playerChar !== 'inferno' &&
        distToSegment(origin, endPoint, inferno.position) < 9)
      takeDamage('inferno', ICICLE_BEAM_DAMAGE);
    if (!blocked && foliageState !== 'defeated' && playerChar !== 'foliage' &&
        distToSegment(origin, endPoint, foliage.position) < 9)
      takeDamage('foliage', ICICLE_BEAM_DAMAGE);
  } else {
    // AI-controlled: use target priority; target 'hero' means playerGroup
    if (!blocked && icicleAttackTarget === 'hero' && distToSegment(origin, endPoint, playerGroup.position) < 9) {
      takeDamage(playerChar, ICICLE_BEAM_DAMAGE);
    } else if (!blocked && icicleAttackTarget === 'inferno' && infernoState !== 'defeated' &&
               distToSegment(origin, endPoint, inferno.position) < 9) {
      takeDamage('inferno', ICICLE_BEAM_DAMAGE);
    } else if (!blocked && icicleAttackTarget === 'foliage' && foliageState !== 'defeated' &&
               distToSegment(origin, endPoint, foliage.position) < 9) {
      takeDamage('foliage', ICICLE_BEAM_DAMAGE);
    }
  }

  const boltLen = origin.distanceTo(endPoint);
  const _up    = Math.abs(boltDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp1  = new THREE.Vector3().crossVectors(boltDir, _up).normalize();
  const perp2  = new THREE.Vector3().crossVectors(boltDir, perp1).normalize();

  if (icicleBoltGroup) { scene.remove(icicleBoltGroup); icicleBoltGroup = null; }
  icicleBoltGroup = new THREE.Group();

  for (const [color, ptSize, count, spread] of ICE_PARTICLE_LAYERS) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t        = Math.random();
      const envelope = Math.sin(t * Math.PI);
      const s        = spread * envelope;

      const p = new THREE.Vector3().copy(origin).addScaledVector(boltDir, t * boltLen);
      p.addScaledVector(perp1, (Math.random() - 0.5) * s * 2);
      p.addScaledVector(perp2, (Math.random() - 0.5) * s * 2);

      pos[i * 3]     = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    icicleBoltGroup.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color, size: ptSize, sizeAttenuation: true,
                                  transparent: true, opacity: 0.88 })
    ));
  }

  icicleBoltTimer = 0.12;
  scene.add(icicleBoltGroup);

  const impact = new THREE.PointLight(0x88ddff, 90, 180);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), 200);

  const muzzle = new THREE.PointLight(0xaaeeff, 80, 60);
  muzzle.position.copy(origin);
  scene.add(muzzle);
  setTimeout(() => scene.remove(muzzle), 120);
}

// ─────────────────────────────────────────────
//  FOLIAGE COMBAT FUNCTIONS
// ─────────────────────────────────────────────

function fireVines(fromPlayer = false) {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(foliage.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.3;
  boltDir.y += (Math.random() - 0.5) * 0.22;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(foliage.quaternion);
  const origin     = foliage.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  raycaster.set(origin, boltDir);
  const bHits   = raycaster.intersectObjects(buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  // Hit check — hero priority, then whichever enemy foliage is targeting
  if (fromPlayer) {
    // Player-controlled: hit any target in path (except self)
    if (!blocked && !heroDefeated && playerChar !== 'hero' &&
        distToSegment(origin, endPoint, hero.position) < 9)
      takeDamage('hero', FOLIAGE_VINE_DAMAGE);
    if (!blocked && infernoState !== 'defeated' && playerChar !== 'inferno' &&
        distToSegment(origin, endPoint, inferno.position) < 9)
      takeDamage('inferno', FOLIAGE_VINE_DAMAGE);
    if (!blocked && icicleState !== 'defeated' && playerChar !== 'icicle' &&
        distToSegment(origin, endPoint, icicle.position) < 9)
      takeDamage('icicle', FOLIAGE_VINE_DAMAGE);
  } else {
    // AI-controlled: use target priority; target 'hero' means playerGroup
    if (!blocked && foliageAttackTarget === 'hero' && distToSegment(origin, endPoint, playerGroup.position) < 9) {
      takeDamage(playerChar, FOLIAGE_VINE_DAMAGE);
    } else if (!blocked && foliageAttackTarget === 'inferno' && infernoState !== 'defeated' &&
               distToSegment(origin, endPoint, inferno.position) < 9) {
      takeDamage('inferno', FOLIAGE_VINE_DAMAGE);
    } else if (!blocked && foliageAttackTarget === 'icicle' && icicleState !== 'defeated' &&
               distToSegment(origin, endPoint, icicle.position) < 9) {
      takeDamage('icicle', FOLIAGE_VINE_DAMAGE);
    }
  }

  const boltLen = origin.distanceTo(endPoint);
  const _up   = Math.abs(boltDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp1 = new THREE.Vector3().crossVectors(boltDir, _up).normalize();
  const perp2 = new THREE.Vector3().crossVectors(boltDir, perp1).normalize();

  if (foliageBoltGroup) { scene.remove(foliageBoltGroup); foliageBoltGroup = null; }
  foliageBoltGroup = new THREE.Group();

  // ── 4 snaking vine strands ──
  const STRAND_PTS = 48;
  const strandColors = [0x0d5500, 0x1a8800, 0x2dbb00, 0x66ee22];
  const strandSizes  = [14,       10,       7,        5      ];

  for (let s = 0; s < 4; s++) {
    const phase  = (s / 4) * Math.PI * 2;
    const freq   = 2.8 + Math.random() * 1.8;
    const amp    = 3.5 + Math.random() * 4.5;
    const pos    = new Float32Array(STRAND_PTS * 3);

    for (let i = 0; i < STRAND_PTS; i++) {
      const t  = i / (STRAND_PTS - 1);
      const taper = 1 - t * 0.45;           // vines thin slightly toward tip
      const s1 = Math.sin(t * Math.PI * freq + phase)        * amp * taper;
      const s2 = Math.cos(t * Math.PI * freq * 0.65 + phase) * amp * 0.55 * taper;

      const p = new THREE.Vector3()
        .copy(origin)
        .addScaledVector(boltDir, t * boltLen)
        .addScaledVector(perp1, s1)
        .addScaledVector(perp2, s2);

      pos[i * 3]     = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    foliageBoltGroup.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color: strandColors[s], size: strandSizes[s],
                                  sizeAttenuation: true, transparent: true, opacity: 0.94 })
    ));
  }

  // ── Scattered leaf-burst particles around the vines ──
  const leafCount = 60;
  const leafPos   = new Float32Array(leafCount * 3);
  for (let i = 0; i < leafCount; i++) {
    const t = Math.random();
    const p = new THREE.Vector3()
      .copy(origin)
      .addScaledVector(boltDir, t * boltLen)
      .addScaledVector(perp1, (Math.random() - 0.5) * 7)
      .addScaledVector(perp2, (Math.random() - 0.5) * 7);
    leafPos[i * 3]     = p.x;
    leafPos[i * 3 + 1] = p.y;
    leafPos[i * 3 + 2] = p.z;
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  foliageBoltGroup.add(new THREE.Points(leafGeo,
    new THREE.PointsMaterial({ color: 0x88ff44, size: 9, sizeAttenuation: true,
                                transparent: true, opacity: 0.72 })
  ));

  foliageBoltTimer = 0.15;
  scene.add(foliageBoltGroup);

  const impact = new THREE.PointLight(0x44cc00, 90, 180);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), 200);

  const muzzleF = new THREE.PointLight(0x88ff44, 80, 60);
  muzzleF.position.copy(origin);
  scene.add(muzzleF);
  setTimeout(() => scene.remove(muzzleF), 120);
}

function updateHeroDefeated(dt) {
  heroDefeatedTimer -= dt;
  heroDefeatedVelY  -= 90 * dt;
  hero.position.y   += heroDefeatedVelY * dt;

  // Stop at ground level
  if (hero.position.y < 1) {
    hero.position.y  = 1;
    heroDefeatedVelY = 0;
  }

  hero.rotation.z   += 3.0 * dt;
  hero.rotation.x   += 1.5 * dt;

  if (heroDefeatedTimer <= 0 && !heroRespawning) {
    hero.visible   = false;
    heroRespawning = true;
    setTimeout(() => {
      heroHealth = HERO_MAX_HEALTH;
      heroHealthFill.style.width = '100%';
      heroDefeated = false;
      hero.position.set(
        playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 150),
        120 + Math.random() * 60,
        playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 150)
      );
      hero.rotation.set(0, 0, 0);
      if (playerChar === 'hero') { pitchAngle = 0; yawAngle = 0; }
      hero.visible     = true;
      heroDefeatedVelY = 0;
      heroRespawning   = false;
      showCombatMessage('THUNDERCLAP RETURNS!', '#1144cc', 2500);
    }, 5000);
  }
}

// ── AI lightning for Thunderclap when not player-controlled (adds spread) ──
function fireLightningAI() {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(hero.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.3;
  boltDir.y += (Math.random() - 0.5) * 0.22;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(hero.quaternion);
  const origin     = hero.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  raycaster.set(origin, boltDir);
  const bHits   = raycaster.intersectObjects(buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  // Hit any target in path (hero AI never hits itself)
  if (!blocked && infernoState !== 'defeated' && infernoHealth > 0 &&
      distToSegment(origin, endPoint, inferno.position) < 9)
    takeDamage('inferno', LIGHTNING_DAMAGE_AI);
  if (!blocked && icicleState !== 'defeated' && icicleHealth > 0 &&
      distToSegment(origin, endPoint, icicle.position) < 9)
    takeDamage('icicle', LIGHTNING_DAMAGE_AI);
  if (!blocked && foliageState !== 'defeated' && foliageHealth > 0 &&
      distToSegment(origin, endPoint, foliage.position) < 9)
    takeDamage('foliage', LIGHTNING_DAMAGE_AI);
  // Hit the player if they aren't Thunderclap
  if (!blocked && playerChar !== 'hero' && !isPlayerDefeated() &&
      distToSegment(origin, endPoint, playerGroup.position) < 9)
    takeDamage(playerChar, LIGHTNING_DAMAGE_AI);

  if (heroBoltGroup) { scene.remove(heroBoltGroup); heroBoltGroup = null; }
  heroBoltGroup = new THREE.Group();
  for (const [color, jitterMult] of BOLT_LAYERS) {
    const pts  = buildJaggedLine(origin, endPoint, 18, 3.5 * jitterMult);
    heroBoltGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 })
    ));
  }
  heroBoltTimer = BOLT_DURATION;
  scene.add(heroBoltGroup);

  const impact = new THREE.PointLight(0x88ddff, 60, 150);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), 120);
}

function updateThunderclapAI(dt, t) {
  if (heroDefeated) { updateHeroDefeated(dt); return; }

  const distToInferno = infernoState !== 'defeated' ? hero.position.distanceTo(inferno.position) : Infinity;
  const distToIcicle  = icicleState  !== 'defeated' ? hero.position.distanceTo(icicle.position)  : Infinity;
  const distToFoliage = foliageState !== 'defeated' ? hero.position.distanceTo(foliage.position) : Infinity;
  const closestDist   = Math.min(distToInferno, distToIcicle, distToFoliage);
  const closestTarget = distToInferno <= distToIcicle && distToInferno <= distToFoliage ? 'inferno'
                      : distToIcicle  <= distToFoliage ? 'icicle' : 'foliage';

  if (closestDist < HERO_ATTACK_RANGE) {
    heroAIState = 'attack'; heroAttackTarget = closestTarget;
  } else if (closestDist < HERO_CHASE_RANGE) {
    heroAIState = 'chase';  heroAttackTarget = closestTarget;
  } else {
    heroAIState = 'patrol';
  }

  const heroChasePos = heroAttackTarget === 'inferno' ? inferno.position :
                       heroAttackTarget === 'icicle'  ? icicle.position  : foliage.position;

  let target;
  if (heroAIState === 'patrol') {
    heroWaypointTimer -= dt;
    if (heroWaypointTimer <= 0 || hero.position.distanceTo(heroWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      heroWaypoint.set(
        playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        playerGroup.position.z + Math.sin(angle) * radius
      );
      heroWaypointTimer = 4 + Math.random() * 6;
    }
    target = heroWaypoint;
  } else {
    target = heroChasePos;
  }

  // Steer toward target
  const toTarget    = new THREE.Vector3().subVectors(target, hero.position);
  const flatDist    = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  const targetYaw   = Math.atan2(-toTarget.x, -toTarget.z);
  const targetPitch = Math.atan2(toTarget.y, flatDist + 0.001);

  let dyaw = targetYaw - heroAIYaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  heroAIYaw   += dyaw * Math.min(1, 2.5 * dt);
  heroAIPitch += (targetPitch - heroAIPitch) * Math.min(1, 2.5 * dt);
  heroAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, heroAIPitch));

  const hPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), heroAIPitch);
  const hYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heroAIYaw);
  hero.quaternion.copy(hYaw).multiply(hPitch);

  // Move
  const heroAISpeedActual = heroAIState === 'attack' ? HERO_AI_SPEED * 0.35 : HERO_AI_SPEED;
  const hfwd = new THREE.Vector3(0, 0, -1).applyQuaternion(hero.quaternion);
  const heroDistToTarget = hero.position.distanceTo(heroChasePos);
  const tooClose = heroAIState === 'attack' && heroDistToTarget < HERO_ATTACK_RANGE * 0.55;
  const heroTentative = hero.position.clone().addScaledVector(hfwd, tooClose ? 0 : heroAISpeedActual * dt);
  heroTentative.y = Math.max(15, heroTentative.y);
  if (!heroHitsBuilding(heroTentative)) {
    hero.position.copy(heroTentative);
  } else {
    hero.position.y = Math.max(15, hero.position.y);
  }

  // Pulse electric glow
  heroElectricGlow.intensity = 3 + Math.sin(t * 9 + 0.5) * 1.8;

  // Fire lightning on cooldown while attacking
  heroFireCooldown -= dt;
  if (heroAIState === 'attack' && heroFireCooldown <= 0) {
    fireLightningAI();
    heroFireCooldown = HERO_FIRE_COOLDOWN;
  }
}

function updateInfernoAI(dt, t) {
  if (infernoState === 'defeated') {
    infernoDefeatedTimer -= dt;
    infernoDefeatedVelY  -= 90 * dt;
    inferno.position.y   += infernoDefeatedVelY * dt;
    inferno.rotation.z   += 3.0 * dt;
    inferno.rotation.x   += 1.5 * dt;

    if ((inferno.position.y < -80 || infernoDefeatedTimer <= 0) && !infernoRespawning) {
      inferno.visible   = false;
      infernoRespawning = true;
      setTimeout(() => {
        infernoHealth = INFERNO_MAX_HEALTH;
        infernoHealthFill.style.width = '100%';
        infernoState = 'patrol';
        inferno.position.set(
          playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        inferno.rotation.set(0, 0, 0);
        inferno.visible      = true;
        infernoDefeatedVelY  = 0;
        infernoRespawning    = false;
        showCombatMessage('INFERNO RETURNS!', '#ff3300', 2500);
      }, 8000);
    }
    return;
  }

  // Skip AI logic when the player is controlling Inferno
  if (playerChar === 'inferno') return;

  const distToHero    = inferno.position.distanceTo(playerGroup.position);
  const distToIcicle  = icicleState  !== 'defeated' ? inferno.position.distanceTo(icicle.position)  : Infinity;
  const distToFoliage = foliageState !== 'defeated' ? inferno.position.distanceTo(foliage.position) : Infinity;
  const closestEnemyDist_I   = Math.min(distToIcicle, distToFoliage);
  const closestEnemyTarget_I = distToIcicle <= distToFoliage ? 'icicle' : 'foliage';

  // State machine — hero takes priority, then closest other enemy
  if (!isPlayerDefeated() && distToHero < INFERNO_ATTACK_RANGE) {
    infernoState = 'attack'; infernoAttackTarget = 'hero';
  } else if (closestEnemyDist_I < INFERNO_ATTACK_RANGE) {
    infernoState = 'attack'; infernoAttackTarget = closestEnemyTarget_I;
  } else if (!isPlayerDefeated() && distToHero < INFERNO_CHASE_RANGE) {
    infernoState = 'chase'; infernoAttackTarget = 'hero';
  } else if (closestEnemyDist_I < INFERNO_CHASE_RANGE) {
    infernoState = 'chase'; infernoAttackTarget = closestEnemyTarget_I;
  } else {
    infernoState = 'patrol';
  }

  // Choose target position
  const infernoChasePos = infernoAttackTarget === 'icicle'  ? icicle.position  :
                          infernoAttackTarget === 'foliage' ? foliage.position : hero.position;
  let target;
  if (infernoState === 'patrol') {
    infernoWaypointTimer -= dt;
    if (infernoWaypointTimer <= 0 || inferno.position.distanceTo(infernoWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      infernoWaypoint.set(
        playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        playerGroup.position.z + Math.sin(angle) * radius
      );
      infernoWaypointTimer = 4 + Math.random() * 6;
    }
    target = infernoWaypoint;
  } else {
    target = infernoChasePos;
  }

  // Steer toward target
  const toTarget  = new THREE.Vector3().subVectors(target, inferno.position);
  const flatDist  = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  const targetYaw   = Math.atan2(-toTarget.x, -toTarget.z);
  const targetPitch = Math.atan2(toTarget.y, flatDist + 0.001);

  let dyaw = targetYaw - infernoAIYaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  infernoAIYaw   += dyaw * Math.min(1, 2.5 * dt);
  infernoAIPitch += (targetPitch - infernoAIPitch) * Math.min(1, 2.5 * dt);
  infernoAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, infernoAIPitch));

  const iPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), infernoAIPitch);
  const iYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), infernoAIYaw);
  inferno.quaternion.copy(iYaw).multiply(iPitch);

  // Move (in attack state, stop advancing once close enough to keep firing distance)
  const infernoSpeed = infernoState === 'attack' ? INFERNO_AI_SPEED * 0.35 : INFERNO_AI_SPEED;
  const ifwd = new THREE.Vector3(0, 0, -1).applyQuaternion(inferno.quaternion);
  const infernoDistToTarget = inferno.position.distanceTo(infernoChasePos);
  const tooClose = infernoState === 'attack' && infernoDistToTarget < INFERNO_ATTACK_RANGE * 0.55;
  const infernoTentative = inferno.position.clone().addScaledVector(ifwd, tooClose ? 0 : infernoSpeed * dt);
  infernoTentative.y = Math.max(15, infernoTentative.y);
  if (!heroHitsBuilding(infernoTentative)) {
    inferno.position.copy(infernoTentative);
  } else {
    inferno.position.y = Math.max(15, inferno.position.y);
  }

  // Pulse fire glow
  infernoFireGlow.intensity = 3 + Math.sin(t * 9) * 1.8;

  // Fire on cooldown while attacking
  infernoFireCooldown -= dt;
  if (infernoState === 'attack' && infernoFireCooldown <= 0) {
    fireFirebolt();
    infernoFireCooldown = INFERNO_FIRE_COOLDOWN;
  }
}

function updateIcicleAI(dt, t) {
  if (icicleState === 'defeated') {
    icicleDefeatedTimer -= dt;
    icicleDefeatedVelY  -= 90 * dt;
    icicle.position.y   += icicleDefeatedVelY * dt;
    icicle.rotation.z   += 3.0 * dt;
    icicle.rotation.x   += 1.5 * dt;

    if ((icicle.position.y < -80 || icicleDefeatedTimer <= 0) && !icicleRespawning) {
      icicle.visible   = false;
      icicleRespawning = true;
      setTimeout(() => {
        icicleHealth = ICICLE_MAX_HEALTH;
        icicleHealthFill.style.width = '100%';
        icicleState = 'patrol';
        icicle.position.set(
          playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        icicle.rotation.set(0, 0, 0);
        icicle.visible      = true;
        icicleDefeatedVelY  = 0;
        icicleRespawning    = false;
        showCombatMessage('ICICLE RETURNS!', '#aaeeff', 2500);
      }, 8000);
    }
    return;
  }

  // Skip AI logic when the player is controlling Icicle
  if (playerChar === 'icicle') return;

  const distToHero_IC    = icicle.position.distanceTo(playerGroup.position);
  const distToInferno_IC = infernoState  !== 'defeated' ? icicle.position.distanceTo(inferno.position)  : Infinity;
  const distToFoliage_IC = foliageState  !== 'defeated' ? icicle.position.distanceTo(foliage.position)  : Infinity;
  const closestEnemyDist_IC   = Math.min(distToInferno_IC, distToFoliage_IC);
  const closestEnemyTarget_IC = distToInferno_IC <= distToFoliage_IC ? 'inferno' : 'foliage';

  // State machine — hero takes priority, then closest other enemy
  if (!isPlayerDefeated() && distToHero_IC < ICICLE_ATTACK_RANGE) {
    icicleState = 'attack'; icicleAttackTarget = 'hero';
  } else if (closestEnemyDist_IC < ICICLE_ATTACK_RANGE) {
    icicleState = 'attack'; icicleAttackTarget = closestEnemyTarget_IC;
  } else if (!isPlayerDefeated() && distToHero_IC < ICICLE_CHASE_RANGE) {
    icicleState = 'chase'; icicleAttackTarget = 'hero';
  } else if (closestEnemyDist_IC < ICICLE_CHASE_RANGE) {
    icicleState = 'chase'; icicleAttackTarget = closestEnemyTarget_IC;
  } else {
    icicleState = 'patrol';
  }

  const icicleChasePos = icicleAttackTarget === 'inferno' ? inferno.position :
                         icicleAttackTarget === 'foliage' ? foliage.position : hero.position;
  let target;
  if (icicleState === 'patrol') {
    icicleWaypointTimer -= dt;
    if (icicleWaypointTimer <= 0 || icicle.position.distanceTo(icicleWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      icicleWaypoint.set(
        playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        playerGroup.position.z + Math.sin(angle) * radius
      );
      icicleWaypointTimer = 4 + Math.random() * 6;
    }
    target = icicleWaypoint;
  } else {
    target = icicleChasePos;
  }

  // Steer toward target
  const toTarget  = new THREE.Vector3().subVectors(target, icicle.position);
  const flatDist  = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  const targetYaw   = Math.atan2(-toTarget.x, -toTarget.z);
  const targetPitch = Math.atan2(toTarget.y, flatDist + 0.001);

  let dyaw = targetYaw - icicleAIYaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  icicleAIYaw   += dyaw * Math.min(1, 2.5 * dt);
  icicleAIPitch += (targetPitch - icicleAIPitch) * Math.min(1, 2.5 * dt);
  icicleAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, icicleAIPitch));

  const icPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), icicleAIPitch);
  const icYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), icicleAIYaw);
  icicle.quaternion.copy(icYaw).multiply(icPitch);

  // Move
  const icicleSpeed = icicleState === 'attack' ? ICICLE_AI_SPEED * 0.35 : ICICLE_AI_SPEED;
  const icfwd = new THREE.Vector3(0, 0, -1).applyQuaternion(icicle.quaternion);
  const icicleDistToTarget = icicle.position.distanceTo(icicleChasePos);
  const tooClose = icicleState === 'attack' && icicleDistToTarget < ICICLE_ATTACK_RANGE * 0.55;
  const icicleTentative = icicle.position.clone().addScaledVector(icfwd, tooClose ? 0 : icicleSpeed * dt);
  icicleTentative.y = Math.max(15, icicleTentative.y);
  if (!heroHitsBuilding(icicleTentative)) {
    icicle.position.copy(icicleTentative);
  } else {
    icicle.position.y = Math.max(15, icicle.position.y);
  }

  // Pulse ice glow
  icicleIceGlow.intensity = 3 + Math.sin(t * 9 + 1.5) * 1.8;

  // Fire on cooldown while attacking
  icicleFireCooldown -= dt;
  if (icicleState === 'attack' && icicleFireCooldown <= 0) {
    fireIcebolt();
    icicleFireCooldown = ICICLE_FIRE_COOLDOWN;
  }
}

function updateFoliageAI(dt, t) {
  if (foliageState === 'defeated') {
    foliageDefeatedTimer -= dt;
    foliageDefeatedVelY  -= 90 * dt;
    foliage.position.y   += foliageDefeatedVelY * dt;
    foliage.rotation.z   += 3.0 * dt;
    foliage.rotation.x   += 1.5 * dt;

    if ((foliage.position.y < -80 || foliageDefeatedTimer <= 0) && !foliageRespawning) {
      foliage.visible   = false;
      foliageRespawning = true;
      setTimeout(() => {
        foliageHealth = FOLIAGE_MAX_HEALTH;
        foliageHealthFill.style.width = '100%';
        foliageState = 'patrol';
        foliage.position.set(
          playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        foliage.rotation.set(0, 0, 0);
        foliage.visible      = true;
        foliageDefeatedVelY  = 0;
        foliageRespawning    = false;
        showCombatMessage('FOLIAGE RETURNS!', '#44cc00', 2500);
      }, 8000);
    }
    return;
  }

  // Skip AI logic when the player is controlling Foliage
  if (playerChar === 'foliage') return;

  const distToHero_F    = foliage.position.distanceTo(playerGroup.position);
  const distToInferno_F = infernoState !== 'defeated' ? foliage.position.distanceTo(inferno.position) : Infinity;
  const distToIcicle_F  = icicleState  !== 'defeated' ? foliage.position.distanceTo(icicle.position)  : Infinity;
  const closestEnemyDist_F   = Math.min(distToInferno_F, distToIcicle_F);
  const closestEnemyTarget_F = distToInferno_F <= distToIcicle_F ? 'inferno' : 'icicle';

  // State machine — hero takes priority, then closest other enemy
  if (!isPlayerDefeated() && distToHero_F < FOLIAGE_ATTACK_RANGE) {
    foliageState = 'attack'; foliageAttackTarget = 'hero';
  } else if (closestEnemyDist_F < FOLIAGE_ATTACK_RANGE) {
    foliageState = 'attack'; foliageAttackTarget = closestEnemyTarget_F;
  } else if (!isPlayerDefeated() && distToHero_F < FOLIAGE_CHASE_RANGE) {
    foliageState = 'chase'; foliageAttackTarget = 'hero';
  } else if (closestEnemyDist_F < FOLIAGE_CHASE_RANGE) {
    foliageState = 'chase'; foliageAttackTarget = closestEnemyTarget_F;
  } else {
    foliageState = 'patrol';
  }

  const foliageChasePos = foliageAttackTarget === 'inferno' ? inferno.position :
                          foliageAttackTarget === 'icicle'  ? icicle.position  : hero.position;
  let target;
  if (foliageState === 'patrol') {
    foliageWaypointTimer -= dt;
    if (foliageWaypointTimer <= 0 || foliage.position.distanceTo(foliageWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      foliageWaypoint.set(
        playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        playerGroup.position.z + Math.sin(angle) * radius
      );
      foliageWaypointTimer = 4 + Math.random() * 6;
    }
    target = foliageWaypoint;
  } else {
    target = foliageChasePos;
  }

  // Steer toward target
  const toTarget_F  = new THREE.Vector3().subVectors(target, foliage.position);
  const flatDist_F  = Math.sqrt(toTarget_F.x * toTarget_F.x + toTarget_F.z * toTarget_F.z);
  const targetYaw_F   = Math.atan2(-toTarget_F.x, -toTarget_F.z);
  const targetPitch_F = Math.atan2(toTarget_F.y, flatDist_F + 0.001);

  let dyaw_F = targetYaw_F - foliageAIYaw;
  while (dyaw_F >  Math.PI) dyaw_F -= Math.PI * 2;
  while (dyaw_F < -Math.PI) dyaw_F += Math.PI * 2;
  foliageAIYaw   += dyaw_F * Math.min(1, 2.5 * dt);
  foliageAIPitch += (targetPitch_F - foliageAIPitch) * Math.min(1, 2.5 * dt);
  foliageAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, foliageAIPitch));

  const fPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), foliageAIPitch);
  const fYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), foliageAIYaw);
  foliage.quaternion.copy(fYaw).multiply(fPitch);

  // Move
  const foliageSpeed = foliageState === 'attack' ? FOLIAGE_AI_SPEED * 0.35 : FOLIAGE_AI_SPEED;
  const ffwd = new THREE.Vector3(0, 0, -1).applyQuaternion(foliage.quaternion);
  const foliageDistToTarget = foliage.position.distanceTo(foliageChasePos);
  const tooClose_F = foliageState === 'attack' && foliageDistToTarget < FOLIAGE_ATTACK_RANGE * 0.55;
  const foliageTentative = foliage.position.clone().addScaledVector(ffwd, tooClose_F ? 0 : foliageSpeed * dt);
  foliageTentative.y = Math.max(15, foliageTentative.y);
  if (!heroHitsBuilding(foliageTentative)) {
    foliage.position.copy(foliageTentative);
  } else {
    foliage.position.y = Math.max(15, foliage.position.y);
  }

  // Pulse vine glow
  foliageVineGlow.intensity = 3 + Math.sin(t * 9 + 3.0) * 1.8;

  // Fire on cooldown while attacking
  foliageFireCooldown -= dt;
  if (foliageState === 'attack' && foliageFireCooldown <= 0) {
    fireVines();
    foliageFireCooldown = FOLIAGE_FIRE_COOLDOWN;
  }
}

// ─────────────────────────────────────────────
//  INIT SEQUENCE
// ─────────────────────────────────────────────
const clock = new THREE.Clock();
let   ready  = false;

const allPromises = [...buildingPromises, ...treePromises, heroFlyPromise, heroFloatPromise, infernoModelPromise, icicleModelPromise, foliageModelPromise];

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
//  ANIMATION LOOP
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

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!ready) return;

  const t = clock.elapsedTime;

  // ── Stamina ──
  const wantBoost      = !!keys['Space'] && !isFloating;
  const wantSuperBoost = !!keys['KeyS'] && !isFloating;
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

  // Force hover when stamina hits 0
  if (stamina === 0 && !staminaDepleted) {
    staminaDepleted = true;
    wasFloatingBeforeDepletion = isFloating;
    if (!isFloating) toggleFloat();
  }

  // Release forced hover only when stamina is completely full
  if (staminaDepleted && stamina >= 1.0) {
    staminaDepleted = false;
    if (!wasFloatingBeforeDepletion && isFloating) toggleFloat();
  }

  // ── Input / flight ──
  if (!isPlayerDefeated()) {
    const speed = isFloating ? 0 : BASE_SPEED * (superBoosting ? SUPER_BOOST_MULT : boosting ? BOOST_MULT : 1.0);

    if (keys['ArrowUp'])    pitchAngle = Math.min(pitchAngle + PITCH_RATE * dt,  MAX_PITCH);
    if (keys['ArrowDown'])  pitchAngle = Math.max(pitchAngle - PITCH_RATE * dt, -MAX_PITCH);
    if (keys['ArrowLeft'])  yawAngle  += YAW_RATE * dt;
    if (keys['ArrowRight']) yawAngle  -= YAW_RATE * dt;

    // Floating: level out pitch naturally
    if (isFloating || (!keys['ArrowUp'] && !keys['ArrowDown'])) pitchAngle *= 0.97;

    // ── Orientation ──
    _pitchQ.setFromAxisAngle(_pitchAxis, pitchAngle);
    _yawQ.setFromAxisAngle(_yawAxis, yawAngle);
    const rollAmt = !isFloating && keys['ArrowLeft'] ? 0.38
                  : !isFloating && keys['ArrowRight'] ? -0.38 : 0;
    _rollQ.setFromAxisAngle(_rollAxis, rollAmt);
    playerGroup.quaternion.copy(_yawQ).multiply(_pitchQ).multiply(_rollQ);

    // ── Movement ──
    _fwd.set(0, 0, -1).applyQuaternion(playerGroup.quaternion).normalize();
    const _tentative = playerGroup.position.clone().addScaledVector(_fwd, speed * dt);
    _tentative.y = Math.max(4, _tentative.y);

    // Building collision: sphere-cast against actual mesh geometry
    if (!heroHitsBuilding(_tentative)) {
      playerGroup.position.copy(_tentative);
    } else {
      // Allow vertical escape only
      const _vertOnly = new THREE.Vector3(playerGroup.position.x, _tentative.y, playerGroup.position.z);
      if (!heroHitsBuilding(_vertOnly)) playerGroup.position.y = _tentative.y;
    }
  } else {
    if (playerChar === 'hero') updateHeroDefeated(dt);
  }

  // ── Camera: shifts above hero when diving, below when climbing ──
  // pitchAngle > 0 = nose up (climbing)  → camera drops below → view from below
  // pitchAngle < 0 = nose down (diving)  → camera rises above → view from above
  const pitchCamY = 2 - pitchAngle * 12;
  _desiredP.set(0, pitchCamY, 20).applyQuaternion(_yawQ).add(playerGroup.position);
  _desiredL.copy(playerGroup.position).add(new THREE.Vector3(0, 3, 0));
  camCurrentPos.lerp(_desiredP,  CAM_LERP);
  camCurrentLook.lerp(_desiredL, CAM_LERP);
  camera.position.copy(camCurrentPos);
  camera.lookAt(camCurrentLook);

  // ── Electricity trail (always visible, jitter intensifies during boost) ──
  trailTick++;
  const trailSpreads = [0.3, 1.0, 1.8];
  for (let ti = 0; ti < trailBufs.length; ti++) {
    const buf    = trailBufs[ti];
    const spread = trailSpreads[ti];
    for (let i = TRAIL_LEN - 1; i > 0; i--) {
      buf[i * 3]     = buf[(i - 1) * 3];
      buf[i * 3 + 1] = buf[(i - 1) * 3 + 1];
      buf[i * 3 + 2] = buf[(i - 1) * 3 + 2];
    }
    const jitter = superBoosting ? spread * 14.0 : boosting ? spread * 2.5 : spread * 1.2;
    buf[0] = playerGroup.position.x + (Math.random() - 0.5) * jitter;
    buf[1] = playerGroup.position.y + (Math.random() - 0.5) * jitter;
    buf[2] = playerGroup.position.z + (Math.random() - 0.5) * jitter;
    trailLines[ti].geo.attributes.position.needsUpdate = true;
    trailLines[ti].line.visible = boosting || superBoosting;
    trailLines[ti].line.material.opacity = TRAIL_CONFIGS[ti][1];
  }

  // Electric glow: pulses hard during boost, dim otherwise
  heroElectricGlow.intensity = superBoosting ? 22 + Math.sin(t * 45) * 8 : boosting ? 5 + Math.sin(t * 22) * 2 : (isFloating ? 0.5 : 1.0);

  // ── Weapon (continuous while F held, fires every BOLT_COOLDOWN seconds) ──
  if (!isPlayerDefeated()) {
    lightningCooldown -= dt;
    if (firingLightning && lightningCooldown <= 0) {
      firePlayerWeapon(superBoosting);
      lightningCooldown = BOLT_COOLDOWN;
    }
  }

  if (boltGroup) {
    boltTimer -= dt;
    if (boltTimer <= 0) { scene.remove(boltGroup); boltGroup = null; }
  }

  // ── Thunderclap AI (when player is controlling a different character) ──
  if (playerChar !== 'hero') updateThunderclapAI(dt, t);

  // ── Thunderclap AI bolt timer ──
  if (heroBoltGroup) {
    heroBoltTimer -= dt;
    if (heroBoltTimer <= 0) { scene.remove(heroBoltGroup); heroBoltGroup = null; }
  }

  // ── Inferno AI ──
  updateInfernoAI(dt, t);

  // ── Inferno fire trail ──
  updateVillainTrail(fireTrailBufs, fireTrailLines, inferno.position, inferno.visible, infernoState);

  // ── Inferno bolt timer ──
  if (infernoBoltGroup) {
    infernoBoltTimer -= dt;
    if (infernoBoltTimer <= 0) { scene.remove(infernoBoltGroup); infernoBoltGroup = null; }
  }

  // ── Icicle AI ──
  updateIcicleAI(dt, t);

  // ── Icicle ice trail ──
  updateVillainTrail(iceTrailBufs, iceTrailLines, icicle.position, icicle.visible, icicleState);

  // ── Icicle bolt timer ──
  if (icicleBoltGroup) {
    icicleBoltTimer -= dt;
    if (icicleBoltTimer <= 0) { scene.remove(icicleBoltGroup); icicleBoltGroup = null; }
  }

  // ── Foliage AI ──
  updateFoliageAI(dt, t);

  // ── Foliage vine trail ──
  updateVillainTrail(vineTrailBufs, vineTrailLines, foliage.position, foliage.visible, foliageState);

  // ── Foliage bolt timer ──
  if (foliageBoltGroup) {
    foliageBoltTimer -= dt;
    if (foliageBoltTimer <= 0) { scene.remove(foliageBoltGroup); foliageBoltGroup = null; }
  }

  // ── HUD ──
  boostIndicator.classList.toggle('active', boosting || superBoosting);

  renderer.render(scene, camera);
}
