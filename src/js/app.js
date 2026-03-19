// Main application bootstrap that wires simulations, UI state, charts, and routing.
import * as THREE from "three";
import { createCameraController } from "./camera.js";
import { applyWorldTheme, createThemeManager } from "./theme.js";
import { createWorldManager } from "./world.js";
import { SimulationManager } from "./simulationManager.js";
import { createVisualControls } from "./visualControls.js";
import { setupUiOverlays } from "./uiOverlays.js";
import { createSpaceshipHudController } from "./spaceship.js";
import { createAppletSession } from "./session.js";
import {
  normalizeAppletId as normalizeAppletIdParam,
  normalizeAppletIds as normalizeAppletIdsParam,
  setAppletRouteInUrl as setAppletRouteInUrlParam,
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
import { SITE_VERSION } from "./version.js";
import {
  getAngularUnitDisplayTransform,
  getFrequencyUnitDisplayTransform,
  getKinematicUnitDisplayTransform,
  getLengthUnitDisplayTransform,
  getSimpleUnitDisplayTransform,
  getUnitDimensionTuple,
} from "./units.js";
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
};

function applySiteVersionTag() {
  const version = String(SITE_VERSION || "").trim();
  if (!version) {
    return;
  }
  document.documentElement.setAttribute("data-site-version", version);
  document.body?.setAttribute("data-site-version", version);
}

function cloneJsonSafe(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return fallback;
  }
}

function pickAppletParamsBySection(appletId, sectionKey) {
  const section = APPLET_CONFIGS[appletId]?.[sectionKey];
  const entries = Array.isArray(section?.params) ? section.params : [];
  const source = params[appletId] || {};
  const picked = {};

  entries.forEach((entry) => {
    const key = String(entry?.key || "").trim();
    if (!key || !Object.prototype.hasOwnProperty.call(source, key)) {
      return;
    }
    picked[key] = source[key];
  });

  return picked;
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

  if (desktopHost) {
    desktopHost.replaceChildren();

    const navInline = document.createElement("div");
    navInline.className = "applet-nav-inline";

    const currentButton = document.createElement("button");
    currentButton.type = "button";
    currentButton.className = "applet-nav-current";
    currentButton.id = "opened-apps-toggle";
    currentButton.setAttribute("title", "Switch or close opened applets");
    currentButton.setAttribute("aria-label", "Switch or close opened applets");
    currentButton.setAttribute("aria-controls", "opened-apps-menu");
    currentButton.setAttribute("aria-expanded", "false");

    const currentLabel = document.createElement("span");
    currentLabel.className = "applet-nav-current-label";
    currentLabel.id = "opened-apps-title";
    currentLabel.textContent = String(APPLET_META[DEFAULT_APPLET_ID]?.key ?? DEFAULT_APPLET_ID);
    currentButton.appendChild(currentLabel);

    const currentIcon = document.createElement("i");
    currentIcon.className = "bi bi-caret-down-fill";
    currentIcon.setAttribute("aria-hidden", "true");
    currentButton.appendChild(currentIcon);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "applet-nav-add";
    addButton.id = "launcher-open";
    addButton.setAttribute("title", "Open launcher");
    addButton.setAttribute("aria-label", "Open launcher");
    addButton.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i>';

    navInline.append(currentButton, addButton);

    const menu = document.createElement("div");
    menu.className = "opened-apps-menu is-hidden";
    menu.id = "opened-apps-menu";
    menu.setAttribute("aria-hidden", "true");

    const menuList = document.createElement("div");
    menuList.className = "opened-apps-menu-list";
    menuList.id = "opened-apps-menu-list";

    menu.append(menuList);
    desktopHost.append(navInline, menu);
  }

  if (mobileHost) {
    mobileHost.replaceChildren();
    APPLET_ORDER.forEach((id, index) => {
      const meta = APPLET_META[id] || {};
      const tabLabel = String(meta.key ?? id);
      const titleLabel = String(meta.label ?? meta.key ?? tabLabel);

      const mobileRow = document.createElement("div");
      mobileRow.className = "mobile-applet-row";

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
      mobileRow.appendChild(mobileButton);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "mobile-applet-close";
      closeButton.setAttribute("title", `Close ${titleLabel}`);
      closeButton.setAttribute("aria-label", `Close ${titleLabel}`);
      closeButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeLoadedApplet(id, { keepLauncherOpen: false });
      });
      mobileRow.appendChild(closeButton);

      mobileHost.appendChild(mobileRow);
    });
  }
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
  exportPreviewCopy: document.getElementById("export-preview-copy"),
  exportPreviewCode: document.getElementById("export-preview-code"),
  exportPreviewLines: document.getElementById("export-preview-lines"),
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
  launcherOpen: document.getElementById("launcher-open"),
  openedAppsToggle: document.getElementById("opened-apps-toggle"),
  openedAppsTitle: document.getElementById("opened-apps-title"),
  openedAppsMenu: document.getElementById("opened-apps-menu"),
  openedAppsMenuList: document.getElementById("opened-apps-menu-list"),
  mobileNavLauncher: document.getElementById("mobile-nav-launcher"),
  welcomeOverlay: document.getElementById("welcome-overlay"),
  welcomeGridGroups: document.getElementById("welcome-grid-groups"),
  welcomeStatusCopy: document.getElementById("welcome-status-copy"),
  welcomeSiteVersion: document.getElementById("welcome-site-version"),
  welcomeSortToggle: document.getElementById("welcome-sort-toggle"),
  welcomeClose: document.getElementById("welcome-close"),
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
    const state = appletSession.ensureWorldState(appletId, createDefaultWorldState);
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
const DEFAULT_WORLD_PARAM_DEFINITIONS = Object.freeze({
  x: Object.freeze({ key: "x", default: 100, uiMin: 40, uiMax: 320, step: 2 }),
  y: Object.freeze({ key: "y", default: 100, uiMin: 40, uiMax: 320, step: 2 }),
  z: Object.freeze({ key: "z", default: 100, uiMin: 30, uiMax: 260, step: 2 }),
  gridSize: Object.freeze({ key: "gridSize", default: 5, uiMin: 2, uiMax: 320, step: 2 }),
  boundaryMode: Object.freeze({ key: "boundaryMode", default: "cyclic-xyz" }),
});
const DEFAULT_WORLD_LENGTH_UNIT = Object.freeze({ name: "m", toSI: 1 });

function getWorldParamDefinition(appletId, key) {
  const normalizedKey = String(key || "").trim();
  const paramsList = Array.isArray(APPLET_CONFIGS[appletId]?.world?.params)
    ? APPLET_CONFIGS[appletId].world.params
    : [];
  const paramEntry = paramsList.find((entry) => entry?.key === key);
  if (paramEntry) {
    return paramEntry;
  }

  if (normalizedKey === "boundaryMode") {
    return {
      key: "boundaryMode",
      default: DEFAULT_WORLD_PARAM_DEFINITIONS.boundaryMode.default,
    };
  }

  return DEFAULT_WORLD_PARAM_DEFINITIONS[normalizedKey] ?? DEFAULT_WORLD_PARAM_DEFINITIONS.gridSize;
}

function getWorldBoundaryModeDefault(appletId) {
  const configDefault = APPLET_CONFIGS[appletId]?.world?.defaultBoundaryMode;
  if (typeof configDefault === "string" && configDefault.trim().length > 0) {
    return normalizeBoundaryMode(configDefault);
  }
  return normalizeBoundaryMode(getWorldParamDefinition(appletId, "boundaryMode")?.default);
}

function getAppletDefaultProjection(appletId = activeApplet) {
  const configDefault = APPLET_CONFIGS[appletId]?.camera?.defaultProjection;
  if (typeof configDefault === "string" && configDefault.trim().length > 0) {
    return configDefault.trim().toLowerCase() === "orthographic" ? "orthographic" : "perspective";
  }
  const cameraParams = Array.isArray(APPLET_CONFIGS[appletId]?.camera?.params)
    ? APPLET_CONFIGS[appletId].camera.params
    : [];
  const projectionParam = cameraParams.find((entry) => String(entry?.key || "").trim() === "projection");
  const projection = String(projectionParam?.default || "perspective").trim().toLowerCase();
  return projection === "orthographic" ? "orthographic" : "perspective";
}

function getAppletLengthUnit(appletId = activeApplet) {
  const unit = APPLET_CONFIGS[appletId]?.world?.lengthUnit;
  if (!unit || typeof unit !== "object") {
    return DEFAULT_WORLD_LENGTH_UNIT;
  }
  const name = String(unit.name || "").trim() || DEFAULT_WORLD_LENGTH_UNIT.name;
  const toSI = Number(unit.toSI);
  return {
    name,
    toSI: Number.isFinite(toSI) && toSI > 0 ? toSI : DEFAULT_WORLD_LENGTH_UNIT.toSI,
  };
}

function worldValuesUseAppletLengthUnit(appletId = activeApplet) {
  const appletLengthUnit = getAppletLengthUnit(appletId);
  const simulationLengthUnit = APPLET_CONFIGS[appletId]?.unit?.length;
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

function getWorldDimensionParams(appletId) {
  return {
    x: getWorldParamDefinition(appletId, "x"),
    y: getWorldParamDefinition(appletId, "y"),
    z: getWorldParamDefinition(appletId, "z"),
    gridSize: getWorldParamDefinition(appletId, "gridSize"),
  };
}

function applyRangeToInput(input, param) {
  if (!input || !param) {
    return;
  }
  input.min = String(Number(param.uiMin));
  input.max = String(Number(param.uiMax));
  input.step = String(Number(param.step));
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
const MAX_LOADED_APPLET_COUNT = 3;
const APPLET_IDS = new Set(APPLET_ORDER);
const ROUTING_OPTIONS = {
  validAppletIds: APPLET_IDS,
  defaultAppletId: DEFAULT_APPLET_ID,
  appSearchParam: "app",
  appsSearchParam: "apps",
  maxApplets: MAX_LOADED_APPLET_COUNT,
};
const appletCameraState = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));
const appletInitialCameraState = Object.fromEntries(APPLET_ORDER.map((id) => [id, null]));
let worldStatePersistenceEnabled = false;

const appletSession = createAppletSession({
  defaultAppletId: DEFAULT_APPLET_ID,
  maxLoadedAppletCount: MAX_LOADED_APPLET_COUNT,
  validAppletIds: APPLET_IDS,
  normalizeAppletId: (value) => normalizeAppletIdParam(value, ROUTING_OPTIONS),
  normalizeAppletIds: (values, fallbackId) =>
    normalizeAppletIdsParam(values, {
      validAppletIds: APPLET_IDS,
      defaultAppletId: fallbackId,
      maxApplets: MAX_LOADED_APPLET_COUNT,
    }),
  initialWorldStateByApplet: Object.fromEntries(
    APPLET_ORDER.map((id) => [id, createDefaultWorldState(id)]),
  ),
});

let activeApplet = appletSession.getActiveApplet();
let loadedAppletIds = appletSession.getLoadedAppletIds();
let loadedAppletIdSet = appletSession.getLoadedAppletIdSet();

function syncAppletSessionMirrors() {
  activeApplet = appletSession.getActiveApplet();
  loadedAppletIds = appletSession.getLoadedAppletIds();
  loadedAppletIdSet = appletSession.getLoadedAppletIdSet();
}
let welcomeLauncherMode = "start";
let welcomeSortMode = "grouped";
let welcomeStatusMessage = "";
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
      updateChartMetrics: (appletId, values, liveTexts, options) =>
        updateChartMetrics(appletId, values, liveTexts, options),
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
const chartMaxRefreshHz = 10;
const chartMinRefreshMs = 1000 / chartMaxRefreshHz;
const chartState = Object.fromEntries(
  APPLET_ORDER.map((id) => [
    id,
    {
      lastRefreshMs: 0,
      pendingValues: null,
      pendingLiveTexts: null,
      pendingDistributionSamples: null,
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
setupWelcomeNavigator();
setupOpenedAppsMenu();
setupLauncherEntryPoints();
setupControls();
applyLoadedAppletTabVisibility();
renderOpenedAppsMenu();
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
  getExportData: () => {
    const meta = APPLET_META[activeApplet] || {};
    const cameraSnapshot = cameraController.getCameraSnapshot?.() || null;
    const simulationParams = pickAppletParamsBySection(activeApplet, "simulation");
    const visualParams = pickAppletParamsBySection(activeApplet, "visual");

    return {
      app: {
        name: String(meta.label || activeApplet),
        key: String(meta.key || activeApplet),
      },
      exportedAt: new Date().toISOString(),
      simulation: {
        ...cloneJsonSafe(simulationParams, {}),
        world: {
          sizeX: Number(params.worldSizeX),
          sizeY: Number(params.worldSizeY),
          sizeZ: Number(params.worldSizeZ),
          gridSize: Number(params.worldGridSize),
          boundaryMode: normalizeBoundaryMode(params.boundaryMode),
        },
      },
      visual: cloneJsonSafe(visualParams, {}),
      camera: {
        mode: params.projectionMode === "orthographic" ? "orthographic" : "perspective",
        fov: Number(params.cameraFov),
        locked: Boolean(params.cameraLocked),
        moveSpeed: Number(params.keyboardMoveSpeed),
        rotationSpeed: Number(params.keyboardRotationSpeed),
        spaceshipMode: Boolean(params.spaceshipMode),
        spaceshipSas: Boolean(params.spaceshipSas),
        snapshot: cloneJsonSafe(cameraSnapshot, null),
      },
    };
  },
});
setupTrendCharts();
setupChartModeToggles();
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

const frameTimer = new THREE.Timer();
animate();

// Main Loop + Frame Updates
function animate() {
  requestAnimationFrame(animate);

  frameTimer.update();
  const dt = Math.min(frameTimer.getDelta(), 0.05);
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
      if (!mode || !loadedAppletIdSet.has(mode)) {
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
        const projectionMode = getAppletDefaultProjection(activeApplet);
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
        const input = document.getElementById(inputId);
        if (input) {
          const paramKey = inferSliderParamKey(appletId, slider);
          const appletParams = params[appletId] || {};
          const sourceValue = paramKey && Object.prototype.hasOwnProperty.call(appletParams, paramKey)
            ? appletParams[paramKey]
            : slider.value;
          input.value = String(getSliderDisplayValue(appletId, slider, sourceValue));
          const sliderMin = Number(slider?.uiMin);
          const sliderMax = Number(slider?.uiMax);
          const displayMin = getSliderDisplayValue(appletId, slider, sliderMin);
          const displayMax = getSliderDisplayValue(appletId, slider, sliderMax);
          const displayStep = Number(getSliderDisplayStep(appletId, slider));
          if (Number.isFinite(displayMin)) {
            input.min = String(displayMin);
          }
          if (Number.isFinite(displayMax)) {
            input.max = String(displayMax);
          }
          if (Number.isFinite(displayStep) && displayStep > 0) {
            input.step = String(displayStep);
          }
        }
        bindRange(inputId, valueId, (value) => {
          const displayValue = handleAppletSliderInput(appletId, slider, value);
          return formatAppletSliderDisplayValue(appletId, slider, displayValue);
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

  const value = normalizeSliderInputValue(appletId, slider, rawValue);

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

function getSliderUnitTransformCache() {
  if (!getSliderUnitTransformCache.cache) {
    getSliderUnitTransformCache.cache = new Map();
  }
  return getSliderUnitTransformCache.cache;
}

function getSliderUnitTransform(appletId, slider) {
  const unitText = typeof slider?.unit === "string" ? slider.unit.trim() : "";
  const sourceDimension = getUnitDimensionTuple(unitText);
  const appletUnit = resolveAppletDominantUnitForDimension(appletId, sourceDimension);
  const appletLengthUnit = String(getAppletLengthUnit(appletId)?.name || "").trim();
  const appletTimeUnit = String(APPLET_CONFIGS[appletId]?.unit?.time?.label || "").trim();
  const cacheKey = `${appletId}::${unitText}::${appletUnit || ""}::${appletLengthUnit}::${appletTimeUnit}::${Array.isArray(sourceDimension) ? sourceDimension.join(",") : ""}`;
  const cache = getSliderUnitTransformCache();

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  let transform = getAngularUnitDisplayTransform(unitText, "\u00B0");
  if (!transform) {
    transform = getFrequencyUnitDisplayTransform(unitText, "Hz");
  }
  if (!transform) {
    transform = getSimpleUnitDisplayTransform(unitText, appletUnit);
  }
  if (!transform) {
    transform = getKinematicUnitDisplayTransform(unitText, appletLengthUnit, appletTimeUnit);
  }
  if (!transform) {
    transform = getLengthUnitDisplayTransform(unitText, appletLengthUnit);
  }
  cache.set(cacheKey, transform);
  return transform;
}

function resolveAppletDominantUnitForDimension(appletId, dimensionTuple) {
  if (!Array.isArray(dimensionTuple) || dimensionTuple.length !== 3) {
    return "";
  }

  if (dimensionTuple[0] !== 0) {
    return String(getAppletLengthUnit(appletId)?.name || "").trim();
  }
  if (dimensionTuple[1] !== 0) {
    return String(APPLET_CONFIGS[appletId]?.unit?.time?.label || "").trim();
  }
  if (dimensionTuple[2] !== 0) {
    return String(APPLET_CONFIGS[appletId]?.unit?.mass?.label || "").trim();
  }
  return "";
}

function getSliderDisplayValue(appletId, slider, sourceValue) {
  const transform = getSliderUnitTransform(appletId, slider);
  if (!transform) {
    return sourceValue;
  }
  return transform.toDisplay(sourceValue);
}

function getSliderSourceValue(appletId, slider, displayValue) {
  const transform = getSliderUnitTransform(appletId, slider);
  if (!transform) {
    return displayValue;
  }
  return transform.toSource(displayValue);
}

function getSliderDisplayStep(appletId, slider) {
  const stepValue = Number(slider?.step);
  if (!Number.isFinite(stepValue)) {
    return slider?.step;
  }
  const converted = getSliderDisplayValue(appletId, slider, stepValue);
  return Number.isFinite(converted) ? converted : stepValue;
}

function getSliderDisplayUnit(appletId, slider) {
  const transform = getSliderUnitTransform(appletId, slider);
  if (!transform) {
    return typeof slider?.unit === "string" ? slider.unit.trim() : "";
  }
  return transform.targetUnitText;
}

function normalizeSliderInputValue(appletId, slider, rawValue) {
  let displayValue = Number(rawValue);
  if (!Number.isFinite(displayValue)) {
    displayValue = Number(slider?.value ?? 0);
  }
  if (!Number.isFinite(displayValue)) {
    displayValue = 0;
  }

  const displayMin = getSliderDisplayValue(appletId, slider, Number(slider?.uiMin));
  const displayMax = getSliderDisplayValue(appletId, slider, Number(slider?.uiMax));
  if (Number.isFinite(displayMin)) {
    displayValue = Math.max(displayMin, displayValue);
  }
  if (Number.isFinite(displayMax)) {
    displayValue = Math.min(displayMax, displayValue);
  }

  let value = Number(getSliderSourceValue(appletId, slider, displayValue));
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
    if (!unit) {
      return numericText;
    }
    if (unit === "\u00B0") {
      return `${numericText}${unit}`;
    }
    return `${numericText} ${unit}`;
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

function formatAppletSliderDisplayValue(appletId, slider, value) {
  const displayValue = Number(getSliderDisplayValue(appletId, slider, value));
  const displayStep = getSliderDisplayStep(appletId, slider);
  const displayUnit = getSliderDisplayUnit(appletId, slider);
  const hasConvertedUnit = typeof displayUnit === "string" && displayUnit !== (slider?.unit || "");

  return formatSliderDisplayValue(
    {
      ...slider,
      step: displayStep,
      unit: displayUnit,
      valueText: hasConvertedUnit ? "" : slider?.valueText,
    },
    Number.isFinite(displayValue) ? displayValue : value,
  );
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
      const paramKey = inferSliderParamKey(appletId, slider);
      const appletParams = params[appletId] || {};
      const sourceValue = paramKey && Object.prototype.hasOwnProperty.call(appletParams, paramKey)
        ? appletParams[paramKey]
        : slider.value;
      input.value = String(getSliderDisplayValue(appletId, slider, sourceValue));
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
function applyLoadedAppletTabVisibility() {
  dom.appletTabs?.forEach((tab) => {
    const tabApplet = String(tab.getAttribute("data-applet-item") || "").trim();
    const isVisible = loadedAppletIdSet.has(tabApplet);
    const row = tab.closest(".mobile-applet-row");
    if (row) {
      row.classList.toggle("is-hidden", !isVisible);
    }
    tab.classList.toggle("is-hidden", !isVisible);
    tab.disabled = !isVisible;
    tab.setAttribute("aria-hidden", String(!isVisible));
    const closeButton = row?.querySelector(".mobile-applet-close");
    if (closeButton) {
      const canClose = isVisible && loadedAppletIds.length > 0;
      closeButton.classList.toggle("is-hidden", !canClose);
      closeButton.disabled = !canClose;
    }
    if (!isVisible) {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
    }
  });
}

function getWelcomeCardSummary(appletId) {
  const summary = String(APPLET_META[appletId]?.introSummary || "").trim();
  if (!summary) {
    return "Emergent behavior exploration";
  }
  if (summary.length <= 156) {
    return summary;
  }
  return `${summary.slice(0, 153).trimEnd()}...`;
}

function getAppletLauncherDomain(appletId) {
  const group = String(APPLET_META[appletId]?.group || "").toLowerCase().trim();
  if (group === "organic") {
    return "Organic Systems";
  }
  if (group === "physical") {
    return "Physical Systems";
  }
  return "Other Systems";
}

function getWelcomeCards() {
  return APPLET_ORDER
    .map((id) => ({
      id,
      label: String(APPLET_META[id]?.label || id),
      summary: getWelcomeCardSummary(id),
      domain: getAppletLauncherDomain(id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getWelcomeGroups(sortMode = welcomeSortMode) {
  const cards = getWelcomeCards();
  if (sortMode === "alphabet") {
    return [{ title: "All Applets", cards }];
  }

  const groupedCards = new Map([
    ["Organic Systems", []],
    ["Physical Systems", []],
    ["Other Systems", []],
  ]);

  cards.forEach((card) => {
    if (!groupedCards.has(card.domain)) {
      groupedCards.set(card.domain, []);
    }
    groupedCards.get(card.domain).push(card);
  });

  return Array.from(groupedCards.entries())
    .filter(([, cards]) => cards.length > 0)
    .map(([title, cards]) => ({ title, cards }));
}

function closeOpenedAppsMenu() {
  if (!dom.openedAppsMenu || !dom.openedAppsToggle) {
    return;
  }
  dom.openedAppsMenu.classList.add("is-hidden");
  dom.openedAppsMenu.setAttribute("aria-hidden", "true");
  dom.openedAppsToggle.setAttribute("aria-expanded", "false");
}

function openOpenedAppsMenu() {
  if (!dom.openedAppsMenu || !dom.openedAppsToggle) {
    return;
  }
  dom.openedAppsMenu.classList.remove("is-hidden");
  dom.openedAppsMenu.setAttribute("aria-hidden", "false");
  dom.openedAppsToggle.setAttribute("aria-expanded", "true");
}

function closeLoadedApplet(appletId, options = {}) {
  const { keepLauncherOpen = false } = options;
  const normalizedId = normalizeAppletIdParam(appletId, ROUTING_OPTIONS);
  if (!appletSession.isLoadedApplet(normalizedId)) {
    return false;
  }

  const nextLoadedAppletIds = loadedAppletIds.filter((id) => id !== normalizedId);
  if (nextLoadedAppletIds.length === 0) {
    appletSession.clearLoadedApplets();
    syncAppletSessionMirrors();
    applyLoadedAppletTabVisibility();
    renderOpenedAppsMenu();
    closeOpenedAppsMenu();

    const url = new URL(window.location.href);
    url.searchParams.delete("app");
    url.searchParams.delete("apps");
    window.history.pushState({ app: null, apps: "" }, "", url);

    showWelcomeNavigator({ mode: "start" });
    return true;
  }

  const nextActiveApplet = activeApplet === normalizedId || !nextLoadedAppletIds.includes(activeApplet)
    ? nextLoadedAppletIds[0]
    : activeApplet;

  applyAppletMode(nextActiveApplet, {
    loadedAppletIds: nextLoadedAppletIds,
    updateUrl: true,
    replaceHistory: false,
  });

  if (keepLauncherOpen) {
    welcomeLauncherMode = "manage";
    welcomeStatusMessage = "";
    renderWelcomeNavigator();
  }

  return true;
}

function renderOpenedAppsMenu() {
  if (!dom.openedAppsMenuList || !dom.openedAppsToggle) {
    return;
  }

  if (dom.openedAppsTitle) {
    dom.openedAppsTitle.textContent = loadedAppletIds.length > 0
      ? String(APPLET_META[activeApplet]?.key ?? activeApplet)
      : "launcher";
  }

  dom.openedAppsToggle.disabled = loadedAppletIds.length === 0;
  dom.openedAppsToggle.setAttribute("title", `Manage opened applets (${loadedAppletIds.length})`);
  dom.openedAppsToggle.setAttribute("aria-label", `Manage opened applets (${loadedAppletIds.length})`);

  const canClose = loadedAppletIds.length > 0;
  const fragment = document.createDocumentFragment();

  loadedAppletIds.forEach((appletId) => {
    const row = document.createElement("div");
    row.className = "opened-apps-menu-row";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "opened-apps-menu-open";
    if (appletId === activeApplet) {
      openButton.classList.add("is-active");
    }
    openButton.textContent = APPLET_META[appletId]?.key ?? appletId;
    openButton.addEventListener("click", () => {
      applyAppletMode(appletId, {
        loadedAppletIds,
        updateUrl: true,
        replaceHistory: false,
      });
      closeOpenedAppsMenu();
    });

    row.appendChild(openButton);

    if (canClose) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "opened-apps-menu-close";
      closeButton.setAttribute("aria-label", `Close ${APPLET_META[appletId]?.label ?? appletId}`);
      closeButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const closed = closeLoadedApplet(appletId, { keepLauncherOpen: false });
        if (!closed) {
          return;
        }
      });
      row.appendChild(closeButton);
    }

    fragment.appendChild(row);
  });

  dom.openedAppsMenuList.replaceChildren(fragment);
}

function setupOpenedAppsMenu() {
  if (!dom.openedAppsToggle || !dom.openedAppsMenu) {
    return;
  }

  dom.openedAppsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isHidden = dom.openedAppsMenu.classList.contains("is-hidden");
    if (isHidden) {
      openOpenedAppsMenu();
    } else {
      closeOpenedAppsMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!dom.openedAppsMenu || !dom.openedAppsToggle) {
      return;
    }
    const target = event.target;
    const clickedInsideMenu = dom.openedAppsMenu.contains(target);
    const clickedToggle = dom.openedAppsToggle.contains(target);
    if (!clickedInsideMenu && !clickedToggle) {
      closeOpenedAppsMenu();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeOpenedAppsMenu();
    }
  });
}

function handleWelcomeCardClick(appletId) {
  const normalizedId = normalizeAppletIdParam(appletId, ROUTING_OPTIONS);
  welcomeStatusMessage = "";

  if (welcomeLauncherMode !== "manage") {
    applyAppletMode(normalizedId, {
      loadedAppletIds: [normalizedId],
      updateUrl: true,
      replaceHistory: false,
    });
    hideWelcomeNavigator();
    return;
  }

  if (loadedAppletIdSet.has(normalizedId)) {
    applyAppletMode(normalizedId, {
      loadedAppletIds,
      updateUrl: true,
      replaceHistory: false,
    });
    hideWelcomeNavigator();
    return;
  }

  if (loadedAppletIds.length >= MAX_LOADED_APPLET_COUNT) {
    welcomeStatusMessage = `Opened ${loadedAppletIds.length}/${MAX_LOADED_APPLET_COUNT}. Close one to add another.`;
    renderWelcomeNavigator();
    return;
  }

  const nextLoadedAppletIds = [...loadedAppletIds, normalizedId];
  applyAppletMode(normalizedId, {
    loadedAppletIds: nextLoadedAppletIds,
    updateUrl: true,
    replaceHistory: false,
  });
  hideWelcomeNavigator();
}

function renderWelcomeNavigator() {
  if (!dom.welcomeGridGroups) {
    return;
  }

  const groups = getWelcomeGroups(welcomeSortMode);
  const fragment = document.createDocumentFragment();

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "welcome-group";

    const title = document.createElement("h2");
    title.className = "welcome-group-title";
    title.textContent = group.title;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "welcome-card-grid";

    group.cards.forEach((card) => {
      const showOpenState = welcomeLauncherMode === "manage";
      const isOpen = loadedAppletIdSet.has(card.id);
      const canClose = showOpenState && isOpen && loadedAppletIds.length > 0;
      const cardButton = document.createElement("button");
      cardButton.type = "button";
      cardButton.className = "welcome-card";
      if (showOpenState && isOpen) {
        cardButton.classList.add("is-opened");
      }
      if (showOpenState && card.id === activeApplet) {
        cardButton.classList.add("is-active-applet");
      }
      cardButton.setAttribute("data-welcome-applet", card.id);
      cardButton.setAttribute("aria-label", `Open ${card.label}`);

      const cardHead = document.createElement("div");
      cardHead.className = "welcome-card-head";

      const cardTitle = document.createElement("h3");
      cardTitle.className = "welcome-card-title";
      cardTitle.textContent = card.label;

      cardHead.appendChild(cardTitle);

      if (showOpenState && isOpen && loadedAppletIds.length > 0) {
        const openMark = document.createElement(canClose ? "button" : "span");
        openMark.className = "welcome-card-close";
        openMark.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        if (canClose) {
          openMark.type = "button";
          openMark.setAttribute("aria-label", `Close ${card.label}`);
          openMark.setAttribute("title", "Click to close");
          openMark.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeLoadedApplet(card.id, { keepLauncherOpen: true });
          });
        } else {
          openMark.classList.add("is-static");
          openMark.setAttribute("title", "Click card to open");
          openMark.setAttribute("aria-hidden", "true");
        }
        cardHead.appendChild(openMark);
      }

      const summaryText = document.createElement("p");
      summaryText.className = "welcome-card-copy";
      summaryText.textContent = card.summary;

      cardButton.appendChild(cardHead);
      cardButton.appendChild(summaryText);
      cardButton.setAttribute(
        "title",
        canClose ? "Click card to switch. X closes applet." : "Click card to open",
      );
      cardButton.addEventListener("click", () => handleWelcomeCardClick(card.id));

      grid.appendChild(cardButton);
    });

    section.appendChild(grid);
    fragment.appendChild(section);
  });

  dom.welcomeGridGroups.replaceChildren(fragment);

  if (dom.welcomeStatusCopy) {
    const hasStatus = Boolean(welcomeStatusMessage);
    dom.welcomeStatusCopy.classList.toggle("is-hidden", !hasStatus);
    dom.welcomeStatusCopy.textContent = hasStatus ? welcomeStatusMessage : "";
  }
  if (dom.welcomeSortToggle) {
    const grouped = welcomeSortMode !== "alphabet";
    const modeLabel = grouped ? "grouped" : "alphabetical";
    const nextLabel = grouped ? "alphabetical" : "grouped";
    dom.welcomeSortToggle.setAttribute("title", `Sort: ${modeLabel}. Click for ${nextLabel}.`);
    dom.welcomeSortToggle.setAttribute("aria-label", `Sort: ${modeLabel}. Click for ${nextLabel}.`);
    dom.welcomeSortToggle.innerHTML = grouped
      ? '<i class="bi bi-grid-3x3-gap-fill" aria-hidden="true"></i>'
      : '<i class="bi bi-sort-alpha-down" aria-hidden="true"></i>';
  }
  if (dom.welcomeClose) {
    dom.welcomeClose.classList.add("is-hidden");
  }
}

function showWelcomeNavigator(options = {}) {
  if (!dom.welcomeOverlay) {
    return;
  }

  document.documentElement.classList.remove("boot-show-launcher");
  const { mode = "start" } = options;
  welcomeLauncherMode = mode === "manage" ? "manage" : "start";
  welcomeStatusMessage = "";
  closeMobileNavigation();
  closeOpenedAppsMenu();
  renderWelcomeNavigator();

  dom.welcomeOverlay.classList.remove("is-hidden");
  dom.welcomeOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("welcome-visible");
}

function hideWelcomeNavigator() {
  if (!dom.welcomeOverlay) {
    return;
  }
  document.documentElement.classList.remove("boot-show-launcher");
  dom.welcomeOverlay.classList.add("is-hidden");
  dom.welcomeOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("welcome-visible");
  welcomeStatusMessage = "";
  closeOpenedAppsMenu();
}

function setupWelcomeNavigator() {
  if (!dom.welcomeOverlay) {
    return;
  }
  if (dom.welcomeSiteVersion) {
    dom.welcomeSiteVersion.textContent = String(SITE_VERSION || "--");
  }

  dom.welcomeSortToggle?.addEventListener("click", () => {
    welcomeSortMode = welcomeSortMode === "grouped" ? "alphabet" : "grouped";
    renderWelcomeNavigator();
  });

  dom.welcomeClose?.addEventListener("click", () => {
    if (welcomeLauncherMode === "manage") {
      hideWelcomeNavigator();
    }
  });

  dom.welcomeOverlay.addEventListener("click", (event) => {
    if (event.target === dom.welcomeOverlay && welcomeLauncherMode === "manage") {
      hideWelcomeNavigator();
    }
  });

  renderWelcomeNavigator();
}

function setupLauncherEntryPoints() {
  dom.launcherOpen?.addEventListener("click", () => {
    showWelcomeNavigator({ mode: "manage" });
  });
}

function setupAppRouting() {
  setupUrlRouting({
    ...ROUTING_OPTIONS,
    applyRouteState: (routeState, options = {}) => {
      const hasAppletParam = Boolean(routeState?.hasAppletParam);
      const routeActiveApplet = normalizeAppletIdParam(
        routeState?.activeAppletId,
        ROUTING_OPTIONS,
      );
      const routeLoadedAppletIds = appletSession.normalizeLoadedAppletIds(
        routeState?.loadedAppletIds,
        routeActiveApplet,
      );
      applyAppletMode(routeActiveApplet, {
        ...options,
        loadedAppletIds: routeLoadedAppletIds,
      });

      if (hasAppletParam) {
        hideWelcomeNavigator();
      } else {
        showWelcomeNavigator({ mode: "start" });
      }
    },
  });
}

function createDefaultWorldState(appletId) {
  const { x: xParam, y: yParam, z: zParam, gridSize: gridParam } = getWorldDimensionParams(appletId);
  return {
    x: convertLengthFromDisplay(Number(xParam.default ?? 100), appletId),
    y: convertLengthFromDisplay(Number(yParam.default ?? 100), appletId),
    z: convertLengthFromDisplay(Number(zParam.default ?? 100), appletId),
    gridSize: convertLengthFromDisplay(Number(gridParam.default ?? 5), appletId),
    boundaryMode: getWorldBoundaryModeDefault(appletId),
  };
}

function persistActiveAppletWorldState() {
  if (!appletSession.isValidAppletId(activeApplet)) {
    return;
  }
  appletSession.persistActiveWorldState({
    x: params.worldSizeX,
    y: params.worldSizeY,
    z: params.worldSizeZ,
    gridSize: params.worldGridSize,
    boundaryMode: normalizeBoundaryMode(params.boundaryMode),
  });
}

function applyWorldSliderConstraints(appletId) {
  const { x: xParam, y: yParam, z: zParam } = getWorldDimensionParams(appletId);
  const xInput = document.getElementById("world-size-x");
  const yInput = document.getElementById("world-size-y");
  const zInput = document.getElementById("world-size-z");

  applyRangeToInput(xInput, xParam);
  applyRangeToInput(yInput, yParam);
  applyRangeToInput(zInput, zParam);
}

function applyAppletWorldState(appletId, options = {}) {
  const { forceBoundaryDefault = false } = options;
  const { gridSize: gridParam } = getWorldDimensionParams(appletId);
  const state = appletSession.ensureWorldState(appletId, createDefaultWorldState);

  applyWorldSliderConstraints(appletId);

  params.worldSizeX = state.x;
  params.worldSizeY = state.y;
  params.worldSizeZ = state.z;
  params.worldGridSize = Number.isFinite(state.gridSize)
    ? state.gridSize
    : convertLengthFromDisplay(Number(gridParam.default ?? 5), appletId);
  const defaultBoundaryMode = getWorldBoundaryModeDefault(appletId);
  if (forceBoundaryDefault) {
    state.boundaryMode = defaultBoundaryMode;
    appletSession.setWorldState(appletId, state);
  }
  params.boundaryMode = normalizeBoundaryMode(
    state.boundaryMode ?? defaultBoundaryMode,
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

  const projectionMode = getAppletDefaultProjection(appletId);
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
  const label = APPLET_META[appletId]?.key ?? appletId;
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

function haveSameAppletIdOrder(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function applyAppletMode(appletId, options = {}) {
  const {
    updateUrl = false,
    replaceHistory = false,
    loadedAppletIds: requestedLoadedAppletIds = null,
  } = options;
  const normalizedRequestedAppletId = normalizeAppletIdParam(appletId, ROUTING_OPTIONS);
  const normalizedRequestedLoadedAppletIds = appletSession.normalizeLoadedAppletIds(
    requestedLoadedAppletIds ?? loadedAppletIds,
    normalizedRequestedAppletId,
  );
  if (
    normalizedRequestedAppletId === activeApplet &&
    haveSameAppletIdOrder(normalizedRequestedLoadedAppletIds, loadedAppletIds)
  ) {
    if (updateUrl) {
      setAppletRouteInUrlParam({
        ...ROUTING_OPTIONS,
        activeAppletId: activeApplet,
        loadedAppletIds,
        replaceHistory: Boolean(replaceHistory),
      });
    }
    return;
  }

  const sessionState = appletSession.applyMode(appletId, requestedLoadedAppletIds);
  syncAppletSessionMirrors();
  applyLoadedAppletTabVisibility();

  const normalizedId = sessionState.activeApplet;
  const previousApplet = sessionState.previousApplet;
  const wasProjectionInitialized = Boolean(appletProjectionInitialized[normalizedId]);

  if (previousApplet && previousApplet !== normalizedId && APPLET_IDS.has(previousApplet)) {
    appletCameraState[previousApplet] = cameraController.getCameraSnapshot();
    persistActiveAppletWorldState();
  }

  applySceneObjectVisibility(normalizedId);
  const isFirstAppletActivation = !appletSimulationPrimed[normalizedId];
  applyAppletWorldState(normalizedId, {
    forceBoundaryDefault: isFirstAppletActivation,
  });
  if (isFirstAppletActivation) {
    simulations[normalizedId]?.reset?.();
    appletSimulationPrimed[normalizedId] = true;
  }

  dom.appletTabs?.forEach((tab) => {
    const tabApplet = tab.getAttribute("data-applet-item");
    const isActive = tabApplet === normalizedId;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  renderOpenedAppsMenu();

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
    setAppletRouteInUrlParam({
      ...ROUTING_OPTIONS,
      activeAppletId: normalizedId,
      loadedAppletIds,
      replaceHistory: Boolean(replaceHistory),
    });
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
  if (dom.mobileNavLauncher) {
    dom.mobileNavLauncher.classList.remove("is-hidden");
    dom.mobileNavLauncher.addEventListener("click", () => {
      showWelcomeNavigator({ mode: "manage" });
      closeMobileNavigation();
    });
  }
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

function setupChartModeToggles() {
  const toggles = document.querySelectorAll("[data-chart-mode-toggle]");
  if (!toggles || toggles.length === 0) {
    return;
  }

  toggles.forEach((toggle) => {
    const appletId = String(toggle.getAttribute("data-applet-id") || "").trim();
    const chartKey = String(toggle.getAttribute("data-chart-key") || "").trim();
    const metric = getChartMetric(appletId, chartKey);
    if (!metric || !metric.supportsDistribution) {
      toggle.classList.add("is-hidden");
      toggle.setAttribute("disabled", "disabled");
      return;
    }

    syncChartModeToggleState(toggle, metric);
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      metric.viewMode = metric.viewMode === "time" ? "distribution" : "time";
      syncChartModeToggleState(toggle, metric);
      drawTrendCharts();
    });
  });
}

function resetTrendCharts(appletId) {
  const state = chartState[appletId];
  if (!state) {
    return;
  }
  state.lastRefreshMs = 0;
  state.pendingValues = null;
  state.pendingLiveTexts = null;
  state.pendingDistributionSamples = null;
  state.metrics.forEach((metric) => {
    metric.history.length = 0;
    metric.distributionValues = null;
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
      renderTrendChart(getElement(metric.canvasId), metric.history, {
        ...metric.options,
        viewMode: metric.viewMode,
        distributionValues: metric.distributionValues,
      });
    });
  });
}

function getTrendChartCanvasId(appletId, key) {
  return `chart-${appletId}-${key}`;
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
  const supportsDistribution = Boolean(sanitizedOptions.supportsDistribution);
  const defaultViewModeRaw = String(sanitizedOptions.defaultViewMode || "").trim().toLowerCase();
  const defaultViewMode =
    supportsDistribution && defaultViewModeRaw === "distribution"
      ? "distribution"
      : "time";
  delete sanitizedOptions.supportsDistribution;
  delete sanitizedOptions.defaultViewMode;
  delete sanitizedOptions.axisLabel;
  return {
    key: normalizedKey,
    canvasId: getTrendChartCanvasId(normalizedAppletId, normalizedKey),
    liveId: getTrendChartLiveId(normalizedAppletId, normalizedKey),
    initialText,
    options: sanitizedOptions,
    history: [],
    distributionValues: null,
    supportsDistribution,
    viewMode: defaultViewMode,
  };
}

function getChartMetric(appletId, key) {
  const state = chartState[appletId];
  if (!state) {
    return null;
  }
  return state.metrics.find((metric) => metric.key === key) || null;
}

function syncChartModeToggleState(toggle, metric) {
  if (!toggle || !metric) {
    return;
  }

  const isTimeMode = metric.viewMode === "time";
  toggle.classList.toggle("is-active", isTimeMode);
  toggle.setAttribute("aria-pressed", String(isTimeMode));
  const title = isTimeMode ? "Show distribution" : "Show time trend";
  toggle.setAttribute("title", title);
  toggle.setAttribute("aria-label", title);
}

function updateChartMetrics(appletId, values, liveTexts, options = {}) {
  const state = chartState[appletId];
  if (!state) {
    return;
  }

  const distributionSamples = options?.distributionSamples && typeof options.distributionSamples === "object"
    ? options.distributionSamples
    : null;

  state.pendingValues = Array.isArray(values) ? values.slice() : [];
  state.pendingLiveTexts = Array.isArray(liveTexts) ? liveTexts.slice() : [];
  state.pendingDistributionSamples = distributionSamples;

  const nowMs = getNowMs();
  if (nowMs - state.lastRefreshMs < chartMinRefreshMs) {
    return;
  }

  flushChartMetricsState(appletId, state, nowMs);
}

function flushChartMetricsState(appletId, state, nowMs) {
  if (!state || !Array.isArray(state.pendingValues) || !Array.isArray(state.pendingLiveTexts)) {
    return;
  }

  const pendingDistributionSamples = state.pendingDistributionSamples;
  state.metrics.forEach((metric, index) => {
    setElementText(metric.liveId, state.pendingLiveTexts[index]);
    if (pendingDistributionSamples && pendingDistributionSamples[metric.key] && metric.supportsDistribution) {
      metric.distributionValues = pendingDistributionSamples[metric.key];
    }
  });

  state.metrics.forEach((metric, index) => {
    appendTrendValue(metric.history, state.pendingValues[index], chartMaxPoints);
  });
  state.lastRefreshMs = nowMs;
  state.pendingValues = null;
  state.pendingLiveTexts = null;
  state.pendingDistributionSamples = null;
  drawTrendCharts();
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

// Generic Control Utils + Compact Slider Hub
function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeScientificNotationText(display) {
  return String(display ?? "").replace(
    /([+-]?\d+(?:\.\d+)?)e([+-]?\d+)/gi,
    (_match, mantissa, exponent) => `${mantissa}\u00D710^${Number(exponent)}`,
  );
}

function normalizeDisplayTextForDataAttribute(display) {
  return normalizeScientificNotationText(display).replace(/M_sun/g, "M\u2609");
}

function formatDisplayHtml(display) {
  const escaped = escapeHtml(display);
  const withScientificNotation = escaped.replace(
    /([+-]?\d+(?:\.\d+)?)e([+-]?\d+)/gi,
    (_match, mantissa, exponent) => `${mantissa}&times;10<sup>${Number(exponent)}</sup>`,
  );
  const withUnitSuperscripts = withScientificNotation.replace(/\^([+-]?\d+)/g, (_match, exponent) => `<sup>${Number(exponent)}</sup>`);
  return withUnitSuperscripts.replace(/M_sun/g, "M<sub>\u2609</sub>");
}

function getOutputFormattedHtml(outputEl) {
  if (!(outputEl instanceof HTMLElement)) {
    return "";
  }
  const cachedHtml = String(outputEl.dataset.formattedHtml || "").trim();
  if (cachedHtml) {
    return cachedHtml;
  }
  const fallback = outputEl.dataset.formattedValue || outputEl.textContent || "";
  return formatDisplayHtml(fallback);
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
    const html = formatDisplayHtml(display);
    output.innerHTML = html;
    output.dataset.formattedHtml = html;
    output.dataset.formattedValue = normalizeDisplayTextForDataAttribute(display);
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
  const html = formatDisplayHtml(display);
  output.innerHTML = html;
  output.dataset.formattedHtml = html;
  output.dataset.formattedValue = normalizeDisplayTextForDataAttribute(display);
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
  sectionState.value.innerHTML = getOutputFormattedHtml(binding.output);
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
  sectionState.value.innerHTML = getOutputFormattedHtml(binding.output);
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

  binding.output.innerHTML = getOutputFormattedHtml(binding.output);
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
