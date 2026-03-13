// Shared scene/world manager for bounds, grid geometry, lights, and scene objects.
import * as THREE from "three";
import { applyWorldTheme } from "./theme.js";

export function createWorldManager({ params, onWorldGeometryChanged } = {}) {
  const scene = new THREE.Scene();
  applyWorldTheme(scene, "dark");

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.75);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
  keyLight.position.set(70, -70, 130);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xcfe8ff, 0.9);
  fillLight.position.set(-80, 95, -55);
  scene.add(fillLight);

  let boundsLines = null;
  let floorGrid = null;

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
      fog: false,
    });

    boundsLines = new THREE.LineSegments(boundsGeometry, boundsMaterial);
    boundsLines.visible = params.showBounds;
    scene.add(boundsLines);

    const gridSize = Math.max(0.01, Number(params.worldGridSize) || 1);
    floorGrid = buildFloorGrid({
      width: params.worldSizeX,
      height: params.worldSizeY,
      z: -params.worldSizeZ * 0.5,
      step: gridSize,
    });

    scene.add(floorGrid);

    if (typeof onWorldGeometryChanged === "function") {
      onWorldGeometryChanged();
    }
  }

  function setBoundsVisibility(visible) {
    if (boundsLines) {
      boundsLines.visible = visible;
    }
  }

  function applyBoundaryConditions(entity) {
    const halfX = params.worldSizeX * 0.5;
    const halfY = params.worldSizeY * 0.5;
    const halfZ = params.worldSizeZ * 0.5;
    const mode = normalizeBoundaryMode(params.boundaryMode);

    if (mode === "cyclic-xyz") {
      entity.position.x = wrapAxis(entity.position.x, halfX);
      entity.position.y = wrapAxis(entity.position.y, halfY);
      entity.position.z = wrapAxis(entity.position.z, halfZ);
      entity.lost = false;
      return true;
    }

    if (mode === "cyclic-xy") {
      entity.position.x = wrapAxis(entity.position.x, halfX);
      entity.position.y = wrapAxis(entity.position.y, halfY);
      const outOfBoundsZ = Math.abs(entity.position.z) > halfZ;
      entity.lost = outOfBoundsZ;
      return !outOfBoundsZ;
    }

    const outOfBounds =
      Math.abs(entity.position.x) > halfX ||
      Math.abs(entity.position.y) > halfY ||
      Math.abs(entity.position.z) > halfZ;

    entity.lost = outOfBounds;
    return !outOfBounds;
  }

  return {
    scene,
    rebuildBoundsAndGrid,
    setBoundsVisibility,
    applyBoundaryConditions,
  };
}

function normalizeBoundaryMode(mode) {
  if (mode === "cyclic") {
    return "cyclic-xyz";
  }
  if (mode === "cyclic-xyz" || mode === "cyclic-xy" || mode === "lost") {
    return mode;
  }
  return "cyclic-xyz";
}

function buildFloorGrid({ width, height, z, step }) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const cellSize = Math.max(0.01, step || 1);
  const xStart = -Math.floor(halfWidth / cellSize) * cellSize;
  const xEnd = Math.floor(halfWidth / cellSize) * cellSize;
  const yStart = -Math.floor(halfHeight / cellSize) * cellSize;
  const yEnd = Math.floor(halfHeight / cellSize) * cellSize;
  const positions = [];

  for (let x = xStart; x <= xEnd + cellSize * 0.25; x += cellSize) {
    const clampedX = THREE.MathUtils.clamp(x, -halfWidth, halfWidth);
    positions.push(clampedX, -halfHeight, z, clampedX, halfHeight, z);
  }

  for (let y = yStart; y <= yEnd + cellSize * 0.25; y += cellSize) {
    const clampedY = THREE.MathUtils.clamp(y, -halfHeight, halfHeight);
    positions.push(-halfWidth, clampedY, z, halfWidth, clampedY, z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0x1a3558,
    transparent: true,
    opacity: 0.34,
    fog: false,
  });

  return new THREE.LineSegments(geometry, material);
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
