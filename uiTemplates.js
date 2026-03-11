import { APPLET_CONFIGS, APPLET_ORDER } from "./appletConfigs.js";

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

  removeLegacyAppletSections();

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
      leftFragment.appendChild(buildIntroSection(config.left.intro, appletId, templates));
    }
    if (config.left?.stats) {
      leftFragment.appendChild(buildStatsSection(config.left.stats, appletId, templates));
    }
    if (config.right?.simulation) {
      rightFragment.appendChild(buildSimulationSection(config.right.simulation, appletId, templates));
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

function removeLegacyAppletSections() {
  const keys = [];
  APPLET_ORDER.forEach((appletId) => {
    const config = APPLET_CONFIGS[appletId];
    if (config?.left?.intro?.sectionKey) {
      keys.push(config.left.intro.sectionKey);
    }
    if (config?.left?.stats?.sectionKey) {
      keys.push(config.left.stats.sectionKey);
    }
    if (config?.right?.simulation?.sectionKey) {
      keys.push(config.right.simulation.sectionKey);
    }
  });

  keys.forEach((sectionKey) => {
    const node = document.querySelector(`[data-control-section="${sectionKey}"]`);
    if (node) {
      node.remove();
    }
  });
}

function buildSectionShell(sectionConfig, appletId, templates, options = {}) {
  const section = templates.section.content.firstElementChild.cloneNode(true);
  section.setAttribute("data-control-section", sectionConfig.sectionKey);
  section.setAttribute("data-app-visible", appletId);
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

function buildIntroSection(introConfig, appletId, templates) {
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

  if (Array.isArray(introConfig.equations) && introConfig.equations.length > 0) {
    const modelBox = document.createElement("div");
    modelBox.className = "model-box mt-3";
    modelBox.innerHTML = '<h3 class="tips-title">Model Equations</h3><div class="math-block"></div>';
    const mathBlock = modelBox.querySelector(".math-block");
    introConfig.equations.forEach((line) => {
      const lineEl = document.createElement("div");
      lineEl.className = "math-line";
      lineEl.textContent = line;
      mathBlock.appendChild(lineEl);
    });
    body.appendChild(modelBox);
  }

  if (Array.isArray(introConfig.mapping) && introConfig.mapping.length > 0) {
    const tipsBox = document.createElement("div");
    tipsBox.className = "tips-box mt-4";
    tipsBox.innerHTML = '<h3 class="tips-title">Parameter Mapping</h3><ul class="tips-list"></ul>';
    const ul = tipsBox.querySelector(".tips-list");
    introConfig.mapping.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = item;
      ul.appendChild(li);
    });
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
    <button class="btn btn-sm btn-theme flex-fill" id="${simConfig.pauseButtonId}">
      <i class="bi bi-pause-fill me-1" aria-hidden="true"></i>
      <span>Pause</span>
    </button>
    <button class="btn btn-sm btn-outline-theme flex-fill" id="${simConfig.defaultButtonId}">Default</button>
    <button class="btn btn-sm btn-outline-theme flex-fill" id="${simConfig.resetButtonId}">Reset</button>
  `;
  body.appendChild(actions);

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
