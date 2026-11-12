import type { CharacterSpec } from 'wobnimo';

/*
  Domi: the CompareProjects mascot. A chubby white house with a purple roof and chimney,
  big glossy eyes, purple noodle arms with white gloves (one pointing up, one waving)
  and purple sneakers. Arms, the waving hand and the legs are bones, so they move.

  Units: the floor is y = 0, +y is up, +x is to the right as you look at the
  character, +z points at the camera. Angles are radians.

  World heights (body pivot at the floor):
    soles 0 to 0.02, sneakers to ~0.09, legs 0.06 to 0.17, wall 0.15 to 0.57,
    gable apex ~0.81, roof ridge ~0.86, chimney top ~0.88
*/

export const domi: CharacterSpec = {
  id: 'domi',
  name: 'Domi',
  tagline: 'A cheerful little house in gloves and sneakers that points the way home',
  accent: '#7e22ce',
  frame: { target: 0.45, radius: 0.6 },
  bound: { y: 0.45, radius: 0.62 },
  motion: { hop: 0.12, squash: 1.0, snap: 1, talkSquash: 0.6 },

  materials: {
    /* soft vinyl toy: warm white walls, rich purple roof */
    wall: { color: '#ece6f5', f0: 0.04, spec: 0.7, shininess: 50, rim: 0.7, sss: 0.2, sssColor: '#ffffff' },
    roof: { color: '#7e22ce', f0: 0.04, spec: 0.8, shininess: 60, rim: 0.8, sss: 0.2, sssColor: '#c49ae8' },
    roofDark: { color: '#5b1696', shadeOf: 'roof', f0: 0.04, spec: 0.7, shininess: 50, rim: 0.7 },
    limb: { color: '#6a1fa3', f0: 0.04, spec: 0.6, shininess: 40, rim: 0.7 },
    glove: { color: '#f2eef8', f0: 0.03, spec: 0.3, shininess: 20, rim: 1.0, sheen: 0.6, sss: 0.2, sssColor: '#ffffff' },
    shoe: { color: '#8a35c4', f0: 0.06, spec: 1.2, shininess: 110, rim: 0.6, gloss: 0.6 },
    sole: { color: '#f4f1f8', f0: 0.04, spec: 0.6, shininess: 40, rim: 0.6 },
  },

  bones: [
    { name: 'body', pivot: [0, 0, 0], drive: { ry: [['yaw', 0.3]], rz: [['roll', 0.35]], rx: [['pitch', -0.25]] } },
    /* the roof wobbles a little after hops, like a soft hat */
    { name: 'roof', parent: 'body', pivot: [0, 0.57, 0], jiggle: { axis: [0, 1, 0], length: 0.24, freq: 3, damping: 0.25, maxAngle: 0.12 } },
    /* arms: the upper arm reaches out past the eaves, the forearm bends up at the elbow */
    { name: 'armL', parent: 'body', pivot: [-0.24, 0.32, 0.04], rest: { rz: -1.5 }, drive: { rz: [['flap', -0.3]] } },
    { name: 'foreL', parent: 'armL', pivot: [0, -0.15, 0], rest: { rz: -1.45 } },
    { name: 'armR', parent: 'body', pivot: [0.24, 0.32, 0.04], rest: { rz: 1.5 }, drive: { rz: [['flap', 0.3]] } },
    { name: 'foreR', parent: 'armR', pivot: [0, -0.15, 0], rest: { rz: 1.35 } },
    /* legs swing from the hips */
    { name: 'legL', parent: 'body', pivot: [-0.1, 0.17, 0.02] },
    { name: 'legR', parent: 'body', pivot: [0.1, 0.17, 0.02] },
  ],

  parts: [
    /* the wall: a chubby soft block, world y 0.15 to 0.57 */
    { bone: 'body', shape: 'roundBox', at: [0, 0.36, 0], half: [0.24, 0.21, 0.2], round: 0.1, material: 'wall' },
    /* legs and sneakers */
    { bone: 'legL', shape: 'capsule', from: [0, 0.02, 0], to: [-0.005, -0.09, 0.01], radius: 0.028, material: 'limb' },
    { bone: 'legL', shape: 'ellipsoid', at: [-0.015, -0.125, 0.04], radii: [0.062, 0.038, 0.088], blend: 0.02, material: 'shoe' },
    { bone: 'legL', shape: 'ellipsoid', at: [-0.015, -0.152, 0.04], radii: [0.066, 0.016, 0.092], material: 'sole' },
    { bone: 'legR', shape: 'capsule', from: [0, 0.02, 0], to: [0.005, -0.09, 0.01], radius: 0.028, material: 'limb' },
    { bone: 'legR', shape: 'ellipsoid', at: [0.015, -0.125, 0.04], radii: [0.062, 0.038, 0.088], blend: 0.02, material: 'shoe' },
    { bone: 'legR', shape: 'ellipsoid', at: [0.015, -0.152, 0.04], radii: [0.066, 0.016, 0.092], material: 'sole' },
    /* pointing arm: noodle upper arm and forearm, a glove fist and an index finger pointing up */
    { bone: 'armL', shape: 'capsule', from: [0, 0, 0], to: [0, -0.15, 0], radius: 0.026, blend: 0.02, material: 'limb' },
    { bone: 'foreL', shape: 'capsule', from: [0, 0, 0], to: [0, -0.07, 0], radius: 0.026, blend: 0.02, material: 'limb' },
    { bone: 'foreL', shape: 'sphere', at: [0, -0.105, 0], radius: 0.052, blend: 0.015, material: 'glove' },
    { bone: 'foreL', shape: 'capsule', from: [0.008, -0.135, 0.012], to: [0.01, -0.2, 0.012], radius: 0.019, blend: 0.012, material: 'glove' },
    /* waving arm: noodle upper arm and forearm, then an open glove */
    { bone: 'armR', shape: 'capsule', from: [0, 0, 0], to: [0, -0.15, 0], radius: 0.026, blend: 0.02, material: 'limb' },
    { bone: 'foreR', shape: 'capsule', from: [0, 0, 0], to: [0, -0.07, 0], radius: 0.026, blend: 0.02, material: 'limb' },
    { bone: 'foreR', shape: 'sphere', at: [0, -0.11, 0], radius: 0.05, blend: 0.015, material: 'glove' },
    { bone: 'foreR', shape: 'capsule', from: [-0.03, -0.13, 0.005], to: [-0.045, -0.175, 0.005], radius: 0.016, blend: 0.01, material: 'glove' },
    { bone: 'foreR', shape: 'capsule', from: [-0.01, -0.14, 0.005], to: [-0.012, -0.19, 0.005], radius: 0.016, blend: 0.01, material: 'glove' },
    { bone: 'foreR', shape: 'capsule', from: [0.012, -0.14, 0.005], to: [0.018, -0.188, 0.005], radius: 0.016, blend: 0.01, material: 'glove' },
    { bone: 'foreR', shape: 'capsule', from: [0.03, -0.13, 0.005], to: [0.046, -0.17, 0.005], radius: 0.015, blend: 0.01, material: 'glove' },
    /* the gable, melted into the wall */
    { bone: 'roof', shape: 'roundBox', at: [0, 0, 0], rot: [0, 0, 0.7854], half: [0.17, 0.17, 0.17], round: 0.06, blend: 0.05, material: 'wall' },
    /* a chunky soft roof, two slabs meeting at the ridge */
    { bone: 'roof', shape: 'roundBox', at: [-0.165, 0.137, 0], rot: [0, 0, 0.7854], half: [0.22, 0.055, 0.23], round: 0.05, material: 'roof' },
    { bone: 'roof', shape: 'roundBox', at: [0.165, 0.137, 0], rot: [0, 0, -0.7854], half: [0.22, 0.055, 0.23], round: 0.05, blend: 0.03, material: 'roof' },
    /* a chimney on the right slope, with a cap */
    { bone: 'roof', shape: 'roundBox', at: [0.14, 0.22, -0.07], half: [0.038, 0.075, 0.038], round: 0.015, material: 'roofDark' },
    { bone: 'roof', shape: 'roundBox', at: [0.14, 0.3, -0.07], half: [0.052, 0.018, 0.052], round: 0.014, material: 'roof' },
  ],

  paints: [
    { bone: 'body', on: ['wall'], kind: 'sphere', at: [-0.15, 0.31, 0.2], radius: 0.048, color: '#ff8fbf', soft: 0.65, opacity: 0.85 },
    { bone: 'body', on: ['wall'], kind: 'sphere', at: [0.15, 0.31, 0.2], radius: 0.048, color: '#ff8fbf', soft: 0.65, opacity: 0.85 },
  ],

  /* big glossy eyes, low on the face */
  eyes: { kind: 'ball', bone: 'body', at: [[-0.09, 0.38, 0.16], [0.09, 0.38, 0.16]], radius: 0.068, iris: '#1d0b3a', irisSize: 0.88, pupilSize: 0.58, lid: 'wall' },
  face: { kind: 'mouth', bone: 'body', on: ['wall'], at: [0, 0.29, 0.2], width: 0.05, color: '#3a0d3f', tongue: '#ff6f9f' },

  anchors: {
    top: { bone: 'roof', at: [0.08, 0.36, 0.05] },
    mouth: { bone: 'body', at: [0, 0.29, 0.23] },
    ear: { bone: 'body', at: [-0.25, 0.4, 0] },
    feet: { bone: 'root', at: [0, 0.02, 0.15] },
  },

  acting: {
    /* idle: waves hello from the wrist, pointing hand bobs, weight shifts between the legs */
    idle: {
      foreR: { rz: [0, 0.3, 1.6, 0] }, armR: { rz: [0, 0.06, 1.6, 0.8] }, foreL: { rz: [0, 0.06, 0.6, 0] },
      legL: { rz: [0, 0.04, 0.3, 0] }, legR: { rz: [0, 0.04, 0.3, 0] },
    },
    /* thinking: the finger taps the air, one foot taps */
    thinking: { foreL: { rz: [0, 0.12, 1.6, 0] }, legR: { rx: [0, 0.12, 1.4, 0] }, roof: { rz: 0.05 } },
    listening: { foreR: { rz: -0.4 }, roof: { rz: -0.05 } },
    speaking: { foreR: { rz: [-0.2, 0.2, 1.4, 0] }, foreL: { rz: [0, 0.1, 1.4, 2] } },
    /* working: steps in place, arms swinging */
    working: {
      legL: { rx: [0, 0.35, 2.2, 0] }, legR: { rx: [0, 0.35, 2.2, Math.PI] },
      armL: { rz: [0.3, 0.12, 2.2, Math.PI] }, foreL: { rz: 0.5 }, armR: { rz: [-0.3, 0.12, 2.2, 0] }, foreR: { rz: -0.6 },
    },
    error: { foreL: { rz: [0.5, 0.12, 9, 0] }, foreR: { rz: [-0.5, 0.12, 9, 1] }, roof: { rz: [0, 0.03, 9, 0] } },
    surprised: { foreL: { rz: 0.2 }, foreR: { rz: -0.2 }, roof: { rx: -0.06 } },
    /* celebrating: big waves and a little dance */
    celebrating: {
      foreR: { rz: [0, 0.45, 3, 0] }, foreL: { rz: [0, 0.2, 3, 1] },
      legL: { rz: [0, 0.12, 3, 0] }, legR: { rz: [0, 0.12, 3, Math.PI] }, roof: { rz: [0, 0.05, 3, 0] },
    },
    sad: { armL: { rz: 1.2 }, foreL: { rz: 1.35 }, armR: { rz: -1.2 }, foreR: { rz: -1.25 }, roof: { rx: 0.06 } },
    sleeping: { armL: { rz: 1.2 }, foreL: { rz: 1.35 }, armR: { rz: -1.2 }, foreR: { rz: -1.25 }, roof: { rz: 0.05 } },
    happy: { foreR: { rz: [0, 0.5, 3.4, 0] }, foreL: { rz: [0, 0.15, 3.4, 1] } },
  },

  fx: {
    happy: [{ glyph: 'heart', anchor: 'top', rate: 1.2, velocity: [0, 0.22, 0.04], jitter: 0.1, life: [1, 1.3], size: [0.04, 0.06], color: '#d8b4fe' }],
  },
};

export default domi;
