// Unit conversion helpers for param-display normalization.
// Dimension tuple order is (Length, Time, Mass), e.g. length is (1, 0, 0).

const DIMENSION_TUPLES = Object.freeze({
  length: Object.freeze([1, 0, 0]),
  time: Object.freeze([0, 1, 0]),
  mass: Object.freeze([0, 0, 1]),
});

const ANGLE_UNIT_ALIASES = Object.freeze({
  deg: "deg",
  "\u00B0": "deg",
  rad: "rad",
});
const ANGLE_UNIT_TO_RADIANS = Object.freeze({
  deg: Math.PI / 180,
  rad: 1,
});
const FREQUENCY_UNIT_ALIASES = Object.freeze({
  hz: "hz",
  "1/s": "hz",
});
const FREQUENCY_UNIT_TO_HZ = Object.freeze({
  hz: 1,
});

const UNIT_DEFINITIONS = Object.freeze({
  // Length
  um: Object.freeze({ toSI: 1e-6, dim: DIMENSION_TUPLES.length }),
  mm: Object.freeze({ toSI: 1e-3, dim: DIMENSION_TUPLES.length }),
  m: Object.freeze({ toSI: 1, dim: DIMENSION_TUPLES.length }),
  km: Object.freeze({ toSI: 1e3, dim: DIMENSION_TUPLES.length }),
  ly: Object.freeze({ toSI: 9.4607304725808e15, dim: DIMENSION_TUPLES.length }),
  kly: Object.freeze({ toSI: 9.4607304725808e18, dim: DIMENSION_TUPLES.length }),

  // Time
  ms: Object.freeze({ toSI: 1e-3, dim: DIMENSION_TUPLES.time }),
  s: Object.freeze({ toSI: 1, dim: DIMENSION_TUPLES.time }),
  min: Object.freeze({ toSI: 60, dim: DIMENSION_TUPLES.time }),
  h: Object.freeze({ toSI: 3600, dim: DIMENSION_TUPLES.time }),
  day: Object.freeze({ toSI: 86400, dim: DIMENSION_TUPLES.time }),
  yr: Object.freeze({ toSI: 31557600, dim: DIMENSION_TUPLES.time }),
  myr: Object.freeze({ toSI: 31557600 * 1e6, dim: DIMENSION_TUPLES.time }),

  // Mass
  ug: Object.freeze({ toSI: 1e-9, dim: DIMENSION_TUPLES.mass }),
  mg: Object.freeze({ toSI: 1e-6, dim: DIMENSION_TUPLES.mass }),
  g: Object.freeze({ toSI: 1e-3, dim: DIMENSION_TUPLES.mass }),
  kg: Object.freeze({ toSI: 1, dim: DIMENSION_TUPLES.mass }),
  m_sun: Object.freeze({ toSI: 1.98847e30, dim: DIMENSION_TUPLES.mass }),
});

function normalizeUnitSymbol(value) {
  return String(value || "").trim().toLowerCase()
    .replace("\u00B5", "u")
    .replace("\u03BC", "u");
}

function isSimpleUnitText(unitText) {
  return /^[A-Za-z_\u00B5\u03BC]+$/u.test(String(unitText || "").trim());
}

function getUnitDefinition(symbol) {
  return UNIT_DEFINITIONS[normalizeUnitSymbol(symbol)] || null;
}

function normalizeAngleUnitSymbol(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ANGLE_UNIT_ALIASES[normalized] || "";
}

function normalizeFrequencyUnitSymbol(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return FREQUENCY_UNIT_ALIASES[normalized] || "";
}

function sameDimensionTuple(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 3 || right.length !== 3) {
    return false;
  }
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function parseUnitExponentToken(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return {
      power: 1,
      token: "",
    };
  }
  const numeric = Number(raw.startsWith("^") ? raw.slice(1) : raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return {
      power: 1,
      token: "",
    };
  }
  const power = Math.max(1, Math.round(numeric));
  return {
    power,
    token: raw,
  };
}

function parseLengthUnitDescriptor(unitText) {
  const raw = String(unitText || "").trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^([A-Za-z\u00B5\u03BC]+)(\^?\d+)?(.*)$/u);
  if (!match) {
    return null;
  }

  const sourceSymbol = normalizeUnitSymbol(match[1]);
  const sourceUnit = getUnitDefinition(sourceSymbol);
  if (!sourceUnit || !sameDimensionTuple(sourceUnit.dim, DIMENSION_TUPLES.length)) {
    return null;
  }

  const exponent = parseUnitExponentToken(match[2]);
  return {
    sourceSymbol,
    power: exponent.power,
    exponentToken: exponent.token,
    suffix: match[3] || "",
  };
}

function buildTransform({
  sourceUnitText,
  targetUnitText,
  sourceSymbol,
  targetSymbol,
  dimensionTuple,
  scale,
}) {
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }
  return {
    sourceUnitText,
    targetUnitText,
    sourceSymbol,
    targetSymbol,
    dimensionTuple,
    toDisplay(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric * scale : value;
    },
    toSource(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric / scale : value;
    },
  };
}

function isSupportedAngleUnitText(unitText) {
  return normalizeAngleUnitSymbol(unitText).length > 0;
}

function isSupportedFrequencyUnitText(unitText) {
  return normalizeFrequencyUnitSymbol(unitText).length > 0;
}

function parseKinematicUnitDescriptor(unitText) {
  // Supported compound-unit forms (current scope):
  // - Speed: "<length>/<time>" (example: m/s)
  // - Acceleration: "<length>/<time>^2" (example: m/s^2)
  // Any other compound form is intentionally unsupported for now.
  const raw = String(unitText || "").trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\s+/g, "");
  const speedMatch = normalized.match(/^([A-Za-z_\u00B5\u03BC]+)\/([A-Za-z_\u00B5\u03BC]+)$/u);
  if (speedMatch) {
    return {
      lengthSymbol: normalizeUnitSymbol(speedMatch[1]),
      timeSymbol: normalizeUnitSymbol(speedMatch[2]),
      timePower: 1,
      sourceUnitText: raw,
      targetUnitTemplate: "{L}/{T}",
      dim: Object.freeze([1, -1, 0]),
    };
  }

  const accelMatch = normalized.match(
    /^([A-Za-z_\u00B5\u03BC]+)\/([A-Za-z_\u00B5\u03BC]+)\^2$/u,
  );
  if (accelMatch) {
    return {
      lengthSymbol: normalizeUnitSymbol(accelMatch[1]),
      timeSymbol: normalizeUnitSymbol(accelMatch[2]),
      timePower: 2,
      sourceUnitText: raw,
      targetUnitTemplate: "{L}/{T}^2",
      dim: Object.freeze([1, -2, 0]),
    };
  }

  return null;
}

export function getUnitDimensionTuple(unitText) {
  const raw = String(unitText || "").trim();
  if (!isSimpleUnitText(raw)) {
    return null;
  }
  const unit = getUnitDefinition(raw);
  return unit?.dim || null;
}

export function getAngularUnitDisplayTransform(unitText, targetAngleUnitSymbol = "\u00B0") {
  const sourceSymbol = normalizeAngleUnitSymbol(unitText);
  const targetSymbol = normalizeAngleUnitSymbol(targetAngleUnitSymbol);
  const sourceScale = ANGLE_UNIT_TO_RADIANS[sourceSymbol];
  const targetScale = ANGLE_UNIT_TO_RADIANS[targetSymbol];
  if (!sourceSymbol || !targetSymbol || !Number.isFinite(sourceScale) || !Number.isFinite(targetScale)) {
    return null;
  }

  const scale = sourceScale / targetScale;
  const targetUnitText = targetSymbol === "deg" ? "\u00B0" : "rad";
  return buildTransform({
    sourceUnitText: String(unitText || ""),
    targetUnitText,
    sourceSymbol,
    targetSymbol,
    // Angle is dimensionless in SI, but tracked as a dedicated conversion family.
    dimensionTuple: Object.freeze([0, 0, 0]),
    scale,
  });
}

export function getFrequencyUnitDisplayTransform(unitText, targetFrequencyUnitSymbol = "Hz") {
  const sourceSymbol = normalizeFrequencyUnitSymbol(unitText);
  const targetSymbol = normalizeFrequencyUnitSymbol(targetFrequencyUnitSymbol);
  const sourceScale = FREQUENCY_UNIT_TO_HZ[sourceSymbol];
  const targetScale = FREQUENCY_UNIT_TO_HZ[targetSymbol];
  if (!sourceSymbol || !targetSymbol || !Number.isFinite(sourceScale) || !Number.isFinite(targetScale)) {
    return null;
  }

  const scale = sourceScale / targetScale;
  return buildTransform({
    sourceUnitText: String(unitText || ""),
    targetUnitText: "Hz",
    sourceSymbol,
    targetSymbol,
    // Frequency is T^-1; handled as a dedicated conversion family.
    dimensionTuple: Object.freeze([0, -1, 0]),
    scale,
  });
}

export function getSimpleUnitDisplayTransform(unitText, targetUnitSymbol) {
  const sourceRaw = String(unitText || "").trim();
  const targetRaw = String(targetUnitSymbol || "").trim();
  if (!sourceRaw || !targetRaw || !isSimpleUnitText(sourceRaw) || !isSimpleUnitText(targetRaw)) {
    return null;
  }
  if (isSupportedAngleUnitText(sourceRaw) || isSupportedAngleUnitText(targetRaw)) {
    return null;
  }
  if (isSupportedFrequencyUnitText(sourceRaw) || isSupportedFrequencyUnitText(targetRaw)) {
    return null;
  }

  const sourceSymbol = normalizeUnitSymbol(sourceRaw);
  const targetSymbol = normalizeUnitSymbol(targetRaw);
  const sourceUnit = getUnitDefinition(sourceSymbol);
  const targetUnit = getUnitDefinition(targetSymbol);
  if (!sourceUnit || !targetUnit || !sameDimensionTuple(sourceUnit.dim, targetUnit.dim)) {
    return null;
  }

  const scale = sourceUnit.toSI / targetUnit.toSI;
  return buildTransform({
    sourceUnitText: sourceRaw,
    targetUnitText: targetRaw,
    sourceSymbol,
    targetSymbol,
    dimensionTuple: sourceUnit.dim,
    scale,
  });
}

export function getKinematicUnitDisplayTransform(unitText, targetLengthUnitSymbol, targetTimeUnitSymbol) {
  const descriptor = parseKinematicUnitDescriptor(unitText);
  if (!descriptor) {
    return null;
  }

  const sourceLength = getUnitDefinition(descriptor.lengthSymbol);
  const sourceTime = getUnitDefinition(descriptor.timeSymbol);
  const targetLength = getUnitDefinition(targetLengthUnitSymbol);
  const targetTime = getUnitDefinition(targetTimeUnitSymbol);

  if (
    !sourceLength ||
    !sourceTime ||
    !targetLength ||
    !targetTime ||
    !sameDimensionTuple(sourceLength.dim, DIMENSION_TUPLES.length) ||
    !sameDimensionTuple(sourceTime.dim, DIMENSION_TUPLES.time) ||
    !sameDimensionTuple(targetLength.dim, DIMENSION_TUPLES.length) ||
    !sameDimensionTuple(targetTime.dim, DIMENSION_TUPLES.time)
  ) {
    return null;
  }

  const lengthScale = sourceLength.toSI / targetLength.toSI;
  const timeScale = sourceTime.toSI / targetTime.toSI;
  const scale = lengthScale / (timeScale ** descriptor.timePower);
  const targetUnitText = descriptor.targetUnitTemplate
    .replace("{L}", String(targetLengthUnitSymbol || "").trim())
    .replace("{T}", String(targetTimeUnitSymbol || "").trim());

  return buildTransform({
    sourceUnitText: descriptor.sourceUnitText,
    targetUnitText,
    sourceSymbol: `${descriptor.lengthSymbol}/${descriptor.timeSymbol}${descriptor.timePower === 2 ? "^2" : ""}`,
    targetSymbol: `${normalizeUnitSymbol(targetLengthUnitSymbol)}/${normalizeUnitSymbol(targetTimeUnitSymbol)}${descriptor.timePower === 2 ? "^2" : ""}`,
    dimensionTuple: descriptor.dim,
    scale,
  });
}

export function getLengthUnitDisplayTransform(unitText, targetUnitSymbol) {
  const descriptor = parseLengthUnitDescriptor(unitText);
  const targetRaw = String(targetUnitSymbol || "").trim();
  const targetSymbol = normalizeUnitSymbol(targetRaw);
  const sourceUnit = descriptor ? getUnitDefinition(descriptor.sourceSymbol) : null;
  const targetUnit = getUnitDefinition(targetSymbol);

  if (
    !descriptor ||
    !sourceUnit ||
    !targetUnit ||
    !sameDimensionTuple(sourceUnit.dim, DIMENSION_TUPLES.length) ||
    !sameDimensionTuple(targetUnit.dim, DIMENSION_TUPLES.length)
  ) {
    return null;
  }

  const power = Math.max(1, descriptor.power);
  const scale = (sourceUnit.toSI / targetUnit.toSI) ** power;
  const targetUnitText = `${targetRaw || targetSymbol}${descriptor.exponentToken}${descriptor.suffix}`;

  return buildTransform({
    sourceUnitText: String(unitText || ""),
    targetUnitText,
    sourceSymbol: descriptor.sourceSymbol,
    targetSymbol,
    dimensionTuple: Object.freeze([power, 0, 0]),
    scale,
  });
}
