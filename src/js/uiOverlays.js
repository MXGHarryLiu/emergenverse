// Overlay and modal behavior for help, model equations, about, share, and screenshot actions.
import { APPLET_CONFIGS, APPLET_META } from "./app/appletConfigs.js";

export function setupUiOverlays({
  dom,
  renderer,
  scene,
  cameraController,
  getActiveApplet,
  getPaused,
  setPaused,
  onPauseStateChange,
}) {
  setupSupportPopup(dom);
  setupControlsInfoPopup(dom);
  setupModelInfoPopup(dom, getActiveApplet);
  setupAboutPopup(dom);
  setupSharePopup(dom);
  setupViewportScreenshotButton({
    dom,
    renderer,
    scene,
    cameraController,
    getActiveApplet,
    getPaused,
    setPaused,
    onPauseStateChange,
  });
}

function setupSupportPopup(dom) {
  bindDismissibleOverlay({
    openButton: dom.supportInfoOpen,
    closeButton: dom.supportInfoClose,
    backdrop: dom.supportInfoBackdrop,
  });

  if (!dom.supportInfoOpen) {
    return;
  }

  dom.supportInfoOpen.classList.add("nav-callout-active");
  window.setTimeout(() => {
    dom.supportInfoOpen?.classList.remove("nav-callout-active");
  }, 4200);
}

function setupModelInfoPopup(dom, getActiveApplet) {
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

  const renderModelContent = (appletId) => {
    const modelConfig = APPLET_CONFIGS[appletId]?.left?.model;
    const appletLabel = APPLET_META[appletId]?.label ?? "Applet";
    dom.modelInfoTitle.textContent = `${appletLabel} Model Equations`;
    dom.modelInfoBody.innerHTML = "";

    if (!modelConfig?.items?.length) {
      const empty = document.createElement("p");
      empty.className = "panel-copy mb-0";
      empty.textContent = "No model equations are configured for this applet.";
      dom.modelInfoBody.appendChild(empty);
      return;
    }

    if (modelConfig.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "controls-modal-subtitle";
      subtitle.textContent = modelConfig.subtitle;
      dom.modelInfoBody.appendChild(subtitle);
    }

    modelConfig.items.forEach((item, index) => {
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
    });

    renderMath();
  };

  document.querySelectorAll("[data-model-info-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const appletId = button.getAttribute("data-model-info-open") || getActiveApplet();
      renderModelContent(appletId);
      openOverlay(dom.modelInfoBackdrop);
    });
  });

  bindDismissibleOverlay({
    closeButton: dom.modelInfoClose,
    backdrop: dom.modelInfoBackdrop,
  });
}

function setupControlsInfoPopup(dom) {
  bindDismissibleOverlay({
    openButton: dom.controlsInfoOpen,
    closeButton: dom.controlsInfoClose,
    backdrop: dom.controlsInfoBackdrop,
  });
}

function setupAboutPopup(dom) {
  bindDismissibleOverlay({
    openButton: dom.aboutInfoOpen,
    closeButton: dom.aboutInfoClose,
    backdrop: dom.aboutInfoBackdrop,
  });
}

function setupSharePopup(dom) {
  if (
    !dom.shareInfoOpen ||
    !dom.shareInfoClose ||
    !dom.shareInfoBackdrop ||
    !dom.shareLinkInput ||
    !dom.shareLinkCopy
  ) {
    return;
  }

  const getShareUrl = () => window.location.href;

  const setStatus = (message) => {
    if (dom.shareCopyStatus) {
      dom.shareCopyStatus.textContent = message;
    }
  };

  const openPopup = () => {
    dom.shareLinkInput.value = getShareUrl();
    setStatus("Copy link to share the current app and URL state.");
    openOverlay(dom.shareInfoBackdrop);
  };

  const closePopup = () => closeOverlay(dom.shareInfoBackdrop);

  dom.shareInfoOpen.addEventListener("click", openPopup);
  dom.shareInfoClose.addEventListener("click", closePopup);

  dom.shareInfoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.shareInfoBackdrop) {
      closePopup();
    }
  });

  dom.shareLinkCopy.addEventListener("click", async () => {
    const shareText = dom.shareLinkInput.value || getShareUrl();
    let copied = false;

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(shareText);
        copied = true;
      } catch (error) {
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

  bindEscapeToOverlay(dom.shareInfoBackdrop, closePopup);
}

function bindDismissibleOverlay({ openButton, closeButton, backdrop }) {
  if (!closeButton || !backdrop) {
    return;
  }

  const open = () => openOverlay(backdrop);
  const close = () => closeOverlay(backdrop);

  openButton?.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });
  bindEscapeToOverlay(backdrop, close);
}

function bindEscapeToOverlay(backdrop, onClose) {
  if (!backdrop || typeof onClose !== "function") {
    return;
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.classList.contains("is-hidden")) {
      onClose();
    }
  });
}

function openOverlay(backdrop) {
  backdrop?.classList.remove("is-hidden");
  backdrop?.setAttribute("aria-hidden", "false");
}

function closeOverlay(backdrop) {
  backdrop?.classList.add("is-hidden");
  backdrop?.setAttribute("aria-hidden", "true");
}

function setupViewportScreenshotButton({
  dom,
  renderer,
  scene,
  cameraController,
  getActiveApplet,
  getPaused,
  setPaused,
  onPauseStateChange,
}) {
  if (!dom.viewportScreenshotBtn) {
    return;
  }

  let screenshotInProgress = false;

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

  const waitNextFrame = () =>
    new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
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

  dom.viewportScreenshotBtn.addEventListener("click", async () => {
    if (screenshotInProgress) {
      return;
    }

    screenshotInProgress = true;
    dom.viewportScreenshotBtn.disabled = true;

    const supportsPicker =
      typeof window.showSaveFilePicker === "function" && window.isSecureContext;
    const wasPausedBeforeScreenshot = getPaused();
    const shouldTemporarilyPause = !wasPausedBeforeScreenshot;
    if (shouldTemporarilyPause) {
      setPaused(true);
      onPauseStateChange();
      await waitNextFrame();
    }

    try {
      const canvas = renderer?.domElement;
      if (!canvas) {
        return;
      }

      renderer.render(scene, cameraController.getActiveCamera());

      const filename = getFilename();
      let blob = await canvasToBlob(canvas);
      if (!blob) {
        const dataUrl = canvas.toDataURL("image/png");
        triggerDownload(dataUrl, filename);
        return;
      }

      if (await saveWithPicker(blob, filename)) {
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } finally {
      if (shouldTemporarilyPause) {
        setPaused(false);
        onPauseStateChange();
      }
      screenshotInProgress = false;
      dom.viewportScreenshotBtn.disabled = false;
    }
  });
}
