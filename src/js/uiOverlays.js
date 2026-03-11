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
  getShowBounds,
  setShowBounds,
}) {
  setupSupportPopup(dom);
  setupControlsInfoPopup(dom);
  setupModelInfoPopup(dom, getActiveApplet);
  setupAboutPopup(dom);
  setupSharePopup(dom);
  setupScreenshotPopup({
    dom,
    renderer,
    scene,
    cameraController,
    getActiveApplet,
    getPaused,
    setPaused,
    onPauseStateChange,
    getShowBounds,
    setShowBounds,
  });
}

function setupSupportPopup(dom) {
  bindDismissibleOverlay({
    openButton: dom.supportInfoOpen,
    closeButton: dom.supportInfoClose,
    backdrop: dom.supportInfoBackdrop,
  });
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

    if (Array.isArray(modelConfig.references) && modelConfig.references.length > 0) {
      const references = document.createElement("section");
      references.className = "equation-card";

      const heading = document.createElement("div");
      heading.className = "equation-card-head";

      const title = document.createElement("h3");
      title.className = "equation-card-title";
      title.textContent = "References";
      heading.appendChild(title);
      references.appendChild(heading);

      const list = document.createElement("ul");
      list.className = "equation-card-list";
      modelConfig.references.forEach((entry) => {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = entry.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = entry.label;
        li.appendChild(link);
        list.appendChild(li);
      });
      references.appendChild(list);
      dom.modelInfoBody.appendChild(references);
    }

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

function setupScreenshotPopup({
  dom,
  renderer,
  scene,
  cameraController,
  getActiveApplet,
  getPaused,
  setPaused,
  onPauseStateChange,
  getShowBounds,
  setShowBounds,
}) {
  if (
    !dom.viewportScreenshotBtn ||
    !dom.screenshotInfoBackdrop ||
    !dom.screenshotInfoClose ||
    !dom.screenshotCapture ||
    !dom.screenshotTransparentBg ||
    !dom.screenshotPreviewImage
  ) {
    return;
  }

  let screenshotInProgress = false;

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

  const updatePreview = async (transparentBackground) => {
    const canvas = renderer?.domElement;
    if (!canvas) {
      return;
    }

    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousShowBounds = typeof getShowBounds === "function" ? getShowBounds() : true;

    try {
      if (transparentBackground) {
        scene.background = null;
        scene.fog = null;
        renderer.setClearAlpha(0);
        setShowBounds?.(false);
      }

      renderer.render(scene, cameraController.getActiveCamera());
      dom.screenshotPreviewImage.src = canvas.toDataURL("image/png");
      setMeta(`Resolution: ${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} px`);
    } finally {
      if (transparentBackground) {
        scene.background = previousBackground;
        scene.fog = previousFog;
        renderer.setClearAlpha(previousClearAlpha);
        setShowBounds?.(previousShowBounds);
        renderer.render(scene, cameraController.getActiveCamera());
      }
    }
  };

  const openPopup = () => {
    dom.screenshotTransparentBg.checked = false;
    setStatus("Transparent mode exports without the scene background or boundary box.");
    updatePreview(false);
    openOverlay(dom.screenshotInfoBackdrop);
  };

  const closePopup = () => closeOverlay(dom.screenshotInfoBackdrop);

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

  dom.viewportScreenshotBtn.addEventListener("click", openPopup);
  dom.screenshotInfoClose.addEventListener("click", closePopup);
  dom.screenshotTransparentBg.addEventListener("change", () => {
    const enabled = dom.screenshotTransparentBg.checked;
    setStatus(
      enabled
        ? "Transparent mode exports without the scene background or boundary box."
        : "Standard mode keeps the normal scene background and boundary box.",
    );
    updatePreview(enabled);
  });
  dom.screenshotInfoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.screenshotInfoBackdrop) {
      closePopup();
    }
  });
  bindEscapeToOverlay(dom.screenshotInfoBackdrop, closePopup);

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

      const previousBackground = scene.background;
      const previousFog = scene.fog;
      const previousClearAlpha = renderer.getClearAlpha();
      const previousShowBounds = typeof getShowBounds === "function" ? getShowBounds() : true;
      if (transparentBackground) {
        scene.background = null;
        scene.fog = null;
        renderer.setClearAlpha(0);
        setShowBounds?.(false);
      }

      renderer.render(scene, cameraController.getActiveCamera());

      const filename = getFilename();
      try {
        let blob = await canvasToBlob(canvas);
        if (!blob) {
          const dataUrl = canvas.toDataURL("image/png");
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
      } finally {
        if (transparentBackground) {
          scene.background = previousBackground;
          scene.fog = previousFog;
          renderer.setClearAlpha(previousClearAlpha);
          setShowBounds?.(previousShowBounds);
          renderer.render(scene, cameraController.getActiveCamera());
        }
      }
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
