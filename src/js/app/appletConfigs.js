// Central applet registry that aggregates per-applet configs for the app shell.
import * as boidApplet from "./boid.js";
import * as antApplet from "./ant.js";
import * as preyApplet from "./prey.js";
import * as fireflyApplet from "./firefly.js";
import * as galaxyApplet from "./galaxy.js";
import * as duneApplet from "./dune.js";

const APPLET_MODULES = [
  { id: "boid", module: boidApplet },
  { id: "ants", module: antApplet },
  { id: "prey", module: preyApplet },
  { id: "firefly", module: fireflyApplet },
  { id: "galaxy", module: galaxyApplet },
  { id: "dune", module: duneApplet },
];

function pickModuleExport(module, id, suffix, label, predicate = () => true) {
  const matches = Object.entries(module)
    .filter(([key, value]) => key.endsWith(suffix) && predicate(value))
    .map(([, value]) => value);

  if (matches.length !== 1) {
    throw new Error(
      `[appletConfigs] Expected exactly one ${label} export ending in "${suffix}" for "${id}", found ${matches.length}.`,
    );
  }

  return matches[0];
}

function buildAppletDefinition(id, module) {
  const SimulationClass = pickModuleExport(
    module,
    id,
    "Simulation",
    "simulation class",
    (value) => typeof value === "function",
  );
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

export const APPLET_ORDER = APPLET_MODULES.map(({ id }) => id);

export const APPLET_DEFINITIONS = Object.fromEntries(
  APPLET_MODULES.map(({ id, module }) => [id, buildAppletDefinition(id, module)]),
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
