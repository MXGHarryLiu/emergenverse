// Overlay and modal behavior for help, model equations, about, share, export, and screenshot actions.
import { APPLET_CONFIGS } from "./app/appletConfigs.js";
import { SITE_VERSION } from "./version.js";

// Module state
const escapeOverlayBindings = [];
let escapeOverlayListenerAttached = false;

// Shared copy
const SCREENSHOT_STATUS_TRANSPARENT =
  "Transparent mode exports without the scene background or boundary box.";
const SCREENSHOT_STATUS_STANDARD =
  "Standard mode keeps the normal scene background and boundary box.";
const SCREENSHOT_STATUS_OVERLAY =
  "Overlay mode includes orientation marker and status label; viewport tool buttons remain hidden.";
const SHARE_STATUS_DEFAULT = "Copy link to share the current app and URL state.";
const EXPORT_STATUS_DEFAULT = "Download current parameters as a JSON file.";
const MODAL_OPEN_CLASS = "modal-open";

// Public API
export function setupUiOverlays({
  dom,
  renderer,
  scene,
  cameraController,
  getActiveApplet,
  getPaused,
  setPaused,
  onPauseStateChange,
  getExportData,
}) {
  const popupPauseController = createPopupPauseController({
    getPaused,
    setPaused,
    onPauseStateChange,
  });

  setupSupportPopup(dom, popupPauseController);
  setupControlsInfoPopup(dom, popupPauseController);
  setupModelInfoPopup(dom, getActiveApplet, popupPauseController);
  setupAboutPopup(dom, popupPauseController);
  setupTutorialOverlay(dom, popupPauseController);
  setupSharePopup(dom, getActiveApplet, popupPauseController);
  setupExportPopup(dom, getActiveApplet, getExportData, popupPauseController);
  setupScreenshotPopup({
    dom,
    renderer,
    scene,
    cameraController,
    getActiveApplet,
    getPaused,
    setPaused,
    onPauseStateChange,
    popupPauseController,
  });
}

function createPopupPauseController({ getPaused, setPaused, onPauseStateChange }) {
  const openBackdrops = new Set();
  let openCount = 0;
  let resumeWhenAllClosed = false;

  const applyPauseState = (nextPaused) => {
    if (typeof setPaused === "function") {
      setPaused(Boolean(nextPaused));
    }
    if (typeof onPauseStateChange === "function") {
      onPauseStateChange();
    }
  };

  return {
    onPopupOpen(backdrop) {
      if (!backdrop || openBackdrops.has(backdrop)) {
        return;
      }
      if (openCount === 0) {
        const wasPaused = typeof getPaused === "function" ? Boolean(getPaused()) : true;
        resumeWhenAllClosed = !wasPaused;
        if (!wasPaused) {
          applyPauseState(true);
        }
      }
      openBackdrops.add(backdrop);
      openCount += 1;
    },
    onPopupClose(backdrop) {
      if (!backdrop || !openBackdrops.has(backdrop)) {
        return;
      }
      openBackdrops.delete(backdrop);
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0 && resumeWhenAllClosed) {
        applyPauseState(false);
      }
      if (openCount === 0) {
        resumeWhenAllClosed = false;
      }
    },
  };
}
// Generic overlay helpers
function bindDismissibleOverlay({ openButton, closeButton, backdrop, onOpen, onClose }) {
  if (!closeButton || !backdrop) {
    return;
  }

  const open = () => {
    if (typeof onOpen === "function") {
      onOpen();
    }
    openOverlay(backdrop);
  };

  const close = () => {
    closeOverlay(backdrop);
    if (typeof onClose === "function") {
      onClose();
    }
  };

  openButton?.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  bindBackdropToClose(backdrop, close);
  bindEscapeToOverlay(backdrop, close);
}

function bindBackdropToClose(backdrop, onClose) {
  backdrop?.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      onClose();
    }
  });
}

function bindEscapeToOverlay(backdrop, onClose) {
  if (!backdrop || typeof onClose !== "function") {
    return;
  }

  const existing = escapeOverlayBindings.find((entry) => entry.backdrop === backdrop);
  if (existing) {
    existing.onClose = onClose;
  } else {
    escapeOverlayBindings.push({ backdrop, onClose });
  }

  if (!escapeOverlayListenerAttached) {
    window.addEventListener("keydown", handleEscapeOverlayKeydown);
    escapeOverlayListenerAttached = true;
  }
}

function handleEscapeOverlayKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  for (let index = escapeOverlayBindings.length - 1; index >= 0; index -= 1) {
    const { backdrop, onClose } = escapeOverlayBindings[index];
    if (!backdrop.classList.contains("is-hidden")) {
      onClose();
      return;
    }
  }
}

function openOverlay(backdrop) {
  backdrop?.classList.remove("is-hidden");
  backdrop?.setAttribute("aria-hidden", "false");
  syncModalOpenState();
}

function closeOverlay(backdrop) {
  backdrop?.classList.add("is-hidden");
  backdrop?.setAttribute("aria-hidden", "true");
  syncModalOpenState();
}

function syncModalOpenState() {
  const body = document.body;
  if (!body) {
    return;
  }
  const hasOpenModal = Array.from(
    document.querySelectorAll(".controls-modal-backdrop:not(.tutorial-overlay)"),
  )
    .some((backdrop) => !backdrop.classList.contains("is-hidden"));
  body.classList.toggle(MODAL_OPEN_CLASS, hasOpenModal);
}

// Basic popups
function setupSupportPopup(dom, popupPauseController) {
  bindDismissibleOverlay({
    openButton: dom.supportInfoOpen,
    closeButton: dom.supportInfoClose,
    backdrop: dom.supportInfoBackdrop,
    onOpen: () => popupPauseController?.onPopupOpen(dom.supportInfoBackdrop),
    onClose: () => popupPauseController?.onPopupClose(dom.supportInfoBackdrop),
  });
}

function setupControlsInfoPopup(dom, popupPauseController) {
  bindDismissibleOverlay({
    openButton: dom.controlsInfoOpen,
    closeButton: dom.controlsInfoClose,
    backdrop: dom.controlsInfoBackdrop,
    onOpen: () => popupPauseController?.onPopupOpen(dom.controlsInfoBackdrop),
    onClose: () => popupPauseController?.onPopupClose(dom.controlsInfoBackdrop),
  });
}

function setupAboutPopup(dom, popupPauseController) {
  const aboutVersionValue = document.getElementById("about-version-value");
  if (aboutVersionValue) {
    aboutVersionValue.textContent = String(SITE_VERSION || "--");
  }

  bindDismissibleOverlay({
    openButton: dom.aboutInfoOpen,
    closeButton: dom.aboutInfoClose,
    backdrop: dom.aboutInfoBackdrop,
    onOpen: () => popupPauseController?.onPopupOpen(dom.aboutInfoBackdrop),
    onClose: () => popupPauseController?.onPopupClose(dom.aboutInfoBackdrop),
  });
}

function setupTutorialOverlay(dom, popupPauseController) {
  if (
    !dom?.tutorialOverlay ||
    !dom?.tutorialStartGuided ||
    !dom?.tutorialBody ||
    !dom?.tutorialCounter ||
    !dom?.tutorialPrev ||
    !dom?.tutorialNext ||
    !dom?.tutorialClose
  ) {
    return;
  }

  const card = dom.tutorialOverlay.querySelector(".tutorial-card");
  const tutorialMasks = {
    top: dom.tutorialOverlay.querySelector('[data-tutorial-mask="top"]'),
    left: dom.tutorialOverlay.querySelector('[data-tutorial-mask="left"]'),
    right: dom.tutorialOverlay.querySelector('[data-tutorial-mask="right"]'),
    bottom: dom.tutorialOverlay.querySelector('[data-tutorial-mask="bottom"]'),
  };
  if (!card) {
    return;
  }

  const steps = [
    {
      id: "viewport",
      targetSelector: "#scene-host",
      title: "3D Viewport",
      placement: "bottom",
      message:
        '<p>This is the <strong>3D viewport</strong> where each simulation runs.</p>' +
        '<p class="mt-2">Use <strong>keyboard / mouse / touch</strong> to move and inspect the scene from different angles.</p>' +
        '<p class="mt-2">The <strong>orientation marker</strong> in the lower-left corner helps track camera direction.</p>',
    },
    {
      id: "viewport-tools",
      targetSelector: ".viewport-tools",
      title: "Viewport Tool Buttons",
      placement: "left",
      message:
        '<p>This top-right button cluster gives quick tools while you stay in the viewport.</p>' +
        '<p class="mt-2"><i class="bi bi-joystick me-1" aria-hidden="true"></i><strong>Control Help</strong> opens the control help dialog.</p>' +
        '<p class="mt-2"><i class="bi bi-camera-fill me-1" aria-hidden="true"></i>' +
        '<strong>Screenshot</strong> captures the current viewport.</p>',
    },
    {
      id: "info-panel",
      targetSelector: "#left-panel",
      title: "Introduction And Live Stats",
      placement: "right",
      message:
        '<p>The <strong>Introduction</strong> section explains the active model and gives quick context.</p>' +
        '<p class="mt-2">Use <strong>Open Model Equations</strong> to inspect the formal equations for the applet.</p>' +
        '<p class="mt-2"><strong>Stats</strong> shows live metrics and charts that update while the simulation runs.</p>',
    },
    {
      id: "controls-panel",
      targetSelector: "#controls-panel",
      title: "Control Panel",
      placement: "left",
      getMessage: () => {
        const describeSection = (title) => {
          const key = String(title || "").toLowerCase();
          if (key.includes("simulation")) {
            return "Core model parameters and runtime behavior controls.";
          }
          if (key.includes("camera")) {
            return "View projection, movement speed, and camera interaction settings.";
          }
          if (key.includes("world")) {
            return "Simulation space size and boundary condition settings.";
          }
          if (key.includes("visual")) {
            return "Rendering style, sizing, and appearance options.";
          }
          if (key.includes("boundary")) {
            return "Simulation domain size and world limit settings.";
          }
          if (key.includes("interaction")) {
            return "Lets you interrupt and directly interact with agents.";
          }
          if (key.includes("environment")) {
            return "External field and environmental behavior controls.";
          }
          return "Additional controls specific to this simulation.";
        };

        const sectionTitles = Array.from(
          document.querySelectorAll("#controls-panel [data-control-section]"),
        )
          .map((section) => {
            if (!(section instanceof HTMLElement)) {
              return "";
            }
            const generatedTitle = section.querySelector("[data-section-title-text]");
            if (generatedTitle?.textContent?.trim()) {
              return generatedTitle.textContent.trim();
            }
            const staticTitle = section.querySelector(".section-toggle-title span:last-child");
            if (staticTitle?.textContent?.trim()) {
              return staticTitle.textContent.trim();
            }
            return "";
          })
          .filter(Boolean);

        const uniqueTitles = [...new Set(sectionTitles)];
        const listMarkup = uniqueTitles.length > 0
          ? `<ul class="mt-2 mb-0">${uniqueTitles
            .map((title) => `<li><strong>${title}</strong>: ${describeSection(title)}</li>`)
            .join("")}</ul>`
          : '<p class="mt-2 mb-0">Use the section headers to expand/collapse control groups.</p>';

        return (
          "<p>The <strong>Control Panel</strong> is organized into sections. This step covers all sections currently shown for the active app:</p>" +
          listMarkup +
          '<p class="mt-2">Scroll through the full panel and use each section header to expand/collapse details while tuning parameters.</p>'
        );
      },
    },
  ];

  let currentStepIndex = 0;
  let tutorialOpen = false;
  const layoutSnapshot = {
    forcedForViewport: false,
    panelStateAdjusted: false,
    leftWasVisible: false,
    rightWasVisible: false,
  };

  const getOverlapArea = (a, b) => {
    if (!a || !b) {
      return 0;
    }
    const overlapW = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapH = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return overlapW * overlapH;
  };

  const panelBlocksViewport = (panelElement, viewportRect, threshold = 0.75) => {
    if (
      !(panelElement instanceof HTMLElement) ||
      panelElement.classList.contains("is-hidden") ||
      !viewportRect
    ) {
      return false;
    }
    const panelRect = panelElement.getBoundingClientRect();
    const viewportArea = Math.max(1, viewportRect.width * viewportRect.height);
    const overlapArea = getOverlapArea(panelRect, viewportRect);
    return overlapArea / viewportArea >= threshold;
  };

  const clearFocusedElement = () => {};

  const setMaskRect = (target) => {
    const masks = tutorialMasks;
    if (!masks.top || !masks.left || !masks.right || !masks.bottom) {
      return;
    }

    const vw = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const vh = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const rect = target?.getBoundingClientRect?.() ?? null;
    const hasRect = Boolean(rect && rect.width > 1 && rect.height > 1);

    if (!hasRect) {
      masks.top.style.left = "0px";
      masks.top.style.top = "0px";
      masks.top.style.width = `${vw}px`;
      masks.top.style.height = `${vh}px`;
      masks.left.style.width = "0px";
      masks.left.style.height = "0px";
      masks.right.style.width = "0px";
      masks.right.style.height = "0px";
      masks.bottom.style.width = "0px";
      masks.bottom.style.height = "0px";
      return;
    }

    const pad = 8;
    const left = Math.max(0, Math.min(vw, Math.floor(rect.left - pad)));
    const top = Math.max(0, Math.min(vh, Math.floor(rect.top - pad)));
    const right = Math.max(0, Math.min(vw, Math.ceil(rect.right + pad)));
    const bottom = Math.max(0, Math.min(vh, Math.ceil(rect.bottom + pad)));
    const holeWidth = Math.max(0, right - left);
    const holeHeight = Math.max(0, bottom - top);

    masks.top.style.left = "0px";
    masks.top.style.top = "0px";
    masks.top.style.width = `${vw}px`;
    masks.top.style.height = `${top}px`;

    masks.left.style.left = "0px";
    masks.left.style.top = `${top}px`;
    masks.left.style.width = `${left}px`;
    masks.left.style.height = `${holeHeight}px`;

    masks.right.style.left = `${right}px`;
    masks.right.style.top = `${top}px`;
    masks.right.style.width = `${Math.max(0, vw - right)}px`;
    masks.right.style.height = `${holeHeight}px`;

    masks.bottom.style.left = "0px";
    masks.bottom.style.top = `${bottom}px`;
    masks.bottom.style.width = `${vw}px`;
    masks.bottom.style.height = `${Math.max(0, vh - bottom)}px`;
  };

  const focusElement = (element) => {
    if (!(element instanceof HTMLElement)) {
      setMaskRect(null);
      return;
    }
    setMaskRect(element);
  };

  const getLayoutMode = () => {
    if (document.body.classList.contains("layout-mobile")) {
      return "mobile";
    }
    if (document.body.classList.contains("layout-middle")) {
      return "middle";
    }
    return "desktop";
  };

  const resolveStepPlacement = (step = null) => {
    const layoutMode = getLayoutMode();
    const stepId = String(step?.id || "");
    const isInfoStep = stepId === "info-panel";
    const isViewportStep = stepId === "viewport";
    const isViewportToolsStep = stepId === "viewport-tools";

    if (layoutMode === "mobile") {
      return "bottom-fixed";
    }

    if (isInfoStep) {
      return layoutMode === "middle" ? "left-fixed" : "right-fixed";
    }

    if (isViewportStep || isViewportToolsStep) {
      return "left-fixed";
    }

    return step?.placement || "bottom";
  };

  const positionCardNearTarget = (target, step = null) => {
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const cardRect = card.getBoundingClientRect();
    const cardWidth = Math.min(cardRect.width || 360, viewportWidth - margin * 2);
    const cardHeight = cardRect.height || 220;
    const targetRect = target?.getBoundingClientRect?.() ?? null;
    const placement = resolveStepPlacement(step);

    let left = Math.max(margin, Math.round((viewportWidth - cardWidth) * 0.5));
    let top = Math.max(margin, Math.round((viewportHeight - cardHeight) * 0.5));

    if (placement === "bottom-fixed") {
      left = Math.round((viewportWidth - cardWidth) * 0.5);
      top = viewportHeight - cardHeight - margin;
      left = Math.max(margin, Math.min(viewportWidth - cardWidth - margin, left));
      top = Math.max(margin, Math.min(viewportHeight - cardHeight - margin, top));
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
      return;
    }

    if (placement === "left-fixed") {
      left = margin;
      top = Math.round((viewportHeight - cardHeight) * 0.5);
      left = Math.max(margin, Math.min(viewportWidth - cardWidth - margin, left));
      top = Math.max(margin, Math.min(viewportHeight - cardHeight - margin, top));
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
      return;
    }

    if (placement === "right-fixed") {
      left = viewportWidth - cardWidth - margin;
      top = Math.round((viewportHeight - cardHeight) * 0.5);
      left = Math.max(margin, Math.min(viewportWidth - cardWidth - margin, left));
      top = Math.max(margin, Math.min(viewportHeight - cardHeight - margin, top));
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
      return;
    }

    if (targetRect && targetRect.width > 1 && targetRect.height > 1) {
      const candidateBottom = {
        left: targetRect.left + Math.min(24, targetRect.width * 0.1),
        top: targetRect.bottom + margin,
      };
      const candidateTop = {
        left: targetRect.left + Math.min(24, targetRect.width * 0.1),
        top: targetRect.top - cardHeight - margin,
      };
      const candidateRight = {
        left: targetRect.right + margin,
        top: targetRect.top,
      };
      const candidateLeft = {
        left: targetRect.left - cardWidth - margin,
        top: targetRect.top,
      };

      const chooseCandidate = (...candidates) => {
        for (const candidate of candidates) {
          const fitsHorizontally =
            candidate.left >= margin && candidate.left + cardWidth <= viewportWidth - margin;
          const fitsVertically =
            candidate.top >= margin && candidate.top + cardHeight <= viewportHeight - margin;
          if (fitsHorizontally && fitsVertically) {
            return candidate;
          }
        }
        return candidates[0];
      };

      if (placement === "right") {
        ({ left, top } = chooseCandidate(candidateRight, candidateBottom, candidateTop, candidateLeft));
      } else if (placement === "left") {
        ({ left, top } = chooseCandidate(candidateLeft, candidateBottom, candidateTop, candidateRight));
      } else if (placement === "top") {
        ({ left, top } = chooseCandidate(candidateTop, candidateBottom, candidateRight, candidateLeft));
      } else {
        ({ left, top } = chooseCandidate(candidateBottom, candidateTop, candidateRight, candidateLeft));
      }
    } else {
      left = (viewportWidth - cardWidth) * 0.5;
      top = (viewportHeight - cardHeight) * 0.5;
    }

    left = Math.max(margin, Math.min(viewportWidth - cardWidth - margin, left));
    top = Math.max(margin, Math.min(viewportHeight - cardHeight - margin, top));

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  };

  const renderStep = () => {
    const total = steps.length;
    const step = steps[currentStepIndex];
    const stepId = String(step?.id || "");
    if (layoutSnapshot.forcedForViewport) {
      if (stepId === "viewport" || stepId === "viewport-tools") {
        if (dom.leftPanel && !dom.leftPanel.classList.contains("is-hidden")) {
          dom.hideLeftPanel?.click();
          layoutSnapshot.panelStateAdjusted = true;
        }
        if (dom.rightPanel && !dom.rightPanel.classList.contains("is-hidden")) {
          dom.hideRightPanel?.click();
          layoutSnapshot.panelStateAdjusted = true;
        }
      } else if (stepId === "info-panel") {
        if (dom.leftPanel?.classList.contains("is-hidden")) {
          dom.showLeftPanel?.click();
          layoutSnapshot.panelStateAdjusted = true;
        }
        if (dom.rightPanel && !dom.rightPanel.classList.contains("is-hidden")) {
          dom.hideRightPanel?.click();
          layoutSnapshot.panelStateAdjusted = true;
        }
      } else if (stepId === "controls-panel") {
        if (dom.rightPanel?.classList.contains("is-hidden")) {
          dom.showRightPanel?.click();
          layoutSnapshot.panelStateAdjusted = true;
        }
        if (dom.leftPanel && !dom.leftPanel.classList.contains("is-hidden")) {
          dom.hideLeftPanel?.click();
          layoutSnapshot.panelStateAdjusted = true;
        }
      }
    } else {
      if (stepId === "info-panel" && dom.leftPanel?.classList.contains("is-hidden")) {
        dom.showLeftPanel?.click();
        layoutSnapshot.panelStateAdjusted = true;
      }
      if (stepId === "controls-panel" && dom.rightPanel?.classList.contains("is-hidden")) {
        dom.showRightPanel?.click();
        layoutSnapshot.panelStateAdjusted = true;
      }
    }

    const target = step?.targetSelector ? document.querySelector(step.targetSelector) : null;

    const stepMessage = typeof step?.getMessage === "function"
      ? step.getMessage()
      : step?.message || "";
    dom.tutorialBody.innerHTML = `
      <div class="tutorial-step-title">${step?.title || "Tutorial"}</div>
      ${stepMessage}
    `;
    dom.tutorialCounter.textContent = `${currentStepIndex + 1} / ${total}`;
    dom.tutorialPrev.disabled = currentStepIndex === 0;
    const isLastStep = currentStepIndex >= total - 1;
    dom.tutorialNext.innerHTML = isLastStep
      ? '<i class="bi bi-check-lg" aria-hidden="true"></i>'
      : '<i class="bi bi-arrow-right" aria-hidden="true"></i>';
    dom.tutorialNext.setAttribute("title", isLastStep ? "Finish tutorial" : "Next step");
    dom.tutorialNext.setAttribute("aria-label", isLastStep ? "Finish tutorial" : "Next step");

    focusElement(target);
    positionCardNearTarget(target, step);
  };

  const closeTutorial = () => {
    if (!tutorialOpen) {
      return;
    }
    clearFocusedElement();
    setMaskRect(null);
    closeOverlay(dom.tutorialOverlay);
    popupPauseController?.onPopupClose(dom.tutorialOverlay);
    if (layoutSnapshot.forcedForViewport || layoutSnapshot.panelStateAdjusted) {
      const leftVisibleNow = Boolean(dom.leftPanel && !dom.leftPanel.classList.contains("is-hidden"));
      const rightVisibleNow = Boolean(dom.rightPanel && !dom.rightPanel.classList.contains("is-hidden"));
      if (layoutSnapshot.leftWasVisible && !leftVisibleNow) {
        dom.showLeftPanel?.click();
      }
      if (!layoutSnapshot.leftWasVisible && leftVisibleNow) {
        dom.hideLeftPanel?.click();
      }
      if (layoutSnapshot.rightWasVisible && !rightVisibleNow) {
        dom.showRightPanel?.click();
      }
      if (!layoutSnapshot.rightWasVisible && rightVisibleNow) {
        dom.hideRightPanel?.click();
      }
      layoutSnapshot.forcedForViewport = false;
      layoutSnapshot.panelStateAdjusted = false;
    }
    tutorialOpen = false;
  };

  const openTutorial = () => {
    if (tutorialOpen) {
      return;
    }

    if (dom.aboutInfoBackdrop && !dom.aboutInfoBackdrop.classList.contains("is-hidden")) {
      closeOverlay(dom.aboutInfoBackdrop);
      popupPauseController?.onPopupClose(dom.aboutInfoBackdrop);
    }

    layoutSnapshot.leftWasVisible = Boolean(dom.leftPanel && !dom.leftPanel.classList.contains("is-hidden"));
    layoutSnapshot.rightWasVisible = Boolean(dom.rightPanel && !dom.rightPanel.classList.contains("is-hidden"));
    layoutSnapshot.panelStateAdjusted = false;
    const viewportRect = dom.sceneHost?.getBoundingClientRect?.() ?? null;
    const leftBlocksViewport = panelBlocksViewport(dom.leftPanel, viewportRect);
    const rightBlocksViewport = panelBlocksViewport(dom.rightPanel, viewportRect);
    layoutSnapshot.forcedForViewport = leftBlocksViewport || rightBlocksViewport;
    if (layoutSnapshot.forcedForViewport) {
      if (dom.leftPanel && !dom.leftPanel.classList.contains("is-hidden")) {
        dom.hideLeftPanel?.click();
      }
      if (dom.rightPanel && !dom.rightPanel.classList.contains("is-hidden")) {
        dom.hideRightPanel?.click();
      }
    }

    currentStepIndex = 0;
    tutorialOpen = true;
    popupPauseController?.onPopupOpen(dom.tutorialOverlay);
    openOverlay(dom.tutorialOverlay);
    renderStep();
  };

  dom.tutorialStartGuided.addEventListener("click", openTutorial);
  dom.tutorialClose.addEventListener("click", closeTutorial);

  dom.tutorialPrev.addEventListener("click", () => {
    if (currentStepIndex <= 0) {
      return;
    }
    currentStepIndex -= 1;
    renderStep();
  });

  dom.tutorialNext.addEventListener("click", () => {
    if (currentStepIndex >= steps.length - 1) {
      closeTutorial();
      return;
    }
    currentStepIndex += 1;
    renderStep();
  });

  bindBackdropToClose(dom.tutorialOverlay, closeTutorial);
  bindEscapeToOverlay(dom.tutorialOverlay, closeTutorial);
  window.addEventListener("resize", () => {
    if (tutorialOpen) {
      renderStep();
    }
  });
}

// Model equations popup
function setupModelInfoPopup(dom, getActiveApplet, popupPauseController) {
  if (!dom.modelInfoBackdrop || !dom.modelInfoClose || !dom.modelInfoTitle || !dom.modelInfoBody) {
    return;
  }

  const renderMath = () => {
    if (typeof window.renderMathInElement !== "function") {
      return;
    }
    window.renderMathInElement(dom.modelInfoBody, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\(", right: "\\)", display: false },
      ],
      throwOnError: false,
    });
  };

  const renderEmptyMessage = () => {
    const empty = document.createElement("p");
    empty.className = "panel-copy mb-0";
    empty.textContent = "No model equations are configured for this applet.";
    dom.modelInfoBody.appendChild(empty);
  };

  const appendModelSubtitle = (modelConfig) => {
    if (!modelConfig.subtitle) {
      return;
    }
    const subtitle = document.createElement("p");
    subtitle.className = "controls-modal-subtitle";
    subtitle.textContent = modelConfig.subtitle;
    dom.modelInfoBody.appendChild(subtitle);
  };

  const appendEquationCard = (item, index) => {
    const card = document.createElement("section");
    card.className = "equation-card";

    const heading = document.createElement("div");
    heading.className = "equation-card-head";

    const indexLabel = document.createElement("span");
    indexLabel.className = "equation-card-index";
    indexLabel.textContent = `Eq. ${index + 1}`;
    heading.appendChild(indexLabel);

    const title = document.createElement("h3");
    title.className = "equation-card-title";
    title.textContent = item.title || `Equation ${index + 1}`;
    heading.appendChild(title);
    card.appendChild(heading);

    if (item.equation) {
      const equation = document.createElement("div");
      equation.className = "equation-card-math";
      equation.textContent = item.equation;
      card.appendChild(equation);
    }

    if (item.explanation) {
      const explanation = document.createElement("p");
      explanation.className = "equation-card-copy";
      explanation.textContent = item.explanation;
      card.appendChild(explanation);
    }

    if (Array.isArray(item.parameters) && item.parameters.length > 0) {
      const list = document.createElement("ul");
      list.className = "equation-card-list";
      item.parameters.forEach((entry) => {
        const li = document.createElement("li");
        li.innerHTML = entry;
        list.appendChild(li);
      });
      card.appendChild(list);
    }

    dom.modelInfoBody.appendChild(card);
  };

  const appendReferenceCard = (modelConfig) => {
    const references = Array.isArray(modelConfig.references) ? modelConfig.references : [];
    const journalArticles = Array.isArray(modelConfig.journalArticles) ? modelConfig.journalArticles : [];
    if (references.length === 0 && journalArticles.length === 0) {
      return;
    }

    const referencesCard = document.createElement("section");
    referencesCard.className = "equation-card";

    const heading = document.createElement("div");
    heading.className = "equation-card-head";

    const title = document.createElement("h3");
    title.className = "equation-card-title";
    title.textContent = "References";
    heading.appendChild(title);
    referencesCard.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "equation-card-list";
    references.forEach((entry) => {
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = entry.label;
      li.appendChild(link);
      list.appendChild(li);
    });

    if (journalArticles.length > 0) {
      const li = document.createElement("li");
      const prefix = document.createElement("span");
      prefix.textContent = "Journal article(s): ";
      li.appendChild(prefix);

      journalArticles.forEach((entry, index) => {
        const link = document.createElement("a");
        link.href = entry.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = entry.title;
        li.appendChild(link);
        if (index < journalArticles.length - 1) {
          li.appendChild(document.createTextNode("; "));
        }
      });

      list.appendChild(li);
    }

    referencesCard.appendChild(list);
    dom.modelInfoBody.appendChild(referencesCard);
  };

  const renderModelContent = (appletId) => {
    const modelConfig = APPLET_CONFIGS[appletId]?.model;
    dom.modelInfoTitle.textContent = "Model Equations";
    dom.modelInfoBody.innerHTML = "";

    if (!modelConfig?.items?.length) {
      renderEmptyMessage();
      return;
    }

    appendModelSubtitle(modelConfig);
    modelConfig.items.forEach((item, index) => appendEquationCard(item, index));
    appendReferenceCard(modelConfig);
    renderMath();
  };

  document.querySelectorAll("[data-model-info-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const appletId = button.getAttribute("data-model-info-open") || getActiveApplet();
      renderModelContent(appletId);
      popupPauseController?.onPopupOpen(dom.modelInfoBackdrop);
      openOverlay(dom.modelInfoBackdrop);
    });
  });

  bindDismissibleOverlay({
    closeButton: dom.modelInfoClose,
    backdrop: dom.modelInfoBackdrop,
    onClose: () => popupPauseController?.onPopupClose(dom.modelInfoBackdrop),
  });
}

// Share popup
function setupSharePopup(dom, getActiveApplet, popupPauseController) {
  if (
    !dom.shareInfoOpen ||
    !dom.shareInfoClose ||
    !dom.shareInfoBackdrop ||
    !dom.shareLinkInput ||
    !dom.shareLinkCopy
  ) {
    return;
  }

  const getShareUrl = () => {
    const url = new URL(window.location.href);
    const activeApplet = typeof getActiveApplet === "function" ? String(getActiveApplet() || "").trim() : "";
    url.search = "";
    if (activeApplet) {
      url.searchParams.set("app", activeApplet);
    }
    return url.toString();
  };

  const setStatus = (message) => {
    if (dom.shareCopyStatus) {
      dom.shareCopyStatus.textContent = message;
    }
  };

  const openPopup = () => {
    dom.shareLinkInput.value = getShareUrl();
    setStatus(SHARE_STATUS_DEFAULT);
    popupPauseController?.onPopupOpen(dom.shareInfoBackdrop);
    openOverlay(dom.shareInfoBackdrop);
  };

  const closePopup = () => {
    closeOverlay(dom.shareInfoBackdrop);
    popupPauseController?.onPopupClose(dom.shareInfoBackdrop);
  };

  dom.shareInfoOpen.addEventListener("click", openPopup);
  dom.shareInfoClose.addEventListener("click", closePopup);
  bindBackdropToClose(dom.shareInfoBackdrop, closePopup);
  bindEscapeToOverlay(dom.shareInfoBackdrop, closePopup);

  dom.shareLinkCopy.addEventListener("click", async () => {
    const shareText = dom.shareLinkInput.value || getShareUrl();
    let copied = false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText);
        copied = true;
      } catch (_error) {
        copied = false;
      }
    }

    if (!copied && typeof document.execCommand === "function") {
      dom.shareLinkInput.focus();
      dom.shareLinkInput.select();
      copied = document.execCommand("copy");
    }

    if (copied) {
      setStatus("Link copied.");
    } else {
      setStatus("Could not copy automatically. Select and copy the URL manually.");
    }
  });
}

// Export popup
function setupExportPopup(dom, getActiveApplet, getExportData, popupPauseController) {
  if (
    !dom.exportInfoOpen ||
    !dom.exportInfoClose ||
    !dom.exportInfoBackdrop ||
    !dom.exportParamsJson
  ) {
    return;
  }

  const setStatus = (message) => {
    if (dom.exportStatus) {
      dom.exportStatus.textContent = message;
    }
  };

  const buildExportPayload = () =>
    typeof getExportData === "function"
      ? getExportData()
      : {
          app: {
            key: typeof getActiveApplet === "function" ? getActiveApplet() : "unknown",
          },
          exportedAt: new Date().toISOString(),
          params: {},
        };

  const getFormattedPreviewText = (payload) => `${JSON.stringify(payload, null, 2)}\n`;

  const renderExportPreview = (text) => {
    if (dom.exportPreviewCode) {
      dom.exportPreviewCode.textContent = text;
    }
    if (dom.exportPreviewLines) {
      const trimmed = text.endsWith("\n") ? text.slice(0, -1) : text;
      const lineCount = Math.max(1, trimmed.split("\n").length);
      const numbers = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");
      dom.exportPreviewLines.textContent = numbers;
    }
    if (dom.exportPreviewCode && dom.exportPreviewLines) {
      dom.exportPreviewLines.scrollTop = dom.exportPreviewCode.scrollTop;
    }
  };

  let latestPreviewPayload = buildExportPayload();
  let latestPreviewText = getFormattedPreviewText(latestPreviewPayload);

  const refreshExportPreview = () => {
    latestPreviewPayload = buildExportPayload();
    latestPreviewText = getFormattedPreviewText(latestPreviewPayload);
    renderExportPreview(latestPreviewText);
  };

  const copyPreviewText = async () => {
    if (!latestPreviewText) {
      refreshExportPreview();
    }

    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(latestPreviewText);
        copied = true;
      } catch (_error) {
        copied = false;
      }
    }

    if (!copied && typeof document.execCommand === "function" && dom.exportPreviewCode) {
      const selection = window.getSelection?.();
      if (selection && typeof document.createRange === "function") {
        const range = document.createRange();
        range.selectNodeContents(dom.exportPreviewCode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      copied = document.execCommand("copy");
      const selectionAfterCopy = window.getSelection?.();
      selectionAfterCopy?.removeAllRanges?.();
    }

    setStatus(copied
      ? "Copied formatted JSON preview."
      : "Could not copy automatically. Select and copy the JSON preview manually.");
  };

  const openPopup = () => {
    refreshExportPreview();
    setStatus(EXPORT_STATUS_DEFAULT);
    popupPauseController?.onPopupOpen(dom.exportInfoBackdrop);
    openOverlay(dom.exportInfoBackdrop);
  };

  const closePopup = () => {
    closeOverlay(dom.exportInfoBackdrop);
    popupPauseController?.onPopupClose(dom.exportInfoBackdrop);
  };

  dom.exportInfoOpen.addEventListener("click", openPopup);
  dom.exportInfoClose.addEventListener("click", closePopup);
  bindBackdropToClose(dom.exportInfoBackdrop, closePopup);
  bindEscapeToOverlay(dom.exportInfoBackdrop, closePopup);
  dom.exportPreviewCopy?.addEventListener("click", copyPreviewText);
  dom.exportPreviewCode?.addEventListener("scroll", () => {
    if (!dom.exportPreviewLines) {
      return;
    }
    dom.exportPreviewLines.scrollTop = dom.exportPreviewCode.scrollTop;
  });

  dom.exportParamsJson.addEventListener("click", async () => {
    try {
      refreshExportPreview();
      const payload = latestPreviewPayload;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const activeApplet = typeof getActiveApplet === "function" ? getActiveApplet() : "applet";
      const filename = `emergenverse-params-${activeApplet || "applet"}-${stamp}.json`;
      const result = await triggerJsonDownload(payload, filename);
      if (result === "cancelled") {
        setStatus("Export cancelled.");
      } else {
        setStatus("Exported parameters JSON.");
      }
    } catch (_error) {
      setStatus("Could not export parameters JSON.");
    }
  });
}

// File export helper
async function triggerJsonDownload(payload, filename) {
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([text], {
    type: "application/json",
  });

  if (typeof window.showSaveFilePicker === "function" && window.isSecureContext) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "JSON File",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error?.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return "saved";
}

// Screenshot popup
function setupScreenshotPopup({
  dom,
  renderer,
  scene,
  cameraController,
  getActiveApplet,
  getPaused,
  setPaused,
  onPauseStateChange,
  popupPauseController,
}) {
  if (
    !dom.viewportScreenshotBtn ||
    !dom.screenshotInfoBackdrop ||
    !dom.screenshotInfoClose ||
    !dom.screenshotCapture ||
    !dom.screenshotTransparentBg ||
    !dom.screenshotIncludeOverlay ||
    !dom.screenshotPreviewImage
  ) {
    return;
  }

  // Screenshot state
  let screenshotInProgress = false;
  let previewScale = 1;
  let previewOffsetX = 0;
  let previewOffsetY = 0;
  let previewPanning = false;
  let previewPanStartX = 0;
  let previewPanStartY = 0;
  let previewPanOriginX = 0;
  let previewPanOriginY = 0;
  let previewTouchPinchActive = false;
  let previewTouchPinchStartDistance = 0;
  let previewTouchPinchStartScale = 1;
  let previewPixelScalePercent = 100;
  const previewTouchPointers = new Map();
  const previewMinScale = 1;
  const previewMaxScale = 6;
  const previewCard = dom.screenshotPreviewImage.closest(".screenshot-preview-card");

  // Screenshot utilities
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const getScreenshotStatusForToggles = (transparentEnabled, includeOverlay) => {
    if (includeOverlay) {
      return SCREENSHOT_STATUS_OVERLAY;
    }
    return transparentEnabled ? SCREENSHOT_STATUS_TRANSPARENT : SCREENSHOT_STATUS_STANDARD;
  };

  const setStatus = (message) => {
    if (dom.screenshotStatus) {
      dom.screenshotStatus.textContent = message;
    }
  };

  const setMeta = (message) => {
    if (dom.screenshotMeta) {
      dom.screenshotMeta.textContent = message;
    }
  };

  const getPreviewPanBounds = () => {
    const width = dom.screenshotPreviewImage.clientWidth || previewCard?.clientWidth || 0;
    const height = dom.screenshotPreviewImage.clientHeight || previewCard?.clientHeight || 0;
    if (width <= 0 || height <= 0 || previewScale <= previewMinScale) {
      return { maxX: 0, maxY: 0 };
    }
    return {
      maxX: ((previewScale - 1) * width) / 2,
      maxY: ((previewScale - 1) * height) / 2,
    };
  };

  const clampPreviewPan = () => {
    const { maxX, maxY } = getPreviewPanBounds();
    previewOffsetX = clamp(previewOffsetX, -maxX, maxX);
    previewOffsetY = clamp(previewOffsetY, -maxY, maxY);
  };

  const updatePreviewZoomBadge = () => {
    const badge = dom.screenshotPreviewZoom;
    if (!badge) {
      return;
    }
    const text = badge.querySelector("span");
    if (text) {
      const effectivePercent = clamp(previewPixelScalePercent * previewScale, 1, 999);
      text.textContent = `${Math.round(effectivePercent)}%`;
    }
  };

  const updatePreviewPixelScale = (width, height) => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const screenWidthPx = Math.max(1, Math.round((window.screen?.width || window.innerWidth || 1) * dpr));
    const screenHeightPx = Math.max(1, Math.round((window.screen?.height || window.innerHeight || 1) * dpr));
    const ratio = Math.min(width / screenWidthPx, height / screenHeightPx);
    previewPixelScalePercent = clamp(ratio * 100, 1, 999);
    updatePreviewZoomBadge();
  };

  const applyPreviewTransform = () => {
    dom.screenshotPreviewImage.style.transform = `translate(${previewOffsetX}px, ${previewOffsetY}px) scale(${previewScale})`;
    if (previewPanning) {
      dom.screenshotPreviewImage.style.cursor = "grabbing";
    } else {
      dom.screenshotPreviewImage.style.cursor = previewScale > previewMinScale ? "grab" : "zoom-in";
    }
    updatePreviewZoomBadge();
  };

  const resetPreviewTransform = () => {
    previewScale = previewMinScale;
    previewOffsetX = 0;
    previewOffsetY = 0;
    applyPreviewTransform();
  };

  const withScreenshotSceneState = async (transparentBackground, task) => {
    const canvas = renderer?.domElement;
    if (!canvas) {
      return null;
    }

    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousClearAlpha = renderer.getClearAlpha();

    try {
      if (transparentBackground) {
        scene.background = null;
        scene.fog = null;
        renderer.setClearAlpha(0);
      }

      renderer.render(scene, cameraController.getActiveCamera());
      return await task(canvas);
    } finally {
      if (transparentBackground) {
        scene.background = previousBackground;
        scene.fog = previousFog;
        renderer.setClearAlpha(previousClearAlpha);
        renderer.render(scene, cameraController.getActiveCamera());
      }
    }
  };

  const drawRoundedRectPath = (ctx, x, y, width, height, radius) => {
    const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const drawOverlayStatusLabel = (ctx, sourceElement, renderRect, scaleX, scaleY) => {
    if (!sourceElement) {
      return;
    }

    const elementRect = sourceElement.getBoundingClientRect();
    if (elementRect.width <= 1 || elementRect.height <= 1) {
      return;
    }

    const x = (elementRect.left - renderRect.left) * scaleX;
    const y = (elementRect.top - renderRect.top) * scaleY;
    const width = elementRect.width * scaleX;
    const height = elementRect.height * scaleY;
    if (width <= 1 || height <= 1) {
      return;
    }

    const style = window.getComputedStyle(sourceElement);
    const radius = Number.parseFloat(style.borderRadius || "0") * ((scaleX + scaleY) * 0.5);
    const borderWidth = Number.parseFloat(style.borderTopWidth || "0") * ((scaleX + scaleY) * 0.5);

    ctx.save();
    drawRoundedRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = style.backgroundColor || "rgba(7, 13, 28, 0.72)";
    ctx.fill();
    if (borderWidth > 0.01) {
      ctx.lineWidth = borderWidth;
      ctx.strokeStyle = style.borderTopColor || "rgba(120, 170, 245, 0.35)";
      ctx.stroke();
    }

    const text = (sourceElement.textContent || "").trim();
    if (text) {
      const fontSizePx = Math.max(10, Number.parseFloat(style.fontSize || "12") * ((scaleX + scaleY) * 0.5));
      const fontWeight = style.fontWeight || "500";
      const fontFamily = style.fontFamily || "Space Grotesk, sans-serif";
      const padLeftPx = Number.parseFloat(style.paddingLeft || "10") * scaleX;
      ctx.fillStyle = style.color || "#d7e7ff";
      ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + padLeftPx, y + height * 0.5);
    }
    ctx.restore();
  };

  const composeScreenshotCanvas = (baseCanvas, includeOverlay) => {
    if (!includeOverlay) {
      return baseCanvas;
    }

    const output = document.createElement("canvas");
    output.width = baseCanvas.width;
    output.height = baseCanvas.height;
    const ctx = output.getContext("2d");
    if (!ctx) {
      return baseCanvas;
    }

    ctx.drawImage(baseCanvas, 0, 0);

    const renderRect = baseCanvas.getBoundingClientRect();
    if (renderRect.width <= 1 || renderRect.height <= 1) {
      return output;
    }

    const scaleX = output.width / renderRect.width;
    const scaleY = output.height / renderRect.height;

    const orientationCanvas = document.getElementById("orientation-indicator");
    if (orientationCanvas instanceof HTMLCanvasElement) {
      const orientationRect = orientationCanvas.getBoundingClientRect();
      if (orientationRect.width > 1 && orientationRect.height > 1) {
        const x = (orientationRect.left - renderRect.left) * scaleX;
        const y = (orientationRect.top - renderRect.top) * scaleY;
        const width = orientationRect.width * scaleX;
        const height = orientationRect.height * scaleY;
        ctx.drawImage(orientationCanvas, x, y, width, height);
      }
    }

    drawOverlayStatusLabel(ctx, document.getElementById("frame-size"), renderRect, scaleX, scaleY);
    return output;
  };

  const updatePreview = async (transparentBackground, includeOverlay) => {
    await withScreenshotSceneState(transparentBackground, async (canvas) => {
      const exportCanvas = composeScreenshotCanvas(canvas, includeOverlay);
      dom.screenshotPreviewImage.src = exportCanvas.toDataURL("image/png");
      setMeta(`Resolution: ${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} px`);
      updatePreviewPixelScale(exportCanvas.width, exportCanvas.height);
    });
  };

  const waitNextFrame = () =>
    new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

  const triggerDownload = (href, filename) => {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const getFilename = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `emergenverse-${getActiveApplet()}-${stamp}.png`;
  };

  const canvasToBlob = (canvas) =>
    new Promise((resolve) => {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } else {
        resolve(null);
      }
    });

  const saveWithPicker = async (blob, filename) => {
    if (typeof window.showSaveFilePicker !== "function" || !window.isSecureContext) {
      return false;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "PNG Image",
            accept: { "image/png": [".png"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error?.name === "AbortError") {
        return true;
      }
      return false;
    }
  };

  // Screenshot popup open and close
  const openPopup = () => {
    popupPauseController?.onPopupOpen(dom.screenshotInfoBackdrop);
    dom.screenshotTransparentBg.checked = false;
    dom.screenshotIncludeOverlay.checked = false;
    setStatus(SCREENSHOT_STATUS_TRANSPARENT);
    resetPreviewTransform();
    updatePreview(false, false);
    openOverlay(dom.screenshotInfoBackdrop);
  };

  const closePopup = () => {
    closeOverlay(dom.screenshotInfoBackdrop);
    popupPauseController?.onPopupClose(dom.screenshotInfoBackdrop);
    resetPreviewTransform();
  };

  // Screenshot preview interactions
  dom.screenshotPreviewImage.addEventListener("load", () => {
    resetPreviewTransform();
  });

  dom.screenshotPreviewImage.addEventListener(
    "wheel",
    (event) => {
      if (!dom.screenshotPreviewImage.src) {
        return;
      }
      event.preventDefault();
      const imageRect = dom.screenshotPreviewImage.getBoundingClientRect();
      if (imageRect.width <= 1 || imageRect.height <= 1) {
        return;
      }

      const zoomStep = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      previewScale = clamp(previewScale * zoomStep, previewMinScale, previewMaxScale);
      clampPreviewPan();
      applyPreviewTransform();
    },
    { passive: false },
  );

  dom.screenshotPreviewImage.addEventListener("pointerdown", (event) => {
    if (!dom.screenshotPreviewImage.src) {
      return;
    }

    if (event.pointerType === "touch") {
      previewTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      dom.screenshotPreviewImage.setPointerCapture(event.pointerId);

      if (previewTouchPointers.size >= 2) {
        const points = Array.from(previewTouchPointers.values());
        previewTouchPinchStartDistance = Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y,
        );
        previewTouchPinchStartScale = previewScale;
        previewTouchPinchActive = previewTouchPinchStartDistance > 0.001;
        previewPanning = false;
      } else if (previewTouchPointers.size === 1) {
        previewTouchPinchActive = false;
        previewPanning = true;
        previewPanStartX = event.clientX;
        previewPanStartY = event.clientY;
        previewPanOriginX = previewOffsetX;
        previewPanOriginY = previewOffsetY;
      }

      applyPreviewTransform();
      event.preventDefault();
      return;
    }

    if (previewScale <= previewMinScale || event.button !== 0) {
      return;
    }
    previewPanning = true;
    previewPanStartX = event.clientX;
    previewPanStartY = event.clientY;
    previewPanOriginX = previewOffsetX;
    previewPanOriginY = previewOffsetY;
    dom.screenshotPreviewImage.setPointerCapture(event.pointerId);
    applyPreviewTransform();
  });

  dom.screenshotPreviewImage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      if (previewTouchPointers.has(event.pointerId)) {
        previewTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (previewTouchPinchActive && previewTouchPointers.size >= 2) {
        const points = Array.from(previewTouchPointers.values());
        const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
        if (previewTouchPinchStartDistance > 0.001) {
          previewScale = clamp(
            previewTouchPinchStartScale * (distance / previewTouchPinchStartDistance),
            previewMinScale,
            previewMaxScale,
          );
          clampPreviewPan();
          applyPreviewTransform();
        }
        event.preventDefault();
        return;
      }

      if (!previewPanning) {
        return;
      }
      previewOffsetX = previewPanOriginX + (event.clientX - previewPanStartX);
      previewOffsetY = previewPanOriginY + (event.clientY - previewPanStartY);
      clampPreviewPan();
      applyPreviewTransform();
      event.preventDefault();
      return;
    }

    if (!previewPanning) {
      return;
    }
    previewOffsetX = previewPanOriginX + (event.clientX - previewPanStartX);
    previewOffsetY = previewPanOriginY + (event.clientY - previewPanStartY);
    clampPreviewPan();
    applyPreviewTransform();
  });

  dom.screenshotPreviewImage.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      previewTouchPointers.delete(event.pointerId);
      if (dom.screenshotPreviewImage.hasPointerCapture?.(event.pointerId)) {
        dom.screenshotPreviewImage.releasePointerCapture(event.pointerId);
      }

      if (previewTouchPointers.size < 2) {
        previewTouchPinchActive = false;
      }

      if (previewTouchPointers.size === 1) {
        const remaining = Array.from(previewTouchPointers.values())[0];
        previewPanning = true;
        previewPanStartX = remaining.x;
        previewPanStartY = remaining.y;
        previewPanOriginX = previewOffsetX;
        previewPanOriginY = previewOffsetY;
      } else {
        previewPanning = false;
      }

      applyPreviewTransform();
      event.preventDefault();
      return;
    }

    if (previewPanning) {
      dom.screenshotPreviewImage.releasePointerCapture(event.pointerId);
      previewPanning = false;
      applyPreviewTransform();
    }
  });

  dom.screenshotPreviewImage.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") {
      previewTouchPointers.delete(event.pointerId);
      previewTouchPinchActive = false;
      previewPanning = false;
      if (dom.screenshotPreviewImage.hasPointerCapture?.(event.pointerId)) {
        dom.screenshotPreviewImage.releasePointerCapture(event.pointerId);
      }
      applyPreviewTransform();
      return;
    }

    if (previewPanning) {
      if (dom.screenshotPreviewImage.hasPointerCapture?.(event.pointerId)) {
        dom.screenshotPreviewImage.releasePointerCapture(event.pointerId);
      }
      previewPanning = false;
      applyPreviewTransform();
    }
  });

  dom.screenshotPreviewImage.addEventListener("pointerleave", () => {
    if (!previewPanning) {
      applyPreviewTransform();
    }
  });

  dom.screenshotPreviewImage.addEventListener("dblclick", (event) => {
    event.preventDefault();
    resetPreviewTransform();
  });

  // Screenshot popup controls
  dom.viewportScreenshotBtn.addEventListener("click", openPopup);
  dom.screenshotInfoClose.addEventListener("click", closePopup);
  bindBackdropToClose(dom.screenshotInfoBackdrop, closePopup);
  bindEscapeToOverlay(dom.screenshotInfoBackdrop, closePopup);
  resetPreviewTransform();

  dom.screenshotTransparentBg.addEventListener("change", () => {
    const transparentEnabled = dom.screenshotTransparentBg.checked;
    const includeOverlay = dom.screenshotIncludeOverlay.checked;
    setStatus(getScreenshotStatusForToggles(transparentEnabled, includeOverlay));
    updatePreview(transparentEnabled, includeOverlay);
  });

  dom.screenshotIncludeOverlay.addEventListener("change", () => {
    const transparentEnabled = dom.screenshotTransparentBg.checked;
    const includeOverlay = dom.screenshotIncludeOverlay.checked;
    setStatus(getScreenshotStatusForToggles(transparentEnabled, includeOverlay));
    updatePreview(transparentEnabled, includeOverlay);
  });

  dom.screenshotCapture.addEventListener("click", async () => {
    if (screenshotInProgress) {
      return;
    }

    screenshotInProgress = true;
    dom.viewportScreenshotBtn.disabled = true;
    dom.screenshotCapture.disabled = true;
    setStatus("Preparing screenshot...");

    const wasPausedBeforeScreenshot = getPaused();
    const shouldTemporarilyPause = !wasPausedBeforeScreenshot;
    const transparentBackground = Boolean(dom.screenshotTransparentBg?.checked);
    const includeOverlay = Boolean(dom.screenshotIncludeOverlay?.checked);
    if (shouldTemporarilyPause) {
      setPaused(true);
      onPauseStateChange();
      await waitNextFrame();
    }

    try {
      const filename = getFilename();
      await withScreenshotSceneState(transparentBackground, async (canvas) => {
        const exportCanvas = composeScreenshotCanvas(canvas, includeOverlay);
        const blob = await canvasToBlob(exportCanvas);

        if (!blob) {
          const dataUrl = exportCanvas.toDataURL("image/png");
          triggerDownload(dataUrl, filename);
          setStatus("Screenshot saved.");
          closePopup();
          return;
        }

        if (await saveWithPicker(blob, filename)) {
          setStatus("Screenshot saved.");
          closePopup();
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, filename);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setStatus("Screenshot saved.");
        closePopup();
      });
    } finally {
      if (shouldTemporarilyPause) {
        setPaused(false);
        onPauseStateChange();
      }
      screenshotInProgress = false;
      dom.viewportScreenshotBtn.disabled = false;
      dom.screenshotCapture.disabled = false;
    }
  });
}
