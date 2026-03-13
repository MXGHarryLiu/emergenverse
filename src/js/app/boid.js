// Boids applet config and simulation implementation.
import * as THREE from "three";
import { defineAppletConfig } from "./appletConfigUtils.js";
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const BOID_APPLET_CONFIG = defineAppletConfig({
  label: "Boids",
  camera: {
    params: [
      { key: "projection", default: "perspective" },
      { key: "locked", default: false },
      { key: "fov", default: 50, uiMin: 20, uiMax: 90, step: 1 },
      { key: "moveSpeed", default: 120, uiMin: 1, uiMax: 100000, step: 1 },
      { key: "rotationSpeed", default: 84, uiMin: 1, uiMax: 720, step: 1 },
    ],
  },
  visual: {
    colormap: [
      { name: "turbo", value: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16] },
      { name: "viridis", value: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825] },
      { name: "plasma", value: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921] },
      { name: "magma", value: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf] },
      { name: "inferno", value: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4] },
      { name: "cividis", value: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f] },
      { name: "coolwarm", value: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426] },
      { name: "greys", value: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2] },
    ],
    params: [
      {
        key: "colorMode",
        default: "speed",
        options: [
          { value: "solid", label: "Single color" },
          { value: "speed", label: "Speed (m/s)" },
          { value: "altitude", label: "Altitude (z, m)" },
          { value: "neighbors", label: "Neighbor Count" },
          { value: "heading", label: "Heading (z component)" },
        ],
      },
      { key: "colormap", default: "turbo" },
      { key: "colormapInverted", default: false },
      { key: "solidColor", default: "#4cd3b6" },
    ],
  },
  unit: {
    length: { label: "m", description: "meter", toSI: 1 },
    mass: { label: "a.u.", description: "arbitrary unit" },
    time: { label: "s", description: "second", toSI: 1 },
  },
  world: {
    params: [
      { key: "x", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "y", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "z", default: 100, uiMin: 30, uiMax: 260, step: 2 },
      { key: "gridSize", default: 5, uiMin: 2, uiMax: 320, step: 2 },
      { key: "boundaryMode", default: "cyclic-xyz" },
    ],
  },
  intro: {
      paragraphs: [
        "This applet shows flocking as a local coordination process. Each boid responds to nearby neighbors, and large-scale group motion emerges from those simple local interactions.",
        "Open the model equations view for the update rules and the parameter-to-equation mapping.",
      ],
    },
  model: {
      references: [
        { label: "Wikipedia: Boids", url: "https://en.wikipedia.org/wiki/Boids" },
      ],
      items: [
        {
          title: "Position (\\(x\\))",
          equation: "$$\\begin{aligned}\\frac{d\\mathbf{x}}{dt}&=\\mathbf{v}\\\\\\mathbf{x}_i(t+\\Delta t)&=\\mathbf{x}_i(t)+\\mathbf{v}_i(t)\\,\\Delta t\\end{aligned}$$",
          explanation: "Each boid advances according to its current velocity during the next simulation step.",
        },
        {
          title: "Velocity (\\(v\\))",
          equation: "$$\\begin{aligned}\\frac{d\\mathbf{v}}{dt}&=\\frac{\\mathrm{clip}(\\mathbf{v}+\\mathbf{a}\\,\\Delta t)-\\mathbf{v}}{\\Delta t}\\\\\\mathbf{v}_i(t+\\Delta t)&=\\mathrm{clip}\\!\\left(\\mathbf{v}_i(t)+\\mathbf{a}_i(t)\\,\\Delta t\\right)\\end{aligned}$$",
          explanation: "Velocity changes by the steering acceleration and is then clamped so the boid stays within its allowed motion limits.",
        },
        {
          title: "Steering Composition",
          equation: "$$\\mathbf{a}_i=w_{a}\\mathbf{a}_{\\mathrm{align}}+w_{c}\\mathbf{a}_{\\mathrm{cohesion}}+w_{s}\\mathbf{a}_{\\mathrm{separation}}$$",
          explanation: "The steering vector is formed by combining alignment, cohesion, and separation responses to nearby flockmates.",
          parameters: [
            "<strong>Alignment Weight</strong> (\\(w_a\\)), <strong>Cohesion Weight</strong> (\\(w_c\\)), and <strong>Separation Weight</strong> (\\(w_s\\)) scale the three steering terms.",
          ],
        },
      ],
    },
  stats: {
      params: [
        { type: "stat", key: "boid-fps", label: "FPS", valueId: "fps-live", initial: "--" },
        { type: "chart", key: "count", label: "Counts", liveInitial: "0" },
        { type: "chart", key: "speed", label: "Speed", liveInitial: "0.00 m/s", supportsDistribution: true },
        { type: "chart", key: "neighbors", label: "Neighbors", liveInitial: "0.00" },
      ],
    },
  simulation: {
      params: [
        { key: "simSpeed", label: "Simulation Speed", default: 1.0, uiMin: 0.1, uiMax: 10, group: "dynamic", control: { type: "slider", icon: "bi-stopwatch", step: 0.1 } },
        { key: "count", label: "Count", default: 220, uiMin: 30, uiMax: 650, group: "initial", control: { type: "slider", icon: "bi-people-fill", step: 10, resetTrendCharts: true } },
        { key: "scale", label: "Object Visual Size", default: 0.5, unit: "m", group: "dynamic", uiMin: 0.1, uiMax: 1.0, control: { type: "slider", icon: "bi-rulers", step: 0.1 } },
        { key: "perceptionRadius", label: "Perception Radius", default: 18, unit: "m", group: "dynamic", uiMin: 2, uiMax: 60, control: { type: "slider", icon: "bi-eye-fill", step: 0.5 } },
        { key: "separationDistance", label: "Separation Distance", default: 8, unit: "m", group: "dynamic", uiMin: 2, uiMax: 40, control: { type: "slider", icon: "bi-arrows-angle-contract", step: 0.5 } },
        { key: "maxSpeed", label: "Max Speed", default: 8, unit: "m/s", group: "dynamic", uiMin: 1, uiMax: 25, control: { type: "slider", icon: "bi-speedometer2", step: 0.25 } },
        { key: "maxAccel", label: "Max Acceleration", default: 6, unit: "m/s²", group: "dynamic", uiMin: 0.5, uiMax: 30, control: { type: "slider", icon: "bi-lightning-charge-fill", step: 0.25 } },
        { key: "alignmentWeight", label: "Alignment Weight (\\(w_a\\))", default: 1.0, group: "dynamic", uiMin: 0, uiMax: 3, control: { type: "slider", icon: "bi-layout-three-columns", step: 0.05 } },
        { key: "cohesionWeight", label: "Cohesion Weight (\\(w_c\\))", default: 0.9, group: "dynamic", uiMin: 0, uiMax: 3, control: { type: "slider", icon: "bi-diagram-3-fill", step: 0.05 } },
        { key: "separationWeight", label: "Separation Weight (\\(w_s\\))", default: 1.35, group: "dynamic", uiMin: 0, uiMax: 4, control: { type: "slider", icon: "bi-arrow-left-right", step: 0.05 } },
        { key: "minSpeed", default: 2.5 },
      ],
    },
});

// Shell runtime hooks.
const BOID_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("speed", () => "0.00 m/s", {
        stroke: "#4cd3b6",
        fill: "rgba(76, 211, 182, 0.14)",
        supportsDistribution: true,
        defaultViewMode: "distribution",
        distributionBins: 22,
        distributionSmoothing: 1.3,
        distributionXTickFormatter: (value) => value.toFixed(1),
        distributionYTickFormatter: (value) => `${Math.round(value * 100)}%`,
        axisLabel: "m/s",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("neighbors", () => "0.00", {
        stroke: "#5aa4ff",
        fill: "rgba(90, 164, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    const boidCount = stats.count ?? 0;
    const speedSum = stats.speedSum ?? 0;
    const neighborSum = stats.neighborSum ?? 0;
    const speedSamples = stats.speedSamples ?? [];
    const avgSpeed = boidCount > 0 ? speedSum / boidCount : 0;
    const avgNeighbors = boidCount > 0 ? neighborSum / boidCount : 0;

    ui.updateChartMetrics("boid", [boidCount, avgSpeed, avgNeighbors], [
      String(boidCount),
      `${avgSpeed.toFixed(2)} m/s`,
      avgNeighbors.toFixed(2),
    ], {
      distributionSamples: {
        speed: speedSamples,
      },
    });
  },
};

// Simulation implementation.
export class BoidSimulation extends BaseSimulation {
  static APPLET_ID = "boid";
  static APPLET_RUNTIME = BOID_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildBoidColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

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
    this.solidColorValue = new THREE.Color(this.params.solidColor);

    this.colormaps = buildColormapLUT(BOID_APPLET_CONFIG.visual?.colormap);
  }

  init() {
    this.spawn(this.params.count);
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
    this.spawn(this.params.count);
  }

  setCount(count) {
    this.params.count = count;
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
      this.params.colorMode === "solid" ? null : this.getColorScalarBounds(halfZ);

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
      this.tempObject.scale.setScalar(this.params.scale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      if (this.params.colorMode === "solid") {
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
    const speedSamples = new Float32Array(this.boids.length);
    for (let i = 0; i < this.boids.length; i += 1) {
      speedSamples[i] = this.boids[i].velocity.length();
    }
    this.onStats({
      count: this.boids.length,
      speedSum,
      neighborSum,
      speedSamples,
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

    const normalized = this.params.colormapInverted ? 1 - value : value;
    const clamped = THREE.MathUtils.clamp(normalized, 0, 1);
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

// File-local helper functions.
function buildBoidColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "solid";
  const colormap = params?.colormap || "turbo";
  const range = getBoidColormapRange(colorMode, params);

  return {
    visible: colorMode !== "solid",
    value: colormap,
    options: continuousColormapOptions,
    setValue(value) {
      params.colormap = value;
      simulation?.syncInstances?.();
    },
    legend: {
      gradient: continuousColormapGradients[colormap] || continuousColormapGradients.turbo,
      minText: `cmin: ${Number(range.min).toFixed(range.digits)}${range.unit ? ` ${range.unit}` : ""}`,
      maxText: `cmax: ${Number(range.max).toFixed(range.digits)}${range.unit ? ` ${range.unit}` : ""}`,
    },
  };
}

function getBoidColormapRange(colorMode, params) {
  if (colorMode === "speed") {
    return {
      min: 0,
      max: params?.maxSpeed ?? 1,
      unit: "m/s",
      digits: 1,
    };
  }
  if (colorMode === "altitude") {
    const halfZ = (params?.worldSizeZ ?? 100) * 0.5;
    return {
      min: -halfZ,
      max: halfZ,
      unit: "m",
      digits: 1,
    };
  }
  if (colorMode === "neighbors") {
    return {
      min: 0,
      max: 16,
      unit: "",
      digits: 0,
    };
  }
  return { min: -1, max: 1, unit: "", digits: 2 };
}

function buildColormapLUT(colormapEntries) {
  const lut = {};
  const entries = Array.isArray(colormapEntries) ? colormapEntries : [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = String(entry?.name || "").trim();
    const stops = Array.isArray(entry?.value) ? entry.value : [];
    if (!name || stops.length === 0) {
      continue;
    }
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
