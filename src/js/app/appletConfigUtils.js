// Shared applet config helpers used inside individual applet modules.
export function slider(id, label, icon, valueId, valueText, min, max, step, value, options = {}) {
  // Common options:
  // - paramKey: explicit params key when id->camelCase inference is not desired
  // - simulationSetter: explicit simulation method name for slider side effects
  // - simulationAction: auto | reset | sync | none
  // - resetTrendCharts: boolean
  return { id, label, icon, valueId, valueText, min, max, step, value, ...options };
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

export function defineAppletConfig(config) {
  const worldLengthUnit = config.world?.lengthUnit ?? {
    name: config.world?.unitLabel ?? "m",
    toSI: 1,
  };
  const label = config.label ?? "Applet";
  const shortLabel = config.shortLabel ?? label.split(/\s+/)[0] ?? label;

  return {
    label,
    shortLabel,
    defaultProjection: config.defaultProjection ?? "perspective",
    defaultBoundaryMode: config.defaultBoundaryMode ?? "cyclic",
    camera: {
      distance: config.camera?.distance ?? 185,
      height: config.camera?.height ?? 80,
      fov: config.camera?.fov ?? 50,
      locked: config.camera?.locked ?? false,
    },
    world: {
      defaults: config.world?.defaults ?? { x: 100, y: 100, z: 100 },
      range: config.world?.range ?? { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
      gridSize: config.world?.gridSize ?? 5,
      lengthUnit: worldLengthUnit,
      unitLabel: worldLengthUnit.name,
    },
    units: config.units ?? null,
    left: config.left ?? {},
    right: config.right ?? {},
  };
}
