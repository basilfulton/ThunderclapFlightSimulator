import * as THREE from 'three';

// ─────────────────────────────────────────────
//  COMBAT CONSTANTS (shared across all characters)
// ─────────────────────────────────────────────
export const HERO_MAX_HEALTH    = 100;
export const INFERNO_MAX_HEALTH = 100;
export const ICICLE_MAX_HEALTH  = 100;
export const FOLIAGE_MAX_HEALTH = 100;

export const LIGHTNING_DAMAGE_AI      = 3;
export const PLAYER_DAMAGE_MULTIPLIER = 6;

export const MAX_PITCH = Math.PI / 2.2;

// Bolt display timing (used by Thunderclap and game.js firing loop)
export const BOLT_DURATION = 0.10;
export const BOLT_COOLDOWN = 0.055;

// ─────────────────────────────────────────────
//  SHARED MUTABLE GAME STATE
//  All modules read/write this object.
//  game.js populates scene references after init.
// ─────────────────────────────────────────────
export const G = {
  // ── Three.js scene references (set by game.js) ──
  scene:          null,
  buildingMeshes: [],
  buildingData:   [],
  raycaster:      new THREE.Raycaster(),

  // ── Character THREE.Groups (set by game.js after import) ──
  hero:    null,
  inferno: null,
  icicle:  null,
  foliage: null,

  // ── Player / spectator control ──
  playerChar:             'hero',
  playerGroup:            null,
  spectatorMode:          false,
  spectatorChar:          'hero',
  spectatorGroup:         null,
  prevPlayerChar:         'hero',

  // ── Flight / UI state ──
  isFloating:                 false,
  staminaDepleted:            false,
  wasFloatingBeforeDepletion: false,

  // ── Hero (Thunderclap) combat state ──
  heroHealth:        HERO_MAX_HEALTH,
  heroDefeated:      false,
  heroDefeatedTimer: 0,
  heroDefeatedVelY:  0,
  heroRespawning:    false,

  // ── Inferno combat state ──
  infernoHealth:        INFERNO_MAX_HEALTH,
  infernoState:         'patrol',
  infernoDefeatedTimer: 0,
  infernoDefeatedVelY:  0,
  infernoRespawning:    false,

  // ── Icicle combat state ──
  icicleHealth:        ICICLE_MAX_HEALTH,
  icicleState:         'patrol',
  icicleDefeatedTimer: 0,
  icicleDefeatedVelY:  0,
  icicleRespawning:    false,

  // ── Foliage combat state ──
  foliageHealth:        FOLIAGE_MAX_HEALTH,
  foliageState:         'patrol',
  foliageDefeatedTimer: 0,
  foliageDefeatedVelY:  0,
  foliageRespawning:    false,

  // ── DOM elements (set by game.js) ──
  heroHealthFill:    null,
  infernoHealthFill: null,
  icicleHealthFill:  null,
  foliageHealthFill: null,
  combatMessage:     null,
};
