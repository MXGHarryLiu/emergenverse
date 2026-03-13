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
    active: false,
    mode: null,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  };
  const touchState = {
    pointers: new Map(),
    gestureActive: false,
    singleDragActive: false,
    singlePointerId: null,
    singleLastX: 0,
    singleLastY: 0,
    lastMidX: 0,
    lastMidY: 0,
    lastDistance: 0,
    lastAngle: 0,
  };

  const mouseLookSensitivity = 0.0032;
  const mouseRollSensitivity = 0.0032;
  const touchLookSensitivity = 0.0032;
  const touchRollSensitivity = 1.0;
  const touchTranslateSensitivity = 0.22;
  const touchFovSensitivity = 0.045;
  const spaceshipMaxAngularRate = 3.6;
  const spaceshipSasAngularDampingPerSec = 5.0;
  const spaceshipSpeedLimitFactor = 4.0;
  const spaceshipSpeedFloor = 1;
  const spaceshipClampEpsilon = 1e-6;

  const spaceshipLinearVelocity = new THREE.Vector3();
  let spaceshipYawRate = 0;
  let spaceshipPitchRate = 0;
  let spaceshipRollRate = 0;

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

  function switchToPerspective(preservePose = false) {
    activeCamera = perspectiveCamera;
    controls.object = activeCamera;
    if (!preservePose) {
      setPerspectiveCameraFromParams(false);
    }
    applyCameraInteractivity();
    controls.update();
  }

  function switchToOrthographicTop(snapToTop = true) {
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
    if (params.spaceshipMode && params.projectionMode === "perspective") {
      controls.enabled = false;
      return;
    }

    const unlocked = !params.cameraLocked;
    controls.enabled = true;
    controls.enableRotate = false;
    controls.enablePan = unlocked;
    controls.enableZoom = false;
  }

  function onPointerDown(event) {
    if (params.spaceshipMode) {
      return;
    }

    if (event.pointerType === "touch") {
      return;
    }
    if (event.button !== 0 && event.button !== 1) {
      return;
    }
    if (params.cameraLocked) {
      return;
    }
    if (event.button === 0 && params.projectionMode !== "perspective") {
      return;
    }
    if (event.button === 1 && params.projectionMode !== "perspective") {
      return;
    }

    dragState.active = true;
    dragState.mode = event.button === 0 ? "look" : "forward";
    dragState.pointerId = event.pointerId;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    sceneHost.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragState.active || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (params.cameraLocked) {
      return;
    }

    const dx = event.clientX - dragState.lastX;
    const dy = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    const leftRightComboActive = (event.buttons & 1) !== 0 && (event.buttons & 2) !== 0;

    if (dragState.mode === "look") {
      if (params.projectionMode !== "perspective") {
        return;
      }
      if (leftRightComboActive) {
        applyPerspectiveRollDelta(-dy * mouseRollSensitivity);
      } else {
        applyPerspectiveLookDelta(dx, dy);
      }
    } else if (dragState.mode === "forward") {
      if (params.projectionMode !== "perspective") {
        return;
      }
      applyForwardTranslationFromDrag(dy);
    }
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
    dragState.active = false;
    dragState.mode = null;
    dragState.pointerId = null;
  }

  function getFirstTwoTouchPointers() {
    if (touchState.pointers.size < 2) {
      return null;
    }
    const iterator = touchState.pointers.values();
    const first = iterator.next().value;
    const second = iterator.next().value;
    return first && second ? [first, second] : null;
  }

  function beginTouchGesture() {
    const points = getFirstTwoTouchPointers();
    if (!points || params.cameraLocked) {
      return;
    }

    const [first, second] = points;
    touchState.gestureActive = true;
    touchState.lastMidX = (first.x + second.x) * 0.5;
    touchState.lastMidY = (first.y + second.y) * 0.5;
    touchState.lastDistance = Math.hypot(second.x - first.x, second.y - first.y);
    touchState.lastAngle = Math.atan2(second.y - first.y, second.x - first.x);
    touchState.singleDragActive = false;
    touchState.singlePointerId = null;
    controls.enabled = false;
    endPointerDrag();
  }

  function endTouchGesture() {
    if (!touchState.gestureActive) {
      return;
    }
    touchState.gestureActive = false;
    applyCameraInteractivity();
  }

  function applyTouchTranslation(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
      return;
    }

    const width = Math.max(1, sceneHost.clientWidth);
    const height = Math.max(1, sceneHost.clientHeight);
    const screenScale = Math.max(getWorldSpan() * touchTranslateSensitivity, 0.01);
    const horizontalAmount = -(dx / width) * screenScale;
    const verticalAmount = (dy / height) * screenScale;

    if (params.projectionMode === "perspective") {
      rightMove.set(1, 0, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();
      upMove.set(0, 1, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();
      moveDelta.copy(rightMove).multiplyScalar(horizontalAmount);
      // Keep two-finger translation screen-aligned: horizontal/vertical drag maps to right/up pan.
      moveDelta.addScaledVector(upMove, verticalAmount);
      perspectiveCamera.position.add(moveDelta);
      controls.target.add(moveDelta);
      controls.update();
      return;
    }

    rightMove.set(1, 0, 0).applyQuaternion(orthographicCamera.quaternion).normalize();
    upMove.set(0, 1, 0).applyQuaternion(orthographicCamera.quaternion).normalize();
    moveDelta.copy(rightMove).multiplyScalar(horizontalAmount);
    moveDelta.addScaledVector(upMove, verticalAmount);
    orthographicCamera.position.add(moveDelta);
    controls.target.add(moveDelta);
    orthographicCamera.lookAt(controls.target);
    controls.update();
  }

  function onTouchPointerDown(event) {
    if (params.spaceshipMode) {
      return;
    }

    if (event.pointerType !== "touch") {
      return;
    }

    touchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    sceneHost.setPointerCapture?.(event.pointerId);
    if (touchState.pointers.size >= 2) {
      beginTouchGesture();
    } else if (touchState.pointers.size === 1 && !params.cameraLocked) {
      touchState.singleDragActive = true;
      touchState.singlePointerId = event.pointerId;
      touchState.singleLastX = event.clientX;
      touchState.singleLastY = event.clientY;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function onTouchPointerMove(event) {
    if (event.pointerType !== "touch") {
      return;
    }

    if (touchState.pointers.has(event.pointerId)) {
      touchState.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (!touchState.gestureActive) {
      if (touchState.pointers.size >= 2) {
        beginTouchGesture();
      } else if (
        touchState.singleDragActive &&
        touchState.singlePointerId === event.pointerId &&
        !params.cameraLocked
      ) {
        const dx = event.clientX - touchState.singleLastX;
        const dy = event.clientY - touchState.singleLastY;
        touchState.singleLastX = event.clientX;
        touchState.singleLastY = event.clientY;
        applyTouchTranslation(dx, dy);
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const points = getFirstTwoTouchPointers();
    if (!points) {
      endTouchGesture();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const [first, second] = points;
    const midX = (first.x + second.x) * 0.5;
    const midY = (first.y + second.y) * 0.5;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    const angle = Math.atan2(second.y - first.y, second.x - first.x);
    const dx = midX - touchState.lastMidX;
    const dy = midY - touchState.lastMidY;
    const distanceDelta = distance - touchState.lastDistance;
    const angleDelta = normalizeAngleDelta(angle - touchState.lastAngle);

    touchState.lastMidX = midX;
    touchState.lastMidY = midY;
    touchState.lastDistance = distance;
    touchState.lastAngle = angle;

    if (params.projectionMode === "perspective" && !params.cameraLocked) {
      applyPerspectiveLookDelta(-dx, -dy, touchLookSensitivity);
      applyPerspectiveRollDelta(-angleDelta * touchRollSensitivity);
    }
    applyFovDelta(-distanceDelta * touchFovSensitivity);

    event.preventDefault();
    event.stopPropagation();
  }

  function onTouchPointerEnd(event) {
    if (event.pointerType !== "touch") {
      return;
    }

    touchState.pointers.delete(event.pointerId);
    sceneHost.releasePointerCapture?.(event.pointerId);
    if (touchState.singlePointerId === event.pointerId) {
      touchState.singleDragActive = false;
      touchState.singlePointerId = null;
    }

    if (touchState.pointers.size < 2) {
      endTouchGesture();
      if (touchState.pointers.size === 1 && !params.cameraLocked) {
        const iterator = touchState.pointers.entries();
        const [nextPointerId, nextPoint] = iterator.next().value || [];
        if (nextPointerId !== undefined && nextPoint) {
          touchState.singleDragActive = true;
          touchState.singlePointerId = nextPointerId;
          touchState.singleLastX = nextPoint.x;
          touchState.singleLastY = nextPoint.y;
        }
      }
    } else {
      beginTouchGesture();
    }

    event.preventDefault();
    event.stopPropagation();
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

    if (params.spaceshipMode && params.projectionMode === "perspective") {
      updateSpaceshipKeyboardFlight(dt);
      return;
    }

    if (params.spaceshipMode && params.projectionMode !== "perspective") {
      haltAllSpaceshipMotion();
    }

    updateClassicKeyboardNavigation(dt);
  }

  function updateClassicKeyboardNavigation(dt) {
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

    const rotationSpeed = getKeyboardRotationSpeedRad();
    const yawInput = (keyState.ArrowLeft ? 1 : 0) - (keyState.ArrowRight ? 1 : 0);
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

  function updateSpaceshipKeyboardFlight(dt) {
    const speedFactor = keyState.ShiftLeft || keyState.ShiftRight ? 2.0 : 1.0;
    const acceleration = Math.max(0.01, params.keyboardMoveSpeed) * speedFactor;
    const angularAccel = getKeyboardRotationSpeedRad();
    const maxAngularRate = Math.max(spaceshipMaxAngularRate, angularAccel * 2.5);

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

    if (moveDelta.lengthSq() > 0.000001) {
      moveDelta.normalize().multiplyScalar(acceleration * dt);
      spaceshipLinearVelocity.add(moveDelta);
    }

    const maxLinearSpeed = Math.max(spaceshipSpeedFloor, getWorldSpan() * spaceshipSpeedLimitFactor);
    if (spaceshipLinearVelocity.lengthSq() > maxLinearSpeed * maxLinearSpeed) {
      spaceshipLinearVelocity.setLength(maxLinearSpeed);
    }

    if (spaceshipLinearVelocity.lengthSq() > spaceshipClampEpsilon) {
      moveDelta.copy(spaceshipLinearVelocity).multiplyScalar(dt);
      perspectiveCamera.position.add(moveDelta);
      controls.target.add(moveDelta);
    }

    const yawInput = (keyState.ArrowLeft ? 1 : 0) - (keyState.ArrowRight ? 1 : 0);
    const pitchInput = (keyState.ArrowUp ? 1 : 0) - (keyState.ArrowDown ? 1 : 0);
    const rollInput = (keyState.BracketRight ? 1 : 0) - (keyState.BracketLeft ? 1 : 0);
    if (yawInput !== 0) {
      spaceshipYawRate = THREE.MathUtils.clamp(
        spaceshipYawRate + yawInput * angularAccel * dt,
        -maxAngularRate,
        maxAngularRate,
      );
    }
    if (pitchInput !== 0) {
      spaceshipPitchRate = THREE.MathUtils.clamp(
        spaceshipPitchRate + pitchInput * angularAccel * dt,
        -maxAngularRate,
        maxAngularRate,
      );
    }
    if (rollInput !== 0) {
      spaceshipRollRate = THREE.MathUtils.clamp(
        spaceshipRollRate + rollInput * angularAccel * dt,
        -maxAngularRate,
        maxAngularRate,
      );
    }

    const sasEnabled = params.spaceshipSas !== false;
    if (sasEnabled) {
      const decay = Math.max(0, 1 - (spaceshipSasAngularDampingPerSec * dt));
      if (yawInput === 0) {
        spaceshipYawRate = Math.abs(spaceshipYawRate) < spaceshipClampEpsilon
          ? 0
          : spaceshipYawRate * decay;
      }
      if (pitchInput === 0) {
        spaceshipPitchRate = Math.abs(spaceshipPitchRate) < spaceshipClampEpsilon
          ? 0
          : spaceshipPitchRate * decay;
      }
      if (rollInput === 0) {
        spaceshipRollRate = Math.abs(spaceshipRollRate) < spaceshipClampEpsilon
          ? 0
          : spaceshipRollRate * decay;
      }
    }

    applySpaceshipAngularVelocity(dt);
    applySpaceshipBoundaryMode();
  }

  function applySpaceshipAngularVelocity(dt) {
    if (
      Math.abs(spaceshipYawRate) < spaceshipClampEpsilon &&
      Math.abs(spaceshipPitchRate) < spaceshipClampEpsilon &&
      Math.abs(spaceshipRollRate) < spaceshipClampEpsilon
    ) {
      return;
    }

    lookOffset.subVectors(controls.target, perspectiveCamera.position);
    if (lookOffset.lengthSq() < 0.000001) {
      forwardMove.set(0, 0, -1).applyQuaternion(perspectiveCamera.quaternion).normalize();
      lookOffset.copy(forwardMove).multiplyScalar(40);
    }

    rightMove.set(1, 0, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();
    upMove.set(0, 1, 0).applyQuaternion(perspectiveCamera.quaternion).normalize();

    if (Math.abs(spaceshipYawRate) >= spaceshipClampEpsilon) {
      rotationQuat.setFromAxisAngle(upMove, spaceshipYawRate * dt);
      lookOffset.applyQuaternion(rotationQuat);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }
    if (Math.abs(spaceshipPitchRate) >= spaceshipClampEpsilon) {
      rotationQuat.setFromAxisAngle(rightMove, spaceshipPitchRate * dt);
      lookOffset.applyQuaternion(rotationQuat);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }
    if (Math.abs(spaceshipRollRate) >= spaceshipClampEpsilon) {
      forwardMove.copy(lookOffset).normalize();
      rotationQuat.setFromAxisAngle(forwardMove, spaceshipRollRate * dt);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }

    perspectiveCamera.up.normalize();
    controls.target.copy(perspectiveCamera.position).add(lookOffset);
  }

  function applySpaceshipBoundaryMode() {
    if (params.projectionMode !== "perspective") {
      return;
    }

    const mode = normalizeBoundaryMode(params.boundaryMode);
    const halfX = Math.max(1e-6, (Number(params.worldSizeX) || 0) * 0.5);
    const halfY = Math.max(1e-6, (Number(params.worldSizeY) || 0) * 0.5);
    const halfZ = Math.max(1e-6, (Number(params.worldSizeZ) || 0) * 0.5);
    const originalX = perspectiveCamera.position.x;
    const originalY = perspectiveCamera.position.y;
    const originalZ = perspectiveCamera.position.z;

    let nextX = originalX;
    let nextY = originalY;
    let nextZ = originalZ;

    if (mode === "cyclic-xyz") {
      nextX = wrapAxis(originalX, halfX);
      nextY = wrapAxis(originalY, halfY);
      nextZ = wrapAxis(originalZ, halfZ);
    } else if (mode === "cyclic-xy") {
      nextX = wrapAxis(originalX, halfX);
      nextY = wrapAxis(originalY, halfY);
      nextZ = THREE.MathUtils.clamp(originalZ, -halfZ, halfZ);
    } else {
      nextX = THREE.MathUtils.clamp(originalX, -halfX, halfX);
      nextY = THREE.MathUtils.clamp(originalY, -halfY, halfY);
      nextZ = THREE.MathUtils.clamp(originalZ, -halfZ, halfZ);
    }

    const deltaX = nextX - originalX;
    const deltaY = nextY - originalY;
    const deltaZ = nextZ - originalZ;

    perspectiveCamera.position.set(nextX, nextY, nextZ);
    if (
      Math.abs(deltaX) > spaceshipClampEpsilon ||
      Math.abs(deltaY) > spaceshipClampEpsilon ||
      Math.abs(deltaZ) > spaceshipClampEpsilon
    ) {
      controls.target.x += deltaX;
      controls.target.y += deltaY;
      controls.target.z += deltaZ;
    }

    const clampedX = mode === "lost" && Math.abs(deltaX) > spaceshipClampEpsilon;
    const clampedY = mode === "lost" && Math.abs(deltaY) > spaceshipClampEpsilon;
    const clampedZ = (mode === "lost" || mode === "cyclic-xy") && Math.abs(deltaZ) > spaceshipClampEpsilon;
    if (clampedX) {
      spaceshipLinearVelocity.x = 0;
    }
    if (clampedY) {
      spaceshipLinearVelocity.y = 0;
    }
    if (clampedZ) {
      spaceshipLinearVelocity.z = 0;
    }
  }

  function haltSpaceshipRotation() {
    spaceshipYawRate = 0;
    spaceshipPitchRate = 0;
    spaceshipRollRate = 0;
  }

  function haltAllSpaceshipMotion() {
    spaceshipLinearVelocity.set(0, 0, 0);
    haltSpaceshipRotation();
  }

  function setSpaceshipMode(enabled) {
    const previousSnapshot = getCameraSnapshot();
    params.spaceshipMode = Boolean(enabled);
    if (!params.spaceshipMode) {
      haltAllSpaceshipMotion();
    } else if (params.projectionMode === "perspective") {
      endPointerDrag();
      touchState.pointers.clear();
      touchState.singleDragActive = false;
      touchState.singlePointerId = null;
      endTouchGesture();
      applySpaceshipBoundaryMode();
    }

    applyCameraInteractivity();
    if (!params.spaceshipMode && previousSnapshot?.projectionMode === "perspective") {
      applyCameraPose(perspectiveCamera, previousSnapshot.perspective);
      if (Array.isArray(previousSnapshot.target) && previousSnapshot.target.length === 3) {
        controls.target.fromArray(previousSnapshot.target);
      }
    }
    controls.update();
  }

  function getSpaceshipTelemetry() {
    forwardMove.set(0, 0, -1).applyQuaternion(perspectiveCamera.quaternion).normalize();
    const speed = spaceshipLinearVelocity.length();
    let alignment = 0;
    if (speed > spaceshipClampEpsilon) {
      moveDelta.copy(spaceshipLinearVelocity).normalize();
      alignment = THREE.MathUtils.clamp(moveDelta.dot(forwardMove), -1, 1);
    }

    return {
      speed,
      velocity: { x: spaceshipLinearVelocity.x, y: spaceshipLinearVelocity.y, z: spaceshipLinearVelocity.z },
      view: { x: forwardMove.x, y: forwardMove.y, z: forwardMove.z },
      alignment,
      angular: { yaw: spaceshipYawRate, pitch: spaceshipPitchRate, roll: spaceshipRollRate },
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

  function wrapAxis(value, halfExtent) {
    const span = halfExtent * 2;
    if (span <= 0) {
      return 0;
    }
    if (value > halfExtent || value < -halfExtent) {
      return ((((value + halfExtent) % span) + span) % span) - halfExtent;
    }
    return value;
  }

  function getKeyboardRotationSpeedRad() {
    const degPerSec = Math.max(0, Number(params.keyboardRotationSpeed) || 0);
    return THREE.MathUtils.degToRad(degPerSec);
  }

  function updateTelemetry() {
    if (!telemetry?.x) {
      return;
    }
    const editingField =
      (telemetry.x.isContentEditable && document.activeElement === telemetry.x) ||
      (telemetry.y.isContentEditable && document.activeElement === telemetry.y) ||
      (telemetry.z.isContentEditable && document.activeElement === telemetry.z) ||
      (telemetry.roll.isContentEditable && document.activeElement === telemetry.roll) ||
      (telemetry.pitch.isContentEditable && document.activeElement === telemetry.pitch) ||
      (telemetry.yaw.isContentEditable && document.activeElement === telemetry.yaw);
    if (editingField) {
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

  function applyPerspectiveLookDelta(dx, dy, sensitivity = mouseLookSensitivity) {
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
      rotationQuat.setFromAxisAngle(upAxis, -dx * sensitivity);
      lookOffset.applyQuaternion(rotationQuat);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }

    if (dy !== 0) {
      rotationQuat.setFromAxisAngle(rightMove, -dy * sensitivity);
      lookOffset.applyQuaternion(rotationQuat);
      perspectiveCamera.up.applyQuaternion(rotationQuat);
    }

    perspectiveCamera.up.normalize();
    controls.target.copy(perspectiveCamera.position).add(lookOffset);
    controls.update();
  }

  function applyForwardTranslationFromDrag(dy) {
    if (!Number.isFinite(dy) || Math.abs(dy) < 0.01) {
      return;
    }

    const height = Math.max(1, sceneHost.clientHeight);
    const screenScale = Math.max(getWorldSpan() * 0.8, 0.1);
    const forwardAmount = (-dy / height) * screenScale;

    forwardMove.set(0, 0, -1).applyQuaternion(perspectiveCamera.quaternion).normalize();
    moveDelta.copy(forwardMove).multiplyScalar(forwardAmount);
    perspectiveCamera.position.add(moveDelta);
    controls.target.add(moveDelta);
    controls.update();
  }

  function applyPerspectiveRollDelta(angleDelta) {
    if (!Number.isFinite(angleDelta) || Math.abs(angleDelta) < 1e-4) {
      return;
    }

    lookOffset.subVectors(controls.target, perspectiveCamera.position);
    if (lookOffset.lengthSq() < 0.000001) {
      lookOffset.set(0, 0, -1);
    }

    forwardMove.copy(lookOffset).normalize();
    rotationQuat.setFromAxisAngle(forwardMove, angleDelta);
    perspectiveCamera.up.applyQuaternion(rotationQuat);
    perspectiveCamera.up.normalize();
    controls.target.copy(perspectiveCamera.position).add(lookOffset);
    controls.update();
  }

  function normalizeAngleDelta(delta) {
    if (!Number.isFinite(delta)) {
      return 0;
    }
    if (delta > Math.PI) {
      return delta - (Math.PI * 2);
    }
    if (delta < -Math.PI) {
      return delta + (Math.PI * 2);
    }
    return delta;
  }

  sceneHost.addEventListener("pointerdown", onTouchPointerDown, { capture: true });
  sceneHost.addEventListener("pointermove", onTouchPointerMove, { capture: true });
  sceneHost.addEventListener("pointerup", onTouchPointerEnd, { capture: true });
  sceneHost.addEventListener("pointercancel", onTouchPointerEnd, { capture: true });
  sceneHost.addEventListener("pointerleave", onTouchPointerEnd, { capture: true });
  sceneHost.addEventListener("pointerdown", onPointerDown);
  sceneHost.addEventListener("pointermove", onPointerMove);
  sceneHost.addEventListener("pointerup", endPointerDrag);
  sceneHost.addEventListener("pointercancel", endPointerDrag);
  sceneHost.addEventListener("pointerleave", endPointerDrag);
  sceneHost.addEventListener("wheel", onWheel, { passive: false });
  sceneHost.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("blur", () => {
    endPointerDrag();
    touchState.pointers.clear();
    touchState.singleDragActive = false;
    touchState.singlePointerId = null;
    endTouchGesture();
    if (params.spaceshipMode) {
      haltAllSpaceshipMotion();
    }
  });

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
    setSpaceshipMode,
    haltSpaceshipRotation,
    haltAllSpaceshipMotion,
    getSpaceshipTelemetry,
    getCameraSnapshot,
    restoreCameraSnapshot,
    onKeyDown,
    onKeyUp,
  };
}
