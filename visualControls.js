export function createVisualControls({
  params,
  dom,
  boidSimulation,
  antSimulation,
  preySimulation,
  updateBoidColormapLegend,
  updatePreyColormapLegend,
}) {
  const antDiscreteColormapOptions = [
    { value: "paired", label: "Paired" },
    { value: "set1", label: "Set1" },
    { value: "set2", label: "Set2" },
    { value: "dark2", label: "Dark2" },
    { value: "tableau10", label: "Tableau10" },
  ];
  const antContinuousColormapOptions = [
    { value: "turbo", label: "Turbo" },
    { value: "viridis", label: "Viridis" },
    { value: "plasma", label: "Plasma" },
    { value: "magma", label: "Magma" },
    { value: "inferno", label: "Inferno" },
    { value: "cividis", label: "Cividis" },
    { value: "coolwarm", label: "Coolwarm" },
    { value: "greys", label: "Greys" },
  ];
  const antDiscreteLegendGradients = {
    paired: "linear-gradient(90deg, #a6cee3 0%, #a6cee3 50%, #1f78b4 50%, #1f78b4 100%)",
    set1: "linear-gradient(90deg, #e41a1c 0%, #e41a1c 50%, #377eb8 50%, #377eb8 100%)",
    set2: "linear-gradient(90deg, #66c2a5 0%, #66c2a5 50%, #fc8d62 50%, #fc8d62 100%)",
    dark2: "linear-gradient(90deg, #1b9e77 0%, #1b9e77 50%, #d95f02 50%, #d95f02 100%)",
    tableau10: "linear-gradient(90deg, #4e79a7 0%, #4e79a7 50%, #f28e2b 50%, #f28e2b 100%)",
  };
  const antColormapGradients = {
    turbo: "linear-gradient(90deg, #30123b 0%, #4145ab 12.5%, #4685f4 25%, #39c6c5 37.5%, #77df6e 50%, #b8de29 62.5%, #f9ba38 75%, #ee6a24 87.5%, #c91f16 100%)",
    viridis: "linear-gradient(90deg, #440154 0%, #482878 11%, #3e4a89 22%, #31688e 33%, #26828e 44%, #1f9e89 55%, #35b779 66%, #6ece58 77%, #b5de2b 88%, #fee825 100%)",
    plasma: "linear-gradient(90deg, #0d0887 0%, #5b02a3 14%, #9a179b 28%, #cb4679 42%, #ed7953 57%, #fb9f3a 71%, #fdca26 85%, #f0f921 100%)",
    magma: "linear-gradient(90deg, #000004 0%, #180f3d 11%, #440f76 22%, #721f81 33%, #9f2f7f 44%, #cd4071 55%, #f1605d 66%, #fd9668 77%, #fec98d 88%, #fcfdbf 100%)",
    inferno: "linear-gradient(90deg, #000004 0%, #1b0c41 11%, #4a0c6b 22%, #781c6d 33%, #a52c60 44%, #cf4446 55%, #ed6925 66%, #fb9b06 77%, #f7d13d 88%, #fcffa4 100%)",
    cividis: "linear-gradient(90deg, #00204d 0%, #213f6f 12.5%, #3f5f7f 25%, #5d7f87 37.5%, #7a9f8a 50%, #99bf88 62.5%, #b9dd7f 75%, #dbf06a 87.5%, #fff44f 100%)",
    coolwarm: "linear-gradient(90deg, #3b4cc0 0%, #688aef 12.5%, #98b9ff 25%, #c9d7f0 37.5%, #ece5dc 50%, #f7c7a6 62.5%, #ee8468 75%, #d34b44 87.5%, #b40426 100%)",
    greys: "linear-gradient(90deg, #111111 0%, #3a3a3a 16%, #5f5f5f 32%, #878787 48%, #afafaf 64%, #d3d3d3 82%, #f2f2f2 100%)",
  };

  const updateAntColormapLegend = () => {
    if (!dom.antColormapLegendBar || !dom.antColormapCmin || !dom.antColormapCmax) {
      return;
    }

    const showLegend = params.antColorMode === "heading" || params.antColorMode === "state";
    dom.antColormapLegend?.classList.toggle("is-hidden", !showLegend);
    if (!showLegend) {
      return;
    }

    let gradient = antColormapGradients[params.antColormap] || antColormapGradients.turbo;
    if (params.antColorMode === "state") {
      gradient = antDiscreteLegendGradients[params.antColormap] || antDiscreteLegendGradients.paired;
      dom.antColormapCmin.textContent = "searching";
      dom.antColormapCmax.textContent = "carrying";
      dom.antColormapLegendBar.style.background = gradient;
      return;
    }

    dom.antColormapLegendBar.style.background = gradient;
    dom.antColormapCmin.textContent = "cmin: -180°";
    dom.antColormapCmax.textContent = "cmax: 180°";
  };

  const rebuildAntColormapOptions = () => {
    if (!dom.antColormap) {
      return;
    }

    const targetOptions =
      params.antColorMode === "state" ? antDiscreteColormapOptions : antContinuousColormapOptions;
    const validValues = new Set(targetOptions.map((item) => item.value));
    if (!validValues.has(params.antColormap)) {
      params.antColormap = targetOptions[0].value;
    }

    const currentValues = Array.from(dom.antColormap.options).map((opt) => opt.value);
    const nextValues = targetOptions.map((item) => item.value);
    const requiresRebuild =
      currentValues.length !== nextValues.length ||
      currentValues.some((value, index) => value !== nextValues[index]);

    if (requiresRebuild) {
      dom.antColormap.innerHTML = "";
      targetOptions.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        dom.antColormap.appendChild(option);
      });
    }

    dom.antColormap.value = params.antColormap;
  };

  const updateBoidVisibility = () => {
    const useSingleColor = params.colorMode === "none";
    dom.colormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
    dom.singleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
  };

  const updateAntVisibility = () => {
    const useSingleColor = params.antColorMode === "none";
    const showColormapSelector = !useSingleColor;
    rebuildAntColormapOptions();
    dom.antSingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    dom.antColormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
    dom.antColormap?.classList.toggle("is-hidden", !showColormapSelector);
    updateAntColormapLegend();
  };

  const updatePreyVisibility = () => {
    const useSingleColor = params.preyColorMode === "none";
    dom.preySingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    dom.preyColormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
    updatePreyColormapLegend?.();
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
      updateAntColormapLegend();
    });

    dom.antColormap?.addEventListener("change", () => {
      params.antColormap = dom.antColormap.value;
      antSimulation.syncInstances();
      updateAntColormapLegend();
    });

    dom.antSolidColor?.addEventListener("input", () => {
      params.antSolidColor = dom.antSolidColor.value;
      antSimulation.syncInstances();
    });

    dom.preyColorMode?.addEventListener("change", () => {
      params.preyColorMode = dom.preyColorMode.value;
      updatePreyVisibility();
      preySimulation.syncInstances();
      updatePreyColormapLegend?.();
    });

    dom.preyColormap?.addEventListener("change", () => {
      params.preyColormap = dom.preyColormap.value;
      preySimulation.syncInstances();
      updatePreyColormapLegend?.();
    });

    dom.preySolidColor?.addEventListener("input", () => {
      params.preySolidColor = dom.preySolidColor.value;
      preySimulation.syncInstances();
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

    if (dom.preyColorMode) {
      dom.preyColorMode.value = params.preyColorMode;
    }
    if (dom.preyColormap) {
      dom.preyColormap.value = params.preyColormap;
    }
    if (dom.preySolidColor) {
      dom.preySolidColor.value = params.preySolidColor;
    }

    updateBoidVisibility();
    updateAntVisibility();
    updatePreyVisibility();
    updateBoidColormapLegend();
    updateAntColormapLegend();
    updatePreyColormapLegend?.();
  };

  return {
    bind,
    syncFromParams,
    updateBoidVisibility,
    updateAntVisibility,
    updatePreyVisibility,
  };
}
