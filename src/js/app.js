// Main application bootstrap that wires simulations, UI state, charts, and routing.
import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { applyWorldTheme, createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";
import { SimulationManager } from "./simulationManager.js";
import { createVisualControls } from "./visualControls.js";
import { setupUiOverlays } from "./uiOverlays.js";
import { createSpaceshipHudController } from "./spaceship.js";
import {
  normalizeAppletId as normalizeAppletIdParam,
  setAppletInUrl as setAppletInUrlParam,
  setupAppRouting as setupUrlRouting,
} from "./routing.js";
import { getSectionInputControls } from "./app/appletConfigUtils.js";
import {
  APPLET_CONFIGS,
  APPLET_DEFINITIONS,
  APPLET_META,
  APPLET_ORDER,
} from "./app/appletConfigs.js";
import { renderAppletSectionsFromConfig } from "./uiTemplates.js";
import { SITE_VERSION } from "./versionConfig.js";
import {
  drawTrendChart as renderTrendChart,
  pushTrendValue as appendTrendValue,
  resizeCanvasBackingStore as resizeChartCanvas,
} from "./chartUtils.js";

// App Bootstrapping: Core Params + Initial UI Template Rendering
const DEFAULT_APPLET_ID = APPLET_ORDER[0] || "boid";

const params = {
  worldSizeX: 100,
  worldSizeY: 100,
  worldSizeZ: 100,
  worldGridSize: 5,
  boundaryMode: "cyclic-xyz",
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  spaceshipMode: false,
  spaceshipSas: true,
  showBounds: true,
  cameraLocked: false,
  projectionMode: "perspective",
  keyboardMoveSpeed: 30000,
  keyboardRotationSpeed: 84,
  paused: false,
  ...Object.fromEntries(
    APPLET_ORDER.map((id) => [id, { ...APPLET_DEFINITIONS[id].defaultParams }]),
  ),
};

renderAppletSectionsFromConfig();
renderAppletNavigationFromConfig();
scheduleMathRendering();
applySiteVersionTag();

// Applet Defaults + Navigation Rendering
const cameraDefaults = {
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  cameraLocked: false,
  projectionMode: "perspective",
};

function applySiteVersionTag() {
  const version = String(SITE_VERSION || "").trim();
  if (!version) {
    return;
  }
  document.documentElement.setAttribute("data-site-version", version);
  document.body?.setAttribute("data-site-version", version);
}

const cameraControlDefaults = Object.freeze({
  fov: Object.freeze({ min: 20, max: 90, step: 1 }),
  moveSpeed: Object.freeze({ min: 1, max: 100000, step: 1, defaultValue: 30000 }),
  rotationSpeed: Object.freeze({ min: 1, max: 720, step: 1, defaultValue: 84 }),
});

function getAppletCameraDefaults(appletId = activeApplet) {
  const camera = APPLET_CONFIGS[appletId]?.camera;
  return {
    cameraDistance: Number(camera?.distance ?? cameraDefaults.cameraDistance),
    cameraHeight: Number(camera?.height ?? cameraDefaults.cameraHeight),
    cameraFov: Number(camera?.fov ?? cameraDefaults.cameraFov),
    cameraLocked: Boolean(camera?.locked ?? cameraDefaults.cameraLocked),
  };
}

function getAppletCameraControlConfig(appletId = activeApplet) {
  const camera = APPLET_CONFIGS[appletId]?.camera || {};
  const controls = camera.controls || {};
  const cameraKeyboardMoveSpeedDefault = Number(camera.keyboardMoveSpeedDefault);
  const moveSpeedFallback = {
    ...cameraControlDefaults.moveSpeed,
    defaultValue: Number.isFinite(cameraKeyboardMoveSpeedDefault)
      ? cameraKeyboardMoveSpeedDefault
      : cameraControlDefaults.moveSpeed.defaultValue,
  };
  return {
    fov: resolveCameraControlConfig(controls.fov, {
      ...cameraControlDefaults.fov,
      defaultValue: Number(camera.fov ?? cameraDefaults.cameraFov),
    }),
    moveSpeed: resolveCameraControlConfig(controls.moveSpeed, moveSpeedFallback),
    rotationSpeed: resolveCameraControlConfig(controls.rotationSpeed, cameraControlDefaults.rotationSpeed),
  };
}

function resolveCameraControlConfig(customConfig, fallback) {
  const min = Number(customConfig?.min ?? fallback.min);
  const max = Number(customConfig?.max ?? fallback.max);
  const step = Number(customConfig?.step ?? fallback.step);
  const defaultValue = Number(customConfig?.defaultValue ?? fallback.defaultValue);

  const safeMin = Number.isFinite(min) ? min : fallback.min;
  const safeMax = Number.isFinite(max) ? max : fallback.max;
  const normalizedMax = safeMax > safeMin ? safeMax : safeMin + Math.max(1, Math.abs(safeMin) * 0.1);
  const safeStep = Number.isFinite(step) && step > 0 ? step : fallback.step;
  const fallbackDefault = Number.isFinite(defaultValue) ? defaultValue : fallback.defaultValue;
  const safeDefault = THREE.MathUtils.clamp(fallbackDefault, safeMin, normalizedMax);

  return {
    min: safeMin,
    max: normalizedMax,
    step: safeStep,
    defaultValue: safeDefault,
  };
}

function applyCameraControlConfig(appletId = activeApplet, options = {}) {
  const { resetToDefaults = false } = options;
  const config = getAppletCameraControlConfig(appletId);

  const applyRangeMeta = (id, meta) => {
    const input = document.getElementById(id);
    if (!input || !meta) {
      return;
    }
    input.min = String(meta.min);
    input.max = String(meta.max);
    input.step = String(meta.step);
  };

  applyRangeMeta("camera-fov", config.fov);
  applyRangeMeta("camera-move-speed", config.moveSpeed);
  applyRangeMeta("camera-rotation-speed", config.rotationSpeed);

  if (resetToDefaults) {
    params.cameraFov = config.fov.defaultValue;
    params.keyboardMoveSpeed = config.moveSpeed.defaultValue;
    params.keyboardRotationSpeed = config.rotationSpeed.defaultValue;
  } else {
    params.cameraFov = THREE.MathUtils.clamp(params.cameraFov, config.fov.min, config.fov.max);
    params.keyboardMoveSpeed = THREE.MathUtils.clamp(params.keyboardMoveSpeed, config.moveSpeed.min, config.moveSpeed.max);
    params.keyboardRotationSpeed = THREE.MathUtils.clamp(params.keyboardRotationSpeed, config.rotationSpeed.min, config.rotationSpeed.max);
  }
}

function renderAppletNavigationFromConfig() {
  const desktopHost = document.getElementById("applet-nav");
  const mobileHost = document.getElementById("mobile-applet-nav");
  if (!desktopHost && !mobileHost) {
    return;
  }

  desktopHost?.replaceChildren();
  mobileHost?.replaceChildren();
  APPLET_ORDER.forEach((id, index) => {
    const meta = APPLET_META[id] || {};
    const tabLabel = String(meta.shortLabel ?? meta.label ?? id);
    const titleLabel = String(meta.label ?? tabLabel);

    if (desktopHost) {
      const desktopButton = document.createElement("button");
      desktopButton.className = "applet-tab";
      if (index === 0) {
        desktopButton.classList.add("is-active");
      }
      desktopButton.type = "button";
      desktopButton.setAttribute("data-applet-item", id);
      desktopButton.setAttribute("aria-selected", String(index === 0));
      desktopButton.setAttribute("title", `${titleLabel} applet`);
      desktopButton.textContent = tabLabel;
      desktopHost.appendChild(desktopButton);
    }

    if (mobileHost) {
      const mobileButton = document.createElement("button");
      mobileButton.className = "mobile-applet-tab";
      if (index === 0) {
        mobileButton.classList.add("is-active");
      }
      mobileButton.type = "button";
      mobileButton.setAttribute("data-applet-item", id);
      mobileButton.setAttribute("aria-selected", String(index === 0));
      mobileButton.setAttribute("title", `${titleLabel} applet`);
      mobileButton.textContent = tabLabel;
      mobileHost.appendChild(mobileButton);
    }
  });
}

// DOM References + Shared UI State
const dom = {
  topNav: document.querySelector(".top-nav"),
  appShell: document.querySelector(".app-shell"),
  leftPanel: document.getElementById("left-panel"),
  rightPanel: document.getElementById("right-panel"),
  hideLeftPanel: document.getElementById("hide-left-panel"),
  hideRightPanel: document.getElementById("hide-right-panel"),
  showLeftPanel: document.getElementById("show-left-panel"),
  showRightPanel: document.getElementById("show-right-panel"),
  middleResizer: document.getElementById("middle-resizer"),
  mobilePanelBar: document.getElementById("mobile-panel-bar"),
  mobileShowInfo: document.getElementById("mobile-show-info"),
  mobileShowControls: document.getElementById("mobile-show-controls"),
  mobileCurrentApplet: document.getElementById("mobile-current-applet"),
  mobileNavOpen: document.getElementById("mobile-nav-open"),
  mobileNavClose: document.getElementById("mobile-nav-close"),
  mobileNavBackdrop: document.getElementById("mobile-nav-backdrop"),
  mobileNavActions: document.getElementById("mobile-nav-actions"),
  mobileNavSupport: document.getElementById("mobile-nav-support"),
  mobileNavTheme: document.getElementById("mobile-nav-theme"),
  mobileNavThemeIcon: document.getElementById("mobile-nav-theme-icon"),
  mobileNavAbout: document.getElementById("mobile-nav-about"),
  topNavContainer: document.querySelector(".top-nav .container-fluid"),
  navBrandGroup: document.querySelector(".nav-brand-group"),
  navActions: document.querySelector(".nav-actions"),
  leftResizer: document.getElementById("left-resizer"),
  rightResizer: document.getElementById("right-resizer"),
  sceneHost: document.getElementById("scene-host"),
  orientationIndicator: document.getElementById("orientation-indicator"),
  frameSize: document.getElementById("frame-size"),
  chartToggles: document.querySelectorAll("[data-chart-toggle]"),
  appletTabs: document.querySelectorAll("[data-applet-item]"),
  appVisibleElements: document.querySelectorAll("[data-app-visible]"),
  runState: document.getElementById("run-state"),
  resetCamera: document.getElementById("reset-camera"),
  showBounds: document.getElementById("show-bounds"),
  cameraLocked: document.getElementById("camera-locked"),
  spaceshipMode: document.getElementById("spaceship-mode"),
  boundaryMode: document.getElementById("boundary-mode"),
  boundaryModeValue: document.getElementById("boundary-mode-value"),
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
  exportInfoOpen: document.getElementById("export-info-open"),
  exportInfoClose: document.getElementById("export-info-close"),
  exportInfoBackdrop: document.getElementById("export-info-backdrop"),
  exportParamsJson: document.getElementById("export-params-json"),
  exportStatus: document.getElementById("export-status"),
  viewportScreenshotBtn: document.getElementById("viewport-screenshot-btn"),
  screenshotInfoClose: document.getElementById("screenshot-info-close"),
  screenshotInfoBackdrop: document.getElementById("screenshot-info-backdrop"),
  screenshotTransparentBg: document.getElementById("screenshot-transparent-bg"),
  screenshotIncludeOverlay: document.getElementById("screenshot-include-overlay"),
  screenshotPreviewImage: document.getElementById("screenshot-preview-image"),
  screenshotPreviewZoom: document.getElementById("screenshot-preview-zoom"),
  screenshotMeta: document.getElementById("screenshot-meta"),
  screenshotCapture: document.getElementById("screenshot-capture"),
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
  spaceshipHud: document.getElementById("spaceship-hud"),
  spaceshipHudScope: document.getElementById("spaceship-hud-scope"),
  spaceshipSpeed: document.getElementById("spaceship-speed"),
  spaceshipSasToggle: document.getElementById("spaceship-sas-toggle"),
  spaceshipHaltRotation: document.getElementById("spaceship-halt-rotation"),
  spaceshipHaltMotion: document.getElementById("spaceship-halt-motion"),
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
  layoutMode: "desktop",
  nonMobileVisibility: { left: true, right: true },
  mobileForcedFromBoth: false,
  layoutInitialized: false,
};

const panelWidthState = {
  left: 270,
  right: 320,
};

const middleLayoutState = {
  splitRatio: 0.5,
  minPanelPx: 140,
  resizerPx: 10,
};

let visualControls = null;

function normalizeBoundaryMode(mode) {
  if (mode === "cyclic") {
    return "cyclic-xyz";
  }
  if (mode === "cyclic-xyz" || mode === "cyclic-xy" || mode === "lost") {
    return mode;
  }
  return "cyclic-xyz";
}

function initializeSimulationsWithAppletWorldState() {
  const snapshot = {
    worldSizeX: params.worldSizeX,
    worldSizeY: params.worldSizeY,
    worldSizeZ: params.worldSizeZ,
    worldGridSize: params.worldGridSize,
    boundaryMode: params.boundaryMode,
  };

  APPLET_ORDER.forEach((appletId) => {
    const state = appletWorldState[appletId] || createDefaultWorldState(appletId);
    params.worldSizeX = state.x;
    params.worldSizeY = state.y;
    params.worldSizeZ = state.z;
    params.worldGridSize = Number.isFinite(state.gridSize)
      ? state.gridSize
      : snapshot.worldGridSize;
    params.boundaryMode = normalizeBoundaryMode(
      state.boundaryMode ?? getWorldBoundaryModeDefault(appletId),
    );
    simulations[appletId]?.init?.();
  });

  params.worldSizeX = snapshot.worldSizeX;
  params.worldSizeY = snapshot.worldSizeY;
  params.worldSizeZ = snapshot.worldSizeZ;
  params.worldGridSize = snapshot.worldGridSize;
  params.boundaryMode = snapshot.boundaryMode;
}

// World Unit + Display Formatting Helpers
function getAppletWorldConfig(appletId) {
  const fallback = {
    params: [
      { key: "x", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "y", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "z", default: 100, uiMin: 30, uiMax: 260, step: 2 },
      { key: "gridSize", default: 5, uiMin: 2, uiMax: 320, step: 2 },
    ],
    defaults: { x: 100, y: 100, z: 100 },
    range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
    gridSize: 5,
    lengthUnit: { name: "m", toSI: 1 },
    unitLabel: "m",
  };
  const config = APPLET_CONFIGS[appletId]?.world;
  return config || fallback;
}

function getWorldParamDefinition(appletId, key) {
  const config = getAppletWorldConfig(appletId);
  const paramsList = Array.isArray(config?.params) ? config.params : [];
  const paramEntry = paramsList.find((entry) => entry?.key === key);
  if (paramEntry) {
    return paramEntry;
  }

  if (key === "boundaryMode") {
    return {
      key,
      default: APPLET_CONFIGS[appletId]?.defaultBoundaryMode ?? "cyclic-xyz",
    };
  }

  const legacyStep = Number(config?.range?.step ?? 2);
  const safeStep = Number.isFinite(legacyStep) && legacyStep > 0 ? legacyStep : 2;
  if (key === "x") {
    return {
      key,
      default: Number(config?.defaults?.x ?? 100),
      uiMin: Number(config?.range?.minX ?? 40),
      uiMax: Number(config?.range?.maxX ?? 320),
      step: safeStep,
    };
  }
  if (key === "y") {
    return {
      key,
      default: Number(config?.defaults?.y ?? 100),
      uiMin: Number(config?.range?.minY ?? 40),
      uiMax: Number(config?.range?.maxY ?? 320),
      step: safeStep,
    };
  }
  if (key === "z") {
    return {
      key,
      default: Number(config?.defaults?.z ?? 100),
      uiMin: Number(config?.range?.minZ ?? 30),
      uiMax: Number(config?.range?.maxZ ?? 260),
      step: safeStep,
    };
  }

  return {
    key: "gridSize",
    default: Number(config?.gridSize ?? 5),
    uiMin: safeStep,
    uiMax: Number(config?.range?.maxX ?? 320),
    step: safeStep,
  };
}

function getWorldBoundaryModeDefault(appletId) {
  const boundaryParam = getWorldParamDefinition(appletId, "boundaryMode");
  return normalizeBoundaryMode(
    boundaryParam?.default ?? APPLET_CONFIGS[appletId]?.defaultBoundaryMode ?? "cyclic-xyz",
  );
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

function formatKeyboardMoveSpeed(value, appletId = activeApplet) {
  return `${formatDisplayNumber(value, { trailingDigits: 1 })} ${getWorldUnitLabel(appletId)}/s`;
}

function formatKeyboardRotationSpeed(value) {
  return `${formatDisplayNumber(value, { trailingDigits: 1 })}°/s`;
}

function getViewportAppletLabel(appletId = activeApplet) {
  return APPLET_META[appletId]?.shortLabel ?? APPLET_META[appletId]?.label ?? "Applet";
}

function refreshAppletLegend(appletId = activeApplet) {
  visualControls?.refreshLegend?.(appletId);
}

const compactRangeRegistry = new Map();
const compactSelectRegistry = new Map();
const compactSectionState = {};
let isClearingCompactControls = false;
let activeCompactSelectId = null;
const APPLET_IDS = new Set(APPLET_ORDER);
const ROUTING_OPTIONS = {
  validAppletIds: APPLET_IDS,
  defaultAppletId: DEFAULT_APPLET_ID,
};
const appletCameraState = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));
const appletInitialCameraState = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));
const appletWorldState = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, createDefaultWorldState(id)]),
);
let worldStatePersistenceEnabled = false;

let activeApplet = DEFAULT_APPLET_ID;
const appletPausedPreferences = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, params.paused]),
);
const appletProjectionInitialized = Object.fromEntries(APPLET_ORDER.map((id) => [id, false]));
const appletSimulationPrimed = Object.fromEntries(APPLET_ORDER.map((id) => [id, false]));

// Runtime Construction: Renderer, Camera, World, Simulations, Charts
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
    cameraController.updateOrthographicCamera(false);
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
      refreshLegend: () => refreshAppletLegend(id),
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
        appletStatsApis[id].refreshLegend?.();
      },
    }),
  ]),
);

APPLET_ORDER.forEach((id) => {
  simulationManager.register(id, simulations[id]);
});

const chartMaxPoints = 160;
const chartState = Object.fromEntries(
  APPLET_ORDER.map((id) => [
    id,
    {
      frameCounter: 0,
      metrics: APPLET_DEFINITIONS[id].runtime?.createChartMetrics?.(
        (key, initialText, options) => createChartMetricsEntry(id, key, initialText, options),
      ) ?? [],
    },
  ]),
);
let fpsSmoothed = 0;
let fpsUiAccumulator = 0;
const middleLayoutThresholdPx = 1180;
const mobileLayoutThresholdPx = 760;
const orientationIndicatorAxes = [
  { label: "X", color: "#e55353", vector: new THREE.Vector3(1, 0, 0) },
  { label: "Y", color: "#43b581", vector: new THREE.Vector3(0, 1, 0) },
  { label: "Z", color: "#4d8dff", vector: new THREE.Vector3(0, 0, 1) },
];
const orientationIndicatorInvQuat = new THREE.Quaternion();
const orientationIndicatorDir = new THREE.Vector3();
const spaceshipHud = createSpaceshipHudController({
  dom,
  params,
  cameraController,
  getActiveApplet: () => activeApplet,
  getWorldUnitLabel,
  formatDisplayNumber,
});

// Startup Wiring + App Initialization Sequence
cameraController.setPerspectiveCameraFromParams(false);
cameraController.updateOrthographicCamera(true);
cameraController.applyCameraInteractivity();
rebuildBoundsAndGrid();
initializeSimulationsWithAppletWorldState();
setupCompactSectionSliders();
setupMobileNavigation();
setupControls();
setupRangeFocusEscape();
setupPanelToggles();
setupPanelResizers();
setupMiddleResizer();
setupControlSectionCollapses();
setupThemeToggle();
setupOrientationIndicatorInteractions();
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
  getExportData: () => ({
    app: "emergenverse",
    exportedAt: new Date().toISOString(),
    activeApplet,
    params: JSON.parse(JSON.stringify(params)),
  }),
});
setupTrendCharts();
setupChartCollapses();
setupAppRouting();
worldStatePersistenceEnabled = true;
handleViewportResize();

const resizeObserver = new ResizeObserver(() => handleViewportResize());
resizeObserver.observe(dom.sceneHost);
window.addEventListener("resize", handleViewportResize);
window.addEventListener("load", handleViewportResize, { once: true });
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

const clock = new THREE.Clock();
animate();

// Main Loop + Frame Updates
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  if (simulationManager.activeId !== activeApplet) {
    simulationManager.setActive(activeApplet);
  }
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

  cameraController.updateKeyboardTranslation(dt);

  controls.update();
  cameraController.updateTelemetry();
  spaceshipHud.update();
  updateOrientationIndicator();

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


function rebuildBoundsAndGrid() {
  world.rebuildBoundsAndGrid();
  updateViewportLabel();
}

// Controls: Binding, Simulation Sliders, Defaults
function setupControls() {
  bindAppletSimulationControls();
  applyCameraControlConfig(activeApplet, { resetToDefaults: true });

  bindRange("world-size-x", "world-size-x-value", (value) => {
    params.worldSizeX = convertLengthFromDisplay(value);
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    refreshAppletLegend(activeApplet);
    return formatWorldDistance(params.worldSizeX);
  });

  bindRange("world-size-y", "world-size-y-value", (value) => {
    params.worldSizeY = convertLengthFromDisplay(value);
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    rebuildBoundsAndGrid();
    refreshAppletLegend(activeApplet);
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
    cameraController.updateOrthographicCamera(false);
    return `${Math.round(value)}°`;
  });

  bindRange("camera-move-speed", "camera-move-speed-value", (value) => {
    params.keyboardMoveSpeed = Math.max(0.1, value);
    return formatKeyboardMoveSpeed(params.keyboardMoveSpeed);
  });

  bindRange("camera-rotation-speed", "camera-rotation-speed-value", (value) => {
    params.keyboardRotationSpeed = Math.max(0.1, value);
    return formatKeyboardRotationSpeed(params.keyboardRotationSpeed);
  });

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
      closeMobileNavigation();
    });
  });

  APPLET_ORDER.forEach((appletId) => {
    getElement(APPLET_META[appletId]?.resetButtonId)?.addEventListener("click", () => {
      if (activeApplet !== appletId) {
        return;
      }
    simulations[appletId]?.reset?.();
      resetTrendCharts(appletId);
      refreshAppletLegend(appletId);
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
    cameraController.applyCameraInteractivity();
  });

  dom.spaceshipMode?.addEventListener("change", () => {
    const enabled = Boolean(dom.spaceshipMode.checked);
    if (enabled && params.projectionMode !== "perspective") {
      params.projectionMode = "perspective";
      cameraController.switchToPerspective();
      updateProjectionToggleUI();
      updateViewportLabel();
    }
    params.spaceshipMode = enabled;
    cameraController.setSpaceshipMode?.(enabled);
    spaceshipHud.update();
  });

  dom.boundaryMode.addEventListener("change", () => {
    params.boundaryMode = normalizeBoundaryMode(dom.boundaryMode.value);
    syncBoundaryModeDisplayText();
    if (worldStatePersistenceEnabled) {
      persistActiveAppletWorldState();
    }
    simulationManager.onBoundaryModeChanged();
  });

  if (dom.cameraProjectionToggle) {
    dom.cameraProjectionToggle.addEventListener("click", () => {
      if (params.projectionMode === "perspective") {
        params.projectionMode = "orthographic";
        if (params.spaceshipMode) {
          params.spaceshipMode = false;
          if (dom.spaceshipMode) {
            dom.spaceshipMode.checked = false;
          }
          cameraController.setSpaceshipMode?.(false);
        }
        cameraController.switchToOrthographicTop();
      } else {
        params.projectionMode = "perspective";
        cameraController.switchToPerspective();
      }
      updateProjectionToggleUI();
      updateViewportLabel();
      spaceshipHud.update();
    });
  }

  if (dom.resetCamera) {
    dom.resetCamera.addEventListener("click", () => {
      const appletCameraDefaults = getAppletCameraDefaults(activeApplet);
      applyCameraControlConfig(activeApplet, { resetToDefaults: true });
      params.cameraLocked = appletCameraDefaults.cameraLocked;
      dom.cameraLocked.checked = params.cameraLocked;
      const restored = cameraController.restoreCameraSnapshot(appletInitialCameraState[activeApplet]);
      if (!restored) {
        params.cameraDistance = appletCameraDefaults.cameraDistance;
        params.cameraHeight = appletCameraDefaults.cameraHeight;
        params.cameraFov = appletCameraDefaults.cameraFov;
        const projectionMode = APPLET_CONFIGS[activeApplet]?.defaultProjection || "perspective";
        if (projectionMode === "orthographic") {
          params.projectionMode = "orthographic";
          cameraController.switchToOrthographicTop(true);
        } else {
          params.projectionMode = "perspective";
          cameraController.switchToPerspective(false);
          cameraController.resetOrientationKeepPosition();
        }
      }
      setControlValue("camera-fov", params.cameraFov, "camera-fov-value", (value) => `${Math.round(value)}°`);
      setControlValue(
        "camera-move-speed",
        params.keyboardMoveSpeed,
        "camera-move-speed-value",
        (value) => formatKeyboardMoveSpeed(value),
      );
      setControlValue(
        "camera-rotation-speed",
        params.keyboardRotationSpeed,
        "camera-rotation-speed-value",
        (value) => formatKeyboardRotationSpeed(value),
      );
      cameraController.applyCameraInteractivity();
      cameraController.updateTelemetry();
      updateProjectionToggleUI();
      updateViewportLabel();
      spaceshipHud.update();
    });
  }

  dom.showBounds.checked = params.showBounds;
  dom.cameraLocked.checked = params.cameraLocked;
  if (dom.spaceshipMode) {
    dom.spaceshipMode.checked = params.spaceshipMode;
  }
  cameraController.setSpaceshipMode?.(params.spaceshipMode);
  dom.spaceshipSasToggle?.addEventListener("click", () => {
    params.spaceshipSas = !params.spaceshipSas;
    spaceshipHud.update();
  });
  dom.spaceshipHaltRotation?.addEventListener("click", () => {
    cameraController.haltSpaceshipRotation?.();
    spaceshipHud.update();
  });
  dom.spaceshipHaltMotion?.addEventListener("click", () => {
    cameraController.haltAllSpaceshipMotion?.();
    spaceshipHud.update();
  });
  dom.boundaryMode.value = normalizeBoundaryMode(params.boundaryMode);
  syncBoundaryModeDisplayText();
  registerCompactSelectControl("boundary-mode", "boundary-mode-value");
  APPLET_ORDER.forEach((appletId) => {
    APPLET_DEFINITIONS[appletId].runtime?.bindInteractionControls?.({
      appletId,
      simulation: simulations[appletId],
      params: params[appletId],
      cameraController,
      canvas: renderer?.domElement,
      getActiveApplet: () => activeApplet,
      bindRange,
    });
  });

  visualControls = createVisualControls({
    params,
    simulations,
    getActiveApplet: () => activeApplet,
  });
  visualControls.bind();
  visualControls.syncFromParams();

  updateSimulationStateUI();
  updateProjectionToggleUI();

  cameraController.switchToPerspective();
  setupCameraTelemetryEditors();
}

function bindAppletSimulationControls() {
  APPLET_ORDER.forEach((appletId) => {
    const simulationConfig = APPLET_CONFIGS[appletId]?.simulation;
    const { sliders, selects } = getSectionInputControls(simulationConfig);

    if (Array.isArray(sliders) && sliders.length > 0) {
      sliders.forEach((slider) => {
        const inputId = getSimulationSliderInputId(appletId, slider);
        const valueId = getSimulationSliderValueId(appletId, slider);
        bindRange(inputId, valueId, (value) => {
          const displayValue = handleAppletSliderInput(appletId, slider, value);
          return formatSliderDisplayValue(slider, displayValue);
        });
      });
    }

    if (Array.isArray(selects) && selects.length > 0) {
      selects.forEach((selectConfig) => {
        const input = document.getElementById(getSimulationSelectInputId(appletId, selectConfig));
        if (!input) {
          return;
        }
        input.addEventListener("change", () => {
          handleAppletSelectInput(appletId, selectConfig, input.value);
        });
      });
    }
  });
}

function setupCameraTelemetryEditors() {
  const fields = [
    { key: "x", element: dom.cameraPosX, type: "length" },
    { key: "y", element: dom.cameraPosY, type: "length" },
    { key: "z", element: dom.cameraPosZ, type: "length" },
    { key: "roll", element: dom.cameraRoll, type: "angle" },
    { key: "pitch", element: dom.cameraPitch, type: "angle" },
    { key: "yaw", element: dom.cameraYaw, type: "angle" },
  ].filter((entry) => entry.element);

  fields.forEach(({ key, element, type }) => {
    element.classList.add("camera-dof-editable");
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", `Edit camera ${key}`);

    const beginEdit = () => {
      element.dataset.editing = "true";
      element.setAttribute("contenteditable", "true");
      element.setAttribute("role", "textbox");
      element.setAttribute("inputmode", "decimal");
      element.setAttribute("spellcheck", "false");
      element.textContent = getCameraTelemetryNumericText(key, type);
      focusEditableText(element);
    };

    const endEdit = () => {
      element.dataset.editing = "false";
      element.setAttribute("contenteditable", "false");
      element.setAttribute("role", "button");
      element.removeAttribute("inputmode");
      element.removeAttribute("spellcheck");
    };

    const cancelEdit = () => {
      endEdit();
      cameraController.updateTelemetry();
    };

    const commitEdit = () => {
      const parsed = parseCameraTelemetryInput(element.textContent, type);
      if (!Number.isFinite(parsed)) {
        cancelEdit();
        return;
      }
      const committed = applyCameraTelemetryValue(key, type, parsed, {
        rotationQuat: new THREE.Quaternion(),
        lookOffset: new THREE.Vector3(),
        axis: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(),
      });
      endEdit();
      if (!committed) {
        cameraController.updateTelemetry();
        return;
      }
      controls.update();
      cameraController.updateTelemetry();
      updateViewportLabel();
    };

    element.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (element.dataset.editing === "true") {
        focusEditableText(element);
        return;
      }
      beginEdit();
    });

    element.addEventListener("keydown", (event) => {
      const editing = element.dataset.editing === "true";
      if (!editing) {
        if (event.key === "Enter" || event.key === " " || event.key === "F2") {
          event.preventDefault();
          beginEdit();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit();
        element.blur();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
        element.blur();
      }
    });

    element.addEventListener("blur", () => {
      if (element.dataset.editing !== "true") {
        return;
      }
      commitEdit();
    });
  });
}

function getCameraTelemetryNumericText(key, type) {
  const activeCamera = cameraController.getActiveCamera();
  if (!activeCamera) {
    return "0";
  }
  if (type === "length") {
    const rawValue = activeCamera.position[key] ?? 0;
    const displayValue = convertLengthForDisplay(rawValue, activeApplet);
    return formatEditableNumericValue(displayValue);
  }

  const euler = new THREE.Euler(0, 0, 0, "ZYX");
  euler.setFromQuaternion(activeCamera.quaternion, "ZYX");
  if (key === "roll") {
    return formatEditableNumericValue(THREE.MathUtils.radToDeg(euler.x));
  }
  if (key === "pitch") {
    return formatEditableNumericValue(THREE.MathUtils.radToDeg(euler.y));
  }
  return formatEditableNumericValue(THREE.MathUtils.radToDeg(euler.z));
}

function applyCameraTelemetryValue(key, type, displayValue, math) {
  const snapshot = cameraController.getCameraSnapshot?.();
  if (!snapshot || typeof snapshot !== "object") {
    return false;
  }

  const projectionMode = snapshot.projectionMode === "orthographic" ? "orthographic" : "perspective";
  const pose = projectionMode === "orthographic" ? snapshot.orthographic : snapshot.perspective;
  if (!pose?.position || !Array.isArray(pose.position) || pose.position.length < 3) {
    return false;
  }

  if (type === "length") {
    const axisIndex = key === "x" ? 0 : key === "y" ? 1 : 2;
    const worldValue = convertLengthFromDisplay(displayValue, activeApplet);
    if (!Number.isFinite(worldValue)) {
      return false;
    }
    const oldValue = Number(pose.position[axisIndex]) || 0;
    const delta = worldValue - oldValue;
    pose.position[axisIndex] = worldValue;
    if (Array.isArray(snapshot.target) && snapshot.target.length >= 3) {
      snapshot.target[axisIndex] = (Number(snapshot.target[axisIndex]) || 0) + delta;
    }
    return cameraController.restoreCameraSnapshot?.(snapshot) ?? false;
  }

  if (projectionMode !== "perspective") {
    return false;
  }
  if (cameraController.getActiveCamera?.() !== perspectiveCamera) {
    return false;
  }

  const currentDisplayDeg = parseStrictNumericText(getCameraTelemetryNumericText(key, "angle"));
  if (!Number.isFinite(currentDisplayDeg)) {
    return false;
  }
  const deltaRad = THREE.MathUtils.degToRad(displayValue - currentDisplayDeg);
  if (!Number.isFinite(deltaRad)) {
    return false;
  }
  if (Math.abs(deltaRad) < 1e-8) {
    return true;
  }

  math.lookOffset.subVectors(controls.target, perspectiveCamera.position);
  if (math.lookOffset.lengthSq() < 1e-10) {
    math.lookOffset.set(0, 0, -1);
  }

  if (key === "roll") {
    math.axis.copy(math.lookOffset).normalize();
  } else if (key === "pitch") {
    math.right.set(1, 0, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();
    math.axis.copy(math.right);
  } else {
    math.up.copy(perspectiveCamera.up).normalize();
    math.axis.copy(math.up);
  }

  math.rotationQuat.setFromAxisAngle(math.axis, deltaRad);
  math.lookOffset.applyQuaternion(math.rotationQuat);
  perspectiveCamera.up.applyQuaternion(math.rotationQuat).normalize();
  controls.target.copy(perspectiveCamera.position).add(math.lookOffset);
  controls.update();
  return true;
}

function focusEditableText(element) {
  if (!element) {
    return;
  }
  element.focus();
  const selection = window.getSelection?.();
  if (!selection || typeof document.createRange !== "function") {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function formatEditableNumericValue(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 1000) / 1000;
  const abs = Math.abs(rounded);
  const digits = abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
  return rounded.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function parseCameraTelemetryInput(text, type) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return Number.NaN;
  }

  if (type === "angle") {
    // Camera angle editors accept plain numbers as degrees and optional trailing degree symbol.
    const normalized = raw.replace(/\s*°\s*$/u, "");
    return parseStrictNumericText(normalized);
  }

  return parseStrictNumericText(raw);
}

function getSimulationSliderInputId(appletId, slider) {
  return `${appletId}-${slider.id}`;
}

function getSimulationSliderValueId(appletId, slider) {
  const paramKey = String(slider?.paramKey || "").trim();
  if (!paramKey) {
    throw new Error(
      `[app] Simulation slider "${slider?.id ?? "unknown"}" is missing paramKey.`,
    );
  }
  return `${appletId}-${paramKey}-value`;
}

function getSimulationSelectInputId(appletId, selectConfig) {
  return `${appletId}-${selectConfig.id}`;
}

function handleAppletSliderInput(appletId, slider, rawValue) {
  const appletParams = params[appletId];
  const simulation = simulations[appletId];
  if (!appletParams) {
    return rawValue;
  }

  const paramKey = inferSliderParamKey(appletId, slider);
  if (!paramKey) {
    return rawValue;
  }

  const value = normalizeSliderInputValue(slider, rawValue);

  appletParams[paramKey] = value;
  applySliderChangeToSimulation({ slider, paramKey, value, simulation });

  APPLET_DEFINITIONS[appletId].runtime?.onSliderChange?.({
    appletId,
    slider,
    paramKey,
    value,
    params: appletParams,
    simulation,
    resetTrendCharts: () => resetTrendCharts(appletId),
    refreshLegend: () => refreshAppletLegend(appletId),
  });

  if (slider?.resetTrendCharts) {
    resetTrendCharts(appletId);
  }
  refreshAppletLegend(appletId);
  return appletParams[paramKey];
}

function handleAppletSelectInput(appletId, selectConfig, rawValue) {
  const appletParams = params[appletId];
  const simulation = simulations[appletId];
  if (!appletParams) {
    return rawValue;
  }

  const paramKey = inferSliderParamKey(appletId, selectConfig);
  if (!paramKey) {
    return rawValue;
  }

  const normalized = String(rawValue ?? "");
  appletParams[paramKey] = normalized;

  applySliderChangeToSimulation({
    slider: selectConfig,
    paramKey,
    value: normalized,
    simulation,
  });

  APPLET_DEFINITIONS[appletId].runtime?.onSliderChange?.({
    appletId,
    slider: selectConfig,
    paramKey,
    value: normalized,
    params: appletParams,
    simulation,
    resetTrendCharts: () => resetTrendCharts(appletId),
    refreshLegend: () => refreshAppletLegend(appletId),
  });

  if (selectConfig?.resetTrendCharts) {
    resetTrendCharts(appletId);
  }
  refreshAppletLegend(appletId);
  return appletParams[paramKey];
}

function inferSliderParamKey(appletId, sliderConfigOrId) {
  const sliderId = typeof sliderConfigOrId === "string"
    ? sliderConfigOrId
    : sliderConfigOrId?.id;
  const paramKeyOverride =
    typeof sliderConfigOrId === "object"
      ? sliderConfigOrId?.paramKey
      : undefined;

  if (typeof paramKeyOverride === "string" && paramKeyOverride.length > 0) {
    return paramKeyOverride;
  }

  if (!sliderId || typeof sliderId !== "string") {
    return null;
  }

  const prefixCandidates = [`${appletId}-`];
  if (appletId.endsWith("s") && appletId.length > 1) {
    prefixCandidates.push(`${appletId.slice(0, -1)}-`);
  }
  const matchedPrefix = prefixCandidates.find((prefix) => sliderId.startsWith(prefix));
  const stripped = matchedPrefix ? sliderId.slice(matchedPrefix.length) : sliderId;
  return stripped.replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function normalizeSliderInputValue(slider, rawValue) {
  let value = Number(rawValue);
  if (!Number.isFinite(value)) {
    value = Number(slider?.value ?? 0);
  }
  if (!Number.isFinite(value)) {
    value = 0;
  }

  const uiMin = Number(slider?.uiMin);
  const uiMax = Number(slider?.uiMax);
  if (Number.isFinite(uiMin)) {
    value = Math.max(uiMin, value);
  }
  if (Number.isFinite(uiMax)) {
    value = Math.min(uiMax, value);
  }

  const step = String(slider?.step ?? "").trim();
  const integerStep = step.length > 0 && !/[.eE]/.test(step);
  return integerStep ? Math.round(value) : value;
}

function applySliderChangeToSimulation({ slider, paramKey, value, simulation }) {
  if (!simulation) {
    return;
  }

  const action = typeof slider?.simulationAction === "string"
    ? slider.simulationAction
    : "auto";

  if (action === "none") {
    return;
  }
  if (action === "reset") {
    simulation.reset?.();
    return;
  }
  if (action === "sync") {
    simulation.syncInstances?.();
    return;
  }

  const group = typeof slider?.group === "string"
    ? slider.group.trim().toLowerCase()
    : "";
  if (action === "auto" && group === "initial") {
    simulation.reset?.();
    return;
  }

  const explicitSetter = typeof slider?.simulationSetter === "string" && slider.simulationSetter.length > 0
    ? slider.simulationSetter
    : null;
  const methodName = explicitSetter || `set${paramKey.charAt(0).toUpperCase()}${paramKey.slice(1)}`;
  const setter = simulation?.[methodName];

  if (typeof setter === "function") {
    setter.call(simulation, value);
    return;
  }

  simulation.syncInstances?.();
}

function formatSliderDisplayValue(slider, value) {
  const template = slider?.valueText;
  if (typeof template !== "string" || template.length === 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return String(value);
    }
    const precision = getNumericPrecision(slider?.step);
    const numericText = precision > 0
      ? numeric.toFixed(precision)
      : Math.abs(numeric) >= 1e6
      ? numeric.toExponential(2)
      : String(Math.round(numeric));
    const unit = typeof slider?.unit === "string" ? slider.unit.trim() : "";
    return unit ? `${numericText} ${unit}` : numericText;
  }

  const trimmed = template.trimStart();
  const numericMatch = trimmed.match(/^[+-]?(?:\d+\.?\d*|\d*\.?\d+)(?:e[+-]?\d+)?/i);
  if (!numericMatch) {
    return String(value);
  }

  const numericTemplate = numericMatch[0];
  const rawSuffix = trimmed.slice(numericTemplate.length);
  const suffix = rawSuffix.trim().toLowerCase() === "x" ? "" : rawSuffix;
  const numeric = formatNumberLikeTemplate(value, numericTemplate, slider?.step);
  return `${numeric}${suffix}`;
}

function formatNumberLikeTemplate(value, numericTemplate, stepValue) {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  const stepPrecision = getNumericPrecision(stepValue);
  if (/[eE]/.test(numericTemplate)) {
    const [mantissa = "0"] = numericTemplate.split(/[eE]/);
    const dotIndex = mantissa.indexOf(".");
    const decimals = dotIndex >= 0 ? mantissa.length - dotIndex - 1 : Math.max(0, stepPrecision);
    return value.toExponential(decimals);
  }

  const dotIndex = numericTemplate.indexOf(".");
  const templatePrecision = dotIndex >= 0 ? numericTemplate.length - dotIndex - 1 : 0;
  const precision = Math.max(templatePrecision, stepPrecision);
  if (precision <= 0) {
    return String(Math.round(value));
  }
  return value.toFixed(precision);
}

function getNumericPrecision(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (Number.isInteger(value)) {
      return 0;
    }
    const asText = value.toString();
    if (/e/i.test(asText)) {
      return 0;
    }
    const dotIndex = asText.indexOf(".");
    return dotIndex >= 0 ? Math.max(0, asText.length - dotIndex - 1) : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed || /e/i.test(trimmed)) {
    return 0;
  }

  const dotIndex = trimmed.indexOf(".");
  return dotIndex >= 0 ? Math.max(0, trimmed.length - dotIndex - 1) : 0;
}

function applySimulationDefaultsForApplet(appletId) {
  const simulationConfig = APPLET_CONFIGS[appletId]?.simulation;
  const { sliders, selects } = getSectionInputControls(simulationConfig);

  if (Array.isArray(sliders) && sliders.length > 0) {
    sliders.forEach((slider) => {
      const input = document.getElementById(getSimulationSliderInputId(appletId, slider));
      if (!input) {
        return;
      }
      input.value = String(slider.value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  if (Array.isArray(selects) && selects.length > 0) {
    selects.forEach((selectConfig) => {
      const input = document.getElementById(getSimulationSelectInputId(appletId, selectConfig));
      if (!input) {
        return;
      }
      input.value = String(selectConfig.value ?? "");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}

// App Routing + Applet Switching + Persisted Per-Applet State
function setupAppRouting() {
  setupUrlRouting({
    ...ROUTING_OPTIONS,
    applyAppletMode,
  });
}

function createDefaultWorldState(appletId) {
  const xParam = getWorldParamDefinition(appletId, "x");
  const yParam = getWorldParamDefinition(appletId, "y");
  const zParam = getWorldParamDefinition(appletId, "z");
  const gridParam = getWorldParamDefinition(appletId, "gridSize");
  return {
    x: convertLengthFromDisplay(Number(xParam.default ?? 100), appletId),
    y: convertLengthFromDisplay(Number(yParam.default ?? 100), appletId),
    z: convertLengthFromDisplay(Number(zParam.default ?? 100), appletId),
    gridSize: convertLengthFromDisplay(Number(gridParam.default ?? 5), appletId),
    boundaryMode: getWorldBoundaryModeDefault(appletId),
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
    boundaryMode: normalizeBoundaryMode(params.boundaryMode),
  };
}

function applyWorldSliderConstraints(appletId) {
  const xParam = getWorldParamDefinition(appletId, "x");
  const yParam = getWorldParamDefinition(appletId, "y");
  const zParam = getWorldParamDefinition(appletId, "z");
  const xInput = document.getElementById("world-size-x");
  const yInput = document.getElementById("world-size-y");
  const zInput = document.getElementById("world-size-z");

  if (xInput) {
    xInput.min = String(Number(xParam.uiMin));
    xInput.max = String(Number(xParam.uiMax));
    xInput.step = String(Number(xParam.step));
  }
  if (yInput) {
    yInput.min = String(Number(yParam.uiMin));
    yInput.max = String(Number(yParam.uiMax));
    yInput.step = String(Number(yParam.step));
  }
  if (zInput) {
    zInput.min = String(Number(zParam.uiMin));
    zInput.max = String(Number(zParam.uiMax));
    zInput.step = String(Number(zParam.step));
  }
}

function applyAppletWorldState(appletId) {
  const gridParam = getWorldParamDefinition(appletId, "gridSize");
  const state = appletWorldState[appletId] || createDefaultWorldState(appletId);
  appletWorldState[appletId] = state;

  applyWorldSliderConstraints(appletId);

  params.worldSizeX = state.x;
  params.worldSizeY = state.y;
  params.worldSizeZ = state.z;
  params.worldGridSize = Number.isFinite(state.gridSize)
    ? state.gridSize
    : convertLengthFromDisplay(Number(gridParam.default ?? 5), appletId);
  params.boundaryMode = normalizeBoundaryMode(
    state.boundaryMode ?? getWorldBoundaryModeDefault(appletId),
  );

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
    dom.boundaryMode.value = normalizeBoundaryMode(params.boundaryMode);
    syncBoundaryModeDisplayText();
  }

  rebuildBoundsAndGrid();
  simulationManager.onBoundaryModeChanged();
  refreshAppletLegend(appletId);
}

function applyDefaultProjectionForApplet(appletId) {
  if (appletProjectionInitialized[appletId]) {
    return;
  }

  const appletCameraDefaults = getAppletCameraDefaults(appletId);
  const appletCameraControlConfig = getAppletCameraControlConfig(appletId);
  params.cameraDistance = appletCameraDefaults.cameraDistance;
  params.cameraHeight = appletCameraDefaults.cameraHeight;
  params.cameraFov = appletCameraDefaults.cameraFov;
  params.keyboardMoveSpeed = appletCameraControlConfig.moveSpeed.defaultValue;
  params.keyboardRotationSpeed = appletCameraControlConfig.rotationSpeed.defaultValue;
  params.cameraLocked = appletCameraDefaults.cameraLocked;

  const projectionMode = APPLET_CONFIGS[appletId]?.defaultProjection || "perspective";
  if (projectionMode === "orthographic") {
    params.projectionMode = "orthographic";
    cameraController.switchToOrthographicTop();
  } else {
    params.projectionMode = "perspective";
    cameraController.switchToPerspective();
  }

  appletProjectionInitialized[appletId] = true;
  appletInitialCameraState[appletId] = cameraController.getCameraSnapshot();
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
    const isVisible = !visibleValue ||
      visibleOnApps.includes("*") ||
      visibleOnApps.includes("all") ||
      visibleOnApps.includes(appletId);
    element.classList.toggle("is-hidden", !isVisible);
  });

  refreshVisibleSectionDividers();
}

function updateMobileCurrentAppletLabel(appletId) {
  if (!dom.mobileCurrentApplet) {
    return;
  }
  const label = APPLET_META[appletId]?.shortLabel ?? APPLET_META[appletId]?.label ?? appletId;
  dom.mobileCurrentApplet.textContent = label;
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
  const normalizedId = normalizeAppletIdParam(appletId, ROUTING_OPTIONS);
  const { updateUrl = false, replaceHistory = false } = options;
  const previousApplet = activeApplet;
  const wasProjectionInitialized = Boolean(appletProjectionInitialized[normalizedId]);

  if (previousApplet && previousApplet !== normalizedId && APPLET_IDS.has(previousApplet)) {
    appletCameraState[previousApplet] = cameraController.getCameraSnapshot();
    persistActiveAppletWorldState();
  }

  activeApplet = normalizedId;
  applySceneObjectVisibility(normalizedId);
  applyAppletWorldState(normalizedId);
  if (!appletSimulationPrimed[normalizedId]) {
    simulations[normalizedId]?.reset?.();
    appletSimulationPrimed[normalizedId] = true;
  }

  dom.appletTabs?.forEach((tab) => {
    const tabApplet = tab.getAttribute("data-applet-item");
    const isActive = tabApplet === normalizedId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  applyAppletVisibility(normalizedId);
  updateMobileCurrentAppletLabel(normalizedId);
  visualControls?.syncFromParams?.();
  resetCompactSectionDefaults();
  const restoredCamera = cameraController.restoreCameraSnapshot(appletCameraState[normalizedId]);
  if (!restoredCamera) {
    applyDefaultProjectionForApplet(normalizedId);
  }
  applyCameraControlConfig(normalizedId, { resetToDefaults: !wasProjectionInitialized });

  setControlValue("camera-fov", params.cameraFov, "camera-fov-value", (value) => `${Math.round(value)}°`);
  setControlValue(
    "camera-move-speed",
    params.keyboardMoveSpeed,
    "camera-move-speed-value",
    (value) => formatKeyboardMoveSpeed(value),
  );
  setControlValue(
    "camera-rotation-speed",
    params.keyboardRotationSpeed,
    "camera-rotation-speed-value",
    (value) => formatKeyboardRotationSpeed(value),
  );
  updateProjectionToggleUI();
  spaceshipHud.update();
  if (previousApplet && APPLET_IDS.has(previousApplet)) {
    appletPausedPreferences[previousApplet] = params.paused;
  }
  params.paused = appletPausedPreferences[normalizedId];
  APPLET_DEFINITIONS[normalizedId].runtime?.applyStats?.(
    lastAppletStats[normalizedId],
    appletStatsApis[normalizedId],
  );
  refreshAppletLegend(normalizedId);

  updateSimulationStateUI();
  updateViewportLabel();
  updateNavActionPriorityVisibility();
  handleViewportResize();

  if (updateUrl) {
    setAppletInUrlParam(normalizedId, { replaceHistory: Boolean(replaceHistory) });
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

// Theme + Panels + Layout + Section Collapses
function setupThemeToggle() {
  const syncMobileThemeIcon = (mode) => {
    if (!dom.mobileNavThemeIcon) {
      return;
    }
    const iconMap = {
      auto: "bi-circle-half",
      dark: "bi-moon-stars-fill",
      light: "bi-sun-fill",
    };
    dom.mobileNavThemeIcon.className = `bi ${iconMap[mode] || "bi-circle-half"}`;
  };

  createThemeManager({
    toggleButton: dom.themeToggle,
    labelEl: dom.themeToggleLabel,
    iconEl: dom.themeToggleIcon,
    onThemeChange: (effectiveTheme, mode) => {
      syncMobileThemeIcon(mode);
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

  dom.mobileShowInfo?.addEventListener("click", () => {
    if (uiState.layoutMode !== "mobile") {
      return;
    }
    uiState.mobileForcedFromBoth = false;
    const nextVisible = !uiState.leftPanelVisible;
    uiState.leftPanelVisible = nextVisible;
    uiState.rightPanelVisible = false;
    applyPanelVisibility();
  });

  dom.mobileShowControls?.addEventListener("click", () => {
    if (uiState.layoutMode !== "mobile") {
      return;
    }
    uiState.mobileForcedFromBoth = false;
    const nextVisible = !uiState.rightPanelVisible;
    uiState.rightPanelVisible = nextVisible;
    uiState.leftPanelVisible = false;
    applyPanelVisibility();
  });

  applyPanelVisibility();
}

function setupMobileNavigation() {
  if (!dom.mobileNavBackdrop || !dom.mobileNavOpen || !dom.mobileNavClose) {
    return;
  }

  dom.mobileNavOpen.addEventListener("click", openMobileNavigation);
  dom.mobileNavClose.addEventListener("click", closeMobileNavigation);
  dom.mobileNavBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.mobileNavBackdrop) {
      closeMobileNavigation();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileNavigation();
    }
  });

  dom.mobileNavSupport?.addEventListener("click", () => {
    dom.supportInfoOpen?.click();
    closeMobileNavigation();
  });
  dom.mobileNavTheme?.addEventListener("click", () => {
    dom.themeToggle?.click();
  });
  dom.mobileNavAbout?.addEventListener("click", () => {
    dom.aboutInfoOpen?.click();
    closeMobileNavigation();
  });
}

function openMobileNavigation() {
  if (!dom.mobileNavBackdrop || !dom.mobileNavOpen) {
    return;
  }
  dom.mobileNavBackdrop.classList.remove("is-hidden");
  dom.mobileNavBackdrop.setAttribute("aria-hidden", "false");
  dom.mobileNavOpen.setAttribute("aria-expanded", "true");
}

function closeMobileNavigation() {
  if (!dom.mobileNavBackdrop || !dom.mobileNavOpen) {
    return;
  }
  dom.mobileNavBackdrop.classList.add("is-hidden");
  dom.mobileNavBackdrop.setAttribute("aria-hidden", "true");
  dom.mobileNavOpen.setAttribute("aria-expanded", "false");
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
      } else if (
        side === "right" &&
        (uiState.rightPanelVisible || (uiState.layoutMode === "middle" && uiState.leftPanelVisible))
      ) {
        const dynamicRightMax = uiState.layoutMode === "middle"
          ? Math.max(
              limits.rightMin,
              shellRect.width - minViewportWidth - resizerWidth,
            )
          : Math.max(
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
    };

    const onPointerEnd = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      if (pointerId !== undefined) {
        dom.leftResizer.releasePointerCapture?.(pointerId);
        dom.rightResizer.releasePointerCapture?.(pointerId);
      }
      handleViewportResize();
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

function setupMiddleResizer() {
  if (!dom.middleResizer || !dom.appShell) {
    return;
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const beginDrag = (pointerDownEvent) => {
    if (pointerDownEvent.button !== 0) {
      return;
    }
    if (uiState.layoutMode !== "middle" || !uiState.leftPanelVisible || !uiState.rightPanelVisible) {
      return;
    }

    const pointerId = pointerDownEvent.pointerId;

    const onPointerMove = (moveEvent) => {
      if (uiState.layoutMode !== "middle") {
        return;
      }
      const shellRect = dom.appShell.getBoundingClientRect();
      const totalHeight = Math.max(1, shellRect.height - middleLayoutState.resizerPx);
      const y = clamp(
        moveEvent.clientY - shellRect.top,
        middleLayoutState.minPanelPx,
        totalHeight - middleLayoutState.minPanelPx,
      );
      middleLayoutState.splitRatio = y / totalHeight;
      updateMiddleLayoutSizing();
    };

    const onPointerEnd = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      if (pointerId !== undefined) {
        dom.middleResizer.releasePointerCapture?.(pointerId);
      }
      handleViewportResize();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    if (pointerId !== undefined) {
      dom.middleResizer.setPointerCapture?.(pointerId);
    }
  };

  dom.middleResizer.addEventListener("pointerdown", beginDrag);
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
  const inMiddle = uiState.layoutMode === "middle";
  const rightStackVisible = uiState.leftPanelVisible || uiState.rightPanelVisible;
  if (uiState.layoutMode !== "mobile") {
    uiState.nonMobileVisibility = {
      left: uiState.leftPanelVisible,
      right: uiState.rightPanelVisible,
    };
  }

  dom.leftPanel.classList.toggle("is-hidden", !uiState.leftPanelVisible);
  dom.rightPanel.classList.toggle("is-hidden", !uiState.rightPanelVisible);
  dom.appShell.classList.toggle("left-hidden", !inMiddle && !uiState.leftPanelVisible);
  dom.appShell.classList.toggle("right-hidden", !inMiddle && !uiState.rightPanelVisible);
  dom.leftResizer?.classList.toggle("is-hidden", inMiddle || !uiState.leftPanelVisible);
  dom.rightResizer?.classList.toggle("is-hidden", inMiddle ? !rightStackVisible : !uiState.rightPanelVisible);

  dom.showLeftPanel.classList.toggle("is-hidden", uiState.leftPanelVisible);
  dom.showRightPanel.classList.toggle("is-hidden", uiState.rightPanelVisible);
  dom.hideLeftPanel.setAttribute("aria-pressed", String(!uiState.leftPanelVisible));
  dom.hideRightPanel.setAttribute("aria-pressed", String(!uiState.rightPanelVisible));

  const middleBothVisible = inMiddle && uiState.leftPanelVisible && uiState.rightPanelVisible;
  const middleNoneVisible = inMiddle && !uiState.leftPanelVisible && !uiState.rightPanelVisible;
  dom.appShell.classList.toggle("middle-info-only", inMiddle && uiState.leftPanelVisible && !uiState.rightPanelVisible);
  dom.appShell.classList.toggle("middle-controls-only", inMiddle && !uiState.leftPanelVisible && uiState.rightPanelVisible);
  dom.appShell.classList.toggle("middle-both-visible", middleBothVisible);
  dom.appShell.classList.toggle("middle-none-visible", middleNoneVisible);
  dom.middleResizer?.classList.toggle("is-hidden", !middleBothVisible);

  if (dom.mobileShowInfo) {
    dom.mobileShowInfo.classList.toggle("is-active", uiState.leftPanelVisible);
    dom.mobileShowInfo.setAttribute("aria-pressed", String(uiState.leftPanelVisible));
  }
  if (dom.mobileShowControls) {
    dom.mobileShowControls.classList.toggle("is-active", uiState.rightPanelVisible);
    dom.mobileShowControls.setAttribute("aria-pressed", String(uiState.rightPanelVisible));
  }

  updateMiddleLayoutSizing();

  requestAnimationFrame(() => {
    handleViewportResize();
  });
}

function handleViewportResize() {
  updateResponsiveLayoutMode();
  updateViewportOffsetHeight();
  updateMiddleLayoutSizing();
  updateNavActionPriorityVisibility();
  resizeRenderer();
  resizeTrendCharts();
}

function updateViewportOffsetHeight() {
  const navHeight = dom.topNav?.offsetHeight ?? 0;
  const mobileBarVisible =
    uiState.layoutMode === "mobile" &&
    Boolean(dom.mobilePanelBar) &&
    !dom.mobilePanelBar.classList.contains("is-hidden");
  const mobileBarHeight = mobileBarVisible ? dom.mobilePanelBar.offsetHeight : 0;
  const offsetHeight = Math.max(0, Math.round(navHeight + mobileBarHeight));
  document.documentElement.style.setProperty("--top-offset-h", `${offsetHeight}px`);
}

function updateResponsiveLayoutMode() {
  const viewportWidth = window.innerWidth;
  const nextLayoutMode = viewportWidth < mobileLayoutThresholdPx
    ? "mobile"
    : viewportWidth < middleLayoutThresholdPx
    ? "middle"
    : "desktop";

  document.body.classList.toggle("layout-mobile", nextLayoutMode === "mobile");
  document.body.classList.toggle("layout-middle", nextLayoutMode === "middle");
  document.body.classList.toggle("layout-desktop", nextLayoutMode === "desktop");

  if (!uiState.layoutInitialized) {
    uiState.layoutInitialized = true;
    uiState.layoutMode = nextLayoutMode;

    dom.appShell?.classList.toggle("is-mobile-layout", nextLayoutMode === "mobile");
    dom.appShell?.classList.toggle("is-middle-layout", nextLayoutMode === "middle");
    dom.mobilePanelBar?.classList.toggle("is-hidden", nextLayoutMode !== "mobile");
    dom.mobileNavOpen?.classList.toggle("is-hidden", nextLayoutMode !== "mobile");
    dom.mobileCurrentApplet?.classList.toggle("is-hidden", nextLayoutMode !== "mobile");

    if (nextLayoutMode === "mobile") {
      uiState.mobileForcedFromBoth = false;
      uiState.leftPanelVisible = false;
      uiState.rightPanelVisible = false;
    } else {
      uiState.leftPanelVisible = uiState.nonMobileVisibility.left;
      uiState.rightPanelVisible = uiState.nonMobileVisibility.right;
    }

    closeMobileNavigation();
    applyPanelVisibility();
    return;
  }

  if (nextLayoutMode !== uiState.layoutMode) {
    const previousLayoutMode = uiState.layoutMode;
    const previousLeftVisible = uiState.leftPanelVisible;
    const previousRightVisible = uiState.rightPanelVisible;
    if (previousLayoutMode !== "mobile") {
      uiState.nonMobileVisibility = {
        left: previousLeftVisible,
        right: previousRightVisible,
      };
    }
    uiState.layoutMode = nextLayoutMode;

    dom.appShell?.classList.toggle("is-mobile-layout", nextLayoutMode === "mobile");
    dom.appShell?.classList.toggle("is-middle-layout", nextLayoutMode === "middle");
    dom.mobilePanelBar?.classList.toggle("is-hidden", nextLayoutMode !== "mobile");
    dom.mobileNavOpen?.classList.toggle("is-hidden", nextLayoutMode !== "mobile");
    dom.mobileCurrentApplet?.classList.toggle("is-hidden", nextLayoutMode !== "mobile");

    if (nextLayoutMode === "mobile") {
      if (previousLeftVisible && previousRightVisible) {
        uiState.mobileForcedFromBoth = true;
        uiState.leftPanelVisible = false;
        uiState.rightPanelVisible = true;
      } else {
        uiState.mobileForcedFromBoth = false;
        uiState.leftPanelVisible = previousLeftVisible;
        uiState.rightPanelVisible = previousRightVisible;
      }
    } else if (previousLayoutMode === "mobile") {
      if (!uiState.mobileForcedFromBoth) {
        uiState.nonMobileVisibility = {
          left: previousLeftVisible,
          right: previousRightVisible,
        };
      }
      uiState.leftPanelVisible = uiState.nonMobileVisibility.left;
      uiState.rightPanelVisible = uiState.nonMobileVisibility.right;
      uiState.mobileForcedFromBoth = false;
    } else {
      uiState.leftPanelVisible = previousLeftVisible;
      uiState.rightPanelVisible = previousRightVisible;
    }

    closeMobileNavigation();
    applyPanelVisibility();
  }

}

function updateMiddleLayoutSizing() {
  if (uiState.layoutMode !== "middle" || !dom.appShell) {
    return;
  }

  const shellRect = dom.appShell.getBoundingClientRect();
  const totalHeight = Math.max(1, shellRect.height - middleLayoutState.resizerPx);
  const topHeight = Math.round(totalHeight * middleLayoutState.splitRatio);
  const clampedTop = Math.min(
    Math.max(topHeight, middleLayoutState.minPanelPx),
    Math.max(middleLayoutState.minPanelPx, totalHeight - middleLayoutState.minPanelPx),
  );
  const bottomHeight = Math.max(middleLayoutState.minPanelPx, totalHeight - clampedTop);

  dom.appShell.style.setProperty("--middle-resizer-h", `${middleLayoutState.resizerPx}px`);
  dom.appShell.style.setProperty("--middle-top-h", `${clampedTop}px`);
  dom.appShell.style.setProperty("--middle-bottom-h", `${bottomHeight}px`);
}

function updateNavActionPriorityVisibility() {
  if (!dom.topNavContainer || !dom.navBrandGroup || !dom.navActions) {
    return;
  }

  const priorityButtons = [dom.supportInfoOpen, dom.themeToggle, dom.aboutInfoOpen].filter(Boolean);
  priorityButtons.forEach((button) => button.classList.remove("nav-priority-hidden"));
  const minGapPx = 8;
  const hasCollision = () => {
    const brandRect = dom.navBrandGroup.getBoundingClientRect();
    const actionsRect = dom.navActions.getBoundingClientRect();
    return brandRect.right + minGapPx > actionsRect.left;
  };

  if (!hasCollision()) {
    syncMobileNavPriorityActions();
    return;
  }

  for (const button of priorityButtons) {
    if (!hasCollision()) {
      break;
    }
    button.classList.add("nav-priority-hidden");
  }

  syncMobileNavPriorityActions();
}

function syncMobileNavPriorityActions() {
  if (!dom.mobileNavActions) {
    return;
  }

  const actionBindings = [
    [dom.supportInfoOpen, dom.mobileNavSupport],
    [dom.themeToggle, dom.mobileNavTheme],
    [dom.aboutInfoOpen, dom.mobileNavAbout],
  ];

  let visibleCount = 0;
  actionBindings.forEach(([topButton, sideButton]) => {
    if (!sideButton) {
      return;
    }
    const isHiddenInTopNav = Boolean(topButton?.classList.contains("nav-priority-hidden"));
    sideButton.classList.toggle("is-hidden", !isHiddenInTopNav);
    if (isHiddenInTopNav) {
      visibleCount += 1;
    }
  });

  dom.mobileNavActions.classList.toggle("is-hidden", visibleCount === 0);
}

// Trend Charts + Runtime Metrics
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
      resizeChartCanvas(getElement(metric.canvasId));
    });
  });
  drawTrendCharts();
}

function drawTrendCharts() {
  APPLET_ORDER.forEach((appletId) => {
    chartState[appletId]?.metrics.forEach((metric) => {
      renderTrendChart(getElement(metric.canvasId), metric.history, metric.options);
    });
  });
}

function getTrendChartCanvasId(appletId, key) {
  return `chart-${key}`;
}

function getTrendChartLiveId(appletId, key) {
  return `${getTrendChartCanvasId(appletId, key)}-live`;
}

function createChartMetricsEntry(appletId, key, initialText, options) {
  const normalizedAppletId = String(appletId ?? "").trim();
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedAppletId || !normalizedKey) {
    throw new Error("[app] Chart metric entry requires non-empty applet id and key.");
  }
  const sanitizedOptions = { ...(options || {}) };
  delete sanitizedOptions.axisLabel;
  return {
    key: normalizedKey,
    canvasId: getTrendChartCanvasId(normalizedAppletId, normalizedKey),
    liveId: getTrendChartLiveId(normalizedAppletId, normalizedKey),
    initialText,
    options: sanitizedOptions,
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
    appendTrendValue(metric.history, values[index], chartMaxPoints);
  });
  drawTrendCharts();
}

// Generic Control Utils + Compact Slider Hub
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
    output.dataset.formattedValue = display;
    syncCompactSectionSlider(inputId);
    visualControls?.refreshLegend?.(activeApplet);
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
  const display = formatter(value);
  output.textContent = display;
  output.dataset.formattedValue = display;
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
      sectionKey,
      hub,
      slider,
      title,
      value,
      defaultTitleText: title.textContent || "",
      defaultValueText: value.textContent || "",
      activeInputId: null,
      firstInputId: null,
    };
    hub.classList.add("is-hidden");

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

    const isRangeInteraction = Boolean(
      target.closest('input[type="range"]') ||
      target.closest("select.compact-source-select") ||
      target.closest(".section-slider-hub") ||
      target.closest(".compact-value-trigger"),
    );
    if (isRangeInteraction) {
      return;
    }

    blurFocusedRange();
    clearActiveCompactRangeControls();
  }, true);
}

function getFirstCompactRangeInputId(sectionKey) {
  if (!sectionKey) {
    return null;
  }

  const section = document.querySelector(`[data-control-section="${sectionKey}"]`);
  const firstInput = section?.querySelector("input.compact-source-slider[id]");
  return firstInput?.id || null;
}

function getSelectDisplayText(select) {
  if (!(select instanceof HTMLSelectElement)) {
    return "";
  }
  const option = select.options?.[select.selectedIndex];
  return option?.textContent?.trim() || String(select.value || "");
}

function getBoundaryModeDisplayText(value = dom.boundaryMode?.value) {
  if (!dom.boundaryMode) {
    return String(value ?? "");
  }
  const normalized = normalizeBoundaryMode(value);
  const option = Array.from(dom.boundaryMode.options || []).find((item) => item.value === normalized);
  const shortText = option?.getAttribute("data-short")?.trim();
  if (shortText) {
    return shortText;
  }
  return option?.textContent?.trim() || normalized;
}

function syncBoundaryModeDisplayText() {
  if (!dom.boundaryModeValue) {
    return;
  }
  const display = getBoundaryModeDisplayText(dom.boundaryMode?.value);
  dom.boundaryModeValue.textContent = display;
  dom.boundaryModeValue.dataset.formattedValue = display;
}

function registerCompactSelectControl(selectRef, outputRef) {
  const select = typeof selectRef === "string" ? document.getElementById(selectRef) : selectRef;
  const output = typeof outputRef === "string" ? document.getElementById(outputRef) : outputRef;
  if (!(select instanceof HTMLSelectElement) || !(output instanceof HTMLElement) || !select.id) {
    return;
  }

  const section = select.closest("[data-control-section]");
  const sectionKey = section?.getAttribute("data-control-section") || "";
  const labelEl = section?.querySelector(`label[for="${select.id}"]`);
  const labelNameEl = labelEl?.querySelector(".label-name");
  const labelText = labelNameEl ? labelNameEl.textContent.trim() : select.id;

  const binding = {
    select,
    output,
    sectionKey,
    labelText,
  };
  compactSelectRegistry.set(select.id, binding);

  select.classList.add("compact-source-select");
  output.classList.add("compact-value-trigger");
  output.setAttribute("role", "button");
  output.setAttribute("tabindex", "0");
  output.setAttribute("aria-label", `Edit ${labelText}`);

  const syncOutput = () => {
    const display = select.id === "boundary-mode"
      ? getBoundaryModeDisplayText(select.value)
      : getSelectDisplayText(select);
    output.textContent = display;
    output.dataset.formattedValue = display;
  };

  const activate = (event) => {
    if (
      event.type === "keydown" &&
      event.key !== "Enter" &&
      event.key !== " " &&
      event.key !== "F2"
    ) {
      return;
    }
    if (event.type === "keydown") {
      event.preventDefault();
    }
    activateCompactSelectControl(select.id);
  };

  output.addEventListener("click", activate);
  output.addEventListener("keydown", activate);
  select.addEventListener("change", syncOutput);
  select.addEventListener("blur", () => {
    setTimeout(() => {
      if (activeCompactSelectId === select.id) {
        clearActiveCompactRangeControls();
      }
    }, 0);
  });

  syncOutput();
}

function activateCompactSelectControl(selectId) {
  const binding = compactSelectRegistry.get(selectId);
  if (!binding) {
    return;
  }

  if (activeCompactSelectId === selectId) {
    binding.select.focus();
    return;
  }

  clearActiveCompactRangeControls();
  activeCompactSelectId = selectId;

  for (const item of compactSelectRegistry.values()) {
    const isActive = item.select.id === selectId;
    item.output.classList.toggle("is-active-control", isActive);
    item.select.classList.toggle("is-active-select", isActive);
  }

  binding.select.focus();
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

  sectionState.firstInputId = getFirstCompactRangeInputId(sectionKey) || sectionState.firstInputId || input.id;

  const activate = (event) => {
    const binding = compactRangeRegistry.get(input.id);
    const isEditable = Boolean(binding && isCompactValueEditable(binding));
    if (isEditable) {
      if (event.type === "click") {
        event.preventDefault();
        focusEditableText(output);
        return;
      }

      if (event.type === "keydown") {
        if (event.key === "F2") {
          event.preventDefault();
          focusEditableText(output);
        }
        return;
      }
    }

    if (
      event.type === "keydown" &&
      event.key !== "Enter" &&
      event.key !== " " &&
      event.key !== "F2"
    ) {
      return;
    }

    if (event.type === "keydown") {
      event.preventDefault();
    }

    activateCompactRangeControl(input.id);
  };

  output.addEventListener("pointerdown", (event) => {
    const binding = compactRangeRegistry.get(input.id);
    if (!binding || !isCompactValueEditable(binding)) {
      return;
    }
    // Prevent label default behavior from stealing focus to the hidden range input.
    event.preventDefault();
    focusEditableText(output);
  });
  output.addEventListener("click", activate);
  output.addEventListener("keydown", activate);
  output.addEventListener("blur", () => {
    const binding = compactRangeRegistry.get(input.id);
    if (!binding) {
      return;
    }
    if (!isCompactValueEditable(binding)) {
      return;
    }
    commitCompactValueEdit(binding);
    // Defer close check so focus can settle on the compact slider input.
    setTimeout(() => {
      const sectionState = compactSectionState[binding.sectionKey];
      const activeElement = document.activeElement;
      const focusInsideHub = Boolean(
        sectionState?.hub &&
        activeElement instanceof Element &&
        sectionState.hub.contains(activeElement),
      );
      if (focusInsideHub) {
        return;
      }
      if (binding.input.id === sectionState?.activeInputId) {
        clearActiveCompactRangeControls();
      }
    }, 0);
  });
  output.addEventListener("keydown", (event) => {
    const binding = compactRangeRegistry.get(input.id);
    if (!binding) {
      return;
    }
    if (!isCompactValueEditable(binding)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitCompactValueEdit(binding);
      output.blur();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      restoreCompactValueDisplay(binding);
      output.blur();
    }
  });

  setCompactValueEditable(compactRangeRegistry.get(input.id), false);
  restoreCompactValueDisplay(compactRangeRegistry.get(input.id));
  syncCompactSectionSlider(input.id);
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

  clearActiveCompactRangeControls({ keepInputId: inputId });
  sectionState.activeInputId = inputId;
  sectionState.hub.classList.remove("is-hidden");
  if (binding.labelTitleNode) {
    sectionState.title.replaceChildren(binding.labelTitleNode.cloneNode(true));
  } else {
    sectionState.title.textContent = binding.labelText;
  }
  sectionState.slider.min = binding.input.min;
  sectionState.slider.max = binding.input.max;
  sectionState.slider.step = binding.input.step || "1";
  sectionState.slider.value = binding.input.value;
  sectionState.value.textContent = binding.output.dataset.formattedValue || binding.output.textContent;
  if (sectionState.hub && binding.labelEl && binding.labelEl.parentElement) {
    binding.labelEl.insertAdjacentElement("afterend", sectionState.hub);
  }

  for (const item of compactRangeRegistry.values()) {
    const isActive = item.input.id === inputId;
    item.output.classList.toggle("is-active-control", isActive);
    setCompactValueEditable(item, isActive);
    if (!isActive) {
      restoreCompactValueDisplay(item);
    }
  }

  restoreCompactValueDisplay(binding);
}

function resetCompactSectionDefaults() {
  clearActiveCompactRangeControls();
}

function clearActiveCompactRangeControls(options = {}) {
  if (isClearingCompactControls) {
    return;
  }
  isClearingCompactControls = true;
  const keepInputId = options.keepInputId || null;
  try {
    for (const item of compactRangeRegistry.values()) {
      const shouldKeep = keepInputId && item.input.id === keepInputId;
      if (!shouldKeep && isCompactValueEditable(item)) {
        item.output.blur();
      }
      if (!shouldKeep) {
        item.output.classList.remove("is-active-control");
        setCompactValueEditable(item, false);
        restoreCompactValueDisplay(item);
      }
    }

    Object.values(compactSectionState).forEach((sectionState) => {
      if (!sectionState) {
        return;
      }
      const shouldKeep = keepInputId && sectionState.activeInputId === keepInputId;
      if (shouldKeep) {
        return;
      }
      sectionState.activeInputId = null;
      if (sectionState.defaultTitleText) {
        sectionState.title.textContent = sectionState.defaultTitleText;
      }
      if (sectionState.defaultValueText) {
        sectionState.value.textContent = sectionState.defaultValueText;
      }
      sectionState.hub.classList.add("is-hidden");
    });

    const keepSelectId = options.keepSelectId || null;
    for (const item of compactSelectRegistry.values()) {
      const shouldKeep = keepSelectId && item.select.id === keepSelectId;
      if (!shouldKeep) {
        item.select.classList.remove("is-active-select");
        item.output.classList.remove("is-active-control");
      }
    }
    if (!keepSelectId) {
      activeCompactSelectId = null;
    }
  } finally {
    isClearingCompactControls = false;
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

  sectionState.slider.min = binding.input.min;
  sectionState.slider.max = binding.input.max;
  sectionState.slider.step = binding.input.step || "1";
  sectionState.slider.value = binding.input.value;
  sectionState.value.textContent = binding.output.dataset.formattedValue || binding.output.textContent;
  restoreCompactValueDisplay(binding);
}

function isCompactValueEditable(binding) {
  return binding?.output?.getAttribute("contenteditable") === "true";
}

function setCompactValueEditable(binding, editable) {
  const output = binding?.output;
  if (!output) {
    return;
  }
  const sectionKey = String(binding.sectionKey || "").toLowerCase();
  const supportsInlineNumericEdit =
    sectionKey === "world" ||
    sectionKey === "camera" ||
    sectionKey.includes("simulation") ||
    sectionKey.includes("interaction");
  const canEdit = editable && supportsInlineNumericEdit;
  output.setAttribute("contenteditable", canEdit ? "true" : "false");
  output.setAttribute("role", canEdit ? "textbox" : "button");
  output.setAttribute("aria-label", canEdit ? `Edit ${binding.labelText} value` : `Edit ${binding.labelText}`);
  if (canEdit) {
    output.setAttribute("inputmode", "decimal");
    output.setAttribute("spellcheck", "false");
  } else {
    output.removeAttribute("inputmode");
    output.removeAttribute("spellcheck");
  }
}

function restoreCompactValueDisplay(binding) {
  if (!binding?.input || !binding?.output) {
    return;
  }

  if (isCompactValueEditable(binding)) {
    binding.output.textContent = formatCompactEditableNumber(binding.input.value, binding.input.step);
    return;
  }

  binding.output.textContent = binding.output.dataset.formattedValue || binding.output.textContent;
}

function commitCompactValueEdit(binding) {
  if (!binding?.input || !binding?.output) {
    return;
  }

  const parsed = parseStrictNumericText(binding.output.textContent);
  if (!Number.isFinite(parsed)) {
    restoreCompactValueDisplay(binding);
    return;
  }

  const nextValue = clampAndSnapRangeValue(binding.input, parsed);
  binding.input.value = String(nextValue);
  binding.input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clampAndSnapRangeValue(input, value) {
  const min = Number.parseFloat(input?.min ?? "");
  const max = Number.parseFloat(input?.max ?? "");
  const step = Number.parseFloat(input?.step ?? "");
  const hasStep = Number.isFinite(step) && step > 0;
  const base = Number.isFinite(min) ? min : 0;

  let next = value;
  if (Number.isFinite(min)) {
    next = Math.max(min, next);
  }
  if (Number.isFinite(max)) {
    next = Math.min(max, next);
  }
  if (hasStep) {
    next = base + Math.round((next - base) / step) * step;
  }
  if (Number.isFinite(min)) {
    next = Math.max(min, next);
  }
  if (Number.isFinite(max)) {
    next = Math.min(max, next);
  }
  return Number.parseFloat(formatCompactEditableNumber(next, input?.step));
}

function formatCompactEditableNumber(value, stepText) {
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) {
    return "";
  }

  const step = Number.parseFloat(stepText ?? "");
  const decimals = Number.isFinite(step) && step > 0
    ? Math.min(6, Math.max(0, (String(stepText).split(".")[1] || "").length))
    : 3;
  const rendered = numeric.toFixed(decimals);
  if (!rendered.includes(".")) {
    return rendered;
  }
  return rendered
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

function parseStrictNumericText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return Number.NaN;
  }
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
    return Number.NaN;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function resizeRenderer() {
  const width = Math.max(1, Math.floor(dom.sceneHost.clientWidth));
  const height = Math.max(1, Math.floor(dom.sceneHost.clientHeight));

  renderer.setSize(width, height, false);

  perspectiveCamera.aspect = width / height;
  perspectiveCamera.updateProjectionMatrix();

  cameraController.updateOrthographicCamera(false);
  updateViewportLabel();
  updateOrientationIndicator();
}

function updateOrientationIndicator() {
  const canvas = dom.orientationIndicator;
  if (!canvas) {
    return;
  }
  const ctx = canvas.getContext("2d");
  const activeCamera = cameraController.getActiveCamera();
  if (!ctx || !activeCamera) {
    return;
  }

  const cssWidth = Math.max(1, Math.floor(canvas.clientWidth || 84));
  const cssHeight = Math.max(1, Math.floor(canvas.clientHeight || 84));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radius = Math.min(width, height) * 0.32;
  const fontPx = Math.max(10, Math.round(11 * dpr));
  const theme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
  const ringStroke = theme === "light" ? "rgba(69, 100, 150, 0.45)" : "rgba(150, 184, 245, 0.35)";
  const centerFill = theme === "light" ? "rgba(63, 97, 150, 0.95)" : "rgba(182, 214, 255, 0.95)";
  const labelColorRaw = getComputedStyle(document.body).getPropertyValue("--text-soft");
  const axisLabelColor = labelColorRaw?.trim() || (theme === "light" ? "#5a6b8b" : "#a7b6d8");

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = ringStroke;
  ctx.lineWidth = Math.max(1, dpr);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 2 * dpr, 0, Math.PI * 2);
  ctx.stroke();

  orientationIndicatorInvQuat.copy(activeCamera.quaternion).invert();
  const projected = orientationIndicatorAxes.map((axis) => {
    orientationIndicatorDir.copy(axis.vector).applyQuaternion(orientationIndicatorInvQuat).normalize();
    return {
      ...axis,
      x: orientationIndicatorDir.x,
      y: orientationIndicatorDir.y,
      z: orientationIndicatorDir.z,
    };
  });

  projected.sort((a, b) => a.z - b.z);

  ctx.font = `${fontPx}px "Space Grotesk", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  projected.forEach((axis) => {
    const tipX = centerX + axis.x * radius;
    const tipY = centerY - axis.y * radius;
    const depth = THREE.MathUtils.clamp((1 - axis.z) * 0.5, 0, 1);
    const alpha = 0.42 + depth * 0.55;
    const lineWidth = (1.2 + depth * 1.6) * dpr;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = axis.color;
    ctx.fillStyle = axis.color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const angle = Math.atan2(tipY - centerY, tipX - centerX);
    const headLength = Math.max(5, 7 * dpr);
    const spread = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - headLength * Math.cos(angle - spread),
      tipY - headLength * Math.sin(angle - spread),
    );
    ctx.lineTo(
      tipX - headLength * Math.cos(angle + spread),
      tipY - headLength * Math.sin(angle + spread),
    );
    ctx.closePath();
    ctx.fill();

    const labelDistance = Math.max(10, 11 * dpr);
    ctx.fillStyle = axisLabelColor;
    ctx.fillText(
      axis.label,
      tipX + Math.cos(angle) * labelDistance,
      tipY + Math.sin(angle) * labelDistance,
    );
    ctx.restore();
  });

  ctx.fillStyle = centerFill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(2.2, 2.8 * dpr), 0, Math.PI * 2);
  ctx.fill();
}

function setupOrientationIndicatorInteractions() {
  if (!dom.orientationIndicator) {
    return;
  }

  dom.orientationIndicator.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    snapCameraToPerspectiveInitialOrientation();
  });
}

function snapCameraToPerspectiveInitialOrientation() {
  const appletCameraDefaults = getAppletCameraDefaults(activeApplet);
  params.cameraDistance = appletCameraDefaults.cameraDistance;
  params.cameraHeight = appletCameraDefaults.cameraHeight;

  if (params.projectionMode !== "perspective") {
    params.projectionMode = "perspective";
    updateProjectionToggleUI();
  }

  perspectiveCamera.up.set(0, 0, 1);
  controls.target.set(0, 0, 0);
  cameraController.switchToPerspective();
  cameraController.updateTelemetry();
  updateOrientationIndicator();
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

function getActiveSimulationSpeed() {
  return THREE.MathUtils.clamp(Number(params[activeApplet]?.simSpeed) || 1, 0.1, 10);
}

// Math Rendering Bootstrap
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
