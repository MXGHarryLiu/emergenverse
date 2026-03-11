import * as THREE from "three";

const TWO_PI = Math.PI * 2;

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

      // Random walk in the XY plane.
      firefly.heading += THREE.MathUtils.randFloatSpread(1.2) * dt;
      firefly.velocity.set(Math.cos(firefly.heading), Math.sin(firefly.heading)).multiplyScalar(speed);
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

    const floorZ = -this.params.worldSizeZ * 0.5 + 0.95;
    const scale = Math.max(0.08, this.params.fireflySize ?? 0.8);

    for (let i = 0; i < this.fireflies.length; i += 1) {
      const firefly = this.fireflies[i];
      this.tempObject.position.set(firefly.position.x, firefly.position.y, floorZ);
      this.tempObject.rotation.set(0, 0, firefly.heading);
      this.tempObject.scale.setScalar(scale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      // Bright pulse near phase wrap (blink) with low baseline glow.
      const phaseNorm = firefly.phase / TWO_PI;
      const pulse =
        Math.exp(-((phaseNorm - 1) * (phaseNorm - 1)) / 0.0025) +
        Math.exp(-(phaseNorm * phaseNorm) / 0.0025);
      const brightness = THREE.MathUtils.clamp(0.16 + pulse * 1.25, 0, 1);
      this.tempColor.setRGB(1, 0.95, 0.45).multiplyScalar(brightness);
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
      velocity: random2DDirection().multiplyScalar(Math.max(0.1, this.params.fireflySpeed ?? 3)),
      heading: Math.random() * TWO_PI,
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

    if (this.params.boundaryMode === "cyclic") {
      agent.position.x = wrapAxis(agent.position.x, halfX);
      agent.position.y = wrapAxis(agent.position.y, halfY);
      agent.lost = false;
      return true;
    }

    const outOfBounds = Math.abs(agent.position.x) > halfX || Math.abs(agent.position.y) > halfY;
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
  return new THREE.Vector2(x, y);
}

function random2DDirection() {
  const angle = Math.random() * TWO_PI;
  return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
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
