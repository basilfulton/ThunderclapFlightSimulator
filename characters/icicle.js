import * as THREE from 'three';
import { G, ICICLE_MAX_HEALTH, PLAYER_DAMAGE_MULTIPLIER, MAX_PITCH } from '../state.js';
import { distToSegment, takeDamage, showCombatMessage, isPlayerDefeated, heroHitsBuilding } from './combat.js';
import { orientModelForFlight, buildPlaceholderModel } from './modelUtils.js';

// ─────────────────────────────────────────────
//  ICICLE  (ice villain)
// ─────────────────────────────────────────────

export const ICICLE_AI_SPEED      = 38;
export const ICICLE_CHASE_RANGE   = 350;
export const ICICLE_ATTACK_RANGE  = 130;
export const ICICLE_FIRE_COOLDOWN = 0.10;
export const ICICLE_BEAM_DAMAGE   = 3;

// THREE.Group — added to scene by game.js
export const icicle = new THREE.Group();
icicle.position.set(-300, 150, 400);

// Ice glow light
export const icicleIceGlow = new THREE.PointLight(0x88ddff, 3, 40);
icicle.add(icicleIceGlow);

// Trail config
export const ICE_TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // white core
  [0xaaeeff, 0.85],  // light blue mid
  [0x55ccff, 0.65],  // cyan-blue outer
];

// Particle layers for the ice bolt — innermost to outermost
// [color, pointSize, particleCount, radialSpread]
const ICE_PARTICLE_LAYERS = [
  [0xffffff, 6,  30,  1.5 ],  // pure white core
  [0xe8f8ff, 11, 60,  4.0 ],  // near-white
  [0xaaeeff, 18, 100, 8.0 ],  // light blue
  [0x55ccff, 26, 80,  13.0],  // cyan-blue
  [0x2299cc, 34, 45,  18.0],  // deeper blue outer
];

// ── Private AI state ──
let icicleAttackTarget  = 'hero';
const icicleWaypoint    = new THREE.Vector3(-300, 150, 400);
let icicleWaypointTimer = 0;
let icicleAIYaw         = 0;
let icicleAIPitch       = 0;
let icicleFireCooldown  = 0;
let icicleAvoidTimer    = 0;
const icicleAvoidWaypoint = new THREE.Vector3();

// ── Private bolt state ──
let icicleBoltGroup = null;
let icicleBoltTimer = 0;

// ─────────────────────────────────────────────
//  MODEL LOADING
// ─────────────────────────────────────────────
export function loadModel(gltfLoader, onAssetLoaded) {
  return new Promise(resolve => {
    gltfLoader.load('assets/Icicle.glb',
      gltf => {
        const model = gltf.scene;
        orientModelForFlight(model);
        icicle.add(model);
        onAssetLoaded();
        resolve();
      },
      undefined,
      err => {
        console.warn('Icicle.glb failed, using placeholder:', err);
        buildPlaceholderModel(icicle, 0x88ccee, 0xaaeeff, 0x224466);
        onAssetLoaded();
        resolve();
      }
    );
  });
}

// ─────────────────────────────────────────────
//  ICE BOLT WEAPON
// ─────────────────────────────────────────────
export function fireIcebolt(fromPlayer = false) {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(icicle.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.35;
  boltDir.y += (Math.random() - 0.5) * 0.28;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(icicle.quaternion);
  const origin     = icicle.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  G.raycaster.set(origin, boltDir);
  const bHits   = G.raycaster.intersectObjects(G.buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  if (fromPlayer) {
    // Player-controlled: hit any target except self
    if (!blocked && !G.heroDefeated && G.playerChar !== 'hero' &&
        distToSegment(origin, endPoint, G.hero.position) < 9)
      takeDamage('hero', ICICLE_BEAM_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
    if (!blocked && G.infernoState !== 'defeated' && G.playerChar !== 'inferno' &&
        distToSegment(origin, endPoint, G.inferno.position) < 9)
      takeDamage('inferno', ICICLE_BEAM_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
    if (!blocked && G.foliageState !== 'defeated' && G.playerChar !== 'foliage' &&
        distToSegment(origin, endPoint, G.foliage.position) < 9)
      takeDamage('foliage', ICICLE_BEAM_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
  } else {
    // AI-controlled: use target priority
    if (!blocked && icicleAttackTarget === 'hero' && distToSegment(origin, endPoint, G.playerGroup.position) < 9) {
      takeDamage(G.playerChar, ICICLE_BEAM_DAMAGE);
    } else if (!blocked && icicleAttackTarget === 'inferno' && G.infernoState !== 'defeated' &&
               distToSegment(origin, endPoint, G.inferno.position) < 9) {
      takeDamage('inferno', ICICLE_BEAM_DAMAGE);
    } else if (!blocked && icicleAttackTarget === 'foliage' && G.foliageState !== 'defeated' &&
               distToSegment(origin, endPoint, G.foliage.position) < 9) {
      takeDamage('foliage', ICICLE_BEAM_DAMAGE);
    }
  }

  // ── Particle-cloud ice bolt ──
  const boltLen = origin.distanceTo(endPoint);
  const _up    = Math.abs(boltDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp1  = new THREE.Vector3().crossVectors(boltDir, _up).normalize();
  const perp2  = new THREE.Vector3().crossVectors(boltDir, perp1).normalize();

  if (icicleBoltGroup) { G.scene.remove(icicleBoltGroup); icicleBoltGroup = null; }
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
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    icicleBoltGroup.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color, size: ptSize, sizeAttenuation: true, transparent: true, opacity: 0.88 })
    ));
  }

  icicleBoltTimer = 0.12;
  G.scene.add(icicleBoltGroup);

  const impact = new THREE.PointLight(0x88ddff, 90, 180);
  impact.position.copy(endPoint);
  G.scene.add(impact);
  setTimeout(() => G.scene.remove(impact), 200);

  const muzzle = new THREE.PointLight(0xaaeeff, 80, 60);
  muzzle.position.copy(origin);
  G.scene.add(muzzle);
  setTimeout(() => G.scene.remove(muzzle), 120);
}

// ─────────────────────────────────────────────
//  BOLT TIMER CLEANUP  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateIcicleBolts(dt) {
  if (icicleBoltGroup) {
    icicleBoltTimer -= dt;
    if (icicleBoltTimer <= 0) { G.scene.remove(icicleBoltGroup); icicleBoltGroup = null; }
  }
}

// ─────────────────────────────────────────────
//  AI UPDATE  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateIcicleAI(dt, t) {
  // ── Defeat / respawn handling ──
  if (G.icicleState === 'defeated') {
    G.icicleDefeatedTimer -= dt;
    G.icicleDefeatedVelY  -= 90 * dt;
    icicle.position.y     += G.icicleDefeatedVelY * dt;
    if (icicle.position.y < 1) { icicle.position.y = 1; G.icicleDefeatedVelY = 0; }
    icicle.rotation.z += 3.0 * dt;
    icicle.rotation.x += 1.5 * dt;

    if (G.icicleDefeatedTimer <= 0 && !G.icicleRespawning) {
      icicle.visible     = false;
      G.icicleRespawning = true;
      setTimeout(() => {
        G.icicleHealth = ICICLE_MAX_HEALTH;
        G.icicleHealthFill.style.width = '100%';
        G.icicleState = 'patrol';
        icicle.position.set(
          G.playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          G.playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        icicle.rotation.set(0, 0, 0);
        icicle.visible      = true;
        G.icicleDefeatedVelY  = 0;
        G.icicleRespawning    = false;
        showCombatMessage('ICICLE RETURNS!', '#aaeeff', 2500);
      }, 8000);
    }
    return;
  }

  // Skip AI logic when the player is controlling Icicle
  if (G.playerChar === 'icicle') return;

  // ── State machine ──
  const distToHero    = icicle.position.distanceTo(G.playerGroup.position);
  const distToInferno = G.infernoState !== 'defeated' ? icicle.position.distanceTo(G.inferno.position) : Infinity;
  const distToFoliage = G.foliageState !== 'defeated' ? icicle.position.distanceTo(G.foliage.position) : Infinity;
  const closestEnemyDist   = Math.min(distToInferno, distToFoliage);
  const closestEnemyTarget = distToInferno <= distToFoliage ? 'inferno' : 'foliage';

  if (!isPlayerDefeated() && distToHero < ICICLE_ATTACK_RANGE) {
    G.icicleState = 'attack'; icicleAttackTarget = 'hero';
  } else if (closestEnemyDist < ICICLE_ATTACK_RANGE) {
    G.icicleState = 'attack'; icicleAttackTarget = closestEnemyTarget;
  } else if (!isPlayerDefeated() && distToHero < ICICLE_CHASE_RANGE) {
    G.icicleState = 'chase'; icicleAttackTarget = 'hero';
  } else if (closestEnemyDist < ICICLE_CHASE_RANGE) {
    G.icicleState = 'chase'; icicleAttackTarget = closestEnemyTarget;
  } else {
    G.icicleState = 'patrol';
  }

  // ── Choose target position ──
  const icicleChasePos = icicleAttackTarget === 'inferno' ? G.inferno.position :
                         icicleAttackTarget === 'foliage' ? G.foliage.position : G.hero.position;
  let target;
  if (icicleAvoidTimer > 0) {
    // Fly to the avoidance waypoint until clear of the building
    icicleAvoidTimer -= dt;
    target = icicleAvoidWaypoint;
  } else if (G.icicleState === 'patrol') {
    icicleWaypointTimer -= dt;
    if (icicleWaypointTimer <= 0 || icicle.position.distanceTo(icicleWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      icicleWaypoint.set(
        G.playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        G.playerGroup.position.z + Math.sin(angle) * radius
      );
      icicleWaypointTimer = 4 + Math.random() * 6;
    }
    target = icicleWaypoint;
  } else {
    target = icicleChasePos;
  }

  // ── Steer toward target ──
  const toTarget    = new THREE.Vector3().subVectors(target, icicle.position);
  const flatDist    = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  // Weave the approach angle slightly when chasing to avoid circling orbits
  const icicleChaseOffset = G.icicleState !== 'patrol' ? Math.sin(t * 0.85 + 1.0) * 0.22 : 0;
  const targetYaw   = Math.atan2(-toTarget.x, -toTarget.z) + icicleChaseOffset;
  const targetPitch = Math.atan2(toTarget.y, flatDist + 0.001);

  let dyaw = targetYaw - icicleAIYaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const icicleHeadingError = Math.abs(dyaw);
  icicleAIYaw   += dyaw * Math.min(1, 3.2 * dt);
  icicleAIPitch += ((G.isFloating ? 0 : targetPitch) - icicleAIPitch) * Math.min(1, 3.2 * dt);
  icicleAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, icicleAIPitch));

  const icPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), icicleAIPitch);
  const icYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), icicleAIYaw);
  icicle.quaternion.copy(icYaw).multiply(icPitch);

  // ── Move ──
  // Slow down when not facing the target — breaks circular orbit patterns
  const icicleHeadingScale = G.icicleState !== 'patrol'
    ? Math.max(0.15, Math.cos(Math.min(icicleHeadingError, Math.PI / 2)))
    : 1.0;
  const icicleSpeed = (G.icicleState === 'attack' ? ICICLE_AI_SPEED * 0.6 : ICICLE_AI_SPEED) * icicleHeadingScale;
  const icfwd = new THREE.Vector3(0, 0, -1).applyQuaternion(icicle.quaternion);
  const icicleFwdAmt = icicleSpeed;
  const icicleTentative = icicle.position.clone()
    .addScaledVector(icfwd, icicleFwdAmt * dt);
  icicleTentative.y = Math.max(15, icicleTentative.y);
  if (!heroHitsBuilding(icicleTentative)) {
    icicle.position.copy(icicleTentative);
  } else {
    icicle.position.y = Math.max(15, icicle.position.y);
    // Set an avoidance waypoint sideways and upward so the AI doesn't
    // immediately re-target through the building
    const icicleEscapeAngle = icicleAIYaw + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    icicleAvoidWaypoint.set(
      icicle.position.x + Math.sin(icicleEscapeAngle) * 180,
      icicle.position.y + 90,
      icicle.position.z + Math.cos(icicleEscapeAngle) * 180
    );
    icicleAvoidTimer    = 2.5;
    icicleWaypointTimer = 0;
  }

  // Pulse ice glow
  icicleIceGlow.intensity = 3 + Math.sin(t * 9 + 1.5) * 1.8;

  // Fire on cooldown while attacking
  icicleFireCooldown -= dt;
  if (G.icicleState === 'attack' && icicleFireCooldown <= 0) {
    fireIcebolt();
    icicleFireCooldown = ICICLE_FIRE_COOLDOWN;
  }
}
