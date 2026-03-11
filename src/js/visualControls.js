// Visual styling controls shared across applet rendering modes.
import { APPLET_VISUALS } from "./app/appletConfigs.js";

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
  simulations = {},
  getActiveApplet,
}) {
  const dom = getVisualControlsDom();

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

  function getAppletControls(appletId) {
    return dom.appletControls[appletId] || {};
  }

  function getColormapConfig(appletId) {
    const visualAdapter = APPLET_VISUALS[appletId];
    const appletParams = params?.[appletId];
    if (!visualAdapter?.getColormapConfig || !appletParams) {
      return null;
    }

    return visualAdapter.getColormapConfig({
      appletId,
      params: appletParams,
      simulation: simulations[appletId],
      continuousColormapOptions: CONTINUOUS_COLORMAP_OPTIONS,
      continuousColormapGradients: CONTINUOUS_COLORMAP_GRADIENTS,
    });
  }

  function renderConfigLegend(config) {
    if (!config?.legend) {
      dom.colormapPanel.legend.container?.classList.add("is-hidden");
      return;
    }

    updateLegendDisplay(config.legend);
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
    renderConfigLegend(config);
  }

  function syncSingleColorVisibility(appletId) {
    const appletParams = params?.[appletId];
    const controls = getAppletControls(appletId);
    if (!appletParams || !controls.singleColorWrap) {
      return;
    }

    controls.singleColorWrap.classList.toggle("is-hidden", appletParams.colorMode !== "none");
  }

  function bindColorModeControls() {
    Object.keys(APPLET_VISUALS).forEach((appletId) => {
      const appletParams = params?.[appletId];
      const simulation = simulations[appletId];
      const controls = getAppletControls(appletId);
      if (!appletParams) {
        return;
      }

      if (controls.colorMode) {
        controls.colorMode.addEventListener("change", () => {
          appletParams.colorMode = controls.colorMode.value || appletParams.colorMode;
          syncSingleColorVisibility(appletId);
          syncColormapPanel();
          simulation?.syncInstances?.();
          refreshLegend(appletId);
        });
      }

      if (controls.solidColor) {
        controls.solidColor.addEventListener("input", () => {
          appletParams.solidColor = controls.solidColor.value;
          syncColorInput(controls.solidColor, controls.solidColorValue, appletParams.solidColor);
          simulation?.syncInstances?.();
        });
      }
    });
  }

  function bind() {
    bindColorModeControls();

    dom.colormapPanel.select?.addEventListener("change", () => {
      const activeApplet = getActiveApplet?.();
      const config = getColormapConfig(activeApplet);
      if (!config) {
        return;
      }
      config.setValue(dom.colormapPanel.select.value);
      renderConfigLegend(getColormapConfig(activeApplet));
    });
  }

  function syncFromParams() {
    Object.keys(APPLET_VISUALS).forEach((appletId) => {
      const appletParams = params?.[appletId];
      const controls = getAppletControls(appletId);
      if (!appletParams) {
        return;
      }

      if (controls.colorMode) {
        controls.colorMode.value = appletParams.colorMode;
      }
      if (controls.solidColor) {
        syncColorInput(controls.solidColor, controls.solidColorValue, appletParams.solidColor);
      }
      syncSingleColorVisibility(appletId);
    });

    syncColormapPanel();
  }

  function refreshLegend(appletId = getActiveApplet?.()) {
    const config = getColormapConfig(appletId || getActiveApplet?.());
    if (!config) {
      return;
    }
    renderConfigLegend(config);
  }

  return {
    bind,
    syncFromParams,
    syncColormapPanel,
    refreshLegend,
  };
}

function getVisualControlsDom() {
  const hosts = {};
  const appletControls = {};

  Object.entries(APPLET_VISUALS).forEach(([id, adapter]) => {
    hosts[id] = document.querySelector(`[data-shared-colormap-host="${id}"]`);

    const controlsConfig = adapter?.controls || {};
    appletControls[id] = {
      colorMode: controlsConfig.colorModeId ? document.getElementById(controlsConfig.colorModeId) : null,
      solidColor: controlsConfig.solidColorId ? document.getElementById(controlsConfig.solidColorId) : null,
      solidColorValue: controlsConfig.solidColorValueId
        ? document.getElementById(controlsConfig.solidColorValueId)
        : null,
      singleColorWrap: controlsConfig.singleColorWrapId
        ? document.getElementById(controlsConfig.singleColorWrapId)
        : null,
    };
  });

  return {
    appletControls,
    colormapPanel: {
      panel: document.getElementById("shared-colormap-panel"),
      select: document.getElementById("colormap"),
      legend: {
        container: document.getElementById("colormap-legend"),
        bar: document.getElementById("colormap-legend-bar"),
        cmin: document.getElementById("colormap-cmin"),
        cmax: document.getElementById("colormap-cmax"),
      },
      hosts,
    },
  };
}
