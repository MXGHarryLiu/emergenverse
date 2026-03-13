// Sand dune applet config and simulation implementation.
import * as THREE from "three";
import { defineAppletConfig, slider } from "./appletConfigUtils.js";
import { BaseSimulation } from "./baseSimulation.js";

// Default applet parameters.
export const DUNE_DEFAULT_PARAMS = {
  simSpeed: 1.0,
  colorMode: "mass",
  colormap: "cividis",
  colormapInverted: false,
  solidColor: "#D8B36A",
  objectSizeM: 5.0,
  heightScale: 1.8,
  windDirectionDeg: 20,
  windStrength: 0.9,
  transportRate: 0.28,
  reposeSlope: 1.4,
  avalancheRate: 0.7,
  baseHeight: 2.2,
  noiseAmplitude: 0.25,
};

// Applet UI and metadata configuration.
export const DUNE_APPLET_CONFIG = defineAppletConfig({
  label: "Dune Dynamics",
  defaultProjection: "perspective",
  defaultBoundaryMode: "cyclic-xy",
  camera: {
    distance: 222,
    height: 96,
    fov: 50,
    locked: false,
  },
  world: {
    defaults: { x: 120, y: 120, z: 120 },
    range: { minX: 60, maxX: 220, minY: 60, maxY: 220, minZ: 60, maxZ: 220, step: 2 },
    gridSize: 10,
  },
  left: {
    intro: {
      sectionKey: "introduction",
      icon: "bi-journal-text",
      hidden: true,
      paragraphs: [
        "This applet models a sand bed as square columns that exchange sediment under steady wind. Wind moves grains downwind, while steep faces relax through avalanching.",
        "Open the model equations view for the transport rule, the avalanche threshold, and the control mapping.",
      ],
    },
    model: {
      buttonLabel: "Open Model Equations",
      subtitle: "Discrete height-field dunes with wind transport and repose-limited avalanches.",
      references: [
        { label: "Wikipedia: Aeolian processes", url: "https://en.wikipedia.org/wiki/Aeolian_processes" },
        { label: "Wikipedia: Angle of repose", url: "https://en.wikipedia.org/wiki/Angle_of_repose" },
      ],
      items: [
        {
          title: "Wind Transport",
          equation: "$$\\begin{aligned}\\frac{\\partial h}{\\partial t}&=-\\nabla\\cdot\\mathbf{q},\\quad q_{ij}=W\\,\\tau\\,h_{ij}\\\\h_{ij}^{t+\\Delta t}&=h_{ij}^{t}-q_{ij}\\,\\Delta t\\\\h_{i+u,j+v}^{t+\\Delta t}&=h_{i+u,j+v}^{t}+q_{ij}\\,\\Delta t\\end{aligned}$$",
          explanation: "Sediment is removed from one column and deposited one cell downwind. In this reduced model, wind strength multiplies the transport term rather than acting as a separate force law.",
          parameters: [
            "<strong>Wind Strength</strong> (\\(W\\)) scales the aerodynamic forcing that drives downwind transport.",
            "<strong>Transport Rate</strong> (\\(\\tau\\)) controls how much movable sand shifts to the next downwind cell.",
          ],
        },
        {
          title: "Avalanche Relaxation",
          equation: "$$\\Delta h_{ij\\to kl}=A\\,\\max\\!\\left(0,\\,|h_{ij}-h_{kl}|-s_r\\right)$$",
          explanation: "When the local slope exceeds the repose threshold, sand is redistributed downhill until the face relaxes.",
          parameters: [
            "<strong>Repose Slope</strong> (\\(s_r\\)) sets the critical height difference before failure.",
            "<strong>Avalanche Rate</strong> (\\(A\\)) controls how quickly unstable faces relax.",
          ],
        },
        {
          title: "Initial Bed",
          equation: "$$h_{ij}(0)=h_0+\\Delta h\\,\\xi_{ij},\\qquad \\xi_{ij}\\in[-1,1]$$",
          explanation: "The dune field starts from a uniform base height with optional random roughness. With <em>&Delta;h = 0</em>, the initial bed is flat.",
          parameters: [
            "<strong>Base Height</strong> (\\(h_0\\)) sets the starting sand thickness.",
            "<strong>Noise Amplitude</strong> (\\(\\Delta h\\)) controls how much initial roughness is added to the flat bed.",
          ],
        },
        {
          title: "Rendered Height",
          equation: "$$w_{ij}=S_{xy}\\,\\Delta x,\\qquad \\ell_{ij}=S_{xy}\\,\\Delta y,\\qquad z_{ij}=S_h\\,h_{ij}$$",
          explanation: "Each square column is drawn using the simulation cell size scaled into a visual footprint in x and y, together with a separate visual height scale in z. The dune visual map colors columns by a mass proxy proportional to column height because each tile keeps a fixed footprint in the underlying model.",
          parameters: [
            "<strong>Object Visual Size</strong> (\\(w = \\ell = s_{obj}\\)) sets the rendered column width and length in meters without changing the simulation grid.",
            "<strong>Vertical Exaggeration</strong> (\\(S_h\\)) scales column height in the rendered scene.",
          ],
        },
      ],
    },
    stats: {
      sectionKey: "stats",
      icon: "bi-bar-chart-line-fill",
      hidden: true,
      stats: [
        { label: "FPS", valueId: "dune-fps-live", initial: "--" },
        { label: "Avalanches", valueId: "dune-avalanche-live", initial: "0" },
      ],
      charts: [
        { title: "Mean Height", liveId: "chart-dune-height-live", liveInitial: "0.00 m", canvasId: "chart-dune-height", aria: "dune mean height trend chart" },
        { title: "Relief", liveId: "chart-dune-relief-live", liveInitial: "0.00 m", canvasId: "chart-dune-relief", aria: "dune relief trend chart" },
        { title: "Transport", liveId: "chart-dune-transport-live", liveInitial: "0.00 m/s", canvasId: "chart-dune-transport", aria: "dune transport trend chart" },
      ],
    },
  },
  right: {
    simulation: {
      sectionKey: "simulation",
      icon: "bi-sliders2",
      hidden: true,
      className: "mt-2",
      sliderHub: { title: "Object Visual Size", value: "5.0 m", min: "0.5", max: "20.0", step: "0.1", valueNum: "5.0" },
      sliders: [
        slider("sim-speed", "Simulation Speed", "bi-stopwatch", "sim-speed-value", "1.0x", "0.1", "10", "0.1", "1.0", { group: "dynamic" }),
        slider("scale", "Object Visual Size", "bi-rulers", "scale-value", "5.0 m", "0.5", "20.0", "0.1", "5.0", { group: "initial", paramKey: "objectSizeM", simulationAction: "reset", resetTrendCharts: true }),
        slider("height-scale", "Vertical Exaggeration", "bi-bar-chart-steps", "height-scale-value", "1.80x", "0.5", "4.0", "0.05", "1.8", { group: "dynamic" }),
        slider("wind-direction", "Wind Direction", "bi-compass", "wind-direction-value", "20°", "-180", "180", "1", "20", { group: "dynamic", paramKey: "windDirectionDeg" }),
        slider("wind-strength", "Wind Strength", "bi-wind", "wind-strength-value", "0.90", "0.0", "3.0", "0.05", "0.9", { group: "dynamic" }),
        slider("transport-rate", "Transport Rate", "bi-arrow-left-right", "transport-rate-value", "0.28", "0.0", "1.5", "0.02", "0.28", { group: "dynamic" }),
        slider("repose-slope", "Repose Slope", "bi-triangle-half", "repose-slope-value", "1.40 m", "0.2", "4.0", "0.05", "1.4", { group: "dynamic" }),
        slider("avalanche-rate", "Avalanche Rate", "bi-chevron-down", "avalanche-rate-value", "0.70", "0.0", "2.0", "0.05", "0.7", { group: "dynamic" }),
        slider("base-height", "Base Height", "bi-box-fill", "base-height-value", "2.20 m", "0.2", "6.0", "0.05", "2.2", { group: "initial", simulationAction: "reset", resetTrendCharts: true }),
        slider("noise-amplitude", "Noise Amplitude", "bi-stars", "noise-amplitude-value", "0.25 m", "0.0", "3.0", "0.05", "0.25", { group: "initial", simulationAction: "reset", resetTrendCharts: true }),
      ],
      pauseButtonId: "toggle-dune-pause",
      defaultButtonId: "default-dune-sim",
      resetButtonId: "reset-dune-sim",
    },
  },
});

// Shell runtime hooks.
export const DUNE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("chart-dune-height", "chart-dune-height-live", () => "0.00 m", {
        stroke: "#f6d17b",
        fill: "rgba(246, 209, 123, 0.16)",
        axisLabel: "m",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("chart-dune-relief", "chart-dune-relief-live", () => "0.00 m", {
        stroke: "#ef9d5d",
        fill: "rgba(239, 157, 93, 0.15)",
        axisLabel: "m",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("chart-dune-transport", "chart-dune-transport-live", () => "0.00 m/s", {
        stroke: "#8fded4",
        fill: "rgba(143, 222, 212, 0.14)",
        axisLabel: "m/s",
        tickFormatter: (value) => value.toFixed(2),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    ui.setText("dune-avalanche-live", String(Math.round(stats.avalancheEvents ?? 0)));
    ui.updateChartMetrics("dune", [
      stats.meanHeight ?? 0,
      stats.relief ?? 0,
      stats.transportFlux ?? 0,
    ], [
      `${(stats.meanHeight ?? 0).toFixed(2)} m`,
      `${(stats.relief ?? 0).toFixed(2)} m`,
      `${(stats.transportFlux ?? 0).toFixed(2)} m/s`,
    ]);
  },
};

export const DUNE_APPLET_VISUAL = {
  controls: {
    colorModeId: "dune-color-mode",
    solidColorId: "dune-solid-color",
    solidColorValueId: "dune-solid-color-value",
    singleColorWrapId: "dune-single-color-wrap",
  },
  section: {
    hidden: true,
    colorModeLabel: "Color Mode",
    colorModeOptions: [
      { value: "none", label: "None (single color)" },
      { value: "mass", label: "Column Mass" },
    ],
    solidColorLabel: "Color",
    solidColorDefault: "#D8B36A",
  },
  getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    const colorMode = params?.colorMode || "mass";
    const colormap = params?.colormap || "cividis";
    if (colorMode === "none") {
      return {
        visible: false,
        value: colormap,
        options: continuousColormapOptions,
        setValue() {},
        legend: null,
      };
    }

    const range = simulation?.getColumnMassRange?.() ?? {
      min: Math.max(0, params?.baseHeight ?? 0),
      max: Math.max(0, params?.baseHeight ?? 0),
    };
    return {
      visible: true,
      value: colormap,
      options: continuousColormapOptions,
      setValue(value) {
        params.colormap = value;
        simulation?.syncInstances?.();
      },
      legend: {
        gradient: continuousColormapGradients[colormap] || continuousColormapGradients.cividis,
        minText: `cmin: ${Number(range.min).toFixed(2)} a.u.`,
        maxText: `cmax: ${Number(range.max).toFixed(2)} a.u.`,
      },
    };
  },
};

// File-local constants and helpers.
const DUNE_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
  viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
  plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
  magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
  inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
  cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
  coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
  greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
};
const DUNE_COLORMAPS = buildColormapLUT(DUNE_COLORMAP_STOPS);
const duneColor = new THREE.Color();
const duneSolidColor = new THREE.Color();
const duneLerpA = new THREE.Color();
const duneLerpB = new THREE.Color();
const duneWhite = new THREE.Color(1, 1, 1);

// Simulation implementation.
export class DuneSimulation extends BaseSimulation {
  static APPLET_ID = "dune";

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshPhongMaterial({
      color: 0xd8b36a,
      vertexColors: false,
      fog: false,
      specular: 0x3a2b18,
      emissive: 0x22180d,
      emissiveIntensity: 0.26,
      shininess: 16,
      flatShading: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.mesh = null;
    this.capacity = 0;
    this.gridX = 0;
    this.gridY = 0;
    this.heights = new Float32Array(0);
    this.transportHeights = new Float32Array(0);
    this.nextHeights = new Float32Array(0);
    this.tempObject = new THREE.Object3D();
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
    this.material.specular.set(theme === "light" ? 0x5a4834 : 0x3a2b18);
  }

  reset() {
    this.rebuildField();
    this.ensureMesh();
    this.syncInstances();
    this.emitStats(0, 0);
  }

  onWorldGeometryChanged() {
    this.reset();
  }

  onBoundaryModeChanged() {}

  step(dt) {
    const { x: gridX, y: gridY } = this.getGridResolution();
    if (gridX !== this.gridX || gridY !== this.gridY || this.heights.length !== gridX * gridY) {
      this.reset();
      return;
    }

    const windAngle = THREE.MathUtils.degToRad(this.params.windDirectionDeg ?? 0);
    const windStep = pickWindStep(windAngle);
    const windStrength = THREE.MathUtils.clamp(this.params.windStrength ?? 0.9, 0, 3);
    const transportRate = THREE.MathUtils.clamp(this.params.transportRate ?? 0.28, 0, 2);
    const reposeSlope = Math.max(0.05, this.params.reposeSlope ?? 1.4);
    const avalancheRate = THREE.MathUtils.clamp(this.params.avalancheRate ?? 0.7, 0, 2);

    this.transportHeights.set(this.heights);
    let transportSum = 0;

    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const index = y * gridX + x;
        const height = this.heights[index];
        if (height <= 0.001) {
          continue;
        }

        const nextX = wrapIndex(x + windStep.x, gridX);
        const nextY = wrapIndex(y + windStep.y, gridY);
        const targetIndex = nextY * gridX + nextX;
        const transfer = Math.min(
          height * 0.08,
          (0.02 + windStrength * 0.06 + transportRate * 0.12) * dt * Math.max(0.3, height),
        );

        this.transportHeights[index] -= transfer;
        this.transportHeights[targetIndex] += transfer;
        transportSum += transfer;
      }
    }

    this.nextHeights.set(this.transportHeights);
    let avalancheEvents = 0;
    const relaxation = THREE.MathUtils.clamp(avalancheRate * dt * 0.8, 0, 1);

    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const index = y * gridX + x;
        avalancheEvents += this.relaxPair(index, y * gridX + wrapIndex(x + 1, gridX), reposeSlope, relaxation);
        avalancheEvents += this.relaxPair(index, wrapIndex(y + 1, gridY) * gridX + x, reposeSlope, relaxation);
      }
    }

    const swap = this.heights;
    this.heights = this.nextHeights;
    this.nextHeights = swap;

    this.syncInstances();
    this.emitStats(avalancheEvents, transportSum / Math.max(dt, 1e-6));
  }

  relaxPair(aIndex, bIndex, reposeSlope, relaxation) {
    const diff = this.nextHeights[aIndex] - this.nextHeights[bIndex];
    if (Math.abs(diff) <= reposeSlope) {
      return 0;
    }

    const move = Math.min(
      Math.abs(diff) * 0.5,
      (Math.abs(diff) - reposeSlope) * 0.5 * relaxation,
    );

    if (diff > 0) {
      this.nextHeights[aIndex] -= move;
      this.nextHeights[bIndex] += move;
    } else {
      this.nextHeights[aIndex] += move;
      this.nextHeights[bIndex] -= move;
    }

    return 1;
  }

  rebuildField() {
    const grid = this.getGridResolution();
    this.gridX = grid.x;
    this.gridY = grid.y;
    const count = this.gridX * this.gridY;
    this.heights = new Float32Array(count);
    this.transportHeights = new Float32Array(count);
    this.nextHeights = new Float32Array(count);

    const baseHeight = Math.max(0.05, this.params.baseHeight ?? 2.2);
    const noiseAmplitude = Math.max(0, this.params.noiseAmplitude ?? 0.0);

    for (let y = 0; y < this.gridY; y += 1) {
      for (let x = 0; x < this.gridX; x += 1) {
        const fluctuation = THREE.MathUtils.randFloatSpread(2);
        this.heights[y * this.gridX + x] = Math.max(
          0.05,
          baseHeight + noiseAmplitude * fluctuation,
        );
      }
    }
  }

  ensureMesh() {
    const nextCapacity = Math.max(1, this.gridX * this.gridY);
    if (!this.mesh || this.capacity !== nextCapacity) {
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
    if (!this.mesh || this.heights.length === 0) {
      return;
    }

    const gridX = this.gridX;
    const gridY = this.gridY;
    const spacing = Math.max(0.1, this.params.objectSizeM ?? 5.0);
    const coverageX = gridX * spacing;
    const coverageY = gridY * spacing;
    const offsetX = (this.params.worldSizeX - coverageX) * 0.5;
    const offsetY = (this.params.worldSizeY - coverageY) * 0.5;
    const cellArea = spacing * spacing;
    const floorZ = -this.params.worldSizeZ * 0.5;
    const footprintSize = spacing;
    const renderScale = Math.max(0.4, this.params.heightScale ?? 1.8);

    let minMass = Infinity;
    let maxMass = -Infinity;
    for (let i = 0; i < this.heights.length; i += 1) {
      const massProxy = this.heights[i] * cellArea;
      minMass = Math.min(minMass, massProxy);
      maxMass = Math.max(maxMass, massProxy);
    }
    const span = Math.max(maxMass - minMass, 1e-6);
    const hasMeaningfulRange = (maxMass - minMass) > 1e-5;

    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) {
        const index = y * gridX + x;
        const height = Math.max(0.05, this.heights[index] * renderScale);
        this.tempObject.position.set(
          -this.params.worldSizeX * 0.5 + offsetX + spacing * (x + 0.5),
          -this.params.worldSizeY * 0.5 + offsetY + spacing * (y + 0.5),
          floorZ + height * 0.5,
        );
        this.tempObject.scale.set(footprintSize, footprintSize, height);
        this.tempObject.rotation.set(0, 0, 0);
        this.tempObject.updateMatrix();
        this.mesh.setMatrixAt(index, this.tempObject.matrix);

        if ((this.params.colorMode ?? "mass") === "none") {
          duneSolidColor.set(this.params.solidColor || "#D8B36A");
          this.mesh.setColorAt(index, duneSolidColor);
          continue;
        }

        const massProxy = this.heights[index] * cellArea;
        const t = hasMeaningfulRange
          ? THREE.MathUtils.clamp((massProxy - minMass) / span, 0, 1)
          : 0.5;
        const liftedT = 0.08 + t * 0.84;
        const colorT = this.params.colormapInverted ? 1 - liftedT : liftedT;
        sampleColormap(this.params.colormap || "cividis", colorT, duneColor);
        ensureVisibleColor(duneColor, 0.25);
        this.mesh.setColorAt(index, duneColor);
      }
    }

    this.mesh.count = this.capacity;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  emitStats(avalancheEvents, transportFlux) {
    if (typeof this.onStats !== "function" || this.heights.length === 0) {
      return;
    }

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.heights.length; i += 1) {
      const height = this.heights[i];
      sum += height;
      min = Math.min(min, height);
      max = Math.max(max, height);
    }

    this.onStats({
      avalancheEvents,
      count: this.heights.length,
      meanHeight: sum / this.heights.length,
      relief: max - min,
      transportFlux,
    });
  }

  getGridResolution() {
    const objectSize = Math.max(0.1, this.params.objectSizeM ?? 5.0);
    const gridX = THREE.MathUtils.clamp(
      Math.floor(this.params.worldSizeX / objectSize),
      1,
      160,
    );
    const gridY = THREE.MathUtils.clamp(
      Math.floor(this.params.worldSizeY / objectSize),
      1,
      160,
    );
    return { x: gridX, y: gridY };
  }

  getColumnMassRange() {
    const spacing = Math.max(0.1, this.params.objectSizeM ?? 5.0);
    const cellArea = spacing * spacing;
    const fallbackMass = Math.max(0.05, this.params.baseHeight ?? 2.2) * cellArea;

    if (this.heights.length === 0) {
      return {
        min: fallbackMass,
        max: fallbackMass,
      };
    }

    let minMass = Infinity;
    let maxMass = -Infinity;
    for (let i = 0; i < this.heights.length; i += 1) {
      const massProxy = this.heights[i] * cellArea;
      minMass = Math.min(minMass, massProxy);
      maxMass = Math.max(maxMass, massProxy);
    }
    return {
      min: Number.isFinite(minMass) ? minMass : fallbackMass,
      max: Number.isFinite(maxMass) ? maxMass : fallbackMass,
    };
  }
}

// File-local helper functions.
function pickWindStep(angle) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  if (Math.abs(x) >= Math.abs(y)) {
    return { x: x >= 0 ? 1 : -1, y: y === 0 ? 0 : (Math.abs(y) > 0.5 ? (y >= 0 ? 1 : -1) : 0) };
  }
  return { x: Math.abs(x) > 0.5 ? (x >= 0 ? 1 : -1) : 0, y: y >= 0 ? 1 : -1 };
}

function wrapIndex(value, size) {
  return ((value % size) + size) % size;
}

function buildColormapLUT(stopsByName) {
  const maps = {};
  Object.keys(stopsByName).forEach((name) => {
    maps[name] = stopsByName[name].map((hex) => new THREE.Color(hex));
  });
  return maps;
}

function sampleColormap(name, normalized, outColor) {
  const colors = DUNE_COLORMAPS[name] || DUNE_COLORMAPS.cividis;
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
  duneLerpA.copy(colors[index]);
  duneLerpB.copy(colors[index + 1]);
  outColor.copy(duneLerpA).lerp(duneLerpB, fraction);
  return outColor;
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
  return color.lerp(duneWhite, deficiency * 0.55);
}

