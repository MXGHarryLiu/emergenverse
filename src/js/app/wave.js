// Wind-driven wave field applet inspired by GPU ocean wave synthesis techniques.
import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import waveConfigData from "./wave_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

export const WAVE_APPLET_CONFIG = validateAppletConfig(waveConfigData);

const WAVE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("grid", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "nodes",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("height", () => "0.00 m", {
        stroke: "#4cd3b6",
        fill: "rgba(76, 211, 182, 0.14)",
        axisLabel: "m",
        tickFormatter: (value) => value.toFixed(2),
        forceZeroMin: true,
      }),
      createChartMetricsEntry("speed", () => "0.00 m/s", {
        stroke: "#5aa4ff",
        fill: "rgba(90, 164, 255, 0.14)",
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
    const grid = Number(stats.gridNodes ?? 0);
    const height = Number(stats.heightRms ?? 0);
    const speed = Number(stats.surfaceSpeed ?? 0);

    ui.updateChartMetrics("wave", [grid, height, speed], [
      `${Math.max(0, Math.round(grid)).toLocaleString()}`,
      `${height.toFixed(2)} m`,
      `${speed.toFixed(2)} m/s`,
    ]);
  },
};

const WAVE_GRAVITY = 9.81;
const WAVE_TWO_PI = Math.PI * 2;
const WAVE_MAX_COMPONENTS = 32;
const WAVE_MIN_GRID_RESOLUTION = 8;
const WAVE_MAX_GRID_RESOLUTION = 512;
const WAVE_STATS_UPDATE_INTERVAL_SECONDS = 0.2;
const WAVE_MIN_VALUE_SPAN = 1e-6;
const WAVE_SAMPLE_GRID_SIZE = 12;
const WAVE_MIN_SPEED_RANGE_MAX = 0.05;
const WAVE_MIN_HEIGHT_RANGE = 0.02;
const WAVE_DIRECTION_RANGE = Object.freeze({ min: 0, max: 360 });
const WAVE_GPU_BACKEND_LOG_PREFIX = "[wave] Surface backend:";
const WAVE_DEFAULT_GRID_RESOLUTION = 144;
const WAVE_RANDOM_COMPONENT_BAND_EXPONENT = 2.6;
const WAVE_COMPONENT_PHASE_SEED_SCALE = 10000;
const WAVE_REFERENCE_WIND_SPEED = 12;

const WAVE_COLORMAPS = buildColormapLUT(WAVE_APPLET_CONFIG.visual?.colormap);
const waveLerpA = new THREE.Color();
const waveLerpB = new THREE.Color();
const glsl = String.raw;

const WAVE_VERTEX_SHADER = glsl`
precision highp float;

#define WAVE_MAX_COMPONENTS ${WAVE_MAX_COMPONENTS}

uniform float uTime;
uniform float uActiveComponents;
uniform float uAmplitude[WAVE_MAX_COMPONENTS];
uniform float uWaveNumber[WAVE_MAX_COMPONENTS];
uniform float uOmega[WAVE_MAX_COMPONENTS];
uniform float uPhase[WAVE_MAX_COMPONENTS];
uniform float uDirX[WAVE_MAX_COMPONENTS];
uniform float uDirY[WAVE_MAX_COMPONENTS];
uniform float uChoppiness;
uniform float uVerticalScale;
uniform float uColorMode;

varying vec3 vNormal;
varying float vScalar;

void main() {
  vec3 base = position;
  float dispZ = 0.0;
  vec2 dispXY = vec2(0.0);
  float slopeX = 0.0;
  float slopeY = 0.0;
  float velX = 0.0;
  float velY = 0.0;
  float velZ = 0.0;

  for (int i = 0; i < WAVE_MAX_COMPONENTS; i += 1) {
    float componentMask = step(float(i) + 0.5, uActiveComponents);

    float k = uWaveNumber[i];
    float omega = uOmega[i];
    float amp = uAmplitude[i] * componentMask;
    vec2 dir = vec2(uDirX[i], uDirY[i]);

    float theta = dot(dir, base.xy) * k + omega * uTime + uPhase[i];
    float s = sin(theta);
    float c = cos(theta);

    dispZ += amp * s;
    dispXY += uChoppiness * amp * c * dir;

    slopeX += amp * k * dir.x * c;
    slopeY += amp * k * dir.y * c;

    velZ += amp * omega * c;
    velX += -uChoppiness * amp * omega * s * dir.x;
    velY += -uChoppiness * amp * omega * s * dir.y;
  }

  vec3 displaced = vec3(base.x + dispXY.x, base.y + dispXY.y, base.z + dispZ * uVerticalScale);
  vec3 derivedNormal = normalize(vec3(-slopeX * uVerticalScale, -slopeY * uVerticalScale, 1.0));

  float scalar = dispZ * uVerticalScale;
  if (uColorMode > 0.5 && uColorMode < 1.5) {
    scalar = dispZ * uVerticalScale;
  } else if (uColorMode >= 1.5 && uColorMode < 2.5) {
    scalar = length(vec3(velX, velY, velZ * uVerticalScale));
  } else if (uColorMode >= 2.5) {
    float angleDeg = degrees(atan(velY, velX));
    if (angleDeg < 0.0) {
      angleDeg += 360.0;
    }
    scalar = angleDeg;
  }

  vScalar = scalar;
  vNormal = normalize(normalMatrix * derivedNormal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const WAVE_FRAGMENT_SHADER = glsl`
precision highp float;

uniform bool uUseSolidColor;
uniform vec3 uSolidColor;
uniform sampler2D uColormapTex;
uniform bool uColormapInverted;
uniform float uRangeMin;
uniform float uInvRangeSpan;
uniform float uColorMode;

varying vec3 vNormal;
varying float vScalar;

void main() {
  float t = 0.5;
  if (!uUseSolidColor) {
    float scalar = vScalar;
    if (scalar != scalar) {
      scalar = 0.0;
    }
    if (uColorMode >= 2.5) {
      t = clamp(scalar / 360.0, 0.0, 1.0);
    } else {
      t = clamp((scalar - uRangeMin) * max(0.0, uInvRangeSpan), 0.0, 1.0);
    }
    if (t != t) {
      t = 0.5;
    }
    if (uColormapInverted) {
      t = 1.0 - t;
    }
  }

  vec3 sampledColor = texture2D(uColormapTex, vec2(t, 0.5)).rgb;
  float sampledEnergy = sampledColor.r + sampledColor.g + sampledColor.b;
  if (sampledEnergy <= 1e-6 || sampledEnergy != sampledEnergy) {
    sampledColor = uSolidColor;
  }
  vec3 baseColor = uUseSolidColor ? uSolidColor : sampledColor;
  vec3 lightDir = normalize(vec3(0.28, 0.24, 0.92));
  float ndotl = dot(normalize(vNormal), lightDir);
  if (ndotl != ndotl) {
    ndotl = 1.0;
  }
  float diffuse = 0.32 + 0.68 * max(ndotl, 0.0);
  vec3 color = baseColor * diffuse;

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export class WaveSimulation extends BaseSimulation {
  static APPLET_ID = "wave";
  static APPLET_RUNTIME = WAVE_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildWaveColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

  constructor({ scene, params, world, onStats, renderer }) {
    super({ scene, params, world, onStats, renderer });

    this.surfaceMesh = null;
    this.surfaceGeometry = null;
    this.positionAttribute = null;
    this.colorAttribute = null;
    this.basePositions = null;
    this.scalarScratch = null;

    this.timeSeconds = 0;
    this.statsAccumulatorSeconds = 0;
    this.vertexCount = 0;

    this.waveComponents = [];
    this.activeComponentCount = 0;
    this.waveSignature = "";
    this.waveSeed = Math.random() * WAVE_COMPONENT_PHASE_SEED_SCALE;

    this.uniformAmplitude = new Float32Array(WAVE_MAX_COMPONENTS);
    this.uniformWaveNumber = new Float32Array(WAVE_MAX_COMPONENTS);
    this.uniformOmega = new Float32Array(WAVE_MAX_COMPONENTS);
    this.uniformPhase = new Float32Array(WAVE_MAX_COMPONENTS);
    this.uniformDirX = new Float32Array(WAVE_MAX_COMPONENTS);
    this.uniformDirY = new Float32Array(WAVE_MAX_COMPONENTS);

    this.colormapTextureCache = new Map();
    this.solidColorValue = new THREE.Color(getWaveSolidColor(this.params));
    this.tempColor = new THREE.Color();

    this.scalarRanges = {
      height: { min: -1, max: 1 },
      speed: { min: 0, max: 1 },
      direction: { ...WAVE_DIRECTION_RANGE },
    };

    this.lastHeightRms = 0;
    this.lastSurfaceSpeed = 0;

    this.evalScratch = {
      dispX: 0,
      dispY: 0,
      dispZ: 0,
      velX: 0,
      velY: 0,
      velZ: 0,
      speed: 0,
      directionDeg: 0,
      heightScaled: 0,
    };

    this.hardwareAccelerationEnabled = Boolean(this.params.hardwareAcceleration ?? true);
    this.useGpuPath = false;
    this.lastBackendLog = "";

    this.cpuMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    });

    this.gpuMaterial = new THREE.ShaderMaterial({
      vertexShader: WAVE_VERTEX_SHADER,
      fragmentShader: WAVE_FRAGMENT_SHADER,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uActiveComponents: { value: 0 },
        uAmplitude: { value: this.uniformAmplitude },
        uWaveNumber: { value: this.uniformWaveNumber },
        uOmega: { value: this.uniformOmega },
        uPhase: { value: this.uniformPhase },
        uDirX: { value: this.uniformDirX },
        uDirY: { value: this.uniformDirY },
        uChoppiness: { value: 1 },
        uVerticalScale: { value: 1 },
        uUseSolidColor: { value: false },
        uSolidColor: { value: new THREE.Color(getWaveSolidColor(this.params)) },
        uColormapTex: { value: this.getOrCreateColormapTexture(this.params.colormap) },
        uColormapInverted: { value: false },
        uRangeMin: { value: -1 },
        uInvRangeSpan: { value: 0.5 },
        uColorMode: { value: 1 },
      },
    });
  }

  init() {
    this.reset();
  }

  setVisible(visible) {
    if (this.surfaceMesh) {
      this.surfaceMesh.visible = visible;
    }
  }

  onTheme() {}

  reset() {
    this.timeSeconds = 0;
    this.statsAccumulatorSeconds = WAVE_STATS_UPDATE_INTERVAL_SECONDS;
    this.waveSeed = Math.random() * WAVE_COMPONENT_PHASE_SEED_SCALE;
    this.ensureWaveComponents(true);
    this.rebuildSurfaceMesh();
    this.syncInstances();
    this.emitStats();
  }

  onWorldGeometryChanged() {
    this.rebuildSurfaceMesh();
    this.syncInstances();
    this.emitStats();
  }

  onBoundaryChanged() {
    this.onWorldGeometryChanged();
  }

  setGridResolution(value) {
    const next = THREE.MathUtils.clamp(
      Math.round(Number(value) || this.params.gridResolution || 0),
      WAVE_MIN_GRID_RESOLUTION,
      WAVE_MAX_GRID_RESOLUTION,
    );
    if (next === this.params.gridResolution) {
      return;
    }
    this.params.gridResolution = next;
    this.reset();
  }

  setComponentCount(value) {
    const next = THREE.MathUtils.clamp(
      Math.round(Number(value) || this.params.componentCount || 0),
      1,
      WAVE_MAX_COMPONENTS,
    );
    if (next === this.params.componentCount) {
      return;
    }
    this.params.componentCount = next;
    this.reset();
  }

  setHardwareAcceleration(enabled) {
    this.params.hardwareAcceleration = Boolean(enabled);
    this.hardwareAccelerationEnabled = Boolean(enabled);
    this.updateMaterialMode();
    this.syncInstances();
  }

  isHardwareAccelerationActive() {
    return this.useGpuPath;
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) {
      this.emitStats();
      return;
    }

    const stepDt = Math.min(0.2, dt);
    this.timeSeconds += stepDt;

    this.ensureWaveComponents(false);

    if (this.useGpuPath) {
      this.updateGpuUniforms();
    } else {
      this.updateCpuSurface();
    }

    this.statsAccumulatorSeconds += stepDt;
    if (this.statsAccumulatorSeconds >= WAVE_STATS_UPDATE_INTERVAL_SECONDS) {
      this.statsAccumulatorSeconds = 0;
      this.emitStats();
    }
  }

  syncInstances() {
    this.ensureWaveComponents(false);
    this.updateMaterialMode();
    if (this.useGpuPath) {
      this.updateGpuUniforms();
    } else {
      this.updateCpuSurface();
    }
  }

  updateMaterialMode() {
    const wasGpu = this.useGpuPath;
    const { supported, reason } = this.resolveGpuSupport();
    const shouldUseGpu = this.hardwareAccelerationEnabled && supported;
    this.useGpuPath = shouldUseGpu;
    if (this.surfaceMesh) {
      this.surfaceMesh.material = this.useGpuPath ? this.gpuMaterial : this.cpuMaterial;
    }
    if (this.useGpuPath && !wasGpu) {
      this.restoreBaseGeometryPositions();
    }
    this.logBackend(reason);
  }

  resolveGpuSupport() {
    if (!this.renderer) {
      return { supported: false, reason: "renderer missing" };
    }
    const hasWebGL2Capability = Boolean(this.renderer.capabilities?.isWebGL2);
    let gl = null;
    try {
      gl = this.renderer.getContext?.();
    } catch (_error) {
      gl = null;
    }
    const hasWebGL2Context = (
      typeof WebGL2RenderingContext !== "undefined"
      && gl instanceof WebGL2RenderingContext
    );
    const supported = hasWebGL2Capability || hasWebGL2Context;
    if (supported) {
      return {
        supported: true,
        reason: hasWebGL2Capability ? "renderer=WebGL2" : "context=WebGL2",
      };
    }
    if (gl) {
      return { supported: false, reason: "renderer=WebGL1" };
    }
    return { supported: false, reason: "context unavailable" };
  }

  logBackend(reason) {
    const state = this.useGpuPath ? `GPU (${reason})` : `CPU (${reason})`;
    if (state === this.lastBackendLog) {
      return;
    }
    this.lastBackendLog = state;
    console.log(`${WAVE_GPU_BACKEND_LOG_PREFIX} ${state}.`);
  }

  rebuildSurfaceMesh() {
    const resolution = this.resolveGridResolution();
    const segments = Math.max(1, resolution - 1);
    const width = Math.max(2, Number(this.params.worldSizeX) || 2);
    const height = Math.max(2, Number(this.params.worldSizeY) || 2);

    // Wave surface lives in XY and displaces along Z.
    const geometry = new THREE.PlaneGeometry(width, height, segments, segments);

    const positionAttribute = geometry.getAttribute("position");
    positionAttribute.setUsage(THREE.DynamicDrawUsage);

    const vertexCount = positionAttribute.count;
    const colorArray = new Float32Array(vertexCount * 3);
    const colorAttribute = new THREE.BufferAttribute(colorArray, 3);
    colorAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("color", colorAttribute);

    if (this.surfaceMesh) {
      this.scene.remove(this.surfaceMesh);
      this.surfaceGeometry?.dispose?.();
    }

    this.surfaceGeometry = geometry;
    this.positionAttribute = positionAttribute;
    this.colorAttribute = colorAttribute;
    this.basePositions = new Float32Array(positionAttribute.array);
    this.scalarScratch = new Float32Array(vertexCount);
    this.vertexCount = vertexCount;

    this.surfaceMesh = new THREE.Mesh(
      geometry,
      this.useGpuPath ? this.gpuMaterial : this.cpuMaterial,
    );
    this.surfaceMesh.frustumCulled = false;
    this.scene.add(this.surfaceMesh);

    this.updateMaterialMode();
  }

  restoreBaseGeometryPositions() {
    if (!this.positionAttribute || !this.basePositions) {
      return;
    }
    this.positionAttribute.array.set(this.basePositions);
    this.positionAttribute.needsUpdate = true;
  }

  resolveGridResolution() {
    const configured = Math.round(Number(this.params.gridResolution) || 0);
    return THREE.MathUtils.clamp(
      configured || WAVE_DEFAULT_GRID_RESOLUTION,
      WAVE_MIN_GRID_RESOLUTION,
      WAVE_MAX_GRID_RESOLUTION,
    );
  }

  ensureWaveComponents(forceRebuild = false) {
    const signature = [
      Math.round(Number(this.params.componentCount) || 0),
      Number(this.params.windSpeed || 0).toFixed(3),
      Number(this.params.windDirection || 0).toFixed(3),
      Number(this.params.waveAmplitude || 0).toFixed(3),
      Number(this.params.baseWavelength || 0).toFixed(3),
      Number(this.params.directionSpread || 0).toFixed(3),
      Number(this.params.damping || 0).toFixed(4),
      Number(this.waveSeed || 0).toFixed(3),
    ].join("|");

    if (!forceRebuild && signature === this.waveSignature) {
      return;
    }

    this.waveSignature = signature;
    this.buildWaveSpectrum();
    this.updateWaveUniformArrays();
  }

  buildWaveSpectrum() {
    const componentCount = THREE.MathUtils.clamp(
      Math.round(Number(this.params.componentCount) || 16),
      1,
      WAVE_MAX_COMPONENTS,
    );
    const windSpeed = Math.max(0, Number(this.params.windSpeed) || 0);
    const windDirectionRad = THREE.MathUtils.degToRad(Number(this.params.windDirection) || 0);
    const waveAmplitude = Math.max(0, Number(this.params.waveAmplitude) || 0);
    const baseWavelength = Math.max(0.5, Number(this.params.baseWavelength) || 0.5);
    const spreadRad = THREE.MathUtils.degToRad(Math.max(0, Number(this.params.directionSpread) || 0));
    const damping = Math.max(0, Number(this.params.damping) || 0);
    const random = createSeededRandom(this.waveSeed + componentCount * 131 + windDirectionRad * 17.0);

    const windX = Math.cos(windDirectionRad);
    const windY = Math.sin(windDirectionRad);

    this.waveComponents.length = 0;
    const componentNormalization = Math.sqrt(16 / Math.max(1, componentCount));

    let sumAmplitude = 0;
    let sumSpeedAmplitude = 0;

    for (let i = 0; i < componentCount; i += 1) {
      const u = componentCount > 1
        ? (i + random()) / componentCount
        : random();
      const wavelengthBand = Math.pow(2, (u - 0.5) * WAVE_RANDOM_COMPONENT_BAND_EXPONENT);
      const wavelength = baseWavelength * wavelengthBand;
      const waveNumber = WAVE_TWO_PI / Math.max(0.2, wavelength);
      const omega = Math.sqrt(WAVE_GRAVITY * waveNumber);

      const windJitter = (random() - 0.5) * spreadRad;
      const dominantAngle = windDirectionRad + windJitter;
      const ambientAngle = random() * WAVE_TWO_PI;
      const directionality = THREE.MathUtils.clamp(0.32 + windSpeed / 45, 0.32, 0.92);
      const blend = THREE.MathUtils.clamp(directionality + (random() - 0.5) * 0.15, 0.18, 0.95);
      let dirX = Math.cos(dominantAngle) * blend + Math.cos(ambientAngle) * (1 - blend);
      let dirY = Math.sin(dominantAngle) * blend + Math.sin(ambientAngle) * (1 - blend);
      const dirLen = Math.hypot(dirX, dirY);
      if (dirLen > 0) {
        dirX /= dirLen;
        dirY /= dirLen;
      } else {
        dirX = windX;
        dirY = windY;
      }

      const alignment = 0.5 * (1 + (dirX * windX + dirY * windY));
      const directionalGain = 0.26 + 0.74 * Math.pow(THREE.MathUtils.clamp(alignment, 0, 1), 1.45);
      const energyRollOff = 1 / Math.pow(1 + (i + random() * 0.75) * 0.35, 1.15);
      const dampingGain = Math.exp(-damping * waveNumber * 0.45);
      const windGain = THREE.MathUtils.clamp(windSpeed / WAVE_REFERENCE_WIND_SPEED, 0, 4);
      const stochasticGain = 0.72 + 0.56 * random();

      const amplitude = waveAmplitude
        * directionalGain
        * energyRollOff
        * dampingGain
        * windGain
        * stochasticGain
        * componentNormalization;
      const phase = random() * WAVE_TWO_PI;

      this.waveComponents.push({
        amplitude,
        waveNumber,
        omega,
        phase,
        dirX,
        dirY,
      });

      sumAmplitude += Math.abs(amplitude);
      sumSpeedAmplitude += Math.abs(amplitude * omega);
    }

    const verticalScale = 1;
    const choppiness = Math.max(0, Number(this.params.choppiness) || 0);
    const heightMax = Math.max(WAVE_MIN_HEIGHT_RANGE, sumAmplitude * verticalScale);
    const speedMax = Math.max(
      WAVE_MIN_SPEED_RANGE_MAX,
      sumSpeedAmplitude * Math.sqrt(1 + choppiness * choppiness),
    );

    this.scalarRanges.height = {
      min: -heightMax,
      max: heightMax,
    };
    this.scalarRanges.speed = {
      min: 0,
      max: speedMax,
    };
    this.scalarRanges.direction = { ...WAVE_DIRECTION_RANGE };

    this.activeComponentCount = this.waveComponents.length;
  }

  updateWaveUniformArrays() {
    this.uniformAmplitude.fill(0);
    this.uniformWaveNumber.fill(0);
    this.uniformOmega.fill(0);
    this.uniformPhase.fill(0);
    this.uniformDirX.fill(0);
    this.uniformDirY.fill(0);

    for (let i = 0; i < this.waveComponents.length && i < WAVE_MAX_COMPONENTS; i += 1) {
      const component = this.waveComponents[i];
      this.uniformAmplitude[i] = component.amplitude;
      this.uniformWaveNumber[i] = component.waveNumber;
      this.uniformOmega[i] = component.omega;
      this.uniformPhase[i] = component.phase;
      this.uniformDirX[i] = component.dirX;
      this.uniformDirY[i] = component.dirY;
    }
  }

  updateGpuUniforms() {
    if (!this.gpuMaterial) {
      return;
    }

    const modeKey = String(this.params.colorMode || "height").trim();
    const mode = getWaveColorModeIndex(modeKey);
    const range = this.getColorRange(modeKey);
    const span = Math.max(WAVE_MIN_VALUE_SPAN, range.max - range.min);

    this.solidColorValue.set(getWaveSolidColor(this.params));

    const uniforms = this.gpuMaterial.uniforms;
    uniforms.uTime.value = this.timeSeconds;
    uniforms.uActiveComponents.value = this.activeComponentCount;
    uniforms.uAmplitude.value = this.uniformAmplitude;
    uniforms.uWaveNumber.value = this.uniformWaveNumber;
    uniforms.uOmega.value = this.uniformOmega;
    uniforms.uPhase.value = this.uniformPhase;
    uniforms.uDirX.value = this.uniformDirX;
    uniforms.uDirY.value = this.uniformDirY;
    uniforms.uChoppiness.value = Math.max(0, Number(this.params.choppiness) || 0);
    uniforms.uVerticalScale.value = 1;
    uniforms.uUseSolidColor.value = modeKey === "solid";
    uniforms.uSolidColor.value.copy(this.solidColorValue);
    uniforms.uColormapTex.value = this.getOrCreateColormapTexture(this.params.colormap);
    uniforms.uColormapInverted.value = Boolean(this.params.colormapInverted);
    uniforms.uRangeMin.value = range.min;
    uniforms.uInvRangeSpan.value = 1 / span;
    uniforms.uColorMode.value = mode;
    this.gpuMaterial.uniformsNeedUpdate = true;
  }

  updateCpuSurface() {
    if (!this.positionAttribute || !this.colorAttribute || !this.basePositions || !this.scalarScratch) {
      return;
    }

    const positionArray = this.positionAttribute.array;
    const colorArray = this.colorAttribute.array;
    const vertexCount = this.positionAttribute.count;
    const verticalScale = 1;
    const colorMode = String(this.params.colorMode || "height").trim();
    const choppiness = Math.max(0, Number(this.params.choppiness) || 0);

    this.solidColorValue.set(getWaveSolidColor(this.params));

    let speedMin = Infinity;
    let speedMax = -Infinity;
    let heightMin = Infinity;
    let heightMax = -Infinity;

    let heightSqSum = 0;
    let speedSum = 0;

    for (let i = 0; i < vertexCount; i += 1) {
      const base = i * 3;
      const x = this.basePositions[base];
      const y = this.basePositions[base + 1];
      const state = this.evaluateWaveStateAt(x, y, this.timeSeconds, choppiness, verticalScale);

      positionArray[base] = x + state.dispX;
      positionArray[base + 1] = y + state.dispY;
      positionArray[base + 2] = state.heightScaled;

      this.scalarScratch[i] = getWaveScalarByMode(colorMode, state);

      if (state.speed < speedMin) {
        speedMin = state.speed;
      }
      if (state.speed > speedMax) {
        speedMax = state.speed;
      }
      if (state.heightScaled < heightMin) {
        heightMin = state.heightScaled;
      }
      if (state.heightScaled > heightMax) {
        heightMax = state.heightScaled;
      }

      heightSqSum += state.heightScaled * state.heightScaled;
      speedSum += state.speed;
    }

    this.lastHeightRms = vertexCount > 0 ? Math.sqrt(heightSqSum / vertexCount) : 0;
    this.lastSurfaceSpeed = vertexCount > 0 ? speedSum / vertexCount : 0;

    if (Number.isFinite(heightMin) && Number.isFinite(heightMax)) {
      if (heightMax - heightMin < WAVE_MIN_HEIGHT_RANGE) {
        const center = 0.5 * (heightMax + heightMin);
        this.scalarRanges.height = {
          min: center - WAVE_MIN_HEIGHT_RANGE,
          max: center + WAVE_MIN_HEIGHT_RANGE,
        };
      } else {
        this.scalarRanges.height = { min: heightMin, max: heightMax };
      }
    }

    if (Number.isFinite(speedMin) && Number.isFinite(speedMax)) {
      if (speedMax - speedMin < WAVE_MIN_SPEED_RANGE_MAX) {
        this.scalarRanges.speed = {
          min: Math.max(0, speedMin - 0.5 * WAVE_MIN_SPEED_RANGE_MAX),
          max: speedMin + 0.5 * WAVE_MIN_SPEED_RANGE_MAX,
        };
      } else {
        this.scalarRanges.speed = {
          min: Math.max(0, speedMin),
          max: speedMax,
        };
      }
    }

    if (colorMode === "solid") {
      for (let i = 0; i < vertexCount; i += 1) {
        const base = i * 3;
        colorArray[base] = this.solidColorValue.r;
        colorArray[base + 1] = this.solidColorValue.g;
        colorArray[base + 2] = this.solidColorValue.b;
      }
    } else {
      const range = this.getColorRange(colorMode);
      const span = Math.max(WAVE_MIN_VALUE_SPAN, range.max - range.min);
      for (let i = 0; i < vertexCount; i += 1) {
        const scalar = this.scalarScratch[i];
        let t;
        if (colorMode === "direction") {
          t = THREE.MathUtils.clamp(scalar / 360, 0, 1);
        } else {
          t = THREE.MathUtils.clamp((scalar - range.min) / span, 0, 1);
        }
        if (this.params.colormapInverted) {
          t = 1 - t;
        }
        applyColormapValue(this.params, t, this.tempColor);
        const base = i * 3;
        colorArray[base] = this.tempColor.r;
        colorArray[base + 1] = this.tempColor.g;
        colorArray[base + 2] = this.tempColor.b;
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
  }

  evaluateWaveStateAt(x, y, timeSeconds, choppiness, verticalScale) {
    const out = this.evalScratch;
    let dispX = 0;
    let dispY = 0;
    let dispZ = 0;
    let velX = 0;
    let velY = 0;
    let velZ = 0;

    for (let i = 0; i < this.waveComponents.length; i += 1) {
      const component = this.waveComponents[i];
      const theta = (component.dirX * x + component.dirY * y) * component.waveNumber
        + component.omega * timeSeconds
        + component.phase;
      const s = Math.sin(theta);
      const c = Math.cos(theta);

      dispZ += component.amplitude * s;
      dispX += choppiness * component.amplitude * c * component.dirX;
      dispY += choppiness * component.amplitude * c * component.dirY;

      velZ += component.amplitude * component.omega * c * verticalScale;
      velX += -choppiness * component.amplitude * component.omega * s * component.dirX;
      velY += -choppiness * component.amplitude * component.omega * s * component.dirY;
    }

    const speed = Math.hypot(velX, velY, velZ);
    let directionDeg = THREE.MathUtils.radToDeg(Math.atan2(velY, velX));
    if (!Number.isFinite(directionDeg)) {
      directionDeg = 0;
    }
    if (directionDeg < 0) {
      directionDeg += 360;
    }

    out.dispX = dispX;
    out.dispY = dispY;
    out.dispZ = dispZ;
    out.velX = velX;
    out.velY = velY;
    out.velZ = velZ;
    out.speed = speed;
    out.directionDeg = directionDeg;
    out.heightScaled = dispZ * verticalScale;
    return out;
  }

  sampleGpuStats() {
    const halfX = Math.max(1, Number(this.params.worldSizeX || 1) * 0.5);
    const halfY = Math.max(1, Number(this.params.worldSizeY || 1) * 0.5);
    const grid = WAVE_SAMPLE_GRID_SIZE;
    const choppiness = Math.max(0, Number(this.params.choppiness) || 0);
    const verticalScale = 1;

    let heightSqSum = 0;
    let speedSum = 0;
    let sampleCount = 0;

    for (let iy = 0; iy < grid; iy += 1) {
      const ty = grid <= 1 ? 0.5 : iy / (grid - 1);
      const y = THREE.MathUtils.lerp(-halfY, halfY, ty);
      for (let ix = 0; ix < grid; ix += 1) {
        const tx = grid <= 1 ? 0.5 : ix / (grid - 1);
        const x = THREE.MathUtils.lerp(-halfX, halfX, tx);
        const state = this.evaluateWaveStateAt(x, y, this.timeSeconds, choppiness, verticalScale);
        heightSqSum += state.heightScaled * state.heightScaled;
        speedSum += state.speed;
        sampleCount += 1;
      }
    }

    this.lastHeightRms = sampleCount > 0 ? Math.sqrt(heightSqSum / sampleCount) : 0;
    this.lastSurfaceSpeed = sampleCount > 0 ? speedSum / sampleCount : 0;
  }

  emitStats() {
    if (typeof this.onStats !== "function") {
      return;
    }

    if (this.useGpuPath) {
      this.sampleGpuStats();
    }

    this.onStats({
      gridNodes: this.vertexCount,
      heightRms: this.lastHeightRms,
      surfaceSpeed: this.lastSurfaceSpeed,
    });
  }

  getColorRange(colorMode = this.params.colorMode) {
    const mode = String(colorMode || "height").trim();
    if (mode === "direction") {
      return this.scalarRanges.direction;
    }
    if (mode === "speed") {
      return this.scalarRanges.speed;
    }
    if (mode === "height") {
      return this.scalarRanges.height;
    }
    return this.scalarRanges.height;
  }

  getOrCreateColormapTexture(colormapKey) {
    const key = String(colormapKey || "turbo").trim() || "turbo";
    if (this.colormapTextureCache.has(key)) {
      return this.colormapTextureCache.get(key);
    }

    const resolution = 256;
    const data = new Uint8Array(resolution * 4);
    for (let i = 0; i < resolution; i += 1) {
      const t = i / Math.max(1, resolution - 1);
      applyColormapValue({ colormap: key, colormapInverted: false }, t, this.tempColor);
      const base = i * 4;
      data[base] = Math.round(THREE.MathUtils.clamp(this.tempColor.r, 0, 1) * 255);
      data[base + 1] = Math.round(THREE.MathUtils.clamp(this.tempColor.g, 0, 1) * 255);
      data[base + 2] = Math.round(THREE.MathUtils.clamp(this.tempColor.b, 0, 1) * 255);
      data[base + 3] = 255;
    }

    const texture = new THREE.DataTexture(
      data,
      resolution,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    if (Object.prototype.hasOwnProperty.call(texture, "colorSpace") && THREE.NoColorSpace) {
      texture.colorSpace = THREE.NoColorSpace;
    }
    texture.needsUpdate = true;

    this.colormapTextureCache.set(key, texture);
    return texture;
  }
}

function buildWaveColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "height";
  const colormap = params?.colormap || "turbo";
  const colorModeOption = getWaveColorModeOption(colorMode);
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

  const range = simulation?.getColorRange?.(colorMode)
    ?? (colorMode === "direction" ? WAVE_DIRECTION_RANGE : { min: 0, max: 1 });

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
      minText: `min: ${Number(range.min).toFixed(2)}${unit ? ` ${unit}` : ""}`,
      maxText: `max: ${Number(range.max).toFixed(2)}${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getWaveColorModeOption(colorMode) {
  const visualParams = Array.isArray(WAVE_APPLET_CONFIG.visual?.params)
    ? WAVE_APPLET_CONFIG.visual.params
    : [];
  const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
  const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
  return options.find((option) => String(option?.key ?? "").trim() === colorMode) || null;
}

function getWaveColorModeIndex(mode) {
  switch (String(mode || "height").trim()) {
    case "height":
      return 1;
    case "speed":
      return 2;
    case "direction":
      return 3;
    default:
      return 0;
  }
}

function getWaveScalarByMode(mode, state) {
  const key = String(mode || "height").trim();
  if (key === "speed") {
    return state.speed;
  }
  if (key === "direction") {
    return state.directionDeg;
  }
  if (key === "height") {
    return state.heightScaled;
  }
  return state.heightScaled;
}

function getWaveSolidColorDefault() {
  const entries = Array.isArray(WAVE_APPLET_CONFIG.visual?.color) ? WAVE_APPLET_CONFIG.visual.color : [];
  const entry = entries.find((item) => String(item?.key || "").trim() === "water");
  const fallback = entries[0]?.default || "#4da6ff";
  return normalizeHexColor(entry?.default ?? fallback, "#4da6ff");
}

function getWaveSolidColor(params) {
  return normalizeHexColor(params?.solidColorWater ?? getWaveSolidColorDefault(), getWaveSolidColorDefault());
}

function normalizeHexColor(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function buildColormapLUT(colormapEntries) {
  const maps = {};
  const entries = Array.isArray(colormapEntries) ? colormapEntries : [];
  entries.forEach((entry) => {
    const key = String(entry?.key || "").trim();
    const stops = Array.isArray(entry?.value) ? entry.value : [];
    if (!key || stops.length === 0) {
      return;
    }
    maps[key] = stops.map((hex) => new THREE.Color(hex));
  });
  return maps;
}

function applyColormapValue(params, normalized, outColor) {
  const mapKey = String(params?.colormap || "turbo").trim();
  const colors = WAVE_COLORMAPS[mapKey] || WAVE_COLORMAPS.turbo;
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
  const frac = scaled - index;

  waveLerpA.copy(colors[index]);
  waveLerpB.copy(colors[index + 1]);
  outColor.copy(waveLerpA).lerp(waveLerpB, frac);
  return outColor;
}

function createSeededRandom(seedValue) {
  let seed = Math.floor(Number(seedValue) || 0) >>> 0;
  if (seed === 0) {
    seed = 0x9e3779b9;
  }
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
