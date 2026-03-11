// Central applet registry that aggregates per-applet configs for the app shell.
import {
  BoidSimulation,
  BOID_APPLET_CONFIG,
  BOID_DEFAULT_PARAMS,
  BOID_APPLET_RUNTIME,
} from "./boid.js";
import {
  AntSimulation,
  ANT_APPLET_CONFIG,
  ANT_DEFAULT_PARAMS,
  ANT_APPLET_RUNTIME,
} from "./ant.js";
import {
  PreySimulation,
  PREY_APPLET_CONFIG,
  PREY_DEFAULT_PARAMS,
  PREY_APPLET_RUNTIME,
} from "./prey.js";
import {
  FireflySimulation,
  FIREFLY_APPLET_CONFIG,
  FIREFLY_DEFAULT_PARAMS,
  FIREFLY_APPLET_RUNTIME,
} from "./firefly.js";
import {
  GalaxySimulation,
  GALAXY_APPLET_CONFIG,
  GALAXY_DEFAULT_PARAMS,
  GALAXY_APPLET_RUNTIME,
} from "./galaxy.js";

export const APPLET_ORDER = ["boid", "ants", "prey", "firefly", "galaxy"];

export const APPLET_DEFINITIONS = {
  boid: {
    config: BOID_APPLET_CONFIG,
    defaultParams: BOID_DEFAULT_PARAMS,
    runtime: BOID_APPLET_RUNTIME,
    createSimulation: ({ scene, params, world, onStats }) =>
      new BoidSimulation({ scene, params, world, onStats }),
  },
  ants: {
    config: ANT_APPLET_CONFIG,
    defaultParams: ANT_DEFAULT_PARAMS,
    runtime: ANT_APPLET_RUNTIME,
    createSimulation: ({ scene, params, onStats }) =>
      new AntSimulation({ scene, params, onStats }),
  },
  prey: {
    config: PREY_APPLET_CONFIG,
    defaultParams: PREY_DEFAULT_PARAMS,
    runtime: PREY_APPLET_RUNTIME,
    createSimulation: ({ scene, params, onStats }) =>
      new PreySimulation({ scene, params, onStats }),
  },
  firefly: {
    config: FIREFLY_APPLET_CONFIG,
    defaultParams: FIREFLY_DEFAULT_PARAMS,
    runtime: FIREFLY_APPLET_RUNTIME,
    createSimulation: ({ scene, params, onStats }) =>
      new FireflySimulation({ scene, params, onStats }),
  },
  galaxy: {
    config: GALAXY_APPLET_CONFIG,
    defaultParams: GALAXY_DEFAULT_PARAMS,
    runtime: GALAXY_APPLET_RUNTIME,
    createSimulation: ({ scene, params, world, onStats }) =>
      new GalaxySimulation({ scene, params, world, onStats }),
  },
};

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
        fpsValueId: stats.stats?.[0]?.valueId ?? null,
        pauseButtonId: simulation.pauseButtonId ?? null,
        defaultButtonId: simulation.defaultButtonId ?? null,
        resetButtonId: simulation.resetButtonId ?? null,
      },
    ];
  }),
);
