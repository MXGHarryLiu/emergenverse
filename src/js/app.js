// Main application bootstrap that wires simulations, UI state, charts, and routing.
import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { applyWorldTheme, createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";
import { BoidSimulation, BOID_DEFAULT_PARAMS } from "./boid.js";
import { AntSimulation, ANT_DEFAULT_PARAMS } from "./ant.js";
import { PreySimulation, PREY_DEFAULT_PARAMS } from "./prey.js";
import { FireflySimulation, FIREFLY_DEFAULT_PARAMS } from "./firefly.js";
import { GalaxySimulation, GALAXY_DEFAULT_PARAMS } from "./galaxy.js";
import { SimulationManager } from "./simulationManager.js";
import { createVisualControls } from "./visualControls.js";
import { setupUiOverlays } from "./uiOverlays.js";
import { APPLET_CONFIGS, APPLET_META, APPLET_ORDER } from "./appletConfigs.js";
import { renderAppletSectionsFromConfig } from "./uiTemplates.js";
import {
  drawTrendChart as renderTrendChart,
  pushTrendValue as appendTrendValue,
  resizeCanvasBackingStore as resizeChartCanvas,
} from "./chartUtils.js";

const params = {
  worldSizeX: 100,
  worldSizeY: 100,
  worldSizeZ: 100,
  worldGridSize: 5,
  boundaryMode: "cyclic",
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  showBounds: true,
  cameraLocked: false,
  projectionMode: "perspective",
  keyboardMoveSpeed: 42,
  paused: false,
  boid: { ...BOID_DEFAULT_PARAMS },
  ants: { ...ANT_DEFAULT_PARAMS },
  prey: { ...PREY_DEFAULT_PARAMS },
  firefly: { ...FIREFLY_DEFAULT_PARAMS },
  galaxy: { ...GALAXY_DEFAULT_PARAMS },
};

const boidParams = params.boid;
const antParams = params.ants;
const preyParams = params.prey;
const fireflyParams = params.firefly;
const galaxyParams = params.galaxy;

renderAppletSectionsFromConfig();
scheduleMathRendering();

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
  chartToggles: document.querySelectorAll("[data-chart-toggle]"),
  appletTabs: document.querySelectorAll("[data-applet-item]"),
  appVisibleElements: document.querySelectorAll("[data-app-visible]"),
  runState: document.getElementById("run-state"),
  resetCamera: document.getElementById("reset-camera"),
  homeCamera: document.getElementById("home-camera"),
  showBounds: document.getElementById("show-bounds"),
  cameraLocked: document.getElementById("camera-locked"),
  boundaryMode: document.getElementById("boundary-mode"),
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
  cameraPosX: document.getElementById("camera-pos-x"),
  cameraPosY: document.getElementById("camera-pos-y"),
  cameraPosZ: document.getElementById("camera-pos-z"),
  cameraRoll: document.getElementById("camera-roll"),
  cameraPitch: document.getElementById("camera-pitch"),
  cameraYaw: document.getElementById("camera-yaw"),
};

const elementCache = new Map();

function getElement(id) {
  if (!id) {
    return null;
  }
  if (!elementCache.has(id)) {
    elementCache.set(id, document.getElementById(id));
  }
  return elementCache.get(id);
}

function setElementText(id, text) {
  const element = getElement(id);
  if (element) {
    element.textContent = text;
  }
}

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
const APPLET_IDS = new Set(APPLET_ORDER);
const appletCameraState = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));
const appletWorldState = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, createDefaultWorldState(id)]),
);
let worldStatePersistenceEnabled = false;

let activeApplet = "boid";
const appletPausedPreferences = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, params.paused]),
);
const appletProjectionInitialized = Object.fromEntries(APPLET_ORDER.map((id) => [id, false]));

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

const world = createWorldManager({
  params,
  onWorldGeometryChanged: () => {
    updateOrthographicCamera(false);
    simulationManager.onWorldGeometryChanged();
  },
});
const scene = world.scene;

const simulationManager = new SimulationManager();

const lastAppletStats = {
  boid: {
    count: 0,
    speedSum: 0,
    neighborSum: 0,
  },
  ants: {
    count: 0,
    carrying: 0,
    trips: 0,
    meanPheromone: 0,
    maxPheromone: 0,
  },
  prey: {
    preyCount: 0,
    predatorCount: 0,
    eatenTotal: 0,
  },
  firefly: {
    count: 0,
    order: 0,
    blinkRate: 0,
  },
  galaxy: {
    count: 0,
    meanRadius: 0,
    meanSpeed: 0,
  },
};

const boidSimulation = new BoidSimulation({
  scene,
  params,
  world,
  onStats: (stats) => {
    lastAppletStats.boid = stats;
    updateBoidStats(stats);
  },
});

const antSimulation = new AntSimulation({
  scene,
  params,
  onStats: (stats) => {
    lastAppletStats.ants = stats;
    updateAntStats(stats);
  },
});

const preySimulation = new PreySimulation({
  scene,
  params,
  onStats: (stats) => {
    lastAppletStats.prey = stats;
    updatePreyStats(stats);
  },
});

const fireflySimulation = new FireflySimulation({
  scene,
  params,
  onStats: (stats) => {
    lastAppletStats.firefly = stats;
    updateFireflyStats(stats);
  },
});

const galaxySimulation = new GalaxySimulation({
  scene,
  params,
  world,
  onStats: (stats) => {
    lastAppletStats.galaxy = stats;
    updateGalaxyStats(stats);
  },
});

simulationManager.register("boid", boidSimulation);
simulationManager.register("ants", antSimulation);
simulationManager.register("prey", preySimulation);
simulationManager.register("firefly", fireflySimulation);
simulationManager.register("galaxy", galaxySimulation);

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

const colormapGradients = buildColormapGradients(colormapStops);

const chartMaxPoints = 160;
const chartState = {
  boid: {
    frameCounter: 0,
    metrics: [
      createChartMetric("chart-count", "chart-count-live", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-speed", "chart-speed-live", () => "0.00 m/s", {
        stroke: "#4cd3b6",
        fill: "rgba(76, 211, 182, 0.14)",
        axisLabel: "m/s",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetric("chart-neighbors", "chart-neighbors-live", () => "0.00", {
        stroke: "#5aa4ff",
        fill: "rgba(90, 164, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)),
        forceZeroMin: true,
      }),
    ],
  },
  ants: {
    frameCounter: 0,
    metrics: [
      createChartMetric("chart-ant-count", "chart-ant-count-live", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-ant-trips", "chart-ant-trips-live", () => "0", {
        stroke: "#f1b55b",
        fill: "rgba(241, 181, 91, 0.18)",
        axisLabel: "trips",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-ant-pheromone", "chart-ant-pheromone-live", () => "0.00", {
        stroke: "#79d2ff",
        fill: "rgba(121, 210, 255, 0.18)",
        axisLabel: "a.u.",
        tickFormatter: (value) => value.toFixed(2),
        forceZeroMin: true,
      }),
    ],
  },
  prey: {
    frameCounter: 0,
    metrics: [
      createChartMetric("chart-prey-count", "chart-prey-count-live", () => "0", {
        stroke: "#6be39f",
        fill: "rgba(107, 227, 159, 0.16)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-predator-count", "chart-predator-count-live", () => "0", {
        stroke: "#ff9b70",
        fill: "rgba(255, 155, 112, 0.18)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-prey-eaten", "chart-prey-eaten-live", () => "0", {
        stroke: "#f0cf72",
        fill: "rgba(240, 207, 114, 0.18)",
        axisLabel: "events",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
    ],
  },
  firefly: {
    frameCounter: 0,
    metrics: [
      createChartMetric("chart-firefly-count", "chart-firefly-count-live", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-firefly-order", "chart-firefly-order-live", () => "0.000", {
        stroke: "#ffe38d",
        fill: "rgba(255, 227, 141, 0.18)",
        axisLabel: "R",
        tickFormatter: (value) => value.toFixed(2),
        minValue: 0,
        maxValue: 1,
      }),
      createChartMetric("chart-firefly-blink", "chart-firefly-blink-live", () => "0.0 /s", {
        stroke: "#ffd26e",
        fill: "rgba(255, 210, 110, 0.16)",
        axisLabel: "/s",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
    ],
  },
  galaxy: {
    frameCounter: 0,
    metrics: [
      createChartMetric("chart-galaxy-count", "chart-galaxy-count-live", () => "0", {
        stroke: "#8eb7ff",
        fill: "rgba(142, 183, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
      createChartMetric("chart-galaxy-radius", "chart-galaxy-radius-live", () => "0.00 m", {
        stroke: "#9de2ff",
        fill: "rgba(157, 226, 255, 0.16)",
        axisLabel: "m",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
      createChartMetric("chart-galaxy-speed", "chart-galaxy-speed-live", () => "0.00 m/s", {
        stroke: "#ffbe8d",
        fill: "rgba(255, 190, 141, 0.16)",
        axisLabel: "m/s",
        tickFormatter: (value) => value.toFixed(1),
        forceZeroMin: true,
      }),
    ],
  },
};
const applets = {
  boid: createAppletRuntime({ id: "boid", simulation: boidSimulation, speedParam: "simSpeed", applyStats: updateBoidStats }),
  ants: createAppletRuntime({ id: "ants", simulation: antSimulation, speedParam: "simSpeed", applyStats: updateAntStats }),
  prey: createAppletRuntime({ id: "prey", simulation: preySimulation, speedParam: "simSpeed", applyStats: updatePreyStats }),
  firefly: createAppletRuntime({ id: "firefly", simulation: fireflySimulation, speedParam: "simSpeed", applyStats: updateFireflyStats }),
  galaxy: createAppletRuntime({ id: "galaxy", simulation: galaxySimulation, speedParam: "simSpeed", applyStats: updateGalaxyStats }),
};
let fpsSmoothed = 0;
let fpsUiAccumulator = 0;
const narrowScreenThresholdPx = 980;
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
setupTrendCharts();
setupChartCollapses();
setupAppRouting();
worldStatePersistenceEnabled = true;
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
  if (simulationManager.activeId !== activeApplet) {
    simulationManager.setActive(activeApplet);
  }
  simulationManager.enforceVisibility?.();
  updateFpsMetric(dt);
  if (!params.paused) {
    let remaining = dt * getActiveSimulationSpeed();
    const maxSubstep = 0.05;
    while (remaining > 0) {
      const stepDt = Math.min(maxSubstep, remaining);
      simulationManager.step(stepDt, activeApplet);
      remaining -= stepDt;
    }
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
  const fpsText = fpsSmoothed.toFixed(1);
  APPLET_ORDER.forEach((appletId) => {
    setElementText(APPLET_META[appletId]?.fpsValueId, fpsText);
  });
}

function updateAntStats(stats) {
  if (!stats) {
    return;
  }

  const antCount = stats.count ?? 0;
  const carryingCount = stats.carrying ?? 0;
  const trips = stats.trips ?? 0;
  const meanPheromone = stats.meanPheromone ?? 0;

  setElementText("ants-carrying-live", String(carryingCount));
  updateChartMetrics("ants", [antCount, trips, meanPheromone], [
    String(antCount),
    String(trips),
    meanPheromone.toFixed(2),
  ]);
}

function updatePreyStats(stats) {
  if (!stats) {
    return;
  }

  const preyCount = stats.preyCount ?? 0;
  const predatorCount = stats.predatorCount ?? 0;
  const eatenTotal = stats.eatenTotal ?? 0;

  updatePreyColormapLegend();
  updateChartMetrics("prey", [preyCount, predatorCount, eatenTotal], [
    String(preyCount),
    String(predatorCount),
    String(eatenTotal),
  ]);
}

function updateFireflyStats(stats) {
  if (!stats) {
    return;
  }

  const count = stats.count ?? 0;
  const order = stats.order ?? 0;
  const blinkRate = stats.blinkRate ?? 0;

  updateChartMetrics("firefly", [count, order, blinkRate], [
    String(count),
    order.toFixed(3),
    `${blinkRate.toFixed(1)} /s`,
  ]);
}

function updateGalaxyStats(stats) {
  if (!stats) {
    return;
  }

  const count = stats.count ?? 0;
  const meanRadius = stats.meanRadius ?? 0;
  const meanSpeed = stats.meanSpeed ?? 0;

  updateChartMetrics("galaxy", [count, meanRadius, meanSpeed], [
    String(count),
    `${meanRadius.toFixed(2)} m`,
    `${meanSpeed.toFixed(2)} m/s`,
  ]);
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


function getColorModeRange() {
  if (boidParams.colorMode === "speed") {
    return {
      min: 0,
      max: boidParams.maxSpeed,
      unit: "m/s",
      digits: 1,
    };
  }

  if (boidParams.colorMode === "altitude") {
    const halfZ = params.worldSizeZ * 0.5;
    return {
      min: -halfZ,
      max: halfZ,
      unit: "m",
      digits: 1,
    };
  }

  if (boidParams.colorMode === "neighbors") {
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

  if (boidParams.colorMode === "none") {
    if (dom.colormapLegend) {
      dom.colormapLegend.classList.add("is-hidden");
    }
    return;
  }

  if (dom.colormapLegend) {
    dom.colormapLegend.classList.remove("is-hidden");
  }

  const gradient = colormapGradients[boidParams.colormap] || colormapGradients.turbo;
  dom.colormapLegendBar.style.background = gradient;

  const range = getColorModeRange();
  dom.colormapCmin.textContent = `cmin: ${formatLegendValue(range.min, range.unit, range.digits)}`;
  dom.colormapCmax.textContent = `cmax: ${formatLegendValue(range.max, range.unit, range.digits)}`;
}

function updatePreyColormapLegend() {
  if (!dom.preyColormapLegendBar || !dom.preyColormapCmin || !dom.preyColormapCmax) {
    return;
  }

  if (preyParams.colorMode !== "energy") {
    dom.preyColormapLegend?.classList.add("is-hidden");
    return;
  }

  dom.preyColormapLegend?.classList.remove("is-hidden");
  const gradient = colormapGradients[preyParams.colormap] || colormapGradients.turbo;
  dom.preyColormapLegendBar.style.background = gradient;

  const range = preySimulation.getPredatorEnergyRange?.() ?? {
    min: 0,
    max: Math.max(0.1, (preyParams.predatorSpawnEnergy ?? 2.8) * 2.4),
  };
  dom.preyColormapCmin.textContent = `cmin: ${Number(range.min || 0).toFixed(2)}`;
  dom.preyColormapCmax.textContent = `cmax: ${Number(range.max || 0).toFixed(2)}`;
}

function rebuildBoundsAndGrid() {
  world.rebuildBoundsAndGrid();
  updateViewportLabel();
}

function setupControls() {
  bindRange("boid-sim-speed", "boid-sim-speed-value", (value) => {
    boidParams.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("boid-scale", "boid-scale-value", (value) => {
    boidParams.scale = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("perception-radius", "perception-radius-value", (value) => {
    boidParams.perceptionRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("separation-distance", "separation-distance-value", (value) => {
    boidParams.separationDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("max-speed", "max-speed-value", (value) => {
    boidParams.maxSpeed = value;
    boidSimulation.syncInstances();
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("max-accel", "max-accel-value", (value) => {
    boidParams.maxAccel = value;
    return `${value.toFixed(1)} m/s²`;
  });

  bindRange("alignment-weight", "alignment-weight-value", (value) => {
    boidParams.alignmentWeight = value;
    return value.toFixed(2);
  });

  bindRange("cohesion-weight", "cohesion-weight-value", (value) => {
    boidParams.cohesionWeight = value;
    return value.toFixed(2);
  });

  bindRange("separation-weight", "separation-weight-value", (value) => {
    boidParams.separationWeight = value;
    return value.toFixed(2);
  });

  bindRange("world-size-x", "world-size-x-value", (value) => {
    params.worldSizeX = value;
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("world-size-y", "world-size-y-value", (value) => {
    params.worldSizeY = value;
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("world-size-z", "world-size-z-value", (value) => {
    params.worldSizeZ = value;
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
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
    boidParams.count = Number(boidCountInput.value);
    boidSimulation.setCount(boidParams.count);
    resetTrendCharts("boid");
    syncCompactSectionSlider("boid-count");
  });
  activateCompactRangeControl("boid-count");

  bindRange("ant-speed", "ant-speed-value", (value) => {
    antParams.speed = value;
    return `${value.toFixed(3)} m/s`;
  });

  bindRange("ant-sim-speed", "ant-sim-speed-value", (value) => {
    antParams.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("ant-scale", "ant-scale-value", (value) => {
    antParams.scale = value;
    antSimulation.syncInstances();
    return `${value.toFixed(3)} m`;
  });

  bindRange("ant-sensor-distance", "ant-sensor-distance-value", (value) => {
    antParams.sensorDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("ant-food-sense-distance", "ant-food-sense-distance-value", (value) => {
    antParams.foodSenseDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("ant-sensor-angle", "ant-sensor-angle-value", (value) => {
    antParams.sensorAngle = value;
    return `${Math.round(value)}°`;
  });

  bindRange("ant-turn-gain", "ant-turn-gain-value", (value) => {
    antParams.turnGain = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-goal-bias", "ant-goal-bias-value", (value) => {
    antParams.goalBias = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-departure-rate", "ant-departure-rate-value", (value) => {
    antParams.departureRate = value;
    return `${value.toFixed(1)} ants/s`;
  });

  bindRange("ant-deposit-rate", "ant-deposit-rate-value", (value) => {
    antParams.depositRate = value;
    return value.toFixed(1);
  });

  bindRange("ant-diffusion-rate", "ant-diffusion-rate-value", (value) => {
    antParams.diffusionRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-evap-rate", "ant-evap-rate-value", (value) => {
    antParams.evapRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  const antCountInput = document.getElementById("ant-count");
  const antCountValue = document.getElementById("ant-count-value");
  if (antCountInput && antCountValue) {
    registerCompactRangeControl(antCountInput, antCountValue);
    antCountInput.addEventListener("input", () => {
      antCountValue.textContent = antCountInput.value;
      antParams.count = Number(antCountInput.value);
      antSimulation.setCount(antParams.count);
      resetTrendCharts("ants");
      syncCompactSectionSlider("ant-count");
    });
    activateCompactRangeControl("ant-count");
  }

  bindRange("prey-speed", "prey-speed-value", (value) => {
    preyParams.speed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("prey-sim-speed", "prey-sim-speed-value", (value) => {
    preyParams.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("predator-speed", "predator-speed-value", (value) => {
    preyParams.predatorSpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("predator-sense-radius", "predator-sense-radius-value", (value) => {
    preyParams.predatorSenseRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("predation-radius", "predation-radius-value", (value) => {
    preyParams.predationRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("prey-birth-rate", "prey-birth-rate-value", (value) => {
    preyParams.birthRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("predation-rate-beta", "predation-rate-beta-value", (value) => {
    preyParams.predationRateBeta = value;
    return value.toFixed(2);
  });

  bindRange("predator-energy-gain", "predator-energy-gain-value", (value) => {
    preyParams.predatorEnergyGain = value;
    return value.toFixed(2);
  });

  bindRange("predator-energy-loss", "predator-energy-loss-value", (value) => {
    preyParams.predatorEnergyLoss = value;
    return `${value.toFixed(2)} 1/s`;
  });

  const preyCountInput = document.getElementById("prey-count");
  const preyCountValue = document.getElementById("prey-count-value");
  if (preyCountInput && preyCountValue) {
    registerCompactRangeControl(preyCountInput, preyCountValue);
    preyCountInput.addEventListener("input", () => {
      preyCountValue.textContent = preyCountInput.value;
      preyParams.count = Number(preyCountInput.value);
      preySimulation.setPreyCount(preyParams.count);
      resetTrendCharts("prey");
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
      preyParams.predatorCount = Number(predatorCountInput.value);
      preySimulation.setPredatorCount(preyParams.predatorCount);
      resetTrendCharts("prey");
      syncCompactSectionSlider("predator-count");
    });
  }

  bindRange("firefly-size", "firefly-size-value", (value) => {
    fireflyParams.size = value;
    fireflySimulation.syncInstances?.();
    return `${value.toFixed(2)} m`;
  });

  bindRange("firefly-sim-speed", "firefly-sim-speed-value", (value) => {
    fireflyParams.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("firefly-speed", "firefly-speed-value", (value) => {
    fireflyParams.speed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("firefly-coupling", "firefly-coupling-value", (value) => {
    fireflyParams.coupling = value;
    return value.toFixed(2);
  });

  bindRange("firefly-radius", "firefly-radius-value", (value) => {
    fireflyParams.radius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("firefly-frequency", "firefly-frequency-value", (value) => {
    fireflyParams.frequencyHz = value;
    return `${value.toFixed(2)} Hz`;
  });

  bindRange("firefly-jitter", "firefly-jitter-value", (value) => {
    fireflyParams.freqJitterHz = value;
    return `${value.toFixed(2)} Hz`;
  });

  bindRange("firefly-noise", "firefly-noise-value", (value) => {
    fireflyParams.phaseNoise = value;
    return `${value.toFixed(2)} rad/s`;
  });

  const fireflyCountInput = document.getElementById("firefly-count");
  const fireflyCountValue = document.getElementById("firefly-count-value");
  if (fireflyCountInput && fireflyCountValue) {
    registerCompactRangeControl(fireflyCountInput, fireflyCountValue);
    fireflyCountInput.addEventListener("input", () => {
      fireflyCountValue.textContent = fireflyCountInput.value;
      fireflyParams.count = Number(fireflyCountInput.value);
      fireflySimulation.setCount(fireflyParams.count);
      resetTrendCharts("firefly");
      syncCompactSectionSlider("firefly-count");
    });
    activateCompactRangeControl("firefly-count");
  }

  bindRange("galaxy-particle-size", "galaxy-particle-size-value", (value) => {
    galaxyParams.particleSize = value;
    galaxySimulation.syncInstances?.();
    return `${value.toFixed(2)} m`;
  });

  bindRange("galaxy-sim-speed", "galaxy-sim-speed-value", (value) => {
    galaxyParams.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("galaxy-spin", "galaxy-spin-value", (value) => {
    galaxyParams.spin = value;
    return value.toFixed(2);
  });

  bindRange("galaxy-gravity", "galaxy-gravity-value", (value) => {
    galaxyParams.gravity = value;
    return value.toFixed(1);
  });

  bindRange("galaxy-central-mass", "galaxy-central-mass-value", (value) => {
    galaxyParams.centralMass = value;
    return `${Math.round(value)}`;
  });

  bindRange("galaxy-softening", "galaxy-softening-value", (value) => {
    galaxyParams.softening = value;
    return `${value.toFixed(2)} m`;
  });

  bindRange("galaxy-damping", "galaxy-damping-value", (value) => {
    galaxyParams.damping = value;
    return `${value.toFixed(3)} 1/s`;
  });

  const galaxyCountInput = document.getElementById("galaxy-count");
  const galaxyCountValue = document.getElementById("galaxy-count-value");
  if (galaxyCountInput && galaxyCountValue) {
    registerCompactRangeControl(galaxyCountInput, galaxyCountValue);
    galaxyCountInput.addEventListener("input", () => {
      galaxyCountValue.textContent = galaxyCountInput.value;
      galaxyParams.count = Number(galaxyCountInput.value);
      galaxySimulation.setCount(galaxyParams.count);
      resetTrendCharts("galaxy");
      syncCompactSectionSlider("galaxy-count");
    });
    activateCompactRangeControl("galaxy-count");
  }

  const toggleCurrentSimulationPause = () => {
    params.paused = !params.paused;
    updateSimulationStateUI();
  };

  APPLET_ORDER.forEach((appletId) => {
    getElement(APPLET_META[appletId]?.pauseButtonId)?.addEventListener("click", toggleCurrentSimulationPause);
  });
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

  APPLET_ORDER.forEach((appletId) => {
    getElement(APPLET_META[appletId]?.resetButtonId)?.addEventListener("click", () => {
      if (activeApplet !== appletId) {
        return;
      }
      applets[appletId]?.simulation.reset?.();
      resetTrendCharts(appletId);
    });

    getElement(APPLET_META[appletId]?.defaultButtonId)?.addEventListener("click", () => {
      if (activeApplet !== appletId) {
        return;
      }
      applySimulationDefaultsForApplet(appletId);
    });
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
  antSimulation.bindInteractionControls({
    cameraController,
    canvas: renderer?.domElement,
    getActiveApplet: () => activeApplet,
    bindRange,
  });

  const visualControls = createVisualControls({
    params,
    boidSimulation,
    antSimulation,
    preySimulation,
    fireflySimulation,
    updateBoidColormapLegend: updateColormapLegend,
    updatePreyColormapLegend,
  });
  visualControls.bind();
  visualControls.syncFromParams();

  updateSimulationStateUI();
  updateProjectionToggleUI();

  switchToPerspective();
}

function applySimulationDefaultsForApplet(appletId) {
  const sliders = APPLET_CONFIGS[appletId]?.right?.simulation?.sliders;
  if (!Array.isArray(sliders) || sliders.length === 0) {
    return;
  }

  sliders.forEach((slider) => {
    const input = document.getElementById(slider.id);
    if (!input) {
      return;
    }
    input.value = String(slider.value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
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

function getAppletWorldConfig(appletId) {
  const fallback = {
    defaults: { x: 100, y: 100, z: 100 },
    range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
    gridSize: 5,
  };
  const config = APPLET_CONFIGS[appletId]?.world;
  return config || fallback;
}

function createDefaultWorldState(appletId) {
  const config = getAppletWorldConfig(appletId);
  return {
    x: Number(config.defaults?.x ?? 100),
    y: Number(config.defaults?.y ?? 100),
    z: Number(config.defaults?.z ?? 100),
    gridSize: Number(config.gridSize ?? 5),
  };
}

function persistActiveAppletWorldState() {
  if (!APPLET_IDS.has(activeApplet)) {
    return;
  }

  appletWorldState[activeApplet] = {
    x: params.worldSizeX,
    y: params.worldSizeY,
    z: params.worldSizeZ,
    gridSize: params.worldGridSize,
  };
}

function applyWorldSliderConstraints(appletId) {
  const range = getAppletWorldConfig(appletId).range;
  const xInput = document.getElementById("world-size-x");
  const yInput = document.getElementById("world-size-y");
  const zInput = document.getElementById("world-size-z");

  if (xInput) {
    xInput.min = String(range.minX);
    xInput.max = String(range.maxX);
    xInput.step = String(range.step);
  }
  if (yInput) {
    yInput.min = String(range.minY);
    yInput.max = String(range.maxY);
    yInput.step = String(range.step);
  }
  if (zInput) {
    zInput.min = String(range.minZ);
    zInput.max = String(range.maxZ);
    zInput.step = String(range.step);
  }
}

function applyAppletWorldState(appletId) {
  const config = getAppletWorldConfig(appletId);
  const state = appletWorldState[appletId] || createDefaultWorldState(appletId);
  appletWorldState[appletId] = state;

  applyWorldSliderConstraints(appletId);

  params.worldSizeX = state.x;
  params.worldSizeY = state.y;
  params.worldSizeZ = state.z;
  params.worldGridSize = Number.isFinite(state.gridSize) ? state.gridSize : Number(config.gridSize ?? 5);

  setControlValue("world-size-x", params.worldSizeX, "world-size-x-value", (value) => `${Math.round(value)} m`);
  setControlValue("world-size-y", params.worldSizeY, "world-size-y-value", (value) => `${Math.round(value)} m`);
  setControlValue("world-size-z", params.worldSizeZ, "world-size-z-value", (value) => `${Math.round(value)} m`);

  rebuildBoundsAndGrid();
}

function applyDefaultProjectionForApplet(appletId) {
  if (appletProjectionInitialized[appletId]) {
    return;
  }

  const projectionMode = APPLET_CONFIGS[appletId]?.defaultProjection || "perspective";
  if (projectionMode === "orthographic") {
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
    persistActiveAppletWorldState();
  }

  activeApplet = normalizedId;
  applySceneObjectVisibility(normalizedId);
  applyAppletWorldState(normalizedId);

  dom.appletTabs?.forEach((tab) => {
    const tabApplet = tab.getAttribute("data-applet-item");
    const isActive = tabApplet === normalizedId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  applyAppletVisibility(normalizedId);
  const restoredCamera = cameraController.restoreCameraSnapshot(appletCameraState[normalizedId]);
  if (!restoredCamera) {
    applyDefaultProjectionForApplet(normalizedId);
  }

  setControlValue("camera-fov", params.cameraFov, "camera-fov-value", (value) => `${Math.round(value)}°`);
  updateProjectionToggleUI();
  if (previousApplet && APPLET_IDS.has(previousApplet)) {
    appletPausedPreferences[previousApplet] = params.paused;
  }
  params.paused = appletPausedPreferences[normalizedId];
  applets[normalizedId]?.applyStats(lastAppletStats[normalizedId]);

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
  const pauseButtons = APPLET_ORDER.map((appletId) => getElement(APPLET_META[appletId]?.pauseButtonId)).filter(Boolean);

  const setPauseButtons = (isPaused) => {
    const iconClass = isPaused ? "bi-play-fill" : "bi-pause-fill";
    const text = isPaused ? "Resume simulation" : "Pause simulation";
    const html = `<i class="bi ${iconClass}" aria-hidden="true"></i>`;
    pauseButtons.forEach((button) => {
      button.innerHTML = html;
      button.setAttribute("title", text);
      button.setAttribute("aria-label", text);
    });
  };

  if (params.paused) {
    setPauseButtons(true);
    dom.runState.innerHTML = '<i class=\"bi bi-pause-fill state-icon\" aria-hidden=\"true\"></i>';
    dom.runState.setAttribute("title", "Paused. Click to resume simulation");
    dom.runState.setAttribute("aria-label", "Paused. Click to resume simulation");
    dom.runState.setAttribute("aria-pressed", "true");
    dom.runState.disabled = false;
    return;
  }

  setPauseButtons(false);
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
  applyWorldTheme(world.scene, theme);
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
  APPLET_ORDER.forEach((appletId) => resetTrendCharts(appletId));
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

function resetTrendCharts(appletId) {
  const state = chartState[appletId];
  if (!state) {
    return;
  }
  state.frameCounter = 0;
  state.metrics.forEach((metric) => {
    metric.history.length = 0;
    setElementText(metric.liveId, metric.initialText());
  });
  drawTrendCharts();
}

function resizeTrendCharts() {
  APPLET_ORDER.forEach((appletId) => {
    chartState[appletId]?.metrics.forEach((metric) => {
      resizeCanvasBackingStore(getElement(metric.canvasId));
    });
  });
  drawTrendCharts();
}

function resizeCanvasBackingStore(canvas) {
  resizeChartCanvas(canvas);
}

function drawTrendCharts() {
  APPLET_ORDER.forEach((appletId) => {
    chartState[appletId]?.metrics.forEach((metric) => {
      drawTrendChart(getElement(metric.canvasId), metric.history, metric.options);
    });
  });
}

function drawTrendChart(canvas, values, options) {
  renderTrendChart(canvas, values, options);
}

function pushTrendValue(series, value) {
  appendTrendValue(series, value, chartMaxPoints);
}

function createChartMetric(canvasId, liveId, initialText, options) {
  return {
    canvasId,
    liveId,
    initialText,
    options,
    history: [],
  };
}

function updateChartMetrics(appletId, values, liveTexts) {
  const state = chartState[appletId];
  if (!state) {
    return;
  }

  state.metrics.forEach((metric, index) => {
    setElementText(metric.liveId, liveTexts[index]);
  });

  state.frameCounter += 1;
  if (state.frameCounter % 3 !== 0) {
    return;
  }

  state.metrics.forEach((metric, index) => {
    pushTrendValue(metric.history, values[index]);
  });
  drawTrendCharts();
}

function createAppletRuntime({ id, simulation, speedParam, applyStats }) {
  return {
    id,
    simulation,
    speedParam,
    applyStats,
  };
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

  const gridSizeM = Math.max(0.01, Number(params.worldGridSize) || 1);
  const appLabel = APPLET_META[activeApplet]?.label ?? "Boids";
  const projectionLabel =
    params.projectionMode === "orthographic" ? "Ortho Top (Z+)" : "Perspective";
  const gridText = gridSizeM >= 1 ? gridSizeM.toFixed(1) : gridSizeM.toFixed(2);
  dom.frameSize.textContent = `Grid size: ${gridText} m | ${appLabel} | ${projectionLabel}`;
}

function updateCameraTelemetry() {
  cameraController.updateTelemetry();
}

function getActiveSimulationSpeed() {
  const speedParam = applets[activeApplet]?.speedParam ?? "simSpeed";
  return THREE.MathUtils.clamp(Number(params[activeApplet]?.[speedParam]) || 1, 0.1, 10);
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

  updateChartMetrics("boid", [boidCount, avgSpeed, avgNeighbors], [
    String(boidCount),
    `${avgSpeed.toFixed(2)} m/s`,
    avgNeighbors.toFixed(2),
  ]);
}

function scheduleMathRendering() {
  const render = () => {
    if (typeof window.renderMathInElement !== "function") {
      return false;
    }

    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
    return true;
  };

  if (render()) {
    return;
  }

  window.addEventListener(
    "load",
    () => {
      render();
    },
    { once: true },
  );
}
