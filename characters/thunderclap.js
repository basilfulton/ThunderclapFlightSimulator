import * as THREE from 'three';
import { G, HERO_MAX_HEALTH, LIGHTNING_DAMAGE_AI, PLAYER_DAMAGE_MULTIPLIER, BOLT_DURATION, MAX_PITCH } from '../state.js';
import { distToSegment, buildJaggedLine, takeDamage, showCombatMessage, isPlayerDefeated, heroHitsBuilding } from './combat.js';
import { orientModelForFlight, buildPlaceholderModel } from './modelUtils.js';

// ─────────────────────────────────────────────
//  THUNDERCLAP (HERO)
// ─────────────────────────────────────────────

export const HERO_AI_SPEED      = 38;
export const HERO_CHASE_RANGE   = 350;
export const HERO_ATTACK_RANGE  = 130;
export const HERO_FIRE_COOLDOWN = 0.055;

// THREE.Group — added to scene by game.js
export const hero = new THREE.Group();
hero.position.set(0, 100, 0);

// Persistent electric glow that follows the hero
export const heroElectricGlow = new THREE.PointLight(0x55ccff, 4, 40);
hero.add(heroElectricGlow);

// Loaded models (set during loadModels)
export let flyModel   = null;
export let floatModel = null;

// ── Trail config ──
export const TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // bright white core
  [0x88eeff, 0.85],  // cyan mid
  [0x2299ff, 0.65],  // blue outer
];

// ── Bolt layers: [color, jitter multiplier] ──
const BOLT_LAYERS = [
  [0xffffff, 0.3],
  [0x88ddff, 0.8],
  [0x44aaff, 1.4],
  [0x2266ff, 2.0],
];

// ── Private AI state ──
let heroAIState      = 'patrol';
let heroAttackTarget = 'inferno';
const heroWaypoint   = new THREE.Vector3(0, 100, 0);
let heroWaypointTimer   = 0;
let heroAIYaw           = 0;
let heroAIPitch         = 0;
let heroFireCooldown    = 0;

// ── Private bolt state (two separate bolt groups: player bolt and AI bolt) ──
let boltGroup    = null;  // player-controlled lightning
let boltTimer    = 0;
let heroBoltGroup = null; // AI lightning (when hero is AI-controlled)
let heroBoltTimer = 0;

// ─────────────────────────────────────────────
//  MODEL LOADING
// ─────────────────────────────────────────────
export function loadModels(gltfLoader, onAssetLoaded) {
  const flyPromise = new Promise(resolve => {
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
        flyModel = buildPlaceholderModel(hero, 0x2255aa, 0x00cfff, 0x006688);
        flyModel.visible = true;
        onAssetLoaded();
        resolve();
      }
    );
  });

  const floatPromise = new Promise(resolve => {
    gltfLoader.load('assets/Thunderclap2.glb',
      gltf => {
        floatModel = gltf.scene;
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

        // Model faces +X natively; rotate +90° around Y so back (-X) faces camera
        floatModel.rotation.set(0, Math.PI / 2, 0);
        floatModel.visible = false;
        hero.add(floatModel);
        onAssetLoaded();
        resolve();
      },
      undefined,
      err => {
        console.warn('Float model (Thunderclap2.glb) not found, reusing placeholder.');
        floatModel = buildPlaceholderModel(hero, 0x2255aa, 0x00cfff, 0x006688);
        floatModel.visible = false;
        onAssetLoaded();
        resolve();
      }
    );
  });

  return [flyPromise, floatPromise];
}

// ─────────────────────────────────────────────
//  PLAYER-CONTROLLED LIGHTNING
// ─────────────────────────────────────────────
const _fwd = new THREE.Vector3();

export function fireLightning(superBoosting = false) {
  _fwd.set(0, 0, -1).applyQuaternion(hero.quaternion).normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(hero.quaternion);
  const origin     = hero.position.clone().add(handOffset);

  G.raycaster.set(origin, _fwd);
  const hits     = G.raycaster.intersectObjects(G.buildingMeshes, false);
  const endPoint = hits.length > 0
    ? hits[0].point.clone()
    : origin.clone().addScaledVector(_fwd, 400);

  if (boltGroup) { G.scene.remove(boltGroup); boltGroup = null; }

  const boltScale = superBoosting ? 17.5 : 1.0;
  boltGroup = new THREE.Group();
  const layers = superBoosting
    ? [...BOLT_LAYERS, [0x44aaff, 3.0], [0x2266ff, 4.2], [0x0033cc, 5.8], [0x001888, 7.5]]
    : BOLT_LAYERS;
  for (const [color, jitterMult] of layers) {
    const pts  = buildJaggedLine(origin, endPoint, 18, 3.5 * jitterMult * boltScale);
    boltGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 })
    ));
  }
  boltTimer = BOLT_DURATION;
  G.scene.add(boltGroup);

  // Hit checks
  if (G.infernoState !== 'defeated' && G.infernoHealth > 0 &&
      distToSegment(origin, endPoint, G.inferno.position) < 9)
    takeDamage('inferno', LIGHTNING_DAMAGE_AI * PLAYER_DAMAGE_MULTIPLIER);
  if (G.icicleState !== 'defeated' && G.icicleHealth > 0 &&
      distToSegment(origin, endPoint, G.icicle.position) < 9)
    takeDamage('icicle', LIGHTNING_DAMAGE_AI * PLAYER_DAMAGE_MULTIPLIER);
  if (G.foliageState !== 'defeated' && G.foliageHealth > 0 &&
      distToSegment(origin, endPoint, G.foliage.position) < 9)
    takeDamage('foliage', LIGHTNING_DAMAGE_AI * PLAYER_DAMAGE_MULTIPLIER);

  const impactStr = superBoosting ? 180 : 60;
  const impactRng = superBoosting ? 350 : 150;
  const impact = new THREE.PointLight(0x88ddff, impactStr, impactRng);
  impact.position.copy(endPoint);
  G.scene.add(impact);
  setTimeout(() => G.scene.remove(impact), superBoosting ? 200 : 120);

  const muzzleStr = superBoosting ? 220 : 80;
  const muzzleRng = superBoosting ? 130 : 50;
  const muzzle = new THREE.PointLight(0xffffff, muzzleStr, muzzleRng);
  muzzle.position.copy(origin);
  G.scene.add(muzzle);
  setTimeout(() => G.scene.remove(muzzle), superBoosting ? 140 : 80);
}

// ─────────────────────────────────────────────
//  AI LIGHTNING (when Thunderclap is AI-controlled)
// ─────────────────────────────────────────────
export function fireLightningAI() {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(hero.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.3;
  boltDir.y += (Math.random() - 0.5) * 0.22;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(hero.quaternion);
  const origin     = hero.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  G.raycaster.set(origin, boltDir);
  const bHits   = G.raycaster.intersectObjects(G.buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  // Hit any target (hero AI never hits itself)
  if (!blocked && G.playerChar !== 'inferno' && G.infernoState !== 'defeated' && G.infernoHealth > 0 &&
      distToSegment(origin, endPoint, G.inferno.position) < 9)
    takeDamage('inferno', LIGHTNING_DAMAGE_AI);
  if (!blocked && G.playerChar !== 'icicle' && G.icicleState !== 'defeated' && G.icicleHealth > 0 &&
      distToSegment(origin, endPoint, G.icicle.position) < 9)
    takeDamage('icicle', LIGHTNING_DAMAGE_AI);
  if (!blocked && G.playerChar !== 'foliage' && G.foliageState !== 'defeated' && G.foliageHealth > 0 &&
      distToSegment(origin, endPoint, G.foliage.position) < 9)
    takeDamage('foliage', LIGHTNING_DAMAGE_AI);
  if (!blocked && G.playerChar !== 'hero' && !isPlayerDefeated() &&
      distToSegment(origin, endPoint, G.playerGroup.position) < 9)
    takeDamage(G.playerChar, LIGHTNING_DAMAGE_AI);

  if (heroBoltGroup) { G.scene.remove(heroBoltGroup); heroBoltGroup = null; }
  heroBoltGroup = new THREE.Group();
  for (const [color, jitterMult] of BOLT_LAYERS) {
    heroBoltGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(buildJaggedLine(origin, endPoint, 18, 3.5 * jitterMult)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1.0 })
    ));
  }
  heroBoltTimer = BOLT_DURATION;
  G.scene.add(heroBoltGroup);

  const impact = new THREE.PointLight(0x88ddff, 60, 150);
  impact.position.copy(endPoint);
  G.scene.add(impact);
  setTimeout(() => G.scene.remove(impact), 120);
}

// ─────────────────────────────────────────────
//  BOLT TIMER CLEANUP  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateThunderclapBolts(dt) {
  if (boltGroup) {
    boltTimer -= dt;
    if (boltTimer <= 0) { G.scene.remove(boltGroup); boltGroup = null; }
  }
  if (heroBoltGroup) {
    heroBoltTimer -= dt;
    if (heroBoltTimer <= 0) { G.scene.remove(heroBoltGroup); heroBoltGroup = null; }
  }
}

// ─────────────────────────────────────────────
//  DEFEAT / RESPAWN
// ─────────────────────────────────────────────
function updateHeroDefeated(dt) {
  G.heroDefeatedTimer -= dt;
  G.heroDefeatedVelY  -= 90 * dt;
  hero.position.y     += G.heroDefeatedVelY * dt;

  if (hero.position.y < 1) { hero.position.y = 1; G.heroDefeatedVelY = 0; }

  hero.rotation.z += 3.0 * dt;
  hero.rotation.x += 1.5 * dt;

  if (G.heroDefeatedTimer <= 0 && !G.heroRespawning) {
    hero.visible      = false;
    G.heroRespawning  = true;
    setTimeout(() => {
      G.heroHealth = HERO_MAX_HEALTH;
      G.heroHealthFill.style.width = '100%';
      G.heroDefeated = false;
      hero.position.set(
        G.playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 150),
        120 + Math.random() * 60,
        G.playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 150)
      );
      hero.rotation.set(0, 0, 0);
      if (G.playerChar === 'hero') {
        // Reset player yaw/pitch — game.js will read these via exported refs
        // Trigger reset via a flag that game.js checks
        hero._resetPlayerAngles = true;
      }
      hero.visible     = true;
      G.heroDefeatedVelY = 0;
      G.heroRespawning   = false;
      showCombatMessage('THUNDERCLAP RETURNS!', '#1144cc', 2500);
    }, 5000);
  }
}

// ─────────────────────────────────────────────
//  AI UPDATE  (call every frame from game.js when playerChar !== 'hero')
// ─────────────────────────────────────────────
export function updateThunderclapAI(dt, t) {
  if (G.heroDefeated) { updateHeroDefeated(dt); return; }

  const distToInferno = G.infernoState !== 'defeated' ? hero.position.distanceTo(G.inferno.position) : Infinity;
  const distToIcicle  = G.icicleState  !== 'defeated' ? hero.position.distanceTo(G.icicle.position)  : Infinity;
  const distToFoliage = G.foliageState !== 'defeated' ? hero.position.distanceTo(G.foliage.position) : Infinity;
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

  const heroChasePos = heroAttackTarget === 'inferno' ? G.inferno.position :
                       heroAttackTarget === 'icicle'  ? G.icicle.position  : G.foliage.position;

  let target;
  if (heroAIState === 'patrol') {
    heroWaypointTimer -= dt;
    if (heroWaypointTimer <= 0 || hero.position.distanceTo(heroWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      heroWaypoint.set(
        G.playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        G.playerGroup.position.z + Math.sin(angle) * radius
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
  const heroAISpeedActual = heroAIState === 'attack' ? HERO_AI_SPEED * 0.6 : HERO_AI_SPEED;
  const hfwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(hero.quaternion);
  const hright = new THREE.Vector3(1, 0, 0).applyQuaternion(hero.quaternion);
  const heroDistToTarget = hero.position.distanceTo(heroChasePos);
  const tooClose      = heroAIState === 'attack' && heroDistToTarget < HERO_ATTACK_RANGE * 0.55;
  const heroFwdAmt    = tooClose ? 0 : heroAISpeedActual;
  const heroStrafeAmt = heroAIState === 'attack' ? Math.sin(t * 1.3) * HERO_AI_SPEED * 0.55 : 0;
  const heroBobAmt    = heroAIState === 'attack' ? Math.sin(t * 2.1 + 0.7) * HERO_AI_SPEED * 0.2 : 0;
  const heroTentative = hero.position.clone()
    .addScaledVector(hfwd,   heroFwdAmt    * dt)
    .addScaledVector(hright, heroStrafeAmt * dt)
    .addScaledVector(new THREE.Vector3(0, 1, 0), heroBobAmt * dt);
  heroTentative.y = Math.max(15, heroTentative.y);
  if (!heroHitsBuilding(heroTentative)) {
    hero.position.copy(heroTentative);
  } else {
    hero.position.y = Math.max(15, hero.position.y);
  }

  // Pulse electric glow
  heroElectricGlow.intensity = 3 + Math.sin(t * 9 + 0.5) * 1.8;

  // Fire on cooldown while attacking
  heroFireCooldown -= dt;
  if (heroAIState === 'attack' && heroFireCooldown <= 0) {
    fireLightningAI();
    heroFireCooldown = HERO_FIRE_COOLDOWN;
  }
}
