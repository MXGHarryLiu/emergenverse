// Central applet registry that aggregates per-applet configs for the app shell.
import * as boidApplet from "./boid.js";
import * as antApplet from "./ant.js";
import * as preyApplet from "./prey.js";
import * as fireflyApplet from "./firefly.js";
import * as galaxyApplet from "./galaxy.js";
import * as duneApplet from "./dune.js";

// New applet registration guide:
// 1) Import the applet module above (e.g., `import * as fooApplet from "./foo.js";`).
// 2) Add that module into APPLET_MODULES below in the desired navigation order.
// 3) Ensure the module exports exactly one `*Simulation` class with static APPLET_ID.
// 4) Ensure the module exports exactly one each of:
//    `*_APPLET_CONFIG`, `*_APPLET_RUNTIME`, `*_APPLET_VISUAL`.
//    Optional legacy export: `*_DEFAULT_PARAMS` (prefer `*_APPLET_CONFIG.params`).
const APPLET_MODULES = [
  boidApplet,
  antApplet,
  preyApplet,
  fireflyApplet,
  galaxyApplet,
  duneApplet,
];

function deriveSimulationActionButtonIds(appletId, simulationConfig = {}) {
  const normalizedAppletId = String(appletId || "applet").trim() || "applet";
  return {
    pauseButtonId: simulationConfig.pauseButtonId || `${normalizedAppletId}-toggle-pause`,
    defaultButtonId: simulationConfig.defaultButtonId || `${normalizedAppletId}-default-sim`,
    resetButtonId: simulationConfig.resetButtonId || `${normalizedAppletId}-reset-sim`,
  };
}

function pickModuleExport(module, contextId, suffix, label, predicate = () => true) {
  const matches = Object.entries(module)
    .filter(([key, value]) => key.endsWith(suffix) && predicate(value))
    .map(([, value]) => value);

  if (matches.length !== 1) {
    throw new Error(
      `[appletConfigs] Expected exactly one ${label} export ending in "${suffix}" for "${contextId}", found ${matches.length}.`,
    );
  }

  return matches[0];
}

function pickOptionalModuleExport(module, contextId, suffix, label, predicate = () => true) {
  const matches = Object.entries(module)
    .filter(([key, value]) => key.endsWith(suffix) && predicate(value))
    .map(([, value]) => value);

  if (matches.length > 1) {
    throw new Error(
      `[appletConfigs] Expected at most one ${label} export ending in "${suffix}" for "${contextId}", found ${matches.length}.`,
    );
  }

  return matches[0] ?? null;
}

function resolveAppletDescriptors() {
  const seenIds = new Set();
  return APPLET_MODULES.map((module, index) => {
    const contextId = `module#${index}`;
    const SimulationClass = pickModuleExport(
      module,
      contextId,
      "Simulation",
      "simulation class",
      (value) => typeof value === "function",
    );
    const id = String(SimulationClass.APPLET_ID || "").trim();
    if (!id) {
      throw new Error(
        `[appletConfigs] Simulation class in "${contextId}" must define static APPLET_ID.`,
      );
    }
    if (seenIds.has(id)) {
      throw new Error(`[appletConfigs] Duplicate APPLET_ID detected: "${id}".`);
    }
    seenIds.add(id);
    return { id, module, SimulationClass };
  });
}

function collectSectionParamDefaults(sectionConfig) {
  const defaults = {};
  const params = Array.isArray(sectionConfig?.params) ? sectionConfig.params : [];
  params.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const key = String(entry.paramKey ?? entry.key ?? "").trim();
    if (!key) {
      return;
    }
    if (entry.default === undefined) {
      return;
    }
    defaults[key] = entry.default;
  });
  return defaults;
}

function buildAppletDefinition(id, module, SimulationClass) {
  validateSimulationContract(id, SimulationClass);
  const config = pickModuleExport(module, id, "_APPLET_CONFIG", "applet config");
  const legacyDefaultParams = pickOptionalModuleExport(module, id, "_DEFAULT_PARAMS", "default params");
  const simulationParamDefaults = collectSectionParamDefaults(config?.simulation);
  const interactionParamDefaults = collectSectionParamDefaults(config?.interaction);
  const visualParamDefaults = collectSectionParamDefaults(config?.visual);
  const defaultParams = {
    ...simulationParamDefaults,
    ...interactionParamDefaults,
    ...visualParamDefaults,
    ...(config?.params ?? {}),
    ...(legacyDefaultParams ?? {}),
  };
  const runtime = pickModuleExport(module, id, "_APPLET_RUNTIME", "runtime hooks");
  const visual = pickModuleExport(module, id, "_APPLET_VISUAL", "visual hooks");

  return {
    config,
    defaultParams,
    runtime,
    visual,
    createSimulation: ({ scene, params, world, onStats }) =>
      new SimulationClass({ scene, params, world, onStats }),
  };
}

function getStatsEntries(statsConfig = {}) {
  const params = Array.isArray(statsConfig?.params) ? statsConfig.params : null;
  if (!params) {
    return {
      statEntries: Array.isArray(statsConfig?.stats) ? statsConfig.stats : [],
      chartEntries: Array.isArray(statsConfig?.charts) ? statsConfig.charts : [],
    };
  }

  const statEntries = [];
  const chartEntries = [];
  params.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const type = String(entry.type || "stat").trim().toLowerCase();
    if (type === "chart") {
      chartEntries.push(entry);
      return;
    }
    statEntries.push(entry);
  });
  return { statEntries, chartEntries };
}

function deriveStatValueId(statEntry) {
  if (typeof statEntry?.valueId === "string" && statEntry.valueId.trim().length > 0) {
    return statEntry.valueId.trim();
  }
  const key = String(statEntry?.key || "").trim();
  return key ? `${key}-live` : null;
}

function validateSimulationContract(id, SimulationClass) {
  const requiredMethods = [
    "init",
    "setVisible",
    "onTheme",
    "reset",
    "onWorldGeometryChanged",
    "onBoundaryModeChanged",
    "step",
  ];
  const prototype = SimulationClass?.prototype || {};
  const missing = requiredMethods.filter((name) => typeof prototype[name] !== "function");
  if (missing.length > 0) {
    throw new Error(
      `[appletConfigs] Simulation "${id}" is missing required methods: ${missing.join(", ")}.`,
    );
  }
}

const APPLET_DESCRIPTORS = resolveAppletDescriptors();

export const APPLET_ORDER = APPLET_DESCRIPTORS.map(({ id }) => id);

export const APPLET_DEFINITIONS = Object.fromEntries(
  APPLET_DESCRIPTORS.map(({ id, module, SimulationClass }) => [
    id,
    buildAppletDefinition(id, module, SimulationClass),
  ]),
);

export const APPLET_CONFIGS = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, APPLET_DEFINITIONS[id].config]),
);

export const APPLET_META = Object.fromEntries(
  APPLET_ORDER.map((id) => {
    const config = APPLET_DEFINITIONS[id].config;
    const simulation = config?.simulation ?? {};
    const stats = config?.stats ?? {};
    const { statEntries } = getStatsEntries(stats);
    const fpsStat = statEntries.find((entry) => {
      const label = String(entry?.label || "").toLowerCase();
      const key = String(entry?.key || "").toLowerCase();
      return label.includes("fps") || key.includes("fps");
    }) || statEntries[0] || null;
    return [
      id,
      {
        id,
        label: config?.label ?? id,
        shortLabel: config?.shortLabel ?? config?.label?.split(/\s+/)[0] ?? id,
        fpsValueId: deriveStatValueId(fpsStat),
        ...deriveSimulationActionButtonIds(id, simulation),
      },
    ];
  }),
);

export const APPLET_VISUALS = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, APPLET_DEFINITIONS[id].visual ?? null]),
);
