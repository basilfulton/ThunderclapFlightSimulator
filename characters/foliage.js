import * as THREE from 'three';
import { G, FOLIAGE_MAX_HEALTH, PLAYER_DAMAGE_MULTIPLIER, MAX_PITCH } from '../state.js';
import { distToSegment, takeDamage, showCombatMessage, isPlayerDefeated, heroHitsBuilding } from './combat.js';
import { orientModelForFlight, buildPlaceholderModel } from './modelUtils.js';

// ─────────────────────────────────────────────
//  FOLIAGE  (plant villain)
// ─────────────────────────────────────────────

export const FOLIAGE_AI_SPEED      = 38;
export const FOLIAGE_CHASE_RANGE   = 350;
export const FOLIAGE_ATTACK_RANGE  = 130;
export const FOLIAGE_FIRE_COOLDOWN = 0.10;
export const FOLIAGE_VINE_DAMAGE   = 3;

// THREE.Group — added to scene by game.js
export const foliage = new THREE.Group();
foliage.position.set(0, 150, 500);

// Vine glow light
export const foliageVineGlow = new THREE.PointLight(0x44cc00, 3, 40);
foliage.add(foliageVineGlow);

// Trail config
export const VINE_TRAIL_CONFIGS = [
  [0x88ff44, 1.0],   // bright green core
  [0x2d9900, 0.85],  // mid green
  [0x0d5500, 0.65],  // dark green outer
];

// ── Private AI state ──
let foliageAttackTarget  = 'hero';
const foliageWaypoint    = new THREE.Vector3(0, 150, 500);
let foliageWaypointTimer = 0;
let foliageAIYaw         = 0;
let foliageAIPitch       = 0;
let foliageFireCooldown  = 0;

// ── Private bolt state ──
let foliageBoltGroup = null;
let foliageBoltTimer = 0;

// ─────────────────────────────────────────────
//  MODEL LOADING
// ─────────────────────────────────────────────
export function loadModel(gltfLoader, onAssetLoaded) {
  return new Promise(resolve => {
    gltfLoader.load('assets/Foliage.glb',
      gltf => {
        const model = gltf.scene;
        orientModelForFlight(model);
        foliage.add(model);
        onAssetLoaded();
        resolve();
      },
      undefined,
      err => {
        console.warn('Foliage.glb failed, using placeholder:', err);
        buildPlaceholderModel(foliage, 0x1a6600, 0x44cc00, 0x113300);
        onAssetLoaded();
        resolve();
      }
    );
  });
}

// ─────────────────────────────────────────────
//  VINE WEAPON
// ─────────────────────────────────────────────
export function fireVines(fromPlayer = false) {
  const boltDir = new THREE.Vector3(0, 0, -1).applyQuaternion(foliage.quaternion);
  boltDir.x += (Math.random() - 0.5) * 0.3;
  boltDir.y += (Math.random() - 0.5) * 0.22;
  boltDir.normalize();

  const handOffset = new THREE.Vector3(0.9, -0.3, -1.5).applyQuaternion(foliage.quaternion);
  const origin     = foliage.position.clone().add(handOffset);
  let endPoint     = origin.clone().addScaledVector(boltDir, 400);

  G.raycaster.set(origin, boltDir);
  const bHits   = G.raycaster.intersectObjects(G.buildingMeshes, false);
  const blocked = bHits.length > 0 && bHits[0].distance < origin.distanceTo(endPoint);
  if (blocked) endPoint = bHits[0].point.clone();

  if (fromPlayer) {
    // Player-controlled: hit any target except self
    if (!blocked && !G.heroDefeated && G.playerChar !== 'hero' &&
        distToSegment(origin, endPoint, G.hero.position) < 9)
      takeDamage('hero', FOLIAGE_VINE_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
    if (!blocked && G.infernoState !== 'defeated' && G.playerChar !== 'inferno' &&
        distToSegment(origin, endPoint, G.inferno.position) < 9)
      takeDamage('inferno', FOLIAGE_VINE_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
    if (!blocked && G.icicleState !== 'defeated' && G.playerChar !== 'icicle' &&
        distToSegment(origin, endPoint, G.icicle.position) < 9)
      takeDamage('icicle', FOLIAGE_VINE_DAMAGE * PLAYER_DAMAGE_MULTIPLIER);
  } else {
    // AI-controlled: use target priority
    if (!blocked && foliageAttackTarget === 'hero' && distToSegment(origin, endPoint, G.playerGroup.position) < 9) {
      takeDamage(G.playerChar, FOLIAGE_VINE_DAMAGE);
    } else if (!blocked && foliageAttackTarget === 'inferno' && G.infernoState !== 'defeated' &&
               distToSegment(origin, endPoint, G.inferno.position) < 9) {
      takeDamage('inferno', FOLIAGE_VINE_DAMAGE);
    } else if (!blocked && foliageAttackTarget === 'icicle' && G.icicleState !== 'defeated' &&
               distToSegment(origin, endPoint, G.icicle.position) < 9) {
      takeDamage('icicle', FOLIAGE_VINE_DAMAGE);
    }
  }

  // ── 4 snaking vine strands ──
  const boltLen  = origin.distanceTo(endPoint);
  const _up   = Math.abs(boltDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const perp1 = new THREE.Vector3().crossVectors(boltDir, _up).normalize();
  const perp2 = new THREE.Vector3().crossVectors(boltDir, perp1).normalize();

  if (foliageBoltGroup) { G.scene.remove(foliageBoltGroup); foliageBoltGroup = null; }
  foliageBoltGroup = new THREE.Group();

  const STRAND_PTS   = 48;
  const strandColors = [0x0d5500, 0x1a8800, 0x2dbb00, 0x66ee22];
  const strandSizes  = [14,       10,       7,        5      ];

  for (let s = 0; s < 4; s++) {
    const phase = (s / 4) * Math.PI * 2;
    const freq  = 2.8 + Math.random() * 1.8;
    const amp   = 3.5 + Math.random() * 4.5;
    const pos   = new Float32Array(STRAND_PTS * 3);

    for (let i = 0; i < STRAND_PTS; i++) {
      const t     = i / (STRAND_PTS - 1);
      const taper = 1 - t * 0.45;   // vines thin slightly toward tip
      const s1    = Math.sin(t * Math.PI * freq + phase)        * amp * taper;
      const s2    = Math.cos(t * Math.PI * freq * 0.65 + phase) * amp * 0.55 * taper;

      const p = new THREE.Vector3()
        .copy(origin)
        .addScaledVector(boltDir, t * boltLen)
        .addScaledVector(perp1, s1)
        .addScaledVector(perp2, s2);

      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    foliageBoltGroup.add(new THREE.Points(geo,
      new THREE.PointsMaterial({ color: strandColors[s], size: strandSizes[s],
                                  sizeAttenuation: true, transparent: true, opacity: 0.94 })
    ));
  }

  // ── Scattered leaf-burst particles ──
  const leafCount = 60;
  const leafPos   = new Float32Array(leafCount * 3);
  for (let i = 0; i < leafCount; i++) {
    const t = Math.random();
    const p = new THREE.Vector3()
      .copy(origin)
      .addScaledVector(boltDir, t * boltLen)
      .addScaledVector(perp1, (Math.random() - 0.5) * 7)
      .addScaledVector(perp2, (Math.random() - 0.5) * 7);
    leafPos[i * 3] = p.x; leafPos[i * 3 + 1] = p.y; leafPos[i * 3 + 2] = p.z;
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  foliageBoltGroup.add(new THREE.Points(leafGeo,
    new THREE.PointsMaterial({ color: 0x88ff44, size: 9, sizeAttenuation: true,
                                transparent: true, opacity: 0.72 })
  ));

  foliageBoltTimer = 0.15;
  G.scene.add(foliageBoltGroup);

  const impact = new THREE.PointLight(0x44cc00, 90, 180);
  impact.position.copy(endPoint);
  G.scene.add(impact);
  setTimeout(() => G.scene.remove(impact), 200);

  const muzzleF = new THREE.PointLight(0x88ff44, 80, 60);
  muzzleF.position.copy(origin);
  G.scene.add(muzzleF);
  setTimeout(() => G.scene.remove(muzzleF), 120);
}

// ─────────────────────────────────────────────
//  BOLT TIMER CLEANUP  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateFoliageBolts(dt) {
  if (foliageBoltGroup) {
    foliageBoltTimer -= dt;
    if (foliageBoltTimer <= 0) { G.scene.remove(foliageBoltGroup); foliageBoltGroup = null; }
  }
}

// ─────────────────────────────────────────────
//  AI UPDATE  (call every frame from game.js)
// ─────────────────────────────────────────────
export function updateFoliageAI(dt, t) {
  // ── Defeat / respawn handling ──
  if (G.foliageState === 'defeated') {
    G.foliageDefeatedTimer -= dt;
    G.foliageDefeatedVelY  -= 90 * dt;
    foliage.position.y     += G.foliageDefeatedVelY * dt;
    if (foliage.position.y < 1) { foliage.position.y = 1; G.foliageDefeatedVelY = 0; }
    foliage.rotation.z += 3.0 * dt;
    foliage.rotation.x += 1.5 * dt;

    if (G.foliageDefeatedTimer <= 0 && !G.foliageRespawning) {
      foliage.visible     = false;
      G.foliageRespawning = true;
      setTimeout(() => {
        G.foliageHealth = FOLIAGE_MAX_HEALTH;
        G.foliageHealthFill.style.width = '100%';
        G.foliageState = 'patrol';
        foliage.position.set(
          G.playerGroup.position.x + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200),
          120 + Math.random() * 80,
          G.playerGroup.position.z + (Math.random() < 0.5 ? -1 : 1) * (250 + Math.random() * 200)
        );
        foliage.rotation.set(0, 0, 0);
        foliage.visible      = true;
        G.foliageDefeatedVelY  = 0;
        G.foliageRespawning    = false;
        showCombatMessage('FOLIAGE RETURNS!', '#44cc00', 2500);
      }, 8000);
    }
    return;
  }

  // Skip AI logic when the player is controlling Foliage
  if (G.playerChar === 'foliage') return;

  // ── State machine ──
  const distToHero    = foliage.position.distanceTo(G.playerGroup.position);
  const distToInferno = G.infernoState !== 'defeated' ? foliage.position.distanceTo(G.inferno.position) : Infinity;
  const distToIcicle  = G.icicleState  !== 'defeated' ? foliage.position.distanceTo(G.icicle.position)  : Infinity;
  const closestEnemyDist   = Math.min(distToInferno, distToIcicle);
  const closestEnemyTarget = distToInferno <= distToIcicle ? 'inferno' : 'icicle';

  if (!isPlayerDefeated() && distToHero < FOLIAGE_ATTACK_RANGE) {
    G.foliageState = 'attack'; foliageAttackTarget = 'hero';
  } else if (closestEnemyDist < FOLIAGE_ATTACK_RANGE) {
    G.foliageState = 'attack'; foliageAttackTarget = closestEnemyTarget;
  } else if (!isPlayerDefeated() && distToHero < FOLIAGE_CHASE_RANGE) {
    G.foliageState = 'chase'; foliageAttackTarget = 'hero';
  } else if (closestEnemyDist < FOLIAGE_CHASE_RANGE) {
    G.foliageState = 'chase'; foliageAttackTarget = closestEnemyTarget;
  } else {
    G.foliageState = 'patrol';
  }

  // ── Choose target position ──
  const foliageChasePos = foliageAttackTarget === 'inferno' ? G.inferno.position :
                          foliageAttackTarget === 'icicle'  ? G.icicle.position  : G.hero.position;
  let target;
  if (G.foliageState === 'patrol') {
    foliageWaypointTimer -= dt;
    if (foliageWaypointTimer <= 0 || foliage.position.distanceTo(foliageWaypoint) < 40) {
      const angle  = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 320;
      foliageWaypoint.set(
        G.playerGroup.position.x + Math.cos(angle) * radius,
        75 + Math.random() * 140,
        G.playerGroup.position.z + Math.sin(angle) * radius
      );
      foliageWaypointTimer = 4 + Math.random() * 6;
    }
    target = foliageWaypoint;
  } else {
    target = foliageChasePos;
  }

  // ── Steer toward target ──
  const toTarget    = new THREE.Vector3().subVectors(target, foliage.position);
  const flatDist    = Math.sqrt(toTarget.x * toTarget.x + toTarget.z * toTarget.z);
  const targetYaw   = Math.atan2(-toTarget.x, -toTarget.z);
  const targetPitch = Math.atan2(toTarget.y, flatDist + 0.001);

  let dyaw = targetYaw - foliageAIYaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  foliageAIYaw   += dyaw * Math.min(1, 2.5 * dt);
  foliageAIPitch += ((G.isFloating ? 0 : targetPitch) - foliageAIPitch) * Math.min(1, 2.5 * dt);
  foliageAIPitch  = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, foliageAIPitch));

  const fPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), foliageAIPitch);
  const fYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), foliageAIYaw);
  foliage.quaternion.copy(fYaw).multiply(fPitch);

  // ── Move ──
  const foliageSpeed = G.foliageState === 'attack' ? FOLIAGE_AI_SPEED * 0.6 : FOLIAGE_AI_SPEED;
  const ffwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(foliage.quaternion);
  const fright = new THREE.Vector3(1, 0, 0).applyQuaternion(foliage.quaternion);
  const foliageDistToTarget = foliage.position.distanceTo(foliageChasePos);
  const tooClose        = G.foliageState === 'attack' && foliageDistToTarget < FOLIAGE_ATTACK_RANGE * 0.55;
  const foliageFwdAmt    = tooClose ? 0 : foliageSpeed;
  const foliageStrafeAmt = G.foliageState === 'attack' ? Math.sin(t * 1.1 + 3.5) * FOLIAGE_AI_SPEED * 0.55 : 0;
  const foliageBobAmt    = G.foliageState === 'attack' ? Math.sin(t * 1.9 + 0.3) * FOLIAGE_AI_SPEED * 0.2  : 0;
  const foliageTentative = foliage.position.clone()
    .addScaledVector(ffwd,   foliageFwdAmt    * dt)
    .addScaledVector(fright, foliageStrafeAmt * dt)
    .addScaledVector(new THREE.Vector3(0, 1, 0), foliageBobAmt * dt);
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
  if (G.foliageState === 'attack' && foliageFireCooldown <= 0) {
    fireVines();
    foliageFireCooldown = FOLIAGE_FIRE_COOLDOWN;
  }
}
