// Central applet registry that aggregates per-applet configs for the app shell.
import { BOID_APPLET_CONFIG } from "./boid.js";
import { ANT_APPLET_CONFIG } from "./ant.js";
import { PREY_APPLET_CONFIG } from "./prey.js";
import { FIREFLY_APPLET_CONFIG } from "./firefly.js";
import { GALAXY_APPLET_CONFIG } from "./galaxy.js";

export const APPLET_ORDER = ["boid", "ants", "prey", "firefly", "galaxy"];

export const APPLET_CONFIGS = {
  boid: BOID_APPLET_CONFIG,
  ants: ANT_APPLET_CONFIG,
  prey: PREY_APPLET_CONFIG,
  firefly: FIREFLY_APPLET_CONFIG,
  galaxy: GALAXY_APPLET_CONFIG,
};

export const APPLET_META = Object.fromEntries(
  APPLET_ORDER.map((id) => {
    const config = APPLET_CONFIGS[id];
    const simulation = config?.right?.simulation ?? {};
    const stats = config?.left?.stats ?? {};
    return [
      id,
      {
        id,
        label: config?.label ?? id,
        defaultProjection: config?.defaultProjection ?? "perspective",
        world: config?.world,
        fpsValueId: stats.stats?.[0]?.valueId ?? null,
        chartIds: (stats.charts ?? []).map((chart) => ({
          liveId: chart.liveId,
          canvasId: chart.canvasId,
          title: chart.title,
        })),
        pauseButtonId: simulation.pauseButtonId ?? null,
        defaultButtonId: simulation.defaultButtonId ?? null,
        resetButtonId: simulation.resetButtonId ?? null,
      },
    ];
  }),
);
