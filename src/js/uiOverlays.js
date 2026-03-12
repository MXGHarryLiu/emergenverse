// Overlay and modal behavior for help, model equations, about, share, export, and screenshot actions.
import { APPLET_CONFIGS } from "./app/appletConfigs.js";

const escapeOverlayBindings = [];
let escapeOverlayListenerAttached = false;

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
  getExportData,
}) {
  setupSupportPopup(dom);
  setupControlsInfoPopup(dom);
  setupModelInfoPopup(dom, getActiveApplet);
  setupAboutPopup(dom);
  setupSharePopup(dom);
  setupExportPopup(dom, getActiveApplet, getExportData);
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
    dom.modelInfoTitle.textContent = "Model Equations";
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

function setupExportPopup(dom, getActiveApplet, getExportData) {
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

  const openPopup = () => {
    setStatus("Download current parameters as a JSON file.");
    openOverlay(dom.exportInfoBackdrop);
  };

  const closePopup = () => closeOverlay(dom.exportInfoBackdrop);

  dom.exportInfoOpen.addEventListener("click", openPopup);
  dom.exportInfoClose.addEventListener("click", closePopup);

  dom.exportInfoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.exportInfoBackdrop) {
      closePopup();
    }
  });

  bindEscapeToOverlay(dom.exportInfoBackdrop, closePopup);

  dom.exportParamsJson.addEventListener("click", async () => {
    try {
      const payload =
        typeof getExportData === "function"
          ? getExportData()
          : {
              app: "emergenverse",
              exportedAt: new Date().toISOString(),
              activeApplet: typeof getActiveApplet === "function" ? getActiveApplet() : "unknown",
              params: {},
            };
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `emergenverse-params-${payload.activeApplet || "applet"}-${stamp}.json`;
      const result = await triggerJsonDownload(payload, filename);
      if (result === "cancelled") {
        setStatus("Export cancelled.");
      } else {
        setStatus("Exported parameters JSON.");
      }
    } catch (error) {
      setStatus("Could not export parameters JSON.");
    }
  });
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
}

function closeOverlay(backdrop) {
  backdrop?.classList.add("is-hidden");
  backdrop?.setAttribute("aria-hidden", "true");
}

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
      // Fall through to download fallback.
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
  let previewScale = 1;
  const previewMinScale = 1;
  const previewMaxScale = 6;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const applyPreviewTransform = () => {
    dom.screenshotPreviewImage.style.transform = `scale(${previewScale})`;
    dom.screenshotPreviewImage.style.cursor = previewScale > previewMinScale ? "zoom-out" : "zoom-in";
  };

  const resetPreviewTransform = () => {
    previewScale = previewMinScale;
    dom.screenshotPreviewImage.style.transformOrigin = "50% 50%";
    applyPreviewTransform();
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

  const withScreenshotSceneState = async (transparentBackground, task) => {
    const canvas = renderer?.domElement;
    if (!canvas) {
      return null;
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
      return await task(canvas);
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

  const updatePreview = async (transparentBackground) => {
    await withScreenshotSceneState(transparentBackground, async (canvas) => {
      dom.screenshotPreviewImage.src = canvas.toDataURL("image/png");
      setMeta(`Resolution: ${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} px`);
    });
  };

  const openPopup = () => {
    dom.screenshotTransparentBg.checked = false;
    setStatus("Transparent mode exports without the scene background or boundary box.");
    resetPreviewTransform();
    updatePreview(false);
    openOverlay(dom.screenshotInfoBackdrop);
  };

  const closePopup = () => {
    closeOverlay(dom.screenshotInfoBackdrop);
    resetPreviewTransform();
  };

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

      const originX = clamp(((event.clientX - imageRect.left) / imageRect.width) * 100, 0, 100);
      const originY = clamp(((event.clientY - imageRect.top) / imageRect.height) * 100, 0, 100);
      dom.screenshotPreviewImage.style.transformOrigin = `${originX}% ${originY}%`;

      const zoomStep = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      previewScale = clamp(previewScale * zoomStep, previewMinScale, previewMaxScale);
      applyPreviewTransform();
    },
    { passive: false },
  );
  dom.screenshotPreviewImage.addEventListener("dblclick", (event) => {
    event.preventDefault();
    resetPreviewTransform();
  });
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
  resetPreviewTransform();

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
      const filename = getFilename();
      await withScreenshotSceneState(transparentBackground, async (canvas) => {
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
