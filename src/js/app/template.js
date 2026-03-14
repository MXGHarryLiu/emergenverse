// Reference-only template for new applet modules.
// This file is not imported by the app runtime.

import * as THREE from "three";
import { validateAppletConfig } from "./appletConfigUtils.js";
import templateConfigData from "./template_config.json" with { type: "json" };
import { BaseSimulation } from "./baseSimulation.js";

// Applet UI and metadata configuration.
export const TEMPLATE_APPLET_CONFIG = validateAppletConfig(templateConfigData);

// Shell runtime hooks.
const TEMPLATE_APPLET_RUNTIME = {
  createChartMetrics(createChartMetricsEntry) {
    return [
      createChartMetricsEntry("template-count", () => "0", {
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
    ui.updateChartMetrics(TemplateSimulation.APPLET_ID, [count], [String(count)]);
  },
  // Optional hook called from app.js after a slider changes.
  // Prefer slider config options first (simulationSetter/simulationAction/resetTrendCharts).
  onSliderChange() {},
  // Optional hook for extra interactions (e.g., click-to-place objects).
  bindInteractionControls() {},
};

// File-local constants and helpers.
// Simulation implementation.
// Extend BaseSimulation to get shared params/app context wiring.
export class TemplateSimulation extends BaseSimulation {
  static APPLET_ID = "template";
  static APPLET_RUNTIME = TEMPLATE_APPLET_RUNTIME;
  static getColormapConfig({ params, simulation, continuousColormapOptions, continuousColormapGradients }) {
    return buildTemplateColormapConfig({
      params,
      simulation,
      continuousColormapOptions,
      continuousColormapGradients,
    });
  }

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
function buildTemplateColormapConfig({
  params,
  simulation,
  continuousColormapOptions,
  continuousColormapGradients,
}) {
  const colorMode = params?.colorMode || "solid";
  const colormap = params?.colormap || "turbo";
  const colorModeOption = getTemplateColorModeOption(colorMode);
  const unit = String(colorModeOption?.unit || "");
  if (colorMode === "solid") {
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
      minText: `min: 0.0${unit ? ` ${unit}` : ""}`,
      maxText: `max: 1.0${unit ? ` ${unit}` : ""}`,
    },
  };
}

function getTemplateColorModeOption(colorMode) {
  const visualParams = Array.isArray(TEMPLATE_APPLET_CONFIG.visual?.params)
    ? TEMPLATE_APPLET_CONFIG.visual.params
    : [];
  const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
  const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
  return options.find((option) => option?.value === colorMode) || null;
}

function createTemplateAgent() {
  return new THREE.Vector3(0, 0, 0);
}

/*
Required exports for registry auto-discovery in appletConfigs.js:
- exactly one `*Simulation` class
- exactly one `*_APPLET_CONFIG` object
- static `Simulation.APPLET_RUNTIME` object
- static `Simulation.getColormapConfig`
*/
