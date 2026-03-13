// Shared applet config helpers used inside individual applet modules.

export function selectControl(id, label, icon, optionsList, value, options = {}) {
  // Common options:
  // - paramKey: explicit params key when id->camelCase inference is not desired
  // - simulationSetter: explicit simulation method name for control side effects
  // - simulationAction: auto | reset | sync | none
  // - group: initial | dynamic | custom
  // - groupLabel: optional custom group heading label
  return {
    id,
    label,
    icon,
    options: Array.isArray(optionsList) ? optionsList : [],
    value,
    ...options,
  };
}

function normalizeParamControlType(type) {
  const normalized = String(type || "slider").trim().toLowerCase();
  if (normalized === "select" || normalized === "switch") {
    return normalized;
  }
  return "slider";
}

function getNumericPrecision(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return 0;
    }
    if (Number.isInteger(value)) {
      return 0;
    }
    const asText = value.toString();
    if (/e/i.test(asText)) {
      return 0;
    }
    const dotIndex = asText.indexOf(".");
    return dotIndex >= 0 ? Math.max(0, asText.length - dotIndex - 1) : 0;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed || /e/i.test(trimmed)) {
    return 0;
  }

  const dotIndex = trimmed.indexOf(".");
  return dotIndex >= 0 ? Math.max(0, trimmed.length - dotIndex - 1) : 0;
}

function formatSliderNumber(value, step) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return String(value ?? "");
  }

  const precision = getNumericPrecision(step);
  if (precision > 0) {
    return numericValue.toFixed(precision);
  }
  if (Math.abs(numericValue) >= 1e6) {
    return numericValue.toExponential(2);
  }
  return String(Math.round(numericValue));
}

function normalizeParamControlConfig(paramConfig, index) {
  if (!paramConfig || typeof paramConfig !== "object") {
    return null;
  }

  const hasExplicitControl =
    (paramConfig.control && typeof paramConfig.control === "object") ||
    typeof paramConfig.id === "string" ||
    typeof paramConfig.type === "string";
  if (!hasExplicitControl) {
    return null;
  }

  const controlConfig = (paramConfig.control && typeof paramConfig.control === "object")
    ? { ...paramConfig.control }
    : {};
  const type = normalizeParamControlType(controlConfig.type ?? paramConfig.type);
  const id = String(
    controlConfig.id ??
    paramConfig.id ??
    paramConfig.paramKey ??
    paramConfig.key ??
    `param-${index + 1}`,
  ).trim();
  if (!id) {
    return null;
  }

  const normalized = {
    ...controlConfig,
    type,
    id,
  };

  if (typeof paramConfig.label === "string" && paramConfig.label.trim().length > 0 && !normalized.label) {
    normalized.label = paramConfig.label;
  }

  if (typeof paramConfig.group === "string" && paramConfig.group.trim().length > 0 && !normalized.group) {
    normalized.group = paramConfig.group;
  }

  if (typeof paramConfig.groupLabel === "string" && paramConfig.groupLabel.trim().length > 0 && !normalized.groupLabel) {
    normalized.groupLabel = paramConfig.groupLabel;
  }

  const paramKey = String(paramConfig.paramKey ?? paramConfig.key ?? "").trim();
  if (paramKey && !normalized.paramKey) {
    normalized.paramKey = paramKey;
  }

  if (type === "slider") {
    const uiMin = paramConfig.uiMin;
    const uiMax = paramConfig.uiMax;
    if (uiMin !== undefined && normalized.uiMin === undefined) {
      normalized.uiMin = uiMin;
    }
    if (uiMax !== undefined && normalized.uiMax === undefined) {
      normalized.uiMax = uiMax;
    }
    if (!normalized.valueId) {
      normalized.valueId = `${id}-value`;
    }
    if (paramConfig.default !== undefined && normalized.value === undefined) {
      normalized.value = String(paramConfig.default);
    }
    if (typeof paramConfig.unit === "string" && paramConfig.unit.trim().length > 0 && !normalized.unit) {
      normalized.unit = paramConfig.unit.trim();
    }
    if (normalized.valueText === undefined) {
      const defaultValue = paramConfig.default ?? normalized.value;
      const numericText = formatSliderNumber(defaultValue, normalized.step);
      const unit = typeof normalized.unit === "string" && normalized.unit.length > 0
        ? ` ${normalized.unit}`
        : "";
      normalized.valueText = `${numericText}${unit}`;
    }
  } else if (type === "select") {
    if (paramConfig.default !== undefined && normalized.value === undefined) {
      normalized.value = String(paramConfig.default);
    }
  } else if (type === "switch") {
    if (paramConfig.default !== undefined && normalized.checked === undefined) {
      normalized.checked = Boolean(paramConfig.default);
    }
  }

  return normalized;
}

function normalizeLegacySliderConfig(sliderConfig) {
  if (!sliderConfig || typeof sliderConfig !== "object") {
    return sliderConfig;
  }
  const normalized = { ...sliderConfig };
  if (normalized.uiMin !== undefined && normalized.min === undefined) {
    normalized.min = String(normalized.uiMin);
  }
  if (normalized.uiMax !== undefined && normalized.max === undefined) {
    normalized.max = String(normalized.uiMax);
  }
  return normalized;
}

export function getSectionInputControls(sectionConfig) {
  const params = Array.isArray(sectionConfig?.params) ? sectionConfig.params : [];
  const controls = {
    sliders: [],
    selects: [],
    switches: [],
  };

  if (params.length > 0) {
    params.forEach((paramConfig, index) => {
      const control = normalizeParamControlConfig(paramConfig, index);
      if (!control) {
        return;
      }
      if (control.type === "select") {
        controls.selects.push(control);
        return;
      }
      if (control.type === "switch") {
        controls.switches.push(control);
        return;
      }
      controls.sliders.push(control);
    });
  }

  if (Array.isArray(sectionConfig?.sliders)) {
    controls.sliders.push(...sectionConfig.sliders.map((entry) => normalizeLegacySliderConfig(entry)));
  }
  if (Array.isArray(sectionConfig?.selects)) {
    controls.selects.push(...sectionConfig.selects);
  }
  if (Array.isArray(sectionConfig?.switches)) {
    controls.switches.push(...sectionConfig.switches);
  }

  return controls;
}

export function createAppletParams(rootParams, appletId) {
  return new Proxy(rootParams[appletId] ?? {}, {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      return rootParams[prop];
    },
    set(target, prop, value) {
      if (prop in target || !(prop in rootParams)) {
        target[prop] = value;
        return true;
      }
      rootParams[prop] = value;
      return true;
    },
  });
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeWorldParams(worldConfig = {}, defaultBoundaryMode = "cyclic-xyz") {
  const defaults = worldConfig.defaults ?? {};
  const range = worldConfig.range ?? {};
  const legacyStep = toFiniteNumber(range.step, 2);

  const defaultByKey = {
    x: toFiniteNumber(defaults.x, 100),
    y: toFiniteNumber(defaults.y, 100),
    z: toFiniteNumber(defaults.z, 100),
    gridSize: toFiniteNumber(worldConfig.gridSize, 5),
  };

  const legacyBounds = {
    x: {
      uiMin: toFiniteNumber(range.minX, 40),
      uiMax: toFiniteNumber(range.maxX, 320),
      step: legacyStep,
    },
    y: {
      uiMin: toFiniteNumber(range.minY, 40),
      uiMax: toFiniteNumber(range.maxY, 320),
      step: legacyStep,
    },
    z: {
      uiMin: toFiniteNumber(range.minZ, 30),
      uiMax: toFiniteNumber(range.maxZ, 260),
      step: legacyStep,
    },
    gridSize: {
      uiMin: Math.max(1, legacyStep),
      uiMax: toFiniteNumber(range.maxX, 320),
      step: legacyStep,
    },
  };

  const providedParams = Array.isArray(worldConfig.params) ? worldConfig.params : [];
  const paramByKey = new Map(
    providedParams
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [String(entry.key || "").trim(), entry]),
  );

  const keys = ["x", "y", "z", "gridSize"];
  const normalized = keys.map((key) => {
    const existing = paramByKey.get(key) || {};
    const legacy = legacyBounds[key];
    return {
      key,
      default: toFiniteNumber(existing.default, defaultByKey[key]),
      uiMin: toFiniteNumber(existing.uiMin, legacy.uiMin),
      uiMax: toFiniteNumber(existing.uiMax, legacy.uiMax),
      step: toFiniteNumber(existing.step, legacy.step),
    };
  });

  const boundaryParam = paramByKey.get("boundaryMode") || {};
  normalized.push({
    key: "boundaryMode",
    default: String(boundaryParam.default ?? defaultBoundaryMode ?? "cyclic-xyz"),
  });

  return normalized;
}

function buildLegacyWorldShapeFromParams(worldParams) {
  const byKey = Object.fromEntries(
    worldParams.map((entry) => [String(entry.key || "").trim(), entry]),
  );
  const x = byKey.x || {};
  const y = byKey.y || {};
  const z = byKey.z || {};
  const gridSize = byKey.gridSize || {};

  return {
    defaults: {
      x: toFiniteNumber(x.default, 100),
      y: toFiniteNumber(y.default, 100),
      z: toFiniteNumber(z.default, 100),
    },
    range: {
      minX: toFiniteNumber(x.uiMin, 40),
      maxX: toFiniteNumber(x.uiMax, 320),
      minY: toFiniteNumber(y.uiMin, 40),
      maxY: toFiniteNumber(y.uiMax, 320),
      minZ: toFiniteNumber(z.uiMin, 30),
      maxZ: toFiniteNumber(z.uiMax, 260),
      step: toFiniteNumber(x.step, 2),
    },
    gridSize: toFiniteNumber(gridSize.default, 5),
  };
}

function normalizeCameraParams(cameraConfig = {}) {
  const controls = cameraConfig.controls ?? {};
  const providedParams = Array.isArray(cameraConfig.params) ? cameraConfig.params : [];
  const paramByKey = new Map(
    providedParams
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [String(entry.key || "").trim(), entry]),
  );

  const defaultsByKey = {
    fov: {
      default: toFiniteNumber(cameraConfig.fov, 50),
      uiMin: toFiniteNumber(controls.fov?.min, 20),
      uiMax: toFiniteNumber(controls.fov?.max, 90),
      step: toFiniteNumber(controls.fov?.step, 1),
    },
    moveSpeed: {
      default: toFiniteNumber(
        controls.moveSpeed?.defaultValue,
        toFiniteNumber(cameraConfig.keyboardMoveSpeedDefault, 30000),
      ),
      uiMin: toFiniteNumber(controls.moveSpeed?.min, 1),
      uiMax: toFiniteNumber(controls.moveSpeed?.max, 100000),
      step: toFiniteNumber(controls.moveSpeed?.step, 1),
    },
    rotationSpeed: {
      default: toFiniteNumber(controls.rotationSpeed?.defaultValue, 84),
      uiMin: toFiniteNumber(controls.rotationSpeed?.min, 1),
      uiMax: toFiniteNumber(controls.rotationSpeed?.max, 720),
      step: toFiniteNumber(controls.rotationSpeed?.step, 1),
    },
  };

  return ["fov", "moveSpeed", "rotationSpeed"].map((key) => {
    const existing = paramByKey.get(key) || {};
    const fallback = defaultsByKey[key];
    return {
      key,
      default: toFiniteNumber(existing.default, fallback.default),
      uiMin: toFiniteNumber(existing.uiMin, fallback.uiMin),
      uiMax: toFiniteNumber(existing.uiMax, fallback.uiMax),
      step: toFiniteNumber(existing.step, fallback.step),
    };
  });
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

function buildLegacyCameraControlsFromParams(cameraParams) {
  const byKey = Object.fromEntries(
    cameraParams.map((entry) => [String(entry.key || "").trim(), entry]),
  );
  const fov = byKey.fov || {};
  const moveSpeed = byKey.moveSpeed || {};
  const rotationSpeed = byKey.rotationSpeed || {};

  return {
    fov: {
      min: toFiniteNumber(fov.uiMin, 20),
      max: toFiniteNumber(fov.uiMax, 90),
      step: toFiniteNumber(fov.step, 1),
      defaultValue: toFiniteNumber(fov.default, 50),
    },
    moveSpeed: {
      min: toFiniteNumber(moveSpeed.uiMin, 1),
      max: toFiniteNumber(moveSpeed.uiMax, 100000),
      step: toFiniteNumber(moveSpeed.step, 1),
      defaultValue: toFiniteNumber(moveSpeed.default, 30000),
    },
    rotationSpeed: {
      min: toFiniteNumber(rotationSpeed.uiMin, 1),
      max: toFiniteNumber(rotationSpeed.uiMax, 720),
      step: toFiniteNumber(rotationSpeed.step, 1),
      defaultValue: toFiniteNumber(rotationSpeed.default, 84),
    },
  };
}

export function defineAppletConfig(config) {
  const worldLengthUnit = config.world?.lengthUnit ?? {
    name: config.world?.unitLabel ?? "m",
    toSI: 1,
  };
  const label = config.label ?? "Applet";
  const shortLabel = config.shortLabel ?? label.split(/\s+/)[0] ?? label;
  const configuredWorldBoundaryMode = Array.isArray(config.world?.params)
    ? config.world.params.find((entry) => entry?.key === "boundaryMode")?.default
    : undefined;
  const resolvedDefaultBoundaryMode = String(
    configuredWorldBoundaryMode ?? config.defaultBoundaryMode ?? "cyclic-xyz",
  );
  const worldParams = normalizeWorldParams(config.world ?? {}, resolvedDefaultBoundaryMode);
  const legacyWorld = buildLegacyWorldShapeFromParams(worldParams);
  const configuredCameraProjection = Array.isArray(config.camera?.params)
    ? config.camera.params.find((entry) => {
      const key = String(entry?.key || "").trim();
      return key === "projection" || key === "defaultProjection" || key === "projectionMode";
    })?.default
    : undefined;
  const configuredCameraLocked = Array.isArray(config.camera?.params)
    ? config.camera.params.find((entry) => String(entry?.key || "").trim() === "locked")?.default
    : undefined;
  const cameraParams = normalizeCameraParams(config.camera ?? {});
  const legacyCameraControls = buildLegacyCameraControlsFromParams(cameraParams);
  const cameraFovParam = cameraParams.find((entry) => entry.key === "fov");
  const cameraMoveSpeedParam = cameraParams.find((entry) => entry.key === "moveSpeed");
  const resolvedDefaultProjection =
    configuredCameraProjection ??
    config.camera?.defaultProjection ??
    config.defaultProjection ??
    "perspective";

  return {
    label,
    shortLabel,
    params: config.params ?? null,
    defaultProjection: resolvedDefaultProjection,
    defaultBoundaryMode: resolvedDefaultBoundaryMode,
    camera: {
      distance: config.camera?.distance ?? 185,
      height: config.camera?.height ?? 80,
      fov: toFiniteNumber(cameraFovParam?.default, 50),
      locked: normalizeBoolean(configuredCameraLocked, config.camera?.locked ?? false),
      params: cameraParams,
      keyboardMoveSpeedDefault: toFiniteNumber(cameraMoveSpeedParam?.default, 30000),
      controls: legacyCameraControls,
    },
    world: {
      params: worldParams,
      defaults: legacyWorld.defaults,
      range: legacyWorld.range,
      gridSize: legacyWorld.gridSize,
      lengthUnit: worldLengthUnit,
      unitLabel: worldLengthUnit.name,
    },
    unit: config.unit ?? config.units ?? null,
    intro: config.intro ?? config.left?.intro ?? null,
    model: config.model ?? config.left?.model ?? null,
    stats: config.stats ?? config.left?.stats ?? null,
    simulation: config.simulation ?? config.right?.simulation ?? null,
    interaction: config.interaction ?? config.right?.interaction ?? null,
    visual: config.visual ?? config.right?.visual ?? null,
  };
}
