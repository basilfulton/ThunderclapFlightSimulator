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

let totalAssets  = BUILDING_FILES.length + TREE_FILES.length + 2; // +2 for fly + float hero
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

let flyModel   = null;  // Thunderclap (1).glb  — shown while flying
let floatModel = null;  // Thunderclap2.glb     — shown while hovering

// ── Shared helper: orient a loaded GLB for flying pose ──
function orientModelForFlight(model) {
  const box0   = new THREE.Box3().setFromObject(model);
  const size0  = box0.getSize(new THREE.Vector3());
  const maxDim = Math.max(size0.x, size0.y, size0.z);
  model.scale.setScalar(5 / maxDim);

  model.rotation.order = 'ZXY';
  model.rotation.x = -Math.PI / 2 + 0.35; // nose-up tilt
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
  gltfLoader.load('Thunderclap (1).glb',
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
  gltfLoader.load('Thunderclap2.glb',
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

function buildPlaceholderHero() {
  const group    = new THREE.Group();
  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x2255aa });
  const accentMat= new THREE.MeshLambertMaterial({ color: 0x00cfff, emissive: 0x006688 });

  // Flying pose: body along -Z, head at front
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

  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.0), accentMat);
  bolt.position.set(0.2, -0.52, 0);
  group.add(bolt);

  hero.add(group);
  return group;
}

function buildInfernoModel() {
  const group    = new THREE.Group();
  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xaa1111 });
  const accentMat= new THREE.MeshLambertMaterial({ color: 0xff6600, emissive: 0x992200 });

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

  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.0), accentMat);
  flame.position.set(0.2, -0.52, 0);
  group.add(flame);

  inferno.add(group);
  return group;
}
buildInfernoModel();

const infernoFireGlow = new THREE.PointLight(0xff4400, 3, 40);
inferno.add(infernoFireGlow);

// ─────────────────────────────────────────────
//  ELECTRICITY TRAIL  (3 layered lines for thickness + glow)
// ─────────────────────────────────────────────
const TRAIL_LEN  = 80;
const NUM_TRAILS = 3;

// Per-trail config: [color, opacity]
const TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // bright white core
  [0x88eeff, 0.85],  // cyan mid
  [0x2299ff, 0.65],  // blue outer
];

const trailBufs  = TRAIL_CONFIGS.map(() => {
  const buf = new Float32Array(TRAIL_LEN * 3);
  for (let i = 0; i < TRAIL_LEN; i++) { buf[i*3] = 0; buf[i*3+1] = 100; buf[i*3+2] = 0; }
  return buf;
});

const trailLines = TRAIL_CONFIGS.map(([color, opacity], idx) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(trailBufs[idx], 3));
  geo.setDrawRange(0, TRAIL_LEN);
  const mat  = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  return { line, geo };
});

// Persistent electric glow that follows the hero
const heroElectricGlow = new THREE.PointLight(0x55ccff, 4, 40);
hero.add(heroElectricGlow);

let trailTick = 0; // counts frames, used to control jitter frequency

// ─────────────────────────────────────────────
//  FIRE TRAIL  (Inferno — orange / red glow)
// ─────────────────────────────────────────────
const FIRE_TRAIL_LEN     = 80;
const FIRE_TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // white core
  [0xff8822, 0.85],  // orange mid
  [0xff2200, 0.65],  // red outer
];

const fireTrailBufs = FIRE_TRAIL_CONFIGS.map(() => {
  const buf = new Float32Array(FIRE_TRAIL_LEN * 3);
  for (let i = 0; i < FIRE_TRAIL_LEN; i++) { buf[i*3] = 300; buf[i*3+1] = 150; buf[i*3+2] = -400; }
  return buf;
});

const fireTrailLines = FIRE_TRAIL_CONFIGS.map(([color, opacity], idx) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(fireTrailBufs[idx], 3));
  geo.setDrawRange(0, FIRE_TRAIL_LEN);
  const mat  = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.add(line);
  return { line, geo };
});

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
const INFERNO_MAX_HEALTH    = 100;
const INFERNO_AI_SPEED      = 38;
const INFERNO_CHASE_RANGE   = 350;
const INFERNO_ATTACK_RANGE  = 130;
const INFERNO_FIRE_COOLDOWN = 1.4;  // seconds between shots
const INFERNO_FIRE_DAMAGE   = 12;   // damage per firebolt hit
const LIGHTNING_DAMAGE      = 18;   // damage per lightning hit

let heroHealth    = HERO_MAX_HEALTH;
let infernoHealth = INFERNO_MAX_HEALTH;

let infernoState         = 'patrol';  // 'patrol' | 'chase' | 'attack' | 'defeated'
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

const heroHealthFill    = document.getElementById('hero-health-fill');
const infernoHealthFill = document.getElementById('inferno-health-fill');
const combatMessage     = document.getElementById('combat-message');

// ─────────────────────────────────────────────
//  INPUT
// ─────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyH') toggleFloat();
  e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

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

  if (flyModel)   flyModel.visible   = !isFloating;
  if (floatModel) floatModel.visible =  isFloating;

  floatBtn.textContent = isFloating ? '⏸ HOVER' : '▶ FLY';
  floatBtn.className   = isFloating ? 'hover-mode' : 'fly-mode';

  // Level out pitch so hover looks natural
  if (isFloating) pitchAngle = 0;
}

floatBtn.addEventListener('click', toggleFloat);

// ─────────────────────────────────────────────
//  FLIGHT PHYSICS
// ─────────────────────────────────────────────
const BASE_SPEED = 40;
const BOOST_MULT = 2.5;
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

function fireLightning() {
  _fwd.set(0, 0, -1).applyQuaternion(hero.quaternion).normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(hero.quaternion);
  const origin     = hero.position.clone().add(handOffset);

  raycaster.set(origin, _fwd);
  const hits     = raycaster.intersectObjects(buildingMeshes, false);
  const endPoint = hits.length > 0
    ? hits[0].point.clone()
    : origin.clone().addScaledVector(_fwd, 400);

  if (boltGroup) { scene.remove(boltGroup); boltGroup = null; }

  boltGroup = new THREE.Group();
  for (const [color, jitterMult] of BOLT_LAYERS) {
    const pts  = buildJaggedLine(origin, endPoint, 18, 3.5 * jitterMult);
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

  const impact = new THREE.PointLight(0x88ddff, 60, 150);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), 120);

  const muzzle = new THREE.PointLight(0xffffff, 80, 50);
  muzzle.position.copy(origin);
  scene.add(muzzle);
  setTimeout(() => scene.remove(muzzle), 80);
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
    if (heroHealth <= 0) return;
    heroHealth = Math.max(0, heroHealth - amount);
    heroHealthFill.style.width = (heroHealth / HERO_MAX_HEALTH * 100) + '%';
    if (heroHealth <= 0) {
      showCombatMessage('THUNDERCLAP IS DOWN!', '#ff3300', 3000);
      setTimeout(() => {
        heroHealth = HERO_MAX_HEALTH;
        heroHealthFill.style.width = '100%';
      }, 3000);
    }
  } else {
    if (infernoHealth <= 0 || infernoState === 'defeated') return;
    infernoHealth = Math.max(0, infernoHealth - amount);
    infernoHealthFill.style.width = (infernoHealth / INFERNO_MAX_HEALTH * 100) + '%';
    if (infernoHealth <= 0) {
      infernoState        = 'defeated';
      infernoDefeatedTimer = 4.0;
      infernoDefeatedVelY  = 10;
      showCombatMessage('INFERNO DEFEATED!', '#00cfff', 4000);
    }
  }
}

// Fire bolt layers: yellow core → orange → red → dark red
const FIRE_BOLT_LAYERS = [
  [0xffff88, 0.4],
  [0xff8800, 1.0],
  [0xff3300, 1.8],
  [0xaa1100, 2.6],
];

function fireFirebolt() {
  const toHero = new THREE.Vector3().subVectors(hero.position, inferno.position);
  const dist   = toHero.length();
  toHero.normalize();

  // Small spread so Inferno doesn't always hit
  toHero.x += (Math.random() - 0.5) * 0.18;
  toHero.y += (Math.random() - 0.5) * 0.14;
  toHero.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(inferno.quaternion);
  const origin     = inferno.position.clone().add(handOffset);
  const endPoint   = origin.clone().addScaledVector(toHero, Math.min(dist + 30, 400));

  // Hit check — did the bolt pass within 9 units of the hero?
  if (distToSegment(origin, endPoint, hero.position) < 9) {
    takeDamage('hero', INFERNO_FIRE_DAMAGE);
  }

  if (infernoBoltGroup) { scene.remove(infernoBoltGroup); infernoBoltGroup = null; }
  infernoBoltGroup = new THREE.Group();
  for (const [color, jitter] of FIRE_BOLT_LAYERS) {
    const pts  = buildJaggedLine(origin, endPoint, 22, 5.5 * jitter);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    infernoBoltGroup.add(line);
  }
  infernoBoltTimer = 0.13;
  scene.add(infernoBoltGroup);

  const impact = new THREE.PointLight(0xff6600, 55, 140);
  impact.position.copy(endPoint);
  scene.add(impact);
  setTimeout(() => scene.remove(impact), 130);

  const muzzle = new THREE.PointLight(0xff8800, 70, 50);
  muzzle.position.copy(origin);
  scene.add(muzzle);
  setTimeout(() => scene.remove(muzzle), 90);
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
          hero.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          hero.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        inferno.rotation.set(0, 0, 0);
        inferno.visible      = true;
        infernoDefeatedVelY  = 0;
        infernoRespawning    = false;
        showCombatMessage('INFERNO RETURNS!', '#ff4400', 2500);
      }, 8000);
    }
    return;
  }

  const distToHero = inferno.position.distanceTo(hero.position);

  // State machine transitions
  if (distToHero < INFERNO_ATTACK_RANGE) {
    infernoState = 'attack';
  } else if (distToHero < INFERNO_CHASE_RANGE) {
    infernoState = 'chase';
  } else {
    infernoState = 'patrol';
  }

  // Choose target position
  let target;
  if (infernoState === 'patrol') {
    infernoWaypointTimer -= dt;
    if (infernoWaypointTimer <= 0 || inferno.position.distanceTo(infernoWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      infernoWaypoint.set(
        hero.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        hero.position.z + Math.sin(angle) * radius
      );
      infernoWaypointTimer = 4 + Math.random() * 6;
    }
    target = infernoWaypoint;
  } else if (infernoState === 'attack') {
    // Orbit the hero at attack range
    const orbitAngle = t * 0.5 + Math.PI;
    target = new THREE.Vector3(
      hero.position.x + Math.cos(orbitAngle) * INFERNO_ATTACK_RANGE * 0.85,
      hero.position.y + 15,
      hero.position.z + Math.sin(orbitAngle) * INFERNO_ATTACK_RANGE * 0.85
    );
  } else {
    target = hero.position;
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

  // Move
  const infernoSpeed = infernoState === 'attack' ? INFERNO_AI_SPEED * 0.35 : INFERNO_AI_SPEED;
  const ifwd = new THREE.Vector3(0, 0, -1).applyQuaternion(inferno.quaternion);
  inferno.position.addScaledVector(ifwd, infernoSpeed * dt);
  inferno.position.y = Math.max(15, inferno.position.y);

  // Pulse fire glow
  infernoFireGlow.intensity = 3 + Math.sin(t * 9) * 1.8;

  // Fire on cooldown while attacking
  infernoFireCooldown -= dt;
  if (infernoState === 'attack' && infernoFireCooldown <= 0) {
    fireFirebolt();
    infernoFireCooldown = INFERNO_FIRE_COOLDOWN;
  }
}

// ─────────────────────────────────────────────
//  INIT SEQUENCE
// ─────────────────────────────────────────────
const clock = new THREE.Clock();
let   ready  = false;

const allPromises = [...buildingPromises, ...treePromises, heroFlyPromise, heroFloatPromise];

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
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!ready) return;

  const t = clock.elapsedTime;

  // ── Stamina ──
  const wantBoost = !!keys['Space'] && !isFloating;
  const boosting  = wantBoost && stamina > 0;

  const firingLightning = !!keys['KeyF'] && stamina > 0 && !staminaDepleted;

  if (boosting || firingLightning) {
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
  const speed = isFloating ? 0 : BASE_SPEED * (boosting ? BOOST_MULT : 1.0);

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
  hero.quaternion.copy(_yawQ).multiply(_pitchQ).multiply(_rollQ);

  // ── Movement ──
  _fwd.set(0, 0, -1).applyQuaternion(hero.quaternion).normalize();
  const _tentative = hero.position.clone().addScaledVector(_fwd, speed * dt);
  _tentative.y = Math.max(4, _tentative.y);

  // Building collision: sphere-cast against actual mesh geometry
  if (!heroHitsBuilding(_tentative)) {
    hero.position.copy(_tentative);
  } else {
    // Allow vertical escape only
    const _vertOnly = new THREE.Vector3(hero.position.x, _tentative.y, hero.position.z);
    if (!heroHitsBuilding(_vertOnly)) hero.position.y = _tentative.y;
  }

  // ── Camera: shifts above hero when diving, below when climbing ──
  // pitchAngle > 0 = nose up (climbing)  → camera drops below → view from below
  // pitchAngle < 0 = nose down (diving)  → camera rises above → view from above
  const pitchCamY = 2 - pitchAngle * 12;
  _desiredP.set(0, pitchCamY, 20).applyQuaternion(_yawQ).add(hero.position);
  _desiredL.copy(hero.position).add(new THREE.Vector3(0, 3, 0));
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
    const jitter = boosting ? spread * 2.5 : spread * 1.2;
    buf[0] = hero.position.x + (Math.random() - 0.5) * jitter;
    buf[1] = hero.position.y + (Math.random() - 0.5) * jitter;
    buf[2] = hero.position.z + (Math.random() - 0.5) * jitter;
    trailLines[ti].geo.attributes.position.needsUpdate = true;
    trailLines[ti].line.visible = boosting;
    trailLines[ti].line.material.opacity = TRAIL_CONFIGS[ti][1];
  }

  // Electric glow: pulses hard during boost, dim otherwise
  heroElectricGlow.intensity = boosting ? 5 + Math.sin(t * 22) * 2 : (isFloating ? 0.5 : 1.0);

  // ── Lightning (continuous while F held, fires every BOLT_COOLDOWN seconds) ──
  lightningCooldown -= dt;
  if (firingLightning && lightningCooldown <= 0) {
    fireLightning();
    lightningCooldown = BOLT_COOLDOWN;
  }

  if (boltGroup) {
    boltTimer -= dt;
    if (boltTimer <= 0) { scene.remove(boltGroup); boltGroup = null; }
  }

  // ── Inferno AI ──
  updateInfernoAI(dt, t);

  // ── Inferno fire trail ──
  const fireTrailSpreads = [0.3, 1.0, 1.8];
  for (let ti = 0; ti < fireTrailBufs.length; ti++) {
    const fbuf    = fireTrailBufs[ti];
    const fspread = fireTrailSpreads[ti];
    for (let i = FIRE_TRAIL_LEN - 1; i > 0; i--) {
      fbuf[i * 3]     = fbuf[(i - 1) * 3];
      fbuf[i * 3 + 1] = fbuf[(i - 1) * 3 + 1];
      fbuf[i * 3 + 2] = fbuf[(i - 1) * 3 + 2];
    }
    fbuf[0] = inferno.position.x + (Math.random() - 0.5) * fspread * 1.2;
    fbuf[1] = inferno.position.y + (Math.random() - 0.5) * fspread * 1.2;
    fbuf[2] = inferno.position.z + (Math.random() - 0.5) * fspread * 1.2;
    fireTrailLines[ti].geo.attributes.position.needsUpdate = true;
    fireTrailLines[ti].line.visible = inferno.visible && infernoState === 'chase';
  }

  // ── Inferno bolt timer ──
  if (infernoBoltGroup) {
    infernoBoltTimer -= dt;
    if (infernoBoltTimer <= 0) { scene.remove(infernoBoltGroup); infernoBoltGroup = null; }
  }

  // ── HUD ──
  boostIndicator.classList.toggle('active', boosting);

  renderer.render(scene, camera);
}
