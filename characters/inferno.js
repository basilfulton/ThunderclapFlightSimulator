import * as THREE from 'three';
import { G, INFERNO_MAX_HEALTH, PLAYER_DAMAGE_MULTIPLIER, MAX_PITCH } from '../state.js';
import { distToSegment, takeDamage, showCombatMessage, isPlayerDefeated, heroHitsBuilding } from './combat.js';
import { orientModelForFlight, buildPlaceholderModel } from './modelUtils.js';

// ─────────────────────────────────────────────
//  INFERNO  (fire villain)
// ─────────────────────────────────────────────

export const INFERNO_AI_SPEED      = 38;
export const INFERNO_CHASE_RANGE   = 350;
export const INFERNO_ATTACK_RANGE  = 130;
export const INFERNO_FIRE_COOLDOWN = 0.10;
export const INFERNO_FIRE_DAMAGE   = 3;

// THREE.Group — added to scene by game.js
export const inferno = new THREE.Group();
inferno.position.set(300, 150, -400);

// Fire glow light
export const infernoFireGlow = new THREE.PointLight(0xff4400, 3, 40);
inferno.add(infernoFireGlow);

// Trail config
export const FIRE_TRAIL_CONFIGS = [
  [0xffffff, 1.0],   // white core
  [0xff8822, 0.85],  // orange mid
  [0xff2200, 0.65],  // red outer
];

// Particle layers for the fire bolt — innermost to outermost
// [color, pointSize, particleCount, radialSpread]
const FIRE_PARTICLE_LAYERS = [
  [0xffffff, 6,  30,  1.5 ],  // white-hot core
  [0xffee55, 11, 60,  4.0 ],  // yellow
  [0xff7700, 18, 100, 8.0 ],  // orange
  [0xff2200, 26, 80,  13.0],  // red
  [0x771100, 34, 45,  18.0],  // dark ember
];

// ── Private AI state ──
let infernoAttackTarget  = 'hero';
const infernoWaypoint    = new THREE.Vector3(300, 150, -400);
let infernoWaypointTimer = 0;
let infernoAIYaw         = 0;
let infernoAIPitch       = 0;
let infernoFireCooldown  = 0;

// ── Private bolt state ──
let infernoBoltGroup = null;
let infernoBoltTimer = 0;

// ─────────────────────────────────────────────
//  MODEL LOADING
// ─────────────────────────────────────────────
export function loadModel(gltfLoader, onAssetLoaded) {
  return new Promise(resolve => {
    gltfLoader.load('assets/Inferno.glb',
      gltf => {
        const model = gltf.scene;
        orientModelForFlight(model);
        inferno.add(model);
        onAssetLoaded();
        resolve();
      },
      undefined,
      err => {
        console.warn('Inferno.glb failed, using placeholder:', err);
        buildPlaceholderModel(inferno, 0xaa1111, 0xff6600, 0x992200);
        onAssetLoaded();
        resolve();
      }
    );
  });
}

// ─────────────────────────────────────────────
//  FIRE BOLT WEAPON
// ─────────────────────────────────────────────
export function fireFirebolt(fromPlayer = false) {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(inferno.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.35;
  boltDir.y += (Math.random() - 0.5) * 0.28;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(inferno.quaternion);
  const origin     = inferno.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  G.raycaster.set(origin, boltDir);
  const bHits   = G.raycaster.intersectObjects(G.buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  if (fromPlayer) {
    // Player-controlled: hit any target except self
    if (!blocked && !G.heroDefeated && G.playerChar !== 'hero' &&
        distToSegment(origin, endPoint, G.hero.position) < 9)
      takeDamage('hero', INFERNO_FIRE_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
    if (!blocked && G.icicleState !== 'defeated' && G.playerChar !== 'icicle' &&
        distToSegment(origin, endPoint, G.icicle.position) < 9)
      takeDamage('icicle', INFERNO_FIRE_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
    if (!blocked && G.foliageState !== 'defeated' && G.playerChar !== 'foliage' &&
        distToSegment(origin, endPoint, G.foliage.position) < 9)
      takeDamage('foliage', INFERNO_FIRE_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
  } else {
    // AI-controlled: use target priority
    if (!blocked && infernoAttackTarget === 'hero' && distToSegment(origin, endPoint, G.playerGroup.position) < 9) {
      takeDamage(G.playerChar, INFERNO_FIRE_DAMAGE);
    } else if (!blocked && infernoAttackTarget === 'icicle' && G.icicleState !== 'defeated' &&
               distToSegment(origin, endPoint, G.icicle.position) < 9) {
      takeDamage('icicle', INFERNO_FIRE_DAMAGE);
    } else if (!blocked && infernoAttackTarget === 'foliage' && G.foliageState !== 'defeated' &&
               distToSegment(origin, endPoint, G.foliage.position) < 9) {
      takeDamage('foliage', INFERNO_FIRE_DAMAGE);
    }
  }

  // ── Particle-cloud fire bolt ──
  const boltLen = origin.distanceTo(endPoint);
  const _up    = Math.abs(boltDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp1  = new THREE.Vector3().crossVectors(boltDir, _up).normalize();
  const perp2  = new THREE.Vector3().crossVectors(boltDir, perp1).normalize();

  if (infernoBoltGroup) { G.scene.remove(infernoBoltGroup); infernoBoltGroup = null; }
  infernoBoltGroup = new THREE.Group();

  for (const [color, ptSize, count, spread] of FIRE_PARTICLE_LAYERS) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t        = Math.random();
      const envelope = Math.sin(t * Math.PI);
      const s        = spread * envelope;
      const p = new THREE.Vector3().copy(origin).addScaledVector(boltDir, t * boltLen);
      p.addScaledVector(perp1, (Math.random() - 0.5) * s * 2);
      p.addScaledVector(perp2, (Math.random() - 0.5) * s * 2);
      p.y += Math.random() * s * 0.45;  // fire rises upward
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    infernoBoltGroup.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color, size: ptSize, sizeAttenuation: true, transparent: true, opacity: 0.88 })
    ));
  }

  infernoBoltTimer = 0.12;
  G.scene.add(infernoBoltGroup);

  const impact = new THREE.PointLight(0xff5500, 90, 180);
  impact.position.copy(endPoint);
  G.scene.add(impact);
  setTimeout(() => G.scene.remove(impact), 200);

  const muzzle = new THREE.PointLight(0xff9900, 80, 60);
  muzzle.position.copy(origin);
  G.scene.add(muzzle);
  setTimeout(() => G.scene.remove(muzzle), 120);
}

// ─────────────────────────────────────────────
//  BOLT TIMER CLEANUP  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateInfernoBolts(dt) {
  if (infernoBoltGroup) {
    infernoBoltTimer -= dt;
    if (infernoBoltTimer <= 0) { G.scene.remove(infernoBoltGroup); infernoBoltGroup = null; }
  }
}

// ─────────────────────────────────────────────
//  AI UPDATE  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateInfernoAI(dt, t) {
  // ── Defeat / respawn handling ──
  if (G.infernoState === 'defeated') {
    G.infernoDefeatedTimer -= dt;
    G.infernoDefeatedVelY  -= 90 * dt;
    inferno.position.y     += G.infernoDefeatedVelY * dt;
    if (inferno.position.y < 1) { inferno.position.y = 1; G.infernoDefeatedVelY = 0; }
    inferno.rotation.z += 3.0 * dt;
    inferno.rotation.x += 1.5 * dt;

    if (G.infernoDefeatedTimer <= 0 && !G.infernoRespawning) {
      inferno.visible     = false;
      G.infernoRespawning = true;
      setTimeout(() => {
        G.infernoHealth = INFERNO_MAX_HEALTH;
        G.infernoHealthFill.style.width = '100%';
        G.infernoState = 'patrol';
        inferno.position.set(
          G.playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          G.playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        inferno.rotation.set(0, 0, 0);
        inferno.visible      = true;
        G.infernoDefeatedVelY  = 0;
        G.infernoRespawning    = false;
        showCombatMessage('INFERNO RETURNS!', '#ff3300', 2500);
      }, 8000);
    }
    return;
  }

  // Skip AI logic when the player is controlling Inferno
  if (G.playerChar === 'inferno') return;

  // ── State machine ──
  const distToHero    = inferno.position.distanceTo(G.playerGroup.position);
  const distToIcicle  = G.icicleState  !== 'defeated' ? inferno.position.distanceTo(G.icicle.position)  : Infinity;
  const distToFoliage = G.foliageState !== 'defeated' ? inferno.position.distanceTo(G.foliage.position) : Infinity;
  const closestEnemyDist   = Math.min(distToIcicle, distToFoliage);
  const closestEnemyTarget = distToIcicle <= distToFoliage ? 'icicle' : 'foliage';

  if (!isPlayerDefeated() && distToHero < INFERNO_ATTACK_RANGE) {
    G.infernoState = 'attack'; infernoAttackTarget = 'hero';
  } else if (closestEnemyDist < INFERNO_ATTACK_RANGE) {
    G.infernoState = 'attack'; infernoAttackTarget = closestEnemyTarget;
  } else if (!isPlayerDefeated() && distToHero < INFERNO_CHASE_RANGE) {
    G.infernoState = 'chase'; infernoAttackTarget = 'hero';
  } else if (closestEnemyDist < INFERNO_CHASE_RANGE) {
    G.infernoState = 'chase'; infernoAttackTarget = closestEnemyTarget;
  } else {
    G.infernoState = 'patrol';
  }

  // ── Choose target position ──
  const infernoChasePos = infernoAttackTarget === 'icicle'  ? G.icicle.position  :
                          infernoAttackTarget === 'foliage' ? G.foliage.position : G.hero.position;
  let target;
  if (G.infernoState === 'patrol') {
    infernoWaypointTimer -= dt;
    if (infernoWaypointTimer <= 0 || inferno.position.distanceTo(infernoWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      infernoWaypoint.set(
        G.playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        G.playerGroup.position.z + Math.sin(angle) * radius
      );
      infernoWaypointTimer = 4 + Math.random() * 6;
    }
    target = infernoWaypoint;
  } else {
    target = infernoChasePos;
  }

  // ── Steer toward target ──
  const toTarget    = new THREE.Vector3().subVectors(target, inferno.position);
  const flatDist    = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  const targetYaw   = Math.atan2(-toTarget.x, -toTarget.z);
  const targetPitch = Math.atan2(toTarget.y, flatDist + 0.001);

  let dyaw = targetYaw - infernoAIYaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  infernoAIYaw   += dyaw * Math.min(1, 2.5 * dt);
  infernoAIPitch += ((G.isFloating ? 0 : targetPitch) - infernoAIPitch) * Math.min(1, 2.5 * dt);
  infernoAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, infernoAIPitch));

  const iPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), infernoAIPitch);
  const iYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), infernoAIYaw);
  inferno.quaternion.copy(iYaw).multiply(iPitch);

  // ── Move ──
  const infernoSpeed = G.infernoState === 'attack' ? INFERNO_AI_SPEED * 0.6 : INFERNO_AI_SPEED;
  const ifwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(inferno.quaternion);
  const iright = new THREE.Vector3(1, 0, 0).applyQuaternion(inferno.quaternion);
  const infernoDistToTarget = inferno.position.distanceTo(infernoChasePos);
  const tooClose       = G.infernoState === 'attack' && infernoDistToTarget < INFERNO_ATTACK_RANGE * 0.55;
  const infernoFwdAmt    = tooClose ? 0 : infernoSpeed;
  const infernoStrafeAmt = G.infernoState === 'attack' ? Math.sin(t * 1.5 + 1.1) * INFERNO_AI_SPEED * 0.55 : 0;
  const infernoBobAmt    = G.infernoState === 'attack' ? Math.sin(t * 1.8 + 2.5) * INFERNO_AI_SPEED * 0.2  : 0;
  const infernoTentative = inferno.position.clone()
    .addScaledVector(ifwd,   infernoFwdAmt    * dt)
    .addScaledVector(iright, infernoStrafeAmt * dt)
    .addScaledVector(new THREE.Vector3(0, 1, 0), infernoBobAmt * dt);
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
  if (G.infernoState === 'attack' && infernoFireCooldown <= 0) {
    fireFirebolt();
    infernoFireCooldown = INFERNO_FIRE_COOLDOWN;
  }
}
