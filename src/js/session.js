// Applet session state container for active/loaded applets and per-applet world snapshots.
export function createAppletSession({
  defaultAppletId,
  maxLoadedAppletCount = 3,
  validAppletIds,
  normalizeAppletId,
  normalizeAppletIds,
  initialWorldStateByApplet = {},
} = {}) {
  const validIds = validAppletIds instanceof Set ? validAppletIds : new Set(validAppletIds || []);
  const normalizeId = (value) => (typeof normalizeAppletId === "function"
    ? normalizeAppletId(value)
    : String(value || ""));
  const normalizeIds = (values, fallbackId) => (typeof normalizeAppletIds === "function"
    ? normalizeAppletIds(values, fallbackId)
    : []);

  const worldStateByApplet = new Map(Object.entries(initialWorldStateByApplet || {}));
  let activeApplet = normalizeId(defaultAppletId);
  let loadedAppletIds = [];
  let loadedAppletIdSet = new Set(loadedAppletIds);

  function isValidAppletId(appletId) {
    const normalizedId = normalizeId(appletId);
    if (!normalizedId) {
      return false;
    }
    if (validIds.size === 0) {
      return true;
    }
    return validIds.has(normalizedId);
  }

  function getActiveApplet() {
    return activeApplet;
  }

  function getLoadedAppletIds() {
    return loadedAppletIds.slice();
  }

  function getLoadedAppletIdSet() {
    return new Set(loadedAppletIdSet);
  }

  function isLoadedApplet(appletId) {
    const normalizedId = normalizeId(appletId);
    return loadedAppletIdSet.has(normalizedId);
  }

  function setLoadedAppletIds(nextLoadedAppletIds) {
    loadedAppletIds = Array.isArray(nextLoadedAppletIds)
      ? nextLoadedAppletIds.slice(0, maxLoadedAppletCount)
      : [];
    loadedAppletIdSet = new Set(loadedAppletIds);
  }

  function normalizeLoadedAppletIdsWithFallback(appletIds, fallbackAppletId = activeApplet, options = {}) {
    const { allowEmpty = false } = options;
    const normalizedFallbackId = normalizeId(fallbackAppletId || defaultAppletId);
    const normalizedIds = normalizeIds(appletIds, normalizedFallbackId);

    if (allowEmpty && normalizedIds.length === 0) {
      return [];
    }

    if (!normalizedIds.includes(normalizedFallbackId)) {
      if (normalizedIds.length >= maxLoadedAppletCount) {
        normalizedIds.shift();
      }
      normalizedIds.push(normalizedFallbackId);
    }

    if (normalizedIds.length === 0 && normalizedFallbackId) {
      normalizedIds.push(normalizedFallbackId);
    }

    return normalizedIds.slice(0, maxLoadedAppletCount);
  }

  function applyMode(appletId, requestedLoadedAppletIds = null) {
    const normalizedRequestedId = normalizeId(appletId);
    const normalizedLoadedAppletIds = normalizeLoadedAppletIdsWithFallback(
      requestedLoadedAppletIds ?? loadedAppletIds,
      normalizedRequestedId,
    );
    const previousApplet = activeApplet;

    setLoadedAppletIds(normalizedLoadedAppletIds);
    activeApplet = loadedAppletIds.includes(normalizedRequestedId)
      ? normalizedRequestedId
      : loadedAppletIds[0] || normalizeId(defaultAppletId);

    return {
      previousApplet,
      activeApplet,
      loadedAppletIds: getLoadedAppletIds(),
      loadedAppletIdSet: getLoadedAppletIdSet(),
    };
  }

  function clearLoadedApplets() {
    setLoadedAppletIds([]);
    activeApplet = normalizeId(defaultAppletId);
    return {
      activeApplet,
      loadedAppletIds: getLoadedAppletIds(),
      loadedAppletIdSet: getLoadedAppletIdSet(),
    };
  }

  function getWorldState(appletId) {
    return worldStateByApplet.get(String(appletId || "")) || null;
  }

  function setWorldState(appletId, state) {
    const key = String(appletId || "");
    if (!key) {
      return null;
    }
    worldStateByApplet.set(key, state);
    return state;
  }

  function ensureWorldState(appletId, createDefaultWorldState) {
    const key = String(appletId || "");
    if (!key) {
      return null;
    }
    const current = getWorldState(key);
    if (current) {
      return current;
    }
    const fallbackState = typeof createDefaultWorldState === "function"
      ? createDefaultWorldState(key)
      : null;
    setWorldState(key, fallbackState);
    return fallbackState;
  }

  function persistActiveWorldState(snapshot) {
    if (!isValidAppletId(activeApplet)) {
      return;
    }
    setWorldState(activeApplet, snapshot);
  }

  return {
    getActiveApplet,
    getLoadedAppletIds,
    getLoadedAppletIdSet,
    isLoadedApplet,
    normalizeLoadedAppletIds: normalizeLoadedAppletIdsWithFallback,
    applyMode,
    clearLoadedApplets,
    getWorldState,
    setWorldState,
    ensureWorldState,
    persistActiveWorldState,
    isValidAppletId,
  };
}
