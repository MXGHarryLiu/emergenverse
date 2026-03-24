// Galaxy gravity applet config and simulation implementation.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import galaxyConfigData from "./galaxy_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const GALAXY_APPLET_CONFIG = validateAppletConfig(galaxyConfigData);

// Unit metadata sourced from applet config and used to derive the internal gravity constant from SI.
const GALAXY_UNITS = requireAppletUnits(GALAXY_APPLET_CONFIG.unit, "galaxy");
const GALAXY_SPEED_UNIT = `${GALAXY_UNITS.length.label}/${GALAXY_UNITS.time.label}`;
const GALAXY_SI_GRAVITATIONAL_CONSTANT = 6.6743e-11;
const GALAXY_GRAVITY_INTERNAL_SCALE =
  ((GALAXY_UNITS.time.toSI * GALAXY_UNITS.time.toSI) * GALAXY_UNITS.mass.toSI)
  / (GALAXY_UNITS.length.toSI ** 3);
const GALAXY_GRAVITY_INTERNAL = GALAXY_SI_GRAVITATIONAL_CONSTANT * GALAXY_GRAVITY_INTERNAL_SCALE;
const GALAXY_DEFAULT_CENTRAL_MASS = requireSimulationParamNumberDefault(
  GALAXY_APPLET_CONFIG,
  "centralMass",
);
const GALAXY_DEFAULT_OBJECT_TOTAL_MASS = requireSimulationParamNumberDefault(
  GALAXY_APPLET_CONFIG,
  "objectTotalMass",
);
const GALAXY_DEFAULT_SOFTENING = requireSimulationParamNumberDefault(
  GALAXY_APPLET_CONFIG,
  "softening",
);
const GALAXY_DEFAULT_SPIN = requireSimulationParamNumberDefault(
  GALAXY_APPLET_CONFIG,
  "spin",
);
const GALAXY_DEFAULT_INITIAL_RADIUS = requireSimulationParamNumberDefault(
  GALAXY_APPLET_CONFIG,
  "initialRadius",
);
const GALAXY_DEFAULT_INITIAL_SHAPE = requireSimulationSelectValueDefault(
  GALAXY_APPLET_CONFIG,
  "initialShape",
);
const GALAXY_SEED_VELOCITY_NOISE_FRACTION = 0.03;
const GALAXY_INSTANCE_BASE_RADIUS = 0.42;
const GALAXY_INSTANCE_WIDTH_SEGMENTS = 10;
const GALAXY_INSTANCE_HEIGHT_SEGMENTS = 8;
const GALAXY_INSTANCE_SCALE_MIN = 0.05;
const GALAXY_INSTANCE_CAPACITY_SHRINK_FACTOR = 2;
const GALAXY_MIN_SOFTENING = 1e-3;
const GALAXY_MIN_CENTRAL_MASS = 1e8;
const GALAXY_MIN_PARTICLE_RADIUS = 0.2;
const GALAXY_MIN_WORLD_SPREAD = 2;
const GALAXY_WORLD_SPREAD_LIMIT_FRACTION = 0.49;
const GALAXY_DISK_THICKNESS_FACTOR = 0.08;
const GALAXY_DISK_MIN_THICKNESS = 0.08;
const GALAXY_ELLIPSOID_Z_SCALE = 0.5;
const GALAXY_RANDOM_VECTOR_SPREAD = 2;
const GALAXY_RANDOM_SPHERE_ATTEMPTS = 16;
const GALAXY_PARALLEL_ALIGNMENT_LIMIT = 0.95;
const GALAXY_COLORMAP_SPAN_EPSILON = 1e-6;
const GALAXY_LENGTH_SQ_EPSILON = 1e-8;
const GALAXY_GRAVITY_EPSILON = 1e-12;
const GALAXY_SPEED_RANGE_PADDING = 0.5;

// Shell runtime hooks.
const GALAXY_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#8eb7ff",
        fill: "rgba(142, 183, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("radius", () => `0 ${GALAXY_UNITS.length.label}`, {
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
      createChartMetricsEntry("speed", () => `0 ${GALAXY_SPEED_UNIT}`, {
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
        radius: radiusSamples,
      },
    });
  },
};

// File-local constants and helpers.
const GALAXY_COLORMAPS = buildColormapLUT(GALAXY_APPLET_CONFIG.visual?.colormap);
const lerpA = new THREE.Color();
const lerpB = new THREE.Color();

function requireAppletUnits(rawUnits, appletId) {
  if (!rawUnits || typeof rawUnits !== "object") {
    throw new Error(`[${appletId}] unit config is required.`);
  }
  return {
    length: requireUnitEntry(rawUnits.length, `${appletId}.unit.length`),
    mass: requireUnitEntry(rawUnits.mass, `${appletId}.unit.mass`),
    time: requireUnitEntry(rawUnits.time, `${appletId}.unit.time`),
  };
}

function requireUnitEntry(entry, path) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`[${path}] entry is required.`);
  }
  const label = String(entry.label || "").trim();
  if (!label) {
    throw new Error(`[${path}] label is required.`);
  }
  const toSI = Number(entry.toSI);
  if (!Number.isFinite(toSI) || toSI <= 0) {
    throw new Error(`[${path}] toSI must be a positive finite number.`);
  }
  const description = String(entry.description || "").trim();
  return { label, description, toSI };
}

function requireSimulationParamNumberDefault(config, key) {
  const entries = Array.isArray(config?.simulation?.params) ? config.simulation.params : [];
  const entry = entries.find((item) => String(item?.key || "").trim() === key);
  const value = Number(entry?.default);
  if (!Number.isFinite(value)) {
    throw new Error(`[galaxy] simulation.params "${key}" must define a finite numeric default.`);
  }
  return value;
}

function requireSimulationSelectValueDefault(config, paramKey) {
  const params = Array.isArray(config?.simulation?.params) ? config.simulation.params : [];
  const paramEntry = params.find((item) => String(item?.key || "").trim() === paramKey);
  const paramValue = String(paramEntry?.default || "").trim().toLowerCase();
  if (paramValue) {
    return paramValue;
  }

  const selects = Array.isArray(config?.simulation?.selects) ? config.simulation.selects : [];
  const selectEntry = selects.find((item) => String(item?.paramKey || "").trim() === paramKey);
  const value = String(selectEntry?.value || "").trim().toLowerCase();
  if (!value) {
    throw new Error(
      `[galaxy] initial select "${paramKey}" must define a default in simulation.params or simulation.selects.`,
    );
  }
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

    this.geometry = new THREE.SphereGeometry(
      GALAXY_INSTANCE_BASE_RADIUS,
      GALAXY_INSTANCE_WIDTH_SEGMENTS,
      GALAXY_INSTANCE_HEIGHT_SEGMENTS,
    );
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
    this.solidColorValue = new THREE.Color(getGalaxySolidColor(this.params));
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
    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLost();
    }
    this.syncInstances();
    this.emitStats();
  }

  onBoundaryChanged() {
    this.onWorldGeometryChanged();
  }

  step(dt) {
    const count = this.particles.length;
    if (count === 0) {
      this.emitStats();
      return;
    }

    const dtMyr = dt;
    const soft = Math.max(GALAXY_MIN_SOFTENING, this.params.softening ?? GALAXY_DEFAULT_SOFTENING);
    const softSq = soft * soft;
    const G = GALAXY_GRAVITY_INTERNAL;
    const centralMass = Math.max(0, this.params.centralMass ?? GALAXY_DEFAULT_CENTRAL_MASS);
    const objectTotalMass = Math.max(0, this.params.objectTotalMass ?? GALAXY_DEFAULT_OBJECT_TOTAL_MASS);
    const configuredCount = Math.max(1, Number(this.params.count ?? count));
    const particleMass = Math.max(0, objectTotalMass / configuredCount);

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

    if (hasAnyLostBoundaryAxis(this.params)) {
      this.removeLost();
    }

    this.syncInstances();
    this.emitStats();
  }

  ensureMesh() {
    const nextCapacity = Math.max(1, this.particles.length);
    if (
      !this.mesh
      || this.capacity < nextCapacity
      || this.capacity > nextCapacity * GALAXY_INSTANCE_CAPACITY_SHRINK_FACTOR
    ) {
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

    const scale = getGalaxyVisualSize(this.params);
    this.speedBounds = this.getSpeedBounds();

    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      this.tempObject.position.copy(p.position);
      this.tempObject.rotation.set(0, 0, 0);
      this.tempObject.scale.setScalar(scale);
      this.tempObject.updateMatrix();
      this.mesh.setMatrixAt(i, this.tempObject.matrix);

      if (this.params.colorMode === "solid") {
        this.solidColorValue.set(getGalaxySolidColor(this.params));
        this.tempColor.copy(this.solidColorValue);
      } else {
        const speed = p.velocity.length();
        const span = Math.max(this.speedBounds.max - this.speedBounds.min, GALAXY_COLORMAP_SPAN_EPSILON);
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
    const initialShape = String(
      this.params.initialShape || this.params.initPreset || GALAXY_DEFAULT_INITIAL_SHAPE,
    ).toLowerCase();
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

    const initialShape = String(
      this.params.initialShape || this.params.initPreset || GALAXY_DEFAULT_INITIAL_SHAPE,
    ).toLowerCase();
    const spin = Math.max(0, this.params.spin ?? GALAXY_DEFAULT_SPIN);
    const gravityInternal = GALAXY_GRAVITY_INTERNAL;
    const softening = Math.max(GALAXY_MIN_SOFTENING, this.params.softening ?? GALAXY_DEFAULT_SOFTENING);
    const centralMassInternal = Math.max(GALAXY_MIN_CENTRAL_MASS, this.params.centralMass ?? GALAXY_DEFAULT_CENTRAL_MASS);
    const objectTotalMass = Math.max(0, this.params.objectTotalMass ?? GALAXY_DEFAULT_OBJECT_TOTAL_MASS);
    const configuredCount = Math.max(1, Number(this.params.count ?? count));
    const particleMass = Math.max(0, objectTotalMass / configuredCount);

    const indexedByRadius = this.particles
      .map((particle, index) => ({ index, radius: Math.max(GALAXY_MIN_PARTICLE_RADIUS, particle.position.length()) }))
      .sort((a, b) => a.radius - b.radius);

    for (let rank = 0; rank < indexedByRadius.length; rank += 1) {
      const { index, radius } = indexedByRadius[rank];
      const particle = this.particles[index];
      const radial = particle.position.clone().normalize();
      if (radial.lengthSq() < GALAXY_LENGTH_SQ_EPSILON) {
        radial.set(1, 0, 0);
      }
      const tangential = sampleInitialVelocityDirection({
        preset: initialShape,
        position: particle.position,
        radial,
      });

      const enclosedObjectMass = particleMass * (rank + 1);
      const enclosedMass = centralMassInternal + enclosedObjectMass;
      const baseSpeed = spin * computeSoftenedCircularSpeed(
        Math.max(GALAXY_GRAVITY_EPSILON, gravityInternal),
        enclosedMass,
        radius,
        softening,
      );

      tangential.multiplyScalar(baseSpeed);
      tangential.x += THREE.MathUtils.randFloatSpread(baseSpeed * GALAXY_SEED_VELOCITY_NOISE_FRACTION);
      tangential.y += THREE.MathUtils.randFloatSpread(baseSpeed * GALAXY_SEED_VELOCITY_NOISE_FRACTION);
      tangential.z += THREE.MathUtils.randFloatSpread(baseSpeed * GALAXY_SEED_VELOCITY_NOISE_FRACTION);
      particle.velocity.copy(tangential);
    }
  }

  getInitialSpreadForAxis(worldSize) {
    const worldLimit = Math.max(GALAXY_MIN_WORLD_SPREAD, Number(worldSize) * GALAXY_WORLD_SPREAD_LIMIT_FRACTION);
    const requested = Number(this.params.initialRadius ?? GALAXY_DEFAULT_INITIAL_RADIUS);
    if (!Number.isFinite(requested)) {
      return worldLimit;
    }
    return THREE.MathUtils.clamp(requested, GALAXY_MIN_WORLD_SPREAD, worldLimit);
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
    if (max - min < GALAXY_COLORMAP_SPAN_EPSILON) {
      return { min: min - GALAXY_SPEED_RANGE_PADDING, max: max + GALAXY_SPEED_RANGE_PADDING };
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
  const colorModeOption = getGalaxyColorModeOption(colorMode);
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
      minText: `min: ${Number(range.min).toFixed(0)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(0)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getGalaxyColorModeOption(colorMode) {
  const visualParams = Array.isArray(GALAXY_APPLET_CONFIG.visual?.params)
    ? GALAXY_APPLET_CONFIG.visual.params
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

function getGalaxySolidColorDefault() {
  const colorEntries = Array.isArray(GALAXY_APPLET_CONFIG.visual?.color)
    ? GALAXY_APPLET_CONFIG.visual.color
    : [];
  const entry = colorEntries.find((item) => String(item?.key || "").trim() === "galaxy");
  if (!entry) {
    throw new Error('[galaxy] visual.color must include key "galaxy" with a valid hex default.');
  }
  const normalized = normalizeHexColor(entry.default, "");
  if (!normalized) {
    throw new Error('[galaxy] visual.color "galaxy" default must be a hex color like #RRGGBB.');
  }
  return normalized;
}

function getGalaxySolidColor(params) {
  return normalizeHexColor(params?.solidColorGalaxy, getGalaxySolidColorDefault());
}

function getGalaxyVisualSizeDefault() {
  const sizeEntries = Array.isArray(GALAXY_APPLET_CONFIG.visual?.size)
    ? GALAXY_APPLET_CONFIG.visual.size
    : [];
  const entry = sizeEntries.find((item) => String(item?.key || "").trim() === "star");
  if (!entry) {
    throw new Error('[galaxy] visual.size must include key "star" with a finite numeric default.');
  }
  const value = Number(entry.default);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('[galaxy] visual.size "star" default must be a positive finite number.');
  }
  return value;
}

function getGalaxyVisualSize(params) {
  const defaultDiameter = getGalaxyVisualSizeDefault();
  const configuredDiameter = Number(params?.visualSizeStar);
  if (Number.isFinite(configuredDiameter) && configuredDiameter > 0) {
    return Math.max(GALAXY_INSTANCE_SCALE_MIN, configuredDiameter / (2 * GALAXY_INSTANCE_BASE_RADIUS));
  }
  return Math.max(GALAXY_INSTANCE_SCALE_MIN, defaultDiameter / (2 * GALAXY_INSTANCE_BASE_RADIUS));
}

function hasAnyLostBoundaryAxis(params) {
  const explicit = params?.boundaryAxes;
  return [explicit?.x, explicit?.y, explicit?.z]
    .some((axisMode) => String(axisMode || "").trim().toLowerCase() === "lost");
}

function sampleInitialPosition({ preset, spreadX, spreadY, spreadZ }) {
  if (preset === "disk") {
    const maxR = Math.max(GALAXY_MIN_PARTICLE_RADIUS, Math.min(spreadX, spreadY));
    const r = Math.sqrt(Math.random()) * maxR;
    const angle = Math.random() * Math.PI * 2;
    const thickness = Math.max(GALAXY_DISK_MIN_THICKNESS, spreadZ * GALAXY_DISK_THICKNESS_FACTOR);
    return new THREE.Vector3(
      r * Math.cos(angle),
      r * Math.sin(angle),
      THREE.MathUtils.randFloatSpread(thickness * GALAXY_RANDOM_VECTOR_SPREAD),
    );
  }

  if (preset === "sphere") {
    const maxR = Math.max(GALAXY_MIN_PARTICLE_RADIUS, Math.min(spreadX, spreadY, spreadZ));
    const radius = maxR * Math.cbrt(Math.random());
    return randomDirection3D().multiplyScalar(radius);
  }

  if (preset === "ellipsoid") {
    const xScale = Math.max(GALAXY_MIN_PARTICLE_RADIUS, spreadX);
    const yScale = Math.max(GALAXY_MIN_PARTICLE_RADIUS, spreadY);
    const zScale = Math.max(GALAXY_MIN_PARTICLE_RADIUS, spreadZ * GALAXY_ELLIPSOID_Z_SCALE);
    const spherePoint = randomPointInUnitSphere();
    return new THREE.Vector3(
      spherePoint.x * xScale,
      spherePoint.y * yScale,
      spherePoint.z * zScale,
    );
  }

  return new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(spreadX * GALAXY_RANDOM_VECTOR_SPREAD),
    THREE.MathUtils.randFloatSpread(spreadY * GALAXY_RANDOM_VECTOR_SPREAD),
    THREE.MathUtils.randFloatSpread(spreadZ * GALAXY_RANDOM_VECTOR_SPREAD),
  );
}

function sampleInitialVelocityDirection({ preset, position, radial }) {
  if (preset === "disk") {
    const diskTangent = new THREE.Vector3(-position.y, position.x, 0);
    if (diskTangent.lengthSq() > GALAXY_LENGTH_SQ_EPSILON) {
      return diskTangent.normalize();
    }
  }

  const reference = randomDirection3D();
  if (Math.abs(reference.dot(radial)) > GALAXY_PARALLEL_ALIGNMENT_LIMIT) {
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
    const name = String((entry?.key ?? "")).trim();
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
    THREE.MathUtils.randFloatSpread(GALAXY_RANDOM_VECTOR_SPREAD),
    THREE.MathUtils.randFloatSpread(GALAXY_RANDOM_VECTOR_SPREAD),
    THREE.MathUtils.randFloatSpread(GALAXY_RANDOM_VECTOR_SPREAD),
  );
  if (vector.lengthSq() < GALAXY_LENGTH_SQ_EPSILON) {
    vector.set(0, 0, 1);
  }
  return vector.normalize();
}

function randomPointInUnitSphere() {
  for (let i = 0; i < GALAXY_RANDOM_SPHERE_ATTEMPTS; i += 1) {
    const candidate = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(GALAXY_RANDOM_VECTOR_SPREAD),
      THREE.MathUtils.randFloatSpread(GALAXY_RANDOM_VECTOR_SPREAD),
      THREE.MathUtils.randFloatSpread(GALAXY_RANDOM_VECTOR_SPREAD),
    );
    if (candidate.lengthSq() <= 1) {
      return candidate;
    }
  }
  return randomDirection3D().multiplyScalar(Math.cbrt(Math.random()));
}

function computeSoftenedCircularSpeed(gravityConstant, mass, radius, softening) {
  const g = Math.max(0, Number(gravityConstant) || 0);
  const m = Math.max(0, Number(mass) || 0);
  const r = Math.max(GALAXY_COLORMAP_SPAN_EPSILON, Number(radius) || 0);
  const eps = Math.max(GALAXY_COLORMAP_SPAN_EPSILON, Number(softening) || 0);
  const rSq = r * r;
  const denom = Math.max(GALAXY_GRAVITY_EPSILON, Math.pow(rSq + eps * eps, 1.5));
  const vSq = g * m * rSq / denom;
  return Math.sqrt(Math.max(0, vSq));
}
