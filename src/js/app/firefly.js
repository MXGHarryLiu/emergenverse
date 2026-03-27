// Firefly synchronization applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import fireflyConfigData from "./firefly_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const FIREFLY_APPLET_CONFIG = validateAppletConfig(fireflyConfigData);

// Shell runtime hooks.
const FIREFLY_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("order", () => "0.000", {
        stroke: "#ffe38d",
        fill: "rgba(255, 227, 141, 0.18)",
        axisLabel: "R",
        tickFormatter: (value) => value.toFixed(2),
        minValue: 0,
        maxValue: 1,
      }),
      createChartMetricsEntry("blink", () => "0.0 /s", {
        stroke: "#ffd26e",
        fill: "rgba(255, 210, 110, 0.16)",
        axisLabel: "/s",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }

    const count = stats.count ?? 0;
    const order = stats.order ?? 0;
    const blinkRate = stats.blinkRate ?? 0;

    ui.updateChartMetrics("firefly", [count, order, blinkRate], [
      String(count),
      order.toFixed(3),
      `${blinkRate.toFixed(1)} /s`,
    ]);
  },
};

// File-local constants and helpers.
const TWO_PI = Math.PI * 2;

const FIREFLY_COLORMAPS = buildColormapLUT(FIREFLY_APPLET_CONFIG.visual?.colormap);
const fireflyLerpA = new THREE.Color();
const fireflyLerpB = new THREE.Color();

// Simulation implementation.
export class FireflySimulation extends BaseSimulation {
  static APPLET_ID = "firefly";
  static APPLET_RUNTIME = FIREFLY_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildFireflyColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });

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
    this.solidColorValue = new THREE.Color(getFireflySolidColor(this.params));
    this.phaseStepBuffer = [];
    this.blinkRateSmoothed = 0;
    this.steer = new THREE.Vector3();
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

  onTheme() {}

  reset() {
    this.random = createSeededRandomGenerator(this.params?.randomSeed);
    this.fireflies.length = 0;
    this.blinkRateSmoothed = 0;

    for (let i = 0; i < this.params.count; i += 1) {
      this.fireflies.push(this.createFirefly());
    }

    this.ensureMesh();
    this.syncInstances();
    this.emitStats(0);
  }

  setCount(count) {
    this.params.count = count;
    this.reset();
  }

  onWorldGeometryChanged() {
    for (let i = 0; i < this.fireflies.length; i += 1) {
      this.applyBoundary(this.fireflies[i]);
    }
    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLost();
    }
    this.syncInstances();
    this.emitStats(0);
  }

  onBoundaryChanged() {
    this.onWorldGeometryChanged();
  }

  getFrequencyRange() {
    if (!this.fireflies.length) {
      const center = Math.max(0.05, this.params.frequency ?? 1.8);
      const jitter = Math.max(0, this.params.freqJitter ?? 0.2);
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

    const speed = Math.max(0.05, this.params.speed ?? 3);
    const coupling = Math.max(0, this.params.coupling ?? 2.2);
    const radius = Math.max(0.2, this.params.radius ?? 18);
    const radiusSq = radius * radius;
    const baseHz = Math.max(0.05, this.params.frequency ?? 1.8);
    const jitterHz = Math.max(0, this.params.freqJitter ?? 0.2);
    const phaseNoise = Math.max(0, this.params.phaseNoise ?? 0.4);

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
        this.randFloatSpread(2),
        this.randFloatSpread(2),
        this.randFloatSpread(2),
      );
      if (this.steer.lengthSq() > 1e-8) {
        this.steer.normalize().multiplyScalar(0.9 * dt);
        firefly.velocity.add(this.steer);
      }
      const vLen = firefly.velocity.length();
      if (vLen < 1e-8) {
        firefly.velocity.copy(this.randomDirection3D()).multiplyScalar(speed);
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
      const noiseTerm = this.randFloatSpread(2) * phaseNoise;
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

    if (hasAnyLostBoundaryAxis(this.params)) {
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

    const scale = getFireflyVisualSize(this.params);
    const frequencyRange = this.getFrequencyRange();
    const idleColor = this.params.stateColorIdle || "#4f7dff";
    const blinkColor = this.params.stateColorBlink || "#ffd74a";

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
      const blinkBrightness = THREE.MathUtils.clamp(0.18 + pulse * 1.1, 0.18, 1);
      const isBlinking = pulse > 0.5;

      if (this.params.colorMode === "solid") {
        this.solidColorValue.set(getFireflySolidColor(this.params));
        this.tempColor.copy(this.solidColorValue);
      } else if (this.params.colorMode === "phase") {
        const phaseNorm = THREE.MathUtils.euclideanModulo(firefly.phase, TWO_PI) / TWO_PI;
        const colorT = this.params.colormapInverted ? 1 - phaseNorm : phaseNorm;
        sampleColormap(this.params.colormap, colorT, this.tempColor);
        this.tempColor.multiplyScalar(0.95);
      } else if (this.params.colorMode === "frequency") {
        const span = Math.max(frequencyRange.max - frequencyRange.min, 1e-6);
        const t = THREE.MathUtils.clamp((firefly.omegaHz - frequencyRange.min) / span, 0, 1);
        const colorT = this.params.colormapInverted ? 1 - t : t;
        sampleColormap(this.params.colormap, colorT, this.tempColor);
        // Frequency mode should show steady color, not phase blinking.
        this.tempColor.multiplyScalar(0.95);
      } else {
        this.tempColor.set(isBlinking ? blinkColor : idleColor);
        this.tempColor.multiplyScalar(blinkBrightness);
      }
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
      position: this.randomWorldPosition(),
      velocity: this.randomDirection3D().multiplyScalar(Math.max(0.1, this.params.speed ?? 3)),
      phase: this.random() * TWO_PI,
      omegaHz: Math.max(
        0.05,
        (this.params.frequency ?? 1.8) +
          this.randFloatSpread((this.params.freqJitter ?? 0.2) * 2),
      ),
      lost: false,
    };
  }

  randFloatSpread(range) {
    const safeRange = Number.isFinite(range) ? range : 0;
    return (this.random() - 0.5) * safeRange;
  }

  randomWorldPosition() {
    const x = this.randFloatSpread(this.params.worldSizeX * 0.9);
    const y = this.randFloatSpread(this.params.worldSizeY * 0.9);
    const z = this.randFloatSpread(this.params.worldSizeZ * 0.9);
    return new THREE.Vector3(x, y, z);
  }

  randomDirection3D() {
    const direction = new THREE.Vector3(
      this.randFloatSpread(2),
      this.randFloatSpread(2),
      this.randFloatSpread(2),
    );
    if (direction.lengthSq() < 1e-8) {
      direction.set(0, 0, 1);
    }
    return direction.normalize();
  }

  applyBoundary(agent) {
    const halfX = this.params.worldSizeX * 0.5;
    const halfY = this.params.worldSizeY * 0.5;
    const halfZ = this.params.worldSizeZ * 0.5;
    const axes = getBoundaryAxesFor3D(this.params);
    const outX = applyAxisBoundary(agent.position, "x", halfX, axes.x);
    const outY = applyAxisBoundary(agent.position, "y", halfY, axes.y);
    const outZ = applyAxisBoundary(agent.position, "z", halfZ, axes.z);
    agent.lost = outX || outY || outZ;
    return !agent.lost;
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

function buildFireflyColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "blink";
  const colormap = params?.colormap || "turbo";
  const colorModeOption = getFireflyColorModeOption(colorMode);
  const unit = String(colorModeOption?.unit || "");
  if (colorMode === "solid" || colorMode === "blink") {
    return {
      visible: false,
      value: colormap,
      options: continuousColormapOptions,
      setValue() {},
      legend: null,
    };
  }

  const range = simulation?.getFrequencyRange?.() ?? {
    min: Math.max(0, (params?.frequency ?? 1.8) - (params?.freqJitter ?? 0.2)),
    max: (params?.frequency ?? 1.8) + (params?.freqJitter ?? 0.2),
  };
  const legendRange = colorMode === "phase"
    ? { min: 0, max: 360 }
    : range;
  return {
    visible: true,
    value: colormap,
    options: continuousColormapOptions,
    setValue(value) {
      params.colormap = value;
      simulation?.syncInstances?.();
    },
    legend: {
      gradient: continuousColormapGradients[colormap] || continuousColormapGradients.turbo,
      minText: `min: ${Number(legendRange.min).toFixed(2)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(legendRange.max).toFixed(2)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getFireflyColorModeOption(colorMode) {
  const visualParams = Array.isArray(FIREFLY_APPLET_CONFIG.visual?.params)
    ? FIREFLY_APPLET_CONFIG.visual.params
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

function getFireflySolidColorDefault() {
  const colorEntries = Array.isArray(FIREFLY_APPLET_CONFIG.visual?.color)
    ? FIREFLY_APPLET_CONFIG.visual.color
    : [];
  const entry = colorEntries.find((item) => String(item?.key || "").trim() === "firefly");
  const fallbackEntry = colorEntries[0] || null;
  const fallback = "#ffd86b";
  return normalizeHexColor(entry?.default ?? fallbackEntry?.default ?? fallback, fallback);
}

function getFireflySolidColor(params) {
  const fallback = getFireflySolidColorDefault();
  return normalizeHexColor(params?.solidColorFirefly ?? fallback, fallback);
}

function getFireflyVisualSizeDefault() {
  const sizeEntries = Array.isArray(FIREFLY_APPLET_CONFIG.visual?.size)
    ? FIREFLY_APPLET_CONFIG.visual.size
    : [];
  const entry = sizeEntries.find((item) => String(item?.key || "").trim() === "firefly");
  const fallbackEntry = sizeEntries[0] || null;
  const fallback = 0.8;
  const value = Number(entry?.default ?? fallbackEntry?.default ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function getFireflyVisualSize(params) {
  const defaultDiameter = getFireflyVisualSizeDefault();
  const configuredDiameter = Number(params?.visualSizeFirefly);
  if (Number.isFinite(configuredDiameter) && configuredDiameter > 0) {
    return Math.max(0.08, configuredDiameter / (2 * 0.45));
  }
  return Math.max(0.08, defaultDiameter / (2 * 0.45));
}

function clampFireflySeed(seedValue) {
  const { min, max } = getRandomSeedBounds(FIREFLY_APPLET_CONFIG);
  const numeric = Number(seedValue);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  const rounded = Math.round(numeric);
  return THREE.MathUtils.clamp(rounded, min, max);
}

function createSeededRandomGenerator(seedValue) {
  let seed = clampFireflySeed(seedValue) >>> 0;
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

function normalizeBoundaryAxis(axisMode) {
  return String(axisMode || "").trim().toLowerCase() === "lost" ? "lost" : "cyclic";
}

function getBoundaryAxesFor3D(params) {
  const explicit = (params?.boundaryAxes && typeof params.boundaryAxes === "object")
    ? params.boundaryAxes
    : {};
  return {
    x: normalizeBoundaryAxis(explicit.x),
    y: normalizeBoundaryAxis(explicit.y),
    z: normalizeBoundaryAxis(explicit.z),
  };
}

function applyAxisBoundary(position, axis, halfExtent, axisMode) {
  if (normalizeBoundaryAxis(axisMode) === "cyclic") {
    position[axis] = wrapAxis(position[axis], halfExtent);
    return false;
  }
  return Math.abs(position[axis]) > halfExtent;
}

function hasAnyLostBoundaryAxis(params) {
  const axes = getBoundaryAxesFor3D(params);
  return axes.x === "lost" || axes.y === "lost" || axes.z === "lost";
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
