// Main application bootstrap that wires simulations, UI state, charts, and routing.
import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { applyWorldTheme, createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";
import { SimulationManager } from "./simulationManager.js";
import { createVisualControls } from "./visualControls.js";
import { setupUiOverlays } from "./uiOverlays.js";
import {
  normalizeAppletId as normalizeAppletIdParam,
  setAppletInUrl as setAppletInUrlParam,
  setupAppRouting as setupUrlRouting,
} from "./routing.js";
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

// App Bootstrapping: Core Params + Initial UI Template Rendering
const DEFAULT_APPLET_ID = APPLET_ORDER[0] || "boid";

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
renderAppletNavigationFromConfig();
scheduleMathRendering();

// Applet Defaults + Navigation Rendering
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
  homeCamera: document.getElementById("home-camera"),
  showBounds: document.getElementById("show-bounds"),
  cameraLocked: document.getElementById("camera-locked"),
  boundaryMode: document.getElementById("boundary-mode"),
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

// World Unit + Display Formatting Helpers
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
  return APPLET_META[appletId]?.shortLabel ?? APPLET_META[appletId]?.label ?? "Applet";
}

function refreshAppletLegend(appletId = activeApplet) {
  visualControls?.refreshLegend?.(appletId);
}

const compactRangeRegistry = new Map();
const compactSectionState = {};
const APPLET_IDS = new Set(APPLET_ORDER);
const ROUTING_OPTIONS = {
  validAppletIds: APPLET_IDS,
  defaultAppletId: DEFAULT_APPLET_ID,
};
const appletCameraState = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));
const appletWorldState = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, createDefaultWorldState(id)]),
);
let worldStatePersistenceEnabled = false;

let activeApplet = DEFAULT_APPLET_ID;
const appletPausedPreferences = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, params.paused]),
);
const appletProjectionInitialized = Object.fromEntries(APPLET_ORDER.map((id) => [id, false]));

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
      metrics: APPLET_DEFINITIONS[id].runtime?.createChartMetrics?.(createChartMetricsEntry) ?? [],
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

// Startup Wiring + App Initialization Sequence
cameraController.setPerspectiveCameraFromParams(false);
cameraController.updateOrthographicCamera(true);
cameraController.applyCameraInteractivity();
rebuildBoundsAndGrid();
simulationManager.initAll();
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
  getShowBounds: () => params.showBounds,
  setShowBounds: (value) => {
    params.showBounds = Boolean(value);
    dom.showBounds.checked = params.showBounds;
    world.setBoundsVisibility(params.showBounds);
  },
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
        cameraController.switchToOrthographicTop();
      } else {
        params.projectionMode = "perspective";
        cameraController.switchToPerspective();
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
      cameraController.updateOrthographicCamera(false);
      cameraController.resetOrientationKeepPosition();
      cameraController.applyCameraInteractivity();
      cameraController.updateTelemetry();
      updateProjectionToggleUI();
      updateViewportLabel();
    });
  }

  if (dom.homeCamera) {
    dom.homeCamera.addEventListener("click", () => {
      cameraController.moveActiveCameraToOrigin();
      cameraController.updateTelemetry();
      updateViewportLabel();
    });
  }

  dom.showBounds.checked = params.showBounds;
  dom.cameraLocked.checked = params.cameraLocked;
  dom.boundaryMode.value = params.boundaryMode;
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
    const sliders = APPLET_CONFIGS[appletId]?.right?.simulation?.sliders;
    if (!Array.isArray(sliders) || sliders.length === 0) {
      return;
    }

    sliders.forEach((slider) => {
      const inputId = getSimulationSliderInputId(appletId, slider);
      const valueId = getSimulationSliderValueId(appletId, slider);
      bindRange(inputId, valueId, (value) => {
        const displayValue = handleAppletSliderInput(appletId, slider, value);
        return formatSliderDisplayValue(slider, displayValue);
      });
    });
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
  return `${appletId}-${slider.valueId}`;
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
    return String(value);
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
  const sliders = APPLET_CONFIGS[appletId]?.right?.simulation?.sliders;
  if (!Array.isArray(sliders) || sliders.length === 0) {
    return;
  }

  sliders.forEach((slider) => {
    const input = document.getElementById(getSimulationSliderInputId(appletId, slider));
    if (!input) {
      return;
    }
    input.value = String(slider.value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// App Routing + Applet Switching + Persisted Per-Applet State
function setupAppRouting() {
  setupUrlRouting({
    ...ROUTING_OPTIONS,
    applyAppletMode,
  });
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
  refreshAppletLegend(appletId);
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
    cameraController.switchToOrthographicTop();
  } else {
    params.projectionMode = "perspective";
    cameraController.switchToPerspective();
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
  updateMobileCurrentAppletLabel(normalizedId);
  visualControls?.syncFromParams?.();
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
  createThemeManager({
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
    return;
  }

  for (const button of priorityButtons) {
    if (!hasCollision()) {
      break;
    }
    button.classList.add("nav-priority-hidden");
  }
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

function createChartMetricsEntry(canvasId, liveId, initialText, options) {
  const sanitizedOptions = { ...(options || {}) };
  delete sanitizedOptions.axisLabel;
  return {
    canvasId,
    liveId,
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

function getFirstCompactRangeInputId(sectionKey) {
  if (!sectionKey) {
    return null;
  }

  const section = document.querySelector(`[data-control-section="${sectionKey}"]`);
  const firstInput = section?.querySelector("input.compact-source-slider[id]");
  return firstInput?.id || null;
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
  sectionState.value.textContent = binding.output.dataset.formattedValue || binding.output.textContent;
  if (sectionState.hub && binding.labelEl && binding.labelEl.parentElement) {
    binding.labelEl.insertAdjacentElement("afterend", sectionState.hub);
  }

  for (const item of compactRangeRegistry.values()) {
    if (item.sectionKey === binding.sectionKey) {
      const isActive = item.input.id === inputId;
      item.output.classList.toggle("is-active-control", isActive);
      setCompactValueEditable(item, isActive);
      if (!isActive) {
        restoreCompactValueDisplay(item);
      }
    }
  }

  restoreCompactValueDisplay(binding);
}

function resetCompactSectionDefaults() {
  Object.values(compactSectionState).forEach((sectionState) => {
    const firstInputId = getFirstCompactRangeInputId(sectionState?.sectionKey) || sectionState?.firstInputId;
    if (!firstInputId) {
      return;
    }
    sectionState.firstInputId = firstInputId;
    activateCompactRangeControl(firstInputId);
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


