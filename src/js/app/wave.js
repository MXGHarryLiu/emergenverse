// FFT ocean wave field applet with directional spectral synthesis.
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
const WAVE_MAX_STEP_SECONDS = 0.2;
const WAVE_STATS_UPDATE_INTERVAL_SECONDS = 0.2;
const WAVE_MIN_FFT_RESOLUTION = 32;
const WAVE_MAX_FFT_RESOLUTION = 512;
const WAVE_DEFAULT_FFT_RESOLUTION = 128;
const WAVE_MIN_MESH_RESOLUTION = 32;
const WAVE_MAX_MESH_RESOLUTION = 512;
const WAVE_DEFAULT_MESH_RESOLUTION = 192;
const WAVE_GPU_BACKEND_LOG_PREFIX = "[wave] Surface backend:";

const glsl = String.raw;

const FULLSCREEN_VERTEX_SHADER = glsl`
precision highp float;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const INITIAL_SPECTRUM_FRAGMENT_SHADER = glsl`
precision highp float;

const float PI = 3.141592653589793;
const float G = 9.81;
const float KM = 370.0;
const float CM = 0.23;

uniform float uResolution;
uniform vec2 uDomainSize;
uniform vec2 uWind;
uniform float uAmplitude;
uniform float uDirectionalSpread;
uniform float uShortWaveDamping;

float square(float x) {
  return x * x;
}

float omega(float k) {
  return sqrt(G * k * (1.0 + square(k / KM)));
}

float tanhApprox(float x) {
  float e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

void main() {
  vec2 coordinates = gl_FragCoord.xy - 0.5;
  float n = (coordinates.x < uResolution * 0.5) ? coordinates.x : coordinates.x - uResolution;
  float m = (coordinates.y < uResolution * 0.5) ? coordinates.y : coordinates.y - uResolution;

  float domainX = max(1.0, uDomainSize.x);
  float domainY = max(1.0, uDomainSize.y);
  vec2 waveVector = vec2((2.0 * PI * n) / domainX, (2.0 * PI * m) / domainY);
  float k = length(waveVector);

  if (k < 1e-5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float windSpeed = max(0.1, length(uWind));
  vec2 windDir = normalize(uWind);
  float U10 = windSpeed;
  float Omega = 0.84;
  float kp = G * square(Omega / U10);

  float c = omega(k) / k;
  float cp = omega(kp) / kp;

  float Lpm = exp(-1.25 * square(kp / k));
  float gamma = 1.7;
  float sigma = 0.08 * (1.0 + 4.0 * pow(Omega, -3.0));
  float Gamma = exp(-square(sqrt(k / kp) - 1.0) / (2.0 * square(sigma)));
  float Jp = pow(gamma, Gamma);
  float Fp = Lpm * Jp * exp(-Omega / sqrt(10.0) * (sqrt(k / kp) - 1.0));
  float alphap = 0.006 * sqrt(Omega);
  float Bl = 0.5 * alphap * cp / c * Fp;

  float z0 = 0.000037 * square(U10) / G * pow(U10 / cp, 0.9);
  float uStar = 0.41 * U10 / log(10.0 / max(1e-6, z0));
  float uStarRatio = max(1e-6, uStar / CM);
  float alpham = 0.01 * ((uStar < CM) ? (1.0 + log(uStarRatio)) : (1.0 + 3.0 * log(uStarRatio)));
  float Fm = exp(-0.25 * square(k / KM - 1.0));
  float Bh = 0.5 * alpham * CM / c * Fm * Lpm;

  float a0 = log(2.0) / 4.0;
  float am = 0.13 * uStar / CM;
  float Delta = tanhApprox(a0 + 4.0 * pow(c / cp, 2.5) + am * pow(CM / c, 2.5));

  float cosPhi = dot(normalize(waveVector), windDir);
  float directionalCore = max(0.0, 1.0 + Delta * (2.0 * cosPhi * cosPhi - 1.0));
  float spreadExponent = max(0.35, uDirectionalSpread);
  float forwardLobe = pow(max(0.0, cosPhi), spreadExponent);
  float backwardLobe = 0.03 * pow(max(0.0, -cosPhi), spreadExponent);
  float directional = directionalCore * (forwardLobe + backwardLobe + 0.01);

  float S = (1.0 / (2.0 * PI)) * pow(k, -4.0) * (Bl + Bh) * directional;
  float shortWaveSuppression = exp(-uShortWaveDamping * uShortWaveDamping * k * k);
  float energyGain = pow(clamp(U10 / 12.0, 0.2, 4.0), 1.2);
  float spectrum = max(0.0, uAmplitude) * energyGain * max(0.0, S) * shortWaveSuppression;

  float dkx = 2.0 * PI / domainX;
  float dky = 2.0 * PI / domainY;
  float dk = sqrt(dkx * dky);
  float h = sqrt(max(0.0, spectrum) * 0.5) * dk;

  vec2 h0 = vec2(h, 0.0);

  gl_FragColor = vec4(h0, 0.0, 0.0);
}
`;

const PHASE_FRAGMENT_SHADER = glsl`
precision highp float;

const float PI = 3.141592653589793;
const float G = 9.81;
const float KM = 370.0;

varying vec2 vUv;

uniform sampler2D uPhases;
uniform float uDeltaTime;
uniform float uResolution;
uniform vec2 uDomainSize;

float omega(float k) {
  return sqrt(G * k * (1.0 + (k / KM) * (k / KM)));
}

void main() {
  vec2 coordinates = gl_FragCoord.xy - 0.5;
  float n = (coordinates.x < uResolution * 0.5) ? coordinates.x : coordinates.x - uResolution;
  float m = (coordinates.y < uResolution * 0.5) ? coordinates.y : coordinates.y - uResolution;
  vec2 waveVector = vec2(
    (2.0 * PI * n) / max(1.0, uDomainSize.x),
    (2.0 * PI * m) / max(1.0, uDomainSize.y)
  );

  float phase = texture2D(uPhases, vUv).r;
  float deltaPhase = omega(length(waveVector)) * max(0.0, uDeltaTime);
  phase = mod(phase + deltaPhase, 2.0 * PI);

  gl_FragColor = vec4(phase, 0.0, 0.0, 0.0);
}
`;

const SPECTRUM_FRAGMENT_SHADER = glsl`
precision highp float;

const float PI = 3.141592653589793;

varying vec2 vUv;

uniform float uResolution;
uniform vec2 uDomainSize;
uniform sampler2D uPhases;
uniform sampler2D uInitialSpectrum;
uniform float uChoppiness;

vec2 multiplyComplex(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.y * b.x + a.x * b.y);
}

vec2 multiplyByI(vec2 z) {
  return vec2(-z.y, z.x);
}

void main() {
  vec2 coordinates = gl_FragCoord.xy - 0.5;
  float n = (coordinates.x < uResolution * 0.5) ? coordinates.x : coordinates.x - uResolution;
  float m = (coordinates.y < uResolution * 0.5) ? coordinates.y : coordinates.y - uResolution;
  vec2 waveVector = vec2(
    (2.0 * PI * n) / max(1.0, uDomainSize.x),
    (2.0 * PI * m) / max(1.0, uDomainSize.y)
  );

  float phase = texture2D(uPhases, vUv).r;
  vec2 phaseVector = vec2(cos(phase), sin(phase));

  vec2 h0 = texture2D(uInitialSpectrum, vUv).rg;
  vec2 mirroredUv = vec2(1.0 - vUv + 1.0 / uResolution);
  vec2 h0Star = texture2D(uInitialSpectrum, mirroredUv).rg;
  h0Star.y *= -1.0;

  vec2 h = multiplyComplex(h0, phaseVector)
    + multiplyComplex(h0Star, vec2(phaseVector.x, -phaseVector.y));

  float kLength = length(waveVector);
  vec2 hX = vec2(0.0);
  vec2 hY = vec2(0.0);
  if (kLength > 1e-5) {
    vec2 dir = waveVector / kLength;
    hX = -multiplyByI(h * dir.x) * max(0.0, uChoppiness);
    hY = -multiplyByI(h * dir.y) * max(0.0, uChoppiness);
  }

  gl_FragColor = vec4(hX + multiplyByI(h), hY);
}
`;

const SUBTRANSFORM_FRAGMENT_SHADER = glsl`
precision highp float;

const float PI = 3.141592653589793;

uniform sampler2D uInput;
uniform float uTransformSize;
uniform float uSubtransformSize;

varying vec2 vUv;

vec2 multiplyComplex(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.y * b.x + a.x * b.y);
}

void main() {
  #ifdef HORIZONTAL
  float index = vUv.x * uTransformSize - 0.5;
  #else
  float index = vUv.y * uTransformSize - 0.5;
  #endif

  float evenIndex =
    floor(index / uSubtransformSize) * (uSubtransformSize * 0.5)
    + mod(index, uSubtransformSize * 0.5);

  #ifdef HORIZONTAL
  vec4 even = texture2D(uInput, vec2(evenIndex + 0.5, gl_FragCoord.y) / uTransformSize);
  vec4 odd = texture2D(uInput, vec2(evenIndex + uTransformSize * 0.5 + 0.5, gl_FragCoord.y) / uTransformSize);
  #else
  vec4 even = texture2D(uInput, vec2(gl_FragCoord.x, evenIndex + 0.5) / uTransformSize);
  vec4 odd = texture2D(uInput, vec2(gl_FragCoord.x, evenIndex + uTransformSize * 0.5 + 0.5) / uTransformSize);
  #endif

  float twiddleArgument = -2.0 * PI * (index / uSubtransformSize);
  vec2 twiddle = vec2(cos(twiddleArgument), sin(twiddleArgument));

  vec2 outputA = even.xy + multiplyComplex(twiddle, odd.xy);
  vec2 outputB = even.zw + multiplyComplex(twiddle, odd.zw);

  gl_FragColor = vec4(outputA, outputB);
}
`;

const NORMAL_MAP_FRAGMENT_SHADER = glsl`
precision highp float;

varying vec2 vUv;

uniform sampler2D uDisplacementMap;
uniform float uResolution;
uniform vec2 uDomainSize;
uniform float uDisplacementScale;

vec3 decodeDisplacement(vec3 packed) {
  return vec3(packed.r, packed.b, packed.g) * uDisplacementScale;
}

void main() {
  float texel = 1.0 / uResolution;
  vec2 texelSize = uDomainSize / uResolution;

  vec3 center = decodeDisplacement(texture2D(uDisplacementMap, vUv).rgb);
  vec3 right = vec3(texelSize.x, 0.0, 0.0)
    + decodeDisplacement(texture2D(uDisplacementMap, vUv + vec2(texel, 0.0)).rgb)
    - center;
  vec3 left = vec3(-texelSize.x, 0.0, 0.0)
    + decodeDisplacement(texture2D(uDisplacementMap, vUv + vec2(-texel, 0.0)).rgb)
    - center;
  vec3 up = vec3(0.0, texelSize.y, 0.0)
    + decodeDisplacement(texture2D(uDisplacementMap, vUv + vec2(0.0, texel)).rgb)
    - center;
  vec3 down = vec3(0.0, -texelSize.y, 0.0)
    + decodeDisplacement(texture2D(uDisplacementMap, vUv + vec2(0.0, -texel)).rgb)
    - center;

  vec3 normal = normalize(cross(right, up) + cross(up, left) + cross(left, down) + cross(down, right));
  if (
    dot(normal, normal) < 1e-6
    || normal.x != normal.x
    || normal.y != normal.y
    || normal.z != normal.z
  ) {
    normal = vec3(0.0, 0.0, 1.0);
  }

  gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
}
`;

const OCEAN_VERTEX_SHADER = glsl`
precision highp float;

varying vec2 vUv;
varying vec3 vWorldPosition;

uniform sampler2D uDisplacementMap;
uniform float uDisplacementScale;

vec3 decodeDisplacement(vec3 packed) {
  return vec3(packed.r, packed.b, packed.g);
}

void main() {
  vUv = uv;
  vec3 displacement = decodeDisplacement(texture2D(uDisplacementMap, uv).rgb) * uDisplacementScale;
  vec3 displacedPosition = position + displacement;
  vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const OCEAN_FRAGMENT_SHADER = glsl`
precision highp float;

varying vec2 vUv;
varying vec3 vWorldPosition;

uniform sampler2D uNormalMap;
uniform vec3 uOceanColor;
uniform vec3 uSkyColor;
uniform float uExposure;
uniform vec3 uSunDirection;
uniform float uNormalStrength;

void main() {
  vec3 normalTex = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
  normalTex.xy *= max(0.01, uNormalStrength);
  vec3 normal = normalize(normalTex);

  vec3 view = normalize(cameraPosition - vWorldPosition);
  float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - dot(normal, view), 0.0, 1.0), 5.0);

  float diffuse = clamp(dot(normal, normalize(uSunDirection)), 0.0, 1.0);
  vec3 sky = fresnel * uSkyColor;
  vec3 water = (1.0 - fresnel) * uOceanColor * uSkyColor * (0.35 + 0.65 * diffuse);

  vec3 color = 1.0 - exp(-(sky + water) * max(0.0, uExposure));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

const FALLBACK_VERTEX_SHADER = glsl`
precision highp float;

const float PI = 3.141592653589793;

varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWindDirectionDeg;
uniform float uWindSpeed;
uniform float uChoppiness;
uniform float uDisplacementScale;

void main() {
  vec3 base = position;
  vec2 windDir = vec2(cos(radians(uWindDirectionDeg)), sin(radians(uWindDirectionDeg)));
  float windRef = max(0.1, uWindSpeed);
  float kpWind = 9.81 * pow(0.84 / windRef, 2.0);
  float baseWavelength = clamp((2.0 * PI) / max(1e-4, kpWind), 12.0, 240.0);

  float dispZ = 0.0;
  vec2 dispXY = vec2(0.0);
  float slopeX = 0.0;
  float slopeY = 0.0;

  for (int i = 0; i < 6; i += 1) {
    float fi = float(i);
    float octave = pow(1.65, fi);
    float wavelength = max(2.0, baseWavelength / octave);
    float k = 2.0 * PI / wavelength;
    float omega = sqrt(9.81 * k);
    float jitter = (fi - 2.5) * 0.46;
    vec2 dir = normalize(vec2(
      windDir.x * cos(jitter) - windDir.y * sin(jitter),
      windDir.x * sin(jitter) + windDir.y * cos(jitter)
    ));

    float amp = uWaveAmplitude * (0.55 / octave) * (0.72 + 0.28 * sin(fi * 7.13 + 1.2));
    float speedGain = 0.6 + 0.04 * max(0.0, uWindSpeed);
    float theta = dot(dir, base.xy) * k + omega * uTime * speedGain + fi * 1.37;
    float s = sin(theta);
    float c = cos(theta);

    dispZ += amp * s;
    dispXY += max(0.0, uChoppiness) * amp * c * dir * 0.35;
    slopeX += amp * k * dir.x * c;
    slopeY += amp * k * dir.y * c;
  }

  float verticalScale = max(0.01, uDisplacementScale) * 0.45;
  vec3 displaced = vec3(base.xy + dispXY, base.z + dispZ * verticalScale);
  vec3 localNormal = normalize(vec3(-slopeX * verticalScale, -slopeY * verticalScale, 1.0));

  vNormal = normalize(normalMatrix * localNormal);
  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FALLBACK_FRAGMENT_SHADER = glsl`
precision highp float;

varying vec3 vNormal;
varying vec3 vWorldPosition;

uniform vec3 uOceanColor;
uniform vec3 uSkyColor;
uniform float uExposure;
uniform vec3 uSunDirection;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 view = normalize(cameraPosition - vWorldPosition);
  float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - dot(normal, view), 0.0, 1.0), 5.0);

  float diffuse = clamp(dot(normal, normalize(uSunDirection)), 0.0, 1.0);
  vec3 sky = fresnel * uSkyColor;
  vec3 water = (1.0 - fresnel) * uOceanColor * uSkyColor * (0.35 + 0.65 * diffuse);

  vec3 color = 1.0 - exp(-(sky + water) * max(0.0, uExposure));
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
    this.surfaceMaterial = null;
    this.fallbackMaterial = null;

    this.fullscreenScene = null;
    this.fullscreenCamera = null;
    this.fullscreenQuad = null;

    this.initialSpectrumMaterial = null;
    this.phaseMaterial = null;
    this.spectrumMaterial = null;
    this.horizontalSubtransformMaterial = null;
    this.verticalSubtransformMaterial = null;
    this.normalMaterial = null;

    this.initialSpectrumTarget = null;
    this.phasePingTarget = null;
    this.phasePongTarget = null;
    this.phaseActiveTarget = null;
    this.spectrumTarget = null;
    this.transformTargetA = null;
    this.transformTargetB = null;
    this.displacementTarget = null;
    this.normalTarget = null;
    this.phaseSeedTexture = null;

    this.defaultDisplacementTexture = createPlaceholderTexture([0, 0, 0, 255]);
    this.defaultNormalTexture = createPlaceholderTexture([128, 128, 255, 255]);

    this.rendererSupportsFft = this.resolveFftSupport();
    this.hardwareAccelerationEnabled = Boolean(this.params.hardwareAcceleration ?? true);
    this.lastBackendLog = "";

    this.fftResolution = 0;
    this.pendingSpectrumRebuild = true;
    this.randomSeed = Math.random() * 1000;

    this.timeSeconds = 0;
    this.statsAccumulatorSeconds = 0;
    this.vertexCount = 0;
    this.lastHeightRms = 0;
    this.lastSurfaceSpeed = 0;

    this.domainSize = new THREE.Vector2(220, 220);
    this.windVector = new THREE.Vector2(1, 0);
    this.oceanColor = new THREE.Color(getWaveOceanColor(this.params));
    this.skyColor = new THREE.Color(getWaveSkyColor(this.params));
  }

  init() {
    this.reset();
  }

  setVisible(visible) {
    if (this.surfaceMesh) {
      this.surfaceMesh.visible = visible;
    }
  }

  onTheme() {
    this.syncMaterialUniforms();
  }

  reset() {
    this.timeSeconds = 0;
    this.statsAccumulatorSeconds = WAVE_STATS_UPDATE_INTERVAL_SECONDS;
    this.randomSeed = Math.random() * 1000;
    this.pendingSpectrumRebuild = true;

    this.rebuildSurfaceMesh();

    if (this.rendererSupportsFft && this.hardwareAccelerationEnabled) {
      this.ensureFftResources(true);
      this.renderSpectrumFrame(0);
      this.logBackend("GPU FFT");
    } else if (this.rendererSupportsFft) {
      this.logBackend("GPU FFT paused (hardware acceleration off)");
    } else {
      this.logBackend("Static fallback (WebGL2 + float color buffer unavailable)");
    }

    this.syncMaterialUniforms();
    this.recomputeStatsEstimate();
    this.emitStats();
  }

  onWorldGeometryChanged() {
    this.rebuildSurfaceMesh();
    this.markSpectrumDirty();
    this.syncInstances();
    this.emitStats();
  }

  onBoundaryChanged() {
    this.onWorldGeometryChanged();
  }

  setHardwareAcceleration(enabled) {
    this.hardwareAccelerationEnabled = Boolean(enabled);
    this.params.hardwareAcceleration = this.hardwareAccelerationEnabled;
    if (this.surfaceMesh) {
      this.surfaceMesh.material = this.resolveSurfaceMaterial();
    }
    this.syncMaterialUniforms();
    if (this.hardwareAccelerationEnabled) {
      this.markSpectrumDirty();
      this.renderSpectrumFrame(0);
      this.logBackend("GPU FFT");
      return;
    }
    this.logBackend("GPU FFT paused (hardware acceleration off)");
  }

  isHardwareAccelerationActive() {
    return this.rendererSupportsFft && this.hardwareAccelerationEnabled;
  }

  setFftResolution(value) {
    const next = this.snapToNearestPowerOfTwo(
      Number(value),
      WAVE_MIN_FFT_RESOLUTION,
      WAVE_MAX_FFT_RESOLUTION,
      WAVE_DEFAULT_FFT_RESOLUTION,
    );
    if (next === this.resolveFftResolution()) {
      return;
    }
    this.params.fftResolution = next;
    this.reset();
  }

  setMeshResolution(value) {
    const next = THREE.MathUtils.clamp(
      Math.round(Number(value) || this.resolveMeshResolution()),
      WAVE_MIN_MESH_RESOLUTION,
      WAVE_MAX_MESH_RESOLUTION,
    );
    if (next === this.resolveMeshResolution()) {
      return;
    }
    this.params.meshResolution = next;
    this.rebuildSurfaceMesh();
    this.markSpectrumDirty();
    this.syncInstances();
    this.emitStats();
  }

  setWindSpeed(value) {
    this.setAndSyncDynamicParam("windSpeed", value, 0, 45);
  }

  setWindDirection(value) {
    this.setAndSyncDynamicParam("windDirection", value, 0, 360);
  }

  setWaveAmplitude(value) {
    this.setAndSyncDynamicParam("waveAmplitude", value, 0, 3.5);
  }

  setDirectionSpread(value) {
    this.setAndSyncDynamicParam("directionSpread", value, 0, 180);
  }

  setChoppiness(value) {
    this.setAndSyncDynamicParam("choppiness", value, 0, 1.6);
  }

  setDamping(value) {
    this.setAndSyncDynamicParam("damping", value, 0, 3);
  }

  setDisplacementScale(value) {
    this.setAndSyncDynamicParam("displacementScale", value, 0.1, 3);
  }

  setNormalStrength(value) {
    this.setAndSyncDynamicParam("normalStrength", value, 0.1, 3);
  }

  setExposure(value) {
    this.setAndSyncDynamicParam("exposure", value, 0.05, 2);
  }

  syncInstances() {
    this.syncMaterialUniforms();
    if (!this.rendererSupportsFft || !this.hardwareAccelerationEnabled) {
      this.recomputeStatsEstimate();
      return;
    }
    this.markSpectrumDirty();
    this.renderSpectrumFrame(0);
    this.recomputeStatsEstimate();
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) {
      this.emitStats();
      return;
    }

    const stepDt = Math.min(WAVE_MAX_STEP_SECONDS, dt);
    this.timeSeconds += stepDt;

    if (this.rendererSupportsFft && this.hardwareAccelerationEnabled) {
      this.renderSpectrumFrame(stepDt);
      this.recomputeStatsEstimate();
    } else if (this.fallbackMaterial) {
      this.fallbackMaterial.uniforms.uTime.value = this.timeSeconds;
      this.recomputeStatsEstimate();
    }

    this.statsAccumulatorSeconds += stepDt;
    if (this.statsAccumulatorSeconds >= WAVE_STATS_UPDATE_INTERVAL_SECONDS) {
      this.statsAccumulatorSeconds = 0;
      this.emitStats();
    }
  }

  renderSpectrumFrame(deltaTimeSeconds) {
    if (!this.rendererSupportsFft || !this.renderer || !this.hardwareAccelerationEnabled) {
      return;
    }

    this.ensureFftResources(false);
    if (
      !this.initialSpectrumTarget
      || !this.phasePingTarget
      || !this.phasePongTarget
      || !this.spectrumTarget
      || !this.displacementTarget
      || !this.normalTarget
    ) {
      return;
    }

    this.updateSpectrumUniforms();

    if (this.pendingSpectrumRebuild) {
      this.rebuildInitialSpectrum();
    }

    this.advancePhases(deltaTimeSeconds);
    this.buildSpectrum();
    this.runInverseFft();
    this.buildNormalMap();
    this.syncMaterialUniforms();
  }

  rebuildInitialSpectrum() {
    if (!this.initialSpectrumMaterial || !this.initialSpectrumTarget) {
      return;
    }
    this.renderFullscreen(this.initialSpectrumMaterial, this.initialSpectrumTarget);
    this.pendingSpectrumRebuild = false;
  }

  advancePhases(deltaTimeSeconds) {
    if (!this.phaseMaterial || !this.phasePingTarget || !this.phasePongTarget) {
      return;
    }
    const sourceTexture = this.phaseActiveTarget
      ? this.phaseActiveTarget.texture
      : this.phaseSeedTexture;
    if (!sourceTexture) {
      return;
    }
    const target = this.phaseActiveTarget === this.phasePingTarget
      ? this.phasePongTarget
      : this.phasePingTarget;

    this.phaseMaterial.uniforms.uPhases.value = sourceTexture;
    this.phaseMaterial.uniforms.uDeltaTime.value = Math.max(0, Number(deltaTimeSeconds) || 0);
    this.renderFullscreen(this.phaseMaterial, target);
    this.phaseActiveTarget = target;
  }

  buildSpectrum() {
    if (!this.spectrumMaterial || !this.spectrumTarget || !this.initialSpectrumTarget) {
      return;
    }
    this.spectrumMaterial.uniforms.uPhases.value = this.phaseActiveTarget
      ? this.phaseActiveTarget.texture
      : this.phaseSeedTexture;
    this.spectrumMaterial.uniforms.uInitialSpectrum.value = this.initialSpectrumTarget.texture;
    this.renderFullscreen(this.spectrumMaterial, this.spectrumTarget);
  }

  runInverseFft() {
    if (
      !this.horizontalSubtransformMaterial
      || !this.verticalSubtransformMaterial
      || !this.spectrumTarget
      || !this.transformTargetA
      || !this.transformTargetB
      || !this.displacementTarget
    ) {
      return;
    }

    const iterationsPerAxis = Math.round(Math.log2(this.fftResolution));
    if (!Number.isFinite(iterationsPerAxis) || iterationsPerAxis <= 0) {
      return;
    }
    const totalIterations = iterationsPerAxis * 2;
    let sourceTexture = this.spectrumTarget.texture;

    for (let i = 0; i < totalIterations; i += 1) {
      const isHorizontal = i < iterationsPerAxis;
      const stage = (i % iterationsPerAxis) + 1;
      const material = isHorizontal
        ? this.horizontalSubtransformMaterial
        : this.verticalSubtransformMaterial;
      material.uniforms.uInput.value = sourceTexture;
      material.uniforms.uSubtransformSize.value = 2 ** stage;

      const target = i === totalIterations - 1
        ? this.displacementTarget
        : (i % 2 === 0 ? this.transformTargetA : this.transformTargetB);

      this.renderFullscreen(material, target);
      sourceTexture = target.texture;
    }
  }

  buildNormalMap() {
    if (!this.normalMaterial || !this.normalTarget || !this.displacementTarget) {
      return;
    }
    this.normalMaterial.uniforms.uDisplacementMap.value = this.displacementTarget.texture;
    this.normalMaterial.uniforms.uDisplacementScale.value = this.getEffectiveDisplacementScale();
    this.renderFullscreen(this.normalMaterial, this.normalTarget);
  }

  ensureFftResources(forceRebuild = false) {
    if (!this.rendererSupportsFft) {
      return;
    }

    const nextResolution = this.resolveFftResolution();
    const needsRebuild = forceRebuild
      || !this.initialSpectrumTarget
      || nextResolution !== this.fftResolution;
    if (!needsRebuild) {
      return;
    }

    this.fftResolution = nextResolution;
    this.disposeFftResources();
    this.initializeFullscreenPassHelpers();

    this.initialSpectrumTarget = createRenderTarget(nextResolution, nextResolution, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });
    this.phasePingTarget = createRenderTarget(nextResolution, nextResolution);
    this.phasePongTarget = createRenderTarget(nextResolution, nextResolution);
    this.spectrumTarget = createRenderTarget(nextResolution, nextResolution);
    this.transformTargetA = createRenderTarget(nextResolution, nextResolution);
    this.transformTargetB = createRenderTarget(nextResolution, nextResolution);
    this.displacementTarget = createRenderTarget(nextResolution, nextResolution, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.normalTarget = createRenderTarget(nextResolution, nextResolution, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this.phaseSeedTexture = createRandomPhaseTexture(nextResolution, this.randomSeed);
    this.phaseActiveTarget = null;
    this.pendingSpectrumRebuild = true;

    this.createOrUpdateFftMaterials();
    this.updateSpectrumUniforms();
  }

  initializeFullscreenPassHelpers() {
    if (this.fullscreenScene && this.fullscreenCamera && this.fullscreenQuad) {
      return;
    }

    this.fullscreenScene = new THREE.Scene();
    this.fullscreenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fullscreenQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.fullscreenScene.add(this.fullscreenQuad);
  }

  createOrUpdateFftMaterials() {
    if (!this.initialSpectrumMaterial) {
      this.initialSpectrumMaterial = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader: INITIAL_SPECTRUM_FRAGMENT_SHADER,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uResolution: { value: this.fftResolution },
          uDomainSize: { value: new THREE.Vector2(220, 220) },
          uWind: { value: new THREE.Vector2(1, 0) },
          uAmplitude: { value: 1.8 },
          uDirectionalSpread: { value: 8 },
          uShortWaveDamping: { value: 0.12 },
        },
      });
    }

    if (!this.phaseMaterial) {
      this.phaseMaterial = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader: PHASE_FRAGMENT_SHADER,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uPhases: { value: this.phaseSeedTexture },
          uDeltaTime: { value: 0 },
          uResolution: { value: this.fftResolution },
          uDomainSize: { value: new THREE.Vector2(220, 220) },
        },
      });
    }

    if (!this.spectrumMaterial) {
      this.spectrumMaterial = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader: SPECTRUM_FRAGMENT_SHADER,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uResolution: { value: this.fftResolution },
          uDomainSize: { value: new THREE.Vector2(220, 220) },
          uPhases: { value: this.phaseSeedTexture },
          uInitialSpectrum: { value: null },
          uChoppiness: { value: 1.2 },
        },
      });
    }

    if (!this.horizontalSubtransformMaterial) {
      this.horizontalSubtransformMaterial = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader: `#define HORIZONTAL\n${SUBTRANSFORM_FRAGMENT_SHADER}`,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uInput: { value: null },
          uTransformSize: { value: this.fftResolution },
          uSubtransformSize: { value: 2 },
        },
      });
    }

    if (!this.verticalSubtransformMaterial) {
      this.verticalSubtransformMaterial = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader: SUBTRANSFORM_FRAGMENT_SHADER,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uInput: { value: null },
          uTransformSize: { value: this.fftResolution },
          uSubtransformSize: { value: 2 },
        },
      });
    }

    if (!this.normalMaterial) {
      this.normalMaterial = new THREE.ShaderMaterial({
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader: NORMAL_MAP_FRAGMENT_SHADER,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        uniforms: {
          uDisplacementMap: { value: null },
          uResolution: { value: this.fftResolution },
          uDomainSize: { value: new THREE.Vector2(220, 220) },
          uDisplacementScale: { value: 1.0 },
        },
      });
    }

    this.horizontalSubtransformMaterial.uniforms.uTransformSize.value = this.fftResolution;
    this.verticalSubtransformMaterial.uniforms.uTransformSize.value = this.fftResolution;
  }

  rebuildSurfaceMesh() {
    const meshResolution = this.resolveMeshResolution();
    const segments = Math.max(1, meshResolution - 1);
    const width = Math.max(8, Number(this.params.worldSizeX) || 8);
    const height = Math.max(8, Number(this.params.worldSizeY) || 8);
    const geometry = new THREE.PlaneGeometry(width, height, segments, segments);

    if (this.surfaceMesh) {
      this.scene.remove(this.surfaceMesh);
      this.surfaceGeometry?.dispose?.();
    }

    this.surfaceGeometry = geometry;
    this.vertexCount = geometry.getAttribute("position").count;
    this.surfaceMesh = new THREE.Mesh(geometry, this.resolveSurfaceMaterial());
    this.surfaceMesh.frustumCulled = false;
    this.scene.add(this.surfaceMesh);

    this.syncMaterialUniforms();
  }

  resolveSurfaceMaterial() {
    if (!this.rendererSupportsFft || !this.hardwareAccelerationEnabled) {
      return this.getFallbackSurfaceMaterial();
    }

    if (!this.surfaceMaterial) {
      this.surfaceMaterial = new THREE.ShaderMaterial({
        vertexShader: OCEAN_VERTEX_SHADER,
        fragmentShader: OCEAN_FRAGMENT_SHADER,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        side: THREE.FrontSide,
        toneMapped: false,
        uniforms: {
          uDisplacementMap: { value: this.defaultDisplacementTexture },
          uNormalMap: { value: this.defaultNormalTexture },
          uDisplacementScale: { value: 1.0 },
          uOceanColor: { value: new THREE.Color(getWaveOceanColor(this.params)) },
          uSkyColor: { value: new THREE.Color(getWaveSkyColor(this.params)) },
          uExposure: { value: 0.36 },
          uSunDirection: { value: new THREE.Vector3(-0.55, 0.35, 1.0).normalize() },
          uNormalStrength: { value: 1.0 },
        },
      });
    }

    return this.surfaceMaterial;
  }

  getFallbackSurfaceMaterial() {
    if (!this.fallbackMaterial) {
      this.fallbackMaterial = new THREE.ShaderMaterial({
        vertexShader: FALLBACK_VERTEX_SHADER,
        fragmentShader: FALLBACK_FRAGMENT_SHADER,
        depthTest: true,
        depthWrite: true,
        transparent: false,
        side: THREE.FrontSide,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uWaveAmplitude: { value: 2.0 },
          uWindDirectionDeg: { value: 35.0 },
          uWindSpeed: { value: 12.0 },
          uChoppiness: { value: 1.2 },
          uDisplacementScale: { value: 1.0 },
          uOceanColor: { value: new THREE.Color(getWaveOceanColor(this.params)) },
          uSkyColor: { value: new THREE.Color(getWaveSkyColor(this.params)) },
          uExposure: { value: 0.36 },
          uSunDirection: { value: new THREE.Vector3(-0.55, 0.35, 1.0).normalize() },
        },
      });
    }
    return this.fallbackMaterial;
  }

  updateSpectrumUniforms() {
    const width = Math.max(8, Number(this.params.worldSizeX) || 8);
    const height = Math.max(8, Number(this.params.worldSizeY) || 8);
    this.domainSize.set(width, height);

    const windSpeed = Math.max(0, Number(this.params.windSpeed) || 0);
    const windDirectionDeg = Number(this.params.windDirection) || 0;
    const windDirectionRad = THREE.MathUtils.degToRad(windDirectionDeg);
    this.windVector.set(Math.cos(windDirectionRad) * windSpeed, Math.sin(windDirectionRad) * windSpeed);
    if (this.windVector.lengthSq() < 1e-6) {
      this.windVector.set(0.001, 0);
    }

    const amplitude = THREE.MathUtils.clamp(Number(this.params.waveAmplitude) || 0, 0, 3.5);
    const directionSpreadDeg = THREE.MathUtils.clamp(Number(this.params.directionSpread) || 0, 0, 180);
    const spreadNormalized = directionSpreadDeg / 180;
    const spreadExponent = THREE.MathUtils.lerp(14, 0.9, spreadNormalized);
    const dampingBase = Math.max(0, Number(this.params.damping) || 0);
    const resolutionRatio = Math.max(1, this.resolveFftResolution() / WAVE_DEFAULT_FFT_RESOLUTION);
    const shortWaveDamping = THREE.MathUtils.clamp(
      dampingBase * Math.pow(resolutionRatio, 0.5),
      0,
      2.4,
    );

    if (this.initialSpectrumMaterial) {
      this.initialSpectrumMaterial.uniforms.uResolution.value = this.fftResolution;
      this.initialSpectrumMaterial.uniforms.uDomainSize.value.copy(this.domainSize);
      this.initialSpectrumMaterial.uniforms.uWind.value.copy(this.windVector);
      this.initialSpectrumMaterial.uniforms.uAmplitude.value = amplitude;
      this.initialSpectrumMaterial.uniforms.uDirectionalSpread.value = spreadExponent;
      this.initialSpectrumMaterial.uniforms.uShortWaveDamping.value = shortWaveDamping;
    }

    if (this.phaseMaterial) {
      this.phaseMaterial.uniforms.uResolution.value = this.fftResolution;
      this.phaseMaterial.uniforms.uDomainSize.value.copy(this.domainSize);
    }

    if (this.spectrumMaterial) {
      this.spectrumMaterial.uniforms.uResolution.value = this.fftResolution;
      this.spectrumMaterial.uniforms.uDomainSize.value.copy(this.domainSize);
      this.spectrumMaterial.uniforms.uChoppiness.value = THREE.MathUtils.clamp(
        Number(this.params.choppiness) || 0,
        0,
        1.6,
      );
    }

    if (this.normalMaterial) {
      this.normalMaterial.uniforms.uResolution.value = this.fftResolution;
      this.normalMaterial.uniforms.uDomainSize.value.copy(this.domainSize);
      this.normalMaterial.uniforms.uDisplacementScale.value = this.getEffectiveDisplacementScale();
    }
  }

  syncMaterialUniforms() {
    this.oceanColor.set(getWaveOceanColor(this.params));
    this.skyColor.set(getWaveSkyColor(this.params));
    const displacementScale = this.getEffectiveDisplacementScale();

    if (this.surfaceMaterial) {
      this.surfaceMaterial.uniforms.uDisplacementMap.value = this.displacementTarget?.texture || this.defaultDisplacementTexture;
      this.surfaceMaterial.uniforms.uNormalMap.value = this.normalTarget?.texture || this.defaultNormalTexture;
      this.surfaceMaterial.uniforms.uDisplacementScale.value = displacementScale;
      this.surfaceMaterial.uniforms.uNormalStrength.value = Math.max(0.1, Number(this.params.normalStrength) || 1);
      this.surfaceMaterial.uniforms.uExposure.value = Math.max(0.05, Number(this.params.exposure) || 0.36);
      this.surfaceMaterial.uniforms.uOceanColor.value.copy(this.oceanColor);
      this.surfaceMaterial.uniforms.uSkyColor.value.copy(this.skyColor);
    }

    if (this.fallbackMaterial) {
      this.fallbackMaterial.uniforms.uWaveAmplitude.value = THREE.MathUtils.clamp(
        Number(this.params.waveAmplitude) || 0,
        0,
        3.5,
      );
      this.fallbackMaterial.uniforms.uWindDirectionDeg.value = Number(this.params.windDirection) || 0;
      this.fallbackMaterial.uniforms.uWindSpeed.value = Math.max(0, Number(this.params.windSpeed) || 0);
      this.fallbackMaterial.uniforms.uChoppiness.value = THREE.MathUtils.clamp(
        Number(this.params.choppiness) || 0,
        0,
        1.6,
      );
      this.fallbackMaterial.uniforms.uDisplacementScale.value = displacementScale;
      this.fallbackMaterial.uniforms.uExposure.value = Math.max(0.05, Number(this.params.exposure) || 0.36);
      this.fallbackMaterial.uniforms.uOceanColor.value.copy(this.oceanColor);
      this.fallbackMaterial.uniforms.uSkyColor.value.copy(this.skyColor);
    }
  }

  getEffectiveDisplacementScale() {
    const baseScale = THREE.MathUtils.clamp(Number(this.params.displacementScale) || 1, 0.1, 3.0);
    if (!this.isHardwareAccelerationActive()) {
      return baseScale;
    }
    const resolutionRatio = Math.max(1, this.resolveFftResolution() / WAVE_DEFAULT_FFT_RESOLUTION);
    const resolutionCompensation = 1.0 / Math.sqrt(resolutionRatio);
    return baseScale * resolutionCompensation;
  }

  renderFullscreen(material, target) {
    if (!this.renderer || !this.fullscreenScene || !this.fullscreenCamera || !this.fullscreenQuad) {
      return;
    }

    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousXrState = renderer.xr ? renderer.xr.enabled : false;

    if (renderer.xr) {
      renderer.xr.enabled = false;
    }
    renderer.autoClear = false;
    this.fullscreenQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.fullscreenScene, this.fullscreenCamera);
    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    if (renderer.xr) {
      renderer.xr.enabled = previousXrState;
    }
  }

  resolveFftSupport() {
    if (!this.renderer) {
      return false;
    }
    if (!this.renderer.capabilities?.isWebGL2) {
      return false;
    }

    let gl = null;
    try {
      gl = this.renderer.getContext?.();
    } catch (_error) {
      gl = null;
    }
    if (!gl) {
      return false;
    }
    return Boolean(gl.getExtension("EXT_color_buffer_float"));
  }

  resolveFftResolution() {
    return this.snapToNearestPowerOfTwo(
      Number(this.params.fftResolution),
      WAVE_MIN_FFT_RESOLUTION,
      WAVE_MAX_FFT_RESOLUTION,
      WAVE_DEFAULT_FFT_RESOLUTION,
    );
  }

  resolveMeshResolution() {
    const raw = Number(this.params.meshResolution ?? this.params.gridResolution);
    return THREE.MathUtils.clamp(
      Math.round(raw || WAVE_DEFAULT_MESH_RESOLUTION),
      WAVE_MIN_MESH_RESOLUTION,
      WAVE_MAX_MESH_RESOLUTION,
    );
  }

  snapToNearestPowerOfTwo(value, min, max, fallback) {
    const finite = Number.isFinite(value) ? value : fallback;
    const clamped = THREE.MathUtils.clamp(Math.round(finite), min, max);

    let lower = min;
    while (lower * 2 <= clamped) {
      lower *= 2;
    }
    const upper = Math.min(max, lower * 2);

    if (clamped === lower || upper === lower) {
      return lower;
    }
    return (upper - clamped) < (clamped - lower) ? upper : lower;
  }

  setAndSyncDynamicParam(key, rawValue, min, max) {
    const next = this.clampNumericParam(rawValue, min, max, this.params[key]);
    if (Math.abs(Number(this.params[key]) - next) <= 1e-9) {
      return;
    }
    this.params[key] = next;
    this.markSpectrumDirty();
    this.syncInstances();
  }

  clampNumericParam(rawValue, min, max, fallbackValue = min) {
    const numeric = Number(rawValue);
    const fallback = Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : min;
    const finite = Number.isFinite(numeric) ? numeric : fallback;
    return THREE.MathUtils.clamp(finite, min, max);
  }

  markSpectrumDirty() {
    this.pendingSpectrumRebuild = true;
  }

  recomputeStatsEstimate() {
    const windSpeed = Math.max(0, Number(this.params.windSpeed) || 0);
    const amplitude = THREE.MathUtils.clamp(Number(this.params.waveAmplitude) || 0, 0, 3.5);
    const spread = THREE.MathUtils.clamp(Number(this.params.directionSpread) || 0, 0, 180) / 180;
    const damping = Math.max(0, Number(this.params.damping) || 0);
    const choppiness = Math.max(0, Number(this.params.choppiness) || 0);
    const displacementScale = this.getEffectiveDisplacementScale();
    const resolutionScale = Math.sqrt(this.resolveFftResolution() / WAVE_DEFAULT_FFT_RESOLUTION);

    const windGain = Math.sqrt(Math.max(0.05, windSpeed / 12));
    const spreadGain = THREE.MathUtils.lerp(1.2, 0.8, spread);
    const dampingGain = Math.exp(-0.6 * damping);
    const baseRms = amplitude * 0.22 * windGain * spreadGain * dampingGain * resolutionScale;

    this.lastHeightRms = Math.max(0, baseRms * displacementScale);
    const windRef = Math.max(0.1, windSpeed);
    const peakK = WAVE_GRAVITY * ((0.84 / windRef) ** 2);
    const omega = Math.sqrt(WAVE_GRAVITY * peakK);
    this.lastSurfaceSpeed = Math.max(0, this.lastHeightRms * omega * (1 + 0.35 * choppiness));
  }

  emitStats() {
    if (typeof this.onStats !== "function") {
      return;
    }
    this.onStats({
      gridNodes: this.vertexCount,
      heightRms: this.lastHeightRms,
      surfaceSpeed: this.lastSurfaceSpeed,
    });
  }

  getColorRange() {
    return { min: 0, max: 1 };
  }

  disposeFftResources() {
    this.disposeRenderTarget(this.initialSpectrumTarget);
    this.disposeRenderTarget(this.phasePingTarget);
    this.disposeRenderTarget(this.phasePongTarget);
    this.disposeRenderTarget(this.spectrumTarget);
    this.disposeRenderTarget(this.transformTargetA);
    this.disposeRenderTarget(this.transformTargetB);
    this.disposeRenderTarget(this.displacementTarget);
    this.disposeRenderTarget(this.normalTarget);

    this.initialSpectrumTarget = null;
    this.phasePingTarget = null;
    this.phasePongTarget = null;
    this.phaseActiveTarget = null;
    this.spectrumTarget = null;
    this.transformTargetA = null;
    this.transformTargetB = null;
    this.displacementTarget = null;
    this.normalTarget = null;

    this.phaseSeedTexture?.dispose?.();
    this.phaseSeedTexture = null;
  }

  disposeRenderTarget(target) {
    if (!target) {
      return;
    }
    target.texture?.dispose?.();
    target.dispose?.();
  }

  logBackend(reason) {
    const state = this.rendererSupportsFft ? `GPU FFT (${reason})` : reason;
    if (state === this.lastBackendLog) {
      return;
    }
    this.lastBackendLog = state;
    console.log(`${WAVE_GPU_BACKEND_LOG_PREFIX} ${state}.`);
  }
}

function buildWaveColormapConfig({
  continuousColormapOptions,
}) {
  const options = Array.isArray(continuousColormapOptions) && continuousColormapOptions.length > 0
    ? continuousColormapOptions
    : [{ key: "none", label: "None" }];
  return {
    visible: false,
    value: options[0].key,
    options,
    setValue() {},
    legend: null,
  };
}

function normalizeHexColor(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text;
  }
  return fallback;
}

function getWaveOceanColor(params) {
  return normalizeHexColor(params?.solidColorOcean ?? "#0b3a74", "#0b3a74");
}

function getWaveSkyColor(params) {
  return normalizeHexColor(params?.solidColorSky ?? "#7dc3ff", "#7dc3ff");
}

function createPlaceholderTexture(rgba = [0, 0, 0, 255]) {
  const data = new Uint8Array(rgba);
  const texture = new THREE.DataTexture(
    data,
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (Object.prototype.hasOwnProperty.call(texture, "colorSpace") && THREE.NoColorSpace) {
    texture.colorSpace = THREE.NoColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

function createRandomPhaseTexture(resolution, seedBase = 0) {
  const size = Math.max(1, Math.floor(resolution));
  const data = new Float32Array(size * size * 4);
  let seed = (Math.floor(seedBase * 100000) ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < size * size; i += 1) {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    const random = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    data[i * 4] = random * WAVE_TWO_PI;
    data[i * 4 + 1] = 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 0;
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  if (Object.prototype.hasOwnProperty.call(texture, "colorSpace") && THREE.NoColorSpace) {
    texture.colorSpace = THREE.NoColorSpace;
  }
  texture.needsUpdate = true;
  return texture;
}

function createRenderTarget(width, height, overrides = {}) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.FloatType,
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    ...overrides,
  });
  target.texture.generateMipmaps = false;
  if (Object.prototype.hasOwnProperty.call(target.texture, "colorSpace") && THREE.NoColorSpace) {
    target.texture.colorSpace = THREE.NoColorSpace;
  }
  return target;
}
