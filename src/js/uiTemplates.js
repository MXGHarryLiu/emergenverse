// Config-driven sidebar template renderer for applet information and controls.
import { APPLET_CONFIGS, APPLET_ORDER, APPLET_VISUALS } from "./app/appletConfigs.js";

export function renderAppletSectionsFromConfig() {
  const leftPanel = document.getElementById("left-panel");
  const rightPanel = document.getElementById("right-panel");
  if (!leftPanel || !rightPanel) {
    return;
  }

  const templates = {
    section: document.getElementById("tpl-control-section"),
    sliderRow: document.getElementById("tpl-slider-row"),
    chartCard: document.getElementById("tpl-chart-card"),
    statCard: document.getElementById("tpl-stat-card"),
    cameraSection: document.getElementById("tpl-camera-section"),
  };
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
    if (config.left?.intro) {
      leftFragment.appendChild(buildIntroSection(config.left.intro, config.left.model, appletId, templates));
    }
    if (config.left?.stats) {
      leftFragment.appendChild(buildStatsSection(config.left.stats, appletId, templates));
    }
    if (config.right?.simulation) {
      rightFragment.appendChild(buildSimulationSection(config.right.simulation, appletId, templates));
    }
    if (config.right?.interaction) {
      rightFragment.appendChild(buildInteractionSection(config.right.interaction, appletId, templates));
    }
    const visualAdapter = APPLET_VISUALS[appletId];
    if (visualAdapter?.section) {
      rightFragment.appendChild(buildVisualSection(appletId, visualAdapter, templates));
    }
  });

  if (leftAnchor.parentNode) {
    leftAnchor.parentNode.insertBefore(leftFragment, leftAnchor.nextSibling);
  }
  if (rightAnchor.parentNode) {
    rightAnchor.parentNode.insertBefore(rightFragment, rightAnchor.nextSibling);
  }

  renderSharedRightSections(rightPanel, templates);
}

function removeGeneratedAppletSections(panel) {
  panel?.querySelectorAll("[data-generated-applet-section]").forEach((node) => {
    node.remove();
  });
}

function buildSectionShell(sectionConfig, appletId, templates, options = {}) {
  const section = templates.section.content.firstElementChild.cloneNode(true);
  section.setAttribute("data-control-section", sectionConfig.sectionKey);
  section.setAttribute("data-app-visible", appletId);
  section.setAttribute("data-generated-applet-section", "true");
  section.classList.toggle("is-hidden", Boolean(sectionConfig.hidden));
  if (sectionConfig.className) {
    section.classList.add(...sectionConfig.className.split(/\s+/).filter(Boolean));
  }

  const toggle = section.querySelector("[data-control-toggle]");
  toggle.setAttribute(
    "aria-label",
    options.toggleAriaLabel || `Toggle ${appletId} ${sectionConfig.title.toLowerCase()} section`,
  );

  const titleIcon = section.querySelector("[data-section-title-icon]");
  titleIcon.className = `${sectionConfig.icon} panel-head-icon`;
  const titleText = section.querySelector("[data-section-title-text]");
  titleText.textContent = sectionConfig.title;

  return section;
}

function buildIntroSection(introConfig, modelConfig, appletId, templates) {
  const section = buildSectionShell(introConfig, appletId, templates, {
    toggleAriaLabel: `Toggle ${appletId} introduction section`,
  });
  const body = section.querySelector("[data-control-section-body]");

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
    button.textContent = modelConfig.buttonLabel || "Open Model Equations";
    tipsBox.appendChild(button);
    body.appendChild(tipsBox);
  }

  return section;
}

function buildStatsSection(statsConfig, appletId, templates) {
  const section = buildSectionShell(statsConfig, appletId, templates, {
    toggleAriaLabel: `Toggle ${appletId} stats section`,
  });
  const body = section.querySelector("[data-control-section-body]");

  const statGrid = document.createElement("div");
  statGrid.className = "stat-grid mb-3";
  (statsConfig.stats || []).forEach((stat) => {
    const card = templates.statCard.content.firstElementChild.cloneNode(true);
    const label = card.querySelector(".stat-inline-label");
    label.textContent = stat.label;
    if (stat.labelClass) {
      label.classList.add(stat.labelClass);
    }
    const value = card.querySelector(".stat-inline-value");
    value.id = stat.valueId;
    value.textContent = stat.initial ?? "0";
    statGrid.appendChild(card);
  });
  body.appendChild(statGrid);

  const chartStack = document.createElement("div");
  chartStack.className = "chart-stack mt-3";
  (statsConfig.charts || []).forEach((chart, index) => {
    const card = templates.chartCard.content.firstElementChild.cloneNode(true);
    if (index > 0) {
      card.classList.add("mt-2");
    }
    const head = card.querySelector("[data-chart-toggle]");
    head.setAttribute("aria-label", `Toggle ${chart.title.toLowerCase()} chart`);
    card.querySelector(".chart-title").textContent = chart.title;
    const live = card.querySelector(".chart-live");
    live.id = chart.liveId;
    live.textContent = chart.liveInitial ?? "0";
    const canvas = card.querySelector("canvas");
    canvas.id = chart.canvasId;
    canvas.setAttribute("aria-label", chart.aria || `${chart.title} trend chart`);
    chartStack.appendChild(card);
  });
  body.appendChild(chartStack);

  return section;
}

function buildSimulationSection(simConfig, appletId, templates) {
  const section = buildSectionShell(simConfig, appletId, templates, {
    toggleAriaLabel: `Toggle ${appletId} simulation controls`,
  });
  const body = section.querySelector("[data-control-section-body]");

  if (simConfig.sliderHub) {
    const hub = document.createElement("div");
    hub.className = "section-slider-hub";
    hub.setAttribute("data-slider-hub", simConfig.sectionKey);
    hub.setAttribute("aria-label", `Active ${appletId} slider`);
    hub.innerHTML = `
      <div class="section-slider-head">
        <span class="section-slider-title" data-section-slider-title>${simConfig.sliderHub.title}</span>
        <span class="section-slider-value" data-section-slider-value>${simConfig.sliderHub.value}</span>
      </div>
      <input
        class="form-range section-active-slider"
        type="range"
        data-section-slider
        min="${simConfig.sliderHub.min}"
        max="${simConfig.sliderHub.max}"
        step="${simConfig.sliderHub.step}"
        value="${simConfig.sliderHub.valueNum}"
      />
    `;
    body.appendChild(hub);
  }

  (simConfig.sliders || []).forEach((slider) => {
    const fragment = templates.sliderRow.content.cloneNode(true);
    const label = fragment.querySelector("label.form-label");
    label.setAttribute("for", slider.id);
    const labelName = label.querySelector(".label-name");
    labelName.innerHTML = `<i class="${slider.icon}" aria-hidden="true"></i>${slider.label}`;
    const value = label.querySelector(".label-value");
    value.id = slider.valueId;
    value.textContent = slider.valueText;

    const input = fragment.querySelector("input.form-range");
    input.id = slider.id;
    input.min = slider.min;
    input.max = slider.max;
    input.step = slider.step;
    input.value = slider.value;
    body.appendChild(fragment);
  });

  const actions = document.createElement("div");
  actions.className = "d-flex gap-2 mt-3 simulation-action-row";
  actions.innerHTML = `
    <button
      class="btn btn-sm btn-theme btn-icon-only"
      id="${simConfig.pauseButtonId}"
      title="Pause simulation"
      aria-label="Pause simulation"
    >
      <i class="bi bi-pause-fill" aria-hidden="true"></i>
    </button>
    <button class="btn btn-sm btn-outline-theme action-fill" id="${simConfig.defaultButtonId}">
      <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
      <span>Default</span>
    </button>
    <button class="btn btn-sm btn-outline-theme action-fill" id="${simConfig.resetButtonId}">
      <i class="bi bi-bootstrap-reboot" aria-hidden="true"></i>
      <span>Reset</span>
    </button>
  `;
  body.appendChild(actions);

  return section;
}

function buildInteractionSection(interactionConfig, appletId, templates) {
  const section = buildSectionShell(interactionConfig, appletId, templates, {
    toggleAriaLabel: `Toggle ${appletId} interaction controls`,
  });
  const body = section.querySelector("[data-control-section-body]");

  if (interactionConfig.sliderHub) {
    const hub = document.createElement("div");
    hub.className = "section-slider-hub";
    hub.setAttribute("data-slider-hub", interactionConfig.sectionKey);
    hub.setAttribute("aria-label", `Active ${appletId} interaction slider`);
    hub.innerHTML = `
      <div class="section-slider-head">
        <span class="section-slider-title" data-section-slider-title>${interactionConfig.sliderHub.title}</span>
        <span class="section-slider-value" data-section-slider-value>${interactionConfig.sliderHub.value}</span>
      </div>
      <input
        class="form-range section-active-slider"
        type="range"
        data-section-slider
        min="${interactionConfig.sliderHub.min}"
        max="${interactionConfig.sliderHub.max}"
        step="${interactionConfig.sliderHub.step}"
        value="${interactionConfig.sliderHub.valueNum}"
      />
    `;
    body.appendChild(hub);
  }

  (interactionConfig.switches || []).forEach((switchConfig, index) => {
    const switchWrap = document.createElement("div");
    switchWrap.className = `form-check form-switch${index > 0 ? " mt-2" : ""}`;

    const input = document.createElement("input");
    input.className = "form-check-input";
    input.type = "checkbox";
    input.setAttribute("role", "switch");
    input.id = switchConfig.id;
    input.checked = Boolean(switchConfig.checked);

    const label = document.createElement("label");
    label.className = "form-check-label";
    label.setAttribute("for", switchConfig.id);
    label.textContent = switchConfig.label || "";

    switchWrap.appendChild(input);
    switchWrap.appendChild(label);
    body.appendChild(switchWrap);
  });

  (interactionConfig.sliders || []).forEach((slider) => {
    const fragment = templates.sliderRow.content.cloneNode(true);
    const label = fragment.querySelector("label.form-label");
    if (slider.className) {
      label.classList.add(...slider.className.split(/\s+/).filter(Boolean));
    }
    label.setAttribute("for", slider.id);
    const labelName = label.querySelector(".label-name");
    labelName.innerHTML = `<i class="${slider.icon}" aria-hidden="true"></i>${slider.label}`;
    const value = label.querySelector(".label-value");
    value.id = slider.valueId;
    value.textContent = slider.valueText;

    const input = fragment.querySelector("input.form-range");
    input.id = slider.id;
    input.min = slider.min;
    input.max = slider.max;
    input.step = slider.step;
    input.value = slider.value;
    body.appendChild(fragment);
  });

  (interactionConfig.notes || []).forEach((note, index) => {
    const p = document.createElement("p");
    p.className = `panel-copy${index === 0 ? " mt-2 mb-0" : " mb-0"}`;
    p.textContent = note;
    body.appendChild(p);
  });

  return section;
}

function buildVisualSection(appletId, visualAdapter, templates) {
  const sectionConfig = {
    sectionKey: `${appletId}-visual`,
    title: "Visual",
    icon: "bi-palette",
    hidden: Boolean(visualAdapter?.section?.hidden),
  };
  const section = buildSectionShell(sectionConfig, appletId, templates, {
    toggleAriaLabel: `Toggle ${appletId} visual controls`,
  });
  const body = section.querySelector("[data-control-section-body]");
  const controls = visualAdapter?.controls || {};
  const meta = visualAdapter?.section || {};
  const colorModeId = controls.colorModeId;
  if (!colorModeId) {
    return section;
  }

  const colorModeLabel = meta.colorModeLabel || "Color Mode";
  const colorModeOptions = Array.isArray(meta.colorModeOptions)
    ? meta.colorModeOptions
    : [];

  const colorLabel = document.createElement("label");
  colorLabel.className = "form-label";
  colorLabel.setAttribute("for", colorModeId);
  colorLabel.innerHTML =
    `<span class="label-name"><i class="bi bi-palette-fill" aria-hidden="true"></i>${colorModeLabel}</span>`;
  body.appendChild(colorLabel);

  const select = document.createElement("select");
  select.className = "form-select form-select-sm theme-select";
  select.id = colorModeId;
  colorModeOptions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.appendChild(option);
  });
  body.appendChild(select);

  const colormapHost = document.createElement("div");
  colormapHost.setAttribute("data-shared-colormap-host", appletId);
  body.appendChild(colormapHost);

  if (controls.solidColorId && controls.solidColorValueId && controls.singleColorWrapId) {
    const wrap = document.createElement("div");
    wrap.id = controls.singleColorWrapId;
    wrap.className = "is-hidden";

    const solidColorLabel = meta.solidColorLabel || "Color";
    const defaultColor = String(meta.solidColorDefault || "#ffffff");
    const normalizedColor = defaultColor.startsWith("#") ? defaultColor : `#${defaultColor}`;

    wrap.innerHTML = `
      <label class="form-label mt-2" for="${controls.solidColorId}">
        <span class="label-name"><i class="bi bi-eyedropper" aria-hidden="true"></i>${solidColorLabel}</span>
        <span class="label-value" id="${controls.solidColorValueId}">${normalizedColor.toUpperCase()}</span>
      </label>
      <input
        type="color"
        class="form-control form-control-color theme-color-input"
        id="${controls.solidColorId}"
        value="${normalizedColor.toLowerCase()}"
      />
    `;
    body.appendChild(wrap);
  }

  return section;
}

function renderSharedRightSections(rightPanel, templates) {
  if (!rightPanel) {
    return;
  }

  const existingCamera = rightPanel.querySelector('[data-control-section="camera"]');
  existingCamera?.remove();

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
