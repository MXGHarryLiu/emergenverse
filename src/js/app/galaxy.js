// Galaxy gravity applet config and simulation implementation.
import * as THREE from "three";
import { defineAppletConfig, selectControl } from "./appletConfigUtils.js";
import { BaseSimulation } from "./baseSimulation.js";

// Unit metadata used to derive the internal gravity constant from SI.
const GALAXY_UNITS = {
  length: { label: "kly", description: "kilo-light-year", toSI: 9.4607304725808e18 },
  mass: { label: "M_sun", description: "solar mass", toSI: 1.98847e30 },
  time: { label: "Myr", description: "million years", toSI: 31557600000000 },
};
const GALAXY_SPEED_UNIT = `${GALAXY_UNITS.length.label}/${GALAXY_UNITS.time.label}`;
const GALAXY_SI_GRAVITATIONAL_CONSTANT = 6.6743e-11;
const GALAXY_TIME_SCALE_MYR_PER_SECOND = 8;
const GALAXY_DEFAULT_OBJECT_MASS_FRACTION = 0.2;
const GALAXY_GRAVITY_INTERNAL_SCALE =
  ((GALAXY_UNITS.time.toSI * GALAXY_UNITS.time.toSI) * GALAXY_UNITS.mass.toSI)
  / (GALAXY_UNITS.length.toSI ** 3);
const GALAXY_GRAVITY_INTERNAL = GALAXY_SI_GRAVITATIONAL_CONSTANT * GALAXY_GRAVITY_INTERNAL_SCALE;
const GALAXY_DEFAULT_CENTRAL_MASS = 2.2e12;
const GALAXY_DEFAULT_OBJECT_TOTAL_MASS = GALAXY_DEFAULT_CENTRAL_MASS * GALAXY_DEFAULT_OBJECT_MASS_FRACTION;
const GALAXY_INIT_PRESET_OPTIONS = [
  { value: "disk", label: "Disk" },
  { value: "cloud", label: "Cloud" },
  { value: "sphere", label: "Sphere" },
  { value: "ellipsoid", label: "Ellipsoid" },
];

// Applet UI and metadata configuration.
export const GALAXY_APPLET_CONFIG = defineAppletConfig({
  label: "Galaxy Gravity",
  camera: {
    distance: 777,
    height: 336,
    params: [
      { key: "projection", default: "perspective" },
      { key: "locked", default: false },
      { key: "fov", default: 34, uiMin: 18, uiMax: 88, step: 1 },
      { key: "moveSpeed", default: 30, uiMin: 1, uiMax: 1000, step: 1 },
      { key: "rotationSpeed", default: 84, uiMin: 10, uiMax: 720, step: 1 },
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
          { value: "speed", label: "Orbital Speed" },
        ],
      },
      { key: "colormap", default: "magma" },
      { key: "colormapInverted", default: false },
      { key: "solidColor", default: "#c9ddff" },
    ],
  },
  unit: {
    length: { label: "kly", description: "kilo-light-year", toSI: 9.4607304725808e18 },
    mass: { label: "M_sun", description: "solar mass", toSI: 1.98847e30 },
    time: { label: "Myr", description: "million years", toSI: 31557600000000 },
  },
  world: {
    params: [
      { key: "x", default: 350, uiMin: 50, uiMax: 800, step: 5 },
      { key: "y", default: 350, uiMin: 50, uiMax: 800, step: 5 },
      { key: "z", default: 350, uiMin: 50, uiMax: 800, step: 5 },
      { key: "gridSize", default: 20, uiMin: 5, uiMax: 800, step: 5 },
      { key: "boundaryMode", default: "lost" },
    ],
    lengthUnit: {
      name: GALAXY_UNITS.length.label,
      toSI: GALAXY_UNITS.length.toSI,
    },
  },
  intro: {
      paragraphs: [
        "This applet shows a self-gravitating 3D particle cloud. Matter pulls inward while initial orbital motion shapes large-scale structure over time.",
        "Open the model equations view for the force law, the central mass term, and the parameter mapping in astrophysical units.",
      ],
  },
  model: {
      subtitle: "Softened gravitational interaction in a 3D volume (kilo-light years, solar masses, Myr).",
      references: [
        { label: "Wikipedia: N-body simulation", url: "https://en.wikipedia.org/wiki/N-body_simulation" },
        { label: "Wikipedia: Galaxy formation and evolution", url: "https://en.wikipedia.org/wiki/Galaxy_formation_and_evolution" },
      ],
      items: [
        {
          title: "Position (\\(x\\))",
          equation: "$$\\begin{aligned}\\frac{d\\mathbf{x}}{dt}&=\\mathbf{v}\\\\\\mathbf{x}_i(t+\\Delta t)&=\\mathbf{x}_i(t)+\\mathbf{v}_i(t)\\,\\Delta t\\end{aligned}$$",
          explanation: "Each particle advances according to its current orbital velocity.",
        },
        {
          title: "Velocity (\\(v\\))",
          equation: "$$\\begin{aligned}\\frac{d\\mathbf{v}}{dt}&=\\mathbf{a}\\\\\\mathbf{v}_i(t+\\Delta t)&=\\mathbf{v}_i(t)+\\mathbf{a}_i(t)\\,\\Delta t\\end{aligned}$$",
          explanation: "Velocity changes in response to the current gravitational acceleration.",
        },
        {
          title: "Softened Gravity",
          equation: "$$\\mathbf{a}_i=G\\sum_{j\\ne i}m_p\\frac{\\mathbf{r}_{ji}}{\\left(\\|\\mathbf{r}_{ji}\\|^2+\\epsilon^2\\right)^{3/2}}+G\\,M_c\\frac{-\\mathbf{x}_i}{\\left(\\|\\mathbf{x}_i\\|^2+\\epsilon^2\\right)^{3/2}},\\quad m_p=\\frac{M_{\\mathrm{obj}}}{N}$$",
          explanation: "Acceleration combines particle-particle attraction with a pull from the central mass, while softening prevents singular forces at very small separations. In this applet, G is fixed to the physical SI gravitational constant and converted internally into galaxy units.",
          parameters: [
            "<strong>Central Mass</strong> (\\(M_c\\)) controls how strongly the system stays bound to the center.",
            "<strong>Object Total Mass</strong> (\\(M_{\\mathrm{obj}}\\)) sets the total self-gravitating mass represented by particles.",
            "<strong>Count</strong> (\\(N\\)) changes resolution; per-particle mass is \\(m_p=M_{\\mathrm{obj}}/N\\).",
            "<strong>Softening</strong> (\\(\\epsilon\\)) sets the short-range smoothing scale.",
          ],
        },
      ],
    },
  stats: {
      params: [
        { type: "stat", key: "galaxy-fps", label: "FPS", valueId: "galaxy-fps-live", initial: "--" },
        { type: "chart", key: "galaxy-count", label: "Count", liveInitial: "0" },
        { type: "chart", key: "galaxy-radius", label: "Radius", liveInitial: `0 ${GALAXY_UNITS.length.label}`, supportsDistribution: true },
        { type: "chart", key: "galaxy-speed", label: "Mean Speed", liveInitial: `0 ${GALAXY_SPEED_UNIT}` },
      ],
    },
  simulation: {
      selects: [
        selectControl(
          "initial-shape",
          "Initial Shape",
          "bi-stars",
          GALAXY_INIT_PRESET_OPTIONS,
          "disk",
          { group: "initial", simulationAction: "reset", paramKey: "initialShape" },
        ),
      ],
      params: [
        { key: "simSpeed", label: "Simulation Speed", default: 1.0, group: "dynamic", uiMin: 0.1, uiMax: 10, control: { type: "slider", icon: "bi-stopwatch", step: 0.1 } },
        { key: "count", label: "Count", default: 1000, group: "initial", uiMin: 50, uiMax: 5000, control: { type: "slider", icon: "bi-people-fill", step: 10, resetTrendCharts: true } },
        { key: "initialRadius", label: "Initial Radius", default: 120, unit: GALAXY_UNITS.length.label, group: "initial", uiMin: 2, uiMax: 350, control: { type: "slider", icon: "bi-bounding-box", step: 1, simulationAction: "reset", resetTrendCharts: true } },
        { key: "particleSize", label: "Object Visual Size", default: 0.75, unit: GALAXY_UNITS.length.label, group: "dynamic", uiMin: 0.08, uiMax: 2, control: { type: "slider", icon: "bi-rulers", step: 0.02 } },
        { key: "spin", label: "Initial Orbital Speed", default: 1.0, group: "initial", uiMin: 0.2, uiMax: 2.5, control: { type: "slider", icon: "bi-arrow-clockwise", step: 0.05 } },
        { key: "centralMass", label: "Central Mass (\\(M_c\\))", default: GALAXY_DEFAULT_CENTRAL_MASS, unit: GALAXY_UNITS.mass.label, group: "dynamic", uiMin: 5.0e10, uiMax: 1.0e13, control: { type: "slider", icon: "bi-bullseye", step: 5.0e10 } },
        { key: "objectTotalMass", label: "Object Total Mass (\\(M_{\\mathrm{obj}}\\))", default: GALAXY_DEFAULT_OBJECT_TOTAL_MASS, unit: GALAXY_UNITS.mass.label, group: "dynamic", uiMin: 1.0e10, uiMax: 5.0e12, control: { type: "slider", icon: "bi-boxes", step: 1.0e10 } },
        { key: "softening", label: "Softening (\\(\\epsilon\\))", default: 0.18, unit: GALAXY_UNITS.length.label, group: "dynamic", uiMin: 0.02, uiMax: 4, control: { type: "slider", icon: "bi-dot", step: 0.01 } },
      ],
    },
});

// Shell runtime hooks.
const GALAXY_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("galaxy-count", () => "0", {
        stroke: "#8eb7ff",
        fill: "rgba(142, 183, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("galaxy-radius", () => `0 ${GALAXY_UNITS.length.label}`, {
        stroke: "#9de2ff",
        fill: "rgba(157, 226, 255, 0.16)",
        supportsDistribution: true,
        defaultViewMode: "distribution",
        distributionBins: 22,
        distributionSmoothing: 1.3,
        distributionXTickFormatter: (value) => value.toFixed(1),
        distributionYTickFormatter: (value) => `${Math.round(value * 100)}%`,
        axisLabel: GALAXY_UNITS.length.label,
        tickFormatter: (value) => Math.round(value).toString(),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("galaxy-speed", () => `0 ${GALAXY_SPEED_UNIT}`, {
        stroke: "#ffbe8d",
        fill: "rgba(255, 190, 141, 0.16)",
        axisLabel: GALAXY_SPEED_UNIT,
        tickFormatter: (value) => Math.round(value).toString(),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    const count = stats.count ?? 0;
    const meanRadius = stats.meanRadius ?? 0;
    const meanSpeed = stats.meanSpeed ?? 0;
    const radiusSamples = stats.radiusSamples ?? [];

    ui.updateChartMetrics("galaxy", [count, meanRadius, meanSpeed], [
      String(count),
      `${Math.round(meanRadius).toLocaleString()} ${GALAXY_UNITS.length.label}`,
      `${Math.round(meanSpeed).toLocaleString()} ${GALAXY_SPEED_UNIT}`,
    ], {
      distributionSamples: {
        "galaxy-radius": radiusSamples,
      },
    });
  },
};

// File-local constants and helpers.
const GALAXY_COLORMAPS = buildColormapLUT(GALAXY_APPLET_CONFIG.visual?.colormap);
const lerpA = new THREE.Color();
const lerpB = new THREE.Color();

function massToInternalSolarMass(value) {
  return value;
}

function lengthToInternalLightYears(value) {
  return value;
}

// Simulation implementation.
export class GalaxySimulation extends BaseSimulation {
  static APPLET_ID = "galaxy";
  static APPLET_RUNTIME = GALAXY_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildGalaxyColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

    this.geometry = new THREE.SphereGeometry(0.42, 10, 8);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: false,
      fog: false,
      toneMapped: false,
    });

    this.particles = [];
    this.mesh = null;
    this.capacity = 0;
    this.tempObject = new THREE.Object3D();
    this.tempColor = new THREE.Color();
    this.solidColorValue = new THREE.Color(this.params.solidColor || "#c9ddff");
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

  onTheme() {}

  reset() {
    this.particles.length = 0;
    for (let i = 0; i < this.params.count; i += 1) {
      this.particles.push(this.createParticle());
    }
    this.assignInitialVelocitiesFromDistribution();
    this.ensureMesh();
    this.syncInstances();
    this.emitStats();
  }

  setCount(count) {
    this.params.count = count;
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

    const dtMyr = dt * GALAXY_TIME_SCALE_MYR_PER_SECOND;
    const soft = Math.max(0.001, lengthToInternalLightYears(this.params.softening ?? 0.18));
    const softSq = soft * soft;
    const G = GALAXY_GRAVITY_INTERNAL;
    const centralMass = Math.max(0, massToInternalSolarMass(this.params.centralMass ?? GALAXY_DEFAULT_CENTRAL_MASS));
    const objectTotalMass = Math.max(0, massToInternalSolarMass(this.params.objectTotalMass ?? GALAXY_DEFAULT_OBJECT_TOTAL_MASS));
    const particleMass = Math.max(0, objectTotalMass / Math.max(count, 1));

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
        const factor = G * particleMass * invDist3;

        a.acceleration.addScaledVector(this.tmpDelta, factor);
        b.acceleration.addScaledVector(this.tmpDelta, -factor);
      }
    }

    // Central potential that keeps the particle cloud bound.
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

      p.velocity.addScaledVector(p.acceleration, dtMyr);
      p.position.addScaledVector(p.velocity, dtMyr);
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
      for (let i = 0; i < this.capacity; i += 1) {
        this.mesh.instanceColor.setXYZ(i, 1, 1, 1);
      }
      this.scene.add(this.mesh);
    }
  }

  syncInstances() {
    if (!this.mesh) {
      return;
    }

    const scale = Math.max(0.05, this.params.particleSize ?? 0.8);
    this.speedBounds = this.getSpeedBounds();

    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      this.tempObject.position.copy(p.position);
      this.tempObject.rotation.set(0, 0, 0);
      this.tempObject.scale.setScalar(scale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      if (this.params.colorMode === "solid") {
        this.solidColorValue.set(this.params.solidColor || "#c9ddff");
        this.tempColor.copy(this.solidColorValue);
      } else {
        const speed = p.velocity.length();
        const span = Math.max(this.speedBounds.max - this.speedBounds.min, 1e-6);
        const t = THREE.MathUtils.clamp((speed - this.speedBounds.min) / span, 0, 1);
        this.applyColormap(t, this.tempColor);
      }
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
    const spreadX = this.getInitialSpreadForAxis(this.params.worldSizeX);
    const spreadY = this.getInitialSpreadForAxis(this.params.worldSizeY);
    const spreadZ = this.getInitialSpreadForAxis(this.params.worldSizeZ);
    const initialShape = String(this.params.initialShape || this.params.initPreset || "disk").toLowerCase();
    const position = sampleInitialPosition({
      preset: initialShape,
      spreadX,
      spreadY,
      spreadZ,
    });

    return {
      position,
      velocity: new THREE.Vector3(),
      acceleration: new THREE.Vector3(),
      lost: false,
    };
  }

  assignInitialVelocitiesFromDistribution() {
    const count = this.particles.length;
    if (!count) {
      return;
    }

    const initialShape = String(this.params.initialShape || this.params.initPreset || "disk").toLowerCase();
    const spin = Math.max(0, this.params.spin ?? 1);
    const gravityInternal = GALAXY_GRAVITY_INTERNAL;
    const centralMassInternal = Math.max(1e8, massToInternalSolarMass(this.params.centralMass ?? GALAXY_DEFAULT_CENTRAL_MASS));
    const objectTotalMass = Math.max(0, massToInternalSolarMass(this.params.objectTotalMass ?? GALAXY_DEFAULT_OBJECT_TOTAL_MASS));
    const particleMass = Math.max(0, objectTotalMass / Math.max(count, 1));

    const indexedByRadius = this.particles
      .map((particle, index) => ({ index, radius: Math.max(0.2, particle.position.length()) }))
      .sort((a, b) => a.radius - b.radius);

    for (let rank = 0; rank < indexedByRadius.length; rank += 1) {
      const { index, radius } = indexedByRadius[rank];
      const particle = this.particles[index];
      const radial = particle.position.clone().normalize();
      if (radial.lengthSq() < 1e-8) {
        radial.set(1, 0, 0);
      }
      const tangential = sampleInitialVelocityDirection({
        preset: initialShape,
        position: particle.position,
        radial,
      });

      const enclosedObjectMass = particleMass * (rank + 1);
      const enclosedMass = centralMassInternal + enclosedObjectMass;
      const baseSpeed = spin * Math.sqrt(
        Math.max(1e-12, gravityInternal) * enclosedMass / radius,
      );

      tangential.multiplyScalar(baseSpeed);
      tangential.x += THREE.MathUtils.randFloatSpread(baseSpeed * 0.12);
      tangential.y += THREE.MathUtils.randFloatSpread(baseSpeed * 0.12);
      tangential.z += THREE.MathUtils.randFloatSpread(baseSpeed * 0.12);
      particle.velocity.copy(tangential);
    }
  }

  getInitialSpreadForAxis(worldSize) {
    const worldLimit = Math.max(2, Number(worldSize) * 0.49);
    const requested = Number(this.params.initialRadius ?? Math.max(2, Number(worldSize) * 0.45));
    if (!Number.isFinite(requested)) {
      return worldLimit;
    }
    return THREE.MathUtils.clamp(requested, 2, worldLimit);
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

  getSpeedRange() {
    return {
      min: this.speedBounds.min,
      max: this.speedBounds.max,
    };
  }

  applyColormap(value, outColor) {
    const colors = GALAXY_COLORMAPS[this.params.colormap || "magma"] || GALAXY_COLORMAPS.magma || GALAXY_COLORMAPS.turbo;
    if (!colors || colors.length === 0) {
      outColor.setRGB(1, 1, 1);
      return outColor;
    }
    if (colors.length === 1) {
      outColor.copy(colors[0]);
      return outColor;
    }

    const normalized = this.params.colormapInverted ? 1 - value : value;
    const clamped = THREE.MathUtils.clamp(normalized, 0, 1);
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
    const radiusSamples = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const p = this.particles[i];
      const radius = p.position.length();
      radiusSum += radius;
      speedSum += p.velocity.length();
      radiusSamples[i] = radius;
    }

    this.onStats({
      count,
      meanRadius: count > 0 ? radiusSum / count : 0,
      meanSpeed: count > 0 ? speedSum / count : 0,
      radiusSamples,
    });
  }
}

function buildGalaxyColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "speed";
  const colormap = params?.colormap || "magma";
  if (colorMode === "solid") {
    return {
      visible: false,
      value: colormap,
      options: continuousColormapOptions,
      setValue() {},
      legend: null,
    };
  }

  const range = simulation?.getSpeedRange?.() ?? { min: 0, max: 1 };
  return {
    visible: true,
    value: colormap,
    options: continuousColormapOptions,
    setValue(value) {
      params.colormap = value;
      simulation?.syncInstances?.();
    },
    legend: {
      gradient: continuousColormapGradients[colormap] || continuousColormapGradients.magma,
      minText: `cmin: ${Number(range.min).toFixed(0)} ${GALAXY_SPEED_UNIT}`,
      maxText: `cmax: ${Number(range.max).toFixed(0)} ${GALAXY_SPEED_UNIT}`,
    },
  };
}

function sampleInitialPosition({ preset, spreadX, spreadY, spreadZ }) {
  if (preset === "disk") {
    const maxR = Math.max(0.2, Math.min(spreadX, spreadY));
    const r = Math.sqrt(Math.random()) * maxR;
    const angle = Math.random() * Math.PI * 2;
    const thickness = Math.max(0.08, spreadZ * 0.08);
    return new THREE.Vector3(
      r * Math.cos(angle),
      r * Math.sin(angle),
      THREE.MathUtils.randFloatSpread(thickness * 2),
    );
  }

  if (preset === "sphere") {
    const maxR = Math.max(0.2, Math.min(spreadX, spreadY, spreadZ));
    const radius = maxR * Math.cbrt(Math.random());
    return randomDirection3D().multiplyScalar(radius);
  }

  if (preset === "ellipsoid") {
    const xScale = Math.max(0.2, spreadX);
    const yScale = Math.max(0.2, spreadY);
    const zScale = Math.max(0.2, spreadZ * 0.5);
    const spherePoint = randomPointInUnitSphere();
    return new THREE.Vector3(
      spherePoint.x * xScale,
      spherePoint.y * yScale,
      spherePoint.z * zScale,
    );
  }

  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(spreadX * 2),
    THREE.MathUtils.randFloatSpread(spreadY * 2),
    THREE.MathUtils.randFloatSpread(spreadZ * 2),
  );
}

function sampleInitialVelocityDirection({ preset, position, radial }) {
  if (preset === "disk") {
    const diskTangent = new THREE.Vector3(-position.y, position.x, 0);
    if (diskTangent.lengthSq() > 1e-8) {
      return diskTangent.normalize();
    }
  }

  const reference = randomDirection3D();
  if (Math.abs(reference.dot(radial)) > 0.95) {
    reference.set(0, 1, 0);
  }
  const tangentA = new THREE.Vector3().crossVectors(radial, reference).normalize();
  const tangentB = new THREE.Vector3().crossVectors(radial, tangentA).normalize();
  const orbitAngle = Math.random() * Math.PI * 2;
  return tangentA.multiplyScalar(Math.cos(orbitAngle)).addScaledVector(tangentB, Math.sin(orbitAngle));
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

function randomDirection3D() {
  const vector = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
  );
  if (vector.lengthSq() < 1e-8) {
    vector.set(0, 0, 1);
  }
  return vector.normalize();
}

function randomPointInUnitSphere() {
  for (let i = 0; i < 16; i += 1) {
    const candidate = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(2),
      THREE.MathUtils.randFloatSpread(2),
      THREE.MathUtils.randFloatSpread(2),
    );
    if (candidate.lengthSq() <= 1) {
      return candidate;
    }
  }
  return randomDirection3D().multiplyScalar(Math.cbrt(Math.random()));
}
