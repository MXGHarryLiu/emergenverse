// Boids applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import boidConfigData from "./boid_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const BOID_APPLET_CONFIG = validateAppletConfig(boidConfigData);

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
    this.solidColorValue = new THREE.Color(getBoidSolidColor(this.params));

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
    const solidColor = getBoidSolidColor(this.params);

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
      this.tempObject.scale.setScalar(getBoidVisualSize(this.params));
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      if (this.params.colorMode === "solid") {
        this.solidColorValue.set(solidColor);
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
  const colorModeOption = getBoidColorModeOption(colorMode);
  const unit = String(colorModeOption?.unit || "");

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
      minText: `min: ${Number(range.min).toFixed(range.digits)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(range.digits)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getBoidColormapRange(colorMode, params) {
  if (colorMode === "speed") {
    return {
      min: 0,
      max: params?.maxSpeed ?? 1,
      digits: 1,
    };
  }
  if (colorMode === "altitude") {
    const halfZ = (params?.worldSizeZ ?? 100) * 0.5;
    return {
      min: -halfZ,
      max: halfZ,
      digits: 1,
    };
  }
  if (colorMode === "neighbors") {
    return {
      min: 0,
      max: 16,
      digits: 0,
    };
  }
  return { min: -1, max: 1, digits: 2 };
}

function getBoidColorModeOption(colorMode) {
  const visualParams = Array.isArray(BOID_APPLET_CONFIG.visual?.params)
    ? BOID_APPLET_CONFIG.visual.params
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

function getBoidSolidColorDefault() {
  const colorEntries = Array.isArray(BOID_APPLET_CONFIG.visual?.color)
    ? BOID_APPLET_CONFIG.visual.color
    : [];
  const boidEntry = colorEntries.find((entry) => String(entry?.key || "").trim() === "boid");
  const fallbackEntry = colorEntries[0] || null;
  const fallback = "#4cd3b6";
  return normalizeHexColor(boidEntry?.default ?? fallbackEntry?.default ?? fallback, fallback);
}

function getBoidSolidColor(params) {
  const fallback = getBoidSolidColorDefault();
  return normalizeHexColor(params?.solidColorBoid ?? params?.solidColor ?? fallback, fallback);
}

function getBoidVisualSizeDefault() {
  const sizeEntries = Array.isArray(BOID_APPLET_CONFIG.visual?.size)
    ? BOID_APPLET_CONFIG.visual.size
    : [];
  const boidEntry = sizeEntries.find((entry) => String(entry?.key || "").trim() === "boid");
  const fallbackEntry = sizeEntries[0] || null;
  const fallback = 0.5;
  const value = Number(boidEntry?.default ?? fallbackEntry?.default ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getBoidVisualSize(params) {
  const defaultDiameter = getBoidVisualSizeDefault();
  const configuredDiameter = Number(params?.visualSizeBoid);
  if (Number.isFinite(configuredDiameter) && configuredDiameter > 0) {
    return Math.max(0.001, configuredDiameter / (2 * 0.7));
  }
  return Math.max(0.001, defaultDiameter / (2 * 0.7));
}

function buildColormapLUT(colormapEntries) {
  const lut = {};
  const entries = Array.isArray(colormapEntries) ? colormapEntries : [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const name = String((entry?.key ?? "")).trim();
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
