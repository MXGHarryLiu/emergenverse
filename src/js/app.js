// Main application bootstrap that wires simulations, UI state, charts, and routing.
import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { applyWorldTheme, createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";
import { SimulationManager } from "./simulationManager.js";
import { createVisualControls } from "./visualControls.js";
import { setupUiOverlays } from "./uiOverlays.js";
import {
  APPLET_CONFIGS,
  APPLET_DEFINITIONS,
  APPLET_META,
  APPLET_ORDER,
} from "./app/appletConfigs.js";
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
  ...Object.fromEntries(
    APPLET_ORDER.map((id) => [id, { ...APPLET_DEFINITIONS[id].defaultParams }]),
  ),
};

renderAppletSectionsFromConfig();
scheduleMathRendering();

const cameraDefaults = {
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  cameraLocked: false,
  projectionMode: "perspective",
};

function getAppletCameraDefaults(appletId = activeApplet) {
  const camera = APPLET_CONFIGS[appletId]?.camera;
  return {
    cameraDistance: Number(camera?.distance ?? cameraDefaults.cameraDistance),
    cameraHeight: Number(camera?.height ?? cameraDefaults.cameraHeight),
    cameraFov: Number(camera?.fov ?? cameraDefaults.cameraFov),
    cameraLocked: Boolean(camera?.locked ?? cameraDefaults.cameraLocked),
  };
}

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
  colormapLegend: createLegendDomRefs(""),
  supportInfoOpen: document.getElementById("support-info-open"),
  supportInfoClose: document.getElementById("support-info-close"),
  supportInfoBackdrop: document.getElementById("support-info-backdrop"),
  cameraProjectionToggle: document.getElementById("camera-projection-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  themeToggleLabel: document.getElementById("theme-toggle-label"),
  themeToggleIcon: document.getElementById("theme-toggle-icon"),
  controlsInfoOpen: document.getElementById("controls-info-open"),
  controlsInfoClose: document.getElementById("controls-info-close"),
  controlsInfoBackdrop: document.getElementById("controls-info-backdrop"),
  modelInfoClose: document.getElementById("model-info-close"),
  modelInfoBackdrop: document.getElementById("model-info-backdrop"),
  modelInfoTitle: document.getElementById("model-info-title"),
  modelInfoBody: document.getElementById("model-info-body"),
  shareInfoOpen: document.getElementById("share-info-open"),
  shareInfoClose: document.getElementById("share-info-close"),
  shareInfoBackdrop: document.getElementById("share-info-backdrop"),
  shareLinkInput: document.getElementById("share-link-input"),
  shareLinkCopy: document.getElementById("share-link-copy"),
  shareCopyStatus: document.getElementById("share-copy-status"),
  viewportScreenshotBtn: document.getElementById("viewport-screenshot-btn"),
  screenshotInfoClose: document.getElementById("screenshot-info-close"),
  screenshotInfoBackdrop: document.getElementById("screenshot-info-backdrop"),
  screenshotTransparentBg: document.getElementById("screenshot-transparent-bg"),
  screenshotPreviewImage: document.getElementById("screenshot-preview-image"),
  screenshotMeta: document.getElementById("screenshot-meta"),
  screenshotCapture: document.getElementById("screenshot-capture"),
  screenshotStatus: document.getElementById("screenshot-status"),
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

function createLegendDomRefs(idPrefix) {
  return {
    container: document.getElementById(`${idPrefix}colormap-legend`),
    bar: document.getElementById(`${idPrefix}colormap-legend-bar`),
    cmin: document.getElementById(`${idPrefix}colormap-cmin`),
    cmax: document.getElementById(`${idPrefix}colormap-cmax`),
  };
}

const uiState = {
  leftPanelVisible: true,
  rightPanelVisible: true,
};

const panelWidthState = {
  left: 270,
  right: 320,
};

function getAppletWorldConfig(appletId) {
  const fallback = {
    defaults: { x: 100, y: 100, z: 100 },
    range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
    gridSize: 5,
    lengthUnit: { name: "m", toSI: 1 },
    unitLabel: "m",
  };
  const config = APPLET_CONFIGS[appletId]?.world;
  return config || fallback;
}

function getAppletLengthUnit(appletId = activeApplet) {
  const worldConfig = getAppletWorldConfig(appletId);
  return worldConfig.lengthUnit ?? { name: worldConfig.unitLabel ?? "m", toSI: 1 };
}

function worldValuesUseAppletLengthUnit(appletId = activeApplet) {
  const appletLengthUnit = getAppletLengthUnit(appletId);
  const simulationLengthUnit = APPLET_CONFIGS[appletId]?.units?.length;
  if (!simulationLengthUnit) {
    return appletLengthUnit.toSI === 1;
  }
  return simulationLengthUnit.label === appletLengthUnit.name &&
    simulationLengthUnit.toSI === appletLengthUnit.toSI;
}

function convertLengthForDisplay(value, appletId = activeApplet) {
  const lengthUnit = getAppletLengthUnit(appletId);
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (worldValuesUseAppletLengthUnit(appletId)) {
    return value;
  }
  return value / Math.max(lengthUnit.toSI || 1, Number.EPSILON);
}

function convertLengthFromDisplay(value, appletId = activeApplet) {
  const lengthUnit = getAppletLengthUnit(appletId);
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (worldValuesUseAppletLengthUnit(appletId)) {
    return value;
  }
  return value * (lengthUnit.toSI || 1);
}

function formatDisplayNumber(value, { trailingDigits = 1 } = {}) {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return Math.round(value).toLocaleString();
  }
  if (absolute >= 100) {
    return Math.round(value).toString();
  }
  if (absolute >= 10) {
    return value.toFixed(Math.min(trailingDigits, 1));
  }
  if (absolute >= 1) {
    return value.toFixed(Math.max(trailingDigits, 1));
  }
  return value.toFixed(Math.max(trailingDigits, 2));
}

function getWorldUnitLabel(appletId = activeApplet) {
  return getAppletLengthUnit(appletId).name || "m";
}

function formatWorldDistance(value, appletId = activeApplet, options = {}) {
  const displayValue = convertLengthForDisplay(value, appletId);
  return `${formatDisplayNumber(displayValue, options)} ${getWorldUnitLabel(appletId)}`;
}

function formatWorldDisplayValue(displayValue, appletId = activeApplet, options = {}) {
  return `${formatDisplayNumber(displayValue, options)} ${getWorldUnitLabel(appletId)}`;
}

function getViewportAppletLabel(appletId = activeApplet) {
  const labels = {
    boid: "Boid",
    ants: "Ant",
    prey: "Prey",
    firefly: "Firefly",
    galaxy: "Galaxy",
  };
  return labels[appletId] ?? "Boid";
}

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
  alpha: true,
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
  formatLengthValue: (value) => formatWorldDistance(value, activeApplet),
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

const lastAppletStats = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));

const appletStatsApis = Object.fromEntries(
  APPLET_ORDER.map((id) => [
    id,
    {
      setText: setElementText,
      updateChartMetrics: (appletId, values, liveTexts) =>
        updateChartMetrics(appletId, values, liveTexts),
      refreshLegend: id === "prey" ? updatePreyColormapLegend : null,
    },
  ]),
);

const simulations = Object.fromEntries(
  APPLET_ORDER.map((id) => [
    id,
    APPLET_DEFINITIONS[id].createSimulation({
      scene,
      params,
      world,
      onStats: (stats) => {
        lastAppletStats[id] = stats;
        APPLET_DEFINITIONS[id].runtime?.applyStats?.(stats, appletStatsApis[id]);
      },
    }),
  ]),
);

APPLET_ORDER.forEach((id) => {
  simulationManager.register(id, simulations[id]);
});

const boidSimulation = simulations.boid;
const antSimulation = simulations.ants;
const preySimulation = simulations.prey;
const fireflySimulation = simulations.firefly;
const galaxySimulation = simulations.galaxy;

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
const chartState = Object.fromEntries(
  APPLET_ORDER.map((id) => [
    id,
    {
      frameCounter: 0,
      metrics: APPLET_DEFINITIONS[id].runtime?.createChartMetrics?.(createChartMetric) ?? [],
    },
  ]),
);
const applets = Object.fromEntries(
  APPLET_ORDER.map((id) => [
    id,
    createAppletRuntime({
      id,
      simulation: simulations[id],
      applyStats: (stats) => APPLET_DEFINITIONS[id].runtime?.applyStats?.(stats, appletStatsApis[id]),
    }),
  ]),
);
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
setupRangeFocusEscape();
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
  getShowBounds: () => params.showBounds,
  setShowBounds: (value) => {
    params.showBounds = Boolean(value);
    dom.showBounds.checked = params.showBounds;
    world.setBoundsVisibility(params.showBounds);
  },
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
  if (params.boid.colorMode === "speed") {
    return {
      min: 0,
      max: params.boid.maxSpeed,
      unit: "m/s",
      digits: 1,
    };
  }

  if (params.boid.colorMode === "altitude") {
    const halfZ = params.worldSizeZ * 0.5;
    return {
      min: -halfZ,
      max: halfZ,
      unit: "m",
      digits: 1,
    };
  }

  if (params.boid.colorMode === "neighbors") {
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

function updateLegendDisplay(legendDom, { isVisible, gradient, minText, maxText }) {
  if (!legendDom?.bar || !legendDom.cmin || !legendDom.cmax) {
    return;
  }

  legendDom.container?.classList.toggle("is-hidden", !isVisible);
  if (!isVisible) {
    return;
  }

  legendDom.bar.style.background = gradient;
  legendDom.cmin.textContent = minText;
  legendDom.cmax.textContent = maxText;
}

function updateColormapLegend() {
  const legendDom = dom.colormapLegend;
  const range = getColorModeRange();
  updateLegendDisplay(legendDom, {
    isVisible: params.boid.colorMode !== "none",
    gradient: colormapGradients[params.boid.colormap] || colormapGradients.turbo,
    minText: `cmin: ${formatLegendValue(range.min, range.unit, range.digits)}`,
    maxText: `cmax: ${formatLegendValue(range.max, range.unit, range.digits)}`,
  });
}

function updatePreyColormapLegend() {
  const legendDom = dom.colormapLegend;
  const range = preySimulation.getPredatorEnergyRange?.() ?? {
    min: 0,
    max: Math.max(0.1, (params.prey.predatorSpawnEnergy ?? 2.8) * 2.4),
  };
  updateLegendDisplay(legendDom, {
    isVisible: params.prey.colorMode === "energy",
    gradient: colormapGradients[params.prey.colormap] || colormapGradients.turbo,
    minText: `cmin: ${Number(range.min || 0).toFixed(2)}`,
    maxText: `cmax: ${Number(range.max || 0).toFixed(2)}`,
  });
}

function rebuildBoundsAndGrid() {
  world.rebuildBoundsAndGrid();
  updateViewportLabel();
}

function setupControls() {
  bindRange("boid-sim-speed", "boid-sim-speed-value", (value) => {
    params.boid.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("boid-scale", "boid-scale-value", (value) => {
    params.boid.scale = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("perception-radius", "perception-radius-value", (value) => {
    params.boid.perceptionRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("separation-distance", "separation-distance-value", (value) => {
    params.boid.separationDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("max-speed", "max-speed-value", (value) => {
    params.boid.maxSpeed = value;
    boidSimulation.syncInstances();
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("max-accel", "max-accel-value", (value) => {
    params.boid.maxAccel = value;
    return `${value.toFixed(1)} m/s²`;
  });

  bindRange("alignment-weight", "alignment-weight-value", (value) => {
    params.boid.alignmentWeight = value;
    return value.toFixed(2);
  });

  bindRange("cohesion-weight", "cohesion-weight-value", (value) => {
    params.boid.cohesionWeight = value;
    return value.toFixed(2);
  });

  bindRange("separation-weight", "separation-weight-value", (value) => {
    params.boid.separationWeight = value;
    return value.toFixed(2);
  });

  bindRange("world-size-x", "world-size-x-value", (value) => {
    params.worldSizeX = convertLengthFromDisplay(value);
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    return formatWorldDistance(params.worldSizeX);
  });

  bindRange("world-size-y", "world-size-y-value", (value) => {
    params.worldSizeY = convertLengthFromDisplay(value);
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    return formatWorldDistance(params.worldSizeY);
  });

  bindRange("world-size-z", "world-size-z-value", (value) => {
    params.worldSizeZ = convertLengthFromDisplay(value);
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    return formatWorldDistance(params.worldSizeZ);
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
    params.boid.count = Number(boidCountInput.value);
    boidSimulation.setCount(params.boid.count);
    resetTrendCharts("boid");
    syncCompactSectionSlider("boid-count");
  });

  bindRange("ant-speed", "ant-speed-value", (value) => {
    params.ants.speed = value;
    return `${value.toFixed(3)} m/s`;
  });

  bindRange("ant-sim-speed", "ant-sim-speed-value", (value) => {
    params.ants.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("ant-scale", "ant-scale-value", (value) => {
    params.ants.scale = value;
    antSimulation.syncInstances();
    return `${value.toFixed(3)} m`;
  });

  bindRange("ant-sensor-distance", "ant-sensor-distance-value", (value) => {
    params.ants.sensorDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("ant-food-sense-distance", "ant-food-sense-distance-value", (value) => {
    params.ants.foodSenseDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("ant-sensor-angle", "ant-sensor-angle-value", (value) => {
    params.ants.sensorAngle = value;
    return `${Math.round(value)}°`;
  });

  bindRange("ant-turn-gain", "ant-turn-gain-value", (value) => {
    params.ants.turnGain = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-goal-bias", "ant-goal-bias-value", (value) => {
    params.ants.goalBias = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-departure-rate", "ant-departure-rate-value", (value) => {
    params.ants.departureRate = value;
    return `${value.toFixed(1)} Hz`;
  });

  bindRange("ant-deposit-rate", "ant-deposit-rate-value", (value) => {
    params.ants.depositRate = value;
    return value.toFixed(1);
  });

  bindRange("ant-diffusion-rate", "ant-diffusion-rate-value", (value) => {
    params.ants.diffusionRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("ant-evap-rate", "ant-evap-rate-value", (value) => {
    params.ants.evapRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  const antCountInput = document.getElementById("ant-count");
  const antCountValue = document.getElementById("ant-count-value");
  if (antCountInput && antCountValue) {
    registerCompactRangeControl(antCountInput, antCountValue);
    antCountInput.addEventListener("input", () => {
      antCountValue.textContent = antCountInput.value;
      params.ants.count = Number(antCountInput.value);
      antSimulation.setCount(params.ants.count);
      resetTrendCharts("ants");
      syncCompactSectionSlider("ant-count");
    });
  }

  bindRange("prey-speed", "prey-speed-value", (value) => {
    params.prey.speed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("prey-sim-speed", "prey-sim-speed-value", (value) => {
    params.prey.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("predator-speed", "predator-speed-value", (value) => {
    params.prey.predatorSpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("predator-sense-radius", "predator-sense-radius-value", (value) => {
    params.prey.predatorSenseRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("predation-radius", "predation-radius-value", (value) => {
    params.prey.predationRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("prey-birth-rate", "prey-birth-rate-value", (value) => {
    params.prey.birthRate = value;
    return `${value.toFixed(2)} 1/s`;
  });

  bindRange("predation-rate-beta", "predation-rate-beta-value", (value) => {
    params.prey.predationRateBeta = value;
    return value.toFixed(2);
  });

  bindRange("predator-energy-gain", "predator-energy-gain-value", (value) => {
    params.prey.predatorEnergyGain = value;
    return value.toFixed(2);
  });

  bindRange("predator-energy-loss", "predator-energy-loss-value", (value) => {
    params.prey.predatorEnergyLoss = value;
    return `${value.toFixed(2)} 1/s`;
  });

  const preyCountInput = document.getElementById("prey-count");
  const preyCountValue = document.getElementById("prey-count-value");
  if (preyCountInput && preyCountValue) {
    registerCompactRangeControl(preyCountInput, preyCountValue);
    preyCountInput.addEventListener("input", () => {
      preyCountValue.textContent = preyCountInput.value;
      params.prey.count = Number(preyCountInput.value);
      preySimulation.setPreyCount(params.prey.count);
      resetTrendCharts("prey");
      syncCompactSectionSlider("prey-count");
    });
  }

  const predatorCountInput = document.getElementById("predator-count");
  const predatorCountValue = document.getElementById("predator-count-value");
  if (predatorCountInput && predatorCountValue) {
    registerCompactRangeControl(predatorCountInput, predatorCountValue);
    predatorCountInput.addEventListener("input", () => {
      predatorCountValue.textContent = predatorCountInput.value;
      params.prey.predatorCount = Number(predatorCountInput.value);
      preySimulation.setPredatorCount(params.prey.predatorCount);
      resetTrendCharts("prey");
      syncCompactSectionSlider("predator-count");
    });
  }

  bindRange("firefly-size", "firefly-size-value", (value) => {
    params.firefly.size = value;
    fireflySimulation.syncInstances?.();
    return `${value.toFixed(2)} m`;
  });

  bindRange("firefly-sim-speed", "firefly-sim-speed-value", (value) => {
    params.firefly.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("firefly-speed", "firefly-speed-value", (value) => {
    params.firefly.speed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("firefly-coupling", "firefly-coupling-value", (value) => {
    params.firefly.coupling = value;
    return value.toFixed(2);
  });

  bindRange("firefly-radius", "firefly-radius-value", (value) => {
    params.firefly.radius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("firefly-frequency", "firefly-frequency-value", (value) => {
    params.firefly.frequencyHz = value;
    return `${value.toFixed(2)} Hz`;
  });

  bindRange("firefly-jitter", "firefly-jitter-value", (value) => {
    params.firefly.freqJitterHz = value;
    return `${value.toFixed(2)} Hz`;
  });

  bindRange("firefly-noise", "firefly-noise-value", (value) => {
    params.firefly.phaseNoise = value;
    return `${value.toFixed(2)} rad/s`;
  });

  const fireflyCountInput = document.getElementById("firefly-count");
  const fireflyCountValue = document.getElementById("firefly-count-value");
  if (fireflyCountInput && fireflyCountValue) {
    registerCompactRangeControl(fireflyCountInput, fireflyCountValue);
    fireflyCountInput.addEventListener("input", () => {
      fireflyCountValue.textContent = fireflyCountInput.value;
      params.firefly.count = Number(fireflyCountInput.value);
      fireflySimulation.setCount(params.firefly.count);
      resetTrendCharts("firefly");
      syncCompactSectionSlider("firefly-count");
    });
  }

  bindRange("galaxy-particle-size", "galaxy-particle-size-value", (value) => {
    params.galaxy.particleSize = value;
    galaxySimulation.syncInstances?.();
    return `${Math.round(value)} ly`;
  });

  bindRange("galaxy-sim-speed", "galaxy-sim-speed-value", (value) => {
    params.galaxy.simSpeed = value;
    return `${value.toFixed(1)}x`;
  });

  bindRange("galaxy-spin", "galaxy-spin-value", (value) => {
    params.galaxy.spin = value;
    return value.toFixed(2);
  });

  bindRange("galaxy-gravity", "galaxy-gravity-value", (value) => {
    params.galaxy.gravity = value;
    return `${value.toExponential(3)} m^3 kg^-1 s^-2`;
  });

  bindRange("galaxy-central-mass", "galaxy-central-mass-value", (value) => {
    params.galaxy.centralMass = value;
    return `${value.toExponential(2)} M_sun`;
  });

  bindRange("galaxy-softening", "galaxy-softening-value", (value) => {
    params.galaxy.softening = value;
    return `${Math.round(value)} ly`;
  });

  bindRange("galaxy-damping", "galaxy-damping-value", (value) => {
    params.galaxy.damping = value;
    return `${value.toFixed(4)} 1/Myr`;
  });

  const galaxyCountInput = document.getElementById("galaxy-count");
  const galaxyCountValue = document.getElementById("galaxy-count-value");
  if (galaxyCountInput && galaxyCountValue) {
    registerCompactRangeControl(galaxyCountInput, galaxyCountValue);
    galaxyCountInput.addEventListener("input", () => {
      galaxyCountValue.textContent = galaxyCountInput.value;
      params.galaxy.count = Number(galaxyCountInput.value);
      galaxySimulation.setCount(params.galaxy.count);
      resetTrendCharts("galaxy");
      syncCompactSectionSlider("galaxy-count");
    });
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
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
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
      const appletCameraDefaults = getAppletCameraDefaults(activeApplet);
      params.cameraDistance = appletCameraDefaults.cameraDistance;
      params.cameraHeight = appletCameraDefaults.cameraHeight;
      params.cameraFov = appletCameraDefaults.cameraFov;
      params.cameraLocked = appletCameraDefaults.cameraLocked;

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

function createDefaultWorldState(appletId) {
  const config = getAppletWorldConfig(appletId);
  return {
    x: convertLengthFromDisplay(Number(config.defaults?.x ?? 100), appletId),
    y: convertLengthFromDisplay(Number(config.defaults?.y ?? 100), appletId),
    z: convertLengthFromDisplay(Number(config.defaults?.z ?? 100), appletId),
    gridSize: convertLengthFromDisplay(Number(config.gridSize ?? 5), appletId),
    boundaryMode: APPLET_CONFIGS[appletId]?.defaultBoundaryMode ?? "cyclic",
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
    boundaryMode: params.boundaryMode,
  };
}

function applyWorldSliderConstraints(appletId) {
  const range = getAppletWorldConfig(appletId).range;
  const xInput = document.getElementById("world-size-x");
  const yInput = document.getElementById("world-size-y");
  const zInput = document.getElementById("world-size-z");

  if (xInput) {
    xInput.min = String(Number(range.minX));
    xInput.max = String(Number(range.maxX));
    xInput.step = String(Number(range.step));
  }
  if (yInput) {
    yInput.min = String(Number(range.minY));
    yInput.max = String(Number(range.maxY));
    yInput.step = String(Number(range.step));
  }
  if (zInput) {
    zInput.min = String(Number(range.minZ));
    zInput.max = String(Number(range.maxZ));
    zInput.step = String(Number(range.step));
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
  params.worldGridSize = Number.isFinite(state.gridSize)
    ? state.gridSize
    : convertLengthFromDisplay(Number(config.gridSize ?? 5), appletId);
  params.boundaryMode = state.boundaryMode ?? APPLET_CONFIGS[appletId]?.defaultBoundaryMode ?? "cyclic";

  setControlValue(
    "world-size-x",
    convertLengthForDisplay(params.worldSizeX, appletId),
    "world-size-x-value",
    (value) => formatWorldDisplayValue(value, appletId),
  );
  setControlValue(
    "world-size-y",
    convertLengthForDisplay(params.worldSizeY, appletId),
    "world-size-y-value",
    (value) => formatWorldDisplayValue(value, appletId),
  );
  setControlValue(
    "world-size-z",
    convertLengthForDisplay(params.worldSizeZ, appletId),
    "world-size-z-value",
    (value) => formatWorldDisplayValue(value, appletId),
  );
  if (dom.boundaryMode) {
    dom.boundaryMode.value = params.boundaryMode;
  }

  rebuildBoundsAndGrid();
  simulationManager.onBoundaryModeChanged();
}

function applyDefaultProjectionForApplet(appletId) {
  if (appletProjectionInitialized[appletId]) {
    return;
  }

  const appletCameraDefaults = getAppletCameraDefaults(appletId);
  params.cameraDistance = appletCameraDefaults.cameraDistance;
  params.cameraHeight = appletCameraDefaults.cameraHeight;
  params.cameraFov = appletCameraDefaults.cameraFov;
  params.cameraLocked = appletCameraDefaults.cameraLocked;

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
  resetCompactSectionDefaults();
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

function createAppletRuntime({ id, simulation, applyStats }) {
  return {
    id,
    simulation,
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
      firstInputId: null,
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

function setupRangeFocusEscape() {
  const blurFocusedRange = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement && activeElement.type === "range") {
      activeElement.blur();
    }
  };

  renderer.domElement.addEventListener("pointerdown", () => {
    blurFocusedRange();
    renderer.domElement.focus?.();
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('input[type="range"]')) {
      return;
    }

    blurFocusedRange();
  }, true);
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

  if (!sectionState.firstInputId) {
    sectionState.firstInputId = input.id;
  }

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

function resetCompactSectionDefaults() {
  Object.values(compactSectionState).forEach((sectionState) => {
    if (!sectionState?.firstInputId) {
      return;
    }
    activateCompactRangeControl(sectionState.firstInputId);
  });
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

  sectionState.slider.min = binding.input.min;
  sectionState.slider.max = binding.input.max;
  sectionState.slider.step = binding.input.step || "1";
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

  const gridSize = Math.max(0.01, Number(params.worldGridSize) || 1);
  const displayGridSize = convertLengthForDisplay(gridSize, activeApplet);
  const unitLabel = getWorldUnitLabel(activeApplet);
  const appLabel = getViewportAppletLabel(activeApplet);
  const projectionLabel =
    params.projectionMode === "orthographic" ? "Ortho Top (Z+)" : "Perspective";
  const gridText = formatDisplayNumber(displayGridSize, { trailingDigits: 2 });
  dom.frameSize.textContent = `Grid size: ${gridText} ${unitLabel} | ${appLabel} | ${projectionLabel}`;
}

function updateCameraTelemetry() {
  cameraController.updateTelemetry();
}

function getActiveSimulationSpeed() {
  return THREE.MathUtils.clamp(Number(params[activeApplet]?.simSpeed) || 1, 0.1, 10);
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
