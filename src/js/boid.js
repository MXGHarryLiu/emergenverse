// Boids applet config and simulation implementation.
import * as THREE from "three";
import { defineAppletConfig, slider } from "./appletConfigUtils.js";

export const BOID_DEFAULT_PARAMS = {
  boidSimSpeed: 1.0,
  boidCount: 220,
  boidScale: 0.5,
  perceptionRadius: 18,
  separationDistance: 8,
  maxSpeed: 8,
  minSpeed: 2.5,
  maxAccel: 6,
  alignmentWeight: 1.0,
  cohesionWeight: 0.9,
  separationWeight: 1.35,
  colorMode: "speed",
  colormap: "turbo",
  solidColor: "#4cd3b6",
};

export const BOID_APPLET_CONFIG = defineAppletConfig({
  label: "Boids",
  defaultProjection: "perspective",
  world: {
    defaults: { x: 100, y: 100, z: 100 },
    range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
    gridSize: 5,
  },
  left: {
    intro: {
      sectionKey: "information-introduction",
      title: "Introduction",
      icon: "bi-journal-text",
      paragraphs: [
        "This applet implements the 3D Reynolds flocking model as a discrete-time multi-agent system in SI units. Each boid state is position x_i (m) and velocity v_i (m/s), advanced by steering acceleration with bounded speed and acceleration.",
      ],
      equations: [
        "$$\\mathbf{x}_i(t+\\Delta t)=\\mathbf{x}_i(t)+\\mathbf{v}_i(t)\\,\\Delta t$$",
        "$$\\mathbf{v}_i(t+\\Delta t)=\\mathrm{clip}\\!\\left(\\mathbf{v}_i(t)+\\mathbf{a}_i(t)\\,\\Delta t\\right)$$",
        "$$v_{\\min}\\le \\|\\mathbf{v}_i\\|\\le v_{\\max}$$",
        "$$\\mathbf{a}_i=w_{a}\\mathbf{a}_{\\mathrm{align}}+w_{c}\\mathbf{a}_{\\mathrm{cohesion}}+w_{s}\\mathbf{a}_{\\mathrm{separation}}$$",
        "$$\\|\\mathbf{a}_i\\|\\le a_{\\max}$$",
      ],
      mapping: [
        "<strong>Perception Radius</strong> controls which neighbors contribute to alignment/cohesion.",
        "<strong>Separation Distance</strong> controls near-field repulsion.",
        "<strong>Alignment / Cohesion / Separation Weight</strong> map to wₐ, wᶜ, wₛ in the steering equation.",
      ],
    },
    stats: {
      sectionKey: "information-stats",
      title: "Stats",
      icon: "bi-bar-chart-line-fill",
      stats: [{ label: "FPS", valueId: "fps-live", initial: "--" }],
      charts: [
        { title: "Counts", liveId: "chart-count-live", liveInitial: "0", canvasId: "chart-count", aria: "count trend chart" },
        { title: "Speed", liveId: "chart-speed-live", liveInitial: "0.00 m/s", canvasId: "chart-speed", aria: "speed trend chart" },
        { title: "Neighbors", liveId: "chart-neighbors-live", liveInitial: "0.00", canvasId: "chart-neighbors", aria: "neighbor trend chart" },
      ],
    },
  },
  right: {
    simulation: {
      sectionKey: "simulation",
      title: "Simulation",
      icon: "bi-sliders2",
      sliderHub: {
        title: "Count",
        value: "220",
        min: "30",
        max: "650",
        step: "10",
        valueNum: "220",
      },
      sliders: [
        slider("boid-sim-speed", "Simulation Speed", "bi-stopwatch", "boid-sim-speed-value", "1.0x", "0.1", "10", "0.1", "1.0"),
        slider("boid-count", "Count", "bi-people-fill", "boid-count-value", "220", "30", "650", "10", "220"),
        slider("boid-scale", "Object Size", "bi-rulers", "boid-scale-value", "0.5 m", "0.1", "1.0", "0.1", "0.5"),
        slider("perception-radius", "Perception Radius", "bi-eye-fill", "perception-radius-value", "18.0 m", "2", "60", "0.5", "18"),
        slider("separation-distance", "Separation Distance", "bi-arrows-angle-contract", "separation-distance-value", "8.0 m", "2", "40", "0.5", "8"),
        slider("max-speed", "Max Speed", "bi-speedometer2", "max-speed-value", "8.0 m/s", "1", "25", "0.25", "8"),
        slider("max-accel", "Max Acceleration", "bi-lightning-charge-fill", "max-accel-value", "6.0 m/s²", "0.5", "30", "0.25", "6"),
        slider("alignment-weight", "Alignment Weight (wₐ)", "bi-layout-three-columns", "alignment-weight-value", "1.00", "0", "3", "0.05", "1"),
        slider("cohesion-weight", "Cohesion Weight (wᶜ)", "bi-diagram-3-fill", "cohesion-weight-value", "0.90", "0", "3", "0.05", "0.9"),
        slider("separation-weight", "Separation Weight (wₛ)", "bi-arrow-left-right", "separation-weight-value", "1.35", "0", "4", "0.05", "1.35"),
      ],
      pauseButtonId: "toggle-pause",
      defaultButtonId: "default-sim",
      resetButtonId: "reset-sim",
    },
  },
});

export class BoidSimulation {
  constructor({ scene, params, world, onStats }) {
    this.scene = scene;
    this.params = params;
    this.world = world;
    this.onStats = onStats;

    this.geometry = new THREE.ConeGeometry(0.7, 2.6, 10);
    this.geometry.rotateX(Math.PI / 2);
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: 0x222222,
      shininess: 34,
      flatShading: true,
      side: THREE.DoubleSide,
      vertexColors: false,
      toneMapped: false,
    });

    this.boids = [];
    this.mesh = null;

    this.tempObject = new THREE.Object3D();
    this.forwardVector = new THREE.Vector3(0, 0, 1);
    this.separationDelta = new THREE.Vector3();
    this.alignment = new THREE.Vector3();
    this.cohesion = new THREE.Vector3();
    this.separation = new THREE.Vector3();
    this.velocityDir = new THREE.Vector3();
    this.instanceColor = new THREE.Color();
    this.colormapLerpA = new THREE.Color();
    this.colormapLerpB = new THREE.Color();
    this.solidColorValue = new THREE.Color(params.solidColor);

    this.colormaps = buildColormapLUT({
      turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
      viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
      plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
      magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
      inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
      cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
      coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
      greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
    });
  }

  init() {
    this.spawn(this.params.boidCount);
  }

  setVisible(visible) {
    if (this.mesh) {
      this.mesh.visible = visible;
    }
  }

  onTheme(theme) {
    this.material.specular.set(theme === "light" ? 0x2c2c2c : 0x1c1c1c);
  }

  reset() {
    this.spawn(this.params.boidCount);
  }

  setCount(count) {
    this.params.boidCount = count;
    this.spawn(count);
  }

  getCount() {
    return this.boids.length;
  }

  getMesh() {
    return this.mesh;
  }

  onWorldGeometryChanged() {
    for (let i = 0; i < this.boids.length; i += 1) {
      this.world.applyBoundaryConditions(this.boids[i]);
    }
    if (this.params.boundaryMode === "lost") {
      this.removeLostBoids();
    }
    this.syncInstances();
    this.emitCurrentStats();
  }

  onBoundaryModeChanged() {
    for (let i = 0; i < this.boids.length; i += 1) {
      this.world.applyBoundaryConditions(this.boids[i]);
    }

    if (this.params.boundaryMode === "lost") {
      this.removeLostBoids();
    }

    this.syncInstances();
    this.emitCurrentStats();
  }

  syncInstances() {
    if (!this.mesh) {
      return;
    }

    const halfZ = this.params.worldSizeZ * 0.5;
    const colorBounds =
      this.params.colorMode === "none" ? null : this.getColorScalarBounds(halfZ);

    for (let i = 0; i < this.boids.length; i += 1) {
      const boid = this.boids[i];

      this.velocityDir.copy(boid.velocity);
      if (this.velocityDir.lengthSq() < 0.00001) {
        this.velocityDir.copy(this.forwardVector);
      } else {
        this.velocityDir.normalize();
      }

      this.tempObject.position.copy(boid.position);
      this.tempObject.quaternion.setFromUnitVectors(this.forwardVector, this.velocityDir);
      this.tempObject.scale.setScalar(this.params.boidScale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      if (this.params.colorMode === "none") {
        this.solidColorValue.set(this.params.solidColor);
        this.instanceColor.copy(this.solidColorValue);
      } else {
        const scalar = this.computeColorScalar(boid, halfZ);
        const span = Math.max((colorBounds?.max ?? 1) - (colorBounds?.min ?? 0), 0.000001);
        const factor = THREE.MathUtils.clamp((scalar - (colorBounds?.min ?? 0)) / span, 0, 1);
        const liftedFactor = 0.08 + factor * 0.84;
        this.applyColormap(liftedFactor, this.instanceColor);
      }

      ensureVisibleColor(this.instanceColor, 0.25);
      this.mesh.setColorAt(i, this.instanceColor);
    }

    this.mesh.count = this.boids.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  step(dt) {
    const perceptionSq = this.params.perceptionRadius * this.params.perceptionRadius;
    const separationSq = this.params.separationDistance * this.params.separationDistance;
    const usingLostBounds = this.params.boundaryMode === "lost";

    let speedSum = 0;
    let neighborSum = 0;

    for (let i = 0; i < this.boids.length; i += 1) {
      const boid = this.boids[i];

      this.alignment.set(0, 0, 0);
      this.cohesion.set(0, 0, 0);
      this.separation.set(0, 0, 0);

      let neighborCount = 0;
      let separationCount = 0;

      for (let j = 0; j < this.boids.length; j += 1) {
        if (j === i) {
          continue;
        }

        const other = this.boids[j];
        const distSq = boid.position.distanceToSquared(other.position);

        if (distSq < perceptionSq) {
          this.alignment.add(other.velocity);
          this.cohesion.add(other.position);
          neighborCount += 1;
        }

        if (distSq < separationSq && distSq > 0.000001) {
          this.separationDelta.subVectors(boid.position, other.position);
          this.separationDelta.divideScalar(distSq);
          this.separation.add(this.separationDelta);
          separationCount += 1;
        }
      }

      boid.neighbors = neighborCount;
      boid.acceleration.set(0, 0, 0);

      if (neighborCount > 0) {
        this.alignment.divideScalar(neighborCount);
        if (this.alignment.lengthSq() > 0) {
          this.alignment.setLength(this.params.maxSpeed);
          this.alignment.sub(boid.velocity);
          limitVector(this.alignment, this.params.maxAccel);
          this.alignment.multiplyScalar(this.params.alignmentWeight);
          boid.acceleration.add(this.alignment);
        }

        this.cohesion.divideScalar(neighborCount);
        this.cohesion.sub(boid.position);
        if (this.cohesion.lengthSq() > 0) {
          this.cohesion.setLength(this.params.maxSpeed);
          this.cohesion.sub(boid.velocity);
          limitVector(this.cohesion, this.params.maxAccel);
          this.cohesion.multiplyScalar(this.params.cohesionWeight);
          boid.acceleration.add(this.cohesion);
        }
      }

      if (separationCount > 0) {
        this.separation.divideScalar(separationCount);
        if (this.separation.lengthSq() > 0) {
          this.separation.setLength(this.params.maxSpeed);
          this.separation.sub(boid.velocity);
          limitVector(this.separation, this.params.maxAccel);
          this.separation.multiplyScalar(this.params.separationWeight);
          boid.acceleration.add(this.separation);
        }
      }

      boid.velocity.addScaledVector(boid.acceleration, dt);
      const minSpeed = Math.min(this.params.minSpeed, this.params.maxSpeed * 0.85);
      enforceSpeedBounds(boid.velocity, minSpeed, this.params.maxSpeed);
      boid.position.addScaledVector(boid.velocity, dt);

      const activeBoid = this.world.applyBoundaryConditions(boid);
      if (!activeBoid) {
        continue;
      }

      speedSum += boid.velocity.length();
      neighborSum += boid.neighbors;
    }

    if (usingLostBounds) {
      this.removeLostBoids();
    }

    this.syncInstances();
    this.emitStats(speedSum, neighborSum);
  }

  spawn(count) {
    this.boids.length = 0;

    const spawnRangeX = this.params.worldSizeX * 0.9;
    const spawnRangeY = this.params.worldSizeY * 0.9;
    const spawnRangeZ = this.params.worldSizeZ * 0.9;

    for (let i = 0; i < count; i += 1) {
      const startVelocity = randomDirection().multiplyScalar(
        THREE.MathUtils.randFloat(this.params.maxSpeed * 0.45, this.params.maxSpeed * 0.95),
      );

      this.boids.push({
        position: new THREE.Vector3(
          THREE.MathUtils.randFloatSpread(spawnRangeX),
          THREE.MathUtils.randFloatSpread(spawnRangeY),
          THREE.MathUtils.randFloatSpread(spawnRangeZ),
        ),
        velocity: startVelocity,
        acceleration: new THREE.Vector3(),
        neighbors: 0,
        lost: false,
      });
    }

    this.rebuildMesh();
    this.syncInstances();
    this.emitCurrentStats();
  }

  rebuildMesh() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh = null;
    }

    const capacity = Math.max(this.boids.length, 1);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = this.boids.length;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i += 1) {
      this.mesh.instanceColor.setXYZ(i, 1, 1, 1);
    }
    this.material.needsUpdate = true;
    this.scene.add(this.mesh);
  }

  removeLostBoids() {
    let removed = false;
    for (let i = this.boids.length - 1; i >= 0; i -= 1) {
      if (this.boids[i].lost) {
        this.boids.splice(i, 1);
        removed = true;
      }
    }

    if (removed) {
      this.rebuildMesh();
    }
  }

  emitCurrentStats() {
    let speedSum = 0;
    let neighborSum = 0;
    for (let i = 0; i < this.boids.length; i += 1) {
      speedSum += this.boids[i].velocity.length();
      neighborSum += this.boids[i].neighbors;
    }
    this.emitStats(speedSum, neighborSum);
  }

  emitStats(speedSum, neighborSum) {
    if (typeof this.onStats !== "function") {
      return;
    }
    this.onStats({
      count: this.boids.length,
      speedSum,
      neighborSum,
    });
  }

  computeColorScalar(boid, halfZ) {
    if (this.params.colorMode === "speed") {
      return boid.velocity.length();
    }

    if (this.params.colorMode === "altitude") {
      return boid.position.z;
    }

    if (this.params.colorMode === "neighbors") {
      return boid.neighbors;
    }

    if (this.params.colorMode === "heading") {
      this.velocityDir.copy(boid.velocity);
      if (this.velocityDir.lengthSq() < 0.00001) {
        return 0;
      }
      this.velocityDir.normalize();
      return this.velocityDir.z;
    }

    return 0;
  }

  getColorScalarBounds(halfZ) {
    if (this.params.colorMode === "altitude") {
      return { min: -halfZ, max: halfZ };
    }

    if (this.params.colorMode === "heading") {
      return { min: -1, max: 1 };
    }

    if (this.boids.length === 0) {
      return this.params.colorMode === "neighbors"
        ? { min: 0, max: 16 }
        : { min: 0, max: Math.max(this.params.maxSpeed, 1) };
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.boids.length; i += 1) {
      const scalar = this.computeColorScalar(this.boids[i], halfZ);
      if (scalar < min) {
        min = scalar;
      }
      if (scalar > max) {
        max = scalar;
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return this.params.colorMode === "neighbors"
        ? { min: 0, max: 16 }
        : { min: 0, max: Math.max(this.params.maxSpeed, 1) };
    }

    if (max - min < 0.0001) {
      return { min: min - 0.5, max: max + 0.5 };
    }

    return { min, max };
  }

  applyColormap(value, outColor) {
    const colors = this.colormaps[this.params.colormap] || this.colormaps.turbo;
    if (!colors || colors.length === 0) {
      return outColor.setRGB(1, 1, 1);
    }

    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    if (colors.length === 1) {
      return outColor.copy(colors[0]);
    }

    const scaled = clamped * (colors.length - 1);
    const index = Math.min(colors.length - 2, Math.floor(scaled));
    const t = scaled - index;

    this.colormapLerpA.copy(colors[index]);
    this.colormapLerpB.copy(colors[index + 1]);
    return outColor.copy(this.colormapLerpA).lerp(this.colormapLerpB, t);
  }
}

function buildColormapLUT(stopMap) {
  const lut = {};
  for (const [name, stops] of Object.entries(stopMap)) {
    lut[name] = stops.map((hex) => new THREE.Color(hex));
  }
  return lut;
}

function ensureVisibleColor(color, minLuminance) {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

  if (luminance >= minLuminance) {
    return color;
  }

  const deficiency = THREE.MathUtils.clamp(
    (minLuminance - luminance) / Math.max(minLuminance, 0.0001),
    0,
    1,
  );
  return color.lerp(new THREE.Color(1, 1, 1), deficiency * 0.55);
}

function limitVector(vector, maxLength) {
  if (maxLength <= 0) {
    vector.set(0, 0, 0);
    return vector;
  }

  const maxLengthSq = maxLength * maxLength;
  if (vector.lengthSq() > maxLengthSq) {
    vector.setLength(maxLength);
  }
  return vector;
}

function enforceSpeedBounds(vector, minSpeed, maxSpeed) {
  const clampedMin = Math.max(0, minSpeed);
  const clampedMax = Math.max(clampedMin, maxSpeed);
  const speed = vector.length();

  if (speed < 0.000001) {
    vector.copy(randomDirection()).multiplyScalar(Math.max(clampedMin, 0.0001));
    return vector;
  }

  const bounded = THREE.MathUtils.clamp(speed, clampedMin, clampedMax);
  vector.multiplyScalar(bounded / speed);
  return vector;
}

function randomDirection() {
  const direction = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
  );

  if (direction.lengthSq() < 0.000001) {
    direction.set(0, 0, 1);
  }

  return direction.normalize();
}
