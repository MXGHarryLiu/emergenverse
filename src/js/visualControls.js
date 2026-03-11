// Visual styling controls for boid, ant, prey, and firefly rendering modes.
export function createVisualControls({
  params,
  boidSimulation,
  antSimulation,
  preySimulation,
  fireflySimulation,
  updateBoidColormapLegend,
  updatePreyColormapLegend,
}) {
  const dom = getVisualControlsDom();
  const boidParams = params.boid;
  const antParams = params.ants;
  const preyParams = params.prey;
  const fireflyParams = params.firefly;
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
  const fireflyDiscreteColormapOptions = [
    { value: "blue-yellow", label: "Blue-Yellow" },
    { value: "paired", label: "Paired" },
    { value: "set1", label: "Set1" },
    { value: "set2", label: "Set2" },
    { value: "dark2", label: "Dark2" },
    { value: "tableau10", label: "Tableau10" },
  ];
  const fireflyContinuousColormapOptions = [
    { value: "turbo", label: "Turbo" },
    { value: "viridis", label: "Viridis" },
    { value: "plasma", label: "Plasma" },
    { value: "magma", label: "Magma" },
    { value: "inferno", label: "Inferno" },
    { value: "cividis", label: "Cividis" },
    { value: "coolwarm", label: "Coolwarm" },
    { value: "greys", label: "Greys" },
  ];
  const fireflyDiscreteLegendGradients = {
    "blue-yellow": "linear-gradient(90deg, #4f7dff 0%, #4f7dff 50%, #ffd74a 50%, #ffd74a 100%)",
    paired: "linear-gradient(90deg, #a6cee3 0%, #a6cee3 50%, #1f78b4 50%, #1f78b4 100%)",
    set1: "linear-gradient(90deg, #e41a1c 0%, #e41a1c 50%, #377eb8 50%, #377eb8 100%)",
    set2: "linear-gradient(90deg, #66c2a5 0%, #66c2a5 50%, #fc8d62 50%, #fc8d62 100%)",
    dark2: "linear-gradient(90deg, #1b9e77 0%, #1b9e77 50%, #d95f02 50%, #d95f02 100%)",
    tableau10: "linear-gradient(90deg, #4e79a7 0%, #4e79a7 50%, #f28e2b 50%, #f28e2b 100%)",
  };
  const fireflyColormapGradients = {
    turbo: "linear-gradient(90deg, #30123b 0%, #4145ab 12.5%, #4685f4 25%, #39c6c5 37.5%, #77df6e 50%, #b8de29 62.5%, #f9ba38 75%, #ee6a24 87.5%, #c91f16 100%)",
    viridis: "linear-gradient(90deg, #440154 0%, #482878 11%, #3e4a89 22%, #31688e 33%, #26828e 44%, #1f9e89 55%, #35b779 66%, #6ece58 77%, #b5de2b 88%, #fee825 100%)",
    plasma: "linear-gradient(90deg, #0d0887 0%, #5b02a3 14%, #9a179b 28%, #cb4679 42%, #ed7953 57%, #fb9f3a 71%, #fdca26 85%, #f0f921 100%)",
    magma: "linear-gradient(90deg, #000004 0%, #180f3d 11%, #440f76 22%, #721f81 33%, #9f2f7f 44%, #cd4071 55%, #f1605d 66%, #fd9668 77%, #fec98d 88%, #fcfdbf 100%)",
    inferno: "linear-gradient(90deg, #000004 0%, #1b0c41 11%, #4a0c6b 22%, #781c6d 33%, #a52c60 44%, #cf4446 55%, #ed6925 66%, #fb9b06 77%, #f7d13d 88%, #fcffa4 100%)",
    cividis: "linear-gradient(90deg, #00204d 0%, #213f6f 12.5%, #3f5f7f 25%, #5d7f87 37.5%, #7a9f8a 50%, #99bf88 62.5%, #b9dd7f 75%, #dbf06a 87.5%, #fff44f 100%)",
    coolwarm: "linear-gradient(90deg, #3b4cc0 0%, #688aef 12.5%, #98b9ff 25%, #c9d7f0 37.5%, #ece5dc 50%, #f7c7a6 62.5%, #ee8468 75%, #d34b44 87.5%, #b40426 100%)",
    greys: "linear-gradient(90deg, #111111 0%, #3a3a3a 16%, #5f5f5f 32%, #878787 48%, #afafaf 64%, #d3d3d3 82%, #f2f2f2 100%)",
  };
  const legendControls = {
    ant: {
      ...dom.legendControls.ant,
      options: {
        discrete: antDiscreteColormapOptions,
        continuous: antContinuousColormapOptions,
      },
      gradients: {
        discrete: antDiscreteLegendGradients,
        continuous: antColormapGradients,
      },
    },
    firefly: {
      ...dom.legendControls.firefly,
      options: {
        discrete: fireflyDiscreteColormapOptions,
        continuous: fireflyContinuousColormapOptions,
      },
      gradients: {
        discrete: fireflyDiscreteLegendGradients,
        continuous: fireflyColormapGradients,
      },
    },
  };

  function updateLegendDisplay(legendDom, { isVisible, gradient, minText, maxText }) {
    if (!legendDom?.bar || !legendDom.cmin || !legendDom.cmax) {
      return;
    }

    legendDom.container?.classList.toggle("is-hidden", !isVisible);
    if (!isVisible) {
      return;
    }

    legendDom.bar.style.background = gradient;
    legendDom.cmin.textContent = minText;
    legendDom.cmax.textContent = maxText;
  }

  function rebuildColormapOptions(control, selectedValue, useDiscrete) {
    const select = control?.select;
    if (!select) {
      return selectedValue;
    }

    const targetOptions = useDiscrete ? control.options.discrete : control.options.continuous;
    const validValues = new Set(targetOptions.map((item) => item.value));
    const nextValue = validValues.has(selectedValue) ? selectedValue : targetOptions[0].value;
    const currentValues = Array.from(select.options).map((opt) => opt.value);
    const nextValues = targetOptions.map((item) => item.value);
    const requiresRebuild =
      currentValues.length !== nextValues.length ||
      currentValues.some((value, index) => value !== nextValues[index]);

    if (requiresRebuild) {
      select.innerHTML = "";
      targetOptions.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });
    }

    select.value = nextValue;
    return nextValue;
  }

  const updateAntColormapLegend = () => {
    const control = legendControls.ant;
    const showLegend = antParams.colorMode === "heading" || antParams.colorMode === "state";
    let gradient = control.gradients.continuous[antParams.colormap] || control.gradients.continuous.turbo;
    if (antParams.colorMode === "state") {
      gradient = control.gradients.discrete[antParams.colormap] || control.gradients.discrete.paired;
      updateLegendDisplay(control.legend, {
        isVisible: showLegend,
        gradient,
        minText: "searching",
        maxText: "carrying",
      });
      return;
    }

    updateLegendDisplay(control.legend, {
      isVisible: showLegend,
      gradient,
      minText: "cmin: -180°",
      maxText: "cmax: 180°",
    });
  };

  const rebuildAntColormapOptions = () => {
    antParams.colormap = rebuildColormapOptions(
      legendControls.ant,
      antParams.colormap,
      antParams.colorMode === "state",
    );
  };

  const updateFireflyColormapLegend = () => {
    const control = legendControls.firefly;
    if (fireflyParams.colorMode === "blink") {
      const gradient =
        control.gradients.discrete[fireflyParams.colormap] || control.gradients.discrete["blue-yellow"];
      updateLegendDisplay(control.legend, {
        isVisible: true,
        gradient,
        minText: "idle",
        maxText: "blink",
      });
      return;
    }

    const gradient =
      control.gradients.continuous[fireflyParams.colormap] || control.gradients.continuous.turbo;
    const range = fireflySimulation?.getFrequencyRange?.() ?? {
      min: Math.max(0, (fireflyParams.frequencyHz ?? 1.8) - (fireflyParams.freqJitterHz ?? 0.2)),
      max: (fireflyParams.frequencyHz ?? 1.8) + (fireflyParams.freqJitterHz ?? 0.2),
    };
    updateLegendDisplay(control.legend, {
      isVisible: true,
      gradient,
      minText: `cmin: ${Number(range.min).toFixed(2)} Hz`,
      maxText: `cmax: ${Number(range.max).toFixed(2)} Hz`,
    });
  };

  const rebuildFireflyColormapOptions = () => {
    fireflyParams.colormap = rebuildColormapOptions(
      legendControls.firefly,
      fireflyParams.colormap,
      fireflyParams.colorMode === "blink",
    );
  };

  const updateBoidVisibility = () => {
    const useSingleColor = boidParams.colorMode === "none";
    dom.colormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
    dom.singleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
  };

  const updateAntVisibility = () => {
    const useSingleColor = antParams.colorMode === "none";
    const showColormapSelector = !useSingleColor;
    rebuildAntColormapOptions();
    legendControls.ant.singleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    legendControls.ant.controlWrap?.classList.toggle("is-hidden", useSingleColor);
    legendControls.ant.select?.classList.toggle("is-hidden", !showColormapSelector);
    updateAntColormapLegend();
  };

  const updatePreyVisibility = () => {
    const useSingleColor = preyParams.colorMode === "none";
    dom.preySingleColorWrap?.classList.toggle("is-hidden", !useSingleColor);
    dom.preyColormapControlWrap?.classList.toggle("is-hidden", useSingleColor);
    updatePreyColormapLegend?.();
  };
  const updateFireflyVisibility = () => {
    rebuildFireflyColormapOptions();
    updateFireflyColormapLegend();
  };

  const bind = () => {
    dom.colorMode?.addEventListener("change", () => {
      boidParams.colorMode = dom.colorMode.value;
      updateBoidVisibility();
      boidSimulation.syncInstances();
      updateBoidColormapLegend();
    });

    dom.colormap?.addEventListener("change", () => {
      boidParams.colormap = dom.colormap.value;
      boidSimulation.syncInstances();
      updateBoidColormapLegend();
    });

    dom.solidColor?.addEventListener("input", () => {
      boidParams.solidColor = dom.solidColor.value;
      boidSimulation.syncInstances();
    });

    dom.antColorMode?.addEventListener("change", () => {
      antParams.colorMode = dom.antColorMode.value;
      updateAntVisibility();
      antSimulation.syncInstances();
      updateAntColormapLegend();
    });

    legendControls.ant.select?.addEventListener("change", () => {
      antParams.colormap = legendControls.ant.select.value;
      antSimulation.syncInstances();
      updateAntColormapLegend();
    });

    dom.antSolidColor?.addEventListener("input", () => {
      antParams.solidColor = dom.antSolidColor.value;
      antSimulation.syncInstances();
    });

    dom.preyColorMode?.addEventListener("change", () => {
      preyParams.colorMode = dom.preyColorMode.value;
      updatePreyVisibility();
      preySimulation.syncInstances();
      updatePreyColormapLegend?.();
    });

    dom.preyColormap?.addEventListener("change", () => {
      preyParams.colormap = dom.preyColormap.value;
      preySimulation.syncInstances();
      updatePreyColormapLegend?.();
    });

    dom.preySolidColor?.addEventListener("input", () => {
      preyParams.solidColor = dom.preySolidColor.value;
      preySimulation.syncInstances();
    });

    dom.fireflyColorMode?.addEventListener("change", () => {
      fireflyParams.colorMode = dom.fireflyColorMode.value;
      updateFireflyVisibility();
      fireflySimulation.syncInstances();
      updateFireflyColormapLegend();
    });

    legendControls.firefly.select?.addEventListener("change", () => {
      fireflyParams.colormap = legendControls.firefly.select.value;
      fireflySimulation.syncInstances();
      updateFireflyColormapLegend();
    });
  };

  const syncFromParams = () => {
    if (dom.colorMode) {
      dom.colorMode.value = boidParams.colorMode;
    }
    if (dom.colormap) {
      dom.colormap.value = boidParams.colormap;
    }
    if (dom.solidColor) {
      dom.solidColor.value = boidParams.solidColor;
    }

    if (dom.antColorMode) {
      dom.antColorMode.value = antParams.colorMode;
    }
    if (legendControls.ant.select) {
      legendControls.ant.select.value = antParams.colormap;
    }
    if (dom.antSolidColor) {
      dom.antSolidColor.value = antParams.solidColor;
    }

    if (dom.preyColorMode) {
      dom.preyColorMode.value = preyParams.colorMode;
    }
    if (dom.preyColormap) {
      dom.preyColormap.value = preyParams.colormap;
    }
    if (dom.preySolidColor) {
      dom.preySolidColor.value = preyParams.solidColor;
    }
    if (dom.fireflyColorMode) {
      dom.fireflyColorMode.value = fireflyParams.colorMode;
    }
    if (legendControls.firefly.select) {
      legendControls.firefly.select.value = fireflyParams.colormap;
    }

    updateBoidVisibility();
    updateAntVisibility();
    updatePreyVisibility();
    updateFireflyVisibility();
    updateBoidColormapLegend();
    updateAntColormapLegend();
    updatePreyColormapLegend?.();
    updateFireflyColormapLegend();
  };

  return {
    bind,
    syncFromParams,
    updateBoidVisibility,
    updateAntVisibility,
    updatePreyVisibility,
    updateFireflyVisibility,
  };
}

function getVisualControlsDom() {
  return {
    colorMode: document.getElementById("color-mode"),
    colormap: document.getElementById("colormap"),
    solidColor: document.getElementById("solid-color"),
    colormapControlWrap: document.getElementById("colormap-control-wrap"),
    singleColorWrap: document.getElementById("single-color-wrap"),
    antColorMode: document.getElementById("ant-color-mode"),
    antColormap: document.getElementById("ant-colormap"),
    antSolidColor: document.getElementById("ant-solid-color"),
    preyColorMode: document.getElementById("prey-color-mode"),
    preyColormap: document.getElementById("prey-colormap"),
    preySolidColor: document.getElementById("prey-solid-color"),
    preyColormapControlWrap: document.getElementById("prey-colormap-control-wrap"),
    preySingleColorWrap: document.getElementById("prey-single-color-wrap"),
    fireflyColorMode: document.getElementById("firefly-color-mode"),
    legendControls: {
      ant: createVisualLegendControls("ant"),
      firefly: createVisualLegendControls("firefly"),
    },
  };
}

function createVisualLegendControls(prefix) {
  return {
    select: document.getElementById(`${prefix}-colormap`),
    controlWrap: document.getElementById(`${prefix}-colormap-control-wrap`),
    singleColorWrap: document.getElementById(`${prefix}-single-color-wrap`),
    legend: {
      container: document.getElementById(`${prefix}-colormap-legend`),
      bar: document.getElementById(`${prefix}-colormap-legend-bar`),
      cmin: document.getElementById(`${prefix}-colormap-cmin`),
      cmax: document.getElementById(`${prefix}-colormap-cmax`),
    },
  };
}
