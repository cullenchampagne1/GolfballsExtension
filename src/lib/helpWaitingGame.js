/* ───────────────────────────────────────────────────────────────
   helpWaitingGame — pure physics for the runner/jumper "waiting
   game" the Help Companion shows while a turn is loading.

   A tiny endless-runner over a fixed WORLD (see WAITING_GAME_WORLD):
   createWaitingGameState() seeds a run, stepWaitingGame(state, dt)
   advances one frame (gravity, obstacle scroll, collision → crashed,
   best-distance tracking), and jumpWaitingGame() launches a jump or
   restarts after a crash. All functions are pure and null-safe — the
   caller owns the animation loop and rendering.
─────────────────────────────────────────────────────────────── */

const WORLD_WIDTH = 220;
const RUNNER_X = 24;
const RUNNER_WIDTH = 14;
const RUNNER_HEIGHT = 18;
const OBSTACLE_WIDTH = 8;
const OBSTACLE_HEIGHT = 15;
const RUN_SPEED = 72;
const JUMP_SPEED = 158;
const GRAVITY = 390;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function createWaitingGameState({ best = 0, jumping = false } = {}) {
  return {
    runnerY: 0,
    velocityY: jumping ? JUMP_SPEED : 0,
    obstacleX: WORLD_WIDTH - 8,
    distance: 0,
    best: Math.max(0, Math.floor(finite(best))),
    crashed: false,
  };
}

export function jumpWaitingGame(state) {
  const current = state || createWaitingGameState();
  if (current.crashed) {
    return createWaitingGameState({
      best: Math.max(current.best, Math.floor(current.distance)),
      jumping: true,
    });
  }
  if (finite(current.runnerY) > 0.5) return current;
  return { ...current, runnerY: 0, velocityY: JUMP_SPEED };
}

export function stepWaitingGame(state, elapsedSeconds) {
  const current = state || createWaitingGameState();
  if (current.crashed) return current;
  const dt = Math.max(0, Math.min(finite(elapsedSeconds), 0.1));
  if (!dt) return current;

  let velocityY = finite(current.velocityY) - (GRAVITY * dt);
  let runnerY = Math.max(0, finite(current.runnerY) + (finite(current.velocityY) * dt));
  if (runnerY === 0 && velocityY < 0) velocityY = 0;

  const distance = finite(current.distance) + (dt * 10);
  let obstacleX = finite(current.obstacleX, WORLD_WIDTH) - (RUN_SPEED * dt);
  if (obstacleX < -OBSTACLE_WIDTH) {
    const lap = Math.floor(distance / 10);
    obstacleX = WORLD_WIDTH + 28 + ((lap % 3) * 13);
  }

  const horizontalHit = (
    obstacleX < RUNNER_X + RUNNER_WIDTH
    && obstacleX + OBSTACLE_WIDTH > RUNNER_X
  );
  const verticalHit = runnerY < OBSTACLE_HEIGHT - 1;
  const crashed = horizontalHit && verticalHit;
  const best = Math.max(finite(current.best), Math.floor(distance));

  return {
    runnerY,
    velocityY,
    obstacleX,
    distance,
    best,
    crashed,
  };
}

export const WAITING_GAME_WORLD = Object.freeze({
  width: WORLD_WIDTH,
  runnerX: RUNNER_X,
  runnerWidth: RUNNER_WIDTH,
  runnerHeight: RUNNER_HEIGHT,
  obstacleWidth: OBSTACLE_WIDTH,
  obstacleHeight: OBSTACLE_HEIGHT,
});
