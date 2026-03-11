// Visual styling controls shared across applet rendering modes.
import {
  ANT_DISCRETE_COLORMAP_OPTIONS,
  ANT_DISCRETE_LEGEND_GRADIENTS,
} from "./app/ant.js";
import {
  FIREFLY_DISCRETE_COLORMAP_OPTIONS,
  FIREFLY_DISCRETE_LEGEND_GRADIENTS,
} from "./app/firefly.js";

const CONTINUOUS_COLORMAP_OPTIONS = [
  { value: "turbo", label: "Turbo" },
  { value: "viridis", label: "Viridis" },
  { value: "plasma", label: "Plasma" },
  { value: "magma", label: "Magma" },
  { value: "inferno", label: "Inferno" },
  { value: "cividis", label: "Cividis" },
  { value: "coolwarm", label: "Coolwarm" },
  { value: "greys", label: "Greys" },
];

const CONTINUOUS_COLORMAP_GRADIENTS = {
  turbo: "linear-gradient(90deg, #30123b 0%, #4145ab 12.5%, #4685f4 25%, #39c6c5 37.5%, #77df6e 50%, #b8de29 62.5%, #f9ba38 75%, #ee6a24 87.5%, #c91f16 100%)",
  viridis: "linear-gradient(90deg, #440154 0%, #482878 11%, #3e4a89 22%, #31688e 33%, #26828e 44%, #1f9e89 55%, #35b779 66%, #6ece58 77%, #b5de2b 88%, #fee825 100%)",
  plasma: "linear-gradient(90deg, #0d0887 0%, #5b02a3 14%, #9a179b 28%, #cb4679 42%, #ed7953 57%, #fb9f3a 71%, #fdca26 85%, #f0f921 100%)",
  magma: "linear-gradient(90deg, #000004 0%, #180f3d 11%, #440f76 22%, #721f81 33%, #9f2f7f 44%, #cd4071 55%, #f1605d 66%, #fd9668 77%, #fec98d 88%, #fcfdbf 100%)",
  inferno: "linear-gradient(90deg, #000004 0%, #1b0c41 11%, #4a0c6b 22%, #781c6d 33%, #a52c60 44%, #cf4446 55%, #ed6925 66%, #fb9b06 77%, #f7d13d 88%, #fcffa4 100%)",
  cividis: "linear-gradient(90deg, #00204d 0%, #213f6f 12.5%, #3f5f7f 25%, #5d7f87 37.5%, #7a9f8a 50%, #99bf88 62.5%, #b9dd7f 75%, #dbf06a 87.5%, #fff44f 100%)",
  coolwarm: "linear-gradient(90deg, #3b4cc0 0%, #688aef 12.5%, #98b9ff 25%, #c9d7f0 37.5%, #ece5dc 50%, #f7c7a6 62.5%, #ee8468 75%, #d34b44 87.5%, #b40426 100%)",
  greys: "linear-gradient(90deg, #111111 0%, #3a3a3a 16%, #5f5f5f 32%, #878787 48%, #afafaf 64%, #d3d3d3 82%, #f2f2f2 100%)",
};

export function createVisualControls({
  params,
  boidSimulation,
  antSimulation,
  preySimulation,
  fireflySimulation,
  galaxySimulation,
  duneSimulation,
  getActiveApplet,
  updateBoidColormapLegend,
  updatePreyColormapLegend,
}) {
  const dom = getVisualControlsDom();
  const boidParams = params.boid;
  const antParams = params.ants;
  const preyParams = params.prey;
  const fireflyParams = params.firefly;
  const galaxyParams = params.galaxy;
  const duneParams = params.dune;

  function formatHexColor(value) {
    if (typeof value !== "string") {
      return "#000000";
    }
    return value.toUpperCase();
  }

  function syncColorInput(inputEl, valueEl, value) {
    if (inputEl) {
      inputEl.value = value;
    }
    if (valueEl) {
      valueEl.textContent = formatHexColor(value);
    }
  }

  function updateLegendDisplay({ gradient, minText, maxText }) {
    const legend = dom.colormapPanel.legend;
    if (!legend?.bar || !legend.cmin || !legend.cmax) {
      return;
    }

    legend.container?.classList.remove("is-hidden");
    legend.bar.style.background = gradient;
    legend.cmin.textContent = minText;
    legend.cmax.textContent = maxText;
  }

  function hideColormapPanel() {
    dom.colormapPanel.panel?.classList.add("is-hidden");
    dom.colormapPanel.legend.container?.classList.add("is-hidden");
  }

  function mountColormapPanel(appletId) {
    const panel = dom.colormapPanel.panel;
    const host = dom.colormapPanel.hosts[appletId];
    if (!panel || !host || panel.parentElement === host) {
      return;
    }
    host.appendChild(panel);
  }

  function rebuildColormapOptions(options, selectedValue) {
    const select = dom.colormapPanel.select;
    if (!select || !Array.isArray(options) || options.length === 0) {
      return selectedValue;
    }

    const validValues = new Set(options.map((item) => item.value));
    const nextValue = validValues.has(selectedValue) ? selectedValue : options[0].value;
    const currentValues = Array.from(select.options).map((option) => option.value);
    const nextValues = options.map((item) => item.value);
    const requiresRebuild =
      currentValues.length !== nextValues.length ||
      currentValues.some((value, index) => value !== nextValues[index]);

    if (requiresRebuild) {
      select.innerHTML = "";
      options.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });
    }

    select.value = nextValue;
    return nextValue;
  }

  function updateAntColormapLegend() {
    if (antParams.colorMode === "state") {
      const gradient = ANT_DISCRETE_LEGEND_GRADIENTS[antParams.colormap] || ANT_DISCRETE_LEGEND_GRADIENTS.paired;
      updateLegendDisplay({
        gradient,
        minText: "searching",
        maxText: "carrying",
      });
      return;
    }

    const gradient = CONTINUOUS_COLORMAP_GRADIENTS[antParams.colormap] || CONTINUOUS_COLORMAP_GRADIENTS.turbo;
    updateLegendDisplay({
      gradient,
      minText: "cmin: -180°",
      maxText: "cmax: 180°",
    });
  }

  function updateFireflyColormapLegend() {
    if (fireflyParams.colorMode === "none") {
      dom.colormapPanel.legend.container?.classList.add("is-hidden");
      return;
    }

    if (fireflyParams.colorMode === "blink") {
      const gradient =
        FIREFLY_DISCRETE_LEGEND_GRADIENTS[fireflyParams.colormap] || FIREFLY_DISCRETE_LEGEND_GRADIENTS["blue-yellow"];
      updateLegendDisplay({
        gradient,
        minText: "idle",
        maxText: "blink",
      });
      return;
    }

    const gradient =
      CONTINUOUS_COLORMAP_GRADIENTS[fireflyParams.colormap] || CONTINUOUS_COLORMAP_GRADIENTS.turbo;
    const range = fireflySimulation?.getFrequencyRange?.() ?? {
      min: Math.max(0, (fireflyParams.frequencyHz ?? 1.8) - (fireflyParams.freqJitterHz ?? 0.2)),
      max: (fireflyParams.frequencyHz ?? 1.8) + (fireflyParams.freqJitterHz ?? 0.2),
    };
    updateLegendDisplay({
      gradient,
      minText: `cmin: ${Number(range.min).toFixed(2)} Hz`,
      maxText: `cmax: ${Number(range.max).toFixed(2)} Hz`,
    });
  }

  function updateGalaxyColormapLegend() {
    if (galaxyParams.colorMode === "none") {
      dom.colormapPanel.legend.container?.classList.add("is-hidden");
      return;
    }

    const gradient =
      CONTINUOUS_COLORMAP_GRADIENTS[galaxyParams.colormap] || CONTINUOUS_COLORMAP_GRADIENTS.magma;
    const range = galaxySimulation?.getSpeedRange?.() ?? { min: 0, max: 1 };
    updateLegendDisplay({
      gradient,
      minText: `cmin: ${Number(range.min).toFixed(0)} ly/Myr`,
      maxText: `cmax: ${Number(range.max).toFixed(0)} ly/Myr`,
    });
  }

  function updateDuneColormapLegend() {
    const gradient =
      CONTINUOUS_COLORMAP_GRADIENTS[duneParams.colormap] || CONTINUOUS_COLORMAP_GRADIENTS.cividis;
    const range = duneSimulation?.getColumnMassRange?.() ?? {
      min: Math.max(0, duneParams.baseHeight ?? 0),
      max: Math.max(0, duneParams.baseHeight ?? 0),
    };
    updateLegendDisplay({
      gradient,
      minText: `cmin: ${Number(range.min).toFixed(2)} a.u.`,
      maxText: `cmax: ${Number(range.max).toFixed(2)} a.u.`,
    });
  }

  function getColormapConfig(appletId) {
    switch (appletId) {
      case "boid":
        return {
          visible: boidParams.colorMode !== "none",
          value: boidParams.colormap,
          options: CONTINUOUS_COLORMAP_OPTIONS,
          setValue(value) {
            boidParams.colormap = value;
            boidSimulation.syncInstances();
          },
          updateLegend() {
            updateBoidColormapLegend();
          },
        };
      case "ants":
        return {
          visible: antParams.colorMode !== "none",
          value: antParams.colormap,
          options: antParams.colorMode === "state" ? ANT_DISCRETE_COLORMAP_OPTIONS : CONTINUOUS_COLORMAP_OPTIONS,
          setValue(value) {
            antParams.colormap = value;
            antSimulation.syncInstances();
          },
          updateLegend() {
            updateAntColormapLegend();
          },
        };
      case "prey":
        return {
          visible: preyParams.colorMode !== "none",
          value: preyParams.colormap,
          options: CONTINUOUS_COLORMAP_OPTIONS,
          setValue(value) {
            preyParams.colormap = value;
            preySimulation.syncInstances();
          },
          updateLegend() {
            updatePreyColormapLegend?.();
          },
        };
      case "firefly":
        return {
          visible: fireflyParams.colorMode !== "none",
          value: fireflyParams.colormap,
          options: fireflyParams.colorMode === "blink" ? FIREFLY_DISCRETE_COLORMAP_OPTIONS : CONTINUOUS_COLORMAP_OPTIONS,
          setValue(value) {
            fireflyParams.colormap = value;
            fireflySimulation.syncInstances();
          },
          updateLegend() {
            updateFireflyColormapLegend();
          },
        };
      case "galaxy":
        return {
          visible: galaxyParams.colorMode !== "none",
          value: galaxyParams.colormap,
          options: CONTINUOUS_COLORMAP_OPTIONS,
          setValue(value) {
            galaxyParams.colormap = value;
            galaxySimulation.syncInstances();
          },
          updateLegend() {
            updateGalaxyColormapLegend();
          },
        };
      case "dune":
        return {
          visible: true,
          value: duneParams.colormap,
          options: CONTINUOUS_COLORMAP_OPTIONS,
          setValue(value) {
            duneParams.colormap = value;
            duneSimulation.syncInstances();
          },
          updateLegend() {
            updateDuneColormapLegend();
          },
        };
      default:
        return null;
    }
  }

  function syncColormapPanel() {
    const activeApplet = getActiveApplet?.();
    const config = getColormapConfig(activeApplet);
    if (!config) {
      hideColormapPanel();
      return;
    }

    mountColormapPanel(activeApplet);
    dom.colormapPanel.panel?.classList.toggle("is-hidden", !config.visible);
    if (!config.visible) {
      dom.colormapPanel.legend.container?.classList.add("is-hidden");
      return;
    }

    const nextValue = rebuildColormapOptions(config.options, config.value);
    if (nextValue !== config.value) {
      config.setValue(nextValue);
    }
    config.updateLegend();
  }

  function updateBoidVisibility() {
    const useSingleColor = boidParams.colorMode === "none";
    dom.singleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    syncColormapPanel();
  }

  function updateAntVisibility() {
    const useSingleColor = antParams.colorMode === "none";
    dom.antSingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    syncColormapPanel();
  }

  function updatePreyVisibility() {
    const useSingleColor = preyParams.colorMode === "none";
    dom.preySingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    syncColormapPanel();
  }

  function updateFireflyVisibility() {
    const useSingleColor = fireflyParams.colorMode === "none";
    dom.fireflySingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    syncColormapPanel();
  }

  function updateGalaxyVisibility() {
    const useSingleColor = galaxyParams.colorMode === "none";
    dom.galaxySingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    syncColormapPanel();
  }

  function bind() {
    dom.colorMode?.addEventListener("change", () => {
      boidParams.colorMode = dom.colorMode.value;
      updateBoidVisibility();
      boidSimulation.syncInstances();
      updateBoidColormapLegend();
    });

    dom.colormapPanel.select?.addEventListener("change", () => {
      const activeApplet = getActiveApplet?.();
      const config = getColormapConfig(activeApplet);
      if (!config) {
        return;
      }
      config.setValue(dom.colormapPanel.select.value);
      config.updateLegend();
    });

    dom.solidColor?.addEventListener("input", () => {
      boidParams.solidColor = dom.solidColor.value;
      syncColorInput(dom.solidColor, dom.solidColorValue, boidParams.solidColor);
      boidSimulation.syncInstances();
    });

    dom.antColorMode?.addEventListener("change", () => {
      antParams.colorMode = dom.antColorMode.value;
      updateAntVisibility();
      antSimulation.syncInstances();
      updateAntColormapLegend();
    });

    dom.antSolidColor?.addEventListener("input", () => {
      antParams.solidColor = dom.antSolidColor.value;
      syncColorInput(dom.antSolidColor, dom.antSolidColorValue, antParams.solidColor);
      antSimulation.syncInstances();
    });

    dom.preyColorMode?.addEventListener("change", () => {
      preyParams.colorMode = dom.preyColorMode.value;
      updatePreyVisibility();
      preySimulation.syncInstances();
      updatePreyColormapLegend?.();
    });

    dom.preySolidColor?.addEventListener("input", () => {
      preyParams.solidColor = dom.preySolidColor.value;
      syncColorInput(dom.preySolidColor, dom.preySolidColorValue, preyParams.solidColor);
      preySimulation.syncInstances();
    });

    dom.fireflyColorMode?.addEventListener("change", () => {
      fireflyParams.colorMode = dom.fireflyColorMode.value;
      updateFireflyVisibility();
      fireflySimulation.syncInstances();
      updateFireflyColormapLegend();
    });

    dom.fireflySolidColor?.addEventListener("input", () => {
      fireflyParams.solidColor = dom.fireflySolidColor.value;
      syncColorInput(dom.fireflySolidColor, dom.fireflySolidColorValue, fireflyParams.solidColor);
      fireflySimulation.syncInstances();
    });

    dom.galaxyColorMode?.addEventListener("change", () => {
      galaxyParams.colorMode = dom.galaxyColorMode.value || "speed";
      updateGalaxyVisibility();
      galaxySimulation.syncInstances();
      updateGalaxyColormapLegend();
    });

    dom.galaxySolidColor?.addEventListener("input", () => {
      galaxyParams.solidColor = dom.galaxySolidColor.value;
      syncColorInput(dom.galaxySolidColor, dom.galaxySolidColorValue, galaxyParams.solidColor);
      galaxySimulation.syncInstances();
    });

    dom.duneColorMode?.addEventListener("change", () => {
      duneParams.colorMode = dom.duneColorMode.value || "mass";
      syncColormapPanel();
      duneSimulation.syncInstances();
      updateDuneColormapLegend();
    });
  }

  function syncFromParams() {
    if (dom.colorMode) {
      dom.colorMode.value = boidParams.colorMode;
    }
    syncColorInput(dom.solidColor, dom.solidColorValue, boidParams.solidColor);

    if (dom.antColorMode) {
      dom.antColorMode.value = antParams.colorMode;
    }
    syncColorInput(dom.antSolidColor, dom.antSolidColorValue, antParams.solidColor);

    if (dom.preyColorMode) {
      dom.preyColorMode.value = preyParams.colorMode;
    }
    syncColorInput(dom.preySolidColor, dom.preySolidColorValue, preyParams.solidColor);

    if (dom.fireflyColorMode) {
      dom.fireflyColorMode.value = fireflyParams.colorMode;
    }
    syncColorInput(dom.fireflySolidColor, dom.fireflySolidColorValue, fireflyParams.solidColor);
    if (dom.galaxyColorMode) {
      dom.galaxyColorMode.value = galaxyParams.colorMode;
    }
    syncColorInput(dom.galaxySolidColor, dom.galaxySolidColorValue, galaxyParams.solidColor);
    if (dom.duneColorMode) {
      dom.duneColorMode.value = duneParams.colorMode;
    }

    updateBoidVisibility();
    updateAntVisibility();
    updatePreyVisibility();
    updateFireflyVisibility();
    updateGalaxyVisibility();
    syncColormapPanel();
  }

  function refreshLegend(appletId = getActiveApplet?.()) {
    const activeId = appletId || getActiveApplet?.();
    switch (activeId) {
      case "boid":
        updateBoidColormapLegend?.();
        break;
      case "ants":
        updateAntColormapLegend();
        break;
      case "prey":
        updatePreyColormapLegend?.();
        break;
      case "firefly":
        updateFireflyColormapLegend();
        break;
      case "galaxy":
        updateGalaxyColormapLegend();
        break;
      case "dune":
        updateDuneColormapLegend();
        break;
      default:
        break;
    }
  }

  return {
    bind,
    syncFromParams,
    syncColormapPanel,
    refreshLegend,
    updateBoidVisibility,
    updateAntVisibility,
    updatePreyVisibility,
    updateFireflyVisibility,
    updateGalaxyVisibility,
  };
}

function getVisualControlsDom() {
  return {
    colorMode: document.getElementById("color-mode"),
    solidColor: document.getElementById("solid-color"),
    solidColorValue: document.getElementById("solid-color-value"),
    singleColorWrap: document.getElementById("single-color-wrap"),
    antColorMode: document.getElementById("ant-color-mode"),
    antSolidColor: document.getElementById("ant-solid-color"),
    antSolidColorValue: document.getElementById("ant-solid-color-value"),
    antSingleColorWrap: document.getElementById("ant-single-color-wrap"),
    preyColorMode: document.getElementById("prey-color-mode"),
    preySolidColor: document.getElementById("prey-solid-color"),
    preySolidColorValue: document.getElementById("prey-solid-color-value"),
    preySingleColorWrap: document.getElementById("prey-single-color-wrap"),
    fireflyColorMode: document.getElementById("firefly-color-mode"),
    fireflySolidColor: document.getElementById("firefly-solid-color"),
    fireflySolidColorValue: document.getElementById("firefly-solid-color-value"),
    fireflySingleColorWrap: document.getElementById("firefly-single-color-wrap"),
    galaxyColorMode: document.getElementById("galaxy-color-mode"),
    galaxySolidColor: document.getElementById("galaxy-solid-color"),
    galaxySolidColorValue: document.getElementById("galaxy-solid-color-value"),
    galaxySingleColorWrap: document.getElementById("galaxy-single-color-wrap"),
    duneColorMode: document.getElementById("dune-color-mode"),
    colormapPanel: {
      panel: document.getElementById("shared-colormap-panel"),
      select: document.getElementById("colormap"),
      legend: {
        container: document.getElementById("colormap-legend"),
        bar: document.getElementById("colormap-legend-bar"),
        cmin: document.getElementById("colormap-cmin"),
        cmax: document.getElementById("colormap-cmax"),
      },
      hosts: {
        boid: document.querySelector('[data-shared-colormap-host="boid"]'),
        ants: document.querySelector('[data-shared-colormap-host="ants"]'),
        prey: document.querySelector('[data-shared-colormap-host="prey"]'),
        firefly: document.querySelector('[data-shared-colormap-host="firefly"]'),
        galaxy: document.querySelector('[data-shared-colormap-host="galaxy"]'),
        dune: document.querySelector('[data-shared-colormap-host="dune"]'),
      },
    },
  };
}
