// Reference-only template that shows the preferred section order for new applet modules.
// This file is not imported by the app runtime.

import * as THREE from "three";
import { defineAppletConfig, slider } from "./appletConfigUtils.js";

// Namespace / registration id for this applet.
// In a namespaced param model, this id becomes the root param key:
// params[APPLET_ID]
//
// Example:
// params.example.simSpeed
// params.example.count
export const APPLET_ID = "example";

// 1. Applet-specific defaults.
export const APPLET_DEFAULT_PARAMS = {
  simSpeed: 1.0,
  count: 100,
  scale: 1.0,
  colorMode: "default",
};

// 2. Config used by the shell to render sections, charts, and controls.
export const APPLET_CONFIG = defineAppletConfig({
  label: "Example Applet",
  defaultProjection: "perspective",
  world: {
    defaults: { x: 100, y: 100, z: 100 },
    range: { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
    gridSize: 5,
  },
  left: {
    intro: {
      sectionKey: "example-introduction",
      title: "Introduction",
      icon: "bi-journal-text",
      hidden: true,
      paragraphs: ["Describe the model here."],
      equations: ["$$x(t+\\Delta t)=x(t)+v(t)\\Delta t$$"],
      mapping: ["<strong>Count</strong> controls the number of agents."],
    },
    stats: {
      sectionKey: "example-stats",
      title: "Stats",
      icon: "bi-bar-chart-line-fill",
      hidden: true,
      stats: [{ label: "FPS", valueId: "example-fps-live", initial: "--" }],
      charts: [
        {
          title: "Count",
          liveId: "chart-example-count-live",
          liveInitial: "0",
          canvasId: "chart-example-count",
          aria: "example count trend chart",
        },
      ],
    },
  },
  right: {
    simulation: {
      sectionKey: "example-simulation",
      title: "Simulation",
      icon: "bi-sliders2",
      hidden: true,
      className: "mt-2",
      sliderHub: { title: "Count", value: "100", min: "10", max: "500", step: "10", valueNum: "100" },
      sliders: [
        slider("example-sim-speed", "Simulation Speed", "bi-stopwatch", "example-sim-speed-value", "1.0x", "0.1", "10", "0.1", "1.0"),
        slider("example-count", "Count", "bi-people-fill", "example-count-value", "100", "10", "500", "10", "100"),
      ],
      pauseButtonId: "toggle-example-pause",
      defaultButtonId: "default-example-sim",
      resetButtonId: "reset-example-sim",
    },
  },
});

// 3. Rendering constants, lookup tables, and helper-level scratch objects.
const EXAMPLE_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
};

// 4. Main simulation class.
export class AppletSimulation {
  constructor({ scene, params, onStats }) {
    this.scene = scene;
    this.params = params;
    this.onStats = onStats;
    this.appletParams = params[APPLET_ID];
  }

  init() {}

  setVisible() {}

  onTheme() {}

  reset() {}

  step() {}
}

// 5. File-local helper functions.
function createExampleAgent() {
  return null;
}

// 6. Namespaced param shape used by the runtime.
// Applet-specific fields live under `params[APPLET_ID]`.
// Example:
//
// params.prey.simSpeed
// params.prey.count
// params.prey.speed
// params.firefly.simSpeed
// params.firefly.count
//
// That lets every applet reuse the same property names locally:
//
// const prey = params.prey;
// const simSpeed = prey.simSpeed;
// const count = prey.count;
//
// For this template, the equivalent pattern is:
//
// const applet = params[APPLET_ID];
// const simSpeed = applet.simSpeed;
// const count = applet.count;
//
// That is preferable to classes for runtime params, because:
// - plain objects serialize cleanly
// - UI bindings can read/write nested fields directly
// - app state snapshots remain simple
//
// If you want the same field names across applets, keep them inside each namespace:
// - `params.boid.simSpeed`
// - `params.prey.simSpeed`
// - `params.firefly.simSpeed`
//
// Then `simSpeed` stays universal by convention, without forcing a shared root key.
//
// Important:
// - the namespace is not really "defined" by `ant.js` alone
// - it is assigned by the app shell when it builds the root `params` object
// - applet registration should use the same id everywhere:
//   - applet file: `APPLET_ID`
//   - params root: `params[APPLET_ID]`
//   - registry key in `APPLET_CONFIGS`
