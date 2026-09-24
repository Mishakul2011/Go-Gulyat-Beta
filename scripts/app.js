const COPY = Object.freeze({
  prompts: [
    "Пойдем гулять?)",
    "Точно?",
    "А если подумать?",
    "А если еще подумать?",
    "Ну пожалуйстааа",
    "Ну тут уже без вариантов :)",
  ],
  accepted: "Урааааааа",
  yes: "Да",
  no: "Нет",
});

const MOTION = Object.freeze({
  escapeMs: 118,
  exitMs: 132,
  titleSwapMs: 54,
  minTravelPx: 104,
  minHistoryDistancePx: 96,
  edgeGapPx: 22,
  obstacleGapPx: 24,
  candidateCount: 40,
  historySize: 4,
  gridColumns: 3,
  gridRows: 4,
});

const CONFETTI = Object.freeze({
  colors: ["#5877B8", "#E7776E", "#E8B94F", "#55A893", "#8A6FB4", "#D85D88"],
  pieces: 176,
  reducedPieces: 64,
  emissionMs: 1250,
  gravity: 620,
  maxSettled: 170,
  maxTiltGravity: 360,
});

const question = document.querySelector("#question");
const experience = document.querySelector("#experience");
const actions = document.querySelector("#actions");
const yesButton = document.querySelector("#yesButton");
const noButton = document.querySelector("#noButton");
const canvas = document.querySelector("#confetti");
const context = canvas.getContext("2d", { alpha: true });

let attemptCount = 0;
let noIsFloating = false;
let noIsGone = false;
let accepted = false;
let titleTimer = 0;
let resizeFrame = 0;
const positionHistory = [];
const zoneHistory = [];

const safeAreaProbe = document.createElement("div");
safeAreaProbe.setAttribute("aria-hidden", "true");
safeAreaProbe.style.cssText = [
  "position:fixed",
  "inset:0",
  "visibility:hidden",
  "pointer-events:none",
  "padding-top:env(safe-area-inset-top, 0px)",
  "padding-right:env(safe-area-inset-right, 0px)",
  "padding-bottom:env(safe-area-inset-bottom, 0px)",
  "padding-left:env(safe-area-inset-left, 0px)",
].join(";");
document.body.append(safeAreaProbe);

yesButton.textContent = COPY.yes;
noButton.textContent = COPY.no;

function getViewport() {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function expandedRect(rect, gap) {
  return {
    left: rect.left - gap,
    top: rect.top - gap,
    right: rect.right + gap,
    bottom: rect.bottom + gap,
  };
}

function overlaps(x, y, width, height, obstacle) {
  return !(
    x + width < obstacle.left ||
    x > obstacle.right ||
    y + height < obstacle.top ||
    y > obstacle.bottom
  );
}

function getSafeAreaInsets() {
  const styles = getComputedStyle(safeAreaProbe);
  return {
    top: Number.parseFloat(styles.paddingTop) || 0,
    right: Number.parseFloat(styles.paddingRight) || 0,
    bottom: Number.parseFloat(styles.paddingBottom) || 0,
    left: Number.parseFloat(styles.paddingLeft) || 0,
  };
}

function pointDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getZoneId(x, y, bounds) {
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const column = Math.min(
    MOTION.gridColumns - 1,
    Math.max(0, Math.floor(((x - bounds.minX) / width) * MOTION.gridColumns)),
  );
  const row = Math.min(
    MOTION.gridRows - 1,
    Math.max(0, Math.floor(((y - bounds.minY) / height) * MOTION.gridRows)),
  );
  return row * MOTION.gridColumns + column;
}

function rememberPosition(position, zoneId) {
  const previous = positionHistory.at(-1);
  if (!previous || pointDistance(previous, position) > 3) {
    positionHistory.push(position);
    if (positionHistory.length > MOTION.historySize) positionHistory.shift();
  }

  if (zoneHistory.at(-1) !== zoneId) {
    zoneHistory.push(zoneId);
    if (zoneHistory.length > MOTION.historySize) zoneHistory.shift();
  }
}

function swapTitle(text) {
  window.clearTimeout(titleTimer);
  question.classList.add("is-changing");
  titleTimer = window.setTimeout(() => {
    question.textContent = text;
    requestAnimationFrame(() => question.classList.remove("is-changing"));
  }, MOTION.titleSwapMs);
}

function floatNoButton() {
  if (noIsFloating) return;

  const rect = noButton.getBoundingClientRect();
  experience.append(noButton);
  noButton.style.left = `${rect.left}px`;
  noButton.style.top = `${rect.top}px`;
  noButton.style.right = "auto";
  noButton.style.width = `${rect.width}px`;
  noButton.style.height = `${rect.height}px`;
  noButton.style.transform = "none";
  noButton.classList.add("is-escaping");
  noIsFloating = true;
}

function pickSafePosition() {
  const viewport = getViewport();
  const safeArea = getSafeAreaInsets();
  const rect = noButton.getBoundingClientRect();
  const titleRect = expandedRect(question.getBoundingClientRect(), MOTION.obstacleGapPx);
  const yesRect = expandedRect(yesButton.getBoundingClientRect(), MOTION.obstacleGapPx);
  const bounds = {
    minX: viewport.left + Math.max(MOTION.edgeGapPx, safeArea.left + 12),
    maxX: viewport.left + viewport.width - rect.width - Math.max(MOTION.edgeGapPx, safeArea.right + 12),
    minY: viewport.top + Math.max(26, safeArea.top + 12),
    maxY: viewport.top + viewport.height - rect.height - Math.max(30, safeArea.bottom + 14),
  };
  const current = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
  const currentZone = getZoneId(rect.left, rect.top, bounds);
  rememberPosition(current, currentZone);

  const minTravel = Math.min(MOTION.minTravelPx, viewport.width * 0.33);
  const recentZones = new Set(zoneHistory.slice(-3));
  const allZones = Array.from(
    { length: MOTION.gridColumns * MOTION.gridRows },
    (_, index) => index,
  );
  const preferredZones = shuffle(allZones.filter((zoneId) => !recentZones.has(zoneId)));
  const zoneOrder = preferredZones.length ? preferredZones : shuffle(allZones);
  const rangeX = Math.max(1, bounds.maxX - bounds.minX);
  const rangeY = Math.max(1, bounds.maxY - bounds.minY);
  const cellWidth = rangeX / MOTION.gridColumns;
  const cellHeight = rangeY / MOTION.gridRows;

  function collectCandidates({ avoidRecentZones, minHistoryDistance }) {
    const candidates = [];
    const activeZoneOrder = avoidRecentZones ? zoneOrder : shuffle(allZones);

    for (let index = 0; index < MOTION.candidateCount; index += 1) {
      const zoneId = activeZoneOrder[index % activeZoneOrder.length];
      if (avoidRecentZones && recentZones.has(zoneId)) continue;

      const column = zoneId % MOTION.gridColumns;
      const row = Math.floor(zoneId / MOTION.gridColumns);
      const x = Math.min(
        bounds.maxX,
        bounds.minX + (column + 0.12 + Math.random() * 0.76) * cellWidth,
      );
      const y = Math.min(
        bounds.maxY,
        bounds.minY + (row + 0.12 + Math.random() * 0.76) * cellHeight,
      );
      const center = { x: x + rect.width / 2, y: y + rect.height / 2 };
      const travelDistance = pointDistance(center, current);
      const historyDistance = positionHistory.length
        ? Math.min(...positionHistory.map((position) => pointDistance(center, position)))
        : Number.POSITIVE_INFINITY;

      if (travelDistance < minTravel) continue;
      if (historyDistance < minHistoryDistance) continue;
      if (overlaps(x, y, rect.width, rect.height, titleRect)) continue;
      if (overlaps(x, y, rect.width, rect.height, yesRect)) continue;

      const edgeComfort = Math.min(
        x - bounds.minX,
        bounds.maxX - x,
        y - bounds.minY,
        bounds.maxY - y,
      );
      const score =
        historyDistance * 0.32 +
        travelDistance * 0.15 +
        Math.max(0, edgeComfort) * 0.2 +
        Math.random() * 90;
      candidates.push({ x, y, zoneId, score });
    }

    return candidates;
  }

  let candidates = collectCandidates({
    avoidRecentZones: true,
    minHistoryDistance: MOTION.minHistoryDistancePx,
  });

  if (!candidates.length) {
    candidates = collectCandidates({
      avoidRecentZones: false,
      minHistoryDistance: MOTION.minHistoryDistancePx * 0.72,
    });
  }

  if (!candidates.length) {
    candidates = collectCandidates({
      avoidRecentZones: false,
      minHistoryDistance: 0,
    });
  }

  const ranked = candidates.sort((first, second) => second.score - first.score);
  const shortlist = ranked.slice(0, Math.min(6, ranked.length));
  const fallbackCandidates = allZones
    .map((zoneId) => {
      const column = zoneId % MOTION.gridColumns;
      const row = Math.floor(zoneId / MOTION.gridColumns);
      const x = Math.min(bounds.maxX, bounds.minX + (column + 0.5) * cellWidth);
      const y = Math.min(bounds.maxY, bounds.minY + (row + 0.5) * cellHeight);
      const center = { x: x + rect.width / 2, y: y + rect.height / 2 };
      const historyDistance = positionHistory.length
        ? Math.min(...positionHistory.map((position) => pointDistance(center, position)))
        : Number.POSITIVE_INFINITY;
      return { x, y, zoneId, score: historyDistance + pointDistance(center, current) };
    })
    .filter(({ x, y }) =>
      !overlaps(x, y, rect.width, rect.height, titleRect) &&
      !overlaps(x, y, rect.width, rect.height, yesRect),
    )
    .sort((first, second) => second.score - first.score);
  const selected = shortlist[Math.floor(Math.random() * shortlist.length)]
    ?? fallbackCandidates[0]
    ?? { x: rect.left, y: rect.top, zoneId: currentZone };

  rememberPosition(
    { x: selected.x + rect.width / 2, y: selected.y + rect.height / 2 },
    selected.zoneId,
  );
  return selected;
}

function moveNoButton() {
  floatNoButton();
  const next = pickSafePosition();
  requestAnimationFrame(() => {
    noButton.style.left = `${Math.round(next.x)}px`;
    noButton.style.top = `${Math.round(next.y)}px`;
    noButton.style.transform = "none";
  });
}

function dismissNoButton() {
  floatNoButton();
  const viewport = getViewport();
  const rect = noButton.getBoundingClientRect();
  const distances = [
    { edge: "left", distance: rect.left - viewport.left },
    { edge: "right", distance: viewport.left + viewport.width - rect.right },
    { edge: "top", distance: rect.top - viewport.top },
    { edge: "bottom", distance: viewport.top + viewport.height - rect.bottom },
  ].sort((a, b) => a.distance - b.distance);

  let left = rect.left;
  let top = rect.top;
  const offset = 24;

  if (distances[0].edge === "left") left = viewport.left - rect.width - offset;
  if (distances[0].edge === "right") left = viewport.left + viewport.width + offset;
  if (distances[0].edge === "top") top = viewport.top - rect.height - offset;
  if (distances[0].edge === "bottom") top = viewport.top + viewport.height + offset;

  noButton.style.setProperty("--escape-duration", `${MOTION.exitMs}ms`);
  requestAnimationFrame(() => {
    noButton.style.left = `${Math.round(left)}px`;
    noButton.style.top = `${Math.round(top)}px`;
    noButton.style.transform = `rotate(${distances[0].edge === "left" ? -9 : 9}deg) scale(0.94)`;
    noButton.style.opacity = "0.25";
  });

  window.setTimeout(() => {
    noIsGone = true;
    noButton.hidden = true;
    noButton.remove();
    actions.classList.add("is-solo");
  }, MOTION.exitMs + 24);
}

function handleNoAttempt(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
  if (accepted || noIsGone || attemptCount >= 5) return;

  attemptCount += 1;
  swapTitle(COPY.prompts[attemptCount]);

  if (attemptCount < 5) moveNoButton();
  else dismissNoButton();
}

function blockNoClick(event) {
  event.preventDefault();
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
}

noButton.addEventListener("pointerdown", handleNoAttempt, { capture: true, passive: false });
noButton.addEventListener("click", blockNoClick, { capture: true });
noButton.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") handleNoAttempt(event);
});

if (!("PointerEvent" in window)) {
  noButton.addEventListener("touchstart", handleNoAttempt, { capture: true, passive: false });
  noButton.addEventListener("mousedown", handleNoAttempt, { capture: true });
}

function clampFloatingNoButton() {
  if (!noIsFloating || noIsGone || accepted) return;

  const viewport = getViewport();
  const rect = noButton.getBoundingClientRect();
  const minX = viewport.left + MOTION.edgeGapPx;
  const maxX = viewport.left + viewport.width - rect.width - MOTION.edgeGapPx;
  const minY = viewport.top + MOTION.edgeGapPx;
  const maxY = viewport.top + viewport.height - rect.height - 30;

  noButton.style.left = `${Math.round(Math.min(Math.max(rect.left, minX), maxX))}px`;
  noButton.style.top = `${Math.round(Math.min(Math.max(rect.top, minY), maxY))}px`;
}

const confettiState = {
  particles: [],
  pile: [],
  width: 0,
  height: 0,
  dpr: 1,
  running: false,
  startedAt: 0,
  emitted: 0,
  lastFrame: 0,
  frameId: 0,
};

const sensorState = {
  gravityX: 0,
  gravityY: CONFETTI.gravity,
  targetGravityX: 0,
  targetGravityY: CONFETTI.gravity,
  orientationListening: false,
  motionListening: false,
  lastOrientationAt: 0,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateOrientationGravity(event) {
  if (!Number.isFinite(event.gamma) && !Number.isFinite(event.beta)) return;

  const gamma = Number.isFinite(event.gamma) ? event.gamma : 0;
  const beta = Number.isFinite(event.beta) ? event.beta : 45;
  const screenAngle = Number(window.screen?.orientation?.angle ?? window.orientation ?? 0);
  let horizontalTilt = gamma;

  if (Math.abs(screenAngle) === 90) {
    horizontalTilt = (beta - 45) * (screenAngle === 90 ? -1 : 1);
  }

  sensorState.targetGravityX = clamp(
    (horizontalTilt / 45) * CONFETTI.maxTiltGravity,
    -CONFETTI.maxTiltGravity,
    CONFETTI.maxTiltGravity,
  );
  sensorState.targetGravityY = CONFETTI.gravity * clamp(0.86 + Math.abs(beta) / 500, 0.86, 1.08);
  sensorState.lastOrientationAt = performance.now();
}

function updateMotionGravity(event) {
  if (performance.now() - sensorState.lastOrientationAt < 800) return;

  const acceleration = event.accelerationIncludingGravity;
  if (!acceleration || !Number.isFinite(acceleration.x)) return;

  sensorState.targetGravityX = clamp(
    acceleration.x * 42,
    -CONFETTI.maxTiltGravity,
    CONFETTI.maxTiltGravity,
  );
  sensorState.targetGravityY = CONFETTI.gravity;
}

function listenForOrientation() {
  if (sensorState.orientationListening) return;
  sensorState.orientationListening = true;
  window.addEventListener("deviceorientation", updateOrientationGravity, { passive: true });
}

function listenForMotion() {
  if (sensorState.motionListening) return;
  sensorState.motionListening = true;
  window.addEventListener("devicemotion", updateMotionGravity, { passive: true });
}

function enableDeviceSensors() {
  const orientationApi = window.DeviceOrientationEvent;
  const motionApi = window.DeviceMotionEvent;
  const orientationAvailable = typeof orientationApi !== "undefined" || "ondeviceorientation" in window;
  const motionAvailable = typeof motionApi !== "undefined" || "ondevicemotion" in window;
  const orientationPermission = orientationApi?.requestPermission;
  const motionPermission = motionApi?.requestPermission;

  if (orientationAvailable && typeof orientationPermission !== "function") {
    listenForOrientation();
  }
  if (motionAvailable && typeof motionPermission !== "function") {
    listenForMotion();
  }

  if (typeof orientationPermission === "function") {
    try {
      orientationPermission.call(orientationApi)
        .then((permission) => {
          if (permission === "granted") listenForOrientation();
        })
        .catch(() => {});
    } catch {
      // Keep the default confetti physics when the browser blocks sensor access.
    }
  }

  if (typeof motionPermission === "function") {
    try {
      motionPermission.call(motionApi)
        .then((permission) => {
          if (permission === "granted") listenForMotion();
        })
        .catch(() => {});
    } catch {
      // Motion data is optional; orientation or default gravity remains available.
    }
  }
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const oldWidth = confettiState.width || rect.width;
  const oldHeight = confettiState.height || rect.height;
  const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

  confettiState.width = rect.width;
  confettiState.height = rect.height;
  confettiState.dpr = nextDpr;
  canvas.width = Math.max(1, Math.round(rect.width * nextDpr));
  canvas.height = Math.max(1, Math.round(rect.height * nextDpr));
  context.setTransform(nextDpr, 0, 0, nextDpr, 0, 0);

  if (oldWidth && oldHeight && (oldWidth !== rect.width || oldHeight !== rect.height)) {
    const scaleX = rect.width / oldWidth;
    const scaleY = rect.height / oldHeight;
    confettiState.particles.forEach((particle) => {
      particle.x *= scaleX;
      particle.y *= scaleY;
    });
  }

  const binCount = Math.max(12, Math.ceil(rect.width / 18));
  if (confettiState.pile.length !== binCount) confettiState.pile = new Array(binCount).fill(0);
  drawConfetti();
}

function makeParticle(side) {
  const fromLeft = side === "left";
  const width = randomBetween(5, 10);
  const height = randomBetween(10, 20);
  const y = randomBetween(confettiState.height * 0.43, confettiState.height * 0.82);

  return {
    x: fromLeft ? -width : confettiState.width + width,
    y,
    width,
    height,
    vx: randomBetween(150, 360) * (fromLeft ? 1 : -1),
    vy: randomBetween(-430, -165),
    angle: randomBetween(0, Math.PI * 2),
    spin: randomBetween(-8.5, 8.5),
    color: CONFETTI.colors[Math.floor(Math.random() * CONFETTI.colors.length)],
    wobble: randomBetween(0, Math.PI * 2),
    wobbleSpeed: randomBetween(4, 8),
    drag: randomBetween(0.986, 0.996),
    landed: false,
    bounced: false,
  };
}

function emitConfetti(time) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const target = reduceMotion ? CONFETTI.reducedPieces : CONFETTI.pieces;
  const elapsed = time - confettiState.startedAt;
  const desired = Math.min(target, Math.floor((elapsed / CONFETTI.emissionMs) * target));

  while (confettiState.emitted < desired) {
    const side = confettiState.emitted % 2 === 0 ? "left" : "right";
    confettiState.particles.push(makeParticle(side));
    confettiState.emitted += 1;
  }
}

function settleParticle(particle) {
  const bins = confettiState.pile;
  const binWidth = confettiState.width / bins.length;
  const index = Math.max(0, Math.min(bins.length - 1, Math.floor(particle.x / binWidth)));
  const maxPile = Math.min(54, confettiState.height * 0.085);
  const level = Math.min(maxPile, bins[index] + randomBetween(2.5, 5.5));
  bins[index] = level;
  if (index > 0) bins[index - 1] = Math.min(maxPile, bins[index - 1] + 0.7);
  if (index < bins.length - 1) bins[index + 1] = Math.min(maxPile, bins[index + 1] + 0.7);

  particle.y = confettiState.height - 7 - level - particle.height * 0.28;
  particle.vx = 0;
  particle.vy = 0;
  particle.spin = 0;
  particle.angle += randomBetween(-0.28, 0.28);
  particle.landed = true;
}

function updateParticle(particle, delta) {
  if (particle.landed) return;

  particle.vx += sensorState.gravityX * delta;
  particle.vy += sensorState.gravityY * delta;
  particle.vx *= Math.pow(particle.drag, delta * 60);
  particle.x += particle.vx * delta;
  particle.y += particle.vy * delta;
  particle.angle += particle.spin * delta;
  particle.wobble += particle.wobbleSpeed * delta;

  const floor = confettiState.height - 8;
  if (particle.y + particle.height * 0.5 >= floor && particle.vy > 0) {
    if (!particle.bounced && Math.abs(particle.vy) > 115 && Math.random() < 0.52) {
      particle.y = floor - particle.height * 0.5;
      particle.vy *= -randomBetween(0.12, 0.24);
      particle.vx *= 0.55;
      particle.bounced = true;
    } else {
      settleParticle(particle);
    }
  }
}

function drawConfetti() {
  context.clearRect(0, 0, confettiState.width, confettiState.height);

  confettiState.particles.forEach((particle) => {
    context.save();
    context.translate(particle.x + Math.sin(particle.wobble) * (particle.landed ? 0 : 2.2), particle.y);
    context.rotate(particle.angle);
    context.fillStyle = particle.color;
    context.globalAlpha = particle.landed ? 0.92 : 0.96;
    context.fillRect(-particle.width / 2, -particle.height / 2, particle.width, particle.height);
    context.restore();
  });
}

function animateConfetti(time) {
  if (!confettiState.running) return;
  if (!confettiState.lastFrame) confettiState.lastFrame = time;
  const delta = Math.min(0.032, (time - confettiState.lastFrame) / 1000);
  confettiState.lastFrame = time;
  const gravityEase = Math.min(1, delta * 5.5);
  sensorState.gravityX += (sensorState.targetGravityX - sensorState.gravityX) * gravityEase;
  sensorState.gravityY += (sensorState.targetGravityY - sensorState.gravityY) * gravityEase;

  emitConfetti(time);
  confettiState.particles.forEach((particle) => updateParticle(particle, delta));
  drawConfetti();

  const emissionDone = confettiState.emitted >= (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? CONFETTI.reducedPieces
      : CONFETTI.pieces
  );
  const allLanded = emissionDone && confettiState.particles.every((particle) => particle.landed);

  if (allLanded) {
    confettiState.running = false;
    confettiState.particles = confettiState.particles.slice(-CONFETTI.maxSettled);
    drawConfetti();
    return;
  }

  confettiState.frameId = requestAnimationFrame(animateConfetti);
}

function launchConfetti() {
  cancelAnimationFrame(confettiState.frameId);
  confettiState.particles = [];
  confettiState.pile.fill(0);
  confettiState.emitted = 0;
  confettiState.running = true;
  confettiState.startedAt = performance.now();
  confettiState.lastFrame = 0;
  confettiState.frameId = requestAnimationFrame(animateConfetti);
}

function acceptInvitation() {
  if (accepted) return;
  accepted = true;
  enableDeviceSensors();
  noIsGone = true;
  swapTitle(COPY.accepted);
  actions.classList.add("is-complete");
  noButton.remove();

  window.setTimeout(() => {
    actions.hidden = true;
    launchConfetti();
  }, 150);
}

yesButton.addEventListener("click", acceptInvitation);

function handleResize() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    clampFloatingNoButton();
    resizeCanvas();
  });
}

window.addEventListener("resize", handleResize, { passive: true });
window.visualViewport?.addEventListener("resize", handleResize, { passive: true });
window.visualViewport?.addEventListener("scroll", handleResize, { passive: true });

resizeCanvas();
