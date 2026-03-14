// Visual styling controls shared across applet rendering modes.
import { APPLET_CONFIGS, APPLET_VISUALS } from "./app/appletConfigs.js";

const CONTINUOUS_COLORMAP_BY_APPLET = buildContinuousColormapCatalogByApplet(APPLET_CONFIGS);

export function createVisualControls({
  params,
  simulations = {},
  getActiveApplet,
}) {
  const dom = getVisualControlsDom();
  let activeCompactColorModeAppletId = null;

  function formatHexColor(value) {
    if (typeof value !== "string") {
      return "#000000";
    }
    return value.toUpperCase();
  }

  function syncColorInput(inputEl, valueEl, value, swatchEl) {
    if (inputEl) {
      inputEl.value = value;
    }
    if (valueEl) {
      valueEl.textContent = formatHexColor(value);
    }
    if (swatchEl) {
      swatchEl.style.background = value;
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
    dom.colormapPanel.invertWrap?.classList.add("is-hidden");
  }

  function hideStateColorsPanel() {
    dom.stateColorsPanel.panel?.classList.add("is-hidden");
    if (dom.stateColorsPanel.list) {
      dom.stateColorsPanel.list.innerHTML = "";
    }
  }

  function mountColormapPanel(appletId) {
    const panel = dom.colormapPanel.panel;
    const host = dom.colormapPanel.hosts[appletId];
    if (!panel || !host || panel.parentElement === host) {
      return;
    }
    host.appendChild(panel);
  }

  function mountStateColorsPanel(appletId) {
    const panel = dom.stateColorsPanel.panel;
    const host = dom.stateColorsPanel.hosts[appletId];
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

  function getColorModeParam(appletId) {
    const appletConfig = APPLET_CONFIGS[appletId];
    const visualParams = Array.isArray(appletConfig?.visual?.params)
      ? appletConfig.visual.params
      : [];
    return visualParams.find((entry) => entry?.key === "colorMode") || null;
  }

  function getColorModeDisplayMeta(appletId) {
    const appletParams = params?.[appletId];
    const colorModeParam = getColorModeParam(appletId);
    const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
    const selectedValue = String(appletParams?.colorMode || colorModeParam?.default || options[0]?.value || "").trim();
    const selectedOption = options.find((option) => option?.value === selectedValue) || null;
    const shortValue = String(selectedOption?.value || selectedValue || "");
    const longLabel = String(selectedOption?.label || shortValue);
    const unit = String(selectedOption?.unit || "").trim();
    const tooltip = unit ? `${longLabel}, ${unit}` : longLabel;
    return { shortValue, tooltip };
  }

  function setCompactColorModeActive(appletId, active) {
    const controls = getAppletControls(appletId);
    if (!controls.colorMode || !controls.colorModeValue) {
      return;
    }
    controls.colorMode.classList.toggle("is-active-select", active);
    controls.colorModeValue.classList.toggle("is-active-control", active);
  }

  function deactivateCompactColorMode() {
    if (!activeCompactColorModeAppletId) {
      return;
    }
    setCompactColorModeActive(activeCompactColorModeAppletId, false);
    activeCompactColorModeAppletId = null;
  }

  function activateCompactColorMode(appletId) {
    if (!appletId) {
      return;
    }
    if (activeCompactColorModeAppletId === appletId) {
      getAppletControls(appletId).colorMode?.focus();
      return;
    }
    deactivateCompactColorMode();
    activeCompactColorModeAppletId = appletId;
    setCompactColorModeActive(appletId, true);
    getAppletControls(appletId).colorMode?.focus();
  }

  function syncColorModeValueDisplay(appletId) {
    const controls = getAppletControls(appletId);
    if (!controls.colorModeValue) {
      return;
    }
    const { shortValue, tooltip } = getColorModeDisplayMeta(appletId);
    controls.colorModeValue.textContent = shortValue;
    controls.colorModeValue.dataset.formattedValue = shortValue;
    controls.colorModeValue.setAttribute("title", tooltip);
    controls.colorModeValue.setAttribute("aria-label", tooltip);
  }

  function getColorModeOption(appletId) {
    const appletConfig = APPLET_CONFIGS[appletId];
    const appletParams = params?.[appletId];
    const visualParams = Array.isArray(appletConfig?.visual?.params)
      ? appletConfig.visual.params
      : [];
    const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
    const options = Array.isArray(colorModeParam?.options) ? colorModeParam.options : [];
    const activeMode = String(appletParams?.colorMode || colorModeParam?.default || options[0]?.value || "").trim();
    if (!activeMode) {
      return null;
    }
    return options.find((option) => option?.value === activeMode) || null;
  }

  function getColormapConfig(appletId) {
    const visualAdapter = APPLET_VISUALS[appletId];
    const appletParams = params?.[appletId];
    const colormapCatalog = CONTINUOUS_COLORMAP_BY_APPLET[appletId];
    if (!visualAdapter?.getColormapConfig || !appletParams) {
      return null;
    }

    const baseConfig = visualAdapter.getColormapConfig({
      appletId,
      params: appletParams,
      simulation: simulations[appletId],
      continuousColormapOptions: colormapCatalog?.options || [],
      continuousColormapGradients: colormapCatalog?.gradients || {},
    });
    if (!baseConfig) {
      return null;
    }

    const supportsInvert =
      baseConfig.options === colormapCatalog?.options &&
      Boolean(baseConfig.visible);

    return {
      ...baseConfig,
      colormapGradientsInverted: colormapCatalog?.gradientsInverted || {},
      invertVisible: supportsInvert,
      inverted: Boolean(appletParams.colormapInverted) && supportsInvert,
      setInverted(value) {
        appletParams.colormapInverted = Boolean(value);
        simulations[appletId]?.syncInstances?.();
      },
    };
  }

  function renderConfigLegend(config) {
    if (!config?.legend) {
      dom.colormapPanel.legend.container?.classList.add("is-hidden");
      return;
    }

    const selectedMap = config.value || "";
    const normalGradient = config.legend.gradient;
    const invertedGradient =
      config.colormapGradientsInverted[selectedMap] ||
      invertLinearGradientDirection(normalGradient);
    const gradient =
      config.inverted && config.invertVisible ? invertedGradient : normalGradient;

    updateLegendDisplay({
      gradient,
      minText: config.legend.minText,
      maxText: config.legend.maxText,
    });
  }

  function normalizeStateColorValue(value, fallback = "#ffffff") {
    if (typeof value !== "string") {
      return fallback;
    }
    const trimmed = value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return fallback;
    }
    return trimmed.toLowerCase();
  }

  function syncStateColorsPanel(appletId, colorModeOption) {
    const panel = dom.stateColorsPanel.panel;
    const list = dom.stateColorsPanel.list;
    const appletParams = params?.[appletId];
    const simulation = simulations[appletId];
    const stateEntries = Array.isArray(colorModeOption?.states) ? colorModeOption.states : [];
    if (!panel || !list || !appletParams || stateEntries.length === 0) {
      hideStateColorsPanel();
      return;
    }

    mountStateColorsPanel(appletId);
    panel.classList.remove("is-hidden");
    list.innerHTML = "";

    stateEntries.forEach((entry, index) => {
      const key = String(entry?.key || "").trim();
      if (!key) {
        return;
      }
      const label = String(entry?.label || key).trim();
      const fallback = normalizeStateColorValue(String(entry?.default || "#ffffff"), "#ffffff");
      const currentValue = normalizeStateColorValue(String(appletParams[key] || fallback), fallback);
      appletParams[key] = currentValue;

      const row = document.createElement("div");
      row.className = "state-color-row";

      const title = document.createElement("div");
      title.className = "state-color-title";
      title.textContent = `${index + 1}. ${label}`;

      const controls = document.createElement("div");
      controls.className = "state-color-controls";

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "color-chip state-color-chip";
      chip.setAttribute("aria-label", `${label} color`);

      const swatch = document.createElement("span");
      swatch.className = "color-chip-swatch";
      swatch.style.background = currentValue;

      const valueText = document.createElement("span");
      valueText.className = "color-chip-value";
      valueText.textContent = currentValue.toUpperCase();

      const input = document.createElement("input");
      input.type = "color";
      input.className = "form-control form-control-color theme-color-input state-color-input";
      input.value = currentValue;
      input.addEventListener("input", () => {
        const nextValue = normalizeStateColorValue(input.value, fallback);
        appletParams[key] = nextValue;
        valueText.textContent = nextValue.toUpperCase();
        swatch.style.background = nextValue;
        simulation?.syncInstances?.();
      });
      chip.addEventListener("click", () => input.click());

      chip.appendChild(swatch);
      chip.appendChild(valueText);
      controls.appendChild(chip);
      controls.appendChild(input);
      row.appendChild(title);
      row.appendChild(controls);
      list.appendChild(row);
    });
  }

  function syncColormapPanel() {
    const activeApplet = getActiveApplet?.();
    const config = getColormapConfig(activeApplet);
    const colorModeOption = getColorModeOption(activeApplet);
    const colorModeType = String(colorModeOption?.type || "continuous").toLowerCase();
    if (!config) {
      hideColormapPanel();
      hideStateColorsPanel();
      return;
    }

    if (colorModeType === "states") {
      hideColormapPanel();
      syncStateColorsPanel(activeApplet, colorModeOption);
      return;
    }

    hideStateColorsPanel();

    mountColormapPanel(activeApplet);
    dom.colormapPanel.panel?.classList.toggle("is-hidden", !config.visible);
    if (!config.visible) {
      dom.colormapPanel.legend.container?.classList.add("is-hidden");
      dom.colormapPanel.invertWrap?.classList.add("is-hidden");
      return;
    }

    const nextValue = rebuildColormapOptions(config.options, config.value);
    if (nextValue !== config.value) {
      config.setValue(nextValue);
    }
    const invertToggle = dom.colormapPanel.invertToggle;
    const invertWrap = dom.colormapPanel.invertWrap;
    if (invertToggle && invertWrap) {
      const showInvert = Boolean(config.invertVisible);
      invertWrap.classList.toggle("is-hidden", !showInvert);
      invertToggle.checked = showInvert && Boolean(config.inverted);
      invertToggle.title = config.inverted ? "Colormap inverted" : "Invert colormap";
      invertToggle.disabled = !showInvert;
    }
    renderConfigLegend(config);
  }

  function syncSingleColorVisibility(appletId) {
    const appletParams = params?.[appletId];
    const controls = getAppletControls(appletId);
    if (!appletParams || !controls.singleColorWrap) {
      return;
    }

    controls.singleColorWrap.classList.toggle("is-hidden", appletParams.colorMode !== "solid");
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
        controls.colorMode.classList.add("compact-source-select");
        controls.colorMode.addEventListener("blur", () => {
          setTimeout(() => {
            if (activeCompactColorModeAppletId === appletId) {
              deactivateCompactColorMode();
            }
          }, 0);
        });
        controls.colorMode.addEventListener("change", () => {
          appletParams.colorMode = controls.colorMode.value || appletParams.colorMode;
          syncColorModeValueDisplay(appletId);
          syncSingleColorVisibility(appletId);
          syncColormapPanel();
          simulation?.syncInstances?.();
          refreshLegend(appletId);
        });
      }
      if (controls.colorModeValue) {
        controls.colorModeValue.classList.add("compact-value-trigger");
        controls.colorModeValue.setAttribute("role", "button");
        controls.colorModeValue.setAttribute("tabindex", "0");
        controls.colorModeValue.setAttribute("aria-label", "Edit color mode");
        const activate = (event) => {
          if (event.type === "keydown" && event.key !== "Enter" && event.key !== " " && event.key !== "F2") {
            return;
          }
          if (event.type === "keydown") {
            event.preventDefault();
          }
          activateCompactColorMode(appletId);
        };
        controls.colorModeValue.addEventListener("click", activate);
        controls.colorModeValue.addEventListener("keydown", activate);
      }

      if (controls.solidColor) {
        if (controls.solidColorChip) {
          controls.solidColorChip.addEventListener("click", () => controls.solidColor.click());
        }
        controls.solidColor.addEventListener("input", () => {
          appletParams.solidColor = controls.solidColor.value;
          syncColorInput(
            controls.solidColor,
            controls.solidColorValue,
            appletParams.solidColor,
            controls.solidColorSwatch,
          );
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

    dom.colormapPanel.invertToggle?.addEventListener("change", () => {
      const activeApplet = getActiveApplet?.();
      const config = getColormapConfig(activeApplet);
      if (!config?.invertVisible) {
        return;
      }
      config.setInverted(Boolean(dom.colormapPanel.invertToggle?.checked));
      syncColormapPanel();
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
      syncColorModeValueDisplay(appletId);
      if (controls.solidColor) {
        syncColorInput(
          controls.solidColor,
          controls.solidColorValue,
          appletParams.solidColor,
          controls.solidColorSwatch,
        );
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
  const stateColorHosts = {};
  const appletControls = {};

  Object.entries(APPLET_VISUALS).forEach(([id]) => {
    hosts[id] = document.querySelector(`[data-shared-colormap-host="${id}"]`);
    stateColorHosts[id] = document.querySelector(`[data-shared-state-colors-host="${id}"]`);
      const controlIds = deriveVisualControlIds(id);
    appletControls[id] = {
      colorMode: document.getElementById(controlIds.colorModeId),
      colorModeValue: document.getElementById(controlIds.colorModeValueId),
      solidColor: document.getElementById(controlIds.solidColorId),
      solidColorChip: document.getElementById(controlIds.solidColorChipId),
      solidColorSwatch: document.getElementById(controlIds.solidColorSwatchId),
        solidColorValue: document.getElementById(controlIds.solidColorValueId),
        singleColorWrap: document.getElementById(controlIds.singleColorWrapId),
      };
  });

  return {
    appletControls,
    colormapPanel: {
      panel: document.getElementById("shared-colormap-panel"),
      select: document.getElementById("colormap"),
      invertToggle: document.getElementById("colormap-invert-toggle"),
      invertWrap: document.getElementById("colormap-invert-wrap"),
      legend: {
        container: document.getElementById("colormap-legend"),
        bar: document.getElementById("colormap-legend-bar"),
        cmin: document.getElementById("colormap-cmin"),
        cmax: document.getElementById("colormap-cmax"),
      },
      hosts,
    },
    stateColorsPanel: {
      panel: document.getElementById("shared-state-colors-panel"),
      list: document.getElementById("state-colors-list"),
      hosts: stateColorHosts,
    },
  };
}

function deriveVisualControlIds(appletId) {
  const prefix = String(appletId || "").trim();
  return {
    colorModeId: `${prefix}-color-mode`,
    colorModeValueId: `${prefix}-color-mode-value`,
    solidColorId: `${prefix}-solid-color`,
    solidColorChipId: `${prefix}-solid-color-chip`,
    solidColorSwatchId: `${prefix}-solid-color-swatch`,
    solidColorValueId: `${prefix}-solid-color-value`,
    singleColorWrapId: `${prefix}-single-color-wrap`,
  };
}

function invertLinearGradientDirection(gradient) {
  if (typeof gradient !== "string" || gradient.length === 0) {
    return gradient;
  }
  if (gradient.includes("90deg")) {
    return gradient.replace("90deg", "270deg");
  }
  return gradient;
}

function buildContinuousColormapCatalogByApplet(appletConfigs = {}) {
  return Object.fromEntries(
    Object.entries(appletConfigs).map(([appletId, appletConfig]) => [
      appletId,
      buildContinuousColormapCatalog(appletConfig?.visual),
    ]),
  );
}

function buildContinuousColormapCatalog(visualConfig = {}) {
  const entries = Array.isArray(visualConfig?.colormap) ? visualConfig.colormap : [];
  const options = [];
  const gradients = {};
  entries.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const name = String(entry.name || "").trim();
    if (!name) {
      return;
    }
    const valueStops = Array.isArray(entry.value) ? entry.value.map(normalizeColorStopHex).filter(Boolean) : [];
    if (valueStops.length < 2) {
      return;
    }
    options.push({
      value: name,
      label: formatColormapLabel(name),
    });
    gradients[name] = buildLinearGradientFromHexStops(valueStops);
  });

  return {
    options,
    gradients,
    gradientsInverted: Object.fromEntries(
      Object.entries(gradients).map(([name, gradient]) => [name, invertLinearGradientDirection(gradient)]),
    ),
  };
}

function normalizeColorStopHex(stop) {
  if (typeof stop === "number" && Number.isFinite(stop)) {
    const clamped = Math.min(0xffffff, Math.max(0, Math.round(stop)));
    return `#${clamped.toString(16).padStart(6, "0")}`;
  }
  if (typeof stop !== "string") {
    return null;
  }
  const raw = stop.trim().toLowerCase();
  if (!raw) {
    return null;
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) {
    return raw;
  }
  if (/^0x[0-9a-f]{6}$/i.test(raw)) {
    return `#${raw.slice(2)}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) {
    return `#${raw}`;
  }
  return null;
}

function buildLinearGradientFromHexStops(hexStops) {
  if (!Array.isArray(hexStops) || hexStops.length === 0) {
    return "linear-gradient(90deg, #000000 0%, #000000 100%)";
  }
  if (hexStops.length === 1) {
    return `linear-gradient(90deg, ${hexStops[0]} 0%, ${hexStops[0]} 100%)`;
  }
  const maxIndex = hexStops.length - 1;
  const stops = hexStops.map((hex, index) => {
    const ratio = index / maxIndex;
    return `${hex} ${(ratio * 100).toFixed(2)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function formatColormapLabel(name) {
  return String(name || "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
