import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const params = {
  boidCount: 220,
  boidScale: 1.4,
  perceptionRadius: 18,
  separationDistance: 8,
  maxSpeed: 8,
  minSpeed: 2.5,
  maxAccel: 6,
  alignmentWeight: 1.0,
  cohesionWeight: 0.9,
  separationWeight: 1.35,
  worldSizeX: 120,
  worldSizeY: 120,
  worldSizeZ: 120,
  boundaryMode: "cyclic",
  colorMode: "speed",
  colorLow: "#4cd3b6",
  colorHigh: "#5aa4ff",
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  autoRotate: false,
  autoRotateSpeed: 0.35,
  showBounds: true,
  cameraLocked: false,
  projectionMode: "perspective",
  keyboardMoveSpeed: 42,
  paused: false,
};

const cameraDefaults = {
  cameraDistance: 185,
  cameraHeight: 80,
  cameraFov: 50,
  autoRotate: false,
  autoRotateSpeed: 0.35,
  cameraLocked: false,
  projectionMode: "perspective",
};

const dom = {
  appShell: document.querySelector(".app-shell"),
  leftPanel: document.getElementById("left-panel"),
  rightPanel: document.getElementById("right-panel"),
  hideLeftPanel: document.getElementById("hide-left-panel"),
  hideRightPanel: document.getElementById("hide-right-panel"),
  showLeftPanel: document.getElementById("show-left-panel"),
  showRightPanel: document.getElementById("show-right-panel"),
  sceneHost: document.getElementById("scene-host"),
  frameSize: document.getElementById("frame-size"),
  chartCount: document.getElementById("chart-count"),
  chartSpeed: document.getElementById("chart-speed"),
  chartNeighbors: document.getElementById("chart-neighbors"),
  chartCountLive: document.getElementById("chart-count-live"),
  chartSpeedLive: document.getElementById("chart-speed-live"),
  chartNeighborsLive: document.getElementById("chart-neighbors-live"),
  chartToggles: document.querySelectorAll("[data-chart-toggle]"),
  runState: document.getElementById("run-state"),
  togglePause: document.getElementById("toggle-pause"),
  resetSim: document.getElementById("reset-sim"),
  resetCamera: document.getElementById("reset-camera"),
  autoRotate: document.getElementById("auto-rotate"),
  showBounds: document.getElementById("show-bounds"),
  cameraLocked: document.getElementById("camera-locked"),
  boundaryMode: document.getElementById("boundary-mode"),
  colorMode: document.getElementById("color-mode"),
  colorLow: document.getElementById("color-low"),
  colorHigh: document.getElementById("color-high"),
  cameraTopOrtho: document.getElementById("camera-top-ortho"),
  cameraPerspective: document.getElementById("camera-perspective"),
  themeToggle: document.getElementById("theme-toggle"),
  themeToggleLabel: document.getElementById("theme-toggle-label"),
  themeToggleIcon: document.getElementById("theme-toggle-icon"),
  controlSectionToggles: document.querySelectorAll("[data-control-toggle]"),
};

const uiState = {
  leftPanelVisible: true,
  rightPanelVisible: true,
};

const themeModes = ["auto", "dark", "light"];
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");
let themeMode = loadThemeMode();

const worldUp = new THREE.Vector3(0, 0, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030713);
scene.fog = new THREE.FogExp2(0x050a17, 0.0022);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute("aria-label", "3D boids simulation canvas");
dom.sceneHost.appendChild(renderer.domElement);

const perspectiveCamera = new THREE.PerspectiveCamera(params.cameraFov, 1, 0.1, 3000);
perspectiveCamera.up.copy(worldUp);

const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
orthographicCamera.up.set(0, 1, 0);

let activeCamera = perspectiveCamera;

const controls = new OrbitControls(activeCamera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 20;
controls.maxDistance = 1200;
controls.autoRotateSpeed = params.autoRotateSpeed;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.mouseButtons.MIDDLE = THREE.MOUSE.NONE;
controls.enableZoom = false;
controls.mouseButtons.WHEEL = THREE.MOUSE.NONE;

const ambientLight = new THREE.AmbientLight(0x9cb7eb, 1.15);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xbef5ff, 1.1);
keyLight.position.set(70, -70, 130);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x53d7ba, 0.72);
fillLight.position.set(-80, 95, -55);
scene.add(fillLight);

const starField = buildStarField(900, 680);
scene.add(starField);

let boundsLines = null;
let floorGrid = null;

const boidGeometry = new THREE.ConeGeometry(0.7, 2.6, 10);
boidGeometry.rotateX(Math.PI / 2);
const boidMaterial = new THREE.MeshStandardMaterial({
  color: 0xeafffa,
  emissive: 0x1b6d62,
  emissiveIntensity: 0.95,
  roughness: 0.26,
  metalness: 0.06,
  flatShading: true,
  vertexColors: true,
});

const boids = [];
let boidMesh = null;
const tempObject = new THREE.Object3D();
const forwardVector = new THREE.Vector3(0, 0, 1);

const separationDelta = new THREE.Vector3();
const alignment = new THREE.Vector3();
const cohesion = new THREE.Vector3();
const separation = new THREE.Vector3();
const velocityDir = new THREE.Vector3();

const forwardMove = new THREE.Vector3();
const rightMove = new THREE.Vector3();
const upMove = new THREE.Vector3();
const moveDelta = new THREE.Vector3();
const lookOffset = new THREE.Vector3();
const rotationQuat = new THREE.Quaternion();

const lowColor = new THREE.Color(params.colorLow);
const highColor = new THREE.Color(params.colorHigh);
const instanceColor = new THREE.Color();

const keyState = {
  KeyA: false,
  KeyS: false,
  KeyD: false,
  KeyQ: false,
  KeyW: false,
  KeyE: false,
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  ArrowDown: false,
  BracketLeft: false,
  BracketRight: false,
  ShiftLeft: false,
  ShiftRight: false,
};

const speedHistory = [];
const countHistory = [];
const neighborHistory = [];
const chartMaxPoints = 160;
let chartFrameCounter = 0;

setPerspectiveCameraFromParams(false);
updateOrthographicCamera(true);
applyCameraInteractivity();
rebuildBoundsAndGrid();
spawnBoids(params.boidCount);
setupControls();
setupPanelToggles();
setupControlSectionCollapses();
setupThemeToggle();
setupTrendCharts();
setupChartCollapses();
handleViewportResize();

const resizeObserver = new ResizeObserver(() => handleViewportResize());
resizeObserver.observe(dom.sceneHost);
window.addEventListener("resize", handleViewportResize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);

const clock = new THREE.Clock();
animate();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  if (!params.paused) {
    stepSimulation(dt);
  }

  updateKeyboardTranslation(dt);

  controls.autoRotate =
    params.autoRotate &&
    !params.cameraLocked &&
    params.projectionMode === "perspective";
  controls.autoRotateSpeed = params.autoRotateSpeed;
  controls.update();

  renderer.render(scene, activeCamera);
}

function spawnBoids(count) {
  boids.length = 0;

  const spawnRangeX = params.worldSizeX * 0.9;
  const spawnRangeY = params.worldSizeY * 0.9;
  const spawnRangeZ = params.worldSizeZ * 0.9;

  for (let i = 0; i < count; i += 1) {
    const startVelocity = randomDirection().multiplyScalar(
      THREE.MathUtils.randFloat(params.maxSpeed * 0.45, params.maxSpeed * 0.95),
    );

    boids.push({
      position: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(spawnRangeX),
        THREE.MathUtils.randFloatSpread(spawnRangeY),
        THREE.MathUtils.randFloatSpread(spawnRangeZ),
      ),
      velocity: startVelocity,
      acceleration: new THREE.Vector3(),
      neighbors: 0,
      lost: false,
    });
  }

  rebuildBoidMeshForCurrentBoids();

  resetTrendCharts();
  syncBoidInstances();
  updateStats(0, 0);
}

function rebuildBoidMeshForCurrentBoids() {
  if (boidMesh) {
    scene.remove(boidMesh);
    boidMesh.dispose();
  }

  const capacity = Math.max(boids.length, 1);
  boidMesh = new THREE.InstancedMesh(boidGeometry, boidMaterial, capacity);
  boidMesh.count = boids.length;
  boidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(boidMesh);
}

function stepSimulation(dt) {
  const perceptionSq = params.perceptionRadius * params.perceptionRadius;
  const separationSq = params.separationDistance * params.separationDistance;
  const usingLostBounds = params.boundaryMode === "lost";

  let speedSum = 0;
  let neighborSum = 0;

  for (let i = 0; i < boids.length; i += 1) {
    const boid = boids[i];

    alignment.set(0, 0, 0);
    cohesion.set(0, 0, 0);
    separation.set(0, 0, 0);

    let neighborCount = 0;
    let separationCount = 0;

    for (let j = 0; j < boids.length; j += 1) {
      if (j === i) {
        continue;
      }

      const other = boids[j];
      const distSq = boid.position.distanceToSquared(other.position);

      if (distSq < perceptionSq) {
        alignment.add(other.velocity);
        cohesion.add(other.position);
        neighborCount += 1;
      }

      if (distSq < separationSq && distSq > 0.000001) {
        separationDelta.subVectors(boid.position, other.position);
        separationDelta.divideScalar(distSq);
        separation.add(separationDelta);
        separationCount += 1;
      }
    }

    boid.neighbors = neighborCount;
    boid.acceleration.set(0, 0, 0);

    if (neighborCount > 0) {
      alignment.divideScalar(neighborCount);
      if (alignment.lengthSq() > 0) {
        alignment.setLength(params.maxSpeed);
        alignment.sub(boid.velocity);
        limitVector(alignment, params.maxAccel);
        alignment.multiplyScalar(params.alignmentWeight);
        boid.acceleration.add(alignment);
      }

      cohesion.divideScalar(neighborCount);
      cohesion.sub(boid.position);
      if (cohesion.lengthSq() > 0) {
        cohesion.setLength(params.maxSpeed);
        cohesion.sub(boid.velocity);
        limitVector(cohesion, params.maxAccel);
        cohesion.multiplyScalar(params.cohesionWeight);
        boid.acceleration.add(cohesion);
      }
    }

    if (separationCount > 0) {
      separation.divideScalar(separationCount);
      if (separation.lengthSq() > 0) {
        separation.setLength(params.maxSpeed);
        separation.sub(boid.velocity);
        limitVector(separation, params.maxAccel);
        separation.multiplyScalar(params.separationWeight);
        boid.acceleration.add(separation);
      }
    }

    boid.velocity.addScaledVector(boid.acceleration, dt);
    const minSpeed = Math.min(params.minSpeed, params.maxSpeed * 0.85);
    enforceSpeedBounds(boid.velocity, minSpeed, params.maxSpeed);
    boid.position.addScaledVector(boid.velocity, dt);

    const activeBoid = applyBoundaryConditions(boid);
    if (!activeBoid) {
      continue;
    }

    speedSum += boid.velocity.length();
    neighborSum += boid.neighbors;
  }

  if (usingLostBounds) {
    removeLostBoids();
  }

  syncBoidInstances();
  updateStats(speedSum, neighborSum);
}

function syncBoidInstances() {
  const halfZ = params.worldSizeZ * 0.5;

  for (let i = 0; i < boids.length; i += 1) {
    const boid = boids[i];

    velocityDir.copy(boid.velocity);
    if (velocityDir.lengthSq() < 0.00001) {
      velocityDir.copy(forwardVector);
    } else {
      velocityDir.normalize();
    }

    tempObject.position.copy(boid.position);
    tempObject.quaternion.setFromUnitVectors(forwardVector, velocityDir);
    tempObject.scale.setScalar(params.boidScale);
    tempObject.updateMatrix();
    boidMesh.setMatrixAt(i, tempObject.matrix);

    if (params.colorMode === "solid") {
      instanceColor.copy(lowColor);
    } else {
      instanceColor.copy(lowColor).lerp(highColor, computeColorFactor(boid, halfZ));
    }
    boidMesh.setColorAt(i, instanceColor);
  }

  boidMesh.instanceMatrix.needsUpdate = true;
  if (boidMesh.instanceColor) {
    boidMesh.instanceColor.needsUpdate = true;
  }
}

function computeColorFactor(boid, halfZ) {
  if (params.colorMode === "speed") {
    return THREE.MathUtils.clamp(boid.velocity.length() / Math.max(params.maxSpeed, 0.001), 0, 1);
  }

  if (params.colorMode === "altitude") {
    return THREE.MathUtils.clamp((boid.position.z + halfZ) / Math.max(params.worldSizeZ, 0.001), 0, 1);
  }

  if (params.colorMode === "neighbors") {
    return THREE.MathUtils.clamp(boid.neighbors / 16, 0, 1);
  }

  if (params.colorMode === "heading") {
    velocityDir.copy(boid.velocity);
    if (velocityDir.lengthSq() < 0.00001) {
      return 0.5;
    }
    velocityDir.normalize();
    return THREE.MathUtils.clamp(velocityDir.z * 0.5 + 0.5, 0, 1);
  }

  return 0.5;
}

function rebuildBoundsAndGrid() {
  if (boundsLines) {
    scene.remove(boundsLines);
    boundsLines.geometry.dispose();
    boundsLines.material.dispose();
  }

  if (floorGrid) {
    scene.remove(floorGrid);
    floorGrid.geometry.dispose();
    if (Array.isArray(floorGrid.material)) {
      floorGrid.material.forEach((material) => material.dispose());
    } else {
      floorGrid.material.dispose();
    }
  }

  const boundsGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(params.worldSizeX, params.worldSizeY, params.worldSizeZ),
  );
  const boundsMaterial = new THREE.LineBasicMaterial({
    color: 0x4d7dd8,
    transparent: true,
    opacity: 0.4,
  });

  boundsLines = new THREE.LineSegments(boundsGeometry, boundsMaterial);
  boundsLines.visible = params.showBounds;
  scene.add(boundsLines);

  const groundBase = Math.max(params.worldSizeX, params.worldSizeY);
  floorGrid = new THREE.GridHelper(
    groundBase,
    Math.max(10, Math.floor(groundBase / 6)),
    0x4269b2,
    0x1a3558,
  );
  floorGrid.rotation.x = Math.PI / 2;
  floorGrid.scale.set(
    params.worldSizeX / Math.max(groundBase, 1),
    1,
    params.worldSizeY / Math.max(groundBase, 1),
  );
  floorGrid.position.z = -params.worldSizeZ * 0.5;

  const gridMaterials = Array.isArray(floorGrid.material)
    ? floorGrid.material
    : [floorGrid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.2;
  });

  scene.add(floorGrid);

  for (let i = 0; i < boids.length; i += 1) {
    applyBoundaryConditions(boids[i]);
  }

  updateOrthographicCamera(false);
}

function setupControls() {
  bindRange("boid-scale", "boid-scale-value", (value) => {
    params.boidScale = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("perception-radius", "perception-radius-value", (value) => {
    params.perceptionRadius = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("separation-distance", "separation-distance-value", (value) => {
    params.separationDistance = value;
    return `${value.toFixed(1)} m`;
  });

  bindRange("max-speed", "max-speed-value", (value) => {
    params.maxSpeed = value;
    return `${value.toFixed(1)} m/s`;
  });

  bindRange("max-accel", "max-accel-value", (value) => {
    params.maxAccel = value;
    return `${value.toFixed(1)} m/s²`;
  });

  bindRange("alignment-weight", "alignment-weight-value", (value) => {
    params.alignmentWeight = value;
    return value.toFixed(2);
  });

  bindRange("cohesion-weight", "cohesion-weight-value", (value) => {
    params.cohesionWeight = value;
    return value.toFixed(2);
  });

  bindRange("separation-weight", "separation-weight-value", (value) => {
    params.separationWeight = value;
    return value.toFixed(2);
  });

  bindRange("world-size-x", "world-size-x-value", (value) => {
    params.worldSizeX = value;
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("world-size-y", "world-size-y-value", (value) => {
    params.worldSizeY = value;
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("world-size-z", "world-size-z-value", (value) => {
    params.worldSizeZ = value;
    rebuildBoundsAndGrid();
    return `${Math.round(value)} m`;
  });

  bindRange("camera-distance", "camera-distance-value", (value) => {
    params.cameraDistance = value;
    if (params.projectionMode === "perspective") {
      setPerspectiveCameraFromParams(true);
    } else {
      updateOrthographicCamera(true);
    }
    return `${Math.round(value)} m`;
  });

  bindRange("camera-height", "camera-height-value", (value) => {
    params.cameraHeight = value;
    if (params.projectionMode === "perspective") {
      setPerspectiveCameraFromParams(true);
    }
    return `${Math.round(value)} m`;
  });

  bindRange("camera-fov", "camera-fov-value", (value) => {
    params.cameraFov = value;
    perspectiveCamera.fov = value;
    perspectiveCamera.updateProjectionMatrix();
    return `${Math.round(value)}°`;
  });

  bindRange("auto-rotate-speed", "auto-rotate-speed-value", (value) => {
    params.autoRotateSpeed = value;
    return value.toFixed(2);
  });

  const boidCountInput = document.getElementById("boid-count");
  const boidCountValue = document.getElementById("boid-count-value");
  boidCountInput.addEventListener("input", () => {
    boidCountValue.textContent = boidCountInput.value;
    params.boidCount = Number(boidCountInput.value);
    spawnBoids(params.boidCount);
  });

  dom.togglePause.addEventListener("click", () => {
    params.paused = !params.paused;
    updateSimulationStateUI();
  });

  dom.resetSim.addEventListener("click", () => {
    spawnBoids(params.boidCount);
  });

  dom.autoRotate.addEventListener("change", () => {
    params.autoRotate = dom.autoRotate.checked;
  });

  dom.showBounds.addEventListener("change", () => {
    params.showBounds = dom.showBounds.checked;
    if (boundsLines) {
      boundsLines.visible = params.showBounds;
    }
  });

  dom.cameraLocked.addEventListener("change", () => {
    params.cameraLocked = dom.cameraLocked.checked;
    applyCameraInteractivity();
  });

  dom.boundaryMode.addEventListener("change", () => {
    params.boundaryMode = dom.boundaryMode.value;

    for (let i = 0; i < boids.length; i += 1) {
      applyBoundaryConditions(boids[i]);
    }

    if (params.boundaryMode === "lost") {
      removeLostBoids();
    }

    let speedSum = 0;
    let neighborSum = 0;
    for (let i = 0; i < boids.length; i += 1) {
      speedSum += boids[i].velocity.length();
      neighborSum += boids[i].neighbors;
    }

    syncBoidInstances();
    updateStats(speedSum, neighborSum);
  });

  dom.colorMode.addEventListener("change", () => {
    params.colorMode = dom.colorMode.value;
    syncBoidInstances();
  });

  dom.colorLow.addEventListener("input", () => {
    params.colorLow = dom.colorLow.value;
    lowColor.set(params.colorLow);
    syncBoidInstances();
  });

  dom.colorHigh.addEventListener("input", () => {
    params.colorHigh = dom.colorHigh.value;
    highColor.set(params.colorHigh);
    syncBoidInstances();
  });

  dom.cameraTopOrtho.addEventListener("click", () => {
    params.projectionMode = "orthographic";
    switchToOrthographicTop();
    updateViewportLabel();
  });

  dom.cameraPerspective.addEventListener("click", () => {
    params.projectionMode = "perspective";
    switchToPerspective();
    updateViewportLabel();
  });

  dom.resetCamera.addEventListener("click", () => {
    params.cameraDistance = cameraDefaults.cameraDistance;
    params.cameraHeight = cameraDefaults.cameraHeight;
    params.cameraFov = cameraDefaults.cameraFov;
    params.autoRotate = cameraDefaults.autoRotate;
    params.autoRotateSpeed = cameraDefaults.autoRotateSpeed;
    params.cameraLocked = cameraDefaults.cameraLocked;
    params.projectionMode = cameraDefaults.projectionMode;

    setControlValue("camera-distance", params.cameraDistance, "camera-distance-value", (value) => `${Math.round(value)} m`);
    setControlValue("camera-height", params.cameraHeight, "camera-height-value", (value) => `${Math.round(value)} m`);
    setControlValue("camera-fov", params.cameraFov, "camera-fov-value", (value) => `${Math.round(value)}°`);
    setControlValue(
      "auto-rotate-speed",
      params.autoRotateSpeed,
      "auto-rotate-speed-value",
      (value) => value.toFixed(2),
    );

    dom.autoRotate.checked = params.autoRotate;
    dom.cameraLocked.checked = params.cameraLocked;

    perspectiveCamera.fov = params.cameraFov;
    perspectiveCamera.updateProjectionMatrix();
    switchToPerspective();
    applyCameraInteractivity();
    updateViewportLabel();
  });

  dom.autoRotate.checked = params.autoRotate;
  dom.showBounds.checked = params.showBounds;
  dom.cameraLocked.checked = params.cameraLocked;
  dom.boundaryMode.value = params.boundaryMode;
  dom.colorMode.value = params.colorMode;
  dom.colorLow.value = params.colorLow;
  dom.colorHigh.value = params.colorHigh;
  updateSimulationStateUI();

  switchToPerspective();
}

function updateSimulationStateUI() {
  if (params.paused) {
    dom.togglePause.innerHTML = '<i class=\"bi bi-play-fill me-1\" aria-hidden=\"true\"></i><span>Resume</span>';
    dom.runState.innerHTML = '<i class=\"bi bi-pause-fill state-icon\" aria-hidden=\"true\"></i><span>Paused</span>';
    return;
  }

  dom.togglePause.innerHTML = '<i class=\"bi bi-pause-fill me-1\" aria-hidden=\"true\"></i><span>Pause</span>';
  dom.runState.innerHTML = '<i class=\"bi bi-play-fill state-icon\" aria-hidden=\"true\"></i><span>Running</span>';
}

function setupThemeToggle() {
  if (!dom.themeToggle) {
    applyThemeMode();
    return;
  }

  dom.themeToggle.addEventListener("click", () => {
    const currentIndex = themeModes.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % themeModes.length;
    themeMode = themeModes[nextIndex];
    saveThemeMode(themeMode);
    applyThemeMode();
  });

  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", () => {
      if (themeMode === "auto") {
        applyThemeMode();
      }
    });
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(() => {
      if (themeMode === "auto") {
        applyThemeMode();
      }
    });
  }

  applyThemeMode();
}

function loadThemeMode() {
  try {
    const stored = window.localStorage.getItem("emergenverse-theme-mode");
    if (stored && themeModes.includes(stored)) {
      return stored;
    }
  } catch (error) {
    // Ignore storage failures and fallback to auto mode.
  }

  return "auto";
}

function saveThemeMode(mode) {
  try {
    window.localStorage.setItem("emergenverse-theme-mode", mode);
  } catch (error) {
    // Ignore storage failures.
  }
}

function getEffectiveTheme(mode) {
  if (mode === "auto") {
    return prefersDarkQuery.matches ? "dark" : "light";
  }
  return mode;
}

function applyThemeMode() {
  const effectiveTheme = getEffectiveTheme(themeMode);
  document.body.setAttribute("data-theme", effectiveTheme);
  updateThemeToggleVisual(themeMode, effectiveTheme);
  applySceneTheme(effectiveTheme);
}

function updateThemeToggleVisual(mode, effectiveTheme) {
  if (!dom.themeToggleLabel || !dom.themeToggleIcon) {
    return;
  }

  const iconMap = {
    auto: "bi-circle-half",
    dark: "bi-moon-stars-fill",
    light: "bi-sun-fill",
  };

  dom.themeToggleLabel.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  dom.themeToggle.setAttribute("aria-label", `Theme: ${mode}`);
  dom.themeToggleIcon.className = `bi ${iconMap[mode] || "bi-circle-half"}`;
  dom.themeToggle.dataset.effectiveTheme = effectiveTheme;
}

function applySceneTheme(theme) {
  if (theme === "light") {
    scene.background.set(0xdfe8f8);
    scene.fog.color.set(0xd8e2f5);
    scene.fog.density = 0.0017;
    boidMaterial.emissive.set(0x2e7f73);
    boidMaterial.emissiveIntensity = 0.72;
  } else {
    scene.background.set(0x030713);
    scene.fog.color.set(0x050a17);
    scene.fog.density = 0.0022;
    boidMaterial.emissive.set(0x1b6d62);
    boidMaterial.emissiveIntensity = 0.95;
  }
}

function setupPanelToggles() {
  dom.hideLeftPanel.addEventListener("click", () => {
    uiState.leftPanelVisible = !uiState.leftPanelVisible;
    applyPanelVisibility();
  });

  dom.hideRightPanel.addEventListener("click", () => {
    uiState.rightPanelVisible = !uiState.rightPanelVisible;
    applyPanelVisibility();
  });

  dom.showLeftPanel.addEventListener("click", () => {
    uiState.leftPanelVisible = true;
    applyPanelVisibility();
  });

  dom.showRightPanel.addEventListener("click", () => {
    uiState.rightPanelVisible = true;
    applyPanelVisibility();
  });

  applyPanelVisibility();
}

function setupControlSectionCollapses() {
  if (!dom.controlSectionToggles || dom.controlSectionToggles.length === 0) {
    return;
  }

  dom.controlSectionToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const section = toggle.closest("[data-control-section]");
      if (!section) {
        return;
      }

      const collapsed = section.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      requestAnimationFrame(() => {
        handleViewportResize();
      });
    });
  });
}

function applyPanelVisibility() {
  dom.leftPanel.classList.toggle("is-hidden", !uiState.leftPanelVisible);
  dom.rightPanel.classList.toggle("is-hidden", !uiState.rightPanelVisible);
  dom.appShell.classList.toggle("left-hidden", !uiState.leftPanelVisible);
  dom.appShell.classList.toggle("right-hidden", !uiState.rightPanelVisible);

  dom.showLeftPanel.classList.toggle("is-hidden", uiState.leftPanelVisible);
  dom.showRightPanel.classList.toggle("is-hidden", uiState.rightPanelVisible);
  dom.hideLeftPanel.setAttribute("aria-pressed", String(!uiState.leftPanelVisible));
  dom.hideRightPanel.setAttribute("aria-pressed", String(!uiState.rightPanelVisible));

  requestAnimationFrame(() => {
    handleViewportResize();
  });
}

function handleViewportResize() {
  resizeRenderer();
  resizeTrendCharts();
}

function setupTrendCharts() {
  resizeTrendCharts();
  resetTrendCharts();
}

function setupChartCollapses() {
  if (!dom.chartToggles || dom.chartToggles.length === 0) {
    return;
  }

  dom.chartToggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const card = toggle.closest("[data-chart-card]");
      if (!card) {
        return;
      }

      const collapsed = card.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
      resizeTrendCharts();
    });
  });
}

function resetTrendCharts() {
  countHistory.length = 0;
  speedHistory.length = 0;
  neighborHistory.length = 0;
  chartFrameCounter = 0;
  drawTrendCharts();
}

function resizeTrendCharts() {
  resizeCanvasBackingStore(dom.chartCount);
  resizeCanvasBackingStore(dom.chartSpeed);
  resizeCanvasBackingStore(dom.chartNeighbors);
  drawTrendCharts();
}

function resizeCanvasBackingStore(canvas) {
  if (!canvas) {
    return;
  }

  const cssWidth = Math.max(1, Math.floor(canvas.clientWidth));
  const cssHeight = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingWidth = Math.max(1, Math.floor(cssWidth * dpr));
  const backingHeight = Math.max(1, Math.floor(cssHeight * dpr));

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
}

function drawTrendCharts() {
  drawTrendChart(dom.chartCount, countHistory, {
    stroke: "#7ec4ff",
    fill: "rgba(126, 196, 255, 0.14)",
    axisLabel: "count",
    tickFormatter: (value) => String(Math.max(0, Math.round(value))),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartSpeed, speedHistory, {
    stroke: "#4cd3b6",
    fill: "rgba(76, 211, 182, 0.14)",
    axisLabel: "m/s",
    tickFormatter: (value) => value.toFixed(1),
    forceZeroMin: true,
  });
  drawTrendChart(dom.chartNeighbors, neighborHistory, {
    stroke: "#5aa4ff",
    fill: "rgba(90, 164, 255, 0.14)",
    axisLabel: "count",
    tickFormatter: (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(1)),
    forceZeroMin: true,
  });
}

function drawTrendChart(canvas, values, options) {
  if (!canvas || canvas.width < 2 || canvas.height < 2) {
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  const {
    stroke,
    fill,
    axisLabel = "",
    tickFormatter = (value) => value.toFixed(1),
    forceZeroMin = false,
  } = options;

  const width = canvas.width;
  const height = canvas.height;
  const dpr = width / Math.max(canvas.clientWidth, 1);
  const padLeft = 40 * dpr;
  const padRight = 10 * dpr;
  const padTop = 8 * dpr;
  const padBottom = 12 * dpr;

  ctx.clearRect(0, 0, width, height);

  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  if (plotWidth <= 1 || plotHeight <= 1) {
    return;
  }

  let minValue = values.length > 0 ? values[0] : 0;
  let maxValue = values.length > 0 ? values[0] : 1;
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i];
    if (value < minValue) {
      minValue = value;
    }
    if (value > maxValue) {
      maxValue = value;
    }
  }

  if (forceZeroMin) {
    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);
  }

  const span = Math.max(maxValue - minValue, 0.001);
  const gridColor = "rgba(166, 196, 245, 0.16)";
  const axisColor = "rgba(166, 196, 245, 0.34)";
  const labelColor = "rgba(183, 205, 242, 0.86)";

  ctx.font = `${Math.max(9, Math.round(9 * dpr))}px "Space Grotesk", "Segoe UI", sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const tickCount = 5;
  for (let i = 0; i < tickCount; i += 1) {
    const ratio = i / (tickCount - 1);
    const y = padTop + ratio * plotHeight;
    const value = maxValue - ratio * span;

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = Math.max(1, 0.85 * dpr);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();

    ctx.strokeStyle = axisColor;
    ctx.beginPath();
    ctx.moveTo(padLeft - 4 * dpr, y);
    ctx.lineTo(padLeft, y);
    ctx.stroke();

    ctx.fillStyle = labelColor;
    ctx.fillText(tickFormatter(value), padLeft - 6 * dpr, y);
  }

  ctx.strokeStyle = axisColor;
  ctx.lineWidth = Math.max(1, 1.05 * dpr);
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, height - padBottom);
  ctx.lineTo(width - padRight, height - padBottom);
  ctx.stroke();

  if (axisLabel) {
    ctx.save();
    ctx.translate(9 * dpr, padTop + plotHeight * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = labelColor;
    ctx.fillText(axisLabel, 0, 0);
    ctx.restore();
  }

  if (values.length < 2) {
    return;
  }

  const mapY = (value) =>
    padTop + (1 - (value - minValue) / span) * plotHeight;

  const step = plotWidth / (values.length - 1);

  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = padLeft + i * step;
    const y = mapY(values[i]);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  const firstX = padLeft;
  const lastX = padLeft + plotWidth;

  ctx.lineTo(lastX, height - padBottom);
  ctx.lineTo(firstX, height - padBottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < values.length; i += 1) {
    const x = padLeft + i * step;
    const y = mapY(values[i]);

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8 * dpr;
  ctx.stroke();
}

function pushTrendValue(series, value) {
  series.push(value);
  if (series.length > chartMaxPoints) {
    series.shift();
  }
}

function bindRange(inputId, valueId, applyValue) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(valueId);

  const handle = () => {
    const value = Number(input.value);
    const display = applyValue(value);
    output.textContent = display;
  };

  input.addEventListener("input", handle);
  handle();
}

function setControlValue(inputId, value, valueId, formatter) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(valueId);
  input.value = String(value);
  output.textContent = formatter(value);
}

function setPerspectiveCameraFromParams(forceSnap = false) {
  const azimuth = -Math.PI / 4;
  const radius = params.cameraDistance;

  perspectiveCamera.position.set(
    Math.cos(azimuth) * radius,
    Math.sin(azimuth) * radius,
    params.cameraHeight,
  );

  perspectiveCamera.fov = params.cameraFov;
  perspectiveCamera.updateProjectionMatrix();

  if (forceSnap && activeCamera === perspectiveCamera) {
    controls.update();
  }
}

function switchToPerspective() {
  activeCamera = perspectiveCamera;
  controls.object = activeCamera;
  setPerspectiveCameraFromParams(false);
  applyCameraInteractivity();
  controls.update();
}

function switchToOrthographicTop() {
  activeCamera = orthographicCamera;
  controls.object = activeCamera;
  updateOrthographicCamera(true);
  applyCameraInteractivity();
  controls.update();
}

function updateOrthographicCamera(snapToTop) {
  const width = Math.max(1, dom.sceneHost.clientWidth);
  const height = Math.max(1, dom.sceneHost.clientHeight);
  const aspect = width / height;

  const verticalSpan = Math.max(params.worldSizeX, params.worldSizeY, params.worldSizeZ) * 0.62;
  orthographicCamera.left = -verticalSpan * aspect;
  orthographicCamera.right = verticalSpan * aspect;
  orthographicCamera.top = verticalSpan;
  orthographicCamera.bottom = -verticalSpan;
  orthographicCamera.near = 0.1;
  orthographicCamera.far = 5000;

  if (snapToTop) {
    const topHeight = Math.max(params.cameraDistance, params.worldSizeZ * 1.5);
    orthographicCamera.position.set(0, 0, topHeight);
    orthographicCamera.up.set(0, 1, 0);
    controls.target.set(0, 0, 0);
  }

  orthographicCamera.lookAt(controls.target);
  orthographicCamera.updateProjectionMatrix();
}

function applyCameraInteractivity() {
  const unlocked = !params.cameraLocked;
  const perspectiveMode = params.projectionMode === "perspective";

  controls.enableRotate = unlocked && perspectiveMode;
  controls.enablePan = unlocked;
  controls.enableZoom = false;
}

function updateKeyboardTranslation(dt) {
  if (params.cameraLocked || params.projectionMode !== "perspective") {
    return;
  }

  moveDelta.set(0, 0, 0);

  forwardMove.set(0, 0, -1).applyQuaternion(perspectiveCamera.quaternion).normalize();
  rightMove.set(1, 0, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();
  upMove.set(0, 1, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();

  if (keyState.KeyW) {
    moveDelta.add(forwardMove);
  }
  if (keyState.KeyS) {
    moveDelta.sub(forwardMove);
  }
  if (keyState.KeyD) {
    moveDelta.add(rightMove);
  }
  if (keyState.KeyA) {
    moveDelta.sub(rightMove);
  }
  if (keyState.KeyE) {
    moveDelta.add(upMove);
  }
  if (keyState.KeyQ) {
    moveDelta.sub(upMove);
  }

  const speedFactor = keyState.ShiftLeft || keyState.ShiftRight ? 2.0 : 1.0;
  if (moveDelta.lengthSq() > 0.000001) {
    moveDelta.normalize().multiplyScalar(params.keyboardMoveSpeed * speedFactor * dt);
    perspectiveCamera.position.add(moveDelta);
    controls.target.add(moveDelta);
  }

  const rotationSpeed = 1.45;
  const yawInput = (keyState.ArrowRight ? 1 : 0) - (keyState.ArrowLeft ? 1 : 0);
  const pitchInput = (keyState.ArrowUp ? 1 : 0) - (keyState.ArrowDown ? 1 : 0);
  const rollInput = (keyState.BracketRight ? 1 : 0) - (keyState.BracketLeft ? 1 : 0);
  if (yawInput === 0 && pitchInput === 0 && rollInput === 0) {
    return;
  }

  lookOffset.subVectors(controls.target, perspectiveCamera.position);
  if (lookOffset.lengthSq() < 0.000001) {
    lookOffset.copy(forwardMove).multiplyScalar(40);
  }

  if (yawInput !== 0) {
    rotationQuat.setFromAxisAngle(upMove, yawInput * rotationSpeed * dt);
    lookOffset.applyQuaternion(rotationQuat);
    perspectiveCamera.up.applyQuaternion(rotationQuat);
  }

  if (pitchInput !== 0) {
    rotationQuat.setFromAxisAngle(rightMove, pitchInput * rotationSpeed * dt);
    lookOffset.applyQuaternion(rotationQuat);
    perspectiveCamera.up.applyQuaternion(rotationQuat);
  }

  if (rollInput !== 0) {
    forwardMove.copy(lookOffset);
    if (forwardMove.lengthSq() < 0.000001) {
      forwardMove.set(0, 0, -1).applyQuaternion(perspectiveCamera.quaternion);
    } else {
      forwardMove.normalize();
    }

    rotationQuat.setFromAxisAngle(forwardMove, rollInput * rotationSpeed * dt);
    perspectiveCamera.up.applyQuaternion(rotationQuat);
  }

  perspectiveCamera.up.normalize();
  controls.target.copy(perspectiveCamera.position).add(lookOffset);
}

function resizeRenderer() {
  const width = Math.max(1, Math.floor(dom.sceneHost.clientWidth));
  const height = Math.max(1, Math.floor(dom.sceneHost.clientHeight));

  renderer.setSize(width, height, false);

  perspectiveCamera.aspect = width / height;
  perspectiveCamera.updateProjectionMatrix();

  updateOrthographicCamera(false);
  updateViewportLabel();
}

function updateViewportLabel() {
  if (!dom.frameSize) {
    return;
  }

  const width = Math.max(1, Math.floor(dom.sceneHost.clientWidth));
  const height = Math.max(1, Math.floor(dom.sceneHost.clientHeight));
  const projectionLabel =
    params.projectionMode === "orthographic" ? "Ortho Top (Z+)" : "Perspective";

  dom.frameSize.textContent = `Viewport: ${width} x ${height} | ${projectionLabel}`;
}

function updateStats(speedSum, neighborSum) {
  const boidCount = boids.length;
  const avgSpeed = boidCount > 0 ? speedSum / boidCount : 0;
  const avgNeighbors = boidCount > 0 ? neighborSum / boidCount : 0;

  if (dom.chartCountLive) {
    dom.chartCountLive.textContent = String(boidCount);
  }
  if (dom.chartSpeedLive) {
    dom.chartSpeedLive.textContent = `${avgSpeed.toFixed(2)} m/s`;
  }
  if (dom.chartNeighborsLive) {
    dom.chartNeighborsLive.textContent = avgNeighbors.toFixed(2);
  }

  chartFrameCounter += 1;
  if (chartFrameCounter % 3 === 0) {
    pushTrendValue(countHistory, boidCount);
    pushTrendValue(speedHistory, avgSpeed);
    pushTrendValue(neighborHistory, avgNeighbors);
    drawTrendCharts();
  }
}

function removeLostBoids() {
  let removed = false;
  for (let i = boids.length - 1; i >= 0; i -= 1) {
    if (boids[i].lost) {
      boids.splice(i, 1);
      removed = true;
    }
  }

  if (removed) {
    rebuildBoidMeshForCurrentBoids();
  }

  return removed;
}

function applyBoundaryConditions(boid) {
  const halfX = params.worldSizeX * 0.5;
  const halfY = params.worldSizeY * 0.5;
  const halfZ = params.worldSizeZ * 0.5;

  if (params.boundaryMode === "cyclic") {
    boid.position.x = wrapAxis(boid.position.x, halfX);
    boid.position.y = wrapAxis(boid.position.y, halfY);
    boid.position.z = wrapAxis(boid.position.z, halfZ);
    boid.lost = false;
    return true;
  }

  const outOfBounds =
    Math.abs(boid.position.x) > halfX ||
    Math.abs(boid.position.y) > halfY ||
    Math.abs(boid.position.z) > halfZ;

  boid.lost = outOfBounds;
  return !outOfBounds;
}

function wrapAxis(value, halfExtent) {
  const worldSpan = halfExtent * 2;
  if (worldSpan <= 0) {
    return 0;
  }

  if (value > halfExtent || value < -halfExtent) {
    return ((((value + halfExtent) % worldSpan) + worldSpan) % worldSpan) - halfExtent;
  }

  return value;
}

function limitVector(vector, maxLength) {
  if (maxLength <= 0) {
    vector.set(0, 0, 0);
    return vector;
  }

  const maxLengthSq = maxLength * maxLength;
  if (vector.lengthSq() > maxLengthSq) {
    vector.setLength(maxLength);
  }
  return vector;
}

function enforceSpeedBounds(vector, minSpeed, maxSpeed) {
  const clampedMin = Math.max(0, minSpeed);
  const clampedMax = Math.max(clampedMin, maxSpeed);
  const speed = vector.length();

  if (speed < 0.000001) {
    vector.copy(randomDirection()).multiplyScalar(Math.max(clampedMin, 0.0001));
    return vector;
  }

  const bounded = THREE.MathUtils.clamp(speed, clampedMin, clampedMax);
  vector.multiplyScalar(bounded / speed);
  return vector;
}

function randomDirection() {
  const direction = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
    THREE.MathUtils.randFloatSpread(2),
  );

  if (direction.lengthSq() < 0.000001) {
    direction.set(0, 0, 1);
  }

  return direction.normalize();
}

function buildStarField(count, spread) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const starColor = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    positions[i3] = THREE.MathUtils.randFloatSpread(spread * 2.2);
    positions[i3 + 1] = THREE.MathUtils.randFloatSpread(spread * 2.2);
    positions[i3 + 2] = THREE.MathUtils.randFloat(-spread * 0.8, spread * 1.8);

    starColor.setHSL(
      THREE.MathUtils.randFloat(0.52, 0.64),
      THREE.MathUtils.randFloat(0.28, 0.54),
      THREE.MathUtils.randFloat(0.62, 0.96),
    );

    colors[i3] = starColor.r;
    colors[i3 + 1] = starColor.g;
    colors[i3 + 2] = starColor.b;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 1.75,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    vertexColors: true,
  });

  return new THREE.Points(geometry, material);
}

function onKeyDown(event) {
  if (event.defaultPrevented || isTextEntryTarget(event.target)) {
    return;
  }

  if (!(event.code in keyState)) {
    retur