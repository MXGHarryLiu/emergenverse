// Navigation + launcher UI helpers extracted from app shell.

function getCardSummary(appletId, appletMeta) {
  const summary = String(appletMeta?.[appletId]?.introSummary || "").trim();
  if (!summary) {
    return "Emergent behavior exploration";
  }
  if (summary.length <= 156) {
    return summary;
  }
  return `${summary.slice(0, 153).trimEnd()}...`;
}

function getAppletLauncherDomain(appletId, appletMeta) {
  return String(appletMeta?.[appletId]?.group || "").trim() || "other";
}

function isThumbnailPath(thumbnail) {
  const value = String(thumbnail || "").trim();
  if (!value) {
    return false;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return true;
  }
  if (value.startsWith("data:image/")) {
    return true;
  }
  return /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(value);
}

function getThumbnailIconClass(thumbnail) {
  const value = String(thumbnail || "").trim();
  if (!value) {
    return "bi bi-app";
  }
  if (value.startsWith("bi ")) {
    return value;
  }
  if (value.startsWith("bi-")) {
    return `bi ${value}`;
  }
  return `bi bi-${value}`;
}

function getGroups(appletOrder, appletMeta, sortMode) {
  const cards = appletOrder
    .map((id) => ({
      id,
      label: String(appletMeta?.[id]?.label || id),
      summary: getCardSummary(id, appletMeta),
      domain: getAppletLauncherDomain(id, appletMeta),
      thumbnail: String(appletMeta?.[id]?.thumbnail || "").trim(),
    }));

  if (sortMode === "alphabet") {
    return [{ title: "All Applets", cards: cards.sort((a, b) => a.label.localeCompare(b.label)) }];
  }

  const groupedCards = new Map();

  cards.forEach((card) => {
    if (!groupedCards.has(card.domain)) {
      groupedCards.set(card.domain, []);
    }
    groupedCards.get(card.domain).push(card);
  });

  return Array.from(groupedCards.entries())
    .sort(([leftTitle], [rightTitle]) => leftTitle.localeCompare(rightTitle))
    .map(([title, grouped]) => ({
      title,
      cards: grouped.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter((grouped) => grouped.cards.length > 0);
}

export function renderAppletNavigationFromConfig({
  defaultAppletId,
  appletOrder,
  appletMeta,
  onCloseMobileApplet,
} = {}) {
  const desktopHost = document.getElementById("applet-nav");
  const mobileHost = document.getElementById("mobile-applet-nav");
  if (!desktopHost && !mobileHost) {
    return;
  }

  if (desktopHost) {
    desktopHost.replaceChildren();

    const navInline = document.createElement("div");
    navInline.className = "applet-nav-inline";

    const currentButton = document.createElement("button");
    currentButton.type = "button";
    currentButton.className = "applet-nav-current";
    currentButton.id = "opened-apps-toggle";
    currentButton.setAttribute("title", "Switch or close opened applets");
    currentButton.setAttribute("aria-label", "Switch or close opened applets");
    currentButton.setAttribute("aria-controls", "opened-apps-menu");
    currentButton.setAttribute("aria-expanded", "false");

    const currentLabel = document.createElement("span");
    currentLabel.className = "applet-nav-current-label";
    currentLabel.id = "opened-apps-title";
    currentLabel.textContent = String(appletMeta?.[defaultAppletId]?.key ?? defaultAppletId);
    currentButton.appendChild(currentLabel);

    const currentIcon = document.createElement("i");
    currentIcon.className = "bi bi-caret-down-fill";
    currentIcon.setAttribute("aria-hidden", "true");
    currentButton.appendChild(currentIcon);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "applet-nav-add";
    addButton.id = "launcher-open";
    addButton.setAttribute("title", "Open launcher");
    addButton.setAttribute("aria-label", "Open launcher");
    addButton.innerHTML = '<i class="bi bi-plus-lg" aria-hidden="true"></i>';

    navInline.append(currentButton, addButton);

    const menu = document.createElement("div");
    menu.className = "opened-apps-menu is-hidden";
    menu.id = "opened-apps-menu";
    menu.setAttribute("aria-hidden", "true");

    const menuList = document.createElement("div");
    menuList.className = "opened-apps-menu-list";
    menuList.id = "opened-apps-menu-list";

    menu.append(menuList);
    desktopHost.append(navInline, menu);
  }

  if (mobileHost) {
    mobileHost.replaceChildren();
    appletOrder.forEach((id, index) => {
      const meta = appletMeta?.[id] || {};
      const tabLabel = String(meta.key ?? id);
      const titleLabel = String(meta.label ?? meta.key ?? tabLabel);

      const mobileRow = document.createElement("div");
      mobileRow.className = "mobile-applet-row";

      const mobileButton = document.createElement("button");
      mobileButton.className = "mobile-applet-tab";
      if (index === 0) {
        mobileButton.classList.add("is-active");
      }
      mobileButton.type = "button";
      mobileButton.setAttribute("data-applet-item", id);
      mobileButton.setAttribute("aria-selected", String(index === 0));
      mobileButton.setAttribute("title", `${titleLabel} applet`);
      mobileButton.textContent = tabLabel;
      mobileRow.appendChild(mobileButton);

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "mobile-applet-close";
      closeButton.setAttribute("title", `Close ${titleLabel}`);
      closeButton.setAttribute("aria-label", `Close ${titleLabel}`);
      closeButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onCloseMobileApplet?.(id, { keepLauncherOpen: false });
      });
      mobileRow.appendChild(closeButton);

      mobileHost.appendChild(mobileRow);
    });
  }
}

export function applyLoadedAppletTabVisibility({
  appletTabs,
  loadedAppletIdSet,
  loadedAppletIds,
} = {}) {
  appletTabs?.forEach((tab) => {
    const tabApplet = String(tab.getAttribute("data-applet-item") || "").trim();
    const isVisible = loadedAppletIdSet?.has(tabApplet);
    const row = tab.closest(".mobile-applet-row");
    if (row) {
      row.classList.toggle("is-hidden", !isVisible);
    }
    tab.classList.toggle("is-hidden", !isVisible);
    tab.disabled = !isVisible;
    tab.setAttribute("aria-hidden", String(!isVisible));
    const closeButton = row?.querySelector(".mobile-applet-close");
    if (closeButton) {
      const canClose = isVisible && (loadedAppletIds?.length ?? 0) > 0;
      closeButton.classList.toggle("is-hidden", !canClose);
      closeButton.disabled = !canClose;
    }
    if (!isVisible) {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
    }
  });
}

export function closeOpenedAppsMenu(dom) {
  if (!dom?.openedAppsMenu || !dom?.openedAppsToggle) {
    return;
  }
  dom.openedAppsMenu.classList.add("is-hidden");
  dom.openedAppsMenu.setAttribute("aria-hidden", "true");
  dom.openedAppsToggle.setAttribute("aria-expanded", "false");
}

export function openOpenedAppsMenu(dom) {
  if (!dom?.openedAppsMenu || !dom?.openedAppsToggle) {
    return;
  }
  dom.openedAppsMenu.classList.remove("is-hidden");
  dom.openedAppsMenu.setAttribute("aria-hidden", "false");
  dom.openedAppsToggle.setAttribute("aria-expanded", "true");
}

export function renderOpenedAppsMenu({
  dom,
  appletMeta,
  activeApplet,
  loadedAppletIds,
  onOpenApplet,
  onCloseApplet,
} = {}) {
  if (!dom?.openedAppsMenuList || !dom?.openedAppsToggle) {
    return;
  }

  if (dom.openedAppsTitle) {
    dom.openedAppsTitle.textContent = loadedAppletIds?.length > 0
      ? String(appletMeta?.[activeApplet]?.key ?? activeApplet)
      : "launcher";
  }

  dom.openedAppsToggle.disabled = (loadedAppletIds?.length ?? 0) === 0;
  dom.openedAppsToggle.setAttribute("title", `Manage opened applets (${loadedAppletIds?.length ?? 0})`);
  dom.openedAppsToggle.setAttribute("aria-label", `Manage opened applets (${loadedAppletIds?.length ?? 0})`);

  const canClose = (loadedAppletIds?.length ?? 0) > 0;
  const fragment = document.createDocumentFragment();

  (loadedAppletIds || []).forEach((appletId) => {
    const row = document.createElement("div");
    row.className = "opened-apps-menu-row";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "opened-apps-menu-open";
    if (appletId === activeApplet) {
      openButton.classList.add("is-active");
    }
    openButton.textContent = appletMeta?.[appletId]?.key ?? appletId;
    openButton.addEventListener("click", () => {
      onOpenApplet?.(appletId);
    });

    row.appendChild(openButton);

    if (canClose) {
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "opened-apps-menu-close";
      closeButton.setAttribute("aria-label", `Close ${appletMeta?.[appletId]?.label ?? appletId}`);
      closeButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onCloseApplet?.(appletId);
      });
      row.appendChild(closeButton);
    }

    fragment.appendChild(row);
  });

  dom.openedAppsMenuList.replaceChildren(fragment);
}

export function setupOpenedAppsMenu({
  dom,
  onEscClose = true,
} = {}) {
  if (!dom?.openedAppsToggle || !dom?.openedAppsMenu) {
    return;
  }

  dom.openedAppsToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    const isHidden = dom.openedAppsMenu.classList.contains("is-hidden");
    if (isHidden) {
      openOpenedAppsMenu(dom);
    } else {
      closeOpenedAppsMenu(dom);
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    const clickedInsideMenu = dom.openedAppsMenu.contains(target);
    const clickedToggle = dom.openedAppsToggle.contains(target);
    if (!clickedInsideMenu && !clickedToggle) {
      closeOpenedAppsMenu(dom);
    }
  });

  if (onEscClose) {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeOpenedAppsMenu(dom);
      }
    });
  }
}

export function renderLauncherNavigator({
  dom,
  appletOrder,
  appletMeta,
  activeApplet,
  loadedAppletIds,
  loadedAppletIdSet,
  maxLoadedAppletCount,
  launcherState,
  onLauncherCardClick,
  onCloseAppletFromCard,
} = {}) {
  if (!dom?.launcherGridGroups) {
    return;
  }

  const sortMode = launcherState?.sortMode || "grouped";
  const mode = launcherState?.mode || "start";
  const loadedCount = loadedAppletIds?.length ?? 0;
  const canGoBack = mode === "manage" && loadedCount > 0;
  const statusMessage = String(launcherState?.statusMessage || "");
  const groups = getGroups(appletOrder || [], appletMeta || {}, sortMode);
  const fragment = document.createDocumentFragment();

  groups.forEach((group) => {
    const section = document.createElement("section");
    section.className = "launcher-group";

    const title = document.createElement("h2");
    title.className = "launcher-group-title";
    title.textContent = group.title;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "launcher-card-grid";

    group.cards.forEach((card) => {
      const showOpenState = mode === "manage";
      const isOpen = loadedAppletIdSet?.has(card.id);
      const canClose = showOpenState && isOpen && (loadedAppletIds?.length ?? 0) > 0;
      const cardButton = document.createElement("button");
      cardButton.type = "button";
      cardButton.className = "launcher-card";
      if (showOpenState && isOpen) {
        cardButton.classList.add("is-opened");
      }
      if (showOpenState && card.id === activeApplet) {
        cardButton.classList.add("is-active-applet");
      }
      cardButton.setAttribute("data-launcher-applet", card.id);
      cardButton.setAttribute("aria-label", `Open ${card.label}`);

      const cardBody = document.createElement("div");
      cardBody.className = "launcher-card-body";

      if (card.thumbnail) {
        cardBody.classList.add("has-thumbnail");
        const thumbWrap = document.createElement("div");
        thumbWrap.className = "launcher-card-thumb";
        if (isThumbnailPath(card.thumbnail)) {
          const thumbImg = document.createElement("img");
          thumbImg.className = "launcher-card-thumb-img";
          thumbImg.src = card.thumbnail;
          thumbImg.alt = "";
          thumbImg.loading = "lazy";
          thumbWrap.appendChild(thumbImg);
        } else {
          thumbWrap.classList.add("is-icon");
          const thumbIcon = document.createElement("i");
          thumbIcon.className = `${getThumbnailIconClass(card.thumbnail)} launcher-card-thumb-icon`;
          thumbIcon.setAttribute("aria-hidden", "true");
          thumbWrap.appendChild(thumbIcon);
        }
        cardBody.appendChild(thumbWrap);
      }

      const cardContent = document.createElement("div");
      cardContent.className = "launcher-card-content";

      const cardHead = document.createElement("div");
      cardHead.className = "launcher-card-head";

      const cardTitle = document.createElement("h3");
      cardTitle.className = "launcher-card-title";
      cardTitle.textContent = card.label;
      cardHead.appendChild(cardTitle);

      if (showOpenState && isOpen && (loadedAppletIds?.length ?? 0) > 0) {
        const openMark = document.createElement(canClose ? "button" : "span");
        openMark.className = "launcher-card-close";
        openMark.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
        if (canClose) {
          openMark.type = "button";
          openMark.setAttribute("aria-label", `Close ${card.label}`);
          openMark.setAttribute("title", "Click to close");
          openMark.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onCloseAppletFromCard?.(card.id);
          });
        } else {
          openMark.classList.add("is-static");
          openMark.setAttribute("title", "Click card to open");
          openMark.setAttribute("aria-hidden", "true");
        }
        cardHead.appendChild(openMark);
      }

      const summaryText = document.createElement("p");
      summaryText.className = "launcher-card-copy";
      summaryText.textContent = card.summary;

      cardContent.appendChild(cardHead);
      cardContent.appendChild(summaryText);
      cardBody.appendChild(cardContent);
      cardButton.appendChild(cardBody);
      cardButton.setAttribute(
        "title",
        canClose ? "Click card to switch. X closes applet." : "Click card to open",
      );
      cardButton.addEventListener("click", () => onLauncherCardClick?.(card.id));
      grid.appendChild(cardButton);
    });

    section.appendChild(grid);
    fragment.appendChild(section);
  });

  dom.launcherGridGroups.replaceChildren(fragment);

  if (dom.launcherStatusCopy) {
    const hasStatus = Boolean(statusMessage);
    dom.launcherStatusCopy.classList.toggle("is-hidden", !hasStatus);
    dom.launcherStatusCopy.textContent = hasStatus ? statusMessage : "";
  }
  if (dom.launcherSortToggle) {
    const grouped = sortMode !== "alphabet";
    const modeLabel = grouped ? "grouped" : "alphabetical";
    const nextLabel = grouped ? "alphabetical" : "grouped";
    dom.launcherSortToggle.setAttribute("title", `Sort: ${modeLabel}. Click for ${nextLabel}.`);
    dom.launcherSortToggle.setAttribute("aria-label", `Sort: ${modeLabel}. Click for ${nextLabel}.`);
    dom.launcherSortToggle.innerHTML = grouped
      ? '<i class="bi bi-grid-3x3-gap-fill" aria-hidden="true"></i>'
      : '<i class="bi bi-sort-alpha-down" aria-hidden="true"></i>';
  }
  if (dom.launcherClose) {
    dom.launcherClose.classList.toggle("is-hidden", !canGoBack);
    dom.launcherClose.innerHTML = '<i class="bi bi-arrow-left" aria-hidden="true"></i>';
    dom.launcherClose.setAttribute("title", "Back to active app");
    dom.launcherClose.setAttribute("aria-label", "Back to active app");
  }
  if (launcherState) {
    launcherState.canGoBack = canGoBack;
  }
}

export function showLauncherNavigator({
  dom,
  launcherState,
  mode = "start",
  onCloseMobileNavigation,
  onCloseOpenedAppsMenu,
  onRenderLauncherNavigator,
} = {}) {
  if (!dom?.launcherOverlay) {
    return;
  }
  document.documentElement.classList.remove("boot-show-launcher");
  if (launcherState) {
    launcherState.mode = mode === "manage" ? "manage" : "start";
    launcherState.sortMode = "grouped";
    launcherState.statusMessage = "";
    launcherState.canGoBack = false;
  }
  onCloseMobileNavigation?.();
  onCloseOpenedAppsMenu?.();
  onRenderLauncherNavigator?.();
  dom.launcherOverlay.classList.remove("is-hidden");
  dom.launcherOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("launcher-visible");
}

export function hideLauncherNavigator({
  dom,
  launcherState,
  onCloseOpenedAppsMenu,
} = {}) {
  if (!dom?.launcherOverlay) {
    return;
  }
  document.documentElement.classList.remove("boot-show-launcher");
  dom.launcherOverlay.classList.add("is-hidden");
  dom.launcherOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("launcher-visible");
  if (launcherState) {
    launcherState.statusMessage = "";
    launcherState.canGoBack = false;
  }
  onCloseOpenedAppsMenu?.();
}

export function setupLauncherNavigator({
  dom,
  siteVersion,
  launcherState,
  onRenderLauncherNavigator,
  onHideLauncherNavigator,
} = {}) {
  if (!dom?.launcherOverlay) {
    return;
  }
  if (dom.launcherSiteVersion) {
    dom.launcherSiteVersion.textContent = String(siteVersion || "--");
  }

  dom.launcherSortToggle?.addEventListener("click", () => {
    if (!launcherState) {
      return;
    }
    launcherState.sortMode = launcherState.sortMode === "grouped" ? "alphabet" : "grouped";
    onRenderLauncherNavigator?.();
  });

  dom.launcherClose?.addEventListener("click", () => {
    if (launcherState?.canGoBack) {
      onHideLauncherNavigator?.();
    }
  });

  dom.launcherOverlay.addEventListener("click", (event) => {
    if (event.target === dom.launcherOverlay && launcherState?.canGoBack) {
      onHideLauncherNavigator?.();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    const overlayVisible = !dom.launcherOverlay.classList.contains("is-hidden");
    if (!overlayVisible || !launcherState?.canGoBack) {
      return;
    }
    event.preventDefault();
    onHideLauncherNavigator?.();
  });

  onRenderLauncherNavigator?.();
}

export function setupLauncherEntryPoints({
  launcherOpen,
  onOpenLauncher,
} = {}) {
  launcherOpen?.addEventListener("click", () => {
    onOpenLauncher?.();
  });
}
