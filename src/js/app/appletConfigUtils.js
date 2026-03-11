// Shared applet config helpers used inside individual applet modules.
export function slider(id, label, icon, valueId, valueText, min, max, step, value) {
  return { id, label, icon, valueId, valueText, min, max, step, value };
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
  return {
    label: config.label ?? "Applet",
    defaultProjection: config.defaultProjection ?? "perspective",
    defaultBoundaryMode: config.defaultBoundaryMode ?? "cyclic",
    world: {
      defaults: config.world?.defaults ?? { x: 100, y: 100, z: 100 },
      range: config.world?.range ?? { minX: 40, maxX: 320, minY: 40, maxY: 320, minZ: 30, maxZ: 260, step: 2 },
      gridSize: config.world?.gridSize ?? 5,
      unitLabel: config.world?.unitLabel ?? "m",
    },
    units: config.units ?? null,
    left: config.left ?? {},
    right: config.right ?? {},
  };
}
