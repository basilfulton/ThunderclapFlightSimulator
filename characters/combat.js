import * as THREE from 'three';
import {
  G,
  HERO_MAX_HEALTH, INFERNO_MAX_HEALTH, ICICLE_MAX_HEALTH, FOLIAGE_MAX_HEALTH,
} from '../state.js';

// ─────────────────────────────────────────────
//  BUILDING COLLISION
// ─────────────────────────────────────────────
const HERO_COL_RADIUS = 2;
const colRaycaster    = new THREE.Raycaster();
const COL_DIRS = [
  new THREE.Vector3( 1,     0,  0    ), new THREE.Vector3(-1,     0,  0    ),
  new THREE.Vector3( 0,     0,  1    ), new THREE.Vector3( 0,     0, -1    ),
  new THREE.Vector3( 0.707, 0,  0.707), new THREE.Vector3(-0.707, 0,  0.707),
  new THREE.Vector3( 0.707, 0, -0.707), new THREE.Vector3(-0.707, 0, -0.707),
];

export function heroHitsBuilding(pos) {
  for (const bd of G.buildingData) {
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

// ─────────────────────────────────────────────
//  LIGHTNING HELPERS
// ─────────────────────────────────────────────
export function buildJaggedLine(from, to, segments, maxOffset) {
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
        (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40
      ));
      buildJaggedLine(p.clone(), forkEnd, 5, maxOffset * 0.5).forEach(fp => pts.push(fp));
      pts.push(p.clone());
    }
  }
  pts.push(to.clone());
  return pts;
}

// Returns shortest distance from point p to line segment a→b
export function distToSegment(a, b, p) {
  const ab   = new THREE.Vector3().subVectors(b, a);
  const len2 = ab.lengthSq();
  if (len2 === 0) return a.distanceTo(p);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / len2));
  return new THREE.Vector3().copy(a).addScaledVector(ab, t).distanceTo(p);
}

// ─────────────────────────────────────────────
//  HUD MESSAGES
// ─────────────────────────────────────────────
export function showCombatMessage(text, color, ms = 0) {
  G.combatMessage.textContent = text;
  G.combatMessage.style.color = color;
  G.combatMessage.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
  G.combatMessage.classList.add('visible');
  if (ms > 0) setTimeout(hideCombatMessage, ms);
}

export function hideCombatMessage() {
  G.combatMessage.classList.remove('visible');
}

// ─────────────────────────────────────────────
//  PLAYER DEFEATED CHECK
// ─────────────────────────────────────────────
export function isPlayerDefeated() {
  switch (G.playerChar) {
    case 'hero':    return G.heroDefeated;
    case 'inferno': return G.infernoState === 'defeated';
    case 'icicle':  return G.icicleState  === 'defeated';
    case 'foliage': return G.foliageState === 'defeated';
  }
  return false;
}

// ─────────────────────────────────────────────
//  DAMAGE APPLICATION
// ─────────────────────────────────────────────
export function takeDamage(target, amount) {
  if (target === 'hero') {
    if (G.heroHealth <= 0 || G.heroDefeated) return;
    G.heroHealth = Math.max(0, G.heroHealth - amount);
    G.heroHealthFill.style.width = (G.heroHealth / HERO_MAX_HEALTH * 100) + '%';
    if (G.heroHealth <= 0) {
      G.heroDefeated      = true;
      G.heroDefeatedTimer = 4.0;
      G.heroDefeatedVelY  = 10;
      showCombatMessage('THUNDERCLAP IS DOWN!', '#1144cc', 4000);
    }
  } else if (target === 'inferno') {
    if (G.infernoHealth <= 0 || G.infernoState === 'defeated') return;
    G.infernoHealth = Math.max(0, G.infernoHealth - amount);
    G.infernoHealthFill.style.width = (G.infernoHealth / INFERNO_MAX_HEALTH * 100) + '%';
    if (G.infernoHealth <= 0) {
      G.infernoState        = 'defeated';
      G.infernoDefeatedTimer = 4.0;
      G.infernoDefeatedVelY  = 10;
      showCombatMessage('INFERNO DEFEATED!', '#ff3300', 4000);
    }
  } else if (target === 'icicle') {
    if (G.icicleHealth <= 0 || G.icicleState === 'defeated') return;
    G.icicleHealth = Math.max(0, G.icicleHealth - amount);
    G.icicleHealthFill.style.width = (G.icicleHealth / ICICLE_MAX_HEALTH * 100) + '%';
    if (G.icicleHealth <= 0) {
      G.icicleState        = 'defeated';
      G.icicleDefeatedTimer = 4.0;
      G.icicleDefeatedVelY  = 10;
      showCombatMessage('ICICLE DEFEATED!', '#aaeeff', 4000);
    }
  } else if (target === 'foliage') {
    if (G.foliageHealth <= 0 || G.foliageState === 'defeated') return;
    G.foliageHealth = Math.max(0, G.foliageHealth - amount);
    G.foliageHealthFill.style.width = (G.foliageHealth / FOLIAGE_MAX_HEALTH * 100) + '%';
    if (G.foliageHealth <= 0) {
      G.foliageState        = 'defeated';
      G.foliageDefeatedTimer = 4.0;
      G.foliageDefeatedVelY  = 10;
      showCombatMessage('FOLIAGE DEFEATED!', '#44cc00', 4000);
    }
  }
}
