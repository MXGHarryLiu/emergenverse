// Space field applet config and simulation implementation.
import * as THREE from "three";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
import { validateAppletConfig } from "./appletConfigUtils.js";
import spaceConfigData from "./space_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const SPACE_APPLET_CONFIG = validateAppletConfig(spaceConfigData);

// Unit metadata sourced from applet config and used to derive internal gravity scaling from SI.
const SPACE_UNITS = requireAppletUnits(SPACE_APPLET_CONFIG.unit, "space");
const SPACE_SPEED_UNIT = `${SPACE_UNITS.length.label}/${SPACE_UNITS.time.label}`;
const SPACE_SI_GRAVITATIONAL_CONSTANT = 6.6743e-11;
const SPACE_GRAVITY_INTERNAL_SCALE =
  ((SPACE_UNITS.time.toSI * SPACE_UNITS.time.toSI) * SPACE_UNITS.mass.toSI)
  / (SPACE_UNITS.length.toSI ** 3);
const SPACE_GRAVITY_INTERNAL = SPACE_SI_GRAVITATIONAL_CONSTANT * SPACE_GRAVITY_INTERNAL_SCALE;
const SPACE_DEFAULT_CENTRAL_MASS = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "centralMass",
);
const SPACE_DEFAULT_OBJECT_TOTAL_MASS = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "objectTotalMass",
);
const SPACE_DEFAULT_SOFTENING = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "softening",
);
const SPACE_DEFAULT_SPIN = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "spin",
);
const SPACE_DEFAULT_INITIAL_RADIUS = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "initialRadius",
);
const SPACE_DEFAULT_FIELD_RESOLUTION = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "fieldResolution",
);
const SPACE_FIELD_RESOLUTION_MIN = requireSimulationParamNumberBound(
  SPACE_APPLET_CONFIG,
  "fieldResolution",
  "uiMin",
);
const SPACE_FIELD_RESOLUTION_MAX = requireSimulationParamNumberBound(
  SPACE_APPLET_CONFIG,
  "fieldResolution",
  "uiMax",
);
const SPACE_DEFAULT_COUNT = requireSimulationParamNumberDefault(
  SPACE_APPLET_CONFIG,
  "count",
);
const SPACE_DEFAULT_INITIAL_SHAPE = requireSimulationSelectValueDefault(
  SPACE_APPLET_CONFIG,
  "initialShape",
);
const SPACE_SEED_VELOCITY_NOISE_FRACTION = 0.03;
const SPACE_INSTANCE_BASE_RADIUS = 0.5;
const SPACE_INSTANCE_WIDTH_SEGMENTS = 8;
const SPACE_INSTANCE_HEIGHT_SEGMENTS = 6;
const SPACE_INSTANCE_CAPACITY_SHRINK_FACTOR = 2;
const SPACE_POINT_SIZE_MIN_WORLD = 1e-4;
const SPACE_DT_MAX = 0.35;
const SPACE_MIN_WORLD_AXIS = 1;
const SPACE_MIN_SOFTENING = 1e-3;
const SPACE_MIN_PARTICLE_RADIUS = 0.2;
const SPACE_MIN_WORLD_SPREAD = 2;
const SPACE_DEFAULT_INITIAL_SPREAD_WORLD_FRACTION = 0.45;
const SPACE_WORLD_SPREAD_LIMIT_FRACTION = 0.49;
const SPACE_COLORMAP_SPAN_EPSILON = 1e-6;
const SPACE_LENGTH_SQ_EPSILON = 1e-8;
const SPACE_GRAVITY_EPSILON = 1e-12;
const SPACE_SPEED_RANGE_PADDING = 0.5;
const SPACE_DISK_THICKNESS_FACTOR = 0.08;
const SPACE_DISK_MIN_THICKNESS = 0.08;
const SPACE_ELLIPSOID_Z_SCALE = 0.5;
const SPACE_RANDOM_VECTOR_SPREAD = 2;
const SPACE_RANDOM_SPHERE_ATTEMPTS = 16;
const SPACE_PARALLEL_ALIGNMENT_LIMIT = 0.95;
const SPACE_RESEED_VELOCITY_XY_SPREAD = 1.2;
const SPACE_RESEED_VELOCITY_Z_SPREAD = 0.8;
const SPACE_FIELD_SOLVER_ITERATION_BASE = 16;
const SPACE_FIELD_SOLVER_ITERATION_DIVISOR = 18;
const SPACE_FIELD_SOLVER_ITERATION_MIN = 12;
const SPACE_FIELD_SOLVER_ITERATION_MAX = 42;
const SPACE_EFFECTIVE_THICKNESS_FACTOR = 0.08;
const SPACE_MIN_CELL_VOLUME = 1e-9;
const SPACE_MIN_CELL_SIZE = 1e-6;
const SPACE_SELF_FIELD_BLEND_BASE = 0.15;
const SPACE_SELF_FIELD_BLEND_RANGE = 0.85;
const SPACE_SELF_FIELD_BLEND_MIN = 0.1;
const SPACE_SELF_FIELD_BLEND_MAX = 1;
const SPACE_DAMPING = 1;
const SPACE_RADIUS_SAMPLE_LIMIT = 1200;
const SPACE_SEED_SPIRAL_MODE = 2;
const SPACE_SEED_SPIRAL_SPEED_PERTURB_FRACTION = 0.08;
const SPACE_SEED_SPIRAL_RADIAL_KICK_FRACTION = 0.035;
const SPACE_TWO_PI = Math.PI * 2;
const SPACE_GPU_GRID_MAX = 1024;
const SPACE_GPU_READBACK_CHANNELS = 4;
const SPACE_ENABLE_GPU_PARTICLE_INTEGRATION = false;
const SPACE_GPU_RENDER_TEXTURE_CHANNELS = 4;
const SPACE_GPU_COLORMAP_RESOLUTION = 256;
const SPACE_STATS_UPDATE_INTERVAL_SECONDS = 0.2;
const SPACE_DEFAULT_SOLID_COLOR = requireVisualColorDefault(SPACE_APPLET_CONFIG, "space");
const SPACE_DEFAULT_VISUAL_DIAMETER = requireVisualSizeDefault(SPACE_APPLET_CONFIG, "star");

// Shell runtime hooks.
const SPACE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("count", () => "0", {
        stroke: "#8eb7ff",
        fill: "rgba(142, 183, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("radius", () => `0 ${SPACE_UNITS.length.label}`, {
        stroke: "#9de2ff",
        fill: "rgba(157, 226, 255, 0.16)",
        supportsDistribution: true,
        defaultViewMode: "distribution",
        distributionBins: 22,
        distributionSmoothing: 1.3,
        distributionXTickFormatter: (value) => value.toFixed(1),
        distributionYTickFormatter: (value) => `${Math.round(value * 100)}%`,
        axisLabel: SPACE_UNITS.length.label,
        tickFormatter: (value) => Math.round(value).toString(),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("speed", () => `0 ${SPACE_SPEED_UNIT}`, {
        stroke: "#ffbe8d",
        fill: "rgba(255, 190, 141, 0.16)",
        axisLabel: SPACE_SPEED_UNIT,
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

    ui.updateChartMetrics("space", [count, meanRadius, meanSpeed], [
      String(count),
      `${Math.round(meanRadius).toLocaleString()} ${SPACE_UNITS.length.label}`,
      `${Math.round(meanSpeed).toLocaleString()} ${SPACE_SPEED_UNIT}`,
    ], {
      distributionSamples: {
        radius: radiusSamples,
      },
    });
  },
};

// File-local constants and helpers.
const SPACE_COLORMAPS = buildColormapLUT(SPACE_APPLET_CONFIG.visual?.colormap);
const spaceLerpA = new THREE.Color();
const spaceLerpB = new THREE.Color();

const SPACE_POINT_VERTEX_SHADER = `
attribute vec3 aColor;
uniform float uPointSize;
uniform float uPointSizeMax;
uniform bool uUsePerspectiveSizing;
uniform float uViewportHeight;
varying vec3 vColor;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vColor = aColor;

  float projectionScale = projectionMatrix[1][1] * (uViewportHeight * 0.5);
  float pointSize = uPointSize * projectionScale;
  if (uUsePerspectiveSizing) {
    pointSize = pointSize / max(1.0, -mvPosition.z);
  }
  gl_PointSize = clamp(pointSize, 1.0, max(1.0, uPointSizeMax));
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SPACE_POINT_FRAGMENT_SHADER = `
uniform bool uUseSolidColor;
uniform vec3 uSolidColor;
varying vec3 vColor;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  if (dot(centered, centered) > 0.25) {
    discard;
  }

  vec3 color = uUseSolidColor ? uSolidColor : vColor;
  gl_FragColor = vec4(color, 1.0);
}
`;

const SPACE_GPU_RENDER_VERTEX_SHADER = `
precision highp float;
attribute float aIndex;
attribute float aSpeed;
attribute vec3 aColor;
uniform sampler2D uPositionTex;
uniform float uTexSize;
uniform float uCount;
uniform float uPointDiameter;
uniform float uViewportHeight;
uniform bool uUsePerspectiveSizing;
varying float vSpeed;
varying vec3 vColor;

void main() {
  if (aIndex >= uCount) {
    gl_PointSize = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float x = mod(aIndex, uTexSize);
  float y = floor(aIndex / uTexSize);
  vec2 uv = (vec2(x + 0.5, y + 0.5)) / uTexSize;
  vSpeed = aSpeed;
  vColor = aColor;

  vec3 position = texture2D(uPositionTex, uv).xyz;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float projectionScale = projectionMatrix[1][1] * (uViewportHeight * 0.5);
  float pointSize = max(1.0, uPointDiameter * projectionScale);
  if (uUsePerspectiveSizing) {
    pointSize = pointSize / max(1.0, -mvPosition.z);
  }

  gl_PointSize = max(1.0, pointSize);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SPACE_GPU_RENDER_FRAGMENT_SHADER = `
precision highp float;
uniform bool uUseSolidColor;
uniform vec3 uSolidColor;
varying float vSpeed;
varying vec3 vColor;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  if (dot(centered, centered) > 0.25) {
    discard;
  }

  vec3 color = uSolidColor;
  if (!uUseSolidColor) {
    color = vColor;
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const SPACE_FIELD_POTENTIAL_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uDensityTex;
uniform float uGridN;
uniform float uHsq;
uniform float uSourceFactor;
uniform float uInvCellVolume;
uniform float uFieldMean;
uniform float uFreezePotential;

void main() {
  vec2 texel = vec2(1.0 / uGridN, 1.0 / uGridN);
  vec2 uv = (gl_FragCoord.xy - vec2(0.5)) * texel;

  if (uFreezePotential > 0.5) {
    gl_FragColor = vec4(texture2D(texturePotential, uv).r, 0.0, 0.0, 1.0);
    return;
  }

  vec2 uvL = fract(uv - vec2(texel.x, 0.0) + vec2(1.0));
  vec2 uvR = fract(uv + vec2(texel.x, 0.0));
  vec2 uvD = fract(uv - vec2(0.0, texel.y) + vec2(1.0));
  vec2 uvU = fract(uv + vec2(0.0, texel.y));

  float left = texture2D(texturePotential, uvL).r;
  float right = texture2D(texturePotential, uvR).r;
  float down = texture2D(texturePotential, uvD).r;
  float up = texture2D(texturePotential, uvU).r;

  float density = texture2D(uDensityTex, uv).r;
  float densityContrast = (density - uFieldMean) * uInvCellVolume;
  float source = uSourceFactor * densityContrast;
  float phi = (left + right + down + up + uHsq * source) * 0.25;
  gl_FragColor = vec4(phi, 0.0, 0.0, 1.0);
}
`;

const SPACE_FIELD_ACCEL_FRAGMENT_SHADER = `
precision highp float;
uniform float uGridN;
uniform float uInv2Dx;
uniform float uInv2Dy;

void main() {
  vec2 texel = vec2(1.0 / uGridN, 1.0 / uGridN);
  vec2 uv = (gl_FragCoord.xy - vec2(0.5)) * texel;
  vec2 uvL = fract(uv - vec2(texel.x, 0.0) + vec2(1.0));
  vec2 uvR = fract(uv + vec2(texel.x, 0.0));
  vec2 uvD = fract(uv - vec2(0.0, texel.y) + vec2(1.0));
  vec2 uvU = fract(uv + vec2(0.0, texel.y));

  float left = texture2D(texturePotential, uvL).r;
  float right = texture2D(texturePotential, uvR).r;
  float down = texture2D(texturePotential, uvD).r;
  float up = texture2D(texturePotential, uvU).r;
  float ax = -(right - left) * uInv2Dx;
  float ay = -(up - down) * uInv2Dy;
  gl_FragColor = vec4(ax, ay, 0.0, 1.0);
}
`;

const SPACE_PARTICLE_VELOCITY_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uAccelTex;
uniform float uParticleTexSize;
uniform float uGridN;
uniform float uHalfX;
uniform float uHalfY;
uniform float uHalfZ;
uniform float uDt;
uniform float uSelfFieldBlend;
uniform float uCentralGravity;
uniform float uSoftSq;
uniform float uDamping;

vec2 wrap01(vec2 v) {
  return fract(v + vec2(1.0));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - vec2(0.5)) / uParticleTexSize;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  vec2 gridUv = vec2(
    (pos.x + uHalfX) / max(1e-6, uHalfX * 2.0),
    (pos.y + uHalfY) / max(1e-6, uHalfY * 2.0)
  );
  vec2 accelUv = wrap01(gridUv);
  vec2 fieldA = texture2D(uAccelTex, accelUv).xy * uSelfFieldBlend;

  float rSq = dot(pos, pos) + uSoftSq;
  float invR = inversesqrt(max(1e-8, rSq));
  float invR3 = invR * invR * invR;
  vec3 centerA = -pos * (uCentralGravity * invR3);
  vec3 a = vec3(fieldA.x, fieldA.y, 0.0) + centerA;

  vel = (vel + a * uDt) * uDamping;
  gl_FragColor = vec4(vel, 1.0);
}
`;

const SPACE_PARTICLE_POSITION_FRAGMENT_SHADER = `
precision highp float;
uniform float uParticleTexSize;
uniform float uHalfX;
uniform float uHalfY;
uniform float uHalfZ;
uniform float uDt;
uniform float uBoundaryModeX;
uniform float uBoundaryModeY;
uniform float uBoundaryModeZ;

float wrapAxis(float value, float halfExtent) {
  float span = halfExtent * 2.0;
  if (span <= 1e-6) {
    return 0.0;
  }
  if (value > halfExtent || value < -halfExtent) {
    return mod(mod(value + halfExtent, span) + span, span) - halfExtent;
  }
  return value;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - vec2(0.5)) / uParticleTexSize;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  pos += vel * uDt;

  // GPU path keeps particles in-domain on all boundary modes to avoid visual dropout.
  // CPU path can still apply stricter lost/reseed semantics when GPU integration is disabled.
  pos.x = wrapAxis(pos.x, uHalfX);
  pos.y = wrapAxis(pos.y, uHalfY);
  pos.z = wrapAxis(pos.z, uHalfZ);

  gl_FragColor = vec4(pos, 1.0);
}
`;

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
    throw new Error(`[space] simulation.params "${key}" must define a finite numeric default.`);
  }
  return value;
}

function requireSimulationSelectValueDefault(config, paramKey) {
  const entries = Array.isArray(config?.simulation?.selects) ? config.simulation.selects : [];
  const entry = entries.find((item) => String(item?.paramKey || "").trim() === paramKey);
  const value = String(entry?.value || "").trim().toLowerCase();
  if (!value) {
    throw new Error(`[space] simulation.selects "${paramKey}" must define a default value.`);
  }
  return value;
}

function requireSimulationParamNumberBound(config, key, boundKey) {
  const entries = Array.isArray(config?.simulation?.params) ? config.simulation.params : [];
  const entry = entries.find((item) => String(item?.key || "").trim() === key);
  const value = Number(entry?.[boundKey]);
  if (!Number.isFinite(value)) {
    throw new Error(`[space] simulation.params "${key}" must define a finite numeric ${boundKey}.`);
  }
  return value;
}

function requireVisualColorDefault(config, key) {
  const colorEntries = Array.isArray(config?.visual?.color) ? config.visual.color : [];
  const entry = colorEntries.find((item) => String(item?.key || "").trim() === key);
  const normalized = normalizeHexColor(entry?.default);
  if (!normalized) {
    throw new Error(`[space] visual.color "${key}" must define a hex default.`);
  }
  return normalized;
}

function requireVisualSizeDefault(config, key) {
  const sizeEntries = Array.isArray(config?.visual?.size) ? config.visual.size : [];
  const entry = sizeEntries.find((item) => String(item?.key || "").trim() === key);
  const value = Number(entry?.default);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`[space] visual.size "${key}" must define a positive numeric default.`);
  }
  return value;
}

// Simulation implementation.
export class SpaceSimulation extends BaseSimulation {
  static APPLET_ID = "space";
  static APPLET_RUNTIME = SPACE_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildSpaceColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, renderer, onStats }) {
    super({ scene, params, world, renderer, onStats });

    this.geometry = new THREE.SphereGeometry(
      SPACE_INSTANCE_BASE_RADIUS,
      SPACE_INSTANCE_WIDTH_SEGMENTS,
      SPACE_INSTANCE_HEIGHT_SEGMENTS,
    );
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: false,
      fog: false,
      toneMapped: false,
    });

    this.instanceMesh = null;
    this.gpuPointCloud = null;
    this.gpuRenderResources = null;
    this.colormapTextureCache = new Map();
    this.instanceCapacity = 0;
    this.gpuPointCapacity = 0;
    this.tempObject = new THREE.Object3D();

    this.count = 0;
    this.gridN = 0;
    this.posX = new Float32Array(0);
    this.posY = new Float32Array(0);
    this.posZ = new Float32Array(0);
    this.velX = new Float32Array(0);
    this.velY = new Float32Array(0);
    this.velZ = new Float32Array(0);

    this.density = new Float32Array(0);
    this.densityScratch = new Float32Array(0);
    this.potential = new Float32Array(0);
    this.potentialScratch = new Float32Array(0);
    this.accelX = new Float32Array(0);
    this.accelY = new Float32Array(0);
    this.fieldDensityMean = 0;

    this.speedBounds = { min: 0, max: 1 };
    this.solidColorValue = new THREE.Color(getSpaceSolidColor(this.params));
    this.tempColor = new THREE.Color();
    this.viewportPixelSize = new THREE.Vector2();
    this.seedPhaseOffset = 0;
    this.fieldSolverBackend = "cpu";
    this.gpuField = null;
    this.gpuParticles = null;
    this.gpuFallbackLogged = false;
    this.lastLoggedFieldSolverBackend = null;
    this.hardwareAccelerationEnabled = Boolean(this.params.hardwareAcceleration ?? true);
    this.statsAccumulatorSeconds = 0;
    this.gpuParticleRuntimeDisabled = false;
  }

  init() {
    this.reset();
  }

  setVisible(visible) {
    if (this.instanceMesh) {
      this.instanceMesh.visible = visible;
    }
    if (this.gpuPointCloud) {
      this.gpuPointCloud.visible = visible;
    }
  }

  onTheme() {}

  updateColormapTexture() {
    // No-op for mesh-based coloring path.
  }

  reset() {
    this.rebuildStateFromParams();
    this.hardwareAccelerationEnabled = Boolean(this.params.hardwareAcceleration ?? true);
    this.gpuParticleRuntimeDisabled = false;
    this.configureFieldSolverBackend();
    if (
      SPACE_ENABLE_GPU_PARTICLE_INTEGRATION
      && this.fieldSolverBackend === "gpu"
      && this.ensureGpuParticleSolver()
    ) {
      this.syncGpuParticlesFromCpu();
    } else {
      this.disposeGpuParticleSolver();
    }
    this.ensurePointCloud();
    this.syncPointCloud();
    this.statsAccumulatorSeconds = SPACE_STATS_UPDATE_INTERVAL_SECONDS;
    this.emitStats();
  }

  setCount(count) {
    this.params.count = count;
    this.reset();
  }

  setFieldResolution(fieldResolution) {
    const numeric = Number(fieldResolution);
    if (!Number.isFinite(numeric)) {
      return;
    }
    const normalizedDensity = THREE.MathUtils.clamp(
      numeric,
      SPACE_FIELD_RESOLUTION_MIN,
      SPACE_FIELD_RESOLUTION_MAX,
    );
    this.params.fieldResolution = normalizedDensity;
    const nextGridN = this.resolveGridResolution();
    if (this.gridN !== nextGridN) {
      this.reset();
    }
  }

  setHardwareAcceleration(enabled) {
    const nextEnabled = Boolean(enabled);
    this.params.hardwareAcceleration = nextEnabled;
    this.hardwareAccelerationEnabled = nextEnabled;
    if (nextEnabled) {
      this.gpuParticleRuntimeDisabled = false;
      this.configureFieldSolverBackend();
      if (SPACE_ENABLE_GPU_PARTICLE_INTEGRATION && this.fieldSolverBackend === "gpu" && this.ensureGpuParticleSolver()) {
        this.syncGpuParticlesFromCpu();
      }
      this.syncPointCloud();
      return;
    }
    this.disableGpuFieldSolver();
    this.logFieldSolverBackend("toggle-off");
    this.syncPointCloud();
  }

  isHardwareAccelerationActive() {
    return this.hardwareAccelerationEnabled && this.fieldSolverBackend === "gpu";
  }

  onWorldGeometryChanged() {
    this.applyBoundaryToAll();
    if (SPACE_ENABLE_GPU_PARTICLE_INTEGRATION && this.fieldSolverBackend === "gpu") {
      this.syncGpuParticlesFromCpu();
    }
    this.syncPointCloud();
    this.statsAccumulatorSeconds = SPACE_STATS_UPDATE_INTERVAL_SECONDS;
    this.emitStats();
  }

  onBoundaryChanged() {
    this.applyBoundaryToAll();
    if (SPACE_ENABLE_GPU_PARTICLE_INTEGRATION && this.fieldSolverBackend === "gpu") {
      this.syncGpuParticlesFromCpu();
    }
    this.syncPointCloud();
    this.statsAccumulatorSeconds = SPACE_STATS_UPDATE_INTERVAL_SECONDS;
    this.emitStats();
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || this.count <= 0) {
      this.emitStats();
      return;
    }

    const expectedCount = this.resolveVisualCount();
    const expectedGridN = this.resolveGridResolution();
    if (expectedCount !== this.count || expectedGridN !== this.gridN) {
      this.reset();
      return;
    }

    const dtMyr = Math.min(SPACE_DT_MAX, dt);

    this.depositDensity();
    if (this.fieldSolverBackend === "gpu") {
      if (!this.solveFieldPotentialGpu()) {
        this.disableGpuFieldSolver();
        this.logFieldSolverBackend("runtime-fallback");
        this.solveFieldPotential();
        this.computeFieldAcceleration();
        this.integrateParticles(dtMyr);
      } else if (
        SPACE_ENABLE_GPU_PARTICLE_INTEGRATION
        && this.gpuParticles
        && !this.gpuParticleRuntimeDisabled
        && this.integrateParticlesGpu(dtMyr)
      ) {
        if (!this.syncCpuShadowFromGpuParticles({ includeVelocity: false })) {
          this.gpuParticleRuntimeDisabled = true;
          console.warn("[space] Disabled GPU particle integration for this run due invalid readback state.");
          this.integrateParticles(dtMyr);
          this.syncGpuParticlesFromCpu();
        }
      } else {
        this.integrateParticles(dtMyr);
      }
    } else {
      this.solveFieldPotential();
      this.computeFieldAcceleration();
      this.integrateParticles(dtMyr);
    }

    this.syncPointCloud();
    this.statsAccumulatorSeconds += Math.max(0, Number(dt) || 0);
    if (this.statsAccumulatorSeconds >= SPACE_STATS_UPDATE_INTERVAL_SECONDS) {
      if (
        this.fieldSolverBackend === "gpu"
        && SPACE_ENABLE_GPU_PARTICLE_INTEGRATION
        && this.gpuParticles
        && !this.gpuParticleRuntimeDisabled
      ) {
        this.syncCpuShadowFromGpuParticles({ includeVelocity: true });
      }
      this.statsAccumulatorSeconds = 0;
      this.emitStats();
    }
  }

  rebuildStateFromParams() {
    this.count = this.resolveVisualCount();
    this.gridN = this.resolveGridResolution();
    this.seedPhaseOffset = Math.random() * SPACE_TWO_PI;
    this.posX = new Float32Array(this.count);
    this.posY = new Float32Array(this.count);
    this.posZ = new Float32Array(this.count);
    this.velX = new Float32Array(this.count);
    this.velY = new Float32Array(this.count);
    this.velZ = new Float32Array(this.count);
    const cellCount = this.gridN * this.gridN;
    this.density = new Float32Array(cellCount);
    this.densityScratch = new Float32Array(cellCount);
    this.potential = new Float32Array(cellCount);
    this.potentialScratch = new Float32Array(cellCount);
    this.accelX = new Float32Array(cellCount);
    this.accelY = new Float32Array(cellCount);
    this.fieldDensityMean = 0;

    this.seedParticles();
    this.speedBounds = this.getSpeedBounds();
  }

  resolveVisualCount() {
    return Math.max(1, Math.round(Number(this.params.count ?? SPACE_DEFAULT_COUNT)));
  }

  resolveGridResolution() {
    const configured = Number(this.params.fieldResolution ?? SPACE_DEFAULT_FIELD_RESOLUTION);
    const density = Number.isFinite(configured)
      ? THREE.MathUtils.clamp(configured, SPACE_FIELD_RESOLUTION_MIN, SPACE_FIELD_RESOLUTION_MAX)
      : SPACE_DEFAULT_FIELD_RESOLUTION;
    const referenceSpan = this.getFieldReferenceSpan();
    return Math.max(1, Math.round(density * referenceSpan));
  }

  configureFieldSolverBackend() {
    if (!this.canUseGpuFieldSolver()) {
      this.disableGpuFieldSolver();
      this.logFieldSolverBackend("capability");
      return;
    }
    if (!this.ensureGpuFieldSolver()) {
      this.disableGpuFieldSolver();
      this.logFieldSolverBackend("init");
      return;
    }
    this.fieldSolverBackend = "gpu";
    this.logFieldSolverBackend("enabled");
  }

  canUseGpuFieldSolver() {
    if (!this.hardwareAccelerationEnabled) {
      return false;
    }
    if (!this.renderer || this.gridN <= 1 || this.gridN > SPACE_GPU_GRID_MAX) {
      return false;
    }
    if (!this.renderer.capabilities?.isWebGL2) {
      return false;
    }
    return this.renderer.extensions?.has?.("EXT_color_buffer_float") === true;
  }

  disableGpuFieldSolver() {
    if (!this.gpuFallbackLogged && this.fieldSolverBackend === "gpu") {
      console.warn("[space] GPU field solver unavailable or failed; using CPU fallback.");
      this.gpuFallbackLogged = true;
    }
    this.fieldSolverBackend = "cpu";
    this.disposeGpuFieldSolver();
    this.disposeGpuParticleSolver();
  }

  logFieldSolverBackend(reason = "state") {
    if (this.lastLoggedFieldSolverBackend === this.fieldSolverBackend) {
      return;
    }
    this.lastLoggedFieldSolverBackend = this.fieldSolverBackend;
    if (this.fieldSolverBackend === "gpu") {
      console.log(`[space] Field solver backend: GPU (${reason}).`);
      return;
    }
    const rendererType = this.renderer?.capabilities?.isWebGL2 ? "WebGL2" : "WebGL1";
    console.log(`[space] Field solver backend: CPU (${reason}, renderer=${rendererType}).`);
  }

  disposeGpuFieldSolver() {
    if (!this.gpuField) {
      return;
    }
    if (typeof this.gpuField.gpuCompute?.dispose === "function") {
      this.gpuField.gpuCompute.dispose();
    }
    this.gpuField.densityTexture?.dispose?.();
    this.gpuField = null;
  }

  disposeGpuParticleSolver() {
    if (!this.gpuParticles) {
      return;
    }
    if (typeof this.gpuParticles.gpuCompute?.dispose === "function") {
      this.gpuParticles.gpuCompute.dispose();
    }
    this.gpuParticles = null;
  }

  ensureGpuFieldSolver() {
    if (this.gpuField && this.gpuField.gridN === this.gridN) {
      return true;
    }
    this.disposeGpuFieldSolver();

    const n = this.gridN;
    const gpuCompute = new GPUComputationRenderer(n, n, this.renderer);
    gpuCompute.setDataType(THREE.FloatType);

    const potentialSeed = gpuCompute.createTexture();
    potentialSeed.image.data.fill(0);
    const accelSeed = gpuCompute.createTexture();
    accelSeed.image.data.fill(0);

    const potentialVar = gpuCompute.addVariable(
      "texturePotential",
      SPACE_FIELD_POTENTIAL_FRAGMENT_SHADER,
      potentialSeed,
    );
    const accelVar = gpuCompute.addVariable(
      "textureAccel",
      SPACE_FIELD_ACCEL_FRAGMENT_SHADER,
      accelSeed,
    );

    gpuCompute.setVariableDependencies(potentialVar, [potentialVar]);
    gpuCompute.setVariableDependencies(accelVar, [potentialVar]);
    potentialVar.material.uniforms.uDensityTex = { value: null };
    potentialVar.material.uniforms.uGridN = { value: n };
    potentialVar.material.uniforms.uHsq = { value: 1 };
    potentialVar.material.uniforms.uSourceFactor = { value: 1 };
    potentialVar.material.uniforms.uInvCellVolume = { value: 1 };
    potentialVar.material.uniforms.uFieldMean = { value: 0 };
    potentialVar.material.uniforms.uFreezePotential = { value: 0 };
    accelVar.material.uniforms.uGridN = { value: n };
    accelVar.material.uniforms.uInv2Dx = { value: 1 };
    accelVar.material.uniforms.uInv2Dy = { value: 1 };

    const densityTexture = new THREE.DataTexture(
      new Float32Array(n * n * SPACE_GPU_READBACK_CHANNELS),
      n,
      n,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    densityTexture.needsUpdate = true;
    densityTexture.magFilter = THREE.NearestFilter;
    densityTexture.minFilter = THREE.NearestFilter;
    densityTexture.generateMipmaps = false;
    densityTexture.wrapS = THREE.ClampToEdgeWrapping;
    densityTexture.wrapT = THREE.ClampToEdgeWrapping;
    potentialVar.material.uniforms.uDensityTex.value = densityTexture;

    const initError = gpuCompute.init();
    if (initError) {
      console.warn(`[space] GPU field solver init failed: ${initError}`);
      densityTexture.dispose();
      return false;
    }

    this.gpuField = {
      gridN: n,
      gpuCompute,
      potentialVar,
      accelVar,
      densityTexture,
      densityData: densityTexture.image.data,
      accelReadback: new Float32Array(n * n * SPACE_GPU_READBACK_CHANNELS),
    };
    return true;
  }

  ensureGpuParticleSolver() {
    const texSize = Math.max(1, Math.ceil(Math.sqrt(this.count)));
    if (this.gpuParticles && this.gpuParticles.texSize === texSize) {
      return true;
    }
    this.disposeGpuParticleSolver();

    const gpuCompute = new GPUComputationRenderer(texSize, texSize, this.renderer);
    gpuCompute.setDataType(THREE.FloatType);

    const positionSeed = gpuCompute.createTexture();
    const velocitySeed = gpuCompute.createTexture();
    positionSeed.image.data.fill(0);
    velocitySeed.image.data.fill(0);

    const positionVar = gpuCompute.addVariable(
      "texturePosition",
      SPACE_PARTICLE_POSITION_FRAGMENT_SHADER,
      positionSeed,
    );
    const velocityVar = gpuCompute.addVariable(
      "textureVelocity",
      SPACE_PARTICLE_VELOCITY_FRAGMENT_SHADER,
      velocitySeed,
    );
    gpuCompute.setVariableDependencies(positionVar, [positionVar, velocityVar]);
    gpuCompute.setVariableDependencies(velocityVar, [velocityVar, positionVar]);

    positionVar.material.uniforms.uParticleTexSize = { value: texSize };
    positionVar.material.uniforms.uHalfX = { value: 1 };
    positionVar.material.uniforms.uHalfY = { value: 1 };
    positionVar.material.uniforms.uHalfZ = { value: 1 };
    positionVar.material.uniforms.uDt = { value: 0 };
    positionVar.material.uniforms.uBoundaryModeX = { value: 0 };
    positionVar.material.uniforms.uBoundaryModeY = { value: 0 };
    positionVar.material.uniforms.uBoundaryModeZ = { value: 0 };

    velocityVar.material.uniforms.uAccelTex = { value: null };
    velocityVar.material.uniforms.uParticleTexSize = { value: texSize };
    velocityVar.material.uniforms.uGridN = { value: 1 };
    velocityVar.material.uniforms.uHalfX = { value: 1 };
    velocityVar.material.uniforms.uHalfY = { value: 1 };
    velocityVar.material.uniforms.uHalfZ = { value: 1 };
    velocityVar.material.uniforms.uDt = { value: 0 };
    velocityVar.material.uniforms.uSelfFieldBlend = { value: 1 };
    velocityVar.material.uniforms.uCentralGravity = { value: 0 };
    velocityVar.material.uniforms.uSoftSq = { value: 1e-6 };
    velocityVar.material.uniforms.uDamping = { value: SPACE_DAMPING };

    const initError = gpuCompute.init();
    if (initError) {
      console.warn(`[space] GPU particle solver init failed: ${initError}`);
      return false;
    }

    this.gpuParticles = {
      texSize,
      gpuCompute,
      positionVar,
      velocityVar,
      positionReadback: new Float32Array(texSize * texSize * SPACE_GPU_READBACK_CHANNELS),
      velocityReadback: new Float32Array(texSize * texSize * SPACE_GPU_READBACK_CHANNELS),
    };
    return true;
  }

  syncGpuParticlesFromCpu() {
    if (!this.gpuParticles) {
      return false;
    }
    const { texSize, gpuCompute, positionVar, velocityVar } = this.gpuParticles;
    const totalTexels = texSize * texSize;
    const posSeed = gpuCompute.createTexture();
    const velSeed = gpuCompute.createTexture();
    const posData = posSeed.image.data;
    const velData = velSeed.image.data;
    posData.fill(0);
    velData.fill(0);
    for (let i = 0; i < Math.min(this.count, totalTexels); i += 1) {
      const base = this.particleIndexToTextureBase(i, texSize, false);
      posData[base] = this.posX[i];
      posData[base + 1] = this.posY[i];
      posData[base + 2] = this.posZ[i];
      posData[base + 3] = 1;
      velData[base] = this.velX[i];
      velData[base + 1] = this.velY[i];
      velData[base + 2] = this.velZ[i];
      velData[base + 3] = 1;
    }
    gpuCompute.renderTexture(posSeed, gpuCompute.getCurrentRenderTarget(positionVar));
    gpuCompute.renderTexture(posSeed, gpuCompute.getAlternateRenderTarget(positionVar));
    gpuCompute.renderTexture(velSeed, gpuCompute.getCurrentRenderTarget(velocityVar));
    gpuCompute.renderTexture(velSeed, gpuCompute.getAlternateRenderTarget(velocityVar));
    posSeed.dispose();
    velSeed.dispose();
    return true;
  }

  particleIndexToTextureBase(index, texSize, flipY = false) {
    const x = index % texSize;
    const y = Math.floor(index / texSize);
    const row = flipY ? (texSize - 1 - y) : y;
    return (row * texSize + x) * SPACE_GPU_READBACK_CHANNELS;
  }

  solveFieldPotentialGpu() {
    if (!this.gpuField || this.gpuField.gridN !== this.gridN) {
      return false;
    }
    const n = this.gridN;
    if (n <= 1) {
      return false;
    }

    const baseIterations = SPACE_FIELD_SOLVER_ITERATION_BASE + Math.round(n / SPACE_FIELD_SOLVER_ITERATION_DIVISOR);
    const iterations = THREE.MathUtils.clamp(
      baseIterations,
      SPACE_FIELD_SOLVER_ITERATION_MIN,
      SPACE_FIELD_SOLVER_ITERATION_MAX,
    );
    const dx = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeX / n);
    const dy = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeY / n);
    const h = 0.5 * (dx + dy);
    const hSq = h * h;
    const cellArea = dx * dy;
    const effectiveThickness = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeZ * SPACE_EFFECTIVE_THICKNESS_FACTOR);
    const invCellVolume = 1 / Math.max(SPACE_MIN_CELL_VOLUME, cellArea * effectiveThickness);
    const sourceFactor = 4 * Math.PI * SPACE_GRAVITY_INTERNAL;

    const { potentialVar, accelVar, gpuCompute, densityTexture, densityData, accelReadback } = this.gpuField;
    for (let i = 0; i < this.density.length; i += 1) {
      densityData[i * SPACE_GPU_READBACK_CHANNELS] = this.density[i];
    }
    densityTexture.needsUpdate = true;

    potentialVar.material.uniforms.uGridN.value = n;
    potentialVar.material.uniforms.uHsq.value = hSq;
    potentialVar.material.uniforms.uSourceFactor.value = sourceFactor;
    potentialVar.material.uniforms.uInvCellVolume.value = invCellVolume;
    potentialVar.material.uniforms.uFieldMean.value = this.fieldDensityMean;
    potentialVar.material.uniforms.uFreezePotential.value = 0;

    accelVar.material.uniforms.uGridN.value = n;
    accelVar.material.uniforms.uInv2Dx.value = 1 / (2 * dx);
    accelVar.material.uniforms.uInv2Dy.value = 1 / (2 * dy);

    try {
      for (let iter = 0; iter < iterations; iter += 1) {
        gpuCompute.compute();
      }
      potentialVar.material.uniforms.uFreezePotential.value = 1;
      gpuCompute.compute();
      potentialVar.material.uniforms.uFreezePotential.value = 0;

      const accelTarget = gpuCompute.getCurrentRenderTarget(accelVar);
      this.renderer.readRenderTargetPixels(accelTarget, 0, 0, n, n, accelReadback);
    } catch (error) {
      console.warn("[space] GPU field solve step failed.", error);
      return false;
    }

    for (let y = 0; y < n; y += 1) {
      const srcY = n - 1 - y;
      const dstRow = y * n;
      const srcRow = srcY * n * SPACE_GPU_READBACK_CHANNELS;
      for (let x = 0; x < n; x += 1) {
        const src = srcRow + x * SPACE_GPU_READBACK_CHANNELS;
        const ax = accelReadback[src];
        const ay = accelReadback[src + 1];
        this.accelX[dstRow + x] = Number.isFinite(ax) ? ax : 0;
        this.accelY[dstRow + x] = Number.isFinite(ay) ? ay : 0;
      }
    }
    return true;
  }

  integrateParticlesGpu(dtMyr) {
    if (!this.gpuField || !this.gpuParticles) {
      return false;
    }
    const n = this.gridN;
    const halfX = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeX * 0.5);
    const halfY = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeY * 0.5);
    const halfZ = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeZ * 0.5);
    const centralMass = Math.max(0, this.params.centralMass ?? SPACE_DEFAULT_CENTRAL_MASS);
    const objectTotalMass = Math.max(0, this.params.objectTotalMass ?? SPACE_DEFAULT_OBJECT_TOTAL_MASS);
    const selfFieldBlend = computeSelfFieldBlendFactor({ centralMass, objectTotalMass });
    const soft = Math.max(SPACE_MIN_SOFTENING, this.params.softening ?? SPACE_DEFAULT_SOFTENING);
    const modeX = normalizeBoundaryAxis(this.params.boundaryAxes?.x) === "lost" ? 1 : 0;
    const modeY = normalizeBoundaryAxis(this.params.boundaryAxes?.y) === "lost" ? 1 : 0;
    const modeZ = normalizeBoundaryAxis(this.params.boundaryAxes?.z) === "lost" ? 1 : 0;

    const accelTarget = this.gpuField.gpuCompute.getCurrentRenderTarget(this.gpuField.accelVar);
    const { gpuCompute, positionVar, velocityVar, texSize } = this.gpuParticles;

    velocityVar.material.uniforms.uAccelTex.value = accelTarget.texture;
    velocityVar.material.uniforms.uParticleTexSize.value = texSize;
    velocityVar.material.uniforms.uGridN.value = n;
    velocityVar.material.uniforms.uHalfX.value = halfX;
    velocityVar.material.uniforms.uHalfY.value = halfY;
    velocityVar.material.uniforms.uHalfZ.value = halfZ;
    velocityVar.material.uniforms.uDt.value = dtMyr;
    velocityVar.material.uniforms.uSelfFieldBlend.value = selfFieldBlend;
    velocityVar.material.uniforms.uCentralGravity.value = SPACE_GRAVITY_INTERNAL * centralMass;
    velocityVar.material.uniforms.uSoftSq.value = soft * soft;
    velocityVar.material.uniforms.uDamping.value = SPACE_DAMPING;

    positionVar.material.uniforms.uParticleTexSize.value = texSize;
    positionVar.material.uniforms.uHalfX.value = halfX;
    positionVar.material.uniforms.uHalfY.value = halfY;
    positionVar.material.uniforms.uHalfZ.value = halfZ;
    positionVar.material.uniforms.uDt.value = dtMyr;
    positionVar.material.uniforms.uBoundaryModeX.value = modeX;
    positionVar.material.uniforms.uBoundaryModeY.value = modeY;
    positionVar.material.uniforms.uBoundaryModeZ.value = modeZ;

    try {
      gpuCompute.compute();
    } catch (error) {
      console.warn("[space] GPU particle integration failed.", error);
      return false;
    }
    return true;
  }

  syncCpuShadowFromGpuParticles({ includeVelocity = false } = {}) {
    if (!this.gpuParticles) {
      return false;
    }
    const { gpuCompute, positionVar, velocityVar, texSize, positionReadback, velocityReadback } = this.gpuParticles;
    try {
      const posTarget = gpuCompute.getCurrentRenderTarget(positionVar);
      this.renderer.readRenderTargetPixels(posTarget, 0, 0, texSize, texSize, positionReadback);
      if (includeVelocity) {
        const velTarget = gpuCompute.getCurrentRenderTarget(velocityVar);
        this.renderer.readRenderTargetPixels(velTarget, 0, 0, texSize, texSize, velocityReadback);
      }
    } catch (error) {
      console.warn("[space] GPU particle readback failed.", error);
      return false;
    }

    const totalTexels = texSize * texSize;
    const usable = Math.min(this.count, totalTexels);
    const boundX = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeX * 0.5) * 20;
    const boundY = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeY * 0.5) * 20;
    const boundZ = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeZ * 0.5) * 20;
    for (let i = 0; i < usable; i += 1) {
      const base = this.particleIndexToTextureBase(i, texSize, false);
      const px = positionReadback[base];
      const py = positionReadback[base + 1];
      const pz = positionReadback[base + 2];
      if (
        !Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)
        || Math.abs(px) > boundX || Math.abs(py) > boundY || Math.abs(pz) > boundZ
      ) {
        return false;
      }
      this.posX[i] = px;
      this.posY[i] = py;
      this.posZ[i] = pz;
      if (includeVelocity) {
        const vx = velocityReadback[base];
        const vy = velocityReadback[base + 1];
        const vz = velocityReadback[base + 2];
        if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
          return false;
        }
        this.velX[i] = vx;
        this.velY[i] = vy;
        this.velZ[i] = vz;
      }
    }
    return true;
  }

  getFieldReferenceSpan() {
    const spanX = Math.max(SPACE_MIN_WORLD_AXIS, Number(this.params.worldSizeX) || SPACE_MIN_WORLD_AXIS);
    const spanY = Math.max(SPACE_MIN_WORLD_AXIS, Number(this.params.worldSizeY) || SPACE_MIN_WORLD_AXIS);
    return 0.5 * (spanX + spanY);
  }

  seedParticles() {
    const spreadX = this.getInitialSpreadForAxis(this.params.worldSizeX);
    const spreadY = this.getInitialSpreadForAxis(this.params.worldSizeY);
    const spreadZ = this.getInitialSpreadForAxis(this.params.worldSizeZ);
    const initialShape = String(this.params.initialShape || SPACE_DEFAULT_INITIAL_SHAPE).toLowerCase();
    const spin = Math.max(0, this.params.spin ?? SPACE_DEFAULT_SPIN);
    const centralMass = Math.max(0, this.params.centralMass ?? SPACE_DEFAULT_CENTRAL_MASS);
    const objectTotalMass = Math.max(0, this.params.objectTotalMass ?? SPACE_DEFAULT_OBJECT_TOTAL_MASS);
    const selfFieldBlend = computeSelfFieldBlendFactor({ centralMass, objectTotalMass });
    const softening = Math.max(SPACE_MIN_SOFTENING, this.params.softening ?? SPACE_DEFAULT_SOFTENING);
    const particleMass = Math.max(0, objectTotalMass / Math.max(1, this.count));
    const indexedByRadius = [];
    for (let i = 0; i < this.count; i += 1) {
      const position = sampleInitialPosition({
        preset: initialShape,
        spreadX,
        spreadY,
        spreadZ,
      });
      this.posX[i] = position.x;
      this.posY[i] = position.y;
      this.posZ[i] = position.z;
      indexedByRadius.push({ index: i, radius: Math.max(SPACE_MIN_PARTICLE_RADIUS, position.length()) });
    }

    indexedByRadius.sort((a, b) => a.radius - b.radius);
    const tempPosition = new THREE.Vector3();
    for (let rank = 0; rank < indexedByRadius.length; rank += 1) {
      const { index, radius } = indexedByRadius[rank];
      tempPosition.set(this.posX[index], this.posY[index], this.posZ[index]);
      const radial = tempPosition.clone().normalize();
      if (radial.lengthSq() < SPACE_LENGTH_SQ_EPSILON) {
        radial.set(1, 0, 0);
      }
      const tangential = sampleInitialVelocityDirection({
        preset: initialShape,
        position: tempPosition,
        radial,
      });
      const enclosedObjectMass = particleMass * (rank + 1);
      const enclosedMass = centralMass + selfFieldBlend * enclosedObjectMass;
      const baseSpeed = spin * computeSoftenedCircularSpeed(
        Math.max(SPACE_GRAVITY_EPSILON, SPACE_GRAVITY_INTERNAL),
        enclosedMass,
        radius,
        softening,
      );
      const seededSpeed = applySeedVelocityProfile({
        tangential,
        radial,
        baseSpeed,
        initialShape,
        position: tempPosition,
        phaseOffset: this.seedPhaseOffset,
      });
      tangential.x += THREE.MathUtils.randFloatSpread(seededSpeed * SPACE_SEED_VELOCITY_NOISE_FRACTION);
      tangential.y += THREE.MathUtils.randFloatSpread(seededSpeed * SPACE_SEED_VELOCITY_NOISE_FRACTION);
      tangential.z += THREE.MathUtils.randFloatSpread(seededSpeed * SPACE_SEED_VELOCITY_NOISE_FRACTION);
      this.velX[index] = tangential.x;
      this.velY[index] = tangential.y;
      this.velZ[index] = tangential.z;
    }

    this.applyBoundaryToAll();
  }

  getInitialSpreadForAxis(worldSize) {
    const worldLimit = Math.max(SPACE_MIN_WORLD_SPREAD, Number(worldSize) * SPACE_WORLD_SPREAD_LIMIT_FRACTION);
    const configured = Number(this.params.initialRadius ?? SPACE_DEFAULT_INITIAL_RADIUS);
    const requested = Number.isFinite(configured)
      ? configured
      : Math.max(SPACE_MIN_WORLD_SPREAD, Number(worldSize) * SPACE_DEFAULT_INITIAL_SPREAD_WORLD_FRACTION);
    return THREE.MathUtils.clamp(requested, SPACE_MIN_WORLD_SPREAD, worldLimit);
  }

  shouldUseGpuPointCloud() {
    return Boolean(this.params.hardwareAcceleration ?? true) && Boolean(this.renderer?.capabilities?.isWebGL2);
  }

  ensurePointCloud() {
    if (this.shouldUseGpuPointCloud()) {
      this.ensureGpuPointCloud();
      if (this.instanceMesh) {
        this.instanceMesh.visible = false;
      }
      return;
    }
    this.ensureInstancePointCloud();
    if (this.gpuPointCloud) {
      this.gpuPointCloud.visible = false;
    }
  }

  ensureInstancePointCloud() {
    const nextCapacity = Math.max(1, this.count);
    const currentCapacity = this.instanceCapacity;
    if (
      !this.instanceMesh
      || currentCapacity < nextCapacity
      || currentCapacity > nextCapacity * SPACE_INSTANCE_CAPACITY_SHRINK_FACTOR
    ) {
      if (this.instanceMesh) {
        this.scene.remove(this.instanceMesh);
        this.instanceMesh.geometry?.dispose?.();
      }
      this.instanceCapacity = nextCapacity;
      this.instanceMesh = new THREE.InstancedMesh(this.geometry, this.material, this.instanceCapacity);
      this.instanceMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.instanceMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(this.instanceCapacity * 3),
        3,
      );
      this.instanceMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < this.instanceCapacity; i += 1) {
        this.instanceMesh.instanceColor.setXYZ(i, 1, 1, 1);
      }
      this.instanceMesh.frustumCulled = false;
      this.scene.add(this.instanceMesh);
    }
  }

  ensureGpuPointCloud() {
    const nextCapacity = Math.max(1, this.count);
    const currentCapacity = this.gpuPointCapacity;
    if (
      !this.gpuPointCloud
      || !this.gpuRenderResources
      || currentCapacity < nextCapacity
      || currentCapacity > nextCapacity * SPACE_INSTANCE_CAPACITY_SHRINK_FACTOR
    ) {
      if (this.gpuPointCloud) {
        this.scene.remove(this.gpuPointCloud);
        this.gpuPointCloud.geometry?.dispose?.();
        this.gpuPointCloud.material?.dispose?.();
      }
      if (this.gpuRenderResources) {
        this.gpuRenderResources.positionTexture?.dispose?.();
        this.gpuRenderResources.velocityTexture?.dispose?.();
      }
      this.gpuPointCapacity = nextCapacity;
      const texSize = Math.max(1, Math.ceil(Math.sqrt(this.gpuPointCapacity)));
      const geometry = new THREE.BufferGeometry();
      const indices = new Float32Array(this.gpuPointCapacity);
      const speeds = new Float32Array(this.gpuPointCapacity);
      const colors = new Float32Array(this.gpuPointCapacity * 3);
      for (let i = 0; i < this.gpuPointCapacity; i += 1) {
        indices[i] = i;
        speeds[i] = 0;
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      }
      geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
      const speedAttribute = new THREE.BufferAttribute(speeds, 1);
      speedAttribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("aSpeed", speedAttribute);
      const colorAttribute = new THREE.BufferAttribute(colors, 3);
      colorAttribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("aColor", colorAttribute);
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.gpuPointCapacity * 3), 3));

      const positionTexture = new THREE.DataTexture(
        new Float32Array(texSize * texSize * SPACE_GPU_RENDER_TEXTURE_CHANNELS),
        texSize,
        texSize,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      positionTexture.magFilter = THREE.NearestFilter;
      positionTexture.minFilter = THREE.NearestFilter;
      positionTexture.wrapS = THREE.ClampToEdgeWrapping;
      positionTexture.wrapT = THREE.ClampToEdgeWrapping;
      positionTexture.generateMipmaps = false;

      const velocityTexture = new THREE.DataTexture(
        new Float32Array(texSize * texSize * SPACE_GPU_RENDER_TEXTURE_CHANNELS),
        texSize,
        texSize,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      velocityTexture.magFilter = THREE.NearestFilter;
      velocityTexture.minFilter = THREE.NearestFilter;
      velocityTexture.wrapS = THREE.ClampToEdgeWrapping;
      velocityTexture.wrapT = THREE.ClampToEdgeWrapping;
      velocityTexture.generateMipmaps = false;

      const material = new THREE.ShaderMaterial({
        vertexShader: SPACE_GPU_RENDER_VERTEX_SHADER,
        fragmentShader: SPACE_GPU_RENDER_FRAGMENT_SHADER,
        transparent: false,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uPositionTex: { value: positionTexture },
          uTexSize: { value: texSize },
          uCount: { value: this.count },
          uPointDiameter: { value: Math.max(SPACE_POINT_SIZE_MIN_WORLD, getSpaceVisualSize(this.params)) },
          uViewportHeight: { value: 1 },
          uUsePerspectiveSizing: { value: true },
          uUseSolidColor: { value: false },
          uSolidColor: { value: new THREE.Color(getSpaceSolidColor(this.params)) },
        },
      });
      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      this.gpuPointCloud = points;
      this.gpuRenderResources = {
        texSize,
        positionTexture,
        velocityTexture,
      };
      this.scene.add(points);
    }
  }

  getOrCreateColormapTexture(colormapKey) {
    const key = String(colormapKey || "magma").trim() || "magma";
    if (this.colormapTextureCache.has(key)) {
      return this.colormapTextureCache.get(key);
    }
    const colors = SPACE_COLORMAPS[key] || SPACE_COLORMAPS.magma || SPACE_COLORMAPS.turbo;
    const data = new Uint8Array(SPACE_GPU_COLORMAP_RESOLUTION * 3);
    for (let i = 0; i < SPACE_GPU_COLORMAP_RESOLUTION; i += 1) {
      const t = i / Math.max(1, SPACE_GPU_COLORMAP_RESOLUTION - 1);
      applyColormapValue({ colormap: key, colormapInverted: false }, t, this.tempColor);
      data[i * 3] = Math.round(THREE.MathUtils.clamp(this.tempColor.r, 0, 1) * 255);
      data[i * 3 + 1] = Math.round(THREE.MathUtils.clamp(this.tempColor.g, 0, 1) * 255);
      data[i * 3 + 2] = Math.round(THREE.MathUtils.clamp(this.tempColor.b, 0, 1) * 255);
    }
    const texture = new THREE.DataTexture(
      data,
      SPACE_GPU_COLORMAP_RESOLUTION,
      1,
      THREE.RGBFormat,
      THREE.UnsignedByteType,
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    this.colormapTextureCache.set(key, texture);
    return texture;
  }

  syncPointCloud() {
    this.ensurePointCloud();
    if (this.shouldUseGpuPointCloud()) {
      this.syncGpuPointCloud();
      return;
    }
    this.syncInstancePointCloud();
  }

  syncInstancePointCloud() {
    if (!this.instanceMesh) {
      return;
    }
    this.instanceMesh.visible = true;

    const diameter = getSpaceVisualSize(this.params);
    const scale = Math.max(
      SPACE_POINT_SIZE_MIN_WORLD,
      diameter / (2 * SPACE_INSTANCE_BASE_RADIUS),
    );
    this.solidColorValue.set(getSpaceSolidColor(this.params));
    this.speedBounds = this.getSpeedBounds();
    const colorMode = String(this.params.colorMode || "speed").trim();
    const speedSpan = Math.max(SPACE_COLORMAP_SPAN_EPSILON, this.speedBounds.max - this.speedBounds.min);

    for (let i = 0; i < this.count; i += 1) {
      this.tempObject.position.set(this.posX[i], this.posY[i], this.posZ[i]);
      this.tempObject.rotation.set(0, 0, 0);
      this.tempObject.scale.setScalar(scale);
      this.tempObject.updateMatrix();
      this.instanceMesh.setMatrixAt(i, this.tempObject.matrix);

      if (colorMode === "solid") {
        this.tempColor.copy(this.solidColorValue);
      } else {
        const speed = Math.hypot(this.velX[i], this.velY[i], this.velZ[i]);
        const t = THREE.MathUtils.clamp((speed - this.speedBounds.min) / speedSpan, 0, 1);
        applyColormapValue(this.params, t, this.tempColor);
      }
      this.instanceMesh.setColorAt(i, this.tempColor);
    }

    this.instanceMesh.count = this.count;
    this.instanceMesh.instanceMatrix.needsUpdate = true;
    if (this.instanceMesh.instanceColor) {
      this.instanceMesh.instanceColor.needsUpdate = true;
    }
  }

  syncGpuPointCloud() {
    if (!this.gpuPointCloud || !this.gpuRenderResources) {
      return;
    }

    const { texSize, positionTexture, velocityTexture } = this.gpuRenderResources;
    const material = this.gpuPointCloud.material;
    const speedAttribute = this.gpuPointCloud.geometry?.getAttribute?.("aSpeed");
    const colorAttribute = this.gpuPointCloud.geometry?.getAttribute?.("aColor");
    if (speedAttribute?.array) {
      const speedArray = speedAttribute.array;
      speedArray.fill(0);
      for (let i = 0; i < this.count && i < speedArray.length; i += 1) {
        const speed = Math.hypot(this.velX[i], this.velY[i], this.velZ[i]);
        speedArray[i] = Number.isFinite(speed) ? speed : 0;
      }
      speedAttribute.needsUpdate = true;
    }
    if (
      SPACE_ENABLE_GPU_PARTICLE_INTEGRATION
      && this.fieldSolverBackend === "gpu"
      && this.gpuParticles
      && !this.gpuParticleRuntimeDisabled
    ) {
      const particleTexSize = this.gpuParticles.texSize;
      const positionTarget = this.gpuParticles.gpuCompute.getCurrentRenderTarget(this.gpuParticles.positionVar);
      material.uniforms.uPositionTex.value = positionTarget.texture;
      material.uniforms.uTexSize.value = particleTexSize;
    } else {
      const posData = positionTexture.image.data;
      const velData = velocityTexture.image.data;
      const total = texSize * texSize;
      posData.fill(0);
      velData.fill(0);
      for (let i = 0; i < this.count && i < total; i += 1) {
        const base = i * SPACE_GPU_RENDER_TEXTURE_CHANNELS;
        posData[base] = this.posX[i];
        posData[base + 1] = this.posY[i];
        posData[base + 2] = this.posZ[i];
        posData[base + 3] = 1;
        velData[base] = this.velX[i];
        velData[base + 1] = this.velY[i];
        velData[base + 2] = this.velZ[i];
        velData[base + 3] = 1;
      }
      positionTexture.needsUpdate = true;
      velocityTexture.needsUpdate = true;
      material.uniforms.uPositionTex.value = positionTexture;
      material.uniforms.uTexSize.value = texSize;
    }

    this.solidColorValue.set(getSpaceSolidColor(this.params));
    this.speedBounds = this.getSpeedBounds();
    const colorMode = String(this.params.colorMode || "speed").trim();
    if (colorAttribute?.array) {
      const colorArray = colorAttribute.array;
      colorArray.fill(0);
      const speedSpan = Math.max(SPACE_COLORMAP_SPAN_EPSILON, this.speedBounds.max - this.speedBounds.min);
      for (let i = 0; i < this.count && (i * 3 + 2) < colorArray.length; i += 1) {
        const speed = speedAttribute?.array?.[i] ?? 0;
        const t = THREE.MathUtils.clamp((speed - this.speedBounds.min) / speedSpan, 0, 1);
        applyColormapValue(this.params, t, this.tempColor);
        const base = i * 3;
        colorArray[base] = this.tempColor.r;
        colorArray[base + 1] = this.tempColor.g;
        colorArray[base + 2] = this.tempColor.b;
      }
      colorAttribute.needsUpdate = true;
    }
    material.uniforms.uCount.value = this.count;
    material.uniforms.uPointDiameter.value = Math.max(SPACE_POINT_SIZE_MIN_WORLD, getSpaceVisualSize(this.params));
    material.uniforms.uUseSolidColor.value = colorMode === "solid";
    material.uniforms.uSolidColor.value.copy(this.solidColorValue);
    material.uniforms.uUsePerspectiveSizing.value = String(this.params.projectionMode || "perspective") !== "orthographic";
    this.renderer?.getDrawingBufferSize?.(this.viewportPixelSize);
    material.uniforms.uViewportHeight.value = Math.max(1, this.viewportPixelSize.y);
    material.uniformsNeedUpdate = true;

    this.gpuPointCloud.visible = true;
  }

  // Compatibility with shared visual controls that call simulation.syncInstances().
  syncInstances() {
    this.syncPointCloud();
  }

  depositDensity() {
    const n = this.gridN;
    if (n <= 1) {
      return;
    }
    this.density.fill(0);
    const objectTotalMass = Math.max(0, this.params.objectTotalMass ?? SPACE_DEFAULT_OBJECT_TOTAL_MASS);
    const particleMass = objectTotalMass / Math.max(1, this.count);
    const halfX = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeX * 0.5);
    const halfY = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeY * 0.5);
    const spanX = halfX * 2;
    const spanY = halfY * 2;

    for (let i = 0; i < this.count; i += 1) {
      const gx = ((this.posX[i] + halfX) / spanX) * n;
      const gy = ((this.posY[i] + halfY) / spanY) * n;

      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;

      const x1 = x0 + 1;
      const y1 = y0 + 1;
      this.addDensity(this.wrapGridX(x0), this.wrapGridY(y0), particleMass * (1 - fx) * (1 - fy));
      this.addDensity(this.wrapGridX(x1), this.wrapGridY(y0), particleMass * fx * (1 - fy));
      this.addDensity(this.wrapGridX(x0), this.wrapGridY(y1), particleMass * (1 - fx) * fy);
      this.addDensity(this.wrapGridX(x1), this.wrapGridY(y1), particleMass * fx * fy);
    }

    let sum = 0;
    for (let i = 0; i < this.density.length; i += 1) {
      sum += this.density[i];
    }
    this.fieldDensityMean = sum / Math.max(1, this.density.length);
  }

  addDensity(ix, iy, value) {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    this.density[iy * this.gridN + ix] += value;
  }

  solveFieldPotential() {
    const n = this.gridN;
    if (n <= 1) {
      return;
    }
    const baseIterations = SPACE_FIELD_SOLVER_ITERATION_BASE + Math.round(n / SPACE_FIELD_SOLVER_ITERATION_DIVISOR);
    const iterations = THREE.MathUtils.clamp(
      baseIterations,
      SPACE_FIELD_SOLVER_ITERATION_MIN,
      SPACE_FIELD_SOLVER_ITERATION_MAX,
    );
    const dx = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeX / n);
    const dy = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeY / n);
    const h = 0.5 * (dx + dy);
    const hSq = h * h;
    const cellArea = dx * dy;
    const effectiveThickness = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeZ * SPACE_EFFECTIVE_THICKNESS_FACTOR);
    const invCellVolume = 1 / Math.max(SPACE_MIN_CELL_VOLUME, cellArea * effectiveThickness);
    const sourceFactor = 4 * Math.PI * SPACE_GRAVITY_INTERNAL;

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) {
          const idx = y * n + x;
          const left = this.potential[y * n + this.wrapGridX(x - 1)];
          const right = this.potential[y * n + this.wrapGridX(x + 1)];
          const down = this.potential[this.wrapGridY(y - 1) * n + x];
          const up = this.potential[this.wrapGridY(y + 1) * n + x];
          const densityContrast = (this.density[idx] - this.fieldDensityMean) * invCellVolume;
          const source = sourceFactor * densityContrast;
          this.potentialScratch[idx] = (left + right + down + up + hSq * source) * 0.25;
        }
      }
      const swap = this.potential;
      this.potential = this.potentialScratch;
      this.potentialScratch = swap;
    }
  }

  computeFieldAcceleration() {
    const n = this.gridN;
    if (n <= 1) {
      return;
    }
    const dx = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeX / n);
    const dy = Math.max(SPACE_MIN_CELL_SIZE, this.params.worldSizeY / n);
    const inv2Dx = 1 / (2 * dx);
    const inv2Dy = 1 / (2 * dy);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const idx = y * n + x;
        const left = this.potential[y * n + this.wrapGridX(x - 1)];
        const right = this.potential[y * n + this.wrapGridX(x + 1)];
        const down = this.potential[this.wrapGridY(y - 1) * n + x];
        const up = this.potential[this.wrapGridY(y + 1) * n + x];
        this.accelX[idx] = -(right - left) * inv2Dx;
        this.accelY[idx] = -(up - down) * inv2Dy;
      }
    }
  }

  integrateParticles(dtMyr) {
    const halfX = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeX * 0.5);
    const halfY = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeY * 0.5);
    const halfZ = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeZ * 0.5);
    const centralMass = Math.max(0, this.params.centralMass ?? SPACE_DEFAULT_CENTRAL_MASS);
    const objectTotalMass = Math.max(0, this.params.objectTotalMass ?? SPACE_DEFAULT_OBJECT_TOTAL_MASS);
    const selfFieldBlend = computeSelfFieldBlendFactor({ centralMass, objectTotalMass });
    const soft = Math.max(SPACE_MIN_SOFTENING, this.params.softening ?? SPACE_DEFAULT_SOFTENING);
    const softSq = soft * soft;
    const damping = SPACE_DAMPING;

    for (let i = 0; i < this.count; i += 1) {
      const x = this.posX[i];
      const y = this.posY[i];
      const z = this.posZ[i];

      const fieldAX = this.sampleGrid(this.accelX, x, y) * selfFieldBlend;
      const fieldAY = this.sampleGrid(this.accelY, x, y) * selfFieldBlend;

      const rSq = x * x + y * y + z * z + softSq;
      const invR = 1 / Math.sqrt(rSq);
      const invR3 = invR * invR * invR;
      const centerFactor = SPACE_GRAVITY_INTERNAL * centralMass * invR3;

      let vx = this.velX[i] + (fieldAX - x * centerFactor) * dtMyr;
      let vy = this.velY[i] + (fieldAY - y * centerFactor) * dtMyr;
      let vz = this.velZ[i] + (-z * centerFactor) * dtMyr;
      vx *= damping;
      vy *= damping;
      vz *= damping;

      let nextX = x + vx * dtMyr;
      let nextY = y + vy * dtMyr;
      let nextZ = z + vz * dtMyr;

      const bounded = applyBoundaryToPosition({
        x: nextX,
        y: nextY,
        z: nextZ,
        halfX,
        halfY,
        halfZ,
        boundaryAxes: this.params.boundaryAxes,
      });

      if (bounded.lost) {
        this.reseedSingleParticle(i);
        continue;
      }

      nextX = bounded.x;
      nextY = bounded.y;
      nextZ = bounded.z;
      this.posX[i] = nextX;
      this.posY[i] = nextY;
      this.posZ[i] = nextZ;
      this.velX[i] = vx;
      this.velY[i] = vy;
      this.velZ[i] = vz;
    }
  }

  reseedSingleParticle(index) {
    const spreadX = this.getInitialSpreadForAxis(this.params.worldSizeX);
    const spreadY = this.getInitialSpreadForAxis(this.params.worldSizeY);
    const spreadZ = this.getInitialSpreadForAxis(this.params.worldSizeZ);
    const initialShape = String(this.params.initialShape || SPACE_DEFAULT_INITIAL_SHAPE).toLowerCase();
    const position = sampleInitialPosition({
      preset: initialShape,
      spreadX,
      spreadY,
      spreadZ,
    });
    this.posX[index] = position.x;
    this.posY[index] = position.y;
    this.posZ[index] = position.z;
    this.velX[index] = THREE.MathUtils.randFloatSpread(SPACE_RESEED_VELOCITY_XY_SPREAD);
    this.velY[index] = THREE.MathUtils.randFloatSpread(SPACE_RESEED_VELOCITY_XY_SPREAD);
    this.velZ[index] = THREE.MathUtils.randFloatSpread(SPACE_RESEED_VELOCITY_Z_SPREAD);
  }

  applyBoundaryToAll() {
    const halfX = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeX * 0.5);
    const halfY = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeY * 0.5);
    const halfZ = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeZ * 0.5);
    for (let i = 0; i < this.count; i += 1) {
      const bounded = applyBoundaryToPosition({
        x: this.posX[i],
        y: this.posY[i],
        z: this.posZ[i],
        halfX,
        halfY,
        halfZ,
        boundaryAxes: this.params.boundaryAxes,
      });
      if (bounded.lost) {
        this.reseedSingleParticle(i);
      } else {
        this.posX[i] = bounded.x;
        this.posY[i] = bounded.y;
        this.posZ[i] = bounded.z;
      }
    }
  }

  sampleGrid(field, x, y) {
    const n = this.gridN;
    if (n <= 1 || field.length !== n * n) {
      return 0;
    }
    const halfX = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeX * 0.5);
    const halfY = Math.max(SPACE_MIN_WORLD_AXIS, this.params.worldSizeY * 0.5);
    const gx = ((x + halfX) / (halfX * 2)) * n;
    const gy = ((y + halfY) / (halfY * 2)) * n;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const v00 = field[this.wrapGridY(y0) * n + this.wrapGridX(x0)];
    const v10 = field[this.wrapGridY(y0) * n + this.wrapGridX(x1)];
    const v01 = field[this.wrapGridY(y1) * n + this.wrapGridX(x0)];
    const v11 = field[this.wrapGridY(y1) * n + this.wrapGridX(x1)];
    const vx0 = THREE.MathUtils.lerp(v00, v10, fx);
    const vx1 = THREE.MathUtils.lerp(v01, v11, fx);
    return THREE.MathUtils.lerp(vx0, vx1, fy);
  }

  wrapGridX(x) {
    const n = this.gridN;
    if (n <= 0) {
      return 0;
    }
    if (normalizeBoundaryAxis(this.params.boundaryAxes?.x) === "cyclic") {
      return (((x % n) + n) % n);
    }
    return THREE.MathUtils.clamp(x, 0, n - 1);
  }

  wrapGridY(y) {
    const n = this.gridN;
    if (n <= 0) {
      return 0;
    }
    if (normalizeBoundaryAxis(this.params.boundaryAxes?.y) === "cyclic") {
      return (((y % n) + n) % n);
    }
    return THREE.MathUtils.clamp(y, 0, n - 1);
  }

  getSpeedBounds() {
    if (!this.count) {
      return { min: 0, max: 1 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.count; i += 1) {
      const speed = Math.hypot(this.velX[i], this.velY[i], this.velZ[i]);
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
    if (max - min < SPACE_COLORMAP_SPAN_EPSILON) {
      return {
        min: min - SPACE_SPEED_RANGE_PADDING,
        max: max + SPACE_SPEED_RANGE_PADDING,
      };
    }
    return { min, max };
  }

  getSpeedRange() {
    return {
      min: this.speedBounds.min,
      max: this.speedBounds.max,
    };
  }

  emitStats() {
    if (typeof this.onStats !== "function") {
      return;
    }
    const count = this.count;
    let radiusSum = 0;
    let speedSum = 0;
    const sampleCount = Math.min(count, SPACE_RADIUS_SAMPLE_LIMIT);
    const radiusSamples = new Float32Array(sampleCount);
    const stride = Math.max(1, Math.floor(count / Math.max(1, sampleCount)));
    let sampleIndex = 0;

    for (let i = 0; i < count; i += 1) {
      const radius = Math.hypot(this.posX[i], this.posY[i], this.posZ[i]);
      const speed = Math.hypot(this.velX[i], this.velY[i], this.velZ[i]);
      radiusSum += radius;
      speedSum += speed;
      if (sampleIndex < sampleCount && i % stride === 0) {
        radiusSamples[sampleIndex] = radius;
        sampleIndex += 1;
      }
    }

    this.onStats({
      count,
      meanRadius: count > 0 ? radiusSum / count : 0,
      meanSpeed: count > 0 ? speedSum / count : 0,
      radiusSamples,
    });
  }
}

function buildSpaceColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "speed";
  const requestedColormap = String(params?.colormap || "magma").trim();
  const fallbackColormap =
    continuousColormapOptions?.[0]?.key ||
    (continuousColormapGradients?.magma ? "magma" : Object.keys(continuousColormapGradients || {})[0] || "magma");
  const colormap = continuousColormapGradients?.[requestedColormap]
    ? requestedColormap
    : fallbackColormap;
  const colorModeOption = getSpaceColorModeOption(colorMode);
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
      simulation?.syncPointCloud?.();
    },
    legend: {
      gradient: continuousColormapGradients[colormap] || continuousColormapGradients.magma,
      minText: `min: ${Number(range.min).toFixed(0)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(0)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getSpaceColorModeOption(colorMode) {
  const visualParams = Array.isArray(SPACE_APPLET_CONFIG.visual?.params)
    ? SPACE_APPLET_CONFIG.visual.params
    : [];
  const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
  const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
  return options.find((option) => String(option?.key ?? "").trim() === colorMode) || null;
}

function normalizeHexColor(value, fallback = null) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function getSpaceSolidColorDefault() {
  return SPACE_DEFAULT_SOLID_COLOR;
}

function getSpaceSolidColor(params) {
  const fallback = getSpaceSolidColorDefault();
  return normalizeHexColor(params?.solidColorSpace ?? fallback, fallback);
}

function getSpaceVisualSizeDefault() {
  return SPACE_DEFAULT_VISUAL_DIAMETER;
}

function getSpaceVisualSize(params) {
  const defaultDiameter = getSpaceVisualSizeDefault();
  const configuredDiameter = Number(params?.visualSizeStar);
  const diameter = Number.isFinite(configuredDiameter) && configuredDiameter > 0
    ? configuredDiameter
    : defaultDiameter;
  return Math.max(SPACE_POINT_SIZE_MIN_WORLD, diameter);
}

function resolveRendererMaxPointSize(renderer) {
  try {
    const gl = renderer?.getContext?.();
    if (!gl || typeof gl.getParameter !== "function") {
      return 1024;
    }
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    if (!range || range.length < 2) {
      return 1024;
    }
    const maxSize = Number(range[1]);
    return Number.isFinite(maxSize) && maxSize > 1 ? maxSize : 1024;
  } catch (_error) {
    return 1024;
  }
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

function applyColormapValue(params, value, outColor) {
  const colors = SPACE_COLORMAPS[params?.colormap || "magma"] || SPACE_COLORMAPS.magma || SPACE_COLORMAPS.turbo;
  if (!colors || colors.length === 0) {
    outColor.setRGB(1, 1, 1);
    return outColor;
  }
  if (colors.length === 1) {
    outColor.copy(colors[0]);
    return outColor;
  }
  const normalized = params?.colormapInverted ? 1 - value : value;
  const clamped = THREE.MathUtils.clamp(normalized, 0, 1);
  const scaled = clamped * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const t = scaled - index;
  spaceLerpA.copy(colors[index]);
  spaceLerpB.copy(colors[index + 1]);
  outColor.copy(spaceLerpA).lerp(spaceLerpB, t);
  return outColor;
}

function normalizeBoundaryAxis(axisMode) {
  return String(axisMode || "").trim().toLowerCase() === "lost" ? "lost" : "cyclic";
}

function applyBoundaryToPosition({ x, y, z, halfX, halfY, halfZ, boundaryAxes }) {
  const modeX = normalizeBoundaryAxis(boundaryAxes?.x);
  const modeY = normalizeBoundaryAxis(boundaryAxes?.y);
  const modeZ = normalizeBoundaryAxis(boundaryAxes?.z);
  let nextX = x;
  let nextY = y;
  let nextZ = z;

  if (modeX === "cyclic") {
    nextX = wrapAxis(nextX, halfX);
  } else if (Math.abs(nextX) > halfX) {
    return { x, y, z, lost: true };
  }

  if (modeY === "cyclic") {
    nextY = wrapAxis(nextY, halfY);
  } else if (Math.abs(nextY) > halfY) {
    return { x, y, z, lost: true };
  }

  if (modeZ === "cyclic") {
    nextZ = wrapAxis(nextZ, halfZ);
  } else if (Math.abs(nextZ) > halfZ) {
    return { x, y, z, lost: true };
  }

  return { x: nextX, y: nextY, z: nextZ, lost: false };
}

function wrapAxis(value, halfExtent) {
  const worldSpan = halfExtent * 2;
  if (worldSpan <= 0) {
    return 0;
  }
  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % worldSpan) + worldSpan) % worldSpan) - halfExtent;
  }
  return value;
}

function sampleInitialPosition({ preset, spreadX, spreadY, spreadZ }) {
  if (preset === "disk") {
    const maxR = Math.max(SPACE_MIN_PARTICLE_RADIUS, Math.min(spreadX, spreadY));
    const r = Math.sqrt(Math.random()) * maxR;
    const angle = Math.random() * Math.PI * 2;
    const thickness = Math.max(SPACE_DISK_MIN_THICKNESS, spreadZ * SPACE_DISK_THICKNESS_FACTOR);
    return new THREE.Vector3(
      r * Math.cos(angle),
      r * Math.sin(angle),
      THREE.MathUtils.randFloatSpread(thickness * 2),
    );
  }

  if (preset === "sphere") {
    const maxR = Math.max(SPACE_MIN_PARTICLE_RADIUS, Math.min(spreadX, spreadY, spreadZ));
    const radius = maxR * Math.cbrt(Math.random());
    return randomDirection3D().multiplyScalar(radius);
  }

  if (preset === "ellipsoid") {
    const xScale = Math.max(SPACE_MIN_PARTICLE_RADIUS, spreadX);
    const yScale = Math.max(SPACE_MIN_PARTICLE_RADIUS, spreadY);
    const zScale = Math.max(SPACE_MIN_PARTICLE_RADIUS, spreadZ * SPACE_ELLIPSOID_Z_SCALE);
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
    if (diskTangent.lengthSq() > SPACE_LENGTH_SQ_EPSILON) {
      return diskTangent.normalize();
    }
  }

  const reference = randomDirection3D();
  if (Math.abs(reference.dot(radial)) > SPACE_PARALLEL_ALIGNMENT_LIMIT) {
    reference.set(0, 1, 0);
  }
  const tangentA = new THREE.Vector3().crossVectors(radial, reference).normalize();
  const tangentB = new THREE.Vector3().crossVectors(radial, tangentA).normalize();
  const orbitAngle = Math.random() * Math.PI * 2;
  return tangentA.multiplyScalar(Math.cos(orbitAngle)).addScaledVector(tangentB, Math.sin(orbitAngle));
}

function applySeedVelocityProfile({
  tangential,
  radial,
  baseSpeed,
  initialShape,
  position,
  phaseOffset,
}) {
  const speed = Math.max(0, Number(baseSpeed) || 0);
  if (speed <= 0) {
    tangential.set(0, 0, 0);
    return 0;
  }

  if (initialShape !== "disk") {
    tangential.multiplyScalar(speed);
    return speed;
  }

  const theta = Math.atan2(position.y, position.x);
  const spiralPhase = SPACE_SEED_SPIRAL_MODE * theta + phaseOffset;
  const tangentialScale = 1 + SPACE_SEED_SPIRAL_SPEED_PERTURB_FRACTION * Math.sin(spiralPhase);
  const seededSpeed = Math.max(0, speed * tangentialScale);
  tangential.multiplyScalar(seededSpeed);

  // Small radial kick breaks perfect axisymmetry so the mesh solver does not settle into ring bands.
  const radialKickScale = SPACE_SEED_SPIRAL_RADIAL_KICK_FRACTION * Math.cos(spiralPhase);
  tangential.addScaledVector(radial, seededSpeed * radialKickScale);
  return seededSpeed;
}

function randomDirection3D() {
  const vector = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(SPACE_RANDOM_VECTOR_SPREAD),
    THREE.MathUtils.randFloatSpread(SPACE_RANDOM_VECTOR_SPREAD),
    THREE.MathUtils.randFloatSpread(SPACE_RANDOM_VECTOR_SPREAD),
  );
  if (vector.lengthSq() < SPACE_LENGTH_SQ_EPSILON) {
    vector.set(0, 0, 1);
  }
  return vector.normalize();
}

function randomPointInUnitSphere() {
  for (let i = 0; i < SPACE_RANDOM_SPHERE_ATTEMPTS; i += 1) {
    const candidate = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(SPACE_RANDOM_VECTOR_SPREAD),
      THREE.MathUtils.randFloatSpread(SPACE_RANDOM_VECTOR_SPREAD),
      THREE.MathUtils.randFloatSpread(SPACE_RANDOM_VECTOR_SPREAD),
    );
    if (candidate.lengthSq() <= 1) {
      return candidate;
    }
  }
  return randomDirection3D().multiplyScalar(Math.cbrt(Math.random()));
}

function computeSelfFieldBlendFactor({ centralMass, objectTotalMass }) {
  const totalMass = Math.max(SPACE_MIN_CELL_VOLUME, centralMass + objectTotalMass);
  const massFraction = objectTotalMass / totalMass;
  return THREE.MathUtils.clamp(
    SPACE_SELF_FIELD_BLEND_BASE + SPACE_SELF_FIELD_BLEND_RANGE * massFraction,
    SPACE_SELF_FIELD_BLEND_MIN,
    SPACE_SELF_FIELD_BLEND_MAX,
  );
}

function computeSoftenedCircularSpeed(gravityConstant, mass, radius, softening) {
  const g = Math.max(0, Number(gravityConstant) || 0);
  const m = Math.max(0, Number(mass) || 0);
  const r = Math.max(SPACE_MIN_CELL_SIZE, Number(radius) || 0);
  const eps = Math.max(SPACE_MIN_CELL_SIZE, Number(softening) || 0);
  const rSq = r * r;
  const denom = Math.max(SPACE_GRAVITY_EPSILON, Math.pow(rSq + eps * eps, 1.5));
  const vSq = g * m * rSq / denom;
  return Math.sqrt(Math.max(0, vSq));
}
