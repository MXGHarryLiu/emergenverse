// URL routing helpers for applet selection via query string.
export function normalizeAppletId(value, { validAppletIds, defaultAppletId } = {}) {
  if (typeof value !== "string") {
    return defaultAppletId;
  }

  const normalized = value.toLowerCase().trim();
  return validAppletIds?.has(normalized) ? normalized : defaultAppletId;
}

export function getAppletFromUrl({
  validAppletIds,
  defaultAppletId,
  searchParam = "app",
} = {}) {
  try {
    const url = new URL(window.location.href);
    return normalizeAppletId(url.searchParams.get(searchParam), {
      validAppletIds,
      defaultAppletId,
    });
  } catch (error) {
    return defaultAppletId;
  }
}

export function setAppletInUrl(appletId, { replaceHistory = false, searchParam = "app" } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set(searchParam, appletId);
  const historyMethod = replaceHistory ? "replaceState" : "pushState";
  window.history[historyMethod]?.({ app: appletId }, "", url);
}

export function setupAppRouting({
  validAppletIds,
  defaultAppletId,
  applyAppletMode,
  searchParam = "app",
} = {}) {
  const readAppletFromUrl = () =>
    getAppletFromUrl({
      validAppletIds,
      defaultAppletId,
      searchParam,
    });

  applyAppletMode(readAppletFromUrl(), { updateUrl: true, replaceHistory: true });

  window.addEventListener("popstate", () => {
    applyAppletMode(readAppletFromUrl(), { updateUrl: false, replaceHistory: true });
  });
}
