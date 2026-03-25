// Central applet registry that aggregates per-applet configs for the app shell.
import * as boidApplet from "./boid.js";
import * as antApplet from "./ant.js";
import * as preyApplet from "./prey.js";
import * as fireflyApplet from "./firefly.js";
import * as galaxyApplet from "./galaxy.js";
import * as duneApplet from "./dune.js";
import * as spaceApplet from "./space.js";
import * as waveApplet from "./wave.js";

// New applet registration guide:
// 1) Import the applet module above (e.g., `import * as fooApplet from "./foo.js";`).
// 2) Add that module into APPLET_MODULES below in the desired navigation order.
// 3) Ensure the module exports exactly one `*Simulation` class with static APPLET_ID.
// 4) Ensure the module exports exactly one `*_APPLET_CONFIG`.
// 5) Define static `APPLET_RUNTIME` and static `getColormapConfig` on the Simulation class.
const APPLET_MODULES = [
  boidApplet,
  antApplet,
  preyApplet,
  fireflyApplet,
  galaxyApplet,
  duneApplet,
  spaceApplet,
  waveApplet,
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

function resolveRuntimeHooks(module, appletId, SimulationClass) {
  const classRuntime = SimulationClass?.APPLET_RUNTIME;
  if (classRuntime && typeof classRuntime === "object") {
    return classRuntime;
  }

  // Backward-compatible fallback for modules that still export `*_APPLET_RUNTIME`.
  const exportMatches = Object.entries(module)
    .filter(([key, value]) => key.endsWith("_APPLET_RUNTIME") && value && typeof value === "object")
    .map(([, value]) => value);
  if (exportMatches.length === 1) {
    return exportMatches[0];
  }
  if (exportMatches.length > 1) {
    throw new Error(
      `[appletConfigs] Expected at most one runtime export ending in "_APPLET_RUNTIME" for "${appletId}", found ${exportMatches.length}.`,
    );
  }

  throw new Error(
    `[appletConfigs] "${appletId}" must provide runtime hooks via static SimulationClass.APPLET_RUNTIME.`,
  );
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
  const selects = Array.isArray(sectionConfig?.selects) ? sectionConfig.selects : [];
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
  selects.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const key = String(entry.paramKey ?? entry.key ?? "").trim();
    if (!key) {
      return;
    }
    const value = entry.value ?? entry.default;
    if (value === undefined) {
      return;
    }
    defaults[key] = value;
  });
  return defaults;
}

function buildAppletDefinition(id, module, SimulationClass) {
  validateSimulationContract(id, SimulationClass);
  const config = pickModuleExport(module, id, "_APPLET_CONFIG", "applet config");
  const simulationParamDefaults = collectSectionParamDefaults(config?.simulation);
  const interactionParamDefaults = collectSectionParamDefaults(config?.interaction);
  const visualParamDefaults = collectSectionParamDefaults(config?.visual);
  const realismVisualParamDefaults = collectSectionParamDefaults(config?.visual?.realism);
  const defaultParams = {
    ...simulationParamDefaults,
    ...interactionParamDefaults,
    ...visualParamDefaults,
    ...realismVisualParamDefaults,
  };
  const runtime = resolveRuntimeHooks(module, id, SimulationClass);
  const hasClassVisualHook = typeof SimulationClass?.getColormapConfig === "function";
  const visual = hasClassVisualHook
    ? {
      getColormapConfig(args) {
        return SimulationClass.getColormapConfig(args);
      },
    }
    : null;

  if (!visual?.getColormapConfig) {
    throw new Error(
      `[appletConfigs] "${id}" must provide visual hooks via static SimulationClass.getColormapConfig.`,
    );
  }

  return {
    config,
    defaultParams,
    runtime,
    visual,
    createSimulation: ({ scene, params, world, renderer, onStats }) =>
      new SimulationClass({ scene, params, world, renderer, onStats }),
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

function deriveStatValueId(statEntry, appletId) {
  const key = String(statEntry?.key || "").trim();
  const appKey = String(appletId || "").trim();
  if (!appKey || !key) {
    return null;
  }
  return `${appKey}-${key}-live`;
}

function validateSimulationContract(id, SimulationClass) {
  const requiredMethods = [
    "init",
    "setVisible",
    "onTheme",
    "reset",
    "onWorldGeometryChanged",
    "onBoundaryChanged",
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
    const metaConfig = (config?.meta && typeof config.meta === "object") ? config.meta : {};
    const simulation = config?.simulation ?? {};
    const stats = config?.stats ?? {};
    const introSummary = String(config?.intro?.summary || "").trim()
      || (Array.isArray(config?.intro?.paragraphs)
        ? String(config.intro.paragraphs[0] ?? "").trim()
        : "");
    const { statEntries } = getStatsEntries(stats);
    const fpsStat = statEntries.find((entry) => {
      const label = String(entry?.label || "").toLowerCase();
      const key = String(entry?.key || "").toLowerCase();
      return label.includes("fps") || key.includes("fps");
    }) || statEntries[0] || null;
    const effectiveSpeedStat = statEntries.find((entry) => {
      const label = String(entry?.label || "").toLowerCase();
      const key = String(entry?.key || "").toLowerCase();
      return key === "effectivespeed" || label.includes("effective sim speed");
    }) || null;
    return [
      id,
      {
        id,
        label: metaConfig?.label ?? config?.label ?? id,
        shortLabel: String(metaConfig?.shortLabel || "").trim() || undefined,
        group: String(metaConfig?.group || "").trim() || "physical",
        thumbnail: String(metaConfig?.thumbnail || "").trim() || "",
        disable: Boolean(metaConfig?.disable),
        key: String(config?.key ?? id).trim() || id,
        introSummary,
        fpsValueId: deriveStatValueId(fpsStat, id),
        effectiveSpeedValueId: deriveStatValueId(effectiveSpeedStat, id),
        ...deriveSimulationActionButtonIds(id, simulation),
      },
    ];
  }),
);

export const APPLET_VISUALS = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, APPLET_DEFINITIONS[id].visual ?? null]),
);
