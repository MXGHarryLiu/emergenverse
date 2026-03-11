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
  if (!dom.controlsInfoOpen || !dom.controlsInfoBackdrop || !dom.controlsInfoClose) {
    return;
  }

  const openPopup = () => {
    dom.controlsInfoBackdrop.classList.remove("is-hidden");
    dom.controlsInfoBackdrop.setAttribute("aria-hidden", "false");
  };

  const closePopup = () => {
    dom.controlsInfoBackdrop.classList.add("is-hidden");
    dom.controlsInfoBackdrop.setAttribute("aria-hidden", "true");
  };

  dom.controlsInfoOpen.addEventListener("click", openPopup);
  dom.controlsInfoClose.addEventListener("click", closePopup);

  dom.controlsInfoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.controlsInfoBackdrop) {
      closePopup();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.controlsInfoBackdrop.classList.contains("is-hidden")) {
      closePopup();
    }
  });
}

function setupAboutPopup(dom) {
  if (!dom.aboutInfoOpen || !dom.aboutInfoBackdrop || !dom.aboutInfoClose) {
    return;
  }

  const openPopup = () => {
    dom.aboutInfoBackdrop.classList.remove("is-hidden");
    dom.aboutInfoBackdrop.setAttribute("aria-hidden", "false");
  };

  const closePopup = () => {
    dom.aboutInfoBackdrop.classList.add("is-hidden");
    dom.aboutInfoBackdrop.setAttribute("aria-hidden", "true");
  };

  dom.aboutInfoOpen.addEventListener("click", openPopup);
  dom.aboutInfoClose.addEventListener("click", closePopup);

  dom.aboutInfoBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.aboutInfoBackdrop) {
      closePopup();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.aboutInfoBackdrop.classList.contains("is-hidden")) {
      closePopup();
    }
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
    dom.shareInfoBackdrop.classList.remove("is-hidden");
    dom.shareInfoBackdrop.setAttribute("aria-hidden", "false");
  };

  const closePopup = () => {
    dom.shareInfoBackdrop.classList.add("is-hidden");
    dom.shareInfoBackdrop.setAttribute("aria-hidden", "true");
  };

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

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dom.shareInfoBackdrop.classList.contains("is-hidden")) {
      closePopup();
    }
  });
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
