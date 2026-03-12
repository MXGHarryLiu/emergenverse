// Reference-only template for new applet modules.
// This file is not imported by the app runtime.

import * as THREE from "three";
import { createAppletParams, defineAppletConfig, slider } from "./appletConfigUtils.js";

// Namespace / registration id for this applet.
export const APPLET_ID = "example";

// Default applet parameters.
export const EXAMPLE_DEFAULT_PARAMS = {
  simSpeed: 1.0,
  count: 100,
  scale: 1.0,
  colorMode: "none",
  colormap: "turbo",
  colormapInverted: false,
  solidColor: "#4cd3b6",
};

// Applet UI and metadata configuration.
export const EXAMPLE_APPLET_CONFIG = defineAppletConfig({
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
      paragraphs: [
        "Describe the applet in plain language.",
        "Put equations and parameter mapping in the model popup.",
      ],
    },
    model: {
      buttonLabel: "Open Model Equations",
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
        slider("sim-speed", "Simulation Speed", "bi-stopwatch", "sim-speed-value", "1.0x", "0.1", "10", "0.1", "1.0", { group: "dynamic" }),
        slider("count", "Count", "bi-people-fill", "count-value", "100", "10", "500", "10", "100", { group: "initial" }),
        // Optional explicit mapping when slider id does not convert to the desired param key.
        slider(
          "example-frequency",
          "Base Frequency",
          "bi-speedometer2",
          "example-frequency-value",
          "1.80 Hz",
          "0.2",
          "6.0",
          "0.05",
          "1.8",
          { group: "dynamic", paramKey: "frequencyHz" },
        ),
      ],
      pauseButtonId: "toggle-example-pause",
      defaultButtonId: "default-example-sim",
      resetButtonId: "reset-example-sim",
    },
  },
});

// Shell runtime hooks.
export const EXAMPLE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetric) {
    return [
      createChartMetric("chart-example-count", "chart-example-count-live", () => "0", {
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
    ui.updateChartMetrics(APPLET_ID, [count], [String(count)]);
  },
  // Optional hook called from app.js after a slider changes.
  // Use this for applet-specific side effects that are not covered by generic shell behavior.
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
    hidden: true,
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
export class ExampleSimulation {
  constructor({ scene, params, world, onStats }) {
    this.scene = scene;
    this.params = createAppletParams(params, APPLET_ID);
    this.world = world;
    this.onStats = onStats;
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
- exactly one `*_DEFAULT_PARAMS` object
- exactly one `*_APPLET_RUNTIME` object
- exactly one `*_APPLET_VISUAL` object
*/
