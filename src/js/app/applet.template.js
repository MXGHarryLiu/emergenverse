// Reference-only template for new applet modules.
// This file is not imported by the app runtime.

import * as THREE from "three";
import { defineAppletConfig } from "./appletConfigUtils.js";
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const EXAMPLE_APPLET_CONFIG = defineAppletConfig({
  label: "Example Applet",
  camera: {
    params: [
      { key: "projection", default: "perspective" },
      { key: "locked", default: false },
      { key: "fov", default: 50, uiMin: 20, uiMax: 90, step: 1 },
      { key: "moveSpeed", default: 120, uiMin: 1, uiMax: 100000, step: 1 },
      { key: "rotationSpeed", default: 84, uiMin: 1, uiMax: 720, step: 1 },
    ],
  },
  visual: {
    params: [
      { key: "colorMode", default: "none" },
      { key: "colormap", default: "turbo" },
      { key: "colormapInverted", default: false },
      { key: "solidColor", default: "#4cd3b6" },
    ],
  },
  world: {
    params: [
      { key: "x", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "y", default: 100, uiMin: 40, uiMax: 320, step: 2 },
      { key: "z", default: 100, uiMin: 30, uiMax: 260, step: 2 },
      { key: "gridSize", default: 5, uiMin: 2, uiMax: 320, step: 2 },
      { key: "boundaryMode", default: "cyclic-xyz" },
    ],
  },
  intro: {
      paragraphs: [
        "Describe the applet in plain language.",
        "Put equations and parameter mapping in the model popup.",
      ],
    },
  model: {
      subtitle: "Short summary of the governing model.",
      references: [{ label: "Wikipedia: Example", url: "https://en.wikipedia.org/wiki/Example" }],
      items: [
        {
          title: "State Update",
          equation: "$$x(t+\\Delta t)=x(t)+v(t)\\Delta t$$",
          explanation: "Explain what this equation does in plain language.",
          parameters: [
            "<strong>Only list controls that appear in this equation.</strong>",
          ],
        },
      ],
    },
  stats: {
      params: [
        { type: "stat", key: "example-fps", label: "FPS" },
        { type: "chart", key: "example-count", label: "Count" },
      ],
    },
  simulation: {
      params: [
        { key: "simSpeed", label: "Simulation Speed", default: 1.0, group: "dynamic", uiMin: 0.1, uiMax: 10, control: { type: "slider", icon: "bi-stopwatch", step: 0.1 } },
        { key: "count", label: "Count", default: 100, group: "initial", uiMin: 10, uiMax: 500, control: { type: "slider", icon: "bi-people-fill", step: 10, resetTrendCharts: true } },
        { key: "frequency", paramKey: "frequencyHz", label: "Base Frequency", default: 1.8, unit: "Hz", group: "dynamic", uiMin: 0.2, uiMax: 6.0, control: { type: "slider", icon: "bi-speedometer2", step: 0.05 } },
        // Optional simulation behavior flags (inside `control`):
        // - simulationSetter: explicit method to call (e.g., "setPreyCount")
        // - simulationAction: "auto" | "reset" | "sync" | "none"
        // - resetTrendCharts: true to clear chart history after this slider changes
      ],
    },
});

// Shell runtime hooks.
export const EXAMPLE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("example-count", () => "0", {
        stroke: "#7ec4ff",
        fill: "rgba(126, 196, 255, 0.14)",
        axisLabel: "count",
        tickFormatter: (value) => String(Math.max(0, Math.round(value))),
        forceZeroMin: true,
      }),
    ];
  },
  applyStats(stats, ui) {
    if (!stats) {
      return;
    }
    const count = stats.count ?? 0;
    ui.updateChartMetrics(ExampleSimulation.APPLET_ID, [count], [String(count)]);
  },
  // Optional hook called from app.js after a slider changes.
  // Prefer slider config options first (simulationSetter/simulationAction/resetTrendCharts).
  onSliderChange() {},
  // Optional hook for extra interactions (e.g., click-to-place objects).
  bindInteractionControls() {},
};

export const EXAMPLE_APPLET_VISUAL = {
  controls: {
    colorModeId: "example-color-mode",
    solidColorId: "example-solid-color",
    solidColorValueId: "example-solid-color-value",
    singleColorWrapId: "example-single-color-wrap",
  },
  section: {
    colorModeLabel: "Color Mode",
    colorModeOptions: [
      { value: "none", label: "None (single color)" },
      { value: "speed", label: "Speed" },
    ],
    solidColorLabel: "Color",
    solidColorDefault: "#4CD3B6",
  },
  getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    const colorMode = params?.colorMode || "none";
    const colormap = params?.colormap || "turbo";
    if (colorMode === "none") {
      return {
        visible: false,
        value: colormap,
        options: continuousColormapOptions,
        setValue() {},
        legend: null,
      };
    }

    return {
      visible: true,
      value: colormap,
      options: continuousColormapOptions,
      setValue(value) {
        params.colormap = value;
        simulation?.syncInstances?.();
      },
      legend: {
        gradient: continuousColormapGradients[colormap] || continuousColormapGradients.turbo,
        minText: "cmin: 0.0",
        maxText: "cmax: 1.0",
      },
    };
  },
};

// File-local constants and helpers.
const EXAMPLE_COLORMAP_STOPS = {
  turbo: [0x30123b, 0x4145ab, 0x4685f4, 0x39c6c5, 0x77df6e, 0xb8de29, 0xf9ba38, 0xee6a24, 0xc91f16],
};

// Simulation implementation.
// Extend BaseSimulation to get shared params/app context wiring.
export class ExampleSimulation extends BaseSimulation {
  static APPLET_ID = "example";

  constructor({ scene, params, world, onStats }) {
    super({ scene, params, world, onStats });
  }

  init() {}

  setVisible() {}

  onTheme() {}

  reset() {}

  onWorldGeometryChanged() {}

  onBoundaryModeChanged() {}

  step() {}
}

// File-local helper functions.
function createExampleAgent() {
  return new THREE.Vector3(0, 0, 0);
}

/*
Required exports for registry auto-discovery in appletConfigs.js:
- exactly one `*Simulation` class
- exactly one `*_APPLET_CONFIG` object
- exactly one `*_APPLET_RUNTIME` object
- exactly one `*_APPLET_VISUAL` object
*/





