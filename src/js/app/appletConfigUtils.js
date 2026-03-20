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

const KEY_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertValidIdentifierKey(rawKey, contextPath) {
  const key = String(rawKey ?? "").trim();
  if (!key) {
    throw new Error(`[appletConfigUtils] ${contextPath} requires non-empty "key".`);
  }
  if (!KEY_IDENTIFIER_PATTERN.test(key)) {
    throw new Error(
      `[appletConfigUtils] ${contextPath} key "${key}" is invalid. Use variable-style identifiers: [A-Za-z_][A-Za-z0-9_]*.`,
    );
  }
  return key;
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

function validateAngleUnitLabel(unitLabel, context = "param") {
  const trimmed = String(unitLabel || "").trim();
  if (!trimmed) {
    return;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered.includes("deg") || trimmed.includes("\u00B0")) {
    if (trimmed !== "deg" && trimmed !== "\u00B0") {
      throw new Error(
        `[appletConfigUtils] ${context} unit "${trimmed}" is invalid. Use "deg" or "°" for angles.`,
      );
    }
  }
}

function validateFrequencyUnitLabel(unitLabel, context = "param") {
  const trimmed = String(unitLabel || "").trim();
  if (!trimmed) {
    return;
  }
  const lowered = trimmed.toLowerCase();
  const looksLikeFrequency = lowered === "hz" || lowered === "1/s";
  if (looksLikeFrequency && trimmed !== "Hz" && trimmed !== "1/s") {
    throw new Error(
      `[appletConfigUtils] ${context} unit "${trimmed}" is invalid. Use "Hz" or "1/s" for frequency.`,
    );
  }
}

function validateUnitExponentNotation(unitLabel, context = "param") {
  const trimmed = String(unitLabel || "").trim();
  if (!trimmed) {
    return;
  }
  if (trimmed.includes("\u00B2") || trimmed.includes("\u00B3")) {
    throw new Error(
      `[appletConfigUtils] ${context} unit "${trimmed}" is invalid. Use "^2" or "^3" instead of superscript characters.`,
    );
  }
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
      const unit = paramConfig.unit.trim();
      validateUnitExponentNotation(unit, `param "${paramKey || id}"`);
      validateAngleUnitLabel(unit, `param "${paramKey || id}"`);
      validateFrequencyUnitLabel(unit, `param "${paramKey || id}"`);
      normalized.unit = unit;
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
  const requestedId = String(appletId || "").trim();
  const targetParams = rootParams[requestedId] ?? {};

  return new Proxy(targetParams, {
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

function normalizeUnitConfig(unitConfig) {
  if (!unitConfig || typeof unitConfig !== "object") {
    return null;
  }

  const allowedKeys = new Set(["length", "mass", "time"]);
  const rawKeys = Object.keys(unitConfig);
  const invalidKeys = rawKeys.filter((key) => !allowedKeys.has(key));
  if (invalidKeys.length > 0) {
    throw new Error(
      `[appletConfigUtils] unit contains unsupported keys: ${invalidKeys.join(", ")}. Allowed: length, mass, time.`,
    );
  }

  const normalized = {};
  ["length", "mass", "time"].forEach((key) => {
    const entry = unitConfig[key];
    if (!entry || typeof entry !== "object") {
      return;
    }
    const label = String(entry.label || "").trim();
    if (!label) {
      throw new Error(`[appletConfigUtils] unit.${key}.label is required.`);
    }
    const next = {
      label,
      description: String(entry.description || "").trim(),
    };
    if (entry.toSI !== undefined) {
      const toSI = Number(entry.toSI);
      if (!Number.isFinite(toSI) || toSI <= 0) {
        throw new Error(`[appletConfigUtils] unit.${key}.toSI must be a positive finite number when provided.`);
      }
      next.toSI = toSI;
    }
    normalized[key] = next;
  });

  return normalized;
}

function normalizeWorldParams(worldConfig = {}) {
  const providedParams = Array.isArray(worldConfig.params) ? worldConfig.params : [];
  const paramByKey = new Map(
    providedParams
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => [String(entry.key || "").trim(), entry]),
  );

  const requiredKeys = ["x", "y", "z", "gridSize"];
  return requiredKeys.map((key) => {
    const existing = paramByKey.get(key);
    if (!existing || typeof existing !== "object") {
      throw new Error(`[appletConfigUtils] world.params must include "${key}".`);
    }

    const defaultValue = Number(existing.default);
    const uiMin = Number(existing.uiMin);
    const uiMax = Number(existing.uiMax);
    const step = Number(existing.step);

    if (!Number.isFinite(defaultValue)) {
      throw new Error(`[appletConfigUtils] world.params "${key}" requires numeric default.`);
    }
    if (!Number.isFinite(uiMin)) {
      throw new Error(`[appletConfigUtils] world.params "${key}" requires numeric uiMin.`);
    }
    if (!Number.isFinite(uiMax)) {
      throw new Error(`[appletConfigUtils] world.params "${key}" requires numeric uiMax.`);
    }
    if (!Number.isFinite(step) || step <= 0) {
      throw new Error(`[appletConfigUtils] world.params "${key}" requires positive numeric step.`);
    }
    if (uiMax <= uiMin) {
      throw new Error(`[appletConfigUtils] world.params "${key}" requires uiMax > uiMin.`);
    }

    return {
      key,
      default: defaultValue,
      uiMin,
      uiMax,
      step,
    };
  });
}

function normalizeBoundaryAxisMode(value) {
  return String(value || "").trim().toLowerCase() === "lost" ? "lost" : "cyclic";
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

  const numericParams = ["fov", "moveSpeed", "rotationSpeed"].map((key) => {
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

  const projectionParam = paramByKey.get("projection");
  const lockedParam = paramByKey.get("locked");

  return [
    {
      key: "projection",
      default: String(projectionParam?.default ?? cameraConfig.defaultProjection ?? "perspective").trim().toLowerCase() === "orthographic"
        ? "orthographic"
        : "perspective",
    },
    {
      key: "locked",
      default: normalizeBoolean(lockedParam?.default, normalizeBoolean(cameraConfig.locked, false)),
    },
    ...numericParams,
  ];
}

function normalizeVisualConfig(visualConfig) {
  if (!visualConfig || typeof visualConfig !== "object") {
    return null;
  }

  const normalized = { ...visualConfig };

  const colormapEntries = Array.isArray(visualConfig.colormap) ? visualConfig.colormap : [];
  normalized.colormap = colormapEntries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      if (Object.prototype.hasOwnProperty.call(entry, "name")) {
        throw new Error(
          `[appletConfigUtils] visual.colormap[${index}] uses legacy "name". Use "key".`,
        );
      }
      const key = assertValidIdentifierKey(entry.key, `visual.colormap[${index}]`);
      return {
        ...entry,
        key,
      };
    });

  const visualParams = Array.isArray(visualConfig.params) ? visualConfig.params : [];
  normalized.params = visualParams
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, paramIndex) => {
      if (!Array.isArray(entry.options)) {
        return entry;
      }
      const options = entry.options
        .filter((option) => option && typeof option === "object")
        .map((option, optionIndex) => {
          if (Object.prototype.hasOwnProperty.call(option, "value")) {
            const paramKey = String(entry.key ?? "").trim() || `params[${paramIndex}]`;
            throw new Error(
              `[appletConfigUtils] visual.params option "${paramKey}" at index ${optionIndex} uses legacy "value". Use "key".`,
            );
          }
          const paramKey = String(entry.key ?? "").trim() || `params[${paramIndex}]`;
          const key = assertValidIdentifierKey(
            option.key,
            `visual.params option "${paramKey}" at index ${optionIndex}`,
          );
          return {
            ...option,
            key,
          };
        });
      return {
        ...entry,
        options,
      };
    });

  const sizeEntries = Array.isArray(visualConfig.size) ? visualConfig.size : [];
  normalized.size = sizeEntries
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const next = { ...entry };
      if (typeof next.unit === "string" && next.unit.trim().length > 0) {
        const unit = next.unit.trim();
        validateUnitExponentNotation(unit, `visual.size[${index}]`);
        validateAngleUnitLabel(unit, `visual.size[${index}]`);
        validateFrequencyUnitLabel(unit, `visual.size[${index}]`);
        next.unit = unit;
      }
      return next;
    });

  return normalized;
}

function validateKeyedParams(params, contextPath) {
  if (!Array.isArray(params)) {
    return;
  }
  params.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(entry, "key")) {
      assertValidIdentifierKey(entry.key, `${contextPath}[${index}]`);
    }
    if (Array.isArray(entry.states)) {
      entry.states.forEach((stateEntry, stateIndex) => {
        if (!stateEntry || typeof stateEntry !== "object") {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(stateEntry, "key")) {
          assertValidIdentifierKey(
            stateEntry.key,
            `${contextPath}[${index}].states[${stateIndex}]`,
          );
        }
      });
    }
  });
}

function validateWorldBoundaryConfig(boundaryConfig) {
  if (!boundaryConfig || typeof boundaryConfig !== "object") {
    return;
  }
  ["x", "y", "z"].forEach((axis) => {
    const axisEntry = boundaryConfig[axis];
    if (!axisEntry || typeof axisEntry !== "object") {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(axisEntry, "default")) {
      const mode = normalizeBoundaryAxisMode(axisEntry.default);
      const raw = String(axisEntry.default || "").trim().toLowerCase();
      if (raw && mode !== raw) {
        throw new Error(
          `[appletConfigUtils] world.boundary.${axis}.default must be "cyclic" or "lost".`,
        );
      }
    }
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

export function validateAppletConfig(config) {
  const normalizedUnit = normalizeUnitConfig(config?.unit ?? null);
  const meta = (config?.meta && typeof config.meta === "object") ? config.meta : {};
  const worldLengthConfig = (config?.world && typeof config.world === "object" && config.world.lengthUnit)
    ? config.world.lengthUnit
    : {};
  const worldLengthUnit = {
    name: String(worldLengthConfig.name || "m"),
    toSI: toFiniteNumber(worldLengthConfig.toSI, 1),
  };
  const label = meta?.label ?? "Applet";
  const group = String(meta?.group || "").trim();
  const shortLabel = String(meta?.shortLabel || "").trim();
  const thumbnail = String(meta?.thumbnail || "").trim();
  const appletKey = typeof config?.key === "string" && config.key.trim().length > 0
    ? assertValidIdentifierKey(config.key.trim(), "root")
    : "";
  const worldParams = normalizeWorldParams(config.world ?? {});
  const legacyWorld = buildLegacyWorldShapeFromParams(worldParams);
  const configuredCameraLocked = Array.isArray(config.camera?.params)
    ? config.camera.params.find((entry) => String(entry?.key || "").trim() === "locked")?.default
    : undefined;
  const cameraParams = normalizeCameraParams(config.camera ?? {});
  const cameraProjectionParam = cameraParams.find((entry) => entry.key === "projection");
  const legacyCameraControls = buildLegacyCameraControlsFromParams(cameraParams);
  const cameraFovParam = cameraParams.find((entry) => entry.key === "fov");
  const cameraMoveSpeedParam = cameraParams.find((entry) => entry.key === "moveSpeed");
  const worldBoundaryConfig = (config?.world?.boundary && typeof config.world.boundary === "object")
    ? config.world.boundary
    : {};
  const normalizedBoundaryAxes = {
    x: normalizeBoundaryAxisMode(worldBoundaryConfig?.x?.default),
    y: normalizeBoundaryAxisMode(worldBoundaryConfig?.y?.default),
    z: normalizeBoundaryAxisMode(worldBoundaryConfig?.z?.default),
  };
  const normalizedVisual = normalizeVisualConfig(config.visual ?? null);

  validateKeyedParams(config?.simulation?.params, "simulation.params");
  validateKeyedParams(config?.camera?.params, "camera.params");
  validateKeyedParams(config?.world?.params, "world.params");
  validateWorldBoundaryConfig(config?.world?.boundary);
  validateKeyedParams(config?.interaction?.params, "interaction.params");
  validateKeyedParams(config?.stats?.params, "stats.params");
  validateKeyedParams(normalizedVisual?.params, "visual.params");
  validateKeyedParams(normalizedVisual?.color, "visual.color");
  validateKeyedParams(normalizedVisual?.size, "visual.size");
  if (Array.isArray(normalizedVisual?.colormap)) {
    normalizedVisual.colormap.forEach((entry, index) => {
      assertValidIdentifierKey(entry?.key, `visual.colormap[${index}]`);
    });
  }

  return {
    label,
    meta: {
      label,
      ...(shortLabel ? { shortLabel } : {}),
      ...(group ? { group } : {}),
      ...(thumbnail ? { thumbnail } : {}),
    },
    key: appletKey || undefined,
    camera: {
      distance: config.camera?.distance ?? 185,
      height: config.camera?.height ?? 80,
      fov: toFiniteNumber(cameraFovParam?.default, 50),
      defaultProjection: String(cameraProjectionParam?.default || "perspective").trim().toLowerCase() === "orthographic"
        ? "orthographic"
        : "perspective",
      locked: normalizeBoolean(configuredCameraLocked, config.camera?.locked ?? false),
      params: cameraParams,
      keyboardMoveSpeedDefault: toFiniteNumber(cameraMoveSpeedParam?.default, 30000),
      controls: legacyCameraControls,
    },
    world: {
      params: worldParams,
      defaultBoundaryAxes: normalizedBoundaryAxes,
      defaults: legacyWorld.defaults,
      range: legacyWorld.range,
      gridSize: legacyWorld.gridSize,
      lengthUnit: worldLengthUnit,
      unitLabel: worldLengthUnit.name,
    },
    unit: normalizedUnit,
    intro: config.intro ?? null,
    model: config.model ?? null,
    stats: config.stats ?? null,
    simulation: config.simulation ?? null,
    interaction: config.interaction ?? null,
    visual: normalizedVisual,
  };
}

// Backward-compatible alias during migration.
export const defineAppletConfig = validateAppletConfig;
