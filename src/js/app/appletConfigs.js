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
//    `*_APPLET_CONFIG`, `*_DEFAULT_PARAMS`, `*_APPLET_RUNTIME`, `*_APPLET_VISUAL`.
const APPLET_MODULES = [
  boidApplet,
  antApplet,
  preyApplet,
  fireflyApplet,
  galaxyApplet,
  duneApplet,
];

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

function buildAppletDefinition(id, module, SimulationClass) {
  validateSimulationContract(id, SimulationClass);
  const config = pickModuleExport(module, id, "_APPLET_CONFIG", "applet config");
  const defaultParams = pickModuleExport(module, id, "_DEFAULT_PARAMS", "default params");
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
    const simulation = config?.right?.simulation ?? {};
    const stats = config?.left?.stats ?? {};
    return [
      id,
      {
        id,
        label: config?.label ?? id,
        shortLabel: config?.shortLabel ?? config?.label?.split(/\s+/)[0] ?? id,
        fpsValueId: stats.stats?.[0]?.valueId ?? null,
        pauseButtonId: simulation.pauseButtonId ?? null,
        defaultButtonId: simulation.defaultButtonId ?? null,
        resetButtonId: simulation.resetButtonId ?? null,
      },
    ];
  }),
);

export const APPLET_VISUALS = Object.fromEntries(
  APPLET_ORDER.map((id) => [id, APPLET_DEFINITIONS[id].visual ?? null]),
);
