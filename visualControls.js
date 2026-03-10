export function createVisualControls({
  params,
  dom,
  boidSimulation,
  antSimulation,
  updateBoidColormapLegend,
}) {
  const updateBoidVisibility = () => {
    const useSingleColor = params.colorMode === "none";
    dom.colormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
    dom.singleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
  };

  const updateAntVisibility = () => {
    const useSingleColor = params.antColorMode === "none";
    const useColormap = !useSingleColor && params.antColorMode !== "state";
    dom.antSingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    dom.antColormapControlWrap?.classList.toggle("is-hidden", !useColormap);
  };

  const bind = () => {
    dom.colorMode?.addEventListener("change", () => {
      params.colorMode = dom.colorMode.value;
      updateBoidVisibility();
      boidSimulation.syncInstances();
      updateBoidColormapLegend();
    });

    dom.colormap?.addEventListener("change", () => {
      params.colormap = dom.colormap.value;
      boidSimulation.syncInstances();
      updateBoidColormapLegend();
    });

    dom.solidColor?.addEventListener("input", () => {
      params.solidColor = dom.solidColor.value;
      boidSimulation.syncInstances();
    });

    dom.antColorMode?.addEventListener("change", () => {
      params.antColorMode = dom.antColorMode.value;
      updateAntVisibility();
      antSimulation.syncInstances();
    });

    dom.antColormap?.addEventListener("change", () => {
      params.antColormap = dom.antColormap.value;
      antSimulation.syncInstances();
    });

    dom.antSolidColor?.addEventListener("input", () => {
      params.antSolidColor = dom.antSolidColor.value;
      antSimulation.syncInstances();
    });
  };

  const syncFromParams = () => {
    if (dom.colorMode) {
      dom.colorMode.value = params.colorMode;
    }
    if (dom.colormap) {
      dom.colormap.value = params.colormap;
    }
    if (dom.solidColor) {
      dom.solidColor.value = params.solidColor;
    }

    if (dom.antColorMode) {
      dom.antColorMode.value = params.antColorMode;
    }
    if (dom.antColormap) {
      dom.antColormap.value = params.antColormap;
    }
    if (dom.antSolidColor) {
      dom.antSolidColor.value = params.antSolidColor;
    }

    updateBoidVisibility();
    updateAntVisibility();
    updateBoidColormapLegend();
  };

  return {
    bind,
    syncFromParams,
    updateBoidVisibility,
    updateAntVisibility,
  };
}
