// Galaxy gravity applet config and simulation implementation.
import * as THREE from "three";
import { createAppletParams, defineAppletConfig, slider } from "./appletConfigUtils.js";

// Unit metadata used to derive the internal gravity constant from SI.
const GALAXY_UNITS = {
  length: { label: "ly", toSI: 9.4607304725808e15 },
  mass: { label: "M_sun", toSI: 1.98847e30 },
  time: { label: "Myr", toSI: 31557600000000 },
};
const GALAXY_SPEED_UNIT = `${GALAXY_UNITS.length.label}/${GALAXY_UNITS.time.label}`;
const GALAXY_SI_GRAVITATIONAL_CONSTANT = 6.6743e-11;
const GALAXY_TIME_SCALE_MYR_PER_SECOND = 8;
const GALAXY_DISK_MASS_FRACTION = 0.2;
const GALAXY_GRAVITY_INTERNAL_SCALE =
  ((GALAXY_UNITS.time.toSI * GALAXY_UNITS.time.toSI) * GALAXY_UNITS.mass.toSI)
  / (GALAXY_UNITS.length.toSI ** 3);
const GALAXY_GRAVITY_INTERNAL = GALAXY_SI_GRAVITATIONAL_CONSTANT * GALAXY_GRAVITY_INTERNAL_SCALE;

// Default applet parameters.
export const GALAXY_DEFAULT_PARAMS = {
  simSpeed: 1.0,
  colorMode: "speed",
  colormap: "magma",
  solidColor: "#c9ddff",
  count: 500,
  particleSize: 900,
  spin: 1.35,
  centralMass: 2.2e12,
  softening: 180,
  damping: 0.003,
};

// Applet UI and metadata configuration.
export const GALAXY_APPLET_CONFIG = defineAppletConfig({
  label: "Galaxy Gravity",
  defaultProjection: "perspective",
  defaultBoundaryMode: "lost",
  camera: {
    distance: 130000,
    height: 70000,
    fov: 34,
    locked: false,
  },
  units: GALAXY_UNITS,
  world: {
    defaults: { x: 120000, y: 120000, z: 120000 },
    range: { minX: 20000, maxX: 300000, minY: 20000, maxY: 300000, minZ: 20000, maxZ: 300000, step: 1000 },
    gridSize: 5000,
    lengthUnit: {
      name: GALAXY_UNITS.length.label,
      toSI: GALAXY_UNITS.length.toSI,
    },
  },
  left: {
    intro: {
      sectionKey: "galaxy-introduction",
      title: "Introduction",
      icon: "bi-journal-text",
      hidden: true,
      paragraphs: [
        "This applet shows a rotating self-gravitating disk. Matter pulls inward, orbital motion spreads material around the center, and large-scale structure develops from that balance.",
        "Open the model equations view for the force law, the central mass term, and the parameter mapping in astrophysical units.",
      ],
    },
    model: {
      buttonLabel: "Open Model Equations",
      subtitle: "Softened gravitational interaction in light years, solar masses, and Myr.",
      references: [
        { label: "Wikipedia: N-body simulation", url: "https://en.wikipedia.org/wiki/N-body_simulation" },
        { label: "Wikipedia: Galaxy formation and evolution", url: "https://en.wikipedia.org/wiki/Galaxy_formation_and_evolution" },
      ],
      items: [
        {
          title: "Position Update",
          equation: "$$\\mathbf{x}_i(t+\\Delta t)=\\mathbf{x}_i(t)+\\mathbf{v}_i(t)\\,\\Delta t$$",
          explanation: "Each particle advances according to its current orbital velocity.",
        },
        {
          title: "Velocity Update",
          equation: "$$\\mathbf{v}_i(t+\\Delta t)=\\mathbf{v}_i(t)+\\mathbf{a}_i(t)\\,\\Delta t$$",
          explanation: "Velocity changes in response to the current gravitational acceleration before damping is applied.",
        },
        {
          title: "Softened Gravity",
          equation: "$$\\mathbf{a}_i=G\\sum_{j\\ne i}\\frac{\\mathbf{r}_{ji}}{\\left(\\|\\mathbf{r}_{ji}\\|^2+\\epsilon^2\\right)^{3/2}}+G\\,M_c\\frac{-\\mathbf{x}_i}{\\left(\\|\\mathbf{x}_i\\|^2+\\epsilon^2\\right)^{3/2}}$$",
          explanation: "Acceleration combines particle-particle attraction with a pull from the central mass, while softening prevents singular forces at very small separations. In this applet, G is fixed to the physical SI gravitational constant and converted internally into galaxy units.",
          parameters: [
            "<strong>Central Mass</strong> (<em>M<sub>c</sub></em>) controls how strongly the disk stays bound to the center.",
            "<strong>Softening</strong> (<em>&epsilon;</em>) sets the short-range smoothing scale.",
          ],
        },
        {
          title: "Damped Orbit Update",
          equation: "$$\\mathbf{v}_i\\leftarrow (1-\\lambda\\,\\Delta t)\\,\\mathbf{v}_i$$",
          explanation: "A damping term removes some kinetic energy each step so the disk can settle into cleaner large-scale structure.",
          parameters: [
            "<strong>Damping</strong> (<em>&lambda;</em>) controls how quickly orbital energy is dissipated.",
          ],
        },
      ],
    },
    stats: {
      sectionKey: "galaxy-stats",
      title: "Stats",
      icon: "bi-bar-chart-line-fill",
      hidden: true,
      stats: [{ label: "FPS", valueId: "galaxy-fps-live", initial: "--" }],
      charts: [
        { title: "Count", liveId: "chart-galaxy-count-live", liveInitial: "0", canvasId: "chart-galaxy-count", aria: "galaxy count trend chart" },
        { title: "Mean Radius", liveId: "chart-galaxy-radius-live", liveInitial: `0 ${GALAXY_UNITS.length.label}`, canvasId: "chart-galaxy-radius", aria: "galaxy mean radius trend chart" },
        { title: "Mean Speed", liveId: "chart-galaxy-speed-live", liveInitial: `0 ${GALAXY_SPEED_UNIT}`, canvasId: "chart-galaxy-speed", aria: "galaxy mean speed trend chart" },
      ],
    },
  },
  right: {
    simulation: {
      sectionKey: "galaxy-simulation",
      title: "Simulation",
      icon: "bi-sliders2",
      hidden: true,
      className: "mt-2",
      sliderHub: { title: "Count", value: "500", min: "50", max: "2000", step: "10", valueNum: "500" },
      sliders: [
        slider("galaxy-sim-speed", "Simulation Speed", "bi-stopwatch", "galaxy-sim-speed-value", "1.0x", "0.1", "10", "0.1", "1.0"),
        slider("galaxy-count", "Count", "bi-people-fill", "galaxy-count-value", "500", "50", "2000", "10", "500"),
        slider("galaxy-particle-size", "Object Visual Size", "bi-rulers", "galaxy-particle-size-value", `900 ${GALAXY_UNITS.length.label}`, "80", "4000", "20", "900"),
        slider("galaxy-spin", "Initial Spin", "bi-arrow-clockwise", "galaxy-spin-value", "1.35", "0.2", "2.5", "0.05", "1.35"),
        slider("galaxy-central-mass", "Central Mass (M_c)", "bi-bullseye", "galaxy-central-mass-value", `2.20e+12 ${GALAXY_UNITS.mass.label}`, "5.0e10", "1.0e13", "5.0e10", "2.2e12"),
        slider("galaxy-softening", "Softening (ε)", "bi-dot", "galaxy-softening-value", `180 ${GALAXY_UNITS.length.label}`, "20", "4000", "10", "180"),
        slider("galaxy-damping", "Damping (λ)", "bi-sliders", "galaxy-damping-value", `0.0030 1/${GALAXY_UNITS.time.label}`, "0.0", "0.020", "0.0005", "0.003"),
      ],
      pauseButtonId: "toggle-galaxy-pause",
      defaultButtonId: "default-galaxy-sim",
      resetButtonId: "reset-galaxy-sim",
    },
  },
});

// Shell runtime hooks.
export const GALAXY_APPLET_RUNTIME = {
  createChartMetrics(createChartMetric) {
    return [
      createChartMetric("chart-galaxy-count", "chart-galaxy-count-live", () => "0", {
        stroke: "#8eb7ff",
        fill: "rgba(142, 183, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-galaxy-radius", "chart-galaxy-radius-live", () => `0 ${GALAXY_UNITS.length.label}`, {
        stroke: "#9de2ff",
        fill: "rgba(157, 226, 255, 0.16)",
        axisLabel: GALAXY_UNITS.length.label,
        tickFormatter: (value) => Math.round(value).toString(),
        forceZeroMin: true,
      }),
      createChartMetric("chart-galaxy-speed", "chart-galaxy-speed-live", () => `0 ${GALAXY_SPEED_UNIT}`, {
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

    ui.updateChartMetrics("galaxy", [count, meanRadius, meanSpeed], [
      String(count),
      `${Math.round(meanRadius).toLocaleString()} ${GALAXY_UNITS.length.label}`,
      `${Math.round(meanSpeed).toLocaleString()} ${GALAXY_SPEED_UNIT}`,
    ]);
  },
};

export const GALAXY_APPLET_VISUAL = {
  controls: {
    colorModeId: "galaxy-color-mode",
    solidColorId: "galaxy-solid-color",
    solidColorValueId: "galaxy-solid-color-value",
    singleColorWrapId: "galaxy-single-color-wrap",
  },
  section: {
    hidden: true,
    colorModeLabel: "Color Mode",
    colorModeOptions: [
      { value: "none", label: "None (single color)" },
      { value: "speed", label: "Orbital Speed" },
    ],
    solidColorLabel: "Color",
    solidColorDefault: "#C9DDFF",
  },
  getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    const colorMode = params?.colorMode || "speed";
    const colormap = params?.colormap || "magma";
    if (colorMode === "none") {
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
        minText: `cmin: ${Number(range.min).toFixed(0)} ly/Myr`,
        maxText: `cmax: ${Number(range.max).toFixed(0)} ly/Myr`,
      },
    };
  },
};

// File-local constants and helpers.
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

function massToInternalSolarMass(value) {
  return value;
}

function lengthToInternalLightYears(value) {
  return value;
}

// Simulation implementation.
export class GalaxySimulation {
  constructor({ scene, params, world, onStats }) {
    this.scene = scene;
    this.params = createAppletParams(params, "galaxy");
    this.world = world;
    this.onStats = onStats;

    this.geometry = new THREE.SphereGeometry(0.42, 10, 8);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
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
    const soft = Math.max(1, lengthToInternalLightYears(this.params.softening ?? 180));
    const softSq = soft * soft;
    const G = GALAXY_GRAVITY_INTERNAL;
    const centralMass = Math.max(0, massToInternalSolarMass(this.params.centralMass ?? 2.2e12));
    const particleMass = Math.max(1e6, (centralMass * GALAXY_DISK_MASS_FRACTION) / Math.max(count, 1));
    const damping = THREE.MathUtils.clamp(this.params.damping ?? 0.003, 0, 0.05);

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

      p.velocity.addScaledVector(p.acceleration, dtMyr);
      p.velocity.multiplyScalar(Math.max(0, 1 - damping * dtMyr));
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

      if (this.params.colorMode === "none") {
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
    const diskRadius = Math.max(5000, Math.min(this.params.worldSizeX, this.params.worldSizeY) * 0.45);
    const r = Math.sqrt(Math.random()) * diskRadius;
    const theta = Math.random() * Math.PI * 2;
    const zJitter = THREE.MathUtils.randFloatSpread(Math.max(250, this.params.worldSizeZ * 0.06));

    const position = new THREE.Vector3(
      Math.cos(theta) * r,
      Math.sin(theta) * r,
      zJitter,
    );

    const tangential = new THREE.Vector3(-Math.sin(theta), Math.cos(theta), 0);
    const spin = Math.max(0, this.params.spin ?? 1.35);
    const gravityInternal = GALAXY_GRAVITY_INTERNAL;
    const centralMassInternal = Math.max(1e8, massToInternalSolarMass(this.params.centralMass ?? 2.2e12));
    const baseSpeed = spin * Math.sqrt(
      Math.max(1e-12, gravityInternal) * centralMassInternal / Math.max(200, r),
    );
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
