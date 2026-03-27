// Sand dune applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import duneConfigData from "./dune_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const DUNE_APPLET_CONFIG = validateAppletConfig(duneConfigData);

// Shell runtime hooks.
const DUNE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("height", () => "0.00 m", {
        stroke: "#f6d17b",
        fill: "rgba(246, 209, 123, 0.16)",
        axisLabel: "m",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("relief", () => "0.00 m", {
        stroke: "#ef9d5d",
        fill: "rgba(239, 157, 93, 0.15)",
        axisLabel: "m",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("transport", () => "0.00 m/s", {
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

// File-local constants and helpers.
const DUNE_COLORMAPS = buildColormapLUT(DUNE_APPLET_CONFIG.visual?.colormap);
const duneColor = new THREE.Color();
const duneSolidColor = new THREE.Color();
const duneLerpA = new THREE.Color();
const duneLerpB = new THREE.Color();
const duneWhite = new THREE.Color(1, 1, 1);

// Simulation implementation.
export class DuneSimulation extends BaseSimulation {
  static APPLET_ID = "dune";
  static APPLET_RUNTIME = DUNE_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildDuneColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      vertexColors: false,
      fog: false,
      specular: 0x2a2a2a,
      emissive: 0x000000,
      emissiveIntensity: 0,
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
    this.random = createSeededRandomGenerator(this.params?.randomSeed);
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
    this.material.specular.set(theme === "light" ? 0x3a3a3a : 0x2a2a2a);
  }

  reset() {
    this.random = createSeededRandomGenerator(this.params?.randomSeed);
    this.rebuildField();
    this.ensureMesh();
    this.syncInstances();
    this.emitStats(0, 0);
  }

  onWorldGeometryChanged() {
    this.reset();
  }

  onBoundaryChanged() {}

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
        const fluctuation = this.randFloatSpread(2);
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
    const spacing = getDuneVisualSize(this.params);
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

        if ((this.params.colorMode ?? "mass") === "solid") {
          duneSolidColor.set(getDuneSolidColor(this.params));
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
    const objectSize = getDuneVisualSize(this.params);
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
    const spacing = getDuneVisualSize(this.params);
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

  randFloatSpread(range) {
    const safeRange = Number.isFinite(range) ? range : 0;
    return (this.random() - 0.5) * safeRange;
  }
}

function clampDuneSeed(seedValue) {
  const { min, max } = getRandomSeedBounds(DUNE_APPLET_CONFIG);
  const numeric = Number(seedValue);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  const rounded = Math.round(numeric);
  return THREE.MathUtils.clamp(rounded, min, max);
}

function createSeededRandomGenerator(seedValue) {
  let seed = clampDuneSeed(seedValue) >>> 0;
  seed = (seed ^ 0xa5a5a5a5) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getRandomSeedBounds(appletConfig) {
  const simulationParams = Array.isArray(appletConfig?.simulation?.params) ? appletConfig.simulation.params : [];
  const randomSeedParam = simulationParams.find((entry) => String(entry?.key || "").trim() === "randomSeed");
  const min = Number(randomSeedParam?.uiMin);
  const max = Number(randomSeedParam?.uiMax);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return {
      min: Math.min(Math.round(min), Math.round(max)),
      max: Math.max(Math.round(min), Math.round(max)),
    };
  }
  const fallback = Math.round(Number(randomSeedParam?.default) || 0);
  return { min: fallback, max: fallback };
}

// File-local helper functions.
function buildDuneColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "mass";
  const colormap = params?.colormap || "cividis";
  const colorModeOption = getDuneColorModeOption(colorMode);
  const unit = String(colorModeOption?.unit || "");
  if (colorMode === "solid") {
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
      minText: `min: ${Number(range.min).toFixed(2)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(2)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getDuneColorModeOption(colorMode) {
  const visualParams = Array.isArray(DUNE_APPLET_CONFIG.visual?.params)
    ? DUNE_APPLET_CONFIG.visual.params
    : [];
  const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
  const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
  return options.find((option) => String(option?.key ?? "").trim() === colorMode) || null;
}

function normalizeHexColor(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function getDuneSolidColorDefault() {
  const colorEntries = Array.isArray(DUNE_APPLET_CONFIG.visual?.color)
    ? DUNE_APPLET_CONFIG.visual.color
    : [];
  const entry = colorEntries.find((item) => String(item?.key || "").trim() === "dune");
  const fallbackEntry = colorEntries[0] || null;
  const fallback = "#d8b36a";
  return normalizeHexColor(entry?.default ?? fallbackEntry?.default ?? fallback, fallback);
}

function getDuneSolidColor(params) {
  const fallback = getDuneSolidColorDefault();
  return normalizeHexColor(params?.solidColorDune ?? fallback, fallback);
}

function getDuneVisualSizeDefault() {
  const sizeEntries = Array.isArray(DUNE_APPLET_CONFIG.visual?.size)
    ? DUNE_APPLET_CONFIG.visual.size
    : [];
  const entry = sizeEntries.find((item) => String(item?.key || "").trim() === "dune");
  const fallbackEntry = sizeEntries[0] || null;
  const fallback = 2.5;
  const value = Number(entry?.default ?? fallbackEntry?.default ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function getDuneVisualSize(params) {
  const fallback = getDuneVisualSizeDefault();
  const value = Number(params?.visualSizeDune ?? fallback);
  return Math.max(0.1, Number.isFinite(value) ? value : fallback);
}

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

function buildColormapLUT(colormapEntries) {
  const maps = {};
  const entries = Array.isArray(colormapEntries) ? colormapEntries : [];
  entries.forEach((entry) => {
    const name = String((entry?.key ?? "")).trim();
    const stops = Array.isArray(entry?.value) ? entry.value : [];
    if (!name || stops.length === 0) {
      return;
    }
    maps[name] = stops.map((hex) => new THREE.Color(hex));
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
