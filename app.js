import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";
import { BoidSimulation } from "./boid.js";
import { AntSimulation } from "./ant.js";
import { PreySimulation } from "./prey.js";
import { FireflySimulation } from "./firefly.js";
import { SimulationManager } from "./simulationManager.js";
import { createVisualControls } from "./visualControls.js";
import { setupUiOverlays } from "./uiOverlays.js";
import {
  drawTrendChart as renderTrendChart,
  pushTrendValue as appendTrendValue,
  resizeCanvasBackingStore as resizeChartCanvas,
} from "./chartUtils.js";

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
  antColorMode: "state",
  antColormap: "turbo",
  antSolidColor: "#62d6f9",
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  showBounds: true,
  cameraLocked: false,
  projectionMode: "perspective",
  keyboardMoveSpeed: 42,
  paused: false,
  antCount: 180,
  antScale: 0.95,
  antSpeed: 4.0,
  antSensorDistance: 5.0,
  antSensorAngle: 40,
  antTurnGain: 1.6,
  antGoalBias: 1.0,
  antDepartureRate: 12,
  antDepositRate: 8.0,
  antDiffusionRate: 7.5,
  antEvapRate: 1.8,
  antNoiseStrength: 0.2,
  antFoodSenseDistance: 8.0,
  antPickupRadius: 0.55,
  antFoodPlacementEnabled: false,
  antFoodAddMassUg: 50,
  antPickupMassUg: 1,
  antFoodSourceMassUg: 1000,
  preyCount: 260,
  predatorCount: 24,
  preySpeed: 4.5,
  predatorSpeed: 6.2,
  predatorSenseRadius: 16,
  predationRadius: 1.6,
  preyBirthRate: 0.08,
  predationRateBeta: 1.0,
  preyAvoidRadius: 14,
  preyAvoidWeight: 2.4,
  predatorEnergyLoss: 0.45,
  predatorEnergyGain: 1.6,
  predatorSpawnEnergy: 2.8,
  preyMaxCount: 1200,
  preyScale: 0.62,
  predatorScale: 1.0,
  preyColorMode: "energy",
  preyColormap: "turbo",
  preySolidColor: "#ff8d5f",
  fireflyCount: 180,
  fireflySize: 0.8,
  fireflySpeed: 3.0,
  fireflyCoupling: 2.2,
  fireflyRadius: 18.0,
  fireflyFrequencyHz: 1.8,
  fireflyFreqJitterHz: 0.2,
  fireflyPhaseNoise: 0.4,
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
  narrowScreenBlocker: document.getElementById("narrow-screen-blocker"),
  chartCount: document.getElementById("chart-count"),
  chartSpeed: document.getElementById("chart-speed"),
  chartNeighbors: document.getElementById("chart-neighbors"),
  chartAntTrips: document.getElementById("chart-ant-trips"),
  chartAntPheromone: document.getElementById("chart-ant-pheromone"),
  chartAntCount: document.getElementById("chart-ant-count"),
  chartPreyCount: document.getElementById("chart-prey-count"),
  chartPredatorCount: document.getElementById("chart-predator-count"),
  chartPreyEaten: document.getElementById("chart-prey-eaten"),
  chartFireflyCount: document.getElementById("chart-firefly-count"),
  chartFireflyOrder: document.getElementById("chart-firefly-order"),
  chartFireflyBlink: document.getElementById("chart-firefly-blink"),
  fpsLive: document.getElementById("fps-live"),
  chartCountLive: document.getElementById("chart-count-live"),
  chartSpeedLive: document.getElementById("chart-speed-live"),
  chartNeighborsLive: document.getElementById("chart-neighbors-live"),
  antsFpsLive: document.getElementById("ants-fps-live"),
  preyFpsLive: document.getElementById("prey-fps-live"),
  fireflyFpsLive: document.getElementById("firefly-fps-live"),
  antsCountLive: document.getElementById("ants-count-live"),
  antsCarryingLive: document.getElementById("ants-carrying-live"),
  antsTripsLive: document.getElementById("ants-trips-live"),
  antsPheromoneLive: document.getElementById("ants-pheromone-live"),
  preyCountLive: document.getElementById("prey-count-live"),
  preyPredatorLive: document.getElementById("prey-predator-live"),
  preyEatenLive: document.getElementById("prey-eaten-live"),
  chartAntTripsLive: document.getElementById("chart-ant-trips-live"),
  chartAntPheromoneLive: document.getElementById("chart-ant-pheromone-live"),
  chartAntCountLive: document.getElementById("chart-ant-count-live"),
  chartPreyCountLive: document.getElementById("chart-prey-count-live"),
  chartPredatorCountLive: document.getElementById("chart-predator-count-live"),
  chartPreyEatenLive: document.getElementById("chart-prey-eaten-live"),
  chartFireflyCountLive: document.getElementById("chart-firefly-count-live"),
  chartFireflyOrderLive: document.getElementById("chart-firefly-order-live"),
  chartFireflyBlinkLive: document.getElementById("chart-firefly-blink-live"),
  chartToggles: document.querySelectorAll("[data-chart-toggle]"),
  appletTabs: document.querySelectorAll("[data-applet-item]"),
  appVisibleElements: document.querySelectorAll("[data-app-visible]"),
  runState: document.getElementById("run-state"),
  togglePause: document.getElementById("toggle-pause"),
  resetSim: document.getElementById("reset-sim"),
  toggleAntPause: document.getElementById("toggle-ant-pause"),
  resetAntSim: document.getElementById("reset-ant-sim"),
  togglePreyPause: document.getElementById("toggle-prey-pause"),
  resetPreySim: document.getElementById("reset-prey-sim"),
  toggleFireflyPause: document.getElementById("toggle-firefly-pause"),
  resetFireflySim: document.getElementById("reset-firefly-sim"),
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
  antColorMode: document.getElementById("ant-color-mode"),
  antColormap: document.getElementById("ant-colormap"),
  antSolidColor: document.getElementById("ant-solid-color"),
  antColormapControlWrap: document.getElementById("ant-colormap-control-wrap"),
  antSingleColorWrap: document.getElementById("ant-single-color-wrap"),
  antColormapLegend: document.getElementById("ant-colormap-legend"),
  antColormapLegendBar: document.getElementById("ant-colormap-legend-bar"),
  antColormapCmin: document.getElementById("ant-colormap-cmin"),
  antColormapCmax: document.getElementById("ant-colormap-cmax"),
  preyColorMode: document.getElementById("prey-color-mode"),
  preyColormap: document.getElementById("prey-colormap"),
  preySolidColor: document.getElementById("prey-solid-color"),
  preyColormapControlWrap: document.getElementById("prey-colormap-control-wrap"),
  preySingleColorWrap: document.getElementById("prey-single-color-wrap"),
  preyColormapLegend: document.getElementById("prey-colormap-legend"),
  preyColormapLegendBar: document.getElementById("prey-colormap-legend-bar"),
  preyColormapCmin: document.getElementById("prey-colormap-cmin"),
  preyColormapCmax: document.getElementById("prey-colormap-cmax"),
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
  shareInfoOpen: document.getElementById("share-info-open"),
  shareInfoClose: document.getElementById("share-info-close"),
  shareInfoBackdrop: document.getElementById("share-info-backdrop"),
  shareLinkInput: document.getElementById("share-link-input"),
  shareLinkCopy: document.getElementById("share-link-copy"),
  shareCopyStatus: document.getElementById("share-copy-status"),
  viewportScreenshotBtn: document.getElementById("viewport-screenshot-btn"),
  aboutInfoOpen: document.getElementById("about-info-open"),
  aboutInfoClose: document.getElementById("about-info-close"),
  aboutInfoBackdrop: document.getElementById("about-info-backdrop"),
  controlSectionToggles: document.querySelectorAll("[data-control-toggle]"),
  antFoodPlacementEnabled: document.getElementById("ant-food-placement-enabled"),
  antFoodAddMass: document.getElementById("ant-food-add-mass"),
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
const APPLET_IDS = new Set(["boid", "ants", "prey", "firefly"]);
const appletCameraState = {
  boid: null,
  ants: null,
  prey: null,
  firefly: null,
};

let activeApplet = "boid";
let boidPausedPreference = params.paused;
let antsPausedPreference = params.paused;
let preyPausedPreference = params.paused;
let fireflyPausedPreference = params.paused;
const appletProjectionInitialized = {
  boid: false,
  ants: false,
  prey: false,
  firefly: false,
};

let themeManager = null;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-label", "3D simulation canvas");
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

const antGeometry = new THREE.ConeGeometry(0.45, 1.05, 8);
const antMaterial = new THREE.MeshPhongMaterial({
  color: 0xffffff,
  shininess: 28,
  specular: 0x1d1d1d,
  flatShading: true,
  side: THREE.DoubleSide,
  vertexColors: false,
  toneMapped: false,
});

const boids = [];
let boidMesh = null;
const tempObject = new THREE.Object3D();
const forwardVector = new THREE.Vector3(0, 0, 1);

const ants = [];
let antMesh = null;
let antPheromonePlane = null;
const antTempObject = new THREE.Object3D();
const antColor = new THREE.Color();
const antNest = new THREE.Vector2(0, 0);
let antFoodSources = [];
const antPheromoneFieldSize = 128;
let antFoodField = new Float32Array(antPheromoneFieldSize * antPheromoneFieldSize);
let antHomeField = new Float32Array(antPheromoneFieldSize * antPheromoneFieldSize);
let antNextFoodField = new Float32Array(antPheromoneFieldSize * antPheromoneFieldSize);
let antNextHomeField = new Float32Array(antPheromoneFieldSize * antPheromoneFieldSize);
const antPheromoneTextureData = new Uint8Array(antPheromoneFieldSize * antPheromoneFieldSize * 4);
const antPheromoneTexture = new THREE.DataTexture(
  antPheromoneTextureData,
  antPheromoneFieldSize,
  antPheromoneFieldSize,
  THREE.RGBAFormat,
);
antPheromoneTexture.flipY = false;
antPheromoneTexture.colorSpace = THREE.SRGBColorSpace;
antPheromoneTexture.needsUpdate = true;
const antPheromoneMaterial = new THREE.MeshBasicMaterial({
  map: antPheromoneTexture,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const antStats = {
  trips: 0,
  carrying: 0,
  meanPheromone: 0,
  maxPheromone: 0,
};

const world = createWorldManager({
  params,
  getBoids: () => boidSimulation.boids,
  onWorldGeometryChanged: () => {
    updateOrthographicCamera(false);
    simulationManager.onWorldGeometryChanged();
  },
});
const scene = world.scene;

const simulationManager = new SimulationManager();

let lastBoidStats = {
  count: 0,
  speedSum: 0,
  neighborSum: 0,
};

let lastAntStats = {
  count: 0,
  carrying: 0,
  trips: 0,
  meanPheromone: 0,
  maxPheromone: 0,
};

let lastPreyStats = {
  preyCount: 0,
  predatorCount: 0,
  eatenTotal: 0,
};

let lastFireflyStats = {
  count: 0,
  order: 0,
  blinkRate: 0,
};

const boidSimulation = new BoidSimulation({
  scene,
  params,
  world,
  onStats: (stats) => {
    lastBoidStats = stats;
    updateBoidStats(stats);
  },
});

const antSimulation = new AntSimulation({
  scene,
  params,
  onStats: (stats) => {
    lastAntStats = stats;
    updateAntStats(stats);
  },
});

const preySimulation = new PreySimulation({
  scene,
  params,
  onStats: (stats) => {
    lastPreyStats = stats;
    updatePreyStats(stats);
  },
});

const fireflySimulation = new FireflySimulation({
  scene,
  params,
  onStats: (stats) => {
    lastFireflyStats = stats;
    updateFireflyStats(stats);
  },
});

simulationManager.register("boid", boidSimulation);
simulationManager.register("ants", antSimulation);
simulationManager.register("prey", preySimulation);
simulationManager.register("firefly", fireflySimulation);

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
const antTripsHistory = [];
const antPheromoneHistory = [];
const antCountHistory = [];
const preyCountHistory = [];
const predatorCountHistory = [];
const preyEatenHistory = [];
const fireflyCountHistory = [];
const fireflyOrderHistory = [];
const fireflyBlinkHistory = [];
const chartMaxPoints = 160;
let boidChartFrameCounter = 0;
let antChartFrameCounter = 0;
let preyChartFrameCounter = 0;
let fireflyChartFrameCounter = 0;
let fpsSmoothed = 0;
let fpsUiAccumulator = 0;
const narrowScreenThresholdPx = 980;
const antFoodRaycaster = new THREE.Raycaster();
const antFoodPointerNdc = new THREE.Vector2();
const antFoodPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

setPerspectiveCameraFromParams(false);
updateOrthographicCamera(true);
applyCameraInteractivity();
rebuildBoundsAndGrid();
simulationManager.initAll();
setupCompactSectionSliders();
setupControls();
setupPanelToggles();
setupPanelResizers();
setupControlSectionCollapses();
setupThemeToggle();
setupUiOverlays({
  dom,
  renderer,
  scene,
  cameraController,
  getActiveApplet: () => activeApplet,
  getPaused: () => params.paused,
  setPaused: (value) => {
    params.paused = Boolean(value);
  },
  onPauseStateChange: () => updateSimulationStateUI(),
});
setupAntFoodPlacementInteraction();
setupTrendCharts();
setupChartCollapses();
setupAppRouting();
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
    simulationManager.step(dt);
  }

  updateKeyboardTranslation(dt);

  controls.update();
  updateCameraTelemetry();

  renderer.render(scene, cameraController.getActiveCamera());
}

function updateFpsMetric(dt) {
  if (dt <= 0) {
    return;
  }

  const fps = 1 / dt;
  fpsSmoothed = fpsSmoothed === 0 ? fps : fpsSmoothed * 0.9 + fps * 0.1;
  fpsUiAccumulator += dt;
  if (fpsUiAccumulator < 0.2) {
    return;
  }

  fpsUiAccumulator = 0;
  if (dom.fpsLive) {
    dom.fpsLive.textContent = `${fpsSmoothed.toFixed(1)}`;
  }
  if (dom.antsFpsLive) {
    dom.antsFpsLive.textContent = `${fpsSmoothed.toFixed(1)}`;
  }
  if (dom.preyFpsLive) {
    dom.preyFpsLive.textContent = `${fpsSmoothed.toFixed(1)}`;
  }
  if (dom.fireflyFpsLive) {
    dom.fireflyFpsLive.textContent = `${fpsSmoothed.toFixed(1)}`;
  }
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

  resetBoidTrendCharts();
  syncBoidInstances();
  updateBoidStats(0, 0);
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
  applySceneObjectVisibility(activeApplet);
}

function initializeAntSimulationAssets() {
  if (!antPheromonePlane) {
    const pheromoneGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    antPheromonePlane = new THREE.Mesh(pheromoneGeometry, antPheromoneMaterial);
    antPheromonePlane.renderOrder = 2;
    antPheromonePlane.position.z = -params.worldSizeZ * 0.5 + 0.08;
    scene.add(antPheromonePlane);
  }

  rebuildAntMeshForCurrentAnts();
  updateAntPheromonePlaneTransform();
}

function resetAntSimulation() {
  ants.length = 0;
  antStats.trips = 0;
  antStats.carrying = 0;
  antStats.meanPheromone = 0;
  antStats.maxPheromone = 0;

  antFoodField.fill(0);
  antHomeField.fill(0);
  antNextFoodField.fill(0);
  antNextHomeField.fill(0);

  antFoodSources = buildAntFoodSources();

  const spawnRadius = Math.max(3.5, Math.min(params.worldSizeX, params.worldSizeY) * 0.06);
  for (let i = 0; i < params.antCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spawnRadius;
    ants.push({
      position: new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius),
      heading: Math.random() * Math.PI * 2,
      carrying: false,
      lost: false,
    });
  }

  rebuildAntMeshForCurrentAnts();
  syncAntInstances();
  updateAntPheromoneTexture();
  resetAntTrendCharts();
  updateAntStats();
}

function rebuildAntMeshForCurrentAnts() {
  if (antMesh) {
    scene.remove(antMesh);
    antMesh = null;
  }

  const capacity = Math.max(ants.length, 1);
  antMesh = new THREE.InstancedMesh(antGeometry, antMaterial, capacity);
  antMesh.count = ants.length;
  antMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  antMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  antMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < capacity; i += 1) {
    antMesh.instanceColor.setXYZ(i, 1, 1, 1);
  }
  scene.add(antMesh);
  applySceneObjectVisibility(activeApplet);
}

function updateAntPheromonePlaneTransform() {
  if (!antPheromonePlane) {
    return;
  }

  antPheromonePlane.scale.set(params.worldSizeX, params.worldSizeY, 1);
  antPheromonePlane.position.z = -params.worldSizeZ * 0.5 + 0.06;
}

function buildAntFoodSources() {
  const rx = params.worldSizeX * 0.34;
  const ry = params.worldSizeY * 0.32;
  return [
    new THREE.Vector2(-rx, ry * 0.9),
    new THREE.Vector2(rx * 0.9, -ry),
    new THREE.Vector2(rx * 0.25, ry * 0.24),
  ];
}

function stepAntSimulation(dt) {
  const sensorAngleRad = THREE.MathUtils.degToRad(params.antSensorAngle);
  const sensorDistance = Math.max(0.2, params.antSensorDistance);
  const nestRadius = Math.max(2.2, sensorDistance * 0.5);
  const foodRadius = Math.max(2.6, sensorDistance * 0.58);
  const turnGain = Math.max(0, params.antTurnGain);
  const goalBias = Math.max(0, params.antGoalBias);
  const depositRate = Math.max(0, params.antDepositRate);
  const speed = Math.max(0, params.antSpeed);

  for (let i = 0; i < ants.length; i += 1) {
    const ant = ants[i];
    const trackField = ant.carrying ? antHomeField : antFoodField;

    const leftSignal = sampleAntField(
      trackField,
      ant.position.x + Math.cos(ant.heading + sensorAngleRad) * sensorDistance,
      ant.position.y + Math.sin(ant.heading + sensorAngleRad) * sensorDistance,
    );
    const rightSignal = sampleAntField(
      trackField,
      ant.position.x + Math.cos(ant.heading - sensorAngleRad) * sensorDistance,
      ant.position.y + Math.sin(ant.heading - sensorAngleRad) * sensorDistance,
    );

    const target = ant.carrying ? antNest : getClosestFoodSource(ant.position);
    const desiredHeading = Math.atan2(target.y - ant.position.y, target.x - ant.position.x);
    const headingError = shortestAngleDelta(desiredHeading - ant.heading);
    const stochastic = (Math.random() * 2 - 1) * params.antNoiseStrength;

    ant.heading = wrapAngle(
      ant.heading +
        ((rightSignal - leftSignal) * turnGain + headingError * goalBias + stochastic) * dt,
    );

    ant.position.x += Math.cos(ant.heading) * speed * dt;
    ant.position.y += Math.sin(ant.heading) * speed * dt;

    if (!applyAntBoundaryConditions(ant)) {
      continue;
    }

    const toNestSq = ant.position.distanceToSquared(antNest);
    if (!ant.carrying && isNearAnyFoodSource(ant.position, foodRadius)) {
      ant.carrying = true;
      ant.heading = wrapAngle(ant.heading + Math.PI);
    } else if (ant.carrying && toNestSq < nestRadius * nestRadius) {
      ant.carrying = false;
      ant.heading = wrapAngle(ant.heading + Math.PI);
      antStats.trips += 1;
    }

    const depositField = ant.carrying ? antFoodField : antHomeField;
    depositAntField(depositField, ant.position.x, ant.position.y, depositRate * dt);

  }

  if (params.boundaryMode === "lost") {
    removeLostAnts();
  }

  diffuseAndEvaporateAntFields(dt);
  updateAntPheromoneTexture();
  syncAntInstances();

  updateAntStats();
}

function removeLostAnts() {
  let removed = false;
  for (let i = ants.length - 1; i >= 0; i -= 1) {
    if (ants[i].lost) {
      ants.splice(i, 1);
      removed = true;
    }
  }

  if (removed) {
    rebuildAntMeshForCurrentAnts();
  }
}

function syncAntInstances() {
  if (!antMesh) {
    return;
  }

  const floorZ = -params.worldSizeZ * 0.5 + 0.82;
  for (let i = 0; i < ants.length; i += 1) {
    const ant = ants[i];
    antTempObject.position.set(ant.position.x, ant.position.y, floorZ);
    antTempObject.rotation.set(0, 0, ant.heading - Math.PI * 0.5);
    antTempObject.scale.setScalar(0.95);
    antTempObject.updateMatrix();
    antMesh.setMatrixAt(i, antTempObject.matrix);

    if (ant.carrying) {
      antColor.setRGB(0.98, 0.69, 0.26);
    } else {
      antColor.setRGB(0.37, 0.84, 0.98);
    }
    antMesh.setColorAt(i, antColor);
  }

  antMesh.count = ants.length;
  antMesh.instanceMatrix.needsUpdate = true;
  if (antMesh.instanceColor) {
    antMesh.instanceColor.needsUpdate = true;
  }
}

function updateAntPheromoneTexture() {
  let maxCombined = 0;
  let totalCombined = 0;
  const cellCount = antPheromoneFieldSize * antPheromoneFieldSize;

  for (let i = 0; i < cellCount; i += 1) {
    const combined = antFoodField[i] + antHomeField[i];
    if (combined > maxCombined) {
      maxCombined = combined;
    }
    totalCombined += combined;
  }

  antStats.meanPheromone = cellCount > 0 ? totalCombined / cellCount : 0;
  antStats.maxPheromone = maxCombined;
  const invMax = maxCombined > 0.000001 ? 1 / maxCombined : 0;

  for (let i = 0; i < cellCount; i += 1) {
    const i4 = i * 4;
    const food = antFoodField[i] * invMax;
    const home = antHomeField[i] * invMax;
    const combined = THREE.MathUtils.clamp(food + home, 0, 1);

    antPheromoneTextureData[i4] = Math.round(210 * food + 28 * home);
    antPheromoneTextureData[i4 + 1] = Math.round(168 * combined + 18);
    antPheromoneTextureData[i4 + 2] = Math.round(225 * home + 42 * food);
    antPheromoneTextureData[i4 + 3] = Math.round(230 * combined);
  }

  antPheromoneTexture.needsUpdate = true;
}

function diffuseAndEvaporateAntFields(dt) {
  const size = antPheromoneFieldSize;
  const diffusion = THREE.MathUtils.clamp(params.antDiffusionRate * dt, 0, 0.45);
  const decay = THREE.MathUtils.clamp(params.antEvapRate * dt, 0, 0.95);

  for (let y = 0; y < size; y += 1) {
    const yUp = y === 0 ? (params.boundaryMode === "cyclic" ? size - 1 : 0) : y - 1;
    const yDown = y === size - 1 ? (params.boundaryMode === "cyclic" ? 0 : size - 1) : y + 1;

    for (let x = 0; x < size; x += 1) {
      const xLeft = x === 0 ? (params.boundaryMode === "cyclic" ? size - 1 : 0) : x - 1;
      const xRight = x === size - 1 ? (params.boundaryMode === "cyclic" ? 0 : size - 1) : x + 1;

      const idx = y * size + x;
      const idxL = y * size + xLeft;
      const idxR = y * size + xRight;
      const idxU = yUp * size + x;
      const idxD = yDown * size + x;

      const food = antFoodField[idx];
      const home = antHomeField[idx];

      const foodNeighborAvg = (antFoodField[idxL] + antFoodField[idxR] + antFoodField[idxU] + antFoodField[idxD]) * 0.25;
      const homeNeighborAvg = (antHomeField[idxL] + antHomeField[idxR] + antHomeField[idxU] + antHomeField[idxD]) * 0.25;

      antNextFoodField[idx] = Math.max(0, food * (1 - decay) + (foodNeighborAvg - food) * diffusion);
      antNextHomeField[idx] = Math.max(0, home * (1 - decay) + (homeNeighborAvg - home) * diffusion);
    }
  }

  const tmpFood = antFoodField;
  antFoodField = antNextFoodField;
  antNextFoodField = tmpFood;

  const tmpHome = antHomeField;
  antHomeField = antNextHomeField;
  antNextHomeField = tmpHome;
}

function depositAntField(field, x, y, amount) {
  if (amount <= 0) {
    return;
  }

  const size = antPheromoneFieldSize;
  const u = ((x / Math.max(params.worldSizeX, 1)) + 0.5) * (size - 1);
  const v = ((y / Math.max(params.worldSizeY, 1)) + 0.5) * (size - 1);
  const ix = THREE.MathUtils.clamp(Math.round(u), 0, size - 1);
  const iy = THREE.MathUtils.clamp(Math.round(v), 0, size - 1);

  const center = iy * size + ix;
  field[center] += amount;

  if (ix > 0) {
    field[center - 1] += amount * 0.35;
  }
  if (ix < size - 1) {
    field[center + 1] += amount * 0.35;
  }
  if (iy > 0) {
    field[center - size] += amount * 0.35;
  }
  if (iy < size - 1) {
    field[center + size] += amount * 0.35;
  }
}

function sampleAntField(field, x, y) {
  const size = antPheromoneFieldSize;
  const u = ((x / Math.max(params.worldSizeX, 1)) + 0.5) * (size - 1);
  const v = ((y / Math.max(params.worldSizeY, 1)) + 0.5) * (size - 1);
  const ix = THREE.MathUtils.clamp(Math.round(u), 0, size - 1);
  const iy = THREE.MathUtils.clamp(Math.round(v), 0, size - 1);
  return field[iy * size + ix];
}

function isNearAnyFoodSource(position, radius) {
  const radiusSq = radius * radius;
  for (let i = 0; i < antFoodSources.length; i += 1) {
    if (position.distanceToSquared(antFoodSources[i]) <= radiusSq) {
      return true;
    }
  }
  return false;
}

function getClosestFoodSource(position) {
  let best = antFoodSources[0] || antNest;
  let bestDistSq = position.distanceToSquared(best);

  for (let i = 1; i < antFoodSources.length; i += 1) {
    const distanceSq = position.distanceToSquared(antFoodSources[i]);
    if (distanceSq < bestDistSq) {
      bestDistSq = distanceSq;
      best = antFoodSources[i];
    }
  }

  return best;
}

function applyAntBoundaryConditions(ant) {
  const halfX = params.worldSizeX * 0.5;
  const halfY = params.worldSizeY * 0.5;

  if (params.boundaryMode === "cyclic") {
    ant.position.x = wrapAxisLocal(ant.position.x, halfX);
    ant.position.y = wrapAxisLocal(ant.position.y, halfY);
    ant.lost = false;
    return true;
  }

  const outOfBounds = Math.abs(ant.position.x) > halfX || Math.abs(ant.position.y) > halfY;
  ant.lost = outOfBounds;
  return !outOfBounds;
}

function wrapAxisLocal(value, halfExtent) {
  const span = halfExtent * 2;
  if (span <= 0) {
    return 0;
  }
  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % span) + span) % span) - halfExtent;
  }
  return value;
}

function shortestAngleDelta(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function wrapAngle(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function updateAntStats(stats) {
  if (!stats) {
    return;
  }

  const antCount = stats.count ?? 0;
  const carryingCount = stats.carrying ?? 0;
  const trips = stats.trips ?? 0;
  const meanPheromone = stats.meanPheromone ?? 0;

  if (dom.antsCountLive) {
    dom.antsCountLive.textContent = String(antCount);
  }
  if (dom.antsCarryingLive) {
    dom.antsCarryingLive.textContent = String(carryingCount);
  }
  if (dom.antsTripsLive) {
    dom.antsTripsLive.textContent = String(trips);
  }
  if (dom.antsPheromoneLive) {
    dom.antsPheromoneLive.textContent = meanPheromone.toFixed(2);
  }
  if (dom.chartAntTripsLive) {
    dom.chartAntTripsLive.textContent = String(trips);
  }
  if (dom.chartAntPheromoneLive) {
    dom.chartAntPheromoneLive.textContent = meanPheromone.toFixed(2);
  }
  if (dom.chartAntCountLive) {
    dom.chartAntCountLive.textContent = String(antCount);
  }

  antChartFrameCounter += 1;
  if (antChartFrameCounter % 3 === 0) {
    pushTrendValue(antCountHistory, antCount);
    pushTrendValue(antTripsHistory, trips);
    pushTrendValue(antPheromoneHistory, meanPheromone);
    drawTrendCharts();
  }
}

function updatePreyStats(stats) {
  if (!stats) {
    return;
  }

  const preyCount = stats.preyCount ?? 0;
  const predatorCount = stats.predatorCount ?? 0;
  const eatenTotal = stats.eatenTotal ?? 0;

  if (dom.preyCountLive) {
    dom.preyCountLive.textContent = String(preyCount);
  }
  if (dom.preyPredatorLive) {
    dom.preyPredatorLive.textContent = String(predatorCount);
  }
  if (dom.preyEatenLive) {
    dom.preyEatenLive.textContent = String(eatenTotal);
  }
  if (dom.chartPreyCountLive) {
    dom.chartPreyCountLive.textContent = String(preyCount);
  }
  if (dom.chartPredatorCountLive) {
    dom.chartPredatorCountLive.textContent = String(predatorCount);
  }
  if (dom.chartPreyEatenLive) {
    dom.chartPreyEatenLive.textContent = String(eatenTotal);
  }

  updatePreyColormapLegend();

  preyChartFrameCounter += 1;
  if (preyChartFrameCounter % 3 === 0) {
    pushTrendValue(preyCountHistory, preyCount);
    pushTrendValue(predatorCountHistory, predatorCount);
    pushTrendValue(preyEatenHistory, eatenTotal);
    drawTrendCharts();
  }
}

function updateFireflyStats(stats) {
  if (!stats) {
    return;
  }

  const count = stats.count ?? 0;
  const order = stats.order ?? 0;
  const blinkRate = stats.blinkRate ?? 0;

  if (dom.chartFireflyCountLive) {
    dom.chartFireflyCountLive.textContent = String(count);
  }
  if (dom.chartFireflyOrderLive) {
    dom.chartFireflyOrderLive.textContent = order.toFixed(3);
  }
  if (dom.chartFireflyBlinkLive) {
    dom.chartFireflyBlinkLive.textContent = `${blinkRate.toFixed(1)} /s`;
  }

  fireflyChartFrameCounter += 1;
  if (fireflyChartFrameCounter % 3 === 0) {
    pushTrendValue(fireflyCountHistory, count);
    pushTrendValue(fireflyOrderHistory, order);
    pushTrendValue(fireflyBlinkHistory, blinkRate);
    drawTrendCharts();
  }
}

function refreshAntWorldGeometry() {
  antFoodSources = buildAntFoodSources();
  updateAntPheromonePlaneTransform();

  for (let i = 0; i < ants.length; i += 1) {
    applyAntBoundaryConditions(ants[i]);
  }

  if (params.boundaryMode === "lost") {
    removeLostAnts();
  }

  syncAntInstances();
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
  updateBoidStats(speedSum, neighborSum);
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

function updatePreyColormapLegend() {
  if (!dom.preyColormapLegendBar || !dom.preyColormapCmin || !dom.preyColormapCmax) {
    return;
  }

  if (params.preyColorMode !== "energy") {
    dom.preyColormapLegend?.classList.add("is-hidden");
    return;
  }

  dom.preyColormapLegend?.classList.remove("is-hidden");
  const gradient = colormapGradients[params.preyColormap] || colormapGradients.turbo;
  dom.preyColormapLegendBar.style.background = gradient;

  const range = preySimulation.getPredatorEnergyRange?.() ?? {
    min: 0,
    max: Math.max(0.1, (params.predatorSpawnEnergy ?? 2.8) * 2.4),
  };
  dom.preyColormapCmin.textContent = `cmin: ${Number(range.min || 0).toFixed(2)}`;
  dom.preyColormapCmax.textContent = `cmax: ${Number(range.max || 0).toFixed(2)}`;
}

function rebuildBoundsAndGrid() {
  world.rebuildBoundsAndGrid();
  updateViewportLabel();
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
    boidSimulation.syncInstances();
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
    boidSimulation.setCount(params.boidCount);
    resetBoidTrendCharts();
    syncCompactSectionSlider("boid-count");
  });
  activateCompactRangeControl("boid-count");

  bindRange("ant-speed", "ant-speed-value", (value) => {
    params.antSpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("ant-scale", "ant-scale-value", (value) => {
    params.antScale = value;
    antSimulation.syncInstances();
    return `${value.toFixed(2)} m`;
  });

  bindRange("ant-sensor-distance", "ant-sensor-distance-value", (value) => {
    params.antSensorDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("ant-food-sense-distance", "ant-food-sense-distance-value", (value) => {
    params.antFoodSenseDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("ant-sensor-angle", "ant-sensor-angle-value", (value) => {
    params.antSensorAngle = value;
    return `${Math.round(value)}°`;
  });

  bindRange("ant-turn-gain", "ant-turn-gain-value", (value) => {
    params.antTurnGain = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-goal-bias", "ant-goal-bias-value", (value) => {
    params.antGoalBias = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-departure-rate", "ant-departure-rate-value", (value) => {
    params.antDepartureRate = value;
    return `${value.toFixed(1)} ants/s`;
  });

  bindRange("ant-deposit-rate", "ant-deposit-rate-value", (value) => {
    params.antDepositRate = value;
    return value.toFixed(1);
  });

  bindRange("ant-diffusion-rate", "ant-diffusion-rate-value", (value) => {
    params.antDiffusionRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-evap-rate", "ant-evap-rate-value", (value) => {
    params.antEvapRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-food-add-mass", "ant-food-add-mass-value", (value) => {
    params.antFoodAddMassUg = value;
    return `${Math.round(value)} ug`;
  });

  const antCountInput = document.getElementById("ant-count");
  const antCountValue = document.getElementById("ant-count-value");
  if (antCountInput && antCountValue) {
    registerCompactRangeControl(antCountInput, antCountValue);
    antCountInput.addEventListener("input", () => {
      antCountValue.textContent = antCountInput.value;
      params.antCount = Number(antCountInput.value);
      antSimulation.setCount(params.antCount);
      resetAntTrendCharts();
      syncCompactSectionSlider("ant-count");
    });
    activateCompactRangeControl("ant-count");
  }

  bindRange("prey-speed", "prey-speed-value", (value) => {
    params.preySpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("predator-speed", "predator-speed-value", (value) => {
    params.predatorSpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("predator-sense-radius", "predator-sense-radius-value", (value) => {
    params.predatorSenseRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("predation-radius", "predation-radius-value", (value) => {
    params.predationRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("prey-birth-rate", "prey-birth-rate-value", (value) => {
    params.preyBirthRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("predation-rate-beta", "predation-rate-beta-value", (value) => {
    params.predationRateBeta = value;
    return value.toFixed(2);
  });

  bindRange("predator-energy-gain", "predator-energy-gain-value", (value) => {
    params.predatorEnergyGain = value;
    return value.toFixed(2);
  });

  bindRange("predator-energy-loss", "predator-energy-loss-value", (value) => {
    params.predatorEnergyLoss = value;
    return `${value.toFixed(2)} 1/s`;
  });

  const preyCountInput = document.getElementById("prey-count");
  const preyCountValue = document.getElementById("prey-count-value");
  if (preyCountInput && preyCountValue) {
    registerCompactRangeControl(preyCountInput, preyCountValue);
    preyCountInput.addEventListener("input", () => {
      preyCountValue.textContent = preyCountInput.value;
      params.preyCount = Number(preyCountInput.value);
      preySimulation.setPreyCount(params.preyCount);
      resetPreyTrendCharts();
      syncCompactSectionSlider("prey-count");
    });
    activateCompactRangeControl("prey-count");
  }

  const predatorCountInput = document.getElementById("predator-count");
  const predatorCountValue = document.getElementById("predator-count-value");
  if (predatorCountInput && predatorCountValue) {
    registerCompactRangeControl(predatorCountInput, predatorCountValue);
    predatorCountInput.addEventListener("input", () => {
      predatorCountValue.textContent = predatorCountInput.value;
      params.predatorCount = Number(predatorCountInput.value);
      preySimulation.setPredatorCount(params.predatorCount);
      resetPreyTrendCharts();
      syncCompactSectionSlider("predator-count");
    });
  }

  bindRange("firefly-size", "firefly-size-value", (value) => {
    params.fireflySize = value;
    fireflySimulation.syncInstances?.();
    return `${value.toFixed(2)} m`;
  });

  bindRange("firefly-speed", "firefly-speed-value", (value) => {
    params.fireflySpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("firefly-coupling", "firefly-coupling-value", (value) => {
    params.fireflyCoupling = value;
    return value.toFixed(2);
  });

  bindRange("firefly-radius", "firefly-radius-value", (value) => {
    params.fireflyRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("firefly-frequency", "firefly-frequency-value", (value) => {
    params.fireflyFrequencyHz = value;
    return `${value.toFixed(2)} Hz`;
  });

  bindRange("firefly-jitter", "firefly-jitter-value", (value) => {
    params.fireflyFreqJitterHz = value;
    return `${value.toFixed(2)} Hz`;
  });

  bindRange("firefly-noise", "firefly-noise-value", (value) => {
    params.fireflyPhaseNoise = value;
    return `${value.toFixed(2)} rad/s`;
  });

  const fireflyCountInput = document.getElementById("firefly-count");
  const fireflyCountValue = document.getElementById("firefly-count-value");
  if (fireflyCountInput && fireflyCountValue) {
    registerCompactRangeControl(fireflyCountInput, fireflyCountValue);
    fireflyCountInput.addEventListener("input", () => {
      fireflyCountValue.textContent = fireflyCountInput.value;
      params.fireflyCount = Number(fireflyCountInput.value);
      fireflySimulation.setCount(params.fireflyCount);
      resetFireflyTrendCharts();
      syncCompactSectionSlider("firefly-count");
    });
    activateCompactRangeControl("firefly-count");
  }

  const toggleCurrentSimulationPause = () => {
    params.paused = !params.paused;
    updateSimulationStateUI();
  };

  dom.togglePause.addEventListener("click", toggleCurrentSimulationPause);
  dom.toggleAntPause?.addEventListener("click", toggleCurrentSimulationPause);
  dom.togglePreyPause?.addEventListener("click", toggleCurrentSimulationPause);
  dom.toggleFireflyPause?.addEventListener("click", toggleCurrentSimulationPause);
  dom.runState?.addEventListener("click", toggleCurrentSimulationPause);

  dom.appletTabs?.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.getAttribute("data-applet-item");
      if (!mode) {
        return;
      }
      applyAppletMode(mode, { updateUrl: true, replaceHistory: false });
    });
  });

  dom.resetSim.addEventListener("click", () => {
    if (activeApplet !== "boid") {
      return;
    }
    boidSimulation.reset();
    resetBoidTrendCharts();
  });

  dom.resetAntSim?.addEventListener("click", () => {
    if (activeApplet !== "ants") {
      return;
    }
    antSimulation.reset();
    resetAntTrendCharts();
  });

  dom.resetPreySim?.addEventListener("click", () => {
    if (activeApplet !== "prey") {
      return;
    }
    preySimulation.reset();
    resetPreyTrendCharts();
  });

  dom.resetFireflySim?.addEventListener("click", () => {
    if (activeApplet !== "firefly") {
      return;
    }
    fireflySimulation.reset();
    resetFireflyTrendCharts();
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
    simulationManager.onBoundaryModeChanged();
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
  if (dom.antFoodPlacementEnabled) {
    dom.antFoodPlacementEnabled.checked = params.antFoodPlacementEnabled;
    dom.antFoodPlacementEnabled.addEventListener("change", () => {
      params.antFoodPlacementEnabled = dom.antFoodPlacementEnabled.checked;
    });
  }

  const visualControls = createVisualControls({
    params,
    dom,
    boidSimulation,
    antSimulation,
    preySimulation,
    updateBoidColormapLegend: updateColormapLegend,
    updatePreyColormapLegend,
  });
  visualControls.bind();
  visualControls.syncFromParams();

  updateSimulationStateUI();
  updateProjectionToggleUI();

  switchToPerspective();
}

function setupAppRouting() {
  const initial = getAppletFromUrl();
  applyAppletMode(initial, { updateUrl: true, replaceHistory: true });

  window.addEventListener("popstate", () => {
    applyAppletMode(getAppletFromUrl(), { updateUrl: false, replaceHistory: true });
  });
}

function normalizeAppletId(value) {
  if (typeof value !== "string") {
    return "boid";
  }

  const normalized = value.toLowerCase().trim();
  return APPLET_IDS.has(normalized) ? normalized : "boid";
}

function getAppletFromUrl() {
  try {
    const url = new URL(window.location.href);
    return normalizeAppletId(url.searchParams.get("app"));
  } catch (error) {
    return "boid";
  }
}

function setAppletInUrl(appletId, replaceHistory) {
  const url = new URL(window.location.href);
  url.searchParams.set("app", appletId);
  const historyMethod = replaceHistory ? "replaceState" : "pushState";
  window.history[historyMethod]?.({ app: appletId }, "", url);
}

function applyDefaultProjectionForApplet(appletId) {
  if (appletProjectionInitialized[appletId]) {
    return;
  }

  if (appletId === "ants" || appletId === "prey") {
    params.projectionMode = "orthographic";
    switchToOrthographicTop();
  } else {
    params.projectionMode = "perspective";
    switchToPerspective();
  }

  appletProjectionInitialized[appletId] = true;
  updateProjectionToggleUI();
}

function applyAppletVisibility(appletId) {
  dom.appVisibleElements?.forEach((element) => {
    const visibleValue = element.getAttribute("data-app-visible");
    const visibleOnApps = visibleValue
      ? visibleValue
          .split(/[,\s]+/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const isVisible = visibleOnApps.includes(appletId);
    element.classList.toggle("is-hidden", !isVisible);
  });

  refreshVisibleSectionDividers();
}

function refreshVisibleSectionDividers() {
  const panels = [dom.leftPanel, dom.rightPanel];

  panels.forEach((panel) => {
    if (!panel) {
      return;
    }

    const sections = panel.querySelectorAll("[data-control-section]");
    let firstVisibleFound = false;

    sections.forEach((section) => {
      const hidden = section.classList.contains("is-hidden");
      const isFirstVisible = !hidden && !firstVisibleFound;
      section.classList.toggle("is-first-visible", isFirstVisible);
      if (isFirstVisible) {
        firstVisibleFound = true;
      }
    });
  });
}

function applySceneObjectVisibility(appletId) {
  simulationManager.setActive(appletId);
}

function applyAppletMode(appletId, options = {}) {
  const normalizedId = normalizeAppletId(appletId);
  const { updateUrl = false, replaceHistory = false } = options;
  const previousApplet = activeApplet;

  if (previousApplet && previousApplet !== normalizedId && APPLET_IDS.has(previousApplet)) {
    appletCameraState[previousApplet] = cameraController.getCameraSnapshot();
  }

  activeApplet = normalizedId;

  dom.appletTabs?.forEach((tab) => {
    const tabApplet = tab.getAttribute("data-applet-item");
    const isActive = tabApplet === normalizedId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  applyAppletVisibility(normalizedId);
  applySceneObjectVisibility(normalizedId);
  const restoredCamera = cameraController.restoreCameraSnapshot(appletCameraState[normalizedId]);
  if (!restoredCamera) {
    applyDefaultProjectionForApplet(normalizedId);
  }

  setControlValue("camera-fov", params.cameraFov, "camera-fov-value", (value) => `${Math.round(value)}°`);
  updateProjectionToggleUI();

  if (normalizedId === "boid") {
    if (previousApplet === "ants") {
      antsPausedPreference = params.paused;
    } else if (previousApplet === "prey") {
      preyPausedPreference = params.paused;
    }
    params.paused = boidPausedPreference;
    updateBoidStats(lastBoidStats);
  } else if (normalizedId === "ants") {
    if (previousApplet === "boid") {
      boidPausedPreference = params.paused;
    } else if (previousApplet === "prey") {
      preyPausedPreference = params.paused;
    }
    params.paused = antsPausedPreference;
    updateAntStats(lastAntStats);
  } else {
    if (previousApplet === "boid") {
      boidPausedPreference = params.paused;
    } else if (previousApplet === "ants") {
      antsPausedPreference = params.paused;
    }
    params.paused = preyPausedPreference;
    updatePreyStats(lastPreyStats);
  }

  updateSimulationStateUI();
  updateViewportLabel();
  handleViewportResize();

  if (updateUrl) {
    setAppletInUrl(normalizedId, replaceHistory);
  }
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
    if (dom.toggleAntPause) {
      dom.toggleAntPause.innerHTML = '<i class=\"bi bi-play-fill me-1\" aria-hidden=\"true\"></i><span>Resume</span>';
    }
    if (dom.togglePreyPause) {
      dom.togglePreyPause.innerHTML = '<i class=\"bi bi-play-fill me-1\" aria-hidden=\"true\"></i><span>Resume</span>';
    }
    dom.runState.innerHTML = '<i class=\"bi bi-pause-fill state-icon\" aria-hidden=\"true\"></i>';
    dom.runState.setAttribute("title", "Paused. Click to resume simulation");
    dom.runState.setAttribute("aria-label", "Paused. Click to resume simulation");
    dom.runState.setAttribute("aria-pressed", "true");
    dom.runState.disabled = false;
    return;
  }

  dom.togglePause.innerHTML = '<i class=\"bi bi-pause-fill me-1\" aria-hidden=\"true\"></i><span>Pause</span>';
  if (dom.toggleAntPause) {
    dom.toggleAntPause.innerHTML = '<i class=\"bi bi-pause-fill me-1\" aria-hidden=\"true\"></i><span>Pause</span>';
  }
  if (dom.togglePreyPause) {
    dom.togglePreyPause.innerHTML = '<i class=\"bi bi-pause-fill me-1\" aria-hidden=\"true\"></i><span>Pause</span>';
  }
  dom.runState.innerHTML = '<i class=\"bi bi-play-fill state-icon\" aria-hidden=\"true\"></i>';
  dom.runState.setAttribute("title", "Running. Click to pause simulation");
  dom.runState.setAttribute("aria-label", "Running. Click to pause simulation");
  dom.runState.setAttribute("aria-pressed", "false");
  dom.runState.disabled = false;
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
  simulationManager.applyTheme(theme);
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

function setupAntFoodPlacementInteraction() {
  const canvas = renderer?.domElement;
  if (!canvas) {
    return;
  }

  canvas.addEventListener("dblclick", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (activeApplet !== "ants" || !params.antFoodPlacementEnabled) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return;
    }

    antFoodPointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    antFoodRaycaster.setFromCamera(antFoodPointerNdc, cameraController.getActiveCamera());
    const floorZ = -params.worldSizeZ * 0.5 + 0.06;
    antFoodPlane.constant = -floorZ;
    const hitPoint = new THREE.Vector3();
    if (!antFoodRaycaster.ray.intersectPlane(antFoodPlane, hitPoint)) {
      return;
    }

    antSimulation.addFoodAt(hitPoint.x, hitPoint.y, params.antFoodAddMassUg);
  });
}

function handleViewportResize() {
  updateNarrowScreenBlocker();
  resizeRenderer();
  resizeTrendCharts();
}

function updateNarrowScreenBlocker() {
  if (!dom.narrowScreenBlocker) {
    return;
  }

  const tooNarrow = window.innerWidth < narrowScreenThresholdPx;
  dom.narrowScreenBlocker.classList.toggle("is-hidden", !tooNarrow);
  dom.narrowScreenBlocker.setAttribute("aria-hidden", String(!tooNarrow));
}

function setupTrendCharts() {
  resizeTrendCharts();
  resetBoidTrendCharts();
  resetAntTrendCharts();
  resetPreyTrendCharts();
  resetFireflyTrendCharts();
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

function resetBoidTrendCharts() {
  countHistory.length = 0;
  speedHistory.length = 0;
  neighborHistory.length = 0;
  boidChartFrameCounter = 0;
  drawTrendCharts();
}

function resetAntTrendCharts() {
  antCountHistory.length = 0;
  antTripsHistory.length = 0;
  antPheromoneHistory.length = 0;
  antChartFrameCounter = 0;
  drawTrendCharts();
}

function resetPreyTrendCharts() {
  preyCountHistory.length = 0;
  predatorCountHistory.length = 0;
  preyEatenHistory.length = 0;
  preyChartFrameCounter = 0;
  drawTrendCharts();
}

function resetFireflyTrendCharts() {
  fireflyCountHistory.length = 0;
  fireflyOrderHistory.length = 0;
  fireflyBlinkHistory.length = 0;
  fireflyChartFrameCounter = 0;
  drawTrendCharts();
}

function resizeTrendCharts() {
  resizeCanvasBackingStore(dom.chartCount);
  resizeCanvasBackingStore(dom.chartSpeed);
  resizeCanvasBackingStore(dom.chartNeighbors);
  resizeCanvasBackingStore(dom.chartAntTrips);
  resizeCanvasBackingStore(dom.chartAntPheromone);
  resizeCanvasBackingStore(dom.chartAntCount);
  resizeCanvasBackingStore(dom.chartPreyCount);
  resizeCanvasBackingStore(dom.chartPredatorCount);
  resizeCanvasBackingStore(dom.chartPreyEaten);
  resizeCanvasBackingStore(dom.chartFireflyCount);
  resizeCanvasBackingStore(dom.chartFireflyOrder);
  resizeCanvasBackingStore(dom.chartFireflyBlink);
  drawTrendCharts();
}

function resizeCanvasBackingStore(canvas) {
  resizeChartCanvas(canvas);
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
  drawTrendChart(dom.chartAntTrips, antTripsHistory, {
    stroke: "#f1b55b",
    fill: "rgba(241, 181, 91, 0.18)",
    axisLabel: "trips",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartAntCount, antCountHistory, {
    stroke: "#7ec4ff",
    fill: "rgba(126, 196, 255, 0.14)",
    axisLabel: "count",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartAntPheromone, antPheromoneHistory, {
    stroke: "#79d2ff",
    fill: "rgba(121, 210, 255, 0.18)",
    axisLabel: "a.u.",
    tickFormatter: (value) => value.toFixed(2),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartPreyCount, preyCountHistory, {
    stroke: "#6be39f",
    fill: "rgba(107, 227, 159, 0.16)",
    axisLabel: "count",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartPredatorCount, predatorCountHistory, {
    stroke: "#ff9b70",
    fill: "rgba(255, 155, 112, 0.18)",
    axisLabel: "count",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartPreyEaten, preyEatenHistory, {
    stroke: "#f0cf72",
    fill: "rgba(240, 207, 114, 0.18)",
    axisLabel: "events",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartFireflyCount, fireflyCountHistory, {
    stroke: "#7ec4ff",
    fill: "rgba(126, 196, 255, 0.14)",
    axisLabel: "count",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartFireflyOrder, fireflyOrderHistory, {
    stroke: "#ffe38d",
    fill: "rgba(255, 227, 141, 0.18)",
    axisLabel: "R",
    tickFormatter: (value) => value.toFixed(2),
    minValue: 0,
    maxValue: 1,
  });
  drawTrendChart(dom.chartFireflyBlink, fireflyBlinkHistory, {
    stroke: "#ffd26e",
    fill: "rgba(255, 210, 110, 0.16)",
    axisLabel: "/s",
    tickFormatter: (value) => value.toFixed(1),
    forceZeroMin: true,
  });
}

function drawTrendChart(canvas, values, options) {
  renderTrendChart(canvas, values, options);
}

function pushTrendValue(series, value) {
  appendTrendValue(series, value, chartMaxPoints);
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
  let labelTitleNode = null;
  if (labelNameEl) {
    const labelClone = labelNameEl.cloneNode(true);
    labelClone.querySelectorAll("i").forEach((iconEl) => iconEl.remove());
    // Avoid inheriting the flex label layout in compact header text.
    labelClone.classList.remove("label-name");
    labelTitleNode = labelClone;
  }

  compactRangeRegistry.set(input.id, {
    input,
    output,
    sectionKey,
    labelEl,
    labelText,
    labelTitleNode,
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
  if (binding.labelTitleNode) {
    sectionState.title.replaceChildren(binding.labelTitleNode.cloneNode(true));
  } else {
    sectionState.title.textContent = binding.labelText;
  }
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

  const groundBase = Math.max(params.worldSizeX, params.worldSizeY);
  const divisions = Math.max(10, Math.floor(groundBase / 6));
  const gridSizeM = groundBase / Math.max(divisions, 1);
  const appLabel =
    activeApplet === "ants" ? "Ant Trails" : activeApplet === "prey" ? "Prey Chain" : "Boids";
  const projectionLabel =
    params.projectionMode === "orthographic" ? "Ortho Top (Z+)" : "Perspective";
  dom.frameSize.textContent = `Grid size: ${gridSizeM.toFixed(1)} m | ${appLabel} | ${projectionLabel}`;
}

function updateCameraTelemetry() {
  cameraController.updateTelemetry();
}

function updateBoidStats(stats) {
  if (!stats) {
    return;
  }

  const boidCount = stats.count ?? 0;
  const speedSum = stats.speedSum ?? 0;
  const neighborSum = stats.neighborSum ?? 0;
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

  boidChartFrameCounter += 1;
  if (boidChartFrameCounter % 3 === 0) {
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
