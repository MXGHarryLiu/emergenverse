// Camera controller for perspective/orthographic views, orbit controls, and telemetry.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createCameraController({ sceneHost, params, telemetry, onFovChange, formatLengthValue }) {
  const worldUp = new THREE.Vector3(0, 0, 1);

  const perspectiveCamera = new THREE.PerspectiveCamera(params.cameraFov, 1, 0.1, 3000);
  perspectiveCamera.up.copy(worldUp);

  const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);
  orthographicCamera.up.set(0, 1, 0);

  let activeCamera = perspectiveCamera;

  const controls = new OrbitControls(activeCamera, sceneHost);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 20;
  controls.maxDistance = 1200;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.NONE;
  controls.enableZoom = false;
  controls.mouseButtons.WHEEL = THREE.MOUSE.NONE;

  const forwardMove = new THREE.Vector3();
  const rightMove = new THREE.Vector3();
  const upMove = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const moveDelta = new THREE.Vector3();
  const preservedLook = new THREE.Vector3();
  const homePosition = new THREE.Vector3(0, 0, 0);
  const lookOffset = new THREE.Vector3();
  const rotationQuat = new THREE.Quaternion();
  const cameraEuler = new THREE.Euler(0, 0, 0, "ZYX");

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
    Comma: false,
    Period: false,
    ShiftLeft: false,
    ShiftRight: false,
  };

  const dragState = {
    leftActive: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  };

  const mouseLookSensitivity = 0.0032;

  function getWorldSpan() {
    return Math.max(
      1,
      Number(params.worldSizeX) || 0,
      Number(params.worldSizeY) || 0,
      Number(params.worldSizeZ) || 0,
    );
  }

  function syncCameraScaleLimits() {
    const worldSpan = getWorldSpan();
    const clipFar = Math.max(3000, worldSpan * 8);
    const clipNear = Math.max(0.1, Math.min(10, clipFar / 100000));

    perspectiveCamera.near = clipNear;
    perspectiveCamera.far = clipFar;
    perspectiveCamera.updateProjectionMatrix();

    orthographicCamera.near = clipNear;
    orthographicCamera.far = clipFar;
    orthographicCamera.updateProjectionMatrix();

    controls.maxDistance = Math.max(1200, worldSpan * 3);
  }

  function setPerspectiveCameraFromParams(forceSnap = false) {
    syncCameraScaleLimits();
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
    let preservePose = false;
    if (arguments.length > 0) {
      preservePose = Boolean(arguments[0]);
    }
    activeCamera = perspectiveCamera;
    controls.object = activeCamera;
    if (!preservePose) {
      setPerspectiveCameraFromParams(false);
    }
    applyCameraInteractivity();
    controls.update();
  }

  function switchToOrthographicTop() {
    let snapToTop = true;
    if (arguments.length > 0) {
      snapToTop = Boolean(arguments[0]);
    }
    activeCamera = orthographicCamera;
    controls.object = activeCamera;
    updateOrthographicCamera(snapToTop);
    applyCameraInteractivity();
    controls.update();
  }

  function updateOrthographicCamera(snapToTop) {
    syncCameraScaleLimits();
    const width = Math.max(1, sceneHost.clientWidth);
    const height = Math.max(1, sceneHost.clientHeight);
    const aspect = width / height;

    const baseSpan = Math.max(params.worldSizeX, params.worldSizeY, params.worldSizeZ) * 0.62;
    const zoomScale = THREE.MathUtils.clamp(params.cameraFov / 50, 0.35, 2.4);
    const verticalSpan = baseSpan * zoomScale;
    orthographicCamera.left = -verticalSpan * aspect;
    orthographicCamera.right = verticalSpan * aspect;
    orthographicCamera.top = verticalSpan;
    orthographicCamera.bottom = -verticalSpan;

    if (snapToTop) {
      const topHeight = Math.max(params.cameraDistance, params.worldSizeZ * 1.5);
      orthographicCamera.position.set(0, 0, topHeight);
      orthographicCamera.up.set(0, 1, 0);
      controls.target.set(0, 0, 0);
    }

    orthographicCamera.lookAt(controls.target);
    orthographicCamera.updateProjectionMatrix();
  }

  function onWheel(event) {
    if (params.cameraLocked) {
      return;
    }

    const delta = THREE.MathUtils.clamp(event.deltaY, -120, 120);
    if (Math.abs(delta) < 0.001) {
      return;
    }

    applyFovDelta(delta * 0.04);

    event.preventDefault();
  }

  function applyFovDelta(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-8) {
      return;
    }

    const nextFov = THREE.MathUtils.clamp(params.cameraFov + delta, 20, 90);
    if (Math.abs(nextFov - params.cameraFov) < 1e-8) {
      return;
    }

    params.cameraFov = nextFov;
    if (params.projectionMode === "perspective") {
      perspectiveCamera.fov = params.cameraFov;
      perspectiveCamera.updateProjectionMatrix();
    } else {
      updateOrthographicCamera(false);
    }

    if (typeof onFovChange === "function") {
      onFovChange(params.cameraFov);
    }
  }

  function applyCameraInteractivity() {
    const unlocked = !params.cameraLocked;
    const perspectiveMode = params.projectionMode === "perspective";

    controls.enableRotate = false;
    controls.enablePan = unlocked;
    controls.enableZoom = false;
  }

  function onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }
    if (params.cameraLocked || params.projectionMode !== "perspective") {
      return;
    }

    dragState.leftActive = true;
    dragState.pointerId = event.pointerId;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    sceneHost.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragState.leftActive || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (params.cameraLocked || params.projectionMode !== "perspective") {
      return;
    }

    const dx = event.clientX - dragState.lastX;
    const dy = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;

    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      return;
    }

    lookOffset.subVectors(controls.target, perspectiveCamera.position);
    if (lookOffset.lengthSq() < 0.000001) {
      lookOffset.set(0, 0, -1);
    }

    upAxis.copy(perspectiveCamera.up).normalize();
    rightMove.set(1, 0, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();

    if (dx !== 0) {
      rotationQuat.setFromAxisAngle(upAxis, -dx * mouseLookSensitivity);
      lookOffset.applyQuaternion(rotationQuat);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }

    if (dy !== 0) {
      rotationQuat.setFromAxisAngle(rightMove, -dy * mouseLookSensitivity);
      lookOffset.applyQuaternion(rotationQuat);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }

    perspectiveCamera.up.normalize();
    controls.target.copy(perspectiveCamera.position).add(lookOffset);
    controls.update();
    event.preventDefault();
  }

  function endPointerDrag(event) {
    if (dragState.pointerId === null) {
      return;
    }
    if (event?.pointerId !== undefined && event.pointerId !== dragState.pointerId) {
      return;
    }

    sceneHost.releasePointerCapture?.(dragState.pointerId);
    dragState.leftActive = false;
    dragState.pointerId = null;
  }

  function updateKeyboardTranslation(dt) {
    if (params.cameraLocked) {
      return;
    }

    const fovInput = (keyState.Period ? 1 : 0) - (keyState.Comma ? 1 : 0);
    if (fovInput !== 0) {
      const fovRateDegPerSec = 30;
      applyFovDelta(fovInput * fovRateDegPerSec * dt);
    }

    const perspectiveMode = params.projectionMode === "perspective";
    const activeMoveCamera = perspectiveMode ? perspectiveCamera : orthographicCamera;
    moveDelta.set(0, 0, 0);

    forwardMove.set(0, 0, -1).applyQuaternion(activeMoveCamera.quaternion).normalize();
    rightMove.set(1, 0, 0).applyQuaternion(activeMoveCamera.quaternion).normalize();
    upMove.set(0, 1, 0).applyQuaternion(activeMoveCamera.quaternion).normalize();

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
      const orthographicLookDistance = perspectiveMode
        ? 0
        : Math.max(1, orthographicCamera.position.z - controls.target.z);
      moveDelta.normalize().multiplyScalar(params.keyboardMoveSpeed * speedFactor * dt);
      activeMoveCamera.position.add(moveDelta);
      controls.target.add(moveDelta);

      if (!perspectiveMode) {
        // Keep orthographic camera locked to top-down view while translating.
        orthographicCamera.up.set(0, 1, 0);
        controls.target.set(
          orthographicCamera.position.x,
          orthographicCamera.position.y,
          orthographicCamera.position.z - orthographicLookDistance,
        );
        orthographicCamera.lookAt(controls.target);
      }
    }

    if (!perspectiveMode) {
      return;
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

  function updateTelemetry() {
    if (!telemetry?.x) {
      return;
    }

    const position = activeCamera.position;
    cameraEuler.setFromQuaternion(activeCamera.quaternion, "ZYX");

    const formatLength = typeof formatLengthValue === "function"
      ? formatLengthValue
      : (value) => `${value.toFixed(1)} m`;

    telemetry.x.textContent = formatLength(position.x);
    telemetry.y.textContent = formatLength(position.y);
    telemetry.z.textContent = formatLength(position.z);
    telemetry.roll.textContent = `${THREE.MathUtils.radToDeg(cameraEuler.x).toFixed(1)}°`;
    telemetry.pitch.textContent = `${THREE.MathUtils.radToDeg(cameraEuler.y).toFixed(1)}°`;
    telemetry.yaw.textContent = `${THREE.MathUtils.radToDeg(cameraEuler.z).toFixed(1)}°`;
  }

  function resetOrientationKeepPosition() {
    const camera = activeCamera;
    const position = camera.position.clone();

    if (camera === perspectiveCamera) {
      camera.up.copy(worldUp);
      controls.target.set(0, 0, 0);
      if (controls.target.distanceToSquared(position) < 0.000001) {
        controls.target.set(position.x, position.y + 1, position.z);
      }
    } else {
      camera.up.set(0, 1, 0);
      const lookDistance = Math.max(
        1,
        Math.abs(position.z - controls.target.z),
        params.worldSizeZ * 0.6,
      );
      controls.target.set(position.x, position.y, position.z - lookDistance);
    }

    camera.position.copy(position);
    camera.lookAt(controls.target);
    controls.update();
  }

  function moveActiveCameraToOrigin() {
    const camera = activeCamera;
    if (camera === orthographicCamera) {
      // In top-ortho, home should recenter X/Y without changing top-down orientation.
      const lookDistance = Math.max(
        1,
        Math.abs(orthographicCamera.position.z - controls.target.z),
        params.worldSizeZ * 0.6,
      );
      orthographicCamera.position.set(0, 0, orthographicCamera.position.z);
      orthographicCamera.up.set(0, 1, 0);
      controls.target.set(0, 0, orthographicCamera.position.z - lookDistance);
      orthographicCamera.lookAt(controls.target);
      controls.update();
      return;
    }

    preservedLook.subVectors(controls.target, camera.position);

    if (preservedLook.lengthSq() < 0.000001) {
      preservedLook.set(0, 1, 0);
    }

    camera.position.copy(homePosition);
    controls.target.copy(homePosition).add(preservedLook);
    camera.lookAt(controls.target);
    controls.update();
  }

  function getCameraSnapshot() {
    return {
      projectionMode: activeCamera === orthographicCamera ? "orthographic" : "perspective",
      cameraFov: params.cameraFov,
      target: controls.target.toArray(),
      perspective: {
        position: perspectiveCamera.position.toArray(),
        quaternion: perspectiveCamera.quaternion.toArray(),
        up: perspectiveCamera.up.toArray(),
      },
      orthographic: {
        position: orthographicCamera.position.toArray(),
        quaternion: orthographicCamera.quaternion.toArray(),
        up: orthographicCamera.up.toArray(),
      },
    };
  }

  function applyCameraPose(camera, pose) {
    if (!camera || !pose) {
      return;
    }
    if (Array.isArray(pose.position) && pose.position.length === 3) {
      camera.position.fromArray(pose.position);
    }
    if (Array.isArray(pose.quaternion) && pose.quaternion.length === 4) {
      camera.quaternion.fromArray(pose.quaternion);
    }
    if (Array.isArray(pose.up) && pose.up.length === 3) {
      camera.up.fromArray(pose.up);
    }
  }

  function restoreCameraSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }

    params.cameraFov = THREE.MathUtils.clamp(Number(snapshot.cameraFov) || params.cameraFov, 20, 90);
    perspectiveCamera.fov = params.cameraFov;
    perspectiveCamera.updateProjectionMatrix();
    updateOrthographicCamera(false);

    applyCameraPose(perspectiveCamera, snapshot.perspective);
    applyCameraPose(orthographicCamera, snapshot.orthographic);

    if (Array.isArray(snapshot.target) && snapshot.target.length === 3) {
      controls.target.fromArray(snapshot.target);
    }

    const projectionMode = snapshot.projectionMode === "orthographic" ? "orthographic" : "perspective";
    params.projectionMode = projectionMode;
    if (projectionMode === "orthographic") {
      switchToOrthographicTop(false);
    } else {
      switchToPerspective(true);
    }

    perspectiveCamera.updateProjectionMatrix();
    orthographicCamera.updateProjectionMatrix();
    controls.update();
    return true;
  }

  function isTextEntryTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target.isContentEditable) {
      return true;
    }

    const tagName = target.tagName;
    return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || isTextEntryTarget(event.target)) {
      return;
    }

    if (!(event.code in keyState)) {
      return;
    }

    keyState[event.code] = true;
    event.preventDefault();
  }

  function onKeyUp(event) {
    if (!(event.code in keyState)) {
      return;
    }

    keyState[event.code] = false;
  }

  sceneHost.addEventListener("pointerdown", onPointerDown);
  sceneHost.addEventListener("pointermove", onPointerMove);
  sceneHost.addEventListener("pointerup", endPointerDrag);
  sceneHost.addEventListener("pointercancel", endPointerDrag);
  sceneHost.addEventListener("pointerleave", endPointerDrag);
  sceneHost.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("blur", () => endPointerDrag());

  return {
    perspectiveCamera,
    orthographicCamera,
    controls,
    getActiveCamera: () => activeCamera,
    setPerspectiveCameraFromParams,
    switchToPerspective,
    switchToOrthographicTop,
    updateOrthographicCamera,
    applyCameraInteractivity,
    updateKeyboardTranslation,
    updateTelemetry,
    resetOrientationKeepPosition,
    moveActiveCameraToOrigin,
    getCameraSnapshot,
    restoreCameraSnapshot,
    onKeyDown,
    onKeyUp,
    isTextEntryTarget,
  };
}
