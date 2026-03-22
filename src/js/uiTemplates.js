// Config-driven sidebar template renderer for applet information and controls.
import { APPLET_CONFIGS, APPLET_ORDER, APPLET_VISUALS } from "./app/appletConfigs.js";
import { getSectionInputControls } from "./app/appletConfigUtils.js";

// Section title mapping
const SUPPORTED_SECTION_TITLES = Object.freeze({
  introduction: "Introduction",
  stats: "Stats",
  simulation: "Simulation",
  interaction: "Interaction",
  visual: "Visual",
});

const SUPPORTED_SECTION_ICONS = Object.freeze({
  introduction: "bi-journal-text",
  stats: "bi-bar-chart-line-fill",
  simulation: "bi-sliders2",
  interaction: "bi-hand-index-thumb",
  visual: "bi-palette",
});

// Public renderer
export function renderAppletSectionsFromConfig() {
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("controls-panel");
  if (!leftPanel || !rightPanel) {
    return;
  }

  const templates = getTemplateRefs();
  if (!templates.section || !templates.sliderRow || !templates.chartCard || !templates.statCard) {
    return;
  }

  removeGeneratedAppletSections(leftPanel);
  removeGeneratedAppletSections(rightPanel);

  const leftAnchor = leftPanel.querySelector(".sidebar-head");
  const rightAnchor = rightPanel.querySelector(".sidebar-head");
  if (!leftAnchor || !rightAnchor) {
    return;
  }

  const leftFragment = document.createDocumentFragment();
  const rightFragment = document.createDocumentFragment();

  APPLET_ORDER.forEach((appletId) => {
    const config = APPLET_CONFIGS[appletId];
    if (!config) {
      return;
    }

    if (config.intro) {
      leftFragment.appendChild(buildIntroSection(config.intro, config.model, appletId, templates));
    }
    if (config.stats) {
      leftFragment.appendChild(buildStatsSection(config.stats, appletId, templates));
    }
    if (config.simulation) {
      rightFragment.appendChild(buildSimulationSection(config.simulation, appletId, templates));
    }
    if (config.interaction) {
      rightFragment.appendChild(buildInteractionSection(config.interaction, appletId, templates));
    }

    const visualAdapter = APPLET_VISUALS[appletId];
    if (visualAdapter?.getColormapConfig) {
      rightFragment.appendChild(buildVisualSection(appletId, visualAdapter, templates));
    }
  });

  leftAnchor.parentNode?.insertBefore(leftFragment, leftAnchor.nextSibling);
  rightAnchor.parentNode?.insertBefore(rightFragment, rightAnchor.nextSibling);

  renderSharedRightSections(rightPanel, templates);
}
// Template and panel helpers
function getTemplateRefs() {
  return {
    section: document.getElementById("tpl-control-section"),
    sliderRow: document.getElementById("tpl-slider-row"),
    chartCard: document.getElementById("tpl-chart-card"),
    statCard: document.getElementById("tpl-stat-card"),
    cameraSection: document.getElementById("tpl-camera-section"),
  };
}

function removeGeneratedAppletSections(panel) {
  panel?.querySelectorAll("[data-generated-applet-section]").forEach((node) => {
    node.remove();
  });
}

// Section shell builder
function buildSectionShell(sectionConfig, appletId, templates, options = {}) {
  const sectionKey = normalizeSectionKey(options.sectionKey || sectionConfig?.sectionKey);
  const sectionTitle = getSectionTitle(sectionKey);
  const section = templates.section.content.firstElementChild.cloneNode(true);
  section.setAttribute("data-control-section", getScopedSectionKey(appletId, sectionKey));
  section.setAttribute("data-app-visible", appletId);
  section.setAttribute("data-generated-applet-section", "true");
  if (sectionConfig.className) {
    section.classList.add(...sectionConfig.className.split(/\s+/).filter(Boolean));
  }

  const toggle = section.querySelector("[data-control-toggle]");
  toggle.setAttribute(
    "aria-label",
    options.toggleAriaLabel || `Toggle ${appletId} ${sectionTitle.toLowerCase()} section`,
  );

  const titleIcon = section.querySelector("[data-section-title-icon]");
  titleIcon.className = `${getSectionIcon(sectionKey)} panel-head-icon`;
  const titleText = section.querySelector("[data-section-title-text]");
  titleText.textContent = sectionTitle;

  return section;
}

function getSectionBody(section) {
  return section.querySelector("[data-control-section-body]");
}

// Intro section
function buildIntroSection(introConfig, modelConfig, appletId, templates) {
  const section = buildSectionShell(introConfig, appletId, templates, {
    sectionKey: "introduction",
    toggleAriaLabel: `Toggle ${appletId} introduction section`,
  });
  const body = getSectionBody(section);

  introConfig.paragraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.className = "panel-copy";
    p.textContent = paragraph;
    body.appendChild(p);
  });

  if (modelConfig?.items?.length) {
    const tipsBox = document.createElement("div");
    tipsBox.className = "model-action-row mt-3";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-sm btn-outline-theme mt-3";
    button.setAttribute("data-model-info-open", appletId);
    button.textContent = "Open Model Equations";
    tipsBox.appendChild(button);
    body.appendChild(tipsBox);
  }

  return section;
}

// Stats section
function buildStatsSection(statsConfig, appletId, templates) {
  const section = buildSectionShell(statsConfig, appletId, templates, {
    sectionKey: "stats",
    toggleAriaLabel: `Toggle ${appletId} stats section`,
  });
  const body = getSectionBody(section);

  const statGrid = document.createElement("div");
  statGrid.className = "stat-grid";
  const { statEntries, chartEntries } = getStatsEntries(statsConfig);
  statEntries.forEach((stat) => {
    const card = templates.statCard.content.firstElementChild.cloneNode(true);
    const label = card.querySelector(".stat-inline-label");
    label.textContent = stat.label;
    const statKey = String(stat?.key || "").trim();
    if (statKey === "effectiveSpeed" || statKey === "fps") {
      label.classList.add("stat-inline-label-title");
    }
    if (stat.labelClass) {
      label.classList.add(stat.labelClass);
    }
    const value = card.querySelector(".stat-inline-value");
    value.id = resolveStatValueId(appletId, stat);
    value.textContent = stat.initial ?? "0";
    statGrid.appendChild(card);
  });
  body.appendChild(statGrid);

  const chartStack = document.createElement("div");
  chartStack.className = "chart-stack mt-2";
  chartEntries.forEach((chart, index) => {
    const chartLabel = String(chart?.label ?? "").trim();
    const chartKey = String(chart?.key ?? "").trim();
    if (!chartLabel || !chartKey) {
      throw new Error(
        `[uiTemplates] Stats chart config for "${appletId}" requires non-empty "key" and "label".`,
      );
    }
    const card = templates.chartCard.content.firstElementChild.cloneNode(true);
    if (index > 0) {
      card.classList.add("mt-2");
    }
    const head = card.querySelector("[data-chart-toggle]");
    head.setAttribute("aria-label", `Toggle ${chartLabel.toLowerCase()} chart`);
    const modeToggle = card.querySelector("[data-chart-mode-toggle]");
    if (modeToggle) {
      const supportsDistribution = Boolean(chart?.supportsDistribution);
      if (supportsDistribution) {
        modeToggle.classList.remove("is-hidden");
        modeToggle.setAttribute("data-applet-id", appletId);
        modeToggle.setAttribute("data-chart-key", chartKey);
        modeToggle.setAttribute("aria-label", `Show time trend for ${chartLabel.toLowerCase()}`);
        modeToggle.setAttribute("title", `Show time trend for ${chartLabel.toLowerCase()}`);
      } else {
        modeToggle.classList.add("is-hidden");
        modeToggle.setAttribute("disabled", "disabled");
      }
    }
    card.querySelector(".chart-title").textContent = chartLabel;
    const live = card.querySelector(".chart-live");
    live.id = deriveChartLiveId(appletId, chartKey);
    live.textContent = resolveChartLiveInitial(chart);
    const canvas = card.querySelector("canvas");
    canvas.id = deriveChartCanvasId(appletId, chartKey);
    canvas.setAttribute("aria-label", `${appletId} ${chartLabel} trend chart`);
    chartStack.appendChild(card);
  });
  body.appendChild(chartStack);

  return section;
}

function getStatsEntries(statsConfig = {}) {
  const params = Array.isArray(statsConfig?.params) ? statsConfig.params : null;
  if (!params) {
    return {
      statEntries: Array.isArray(statsConfig?.stats) ? statsConfig.stats : [],
      chartEntries: Array.isArray(statsConfig?.charts) ? statsConfig.charts : [],
    };
  }

  const statEntries = [];
  const chartEntries = [];
  params.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const type = String(entry.type || "stat").trim().toLowerCase();
    if (type === "chart") {
      chartEntries.push(entry);
      return;
    }
    statEntries.push(entry);
  });

  return { statEntries, chartEntries };
}

function resolveStatValueId(appletId, stat) {
  if (typeof stat?.valueId === "string" && stat.valueId.trim().length > 0) {
    return stat.valueId.trim();
  }
  const key = String(stat?.key || "").trim();
  if (!key) {
    throw new Error("[uiTemplates] Stats stat entry requires non-empty \"key\" when valueId is omitted.");
  }
  const appKey = String(appletId || "").trim();
  if (!appKey) {
    throw new Error("[uiTemplates] Stats stat entry requires non-empty applet id.");
  }
  return `${appKey}-${key}-live`;
}

function deriveChartCanvasId(appletId, chartKey) {
  const appKey = String(appletId || "").trim();
  const key = String(chartKey || "").trim();
  return `chart-${appKey}-${key}`;
}

function deriveChartLiveId(appletId, chartKey) {
  return `${deriveChartCanvasId(appletId, chartKey)}-live`;
}

function resolveChartLiveInitial(chart) {
  if (chart?.liveInitial !== undefined) {
    return String(chart.liveInitial);
  }
  const unit = typeof chart?.unit === "string" ? chart.unit.trim() : "";
  return unit ? `0 ${unit}` : "0";
}

// Simulation section
function buildSimulationSection(simConfig, appletId, templates) {
  const simulationSectionKey = "simulation";
  const section = buildSectionShell(simConfig, appletId, templates, {
    sectionKey: simulationSectionKey,
    toggleAriaLabel: `Toggle ${appletId} simulation controls`,
  });
  const body = getSectionBody(section);
  const { sliders, selects } = getSectionInputControls(simConfig);
  const sliderHubConfig = simConfig.sliderHub ?? deriveSliderHubConfigFromSlider(sliders[0]);

  if (sliderHubConfig) {
    body.appendChild(
      createSliderHub(
        sliderHubConfig,
        getScopedSectionKey(appletId, simulationSectionKey),
        `Active ${appletId} slider`,
      ),
    );
  }

  const controlRows = [];
  selects.forEach((select, index) => {
    controlRows.push({
      row: createSimulationSelectRow(appletId, select),
      control: select,
      defaultIndex: index,
      label: String(select.label || select.id || ""),
      groupKey: normalizeSliderGroup(select.group),
      groupLabel: select.groupLabel,
    });
  });
  sliders.forEach((slider, index) => {
    controlRows.push({
      row: createSliderRow(templates, appletId, slider),
      control: slider,
      defaultIndex: selects.length + index,
      label: String(slider.label || slider.id || ""),
      groupKey: normalizeSliderGroup(slider.group),
      groupLabel: slider.groupLabel,
    });
  });

  const sliderList = document.createElement("div");
  sliderList.className = "simulation-slider-list";
  const hasGrouping = controlRows.some((entry) => entry.groupKey);

  let groupActive = false;
  let alphabetActive = false;
  let orderButtons = [];

  const renderSliderRows = (mode) => {
    sliderList.replaceChildren();

    if (mode === "alphabet") {
      controlRows
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .forEach(({ row }) => sliderList.appendChild(row));
      return;
    }

    if (mode === "default") {
      controlRows
        .slice()
        .sort((a, b) => a.defaultIndex - b.defaultIndex)
        .forEach(({ row }) => sliderList.appendChild(row));
      return;
    }

    const grouped = new Map();
    controlRows
      .slice()
      .sort((a, b) => a.defaultIndex - b.defaultIndex)
      .forEach((entry) => {
        const key = entry.groupKey || "ungrouped";
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key).push(entry);
      });

    const sortedGroups = Array.from(grouped.entries())
      .map(([groupKey, rows]) => ({
        groupKey,
        rows,
        label: deriveGroupLabel(groupKey, rows),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    sortedGroups.forEach(({ rows, label }) => {
      const heading = document.createElement("div");
      heading.className = "small text-uppercase fw-semibold opacity-75 mt-2 mb-1";
      heading.textContent = label;
      sliderList.appendChild(heading);
      rows.forEach(({ row }) => sliderList.appendChild(row));
    });
  };

  const resolveOrderMode = () => {
    if (groupActive) {
      return "group";
    }
    if (alphabetActive) {
      return "alphabet";
    }
    return "default";
  };

  const updateOrderButtonVisuals = () => {
    orderButtons.forEach((entry) => {
      const mode = entry.getAttribute("data-order-mode");
      const active = mode === "group" ? groupActive : alphabetActive;
      entry.classList.toggle("btn-theme", active);
      entry.classList.toggle("btn-outline-theme", !active);
      entry.setAttribute("aria-pressed", String(active));
    });
  };

  if (hasGrouping) {
    const controlsRow = document.createElement("div");
    controlsRow.className = "simulation-meta-row d-flex align-items-center justify-content-between mt-0 mb-1";
    controlsRow.innerHTML = `
      <div class="simulation-unit-badge" aria-label="Simulation units">
        ${buildSimulationUnitsBadge(appletId)}
      </div>
      <div class="btn-group simulation-order-toggle" role="group" aria-label="Simulation parameter order">
        <button type="button" class="btn btn-theme simulation-order-btn" data-order-mode="group" aria-pressed="true" aria-label="Group order" title="Group order">
          <i class="bi bi-collection" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn-outline-theme simulation-order-btn" data-order-mode="alphabet" aria-pressed="false" aria-label="Alphabetical order" title="A-Z order">
          <i class="bi bi-sort-alpha-down" aria-hidden="true"></i>
        </button>
      </div>
    `;
    body.appendChild(controlsRow);

    groupActive = true;
    alphabetActive = false;
    orderButtons = Array.from(controlsRow.querySelectorAll("[data-order-mode]"));
    orderButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.getAttribute("data-order-mode");
        if (mode === "group") {
          groupActive = !groupActive;
          if (groupActive) {
            alphabetActive = false;
          }
        } else if (mode === "alphabet") {
          alphabetActive = !alphabetActive;
          if (alphabetActive) {
            groupActive = false;
          }
        }
        updateOrderButtonVisuals();
        renderSliderRows(resolveOrderMode());
      });
    });

    updateOrderButtonVisuals();
    renderSliderRows(resolveOrderMode());
  } else {
    const controlsRow = document.createElement("div");
    controlsRow.className = "simulation-meta-row d-flex align-items-center justify-content-start mt-0 mb-1";
    controlsRow.innerHTML = `
      <div class="simulation-unit-badge" aria-label="Simulation units">
        ${buildSimulationUnitsBadge(appletId)}
      </div>
    `;
    body.appendChild(controlsRow);
    controlRows.forEach(({ row }) => sliderList.appendChild(row));
  }

  body.appendChild(sliderList);
  body.appendChild(createSimulationActionRow(simConfig, appletId));

  return section;
}

function createSimulationSelectRow(appletId, selectConfig) {
  const row = document.createElement("div");
  row.className = "simulation-slider-row";

  const label = document.createElement("label");
  label.className = "form-label";
  const inputId = getSimulationSelectInputId(appletId, selectConfig);
  label.setAttribute("for", inputId);

  const labelName = document.createElement("span");
  labelName.className = "label-name";
  const iconClass = selectConfig.icon || "bi bi-sliders";
  const valueId = getSimulationSelectValueId(appletId, selectConfig);
  labelName.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i><span data-select-label-text></span>`;
  const labelTextNode = labelName.querySelector("[data-select-label-text]");
  if (labelTextNode) {
    labelTextNode.textContent = selectConfig.label || "";
    renderInlineMathIfAvailable(labelTextNode);
  }
  label.appendChild(labelName);
  const value = document.createElement("span");
  value.className = "label-value";
  value.id = valueId;
  value.textContent = String(selectConfig.value ?? "");
  label.appendChild(value);
  row.appendChild(label);

  const select = document.createElement("select");
  select.className = "form-select form-select-sm theme-select compact-source-select";
  select.id = inputId;
  (Array.isArray(selectConfig.options) ? selectConfig.options : []).forEach((optionConfig) => {
    const option = document.createElement("option");
    option.value = String(optionConfig.key ?? "");
    option.textContent = String(optionConfig.label ?? optionConfig.value ?? optionConfig.key ?? "");
    select.appendChild(option);
  });
  if (selectConfig.value !== undefined && selectConfig.value !== null) {
    select.value = String(selectConfig.value);
  }
  row.appendChild(select);

  return row;
}

function createSliderHub(hubConfig, hubKey, ariaLabel) {
  const hub = document.createElement("div");
  hub.className = "section-slider-hub";
  hub.setAttribute("data-slider-hub", hubKey);
  hub.setAttribute("aria-label", ariaLabel);
  hub.innerHTML = `
    <div class="section-slider-head">
      <span class="section-slider-title" data-section-slider-title>${hubConfig.title}</span>
      <span class="section-slider-value" data-section-slider-value>${hubConfig.value}</span>
    </div>
    <input
      class="form-range section-active-slider"
      type="range"
      data-section-slider
      min="${hubConfig.min}"
      max="${hubConfig.max}"
      step="${hubConfig.step}"
      value="${hubConfig.valueNum}"
    />
  `;
  return hub;
}

function deriveSliderHubConfigFromSlider(sliderConfig) {
  if (!sliderConfig || typeof sliderConfig !== "object") {
    return null;
  }

  const title = String(sliderConfig.label || sliderConfig.id || "Parameter");
  const valueText = String(
    sliderConfig.valueText ??
    sliderConfig.value ??
    "",
  );
  const minValue = sliderConfig.uiMin ?? sliderConfig.min;
  const maxValue = sliderConfig.uiMax ?? sliderConfig.max;
  const stepValue = sliderConfig.step ?? 1;
  const numericValue = sliderConfig.value ?? sliderConfig.default ?? minValue ?? 0;

  return {
    title,
    value: valueText,
    min: String(minValue ?? 0),
    max: String(maxValue ?? 1),
    step: String(stepValue),
    valueNum: String(numericValue),
  };
}

function createSliderRow(templates, appletId, slider, options = {}) {
  const fragment = templates.sliderRow.content.cloneNode(true);
  const sliderInputId = options.inputId || getSimulationSliderInputId(appletId, slider);
  const sliderValueId = options.valueId || getSimulationSliderValueId(appletId, slider);

  const label = fragment.querySelector("label.form-label");
  if (slider.className) {
    label.classList.add(...slider.className.split(/\s+/).filter(Boolean));
  }
  label.setAttribute("for", sliderInputId);

  const labelName = label.querySelector(".label-name");
  labelName.innerHTML = `<i class="${slider.icon}" aria-hidden="true"></i><span data-slider-label-text></span>`;
  const labelTextNode = labelName.querySelector("[data-slider-label-text]");
  if (labelTextNode) {
    labelTextNode.textContent = slider.label;
    if (options.renderMath !== false) {
      renderInlineMathIfAvailable(labelTextNode);
    }
  }

  const value = label.querySelector(".label-value");
  value.id = sliderValueId;
  value.textContent = slider.valueText;

  const input = fragment.querySelector("input.form-range");
  input.id = sliderInputId;
  input.min = slider.uiMin ?? slider.min;
  input.max = slider.uiMax ?? slider.max;
  input.step = slider.step;
  input.value = slider.value;

  const wrapSimulationRow = options.wrapSimulationRow !== false;
  if (wrapSimulationRow) {
    const row = document.createElement("div");
    row.className = "simulation-slider-row";
    row.appendChild(fragment);
    return row;
  }

  return fragment;
}

function deriveSimulationActionButtonIds(appletId, simConfig = {}) {
  const normalizedAppletId = String(appletId || "applet").trim() || "applet";
  return {
    pauseButtonId: simConfig.pauseButtonId || `${normalizedAppletId}-toggle-pause`,
    defaultButtonId: simConfig.defaultButtonId || `${normalizedAppletId}-default-sim`,
    resetButtonId: simConfig.resetButtonId || `${normalizedAppletId}-reset-sim`,
  };
}

function createSimulationActionRow(simConfig, appletId) {
  const buttonIds = deriveSimulationActionButtonIds(appletId, simConfig);
  const actions = document.createElement("div");
  actions.className = "d-flex gap-2 mt-3 simulation-action-row";
  actions.innerHTML = `
    <button
      class="btn btn-sm btn-theme btn-icon-only"
      id="${buttonIds.pauseButtonId}"
      title="Pause simulation"
      aria-label="Pause simulation"
    >
      <i class="bi bi-pause-fill" aria-hidden="true"></i>
    </button>
    <button class="btn btn-sm btn-outline-theme action-fill" id="${buttonIds.defaultButtonId}">
      <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
      <span>Default</span>
    </button>
    <button class="btn btn-sm btn-outline-theme action-fill" id="${buttonIds.resetButtonId}">
      <i class="bi bi-bootstrap-reboot" aria-hidden="true"></i>
      <span>Reset</span>
    </button>
  `;
  return actions;
}

// Interaction section
function buildInteractionSection(interactionConfig, appletId, templates) {
  const interactionSectionKey = "interaction";
  const section = buildSectionShell(interactionConfig, appletId, templates, {
    sectionKey: interactionSectionKey,
    toggleAriaLabel: `Toggle ${appletId} interaction controls`,
  });
  const body = getSectionBody(section);
  const { switches, sliders } = getSectionInputControls(interactionConfig);
  const sliderHubConfig = interactionConfig.sliderHub ?? deriveSliderHubConfigFromSlider(sliders[0]);

  if (sliderHubConfig) {
    body.appendChild(
      createSliderHub(
        sliderHubConfig,
        getScopedSectionKey(appletId, interactionSectionKey),
        `Active ${appletId} interaction slider`,
      ),
    );
  }

  switches.forEach((switchConfig, index) => {
    body.appendChild(createInteractionSwitchRow(switchConfig, index));
  });

  sliders.forEach((slider) => {
    body.appendChild(createSliderRow(templates, appletId, slider, {
      inputId: slider.id,
      valueId: slider.valueId || `${slider.id}-value`,
      renderMath: true,
      wrapSimulationRow: false,
    }));
  });

  (interactionConfig.notes || []).forEach((note, index) => {
    const p = document.createElement("p");
    p.className = `panel-copy${index === 0 ? " mt-2 mb-0" : " mb-0"}`;
    p.textContent = note;
    body.appendChild(p);
  });

  return section;
}

function createInteractionSwitchRow(switchConfig, index) {
  const row = document.createElement("div");
  row.className = `form-label${index > 0 ? " mt-2" : ""}`;

  const labelName = document.createElement("span");
  labelName.className = "label-name";
  labelName.innerHTML = `
    <i class="${switchConfig.icon || "bi bi-toggle-on"}" aria-hidden="true"></i>
    <span>${switchConfig.label || ""}</span>
  `;

  const switchWrap = document.createElement("div");
  switchWrap.className = "form-check form-switch m-0";

  const input = document.createElement("input");
  input.className = "form-check-input";
  input.type = "checkbox";
  input.setAttribute("role", "switch");
  input.id = switchConfig.id;
  input.checked = Boolean(switchConfig.checked);
  if (switchConfig.label) {
    input.setAttribute("aria-label", switchConfig.label);
  }

  switchWrap.appendChild(input);
  row.appendChild(labelName);
  row.appendChild(switchWrap);
  return row;
}

// Visual section
function buildVisualSection(appletId, visualAdapter, templates) {
  const sectionConfig = {
    sectionKey: "visual",
  };
  const section = buildSectionShell(sectionConfig, appletId, templates, {
    sectionKey: "visual",
    toggleAriaLabel: `Toggle ${appletId} visual controls`,
  });
  const body = getSectionBody(section);
  const appletConfig = APPLET_CONFIGS[appletId] || {};
  const visualParams = Array.isArray(appletConfig.visual?.params)
    ? appletConfig.visual.params
    : [];
  const { sliders: visualSliders } = getSectionInputControls(appletConfig.visual);
  const targetFrameRateSlider = visualSliders.find((entry) => String(entry?.key || entry?.paramKey || "").trim() === "targetFrameRate");
  const colorModeParam = visualParams.find((entry) => entry?.key === "colorMode");
  const solidColorParam = visualParams.find((entry) => entry?.key === "solidColor");
  const controlIds = deriveVisualControlIds(appletId);
  const colorModeId = controlIds.colorModeId;

  const visualSliderHubConfig = targetFrameRateSlider
    ? deriveSliderHubConfigFromSlider(targetFrameRateSlider)
    : null;
  if (visualSliderHubConfig) {
    body.appendChild(
      createSliderHub(
        visualSliderHubConfig,
        getScopedSectionKey(appletId, "visual"),
        `Active ${appletId} visual slider`,
      ),
    );
  }

  if (targetFrameRateSlider) {
    body.appendChild(createSliderRow(templates, appletId, targetFrameRateSlider));
  }

  const colorModeLabel = "Color Mode";
  const colorModeOptions = Array.isArray(colorModeParam?.options)
    ? colorModeParam.options
    : [];

  const colorLabel = document.createElement("label");
  colorLabel.className = "form-label";
  colorLabel.setAttribute("for", colorModeId);
  colorLabel.innerHTML = `
    <span class="label-name"><i class="bi bi-palette-fill" aria-hidden="true"></i>${colorModeLabel}</span>
    <span class="label-value" id="${controlIds.colorModeValueId}"></span>
  `;
  body.appendChild(colorLabel);

  const select = document.createElement("select");
  select.className = "form-select form-select-sm theme-select";
  select.id = colorModeId;
  colorModeOptions.forEach((item) => {
    const option = document.createElement("option");
    option.value = String(item?.key ?? "");
    option.textContent = item.label;
    select.appendChild(option);
  });
  body.appendChild(select);

  const colormapHost = document.createElement("div");
  colormapHost.setAttribute("data-shared-colormap-host", appletId);
  body.appendChild(colormapHost);

  const stateColorsHost = document.createElement("div");
  stateColorsHost.setAttribute("data-shared-state-colors-host", appletId);
  body.appendChild(stateColorsHost);

  const visualSizeHost = document.createElement("div");
  visualSizeHost.setAttribute("data-shared-visual-size-host", appletId);
  body.appendChild(visualSizeHost);

  if (controlIds.solidColorId && controlIds.solidColorValueId && controlIds.singleColorWrapId) {
    const wrap = document.createElement("div");
    wrap.id = controlIds.singleColorWrapId;
    wrap.className = "is-hidden";

    const solidColorLabel = "Color";
    const defaultColor = String(solidColorParam?.default || "#ffffff");
    const normalizedColor = defaultColor.startsWith("#") ? defaultColor : `#${defaultColor}`;

    wrap.innerHTML = `
      <div class="form-label mt-2 single-color-row">
        <span class="label-name"><i class="bi bi-eyedropper" aria-hidden="true"></i>${solidColorLabel}</span>
        <div class="single-color-inline-row">
          <button
            type="button"
            class="color-chip single-color-chip"
            id="${controlIds.solidColorChipId}"
            aria-label="${solidColorLabel}"
          >
            <span class="color-chip-swatch" id="${controlIds.solidColorSwatchId}" style="background:${normalizedColor.toLowerCase()};"></span>
            <span class="color-chip-value" id="${controlIds.solidColorValueId}">${normalizedColor.toUpperCase()}</span>
          </button>
          <input
            type="color"
            class="form-control form-control-color theme-color-input single-color-inline-input"
            id="${controlIds.solidColorId}"
            value="${normalizedColor.toLowerCase()}"
            aria-label="${solidColorLabel}"
          />
        </div>
      </div>
    `;
    body.appendChild(wrap);
  }

  return section;
}

// Shared right-panel section
function renderSharedRightSections(rightPanel, templates) {
  if (!rightPanel) {
    return;
  }

  rightPanel.querySelector('[data-control-section="camera"]')?.remove();

  const cameraTemplate = templates.cameraSection;
  if (!cameraTemplate) {
    return;
  }

  const cameraSection = cameraTemplate.content.firstElementChild.cloneNode(true);
  const worldSection = rightPanel.querySelector('[data-control-section="world"]');
  if (worldSection?.parentNode) {
    worldSection.parentNode.insertBefore(cameraSection, worldSection);
  } else {
    rightPanel.appendChild(cameraSection);
  }
}

// Naming and grouping utilities
function normalizeSliderGroup(group) {
  if (typeof group !== "string") {
    return null;
  }
  const normalized = group.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function getSimulationSliderInputId(appletId, slider) {
  return `${appletId}-${slider.id}`;
}

function getSimulationSliderValueId(appletId, slider) {
  const paramKey = String(slider?.paramKey || "").trim();
  if (!paramKey) {
    throw new Error(
      `[uiTemplates] Simulation slider "${slider?.id ?? "unknown"}" is missing paramKey.`,
    );
  }
  return `${appletId}-${paramKey}-value`;
}

function getSimulationSelectInputId(appletId, selectConfig) {
  return `${appletId}-${selectConfig.id}`;
}

function getSimulationSelectValueId(appletId, selectConfig) {
  const paramKey = String(selectConfig?.paramKey || "").trim();
  if (!paramKey) {
    throw new Error(
      `[uiTemplates] Simulation select "${selectConfig?.id ?? "unknown"}" is missing paramKey.`,
    );
  }
  return `${appletId}-${paramKey}-value`;
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

function deriveGroupLabel(groupKey, rows) {
  const customLabel = rows.find((entry) => typeof entry.groupLabel === "string" && entry.groupLabel.trim().length > 0)?.groupLabel;
  if (customLabel) {
    return customLabel;
  }
  if (groupKey === "initial") {
    return "Initialization";
  }
  if (groupKey === "dynamic") {
    return "Dynamics";
  }
  if (groupKey === "ungrouped") {
    return "Other";
  }

  return groupKey
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildSimulationUnitsBadge(appletId) {
  const config = APPLET_CONFIGS[appletId] || {};
  const units = config.unit || {};
  const worldLength = config.unit?.length?.label || "m";
  const lengthLabel = units.length?.label || worldLength || "m";
  const timeLabel = units.time?.label || "s";
  const massLabel = units.mass?.label || "a.u.";
  const lengthDescription = units.length?.description || lengthLabel;
  const timeDescription = units.time?.description || timeLabel;
  const massDescription = units.mass?.description || massLabel;
  const lengthLabelHtml = formatUnitBadgeLabelHtml(lengthLabel);
  const timeLabelHtml = formatUnitBadgeLabelHtml(timeLabel);
  const massLabelHtml = formatUnitBadgeLabelHtml(massLabel);
  return `
    <span title="Length unit: ${lengthDescription} (${lengthLabel})" aria-label="Length unit ${lengthDescription} (${lengthLabel})">L: ${lengthLabelHtml}</span>
    <span title="Time unit: ${timeDescription} (${timeLabel})" aria-label="Time unit ${timeDescription} (${timeLabel})">T: ${timeLabelHtml}</span>
    <span title="Mass unit: ${massDescription} (${massLabel})" aria-label="Mass unit ${massDescription} (${massLabel})">M: ${massLabelHtml}</span>
  `;
}

function formatUnitBadgeLabelHtml(unitLabel) {
  let html = escapeHtml(String(unitLabel || "").trim());
  if (!html) {
    return "";
  }
  html = html.replace(/\bM_sun\b/g, "M_☉");
  html = html.replace(/\^([A-Za-z0-9+\-]+)/g, "<sup>$1</sup>");
  html = html.replace(/_([A-Za-z0-9+\-☉]+)/g, "<sub>$1</sub>");
  return html;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Math rendering helper
function renderInlineMathIfAvailable(node) {
  if (!node || typeof window === "undefined") {
    return;
  }
  if (typeof window.renderMathInElement !== "function") {
    return;
  }
  window.renderMathInElement(node, {
    delimiters: [
      { left: "\\(", right: "\\)", display: false },
    ],
    throwOnError: false,
  });
}

// Section-key utilities
function getScopedSectionKey(appletId, sectionKey) {
  const normalizedAppletId = String(appletId || "applet").trim() || "applet";
  const normalizedSectionKey = normalizeSectionKey(sectionKey);
  return `${normalizedAppletId}:${normalizedSectionKey}`;
}

function normalizeSectionKey(sectionKey) {
  return String(sectionKey || "")
    .trim()
    .toLowerCase();
}

function getSectionTitle(sectionKey) {
  const normalizedKey = normalizeSectionKey(sectionKey);
  const title = SUPPORTED_SECTION_TITLES[normalizedKey];
  if (!title) {
    throw new Error(
      `Unsupported sectionKey "${sectionKey}". Supported keys: ${Object.keys(SUPPORTED_SECTION_TITLES).join(", ")}`,
    );
  }
  return title;
}

function getSectionIcon(sectionKey) {
  const normalizedKey = normalizeSectionKey(sectionKey);
  const icon = SUPPORTED_SECTION_ICONS[normalizedKey];
  if (!icon) {
    throw new Error(
      `Unsupported sectionKey "${sectionKey}" for icons. Supported keys: ${Object.keys(SUPPORTED_SECTION_ICONS).join(", ")}`,
    );
  }
  return icon;
}
