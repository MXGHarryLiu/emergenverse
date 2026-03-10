import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";

const params = {
  boidCount: 220,
  boidScale: 1.4,
  perceptionRadius: 18,
  separationDistance: 8,
  maxSpeed: 8,
  minSpeed: 2.5,
  maxAccel: 6,
  alignmentWeight: 1.0,
  cohesionWeight: 0.9,
  separationWeight: 1.35,
  worldSizeX: 120,
  worldSizeY: 120,
  worldSizeZ: 120,
  boundaryMode: "cyclic",
  colorMode: "speed",
  colormap: "turbo",
  solidColor: "#4cd3b6",
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  showBounds: true,
  cameraLocked: false,
  projectionMode: "perspective",
  keyboardMoveSpeed: 42,
  paused: false,
};

const cameraDefaults = {
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  cameraLocked: false,
  projectionMode: "perspective",
};

const dom = {
  appShell: document.querySelector(".app-shell"),
  leftPanel: document.getElementById("left-panel"),
  rightPanel: document.getElementById("right-panel"),
  hideLeftPanel: document.getElementById("hide-left-panel"),
  hideRightPanel: document.getElementById("hide-right-panel"),
  showLeftPanel: document.getElementById("show-left-panel"),
  showRightPanel: document.getElementById("show-right-panel"),
  leftResizer: document.getElementById("left-resizer"),
  rightResizer: document.getElementById("right-resizer"),
  sceneHost: document.getElementById("scene-host"),
  frameSize: document.getElementById("frame-size"),
  chartCount: document.getElementById("chart-count"),
  chartSpeed: document.getElementById("chart-speed"),
  chartNeighbors: document.getElementById("chart-neighbors"),
  fpsLive: document.getElementById("fps-live"),
  chartCountLive: document.getElementById("chart-count-live"),
  chartSpeedLive: document.getElementById("chart-speed-live"),
  chartNeighborsLive: document.getElementById("chart-neighbors-live"),
  chartToggles: document.querySelectorAll("[data-chart-toggle]"),
  appletTabs: document.querySelectorAll("[data-applet-item]"),
  runState: document.getElementById("run-state"),
  togglePause: document.getElementById("toggle-pause"),
  resetSim: document.getElementById("reset-sim"),
  resetCamera: document.getElementById("reset-camera"),
  homeCamera: document.getElementById("home-camera"),
  showBounds: document.getElementById("show-bounds"),
  cameraLocked: document.getElementById("camera-locked"),
  boundaryMode: document.getElementById("boundary-mode"),
  colorMode: document.getElementById("color-mode"),
  colormap: document.getElementById("colormap"),
  solidColor: document.getElementById("solid-color"),
  colormapControlWrap: document.getElementById("colormap-control-wrap"),
  singleColorWrap: document.getElementById("single-color-wrap"),
  colormapLegend: document.getElementById("colormap-legend"),
  colormapLegendBar: document.getElementById("colormap-legend-bar"),
  colormapCmin: document.getElementById("colormap-cmin"),
  colormapCmax: document.getElementById("colormap-cmax"),
  cameraProjectionToggle: document.getElementById("camera-projection-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  themeToggleLabel: document.getElementById("theme-toggle-label"),
  themeToggleIcon: document.getElementById("theme-toggle-icon"),
  controlsInfoOpen: document.getElementById("controls-info-open"),
  controlsInfoClose: document.getElementById("controls-info-close"),
  controlsInfoBackdrop: document.getElementById("controls-info-backdrop"),
  controlSectionToggles: document.querySelectorAll("[data-control-toggle]"),
  cameraPosX: document.getElementById("camera-pos-x"),
  cameraPosY: document.getElementById("camera-pos-y"),
  cameraPosZ: document.getElementById("camera-pos-z"),
  cameraRoll: document.getElementById("camera-roll"),
  cameraPitch: document.getElementById("camera-pitch"),
  cameraYaw: document.getElementById("camera-yaw"),
};

const uiState = {
  leftPanelVisible: true,
  rightPanelVisible: true,
};

const panelWidthState = {
  left: 270,
  right: 320,
};

const compactRangeRegistry = new Map();
const compactSectionState = {};

let themeManager = null;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-label", "3D boids simulation canvas");
dom.sceneHost.appendChild(renderer.domElement);

const cameraController = createCameraController({
  sceneHost: renderer.domElement,
  params,
  telemetry: {
    x: dom.cameraPosX,
    y: dom.cameraPosY,
    z: dom.cameraPosZ,
    roll: dom.cameraRoll,
    pitch: dom.cameraPitch,
    yaw: dom.cameraYaw,
  },
  onFovChange: (value) => {
    setControlValue("camera-fov", value, "camera-fov-value", (next) => `${Math.round(next)}°`);
  },
});

const perspectiveCamera = cameraController.perspectiveCamera;
const orthographicCamera = cameraController.orthographicCamera;
const controls = cameraController.controls;
const onKeyDown = cameraController.onKeyDown;
const onKeyUp = cameraController.onKeyUp;

const boidGeometry = new THREE.ConeGeometry(0.7, 2.6, 10);
boidGeometry.rotateX(Math.PI / 2);
const boidMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  specular: 0x222222,
  shininess: 34,
  flatShading: true,
  side: THREE.DoubleSide,
  // For InstancedMesh setColorAt(), rely on instancing color, not geometry vertex color.
  vertexColors: false,
  toneMapped: false,
});

const boids = [];
let boidMesh = null;
const tempObject = new THREE.Object3D();
const forwardVector = new THREE.Vector3(0, 0, 1);

const world = createWorldManager({
  params,
  getBoids: () => boids,
  onWorldGeometryChanged: () => updateOrthographicCamera(false),
});
const scene = world.scene;

const separationDelta = new THREE.Vector3();
const alignment = new THREE.Vector3();
const cohesion = new THREE.Vector3();
const separation = new THREE.Vector3();
const velocityDir = new THREE.Vector3();

const instanceColor = new THREE.Color();
const colormapLerpA = new THREE.Color();
const colormapLerpB = new THREE.Color();
const solidColorValue = new THREE.Color(params.solidColor);

const colormapStops = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
  viridis: [0x440154, 0x482878, 0x3e4a89, 0x31688e, 0x26828e, 0x1f9e89, 0x35b779, 0x6ece58, 0xb5de2b, 0xfee825],
  plasma: [0x0d0887, 0x5b02a3, 0x9a179b, 0xcb4679, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921],
  magma: [0x000004, 0x180f3d, 0x440f76, 0x721f81, 0x9f2f7f, 0xcd4071, 0xf1605d, 0xfd9668, 0xfec98d, 0xfcfdbf],
  inferno: [0x000004, 0x1b0c41, 0x4a0c6b, 0x781c6d, 0xa52c60, 0xcf4446, 0xed6925, 0xfb9b06, 0xf7d13d, 0xfcffa4],
  cividis: [0x00204d, 0x213f6f, 0x3f5f7f, 0x5d7f87, 0x7a9f8a, 0x99bf88, 0xb9dd7f, 0xdbf06a, 0xfff44f],
  coolwarm: [0x3b4cc0, 0x688aef, 0x98b9ff, 0xc9d7f0, 0xece5dc, 0xf7c7a6, 0xee8468, 0xd34b44, 0xb40426],
  greys: [0x111111, 0x3a3a3a, 0x5f5f5f, 0x878787, 0xafafaf, 0xd3d3d3, 0xf2f2f2],
};

const colormaps = buildColormapLUT(colormapStops);
const colormapGradients = buildColormapGradients(colormapStops);

const speedHistory = [];
const countHistory = [];
const neighborHistory = [];
const chartMaxPoints = 160;
let chartFrameCounter = 0;
let fpsSmoothed = 0;
let fpsUiAccumulator = 0;

setPerspectiveCameraFromParams(false);
updateOrthographicCamera(true);
applyCameraInteractivity();
rebuildBoundsAndGrid();
spawnBoids(params.boidCount);
setupCompactSectionSliders();
setupControls();
setupPanelToggles();
setupPanelResizers();
setupControlSectionCollapses();
setupThemeToggle();
setupControlsInfoPopup();
setupTrendCharts();
setupChartCollapses();
handleViewportResize();

const resizeObserver = new ResizeObserver(() => handleViewportResize());
resizeObserver.observe(dom.sceneHost);
window.addEventListener("resize", handleViewportResize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

const clock = new THREE.Clock();
animate();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  updateFpsMetric(dt);
  if (!params.paused) {
    stepSimulation(dt);
  }

  updateKeyboardTranslation(dt);

  controls.update();
  updateCameraTelemetry();

  renderer.render(scene, cameraController.getActiveCamera());
}

function updateFpsMetric(dt) {
  if (!dom.fpsLive || dt <= 0) {
    return;
  }

  const fps = 1 / dt;
  fpsSmoothed = fpsSmoothed === 0 ? fps : fpsSmoothed * 0.9 + fps * 0.1;
  fpsUiAccumulator += dt;
  if (fpsUiAccumulator < 0.2) {
    return;
  }

  fpsUiAccumulator = 0;
  dom.fpsLive.textContent = `${fpsSmoothed.toFixed(1)}`;
}

function spawnBoids(count) {
  boids.length = 0;

  const spawnRangeX = params.worldSizeX * 0.9;
  const spawnRangeY = params.worldSizeY * 0.9;
  const spawnRangeZ = params.worldSizeZ * 0.9;

  for (let i = 0; i < count; i += 1) {
    const startVelocity = randomDirection().multiplyScalar(
      THREE.MathUtils.randFloat(params.maxSpeed * 0.45, params.maxSpeed * 0.95),
    );

    boids.push({
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

  rebuildBoidMeshForCurrentBoids();

  resetTrendCharts();
  syncBoidInstances();
  updateStats(0, 0);
}

function rebuildBoidMeshForCurrentBoids() {
  if (boidMesh) {
    scene.remove(boidMesh);
    boidMesh = null;
  }

  const capacity = Math.max(boids.length, 1);
  boidMesh = new THREE.InstancedMesh(boidGeometry, boidMaterial, capacity);
  boidMesh.count = boids.length;
  boidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boidMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  boidMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < capacity; i += 1) {
    boidMesh.instanceColor.setXYZ(i, 1, 1, 1);
  }
  boidMaterial.needsUpdate = true;
  scene.add(boidMesh);
}

function stepSimulation(dt) {
  const perceptionSq = params.perceptionRadius * params.perceptionRadius;
  const separationSq = params.separationDistance * params.separationDistance;
  const usingLostBounds = params.boundaryMode === "lost";

  let speedSum = 0;
  let neighborSum = 0;

  for (let i = 0; i < boids.length; i += 1) {
    const boid = boids[i];

    alignment.set(0, 0, 0);
    cohesion.set(0, 0, 0);
    separation.set(0, 0, 0);

    let neighborCount = 0;
    let separationCount = 0;

    for (let j = 0; j < boids.length; j += 1) {
      if (j === i) {
        continue;
      }

      const other = boids[j];
      const distSq = boid.position.distanceToSquared(other.position);

      if (distSq < perceptionSq) {
        alignment.add(other.velocity);
        cohesion.add(other.position);
        neighborCount += 1;
      }

      if (distSq < separationSq && distSq > 0.000001) {
        separationDelta.subVectors(boid.position, other.position);
        separationDelta.divideScalar(distSq);
        separation.add(separationDelta);
        separationCount += 1;
      }
    }

    boid.neighbors = neighborCount;
    boid.acceleration.set(0, 0, 0);

    if (neighborCount > 0) {
      alignment.divideScalar(neighborCount);
      if (alignment.lengthSq() > 0) {
        alignment.setLength(params.maxSpeed);
        alignment.sub(boid.velocity);
        limitVector(alignment, params.maxAccel);
        alignment.multiplyScalar(params.alignmentWeight);
        boid.acceleration.add(alignment);
      }

      cohesion.divideScalar(neighborCount);
      cohesion.sub(boid.position);
      if (cohesion.lengthSq() > 0) {
        cohesion.setLength(params.maxSpeed);
        cohesion.sub(boid.velocity);
        limitVector(cohesion, params.maxAccel);
        cohesion.multiplyScalar(params.cohesionWeight);
        boid.acceleration.add(cohesion);
      }
    }

    if (separationCount > 0) {
      separation.divideScalar(separationCount);
      if (separation.lengthSq() > 0) {
        separation.setLength(params.maxSpeed);
        separation.sub(boid.velocity);
        limitVector(separation, params.maxAccel);
        separation.multiplyScalar(params.separationWeight);
        boid.acceleration.add(separation);
      }
    }

    boid.velocity.addScaledVector(boid.acceleration, dt);
    const minSpeed = Math.min(params.minSpeed, params.maxSpeed * 0.85);
    enforceSpeedBounds(boid.velocity, minSpeed, params.maxSpeed);
    boid.position.addScaledVector(boid.velocity, dt);

    const activeBoid = applyBoundaryConditions(boid);
    if (!activeBoid) {
      continue;
    }

    speedSum += boid.velocity.length();
    neighborSum += boid.neighbors;
  }

  if (usingLostBounds) {
    removeLostBoids();
  }

  syncBoidInstances();
  updateStats(speedSum, neighborSum);
}

function syncBoidInstances() {
  const halfZ = params.worldSizeZ * 0.5;
  const colorBounds =
    params.colorMode === "none" ? null : getColorScalarBounds(halfZ);

  for (let i = 0; i < boids.length; i += 1) {
    const boid = boids[i];

    velocityDir.copy(boid.velocity);
    if (velocityDir.lengthSq() < 0.00001) {
      velocityDir.copy(forwardVector);
    } else {
      velocityDir.normalize();
    }

    tempObject.position.copy(boid.position);
    tempObject.quaternion.setFromUnitVectors(forwardVector, velocityDir);
    tempObject.scale.setScalar(params.boidScale);
    tempObject.updateMatrix();
    boidMesh.setMatrixAt(i, tempObject.matrix);

    if (params.colorMode === "none") {
      solidColorValue.set(params.solidColor);
      instanceColor.copy(solidColorValue);
    } else {
      const scalar = computeColorScalar(boid, halfZ);
      const span = Math.max((colorBounds?.max ?? 1) - (colorBounds?.min ?? 0), 0.000001);
      const factor = THREE.MathUtils.clamp((scalar - (colorBounds?.min ?? 0)) / span, 0, 1);
      const liftedFactor = 0.08 + factor * 0.84;
      applyColormap(liftedFactor, instanceColor);
    }
    ensureVisibleColor(instanceColor, 0.25);

    boidMesh.setColorAt(i, instanceColor);
  }

  boidMesh.instanceMatrix.needsUpdate = true;
  if (boidMesh.instanceColor) {
    boidMesh.instanceColor.needsUpdate = true;
  }
}

function computeColorScalar(boid, halfZ) {
  if (params.colorMode === "speed") {
    return boid.velocity.length();
  }

  if (params.colorMode === "altitude") {
    return boid.position.z;
  }

  if (params.colorMode === "neighbors") {
    return boid.neighbors;
  }

  if (params.colorMode === "heading") {
    velocityDir.copy(boid.velocity);
    if (velocityDir.lengthSq() < 0.00001) {
      return 0;
    }
    velocityDir.normalize();
    return velocityDir.z;
  }

  return 0;
}

function getColorScalarBounds(halfZ) {
  if (params.colorMode === "altitude") {
    return { min: -halfZ, max: halfZ };
  }

  if (params.colorMode === "heading") {
    return { min: -1, max: 1 };
  }

  if (boids.length === 0) {
    return params.colorMode === "neighbors"
      ? { min: 0, max: 16 }
      : { min: 0, max: Math.max(params.maxSpeed, 1) };
  }

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < boids.length; i += 1) {
    const scalar = computeColorScalar(boids[i], halfZ);
    if (scalar < min) {
      min = scalar;
    }
    if (scalar > max) {
      max = scalar;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return params.colorMode === "neighbors"
      ? { min: 0, max: 16 }
      : { min: 0, max: Math.max(params.maxSpeed, 1) };
  }

  if (max - min < 0.0001) {
    return { min: min - 0.5, max: max + 0.5 };
  }

  return { min, max };
}

function buildColormapLUT(stopMap) {
  const lut = {};
  for (const [name, stops] of Object.entries(stopMap)) {
    lut[name] = stops.map((hex) => new THREE.Color(hex));
  }
  return lut;
}

function buildColormapGradients(stopMap) {
  const gradients = {};
  for (const [name, stops] of Object.entries(stopMap)) {
    gradients[name] = `linear-gradient(90deg, ${stops
      .map((hex) => `#${hex.toString(16).padStart(6, "0")}`)
      .join(", ")})`;
  }
  return gradients;
}

function applyColormap(value, outColor) {
  const colors = colormaps[params.colormap] || colormaps.turbo;
  if (!colors || colors.length === 0) {
    return outColor.setRGB(1, 1, 1);
  }

  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  if (colors.length === 1) {
    return outColor.copy(colors[0]);
  }

  const scaled = clamped * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const t = scaled - index;

  colormapLerpA.copy(colors[index]);
  colormapLerpB.copy(colors[index + 1]);
  return outColor.copy(colormapLerpA).lerp(colormapLerpB, t);
}

function ensureVisibleColor(color, minLuminance) {
  const luminance =
    0.2126 * color.r +
    0.7152 * color.g +
    0.0722 * color.b;

  if (luminance >= minLuminance) {
    return color;
  }

  const deficiency = THREE.MathUtils.clamp((minLuminance - luminance) / Math.max(minLuminance, 0.0001), 0, 1);
  return color.lerp(new THREE.Color(1, 1, 1), deficiency * 0.55);
}

function getColorModeRange() {
  if (params.colorMode === "speed") {
    return {
      min: 0,
      max: params.maxSpeed,
      unit: "m/s",
      digits: 1,
    };
  }

  if (params.colorMode === "altitude") {
    const halfZ = params.worldSizeZ * 0.5;
    return {
      min: -halfZ,
      max: halfZ,
      unit: "m",
      digits: 1,
    };
  }

  if (params.colorMode === "neighbors") {
    return {
      min: 0,
      max: 16,
      unit: "",
      digits: 0,
    };
  }

  return {
    min: -1,
    max: 1,
    unit: "",
    digits: 2,
  };
}

function formatLegendValue(value, unit, digits) {
  const prefix = value >= 0 ? "" : "-";
  const absolute = Math.abs(value).toFixed(digits);
  return `${prefix}${absolute}${unit ? ` ${unit}` : ""}`;
}

function updateColormapLegend() {
  if (!dom.colormapLegendBar || !dom.colormapCmin || !dom.colormapCmax) {
    return;
  }

  if (params.colorMode === "none") {
    if (dom.colormapLegend) {
      dom.colormapLegend.classList.add("is-hidden");
    }
    return;
  }

  if (dom.colormapLegend) {
    dom.colormapLegend.classList.remove("is-hidden");
  }

  const gradient = colormapGradients[params.colormap] || colormapGradients.turbo;
  dom.colormapLegendBar.style.background = gradient;

  const range = getColorModeRange();
  dom.colormapCmin.textContent = `cmin: ${formatLegendValue(range.min, range.unit, range.digits)}`;
  dom.colormapCmax.textContent = `cmax: ${formatLegendValue(range.max, range.unit, range.digits)}`;
}

function updateColorControlVisibility() {
  const useSingleColor = params.colorMode === "none";
  dom.colormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
  dom.singleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
}

function rebuildBoundsAndGrid() {
  world.rebuildBoundsAndGrid();
}

function setupControls() {
  bindRange("boid-scale", "boid-scale-value", (value) => {
    params.boidScale = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("perception-radius", "perception-radius-value", (value) => {
    params.perceptionRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("separation-distance", "separation-distance-value", (value) => {
    params.separationDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("max-speed", "max-speed-value", (value) => {
    params.maxSpeed = value;
    syncBoidInstances();
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("max-accel", "max-accel-value", (value) => {
    params.maxAccel = value;
    return `${value.toFixed(1)} m/s²`;
  });

  bindRange("alignment-weight", "alignment-weight-value", (value) => {
    params.alignmentWeight = value;
    return value.toFixed(2);
  });

  bindRange("cohesion-weight", "cohesion-weight-value", (value) => {
    params.cohesionWeight = value;
    return value.toFixed(2);
  });

  bindRange("separation-weight", "separation-weight-value", (value) => {
    params.separationWeight = value;
    return value.toFixed(2);
  });

  bindRange("world-size-x", "world-size-x-value", (value) => {
    params.worldSizeX = value;
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("world-size-y", "world-size-y-value", (value) => {
    params.worldSizeY = value;
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("world-size-z", "world-size-z-value", (value) => {
    params.worldSizeZ = value;
    rebuildBoundsAndGrid();
    syncBoidInstances();
    return `${Math.round(value)} m`;
  });

  bindRange("camera-fov", "camera-fov-value", (value) => {
    params.cameraFov = value;
    perspectiveCamera.fov = value;
    perspectiveCamera.updateProjectionMatrix();
    updateOrthographicCamera(false);
    return `${Math.round(value)}°`;
  });

  const boidCountInput = document.getElementById("boid-count");
  const boidCountValue = document.getElementById("boid-count-value");
  registerCompactRangeControl(boidCountInput, boidCountValue);
  boidCountInput.addEventListener("input", () => {
    boidCountValue.textContent = boidCountInput.value;
    params.boidCount = Number(boidCountInput.value);
    spawnBoids(params.boidCount);
    syncCompactSectionSlider("boid-count");
  });
  activateCompactRangeControl("boid-count");

  dom.togglePause.addEventListener("click", () => {
    params.paused = !params.paused;
    updateSimulationStateUI();
  });

  dom.runState?.addEventListener("click", () => {
    params.paused = !params.paused;
    updateSimulationStateUI();
  });

  dom.appletTabs?.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.getAttribute("data-applet-item");
      if (mode !== "boid") {
        return;
      }

      dom.appletTabs.forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
    });
  });

  dom.resetSim.addEventListener("click", () => {
    spawnBoids(params.boidCount);
  });

  dom.showBounds.addEventListener("change", () => {
    params.showBounds = dom.showBounds.checked;
    world.setBoundsVisibility(params.showBounds);
  });

  dom.cameraLocked.addEventListener("change", () => {
    params.cameraLocked = dom.cameraLocked.checked;
    applyCameraInteractivity();
  });

  dom.boundaryMode.addEventListener("change", () => {
    params.boundaryMode = dom.boundaryMode.value;

    for (let i = 0; i < boids.length; i += 1) {
      applyBoundaryConditions(boids[i]);
    }

    if (params.boundaryMode === "lost") {
      removeLostBoids();
    }

    let speedSum = 0;
    let neighborSum = 0;
    for (let i = 0; i < boids.length; i += 1) {
      speedSum += boids[i].velocity.length();
      neighborSum += boids[i].neighbors;
    }

    syncBoidInstances();
    updateStats(speedSum, neighborSum);
  });

  dom.colorMode.addEventListener("change", () => {
    params.colorMode = dom.colorMode.value;
    updateColorControlVisibility();
    syncBoidInstances();
    updateColormapLegend();
  });

  dom.colormap.addEventListener("change", () => {
    params.colormap = dom.colormap.value;
    syncBoidInstances();
    updateColormapLegend();
  });

  dom.solidColor?.addEventListener("input", () => {
    params.solidColor = dom.solidColor.value;
    syncBoidInstances();
  });

  if (dom.cameraProjectionToggle) {
    dom.cameraProjectionToggle.addEventListener("click", () => {
      if (params.projectionMode === "perspective") {
        params.projectionMode = "orthographic";
        switchToOrthographicTop();
      } else {
        params.projectionMode = "perspective";
        switchToPerspective();
      }
      updateProjectionToggleUI();
      updateViewportLabel();
    });
  }

  if (dom.resetCamera) {
    dom.resetCamera.addEventListener("click", () => {
      params.cameraDistance = cameraDefaults.cameraDistance;
      params.cameraHeight = cameraDefaults.cameraHeight;
      params.cameraFov = cameraDefaults.cameraFov;
      params.cameraLocked = cameraDefaults.cameraLocked;

      setControlValue("camera-fov", params.cameraFov, "camera-fov-value", (value) => `${Math.round(value)}°`);
      dom.cameraLocked.checked = params.cameraLocked;

      perspectiveCamera.fov = params.cameraFov;
      perspectiveCamera.updateProjectionMatrix();
      updateOrthographicCamera(false);
      cameraController.resetOrientationKeepPosition();
      applyCameraInteractivity();
      updateCameraTelemetry();
      updateProjectionToggleUI();
      updateViewportLabel();
    });
  }

  if (dom.homeCamera) {
    dom.homeCamera.addEventListener("click", () => {
      cameraController.moveActiveCameraToOrigin();
      updateCameraTelemetry();
      updateViewportLabel();
    });
  }

  dom.showBounds.checked = params.showBounds;
  dom.cameraLocked.checked = params.cameraLocked;
  dom.boundaryMode.value = params.boundaryMode;
  dom.colorMode.value = params.colorMode;
  dom.colormap.value = params.colormap;
  if (dom.solidColor) {
    dom.solidColor.value = params.solidColor;
  }
  updateColorControlVisibility();
  updateColormapLegend();
  updateSimulationStateUI();
  updateProjectionToggleUI();

  switchToPerspective();
}

function updateProjectionToggleUI() {
  if (!dom.cameraProjectionToggle) {
    return;
  }

  if (params.projectionMode === "orthographic") {
    dom.cameraProjectionToggle.innerHTML =
      '<i class="bi bi-camera-video me-1" aria-hidden="true"></i><span>Perspective</span>';
    dom.cameraProjectionToggle.setAttribute("aria-label", "Switch to perspective view");
    return;
  }

  dom.cameraProjectionToggle.innerHTML =
    '<i class="bi bi-bounding-box-circles me-1" aria-hidden="true"></i><span>Top Orthographic (Z+)</span>';
  dom.cameraProjectionToggle.setAttribute("aria-label", "Switch to top orthographic view");
}

function updateSimulationStateUI() {
  if (params.paused) {
    dom.togglePause.innerHTML = '<i class=\"bi bi-play-fill me-1\" aria-hidden=\"true\"></i><span>Resume</span>';
    dom.runState.innerHTML = '<i class=\"bi bi-pause-fill state-icon\" aria-hidden=\"true\"></i><span>Paused</span>';
    dom.runState.setAttribute("title", "Resume simulation");
    dom.runState.setAttribute("aria-pressed", "true");
    return;
  }

  dom.togglePause.innerHTML = '<i class=\"bi bi-pause-fill me-1\" aria-hidden=\"true\"></i><span>Pause</span>';
  dom.runState.innerHTML = '<i class=\"bi bi-play-fill state-icon\" aria-hidden=\"true\"></i><span>Running</span>';
  dom.runState.setAttribute("title", "Pause simulation");
  dom.runState.setAttribute("aria-pressed", "false");
}

function setupThemeToggle() {
  themeManager = createThemeManager({
    toggleButton: dom.themeToggle,
    labelEl: dom.themeToggleLabel,
    iconEl: dom.themeToggleIcon,
    onThemeChange: (effectiveTheme) => {
      applySceneTheme(effectiveTheme);
      drawTrendCharts();
    },
  });
}

function applySceneTheme(theme) {
  world.applyTheme(theme);
  boidMaterial.specular.set(theme === "light" ? 0x2c2c2c : 0x1c1c1c);
}

function setupPanelToggles() {
  dom.hideLeftPanel.addEventListener("click", () => {
    uiState.leftPanelVisible = !uiState.leftPanelVisible;
    applyPanelVisibility();
  });

  dom.hideRightPanel.addEventListener("click", () => {
    uiState.rightPanelVisible = !uiState.rightPanelVisible;
    applyPanelVisibility();
  });

  dom.showLeftPanel.addEventListener("click", () => {
    uiState.leftPanelVisible = true;
    applyPanelVisibility();
  });

  dom.showRightPanel.addEventListener("click", () => {
    uiState.rightPanelVisible = true;
    applyPanelVisibility();
  });

  applyPanelVisibility();
}

function setupPanelResizers() {
  if (!dom.appShell || !dom.leftResizer || !dom.rightResizer) {
    return;
  }

  const minViewportWidth = 360;
  const resizerWidth = 10;
  const limits = {
    leftMin: 200,
    leftMax: 520,
    rightMin: 240,
    rightMax: 580,
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const applyWidths = () => {
    dom.appShell.style.setProperty("--left-panel-w", `${panelWidthState.left}px`);
    dom.appShell.style.setProperty("--right-panel-w", `${panelWidthState.right}px`);
  };

  const beginDrag = (side, pointerDownEvent) => {
    if (pointerDownEvent.button !== 0) {
      return;
    }

    const shellRect = dom.appShell.getBoundingClientRect();
    const pointerId = pointerDownEvent.pointerId;

    const onPointerMove = (moveEvent) => {
      if (!uiState.leftPanelVisible && !uiState.rightPanelVisible) {
        return;
      }

      if (side === "left" && uiState.leftPanelVisible) {
        const dynamicLeftMax = Math.max(
          limits.leftMin,
          shellRect.width - panelWidthState.right - minViewportWidth - resizerWidth * 2,
        );
        panelWidthState.left = clamp(
          moveEvent.clientX - shellRect.left,
          limits.leftMin,
          Math.min(limits.leftMax, dynamicLeftMax),
        );
      } else if (side === "right" && uiState.rightPanelVisible) {
        const dynamicRightMax = Math.max(
          limits.rightMin,
          shellRect.width - panelWidthState.left - minViewportWidth - resizerWidth * 2,
        );
        panelWidthState.right = clamp(
          shellRect.right - moveEvent.clientX,
          limits.rightMin,
          Math.min(limits.rightMax, dynamicRightMax),
        );
      }

      applyWidths();
      handleViewportResize();
    };

    const onPointerEnd = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      if (pointerId !== undefined) {
        dom.leftResizer.releasePointerCapture?.(pointerId);
        dom.rightResizer.releasePointerCapture?.(pointerId);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    if (pointerId !== undefined) {
      if (side === "left") {
        dom.leftResizer.setPointerCapture?.(pointerId);
      } else {
        dom.rightResizer.setPointerCapture?.(pointerId);
      }
    }
  };

  dom.leftResizer.addEventListener("pointerdown", (event) => beginDrag("left", event));
  dom.rightResizer.addEventListener("pointerdown", (event) => beginDrag("right", event));
  applyWidths();
}

function setupControlSectionCollapses() {
  if (!dom.controlSectionToggles || dom.controlSectionToggles.length === 0) {
    return;
  }

  dom.controlSectionToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const section = toggle.closest("[data-control-section]");
      if (!section) {
        return;
      }

      const collapsed = section.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      requestAnimationFrame(() => {
        handleViewportResize();
      });
    });
  });
}

function applyPanelVisibility() {
  dom.leftPanel.classList.toggle("is-hidden", !uiState.leftPanelVisible);
  dom.rightPanel.classList.toggle("is-hidden", !uiState.rightPanelVisible);
  dom.appShell.classList.toggle("left-hidden", !uiState.leftPanelVisible);
  dom.appShell.classList.toggle("right-hidden", !uiState.rightPanelVisible);
  dom.leftResizer?.classList.toggle("is-hidden", !uiState.leftPanelVisible);
  dom.rightResizer?.classList.toggle("is-hidden", !uiState.rightPanelVisible);

  dom.showLeftPanel.classList.toggle("is-hidden", uiState.leftPanelVisible);
  dom.showRightPanel.classList.toggle("is-hidden", uiState.rightPanelVisible);
  dom.hideLeftPanel.setAttribute("aria-pressed", String(!uiState.leftPanelVisible));
  dom.hideRightPanel.setAttribute("aria-pressed", String(!uiState.rightPanelVisible));

  requestAnimationFrame(() => {
    handleViewportResize();
  });
}

function setupControlsInfoPopup() {
  if (!dom.controlsInfoOpen || !dom.controlsInfoBackdrop || !dom.controlsInfoClose) {
    return;
  }

  const openPopup = () => {
    dom.controlsInfoBackdrop.classList.remove("is-hidden");
    dom.controlsInfoBackdrop.setAttribute("aria-hidden", "false");
  };

  const closePopup = () => {
    dom.controlsInfoBackdrop.classList.add("is-hidden");
    dom.controlsInfoBackdrop.setAttribute("aria-hidden", "true");
  };

  dom.controlsInfoOpen.addEventListener("click", openPopup);
  dom.controlsInfoClose.addEventListener("click", closePopup);

  dom.controlsInfoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.controlsInfoBackdrop) {
      closePopup();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.controlsInfoBackdrop.classList.contains("is-hidden")) {
      closePopup();
    }
  });
}

function handleViewportResize() {
  resizeRenderer();
  resizeTrendCharts();
}

function setupTrendCharts() {
  resizeTrendCharts();
  resetTrendCharts();
}

function setupChartCollapses() {
  if (!dom.chartToggles || dom.chartToggles.length === 0) {
    return;
  }

  dom.chartToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const card = toggle.closest("[data-chart-card]");
      if (!card) {
        return;
      }

      const collapsed = card.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      resizeTrendCharts();
    });
  });
}

function resetTrendCharts() {
  countHistory.length = 0;
  speedHistory.length = 0;
  neighborHistory.length = 0;
  chartFrameCounter = 0;
  drawTrendCharts();
}

function resizeTrendCharts() {
  resizeCanvasBackingStore(dom.chartCount);
  resizeCanvasBackingStore(dom.chartSpeed);
  resizeCanvasBackingStore(dom.chartNeighbors);
  drawTrendCharts();
}

function resizeCanvasBackingStore(canvas) {
  if (!canvas) {
    return;
  }

  const cssWidth = Math.max(1, Math.floor(canvas.clientWidth));
  const cssHeight = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
}

function drawTrendCharts() {
  drawTrendChart(dom.chartCount, countHistory, {
    stroke: "#7ec4ff",
    fill: "rgba(126, 196, 255, 0.14)",
    axisLabel: "count",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartSpeed, speedHistory, {
    stroke: "#4cd3b6",
    fill: "rgba(76, 211, 182, 0.14)",
    axisLabel: "m/s",
    tickFormatter: (value) => value.toFixed(1),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartNeighbors, neighborHistory, {
    stroke: "#5aa4ff",
    fill: "rgba(90, 164, 255, 0.14)",
    axisLabel: "count",
    tickFormatter: (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)),
    forceZeroMin: true,
  });
}

function drawTrendChart(canvas, values, options) {
  if (!canvas || canvas.width < 2 || canvas.height < 2) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const {
    stroke,
    fill,
    axisLabel = "",
    tickFormatter = (value) => value.toFixed(1),
    forceZeroMin = false,
  } = options;

  const width = canvas.width;
  const height = canvas.height;
  const dpr = width / Math.max(canvas.clientWidth, 1);
  const padLeft = 40 * dpr;
  const padRight = 10 * dpr;
  const padTop = 8 * dpr;
  const padBottom = 12 * dpr;

  ctx.clearRect(0, 0, width, height);

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  if (plotWidth <= 1 || plotHeight <= 1) {
    return;
  }

  let minValue = values.length > 0 ? values[0] : 0;
  let maxValue = values.length > 0 ? values[0] : 1;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }
  }

  if (forceZeroMin) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  const span = Math.max(maxValue - minValue, 0.001);
  const theme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
  const palette =
    theme === "light"
      ? {
          grid: "rgba(88, 114, 156, 0.22)",
          axis: "rgba(78, 104, 150, 0.48)",
          label: "rgba(50, 72, 110, 0.95)",
        }
      : {
          grid: "rgba(166, 196, 245, 0.16)",
          axis: "rgba(166, 196, 245, 0.34)",
          label: "rgba(183, 205, 242, 0.86)",
        };

  ctx.font = `${Math.max(9, Math.round(9 * dpr))}px "Space Grotesk", "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const tickCount = 5;
  for (let i = 0; i < tickCount; i += 1) {
    const ratio = i / (tickCount - 1);
    const y = padTop + ratio * plotHeight;
    const value = maxValue - ratio * span;

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = Math.max(1, 0.85 * dpr);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();

    ctx.strokeStyle = palette.axis;
    ctx.beginPath();
    ctx.moveTo(padLeft - 4 * dpr, y);
    ctx.lineTo(padLeft, y);
    ctx.stroke();

    ctx.fillStyle = palette.label;
    ctx.fillText(tickFormatter(value), padLeft - 6 * dpr, y);
  }

  ctx.strokeStyle = palette.axis;
  ctx.lineWidth = Math.max(1, 1.05 * dpr);
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, height - padBottom);
  ctx.lineTo(width - padRight, height - padBottom);
  ctx.stroke();

  if (axisLabel) {
    ctx.save();
    ctx.translate(9 * dpr, padTop + plotHeight * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = palette.label;
    ctx.fillText(axisLabel, 0, 0);
    ctx.restore();
  }

  if (values.length < 2) {
    return;
  }

  const mapY = (value) =>
    padTop + (1 - (value - minValue) / span) * plotHeight;

  const step = plotWidth / (values.length - 1);

  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = padLeft + i * step;
    const y = mapY(values[i]);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  const firstX = padLeft;
  const lastX = padLeft + plotWidth;

  ctx.lineTo(lastX, height - padBottom);
  ctx.lineTo(firstX, height - padBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = padLeft + i * step;
    const y = mapY(values[i]);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8 * dpr;
  ctx.stroke();
}

function pushTrendValue(series, value) {
  series.push(value);
  if (series.length > chartMaxPoints) {
    series.shift();
  }
}

function bindRange(inputId, valueId, applyValue) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(valueId);
  if (!input || !output) {
    return;
  }

  registerCompactRangeControl(input, output);

  const handle = () => {
    const value = Number(input.value);
    const display = applyValue(value);
    output.textContent = display;
    syncCompactSectionSlider(inputId);
    updateColormapLegend();
  };

  input.addEventListener("input", handle);
  handle();
}

function setControlValue(inputId, value, valueId, formatter) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(valueId);
  if (!input || !output) {
    return;
  }
  input.value = String(value);
  output.textContent = formatter(value);
  syncCompactSectionSlider(inputId);
}

function setupCompactSectionSliders() {
  const sliderHubs = document.querySelectorAll("[data-slider-hub]");
  sliderHubs.forEach((hub) => {
    const sectionKey = hub.getAttribute("data-slider-hub");
    const slider = hub.querySelector("[data-section-slider]");
    const title = hub.querySelector("[data-section-slider-title]");
    const value = hub.querySelector("[data-section-slider-value]");
    if (!sectionKey || !slider || !title || !value) {
      return;
    }

    compactSectionState[sectionKey] = {
      hub,
      slider,
      title,
      value,
      activeInputId: null,
    };

    slider.addEventListener("input", () => {
      const activeInputId = compactSectionState[sectionKey].activeInputId;
      if (!activeInputId) {
        return;
      }

      const binding = compactRangeRegistry.get(activeInputId);
      if (!binding) {
        return;
      }

      binding.input.value = slider.value;
      binding.input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}

function registerCompactRangeControl(inputRef, outputRef) {
  const input = typeof inputRef === "string" ? document.getElementById(inputRef) : inputRef;
  const output = typeof outputRef === "string" ? document.getElementById(outputRef) : outputRef;
  if (!input || !output || !input.id) {
    return;
  }

  const section = input.closest("[data-control-section]");
  const sectionKey = section?.getAttribute("data-control-section");
  const sectionState = sectionKey ? compactSectionState[sectionKey] : null;
  if (!sectionKey || !sectionState) {
    return;
  }

  const labelEl = section.querySelector(`label[for="${input.id}"]`);
  const labelNameEl = labelEl?.querySelector(".label-name");
  const labelText = labelNameEl ? labelNameEl.textContent.trim() : input.id;

  compactRangeRegistry.set(input.id, {
    input,
    output,
    sectionKey,
    labelEl,
    labelText,
  });

  input.classList.add("compact-source-slider");
  output.classList.add("compact-value-trigger");
  output.setAttribute("role", "button");
  output.setAttribute("tabindex", "0");
  output.setAttribute("aria-label", `Edit ${labelText}`);

  const activate = (event) => {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (event.type === "keydown") {
      event.preventDefault();
    }

    activateCompactRangeControl(input.id);
  };

  output.addEventListener("click", activate);
  output.addEventListener("keydown", activate);

  if (!sectionState.activeInputId) {
    activateCompactRangeControl(input.id);
  } else {
    syncCompactSectionSlider(input.id);
  }
}

function activateCompactRangeControl(inputId) {
  const binding = compactRangeRegistry.get(inputId);
  if (!binding) {
    return;
  }

  const sectionState = compactSectionState[binding.sectionKey];
  if (!sectionState) {
    return;
  }

  sectionState.activeInputId = inputId;
  sectionState.title.textContent = binding.labelText;
  sectionState.slider.min = binding.input.min;
  sectionState.slider.max = binding.input.max;
  sectionState.slider.step = binding.input.step || "1";
  sectionState.slider.value = binding.input.value;
  sectionState.value.textContent = binding.output.textContent;
  if (sectionState.hub && binding.labelEl && binding.labelEl.parentElement) {
    binding.labelEl.insertAdjacentElement("afterend", sectionState.hub);
  }

  for (const item of compactRangeRegistry.values()) {
    if (item.sectionKey === binding.sectionKey) {
      item.output.classList.toggle("is-active-control", item.input.id === inputId);
    }
  }
}

function syncCompactSectionSlider(inputId) {
  const binding = compactRangeRegistry.get(inputId);
  if (!binding) {
    return;
  }

  const sectionState = compactSectionState[binding.sectionKey];
  if (!sectionState || sectionState.activeInputId !== inputId) {
    return;
  }

  sectionState.slider.value = binding.input.value;
  sectionState.value.textContent = binding.output.textContent;
}

function setPerspectiveCameraFromParams(forceSnap = false) {
  cameraController.setPerspectiveCameraFromParams(forceSnap);
}

function switchToPerspective() {
  cameraController.switchToPerspective();
}

function switchToOrthographicTop() {
  cameraController.switchToOrthographicTop();
}

function updateOrthographicCamera(snapToTop) {
  cameraController.updateOrthographicCamera(snapToTop);
}

function applyCameraInteractivity() {
  cameraController.applyCameraInteractivity();
}

function updateKeyboardTranslation(dt) {
  cameraController.updateKeyboardTranslation(dt);
}

function resizeRenderer() {
  const width = Math.max(1, Math.floor(dom.sceneHost.clientWidth));
  const height = Math.max(1, Math.floor(dom.sceneHost.clientHeight));

  renderer.setSize(width, height, false);

  perspectiveCamera.aspect = width / height;
  perspectiveCamera.updateProjectionMatrix();

  updateOrthographicCamera(false);
  updateViewportLabel();
}

function updateViewportLabel() {
  if (!dom.frameSize) {
    return;
  }

  const width = Math.max(1, Math.floor(dom.sceneHost.clientWidth));
  const height = Math.max(1, Math.floor(dom.sceneHost.clientHeight));
  const projectionLabel =
    params.projectionMode === "orthographic" ? "Ortho Top (Z+)" : "Perspective";

  dom.frameSize.textContent = `Viewport: ${width} x ${height} | ${projectionLabel}`;
}

function updateCameraTelemetry() {
  cameraController.updateTelemetry();
}

function updateStats(speedSum, neighborSum) {
  const boidCount = boids.length;
  const avgSpeed = boidCount > 0 ? speedSum / boidCount : 0;
  const avgNeighbors = boidCount > 0 ? neighborSum / boidCount : 0;

  if (dom.chartCountLive) {
    dom.chartCountLive.textContent = String(boidCount);
  }
  if (dom.chartSpeedLive) {
    dom.chartSpeedLive.textContent = `${avgSpeed.toFixed(2)} m/s`;
  }
  if (dom.chartNeighborsLive) {
    dom.chartNeighborsLive.textContent = avgNeighbors.toFixed(2);
  }

  chartFrameCounter += 1;
  if (chartFrameCounter % 3 === 0) {
    pushTrendValue(countHistory, boidCount);
    pushTrendValue(speedHistory, avgSpeed);
    pushTrendValue(neighborHistory, avgNeighbors);
    drawTrendCharts();
  }
}

function removeLostBoids() {
  let removed = false;
  for (let i = boids.length - 1; i >= 0; i -= 1) {
    if (boids[i].lost) {
      boids.splice(i, 1);
      removed = true;
    }
  }

  if (removed) {
    rebuildBoidMeshForCurrentBoids();
  }

  return removed;
}

function applyBoundaryConditions(boid) {
  return world.applyBoundaryConditions(boid);
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
