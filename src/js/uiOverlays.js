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

  let screenshotInProgress = false;
  let popupPausedByScreenshotDialog = false;
  let previewScale = 1;
  let previewOffsetX = 0;
  let previewOffsetY = 0;
  let previewPanning = false;
  let previewPanStartX = 0;
  let previewPanStartY = 0;
  let previewPanOriginX = 0;
  let previewPanOriginY = 0;
  let previewPixelScalePercent = 100;
  const previewMinScale = 1;
  const previewMaxScale = 6;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const previewCard = dom.screenshotPreviewImage.closest(".screenshot-preview-card");

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

  const openPopup = () => {
    popupPausedByScreenshotDialog = false;
    if (!getPaused()) {
      setPaused(true);
      onPauseStateChange();
      popupPausedByScreenshotDialog = true;
    }
    dom.screenshotTransparentBg.checked = false;
    dom.screenshotIncludeOverlay.checked = false;
    setStatus("Transparent mode exports without the scene background or boundary box.");
    resetPreviewTransform();
    updatePreview(false, false);
    openOverlay(dom.screenshotInfoBackdrop);
  };

  const closePopup = () => {
    closeOverlay(dom.screenshotInfoBackdrop);
    if (popupPausedByScreenshotDialog) {
      setPaused(false);
      onPauseStateChange();
    }
    popupPausedByScreenshotDialog = false;
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

      const zoomStep = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      previewScale = clamp(previewScale * zoomStep, previewMinScale, previewMaxScale);
      clampPreviewPan();
      applyPreviewTransform();
    },
    { passive: false },
  );
  dom.screenshotPreviewImage.addEventListener("pointerdown", (event) => {
    if (!dom.screenshotPreviewImage.src || previewScale <= previewMinScale || event.button !== 0) {
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
    if (!previewPanning) {
      return;
    }
    previewOffsetX = previewPanOriginX + (event.clientX - previewPanStartX);
    previewOffsetY = previewPanOriginY + (event.clientY - previewPanStartY);
    clampPreviewPan();
    applyPreviewTransform();
  });
  dom.screenshotPreviewImage.addEventListener("pointerup", (event) => {
    if (previewPanning) {
      dom.screenshotPreviewImage.releasePointerCapture(event.pointerId);
      previewPanning = false;
      applyPreviewTransform();
    }
  });
  dom.screenshotPreviewImage.addEventListener("pointercancel", (event) => {
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
  dom.screenshotTransparentBg.addEventListener("change", () => {
    const transparentEnabled = dom.screenshotTransparentBg.checked;
    const includeOverlay = dom.screenshotIncludeOverlay.checked;
    setStatus(
      transparentEnabled
        ? "Transparent mode exports without the scene background or boundary box."
        : "Standard mode keeps the normal scene background and boundary box.",
    );
    updatePreview(transparentEnabled, includeOverlay);
  });
  dom.screenshotIncludeOverlay.addEventListener("change", () => {
    const transparentEnabled = dom.screenshotTransparentBg.checked;
    const includeOverlay = dom.screenshotIncludeOverlay.checked;
    if (includeOverlay) {
      setStatus("Overlay mode includes orientation marker and status label; viewport tool buttons remain hidden.");
    } else {
      setStatus(
        transparentEnabled
          ? "Transparent mode exports without the scene background or boundary box."
          : "Standard mode keeps the normal scene background and boundary box.",
      );
    }
    updatePreview(transparentEnabled, includeOverlay);
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
        let blob = await canvasToBlob(exportCanvas);
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
