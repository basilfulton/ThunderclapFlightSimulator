import * as THREE from 'three';

// ─────────────────────────────────────────────
//  SHARED MODEL HELPERS
// ─────────────────────────────────────────────

// Scales, centres and orients a loaded GLB for a flying pose
export function orientModelForFlight(model) {
  const box0   = new THREE.Box3().setFromObject(model);
  const size0  = box0.getSize(new THREE.Vector3());
  const maxDim = Math.max(size0.x, size0.y, size0.z);
  model.scale.setScalar(5 / maxDim);

  model.rotation.order = 'ZXY';
  model.rotation.x = -Math.PI / 2 - 0.1; // slight tilt for level flight
  model.rotation.z = -Math.PI / 2;

  const box1   = new THREE.Box3().setFromObject(model);
  const centre = box1.getCenter(new THREE.Vector3());
  model.position.sub(centre);

  model.traverse(child => {
    if (child.isMesh) { child.castShadow = false; child.receiveShadow = false; }
  });
}

// Builds a simple block-figure placeholder when a GLB fails to load
export function buildPlaceholderModel(parent, bodyColor, accentColor, accentEmissive) {
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
