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
