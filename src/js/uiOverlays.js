// Overlay and modal behavior for help, about, share, and screenshot actions.
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
  setupControlsInfoPopup(dom);
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
  if (!openButton || !closeButton || !backdrop) {
    return;
  }

  const open = () => openOverlay(backdrop);
  const close = () => closeOverlay(backdrop);

  openButton.addEventListener("click", open);
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
