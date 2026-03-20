// URL routing helpers for applet selection via query string.
const DEFAULT_MAX_APPLETS = 3;
function normalizeAppletAlias(value) {
  return String(value || "").toLowerCase().trim();
}

function ensureActiveInLoadedOrder(loadedAppletIds, activeAppletId, maxApplets = DEFAULT_MAX_APPLETS) {
  const limit = Math.max(1, Number(maxApplets) || DEFAULT_MAX_APPLETS);
  const ordered = Array.isArray(loadedAppletIds) ? loadedAppletIds.slice(0, limit) : [];
  if (!activeAppletId) {
    return ordered;
  }
  if (ordered.includes(activeAppletId)) {
    return ordered.slice(0, limit);
  }
  if (ordered.length >= limit) {
    ordered.shift();
  }
  ordered.push(activeAppletId);
  return ordered.slice(0, limit);
}

export function normalizeAppletId(value, { validAppletIds, defaultAppletId } = {}) {
  if (typeof value !== "string") {
    return defaultAppletId;
  }

  const normalized = normalizeAppletAlias(value);
  return validAppletIds?.has(normalized) ? normalized : defaultAppletId;
}

export function normalizeAppletIds(
  values,
  { validAppletIds, defaultAppletId, maxApplets = DEFAULT_MAX_APPLETS } = {},
) {
  const text = Array.isArray(values) ? values.join(",") : String(values ?? "");
  const limit = Math.max(1, Number(maxApplets) || DEFAULT_MAX_APPLETS);
  const deduped = [];
  const seen = new Set();

  text
    .split(/[,\s]+/)
    .map((entry) => normalizeAppletAlias(entry))
    .filter(Boolean)
    .forEach((id) => {
      if (!validAppletIds?.has(id) || seen.has(id)) {
        return;
      }
      seen.add(id);
      deduped.push(id);
    });

  if (deduped.length === 0 && typeof defaultAppletId === "string") {
    deduped.push(defaultAppletId);
  }

  return deduped.slice(0, limit);
}

export function getAppletRouteState({
  validAppletIds,
  defaultAppletId,
  appSearchParam = "app",
  appsSearchParam = "apps",
  maxApplets = DEFAULT_MAX_APPLETS,
} = {}) {
  const fallbackState = {
    hasAppletParam: false,
    hasAppsParam: false,
    activeAppletId: defaultAppletId,
    loadedAppletIds: [defaultAppletId].filter(Boolean),
  };

  try {
    const url = new URL(window.location.href);
    const rawActiveApplet = url.searchParams.get(appSearchParam);
    const hasAppletParam = typeof rawActiveApplet === "string" && rawActiveApplet.trim().length > 0;
    const rawLoadedApplets = url.searchParams.get(appsSearchParam);
    const hasAppsParam = typeof rawLoadedApplets === "string" && rawLoadedApplets.trim().length > 0;
    const activeAppletId = normalizeAppletId(rawActiveApplet, {
      validAppletIds,
      defaultAppletId,
    });
    const loadedAppletIds = normalizeAppletIds(rawLoadedApplets, {
      validAppletIds,
      defaultAppletId: hasAppletParam ? activeAppletId : undefined,
      maxApplets,
    });

    return {
      hasAppletParam,
      hasAppsParam,
      activeAppletId,
      loadedAppletIds: ensureActiveInLoadedOrder(loadedAppletIds, activeAppletId, maxApplets),
    };
  } catch (error) {
    return fallbackState;
  }
}

export function getAppletFromUrl({
  validAppletIds,
  defaultAppletId,
  searchParam = "app",
} = {}) {
  return getAppletRouteState({
    validAppletIds,
    defaultAppletId,
    appSearchParam: searchParam,
  }).activeAppletId;
}

export function setAppletInUrl(appletId, { replaceHistory = false, searchParam = "app" } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set(searchParam, appletId);
  const historyMethod = replaceHistory ? "replaceState" : "pushState";
  window.history[historyMethod]?.({ app: appletId }, "", url);
}

export function setAppletRouteInUrl({
  activeAppletId,
  loadedAppletIds,
  replaceHistory = false,
  validAppletIds,
  defaultAppletId,
  appSearchParam = "app",
  appsSearchParam = "apps",
  maxApplets = DEFAULT_MAX_APPLETS,
} = {}) {
  const normalizedActiveAppletId = normalizeAppletId(activeAppletId, {
    validAppletIds,
    defaultAppletId,
  });
  const normalizedLoadedAppletIdsRaw = normalizeAppletIds(loadedAppletIds, {
    validAppletIds,
    defaultAppletId: normalizedActiveAppletId,
    maxApplets,
  });
  const normalizedLoadedAppletIds = ensureActiveInLoadedOrder(
    normalizedLoadedAppletIdsRaw,
    normalizedActiveAppletId,
    maxApplets,
  );

  const url = new URL(window.location.href);
  url.searchParams.set(appSearchParam, normalizedActiveAppletId);

  if (normalizedLoadedAppletIds.length > 1) {
    url.searchParams.set(appsSearchParam, normalizedLoadedAppletIds.join(","));
  } else {
    url.searchParams.delete(appsSearchParam);
  }

  const historyMethod = replaceHistory ? "replaceState" : "pushState";
  window.history[historyMethod]?.(
    {
      app: normalizedActiveAppletId,
      apps: normalizedLoadedAppletIds.join(","),
    },
    "",
    url,
  );

  return {
    activeAppletId: normalizedActiveAppletId,
    loadedAppletIds: normalizedLoadedAppletIds,
  };
}

export function setupAppRouting({
  validAppletIds,
  defaultAppletId,
  applyRouteState,
  applyAppletMode,
  appSearchParam = "app",
  appsSearchParam = "apps",
  maxApplets = DEFAULT_MAX_APPLETS,
} = {}) {
  const readRouteState = () =>
    getAppletRouteState({
      validAppletIds,
      defaultAppletId,
      appSearchParam,
      appsSearchParam,
      maxApplets,
    });

  const applyState = (routeState, options = {}) => {
    if (typeof applyRouteState === "function") {
      applyRouteState(routeState, options);
      return;
    }

    if (typeof applyAppletMode === "function") {
      applyAppletMode(routeState.activeAppletId, options);
    }
  };

  const initialState = readRouteState();
  applyState(initialState, {
    updateUrl: typeof applyRouteState === "function" ? initialState.hasAppletParam : true,
    replaceHistory: true,
  });

  window.addEventListener("popstate", () => {
    applyState(readRouteState(), { updateUrl: false, replaceHistory: true });
  });
}
