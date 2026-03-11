import * as THREE from "three";

const TWO_PI = Math.PI * 2;
const FIREFLY_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
  viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
  plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
  magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
  inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
  cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
  coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
  greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
};
const FIREFLY_COLORMAPS = buildColormapLUT(FIREFLY_COLORMAP_STOPS);
const FIREFLY_DISCRETE_STATE_COLORMAPS = {
  paired: [0xa6cee3, 0x1f78b4],
  set1: [0xe41a1c, 0x377eb8],
  set2: [0x66c2a5, 0xfc8d62],
  dark2: [0x1b9e77, 0xd95f02],
  tableau10: [0x4e79a7, 0xf28e2b],
};
const fireflyLerpA = new THREE.Color();
const fireflyLerpB = new THREE.Color();

export const FIREFLY_DEFAULT_PARAMS = {
  fireflyCount: 180,
  fireflySize: 0.8,
  fireflySpeed: 1.2,
  fireflyCoupling: 2.2,
  fireflyRadius: 18.0,
  fireflyFrequencyHz: 1.8,
  fireflyFreqJitterHz: 0.2,
  fireflyPhaseNoise: 0.4,
  fireflyColorMode: "blink",
  fireflyColormap: "paired",
};

export class FireflySimulation {
  constructor({ scene, params, onStats }) {
    this.scene = scene;
    this.params = params;
    this.onStats = onStats;

    this.geometry = new THREE.SphereGeometry(0.45, 10, 8);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });

    this.fireflies = [];
    this.mesh = null;
    this.capacity = 0;

    this.tempObject = new THREE.Object3D();
    this.tempColor = new THREE.Color();
    this.phaseStepBuffer = [];
    this.blinkRateSmoothed = 0;
    this.steer = new THREE.Vector3();
  }

  init() {
    this.reset();
  }

  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  onTheme() {}

  reset() {
    this.fireflies.length = 0;
    this.blinkRateSmoothed = 0;

    for (let i = 0; i < this.params.fireflyCount; i += 1) {
      this.fireflies.push(this.createFirefly());
    }

    this.ensureMesh();
    this.syncInstances();
    this.emitStats(0);
  }

  setCount(count) {
    this.params.fireflyCount = count;
    this.reset();
  }

  onWorldGeometryChanged() {
    for (let i = 0; i < this.fireflies.length; i += 1) {
      this.applyBoundary(this.fireflies[i]);
    }
    if (this.params.boundaryMode === "lost") {
      this.removeLost();
    }
    this.syncInstances();
    this.emitStats(0);
  }

  onBoundaryModeChanged() {
    this.onWorldGeometryChanged();
  }

  getFrequencyRange() {
    if (!this.fireflies.length) {
      const center = Math.max(0.05, this.params.fireflyFrequencyHz ?? 1.8);
      const jitter = Math.max(0, this.params.fireflyFreqJitterHz ?? 0.2);
      return {
        min: Math.max(0, center - jitter),
        max: center + jitter,
      };
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.fireflies.length; i += 1) {
      const omegaHz = this.fireflies[i].omegaHz;
      if (omegaHz < min) {
        min = omegaHz;
      }
      if (omegaHz > max) {
        max = omegaHz;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }
    if (max - min < 1e-6) {
      return { min: min - 0.1, max: max + 0.1 };
    }
    return { min, max };
  }

  step(dt) {
    const count = this.fireflies.length;
    if (count === 0) {
      this.emitStats(0);
      return;
    }

    const speed = Math.max(0.05, this.params.fireflySpeed ?? 3);
    const coupling = Math.max(0, this.params.fireflyCoupling ?? 2.2);
    const radius = Math.max(0.2, this.params.fireflyRadius ?? 18);
    const radiusSq = radius * radius;
    const baseHz = Math.max(0.05, this.params.fireflyFrequencyHz ?? 1.8);
    const jitterHz = Math.max(0, this.params.fireflyFreqJitterHz ?? 0.2);
    const phaseNoise = Math.max(0, this.params.fireflyPhaseNoise ?? 0.4);

    this.phaseStepBuffer.length = count;
    let blinkCount = 0;

    for (let i = 0; i < count; i += 1) {
      const firefly = this.fireflies[i];
      if (firefly.lost) {
        this.phaseStepBuffer[i] = 0;
        continue;
      }

      // Random walk in 3D with bounded speed.
      this.steer.set(
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2),
        THREE.MathUtils.randFloatSpread(2),
      );
      if (this.steer.lengthSq() > 1e-8) {
        this.steer.normalize().multiplyScalar(0.9 * dt);
        firefly.velocity.add(this.steer);
      }
      const vLen = firefly.velocity.length();
      if (vLen < 1e-8) {
        firefly.velocity.copy(randomDirection3D()).multiplyScalar(speed);
      } else {
        firefly.velocity.multiplyScalar(speed / vLen);
      }
      firefly.position.addScaledVector(firefly.velocity, dt);
      this.applyBoundary(firefly);
      if (firefly.lost) {
        this.phaseStepBuffer[i] = 0;
        continue;
      }

      let couplingSum = 0;
      let neighborCount = 0;
      for (let j = 0; j < count; j += 1) {
        if (i === j) {
          continue;
        }
        const other = this.fireflies[j];
        if (other.lost) {
          continue;
        }
        const distanceSq = firefly.position.distanceToSquared(other.position);
        if (distanceSq > radiusSq) {
          continue;
        }
        couplingSum += Math.sin(other.phase - firefly.phase);
        neighborCount += 1;
      }

      const omegaHz = Math.max(0.05, firefly.omegaHz);
      const intrinsic = TWO_PI * omegaHz;
      const couplingTerm = neighborCount > 0 ? coupling * (couplingSum / neighborCount) : 0;
      const noiseTerm = THREE.MathUtils.randFloatSpread(2) * phaseNoise;
      this.phaseStepBuffer[i] = (intrinsic + couplingTerm + noiseTerm) * dt;
    }

    for (let i = 0; i < count; i += 1) {
      const firefly = this.fireflies[i];
      if (firefly.lost) {
        continue;
      }
      firefly.phase += this.phaseStepBuffer[i];
      while (firefly.phase >= TWO_PI) {
        firefly.phase -= TWO_PI;
        blinkCount += 1;
      }
      while (firefly.phase < 0) {
        firefly.phase += TWO_PI;
      }
    }

    if (this.params.boundaryMode === "lost") {
      this.removeLost();
    }

    this.syncInstances();

    const blinkRateInstant = dt > 0 ? blinkCount / dt : 0;
    this.blinkRateSmoothed =
      this.blinkRateSmoothed === 0
        ? blinkRateInstant
        : this.blinkRateSmoothed * 0.85 + blinkRateInstant * 0.15;
    this.emitStats(this.blinkRateSmoothed);
  }

  ensureMesh() {
    const nextCapacity = Math.max(1, this.fireflies.length);
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

    const scale = Math.max(0.08, this.params.fireflySize ?? 0.8);
    const frequencyRange = this.getFrequencyRange();
    const discreteStateColors = getFireflyStateColors(this.params.fireflyColormap);

    for (let i = 0; i < this.fireflies.length; i += 1) {
      const firefly = this.fireflies[i];
      this.tempObject.position.set(firefly.position.x, firefly.position.y, firefly.position.z);
      this.tempObject.rotation.set(0, 0, 0);
      this.tempObject.scale.setScalar(scale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      const phaseNorm = firefly.phase / TWO_PI;
      const pulse =
        Math.exp(-((phaseNorm - 1) * (phaseNorm - 1)) / 0.0025) +
        Math.exp(-(phaseNorm * phaseNorm) / 0.0025);
      const brightness = THREE.MathUtils.clamp(0.18 + pulse * 1.1, 0.18, 1);
      const isBlinking = pulse > 0.5;

      if (this.params.fireflyColorMode === "frequency") {
        const span = Math.max(frequencyRange.max - frequencyRange.min, 1e-6);
        const t = THREE.MathUtils.clamp((firefly.omegaHz - frequencyRange.min) / span, 0, 1);
        sampleColormap(this.params.fireflyColormap, t, this.tempColor);
      } else {
        this.tempColor.setHex(isBlinking ? discreteStateColors.blink : discreteStateColors.idle);
      }
      this.tempColor.multiplyScalar(brightness);
      this.mesh.setColorAt(i, this.tempColor);
    }

    this.mesh.count = this.fireflies.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  emitStats(blinkRate) {
    if (typeof this.onStats !== "function") {
      return;
    }

    const count = this.fireflies.length;
    let cosSum = 0;
    let sinSum = 0;
    for (let i = 0; i < count; i += 1) {
      const phase = this.fireflies[i].phase;
      cosSum += Math.cos(phase);
      sinSum += Math.sin(phase);
    }
    const order = count > 0 ? Math.sqrt(cosSum * cosSum + sinSum * sinSum) / count : 0;

    this.onStats({
      count,
      order,
      blinkRate,
    });
  }

  createFirefly() {
    return {
      position: randomWorldPosition(this.params),
      velocity: randomDirection3D().multiplyScalar(Math.max(0.1, this.params.fireflySpeed ?? 3)),
      phase: Math.random() * TWO_PI,
      omegaHz: Math.max(
        0.05,
        (this.params.fireflyFrequencyHz ?? 1.8) +
          THREE.MathUtils.randFloatSpread((this.params.fireflyFreqJitterHz ?? 0.2) * 2),
      ),
      lost: false,
    };
  }

  applyBoundary(agent) {
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;
    const halfZ = this.params.worldSizeZ * 0.5;

    if (this.params.boundaryMode === "cyclic") {
      agent.position.x = wrapAxis(agent.position.x, halfX);
      agent.position.y = wrapAxis(agent.position.y, halfY);
      agent.position.z = wrapAxis(agent.position.z, halfZ);
      agent.lost = false;
      return true;
    }

    const outOfBounds =
      Math.abs(agent.position.x) > halfX ||
      Math.abs(agent.position.y) > halfY ||
      Math.abs(agent.position.z) > halfZ;
    agent.lost = outOfBounds;
    return !outOfBounds;
  }

  removeLost() {
    let removed = false;
    for (let i = this.fireflies.length - 1; i >= 0; i -= 1) {
      if (this.fireflies[i].lost) {
        this.fireflies.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      this.ensureMesh();
    }
  }
}

function randomWorldPosition(params) {
  const x = THREE.MathUtils.randFloatSpread(params.worldSizeX * 0.9);
  const y = THREE.MathUtils.randFloatSpread(params.worldSizeY * 0.9);
  const z = THREE.MathUtils.randFloatSpread(params.worldSizeZ * 0.9);
  return new THREE.Vector3(x, y, z);
}

function randomDirection3D() {
  const direction = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
  );
  if (direction.lengthSq() < 1e-8) {
    direction.set(0, 0, 1);
  }
  return direction.normalize();
}

function wrapAxis(value, halfExtent) {
  const span = halfExtent * 2;
  if (span <= 0) {
    return 0;
  }
  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % span) + span) % span) - halfExtent;
  }
  return value;
}

function buildColormapLUT(stopsByName) {
  const maps = {};
  Object.keys(stopsByName).forEach((name) => {
    maps[name] = stopsByName[name].map((hex) => new THREE.Color(hex));
  });
  return maps;
}

function sampleColormap(name, normalized, outColor) {
  const colors = FIREFLY_COLORMAPS[name] || FIREFLY_COLORMAPS.turbo;
  if (!colors || colors.length === 0) {
    outColor.set(0xffffff);
    return outColor;
  }
  if (colors.length === 1) {
    outColor.copy(colors[0]);
    return outColor;
  }

  const t = THREE.MathUtils.clamp(normalized, 0, 1);
  const scaled = t * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const fraction = scaled - index;
  fireflyLerpA.copy(colors[index]);
  fireflyLerpB.copy(colors[index + 1]);
  outColor.copy(fireflyLerpA).lerp(fireflyLerpB, fraction);
  return outColor;
}

function getFireflyStateColors(name) {
  const palette = FIREFLY_DISCRETE_STATE_COLORMAPS[name];
  if (palette && palette.length >= 2) {
    return {
      idle: palette[0],
      blink: palette[1],
    };
  }
  return {
    idle: 0xa6cee3,
    blink: 0x1f78b4,
  };
}
