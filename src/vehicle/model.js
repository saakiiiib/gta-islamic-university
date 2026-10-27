import * as THREE from 'three';

// Coordinates are metres: the front wheel points toward -Z and each axle runs on X.
const C = {
  black: 0x151918, white: 0xe5e5cf, steel: 0x92958a, darkSteel: 0x4b514b,
  green: 0x15942e, red: 0xd83b26, yellow: 0xf6d91a, blue: 0x195390,
  saddle: 0x252b24, battery: 0x424744, copper: 0x9b3529,
};

function builder() {
  const positions = [], normals = [], colors = [];
  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const color = new THREE.Color();
  return {
    add(geometry, tint, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
      const source = geometry.index ? geometry.toNonIndexed() : geometry;
      matrix.compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
      normalMatrix.getNormalMatrix(matrix);
      color.setHex(tint);
      const p = source.getAttribute('position'), n = source.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        point.fromBufferAttribute(p, i).applyMatrix4(matrix);
        normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(color.r, color.g, color.b);
      }
      if (source !== geometry) source.dispose();
    },
    mesh(name, material) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },
  };
}

export function createElectricVanModel({ livery = {} } = {}) {
  const primary = livery.primary ?? C.green, secondary = livery.secondary ?? C.red, trim = livery.trim ?? C.yellow, accent = livery.accent ?? C.blue;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.77, metalness: 0.12, side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tube = new THREE.CylinderGeometry(1, 1, 1, 8);
  const wheelTire = new THREE.TorusGeometry(0.365, 0.035, 8, 28);
  const wheelRim = new THREE.TorusGeometry(0.32, 0.009, 5, 28);
  const wheelHub = new THREE.CylinderGeometry(0.048, 0.048, 1, 10);

  const group = new THREE.Group();
  group.name = 'electricCargoTricycle';
  const body = new THREE.Group();
  body.name = 'cargoTricycleBody';
  group.add(body);
  const steering = new THREE.Group();
  steering.name = 'steering';
  steering.position.set(0, 0, -1.27);
  group.add(steering);

  function block(target, color, x, y, z, sx, sy, sz) {
    target.add(box, color, [x, y, z], [0, 0, 0], [sx, sy, sz]);
  }
  function rod(target, color, a, b, radius) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const midpoint = start.clone().add(end).multiplyScalar(0.5);
    const direction = end.sub(start);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    const euler = new THREE.Euler().setFromQuaternion(quaternion);
    target.add(tube, color, midpoint.toArray(), [euler.x, euler.y, euler.z], [radius, direction.length(), radius]);
  }

  const chassis = builder();
  // Thin open deck, with alternating painted slats and the bright outer lip.
  block(chassis, C.darkSteel, 0, 0.775, 0.93, 1.43, 0.035, 1.61);
  for (let z = 0.23, i = 0; i < 8; i++, z += 0.202) {
    block(chassis, i % 2 ? secondary : primary, 0, 0.815, z, 1.27, 0.027, 0.085);
  }
  for (const x of [-0.72, 0.72]) {
    block(chassis, trim, x, 0.82, 0.93, 0.06, 0.065, 1.64);
    block(chassis, accent, x, 0.772, 0.93, 0.055, 0.035, 1.64);
  }
  for (const z of [0.11, 1.745]) {
    block(chassis, trim, 0, 0.82, z, 1.47, 0.065, 0.05);
    block(chassis, accent, 0, 0.772, z, 1.47, 0.035, 0.055);
  }
  // Cargo rack supports and the bicycle triangle stay visibly open underneath.
  for (const x of [-0.57, 0.57]) {
    rod(chassis, primary, [x, 0.77, 0.18], [x * 0.92, 0.36, 0.85], 0.018);
    rod(chassis, secondary, [x, 0.77, 1.66], [x * 0.92, 0.36, 0.85], 0.018);
    rod(chassis, C.darkSteel, [x * 0.92, 0.36, 0.85], [0, 0.43, 0.28], 0.014);
  }
  const crank = [0, 0.47, -0.23];
  const saddleStem = [0, 1.19, -0.39];
  const headTop = [0, 1.3, -1.11];
  const headBottom = [0, 0.75, -1.21];
  rod(chassis, C.black, crank, saddleStem, 0.027);
  rod(chassis, C.black, saddleStem, headTop, 0.026);
  rod(chassis, C.black, crank, headBottom, 0.029);
  rod(chassis, C.black, saddleStem, headBottom, 0.018);
  rod(chassis, C.white, [0, 1.115, -0.45], [0, 1.115, -1.0], 0.011);
  rod(chassis, C.white, [0, 0.99, -0.46], [0, 0.99, -1.04], 0.011);
  for (let i = 0; i < 5; i++) {
    const z = -0.51 - i * 0.12;
    block(chassis, C.white, 0, 1.12, z, 0.047, 0.024, 0.035);
  }
  // Saddle, slim battery pack and exposed electric hub/motor casing.
  rod(chassis, C.steel, [0, 1.15, -0.41], [0, 1.37, -0.41], 0.014);
  block(chassis, C.saddle, 0, 1.4, -0.43, 0.25, 0.055, 0.39);
  block(chassis, C.yellow, 0, 1.432, -0.38, 0.17, 0.009, 0.11);
  block(chassis, C.battery, 0, 0.58, -0.42, 0.18, 0.21, 0.29);
  block(chassis, C.steel, 0, 0.52, 0.02, 0.24, 0.18, 0.19);
  rod(chassis, C.steel, [0, 0.46, 0.04], [0, 0.46, 0.58], 0.015);
  body.add(chassis.mesh('openSlatCargoBedAndBicycleFrame', material));

  const steerParts = builder();
  // Steering coordinates are relative to the front axle at Z = -1.27.
  rod(steerParts, C.white, [0, 0.42, 0], [0, 1.31, 0.16], 0.024);
  for (const x of [-0.10, 0.10]) {
    rod(steerParts, C.steel, [x, 0.42, 0], [x, 0.8, 0.04], 0.014);
  }
  rod(steerParts, C.steel, [0, 1.30, 0.16], [0, 1.52, 0.10], 0.018);
  rod(steerParts, C.steel, [-0.38, 1.53, 0.08], [0.38, 1.53, 0.08], 0.018);
  for (const x of [-0.38, 0.38]) {
    rod(steerParts, C.black, [x, 1.53, 0.08], [x, 1.53, -0.07], 0.021);
  }
  block(steerParts, C.yellow, 0, 1.31, -0.095, 0.21, 0.14, 0.08);
  block(steerParts, C.red, 0, 1.21, -0.11, 0.23, 0.12, 0.09);
  steering.add(steerParts.mesh('handlebarAndFork', material));

  function makeWheel(name, x, z, parent) {
    const wheel = new THREE.Group();
    wheel.name = name;
    wheel.position.set(x, 0.4, z);
    const details = builder();
    details.add(wheelTire, C.black, [0, 0, 0], [0, Math.PI / 2, 0]);
    details.add(wheelRim, C.steel, [0, 0, 0], [0, Math.PI / 2, 0]);
    details.add(wheelHub, C.copper, [0, 0, 0], [0, 0, Math.PI / 2], [1, 0.09, 1]);
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      rod(details, C.steel, [0, 0, 0], [0, Math.cos(angle) * 0.315, Math.sin(angle) * 0.315], 0.005);
    }
    wheel.add(details.mesh(`${name}TireRimAndSpokes`, material));
    parent.add(wheel);
    return wheel;
  }

  const frontWheel = makeWheel('frontWheel', 0, 0, steering);
  const rearWheels = [makeWheel('rearWheelLeft', -0.69, 0.95, group), makeWheel('rearWheelRight', 0.69, 0.95, group)];
  const wheels = [frontWheel, ...rearWheels];
  const dispose = () => {
    group.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
    material.dispose();
  };
  for (const geometry of [box, tube, wheelTire, wheelRim, wheelHub]) geometry.dispose();
  return { group, body, steering, wheels, frontWheel, rearWheels, dispose };
}
