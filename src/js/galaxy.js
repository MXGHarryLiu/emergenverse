import * as THREE from "three";

const GALAXY_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
  viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
  plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
  magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
  inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
  cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
  coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
  greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
};

const GALAXY_COLORMAPS = buildColormapLUT(GALAXY_COLORMAP_STOPS);
const lerpA = new THREE.Color();
const lerpB = new THREE.Color();

export const GALAXY_DEFAULT_PARAMS = {
  galaxySimSpeed: 1.0,
  galaxyCount: 500,
  galaxyParticleSize: 0.8,
  galaxySpin: 1.2,
  galaxyGravity: 180,
  galaxyCentralMass: 2200,
  galaxySoftening: 1.8,
  galaxyDamping: 0.01,
};

export class GalaxySimulation {
  constructor({ scene, params, world, onStats }) {
    this.scene = scene;
    this.params = params;
    this.world = world;
    this.onStats = onStats;

    this.geometry = new THREE.SphereGeometry(0.42, 10, 8);
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x2b3242,
      shininess: 26,
      flatShading: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.particles = [];
    this.mesh = null;
    this.capacity = 0;
    this.tempObject = new THREE.Object3D();
    this.tempColor = new THREE.Color();
    this.tmpDelta = new THREE.Vector3();
    this.tmpCenterDelta = new THREE.Vector3();
    this.speedBounds = { min: 0, max: 1 };
  }

  init() {
    this.reset();
  }

  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  onTheme(theme) {
    this.material.specular.set(theme === "light" ? 0x3d4c63 : 0x2b3242);
  }

  reset() {
    this.particles.length = 0;
    for (let i = 0; i < this.params.galaxyCount; i += 1) {
      this.particles.push(this.createParticle());
    }
    this.ensureMesh();
    this.syncInstances();
    this.emitStats();
  }

  setCount(count) {
    this.params.galaxyCount = count;
    this.reset();
  }

  onWorldGeometryChanged() {
    for (let i = 0; i < this.particles.length; i += 1) {
      this.world.applyBoundaryConditions(this.particles[i]);
    }
    if (this.params.boundaryMode === "lost") {
      this.removeLost();
    }
    this.syncInstances();
    this.emitStats();
  }

  onBoundaryModeChanged() {
    this.onWorldGeometryChanged();
  }

  step(dt) {
    const count = this.particles.length;
    if (count === 0) {
      this.emitStats();
      return;
    }

    const soft = Math.max(0.05, this.params.galaxySoftening ?? 1.8);
    const softSq = soft * soft;
    const G = Math.max(0, this.params.galaxyGravity ?? 180);
    const centralMass = Math.max(0, this.params.galaxyCentralMass ?? 2200);
    const damping = THREE.MathUtils.clamp(this.params.galaxyDamping ?? 0.01, 0, 0.2);

    for (let i = 0; i < count; i += 1) {
      const p = this.particles[i];
      if (p.lost) {
        continue;
      }
      p.acceleration.set(0, 0, 0);
    }

    // Pairwise softened gravity between particles.
    for (let i = 0; i < count; i += 1) {
      const a = this.particles[i];
      if (a.lost) {
        continue;
      }
      for (let j = i + 1; j < count; j += 1) {
        const b = this.particles[j];
        if (b.lost) {
          continue;
        }

        this.tmpDelta.subVectors(b.position, a.position);
        const distSq = this.tmpDelta.lengthSq() + softSq;
        const invDist = 1 / Math.sqrt(distSq);
        const invDist3 = invDist * invDist * invDist;
        const factor = G * invDist3;

        a.acceleration.addScaledVector(this.tmpDelta, factor);
        b.acceleration.addScaledVector(this.tmpDelta, -factor);
      }
    }

    // Central potential that keeps the disk bound.
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[i];
      if (p.lost) {
        continue;
      }

      this.tmpCenterDelta.copy(p.position).multiplyScalar(-1);
      const distSq = this.tmpCenterDelta.lengthSq() + softSq;
      const invDist = 1 / Math.sqrt(distSq);
      const invDist3 = invDist * invDist * invDist;
      p.acceleration.addScaledVector(this.tmpCenterDelta, G * centralMass * invDist3);

      p.velocity.addScaledVector(p.acceleration, dt);
      p.velocity.multiplyScalar(1 - damping * dt);
      p.position.addScaledVector(p.velocity, dt);
      this.world.applyBoundaryConditions(p);
    }

    if (this.params.boundaryMode === "lost") {
      this.removeLost();
    }

    this.syncInstances();
    this.emitStats();
  }

  ensureMesh() {
    const nextCapacity = Math.max(1, this.particles.length);
    if (!this.mesh || this.capacity < nextCapacity || this.capacity > nextCapacity * 2) {
      if (this.mesh) {
        this.scene.remove(this.mesh);
      }
      this.capacity = nextCapacity;
      this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3), 3);
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(this.mesh);
    }
  }

  syncInstances() {
    if (!this.mesh) {
      return;
    }

    const scale = Math.max(0.05, this.params.galaxyParticleSize ?? 0.8);
    this.speedBounds = this.getSpeedBounds();

    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      this.tempObject.position.copy(p.position);
      this.tempObject.rotation.set(0, 0, 0);
      this.tempObject.scale.setScalar(scale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      const speed = p.velocity.length();
      const span = Math.max(this.speedBounds.max - this.speedBounds.min, 1e-6);
      const t = THREE.MathUtils.clamp((speed - this.speedBounds.min) / span, 0, 1);
      this.applyColormap(t, this.tempColor);
      this.mesh.setColorAt(i, this.tempColor);
    }

    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  removeLost() {
    let removed = false;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      if (this.particles[i].lost) {
        this.particles.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      this.ensureMesh();
    }
  }

  createParticle() {
    const diskRadius = Math.max(2, Math.min(this.params.worldSizeX, this.params.worldSizeY) * 0.45);
    const r = Math.sqrt(Math.random()) * diskRadius;
    const theta = Math.random() * Math.PI * 2;
    const zJitter = THREE.MathUtils.randFloatSpread(Math.max(0.5, this.params.worldSizeZ * 0.06));

    const position = new THREE.Vector3(
      Math.cos(theta) * r,
      Math.sin(theta) * r,
      zJitter,
    );

    const tangential = new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0);
    const spin = Math.max(0, this.params.galaxySpin ?? 1.2);
    const baseSpeed = spin * Math.sqrt(Math.max(0.1, this.params.galaxyGravity) * Math.max(0.5, this.params.galaxyCentralMass) / Math.max(2, r));
    tangential.multiplyScalar(baseSpeed);
    tangential.x += THREE.MathUtils.randFloatSpread(baseSpeed * 0.15);
    tangential.y += THREE.MathUtils.randFloatSpread(baseSpeed * 0.15);
    tangential.z += THREE.MathUtils.randFloatSpread(baseSpeed * 0.06);

    return {
      position,
      velocity: tangential,
      acceleration: new THREE.Vector3(),
      lost: false,
    };
  }

  getSpeedBounds() {
    if (!this.particles.length) {
      return { min: 0, max: 1 };
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.particles.length; i += 1) {
      const speed = this.particles[i].velocity.length();
      if (speed < min) {
        min = speed;
      }
      if (speed > max) {
        max = speed;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }
    if (max - min < 1e-6) {
      return { min: min - 0.5, max: max + 0.5 };
    }
    return { min, max };
  }

  applyColormap(value, outColor) {
    const colors = GALAXY_COLORMAPS.magma || GALAXY_COLORMAPS.turbo;
    if (!colors || colors.length === 0) {
      outColor.setRGB(1, 1, 1);
      return outColor;
    }
    if (colors.length === 1) {
      outColor.copy(colors[0]);
      return outColor;
    }

    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    const scaled = clamped * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    const t = scaled - index;
    lerpA.copy(colors[index]);
    lerpB.copy(colors[index + 1]);
    outColor.copy(lerpA).lerp(lerpB, t);
    return outColor;
  }

  emitStats() {
    if (typeof this.onStats !== "function") {
      return;
    }

    const count = this.particles.length;
    let radiusSum = 0;
    let speedSum = 0;
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[i];
      radiusSum += Math.sqrt(p.position.x * p.position.x + p.position.y * p.position.y);
      speedSum += p.velocity.length();
    }

    this.onStats({
      count,
      meanRadius: count > 0 ? radiusSum / count : 0,
      meanSpeed: count > 0 ? speedSum / count : 0,
    });
  }
}

function buildColormapLUT(stopMap) {
  const lut = {};
  for (const [name, stops] of Object.entries(stopMap)) {
    lut[name] = stops.map((hex) => new THREE.Color(hex));
  }
  return lut;
}
