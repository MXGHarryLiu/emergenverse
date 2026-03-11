import * as THREE from "three";

// Theme state manager and scene-theme helpers for auto/light/dark mode.
const DEFAULT_THEME_MODES = ["auto", "dark", "light"];
const DEFAULT_STORAGE_KEY = "emergenverse-theme-mode";
const WORLD_THEME_PRESETS = {
  dark: {
    background: 0x030713,
    fogColor: 0x050a17,
    fogDensity: 0.0022,
  },
  light: {
    background: 0xdfe8f8,
    fogColor: 0xd8e2f5,
    fogDensity: 0.0017,
  },
};

export function createThemeManager({
  toggleButton,
  labelEl,
  iconEl,
  onThemeChange,
  storageKey = DEFAULT_STORAGE_KEY,
  modes = DEFAULT_THEME_MODES,
} = {}) {
  const validModes = Array.isArray(modes) && modes.length > 0 ? modes : DEFAULT_THEME_MODES;
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  let mode = loadThemeMode(validModes, storageKey);

  const apply = () => {
    const effectiveTheme = getEffectiveTheme(mode, mediaQuery.matches);
    document.body.setAttribute("data-theme", effectiveTheme);
    updateToggleVisual(toggleButton, labelEl, iconEl, mode, effectiveTheme);
    if (typeof onThemeChange === "function") {
      onThemeChange(effectiveTheme, mode);
    }
  };

  const cycleMode = () => {
    const currentIndex = validModes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % validModes.length;
    mode = validModes[nextIndex];
    saveThemeMode(mode, storageKey);
    apply();
  };

  const onSystemThemeChanged = () => {
    if (mode === "auto") {
      apply();
    }
  };

  if (toggleButton) {
    toggleButton.addEventListener("click", cycleMode);
  }

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onSystemThemeChanged);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(onSystemThemeChanged);
  }

  apply();

  return {
    getMode: () => mode,
    getEffectiveTheme: () => getEffectiveTheme(mode, mediaQuery.matches),
    apply,
    cycleMode,
  };
}

export function applyWorldTheme(scene, theme = "dark") {
  if (!scene) {
    return;
  }

  const preset = WORLD_THEME_PRESETS[theme] || WORLD_THEME_PRESETS.dark;
  if (!scene.background) {
    scene.background = new THREE.Color(preset.background);
  } else {
    scene.background.set(preset.background);
  }

  if (!scene.fog) {
    scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);
    return;
  }

  scene.fog.color.set(preset.fogColor);
  scene.fog.density = preset.fogDensity;
}

function getEffectiveTheme(mode, prefersDark) {
  if (mode === "auto") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

function loadThemeMode(validModes, storageKey) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored && validModes.includes(stored)) {
      return stored;
    }
  } catch (error) {
    // Ignore storage failures and fallback to auto mode.
  }
  return "auto";
}

function saveThemeMode(mode, storageKey) {
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch (error) {
    // Ignore storage failures.
  }
}

function updateToggleVisual(toggleButton, labelEl, iconEl, mode, effectiveTheme) {
  if (!toggleButton || !iconEl) {
    return;
  }

  const iconMap = {
    auto: "bi-circle-half",
    dark: "bi-moon-stars-fill",
    light: "bi-sun-fill",
  };

  if (labelEl) {
    labelEl.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  }
  toggleButton.setAttribute("title", `Theme: ${mode}. Click to switch mode`);
  toggleButton.setAttribute("aria-label", `Theme: ${mode}. Click to switch mode`);
  iconEl.className = `bi ${iconMap[mode] || "bi-circle-half"}`;
  toggleButton.dataset.effectiveTheme = effectiveTheme;
}
