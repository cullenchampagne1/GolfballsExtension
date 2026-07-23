/* Pure, renderer-independent physics for Help Companion waiting games. */

const WORLD_WIDTH = 220;
const RUNNER_X = 24;
const RUNNER_WIDTH = 14;
const RUNNER_HEIGHT = 18;
const OBSTACLE_WIDTH = 8;
const OBSTACLE_HEIGHT = 15;
const RUN_SPEED = 96;
const JUMP_SPEED = 125;
const RUNNER_GRAVITY = 500;

const FLAPPY_HEIGHT = 48;
const BIRD_X = 28;
const BIRD_WIDTH = 14;
const BIRD_HEIGHT = 10;
const PIPE_WIDTH = 12;
const PIPE_GAP = 24;
const PIPE_SPEED = 82;
const FLAP_SPEED = 58;
const BIRD_GRAVITY = 118;
const PIPE_GAPS = Object.freeze([10, 16, 7, 13]);

export const WAITING_GAME_KINDS = Object.freeze({
  runner: 'runner',
  flappy: 'flappy',
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function pickWaitingGame(random = Math.random) {
  let roll = 0;
  try {
    roll = finite(random(), 0);
  } catch {
    roll = 0;
  }
  return Math.abs(roll % 1) < 0.5
    ? WAITING_GAME_KINDS.runner
    : WAITING_GAME_KINDS.flappy;
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
  const dt = Math.max(0, Math.min(finite(elapsedSeconds), 0.05));
  if (!dt) return current;

  const previousVelocity = finite(current.velocityY);
  let velocityY = previousVelocity - (RUNNER_GRAVITY * dt);
  let runnerY = Math.max(
    0,
    finite(current.runnerY) + (((previousVelocity + velocityY) / 2) * dt),
  );
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

export function createFlappyGameState({ best = 0, pipeIndex = 0 } = {}) {
  const index = Math.max(0, Math.floor(finite(pipeIndex)));
  return {
    birdY: 18,
    velocityY: -42,
    pipeX: WORLD_WIDTH + 12,
    gapY: PIPE_GAPS[index % PIPE_GAPS.length],
    pipeIndex: index,
    pipePassed: false,
    score: 0,
    best: Math.max(0, Math.floor(finite(best))),
    crashed: false,
  };
}

export function flapWaitingBird(state) {
  const current = state || createFlappyGameState();
  if (current.crashed) {
    return {
      ...createFlappyGameState({
        best: Math.max(finite(current.best), Math.floor(finite(current.score))),
        pipeIndex: finite(current.pipeIndex),
      }),
      velocityY: -FLAP_SPEED,
    };
  }
  return { ...current, velocityY: -FLAP_SPEED };
}

export function stepFlappyGame(state, elapsedSeconds) {
  const current = state || createFlappyGameState();
  if (current.crashed) return current;
  const dt = Math.max(0, Math.min(finite(elapsedSeconds), 0.05));
  if (!dt) return current;

  const previousVelocity = finite(current.velocityY);
  const velocityY = previousVelocity + (BIRD_GRAVITY * dt);
  const birdY = finite(current.birdY, 18)
    + (((previousVelocity + velocityY) / 2) * dt);
  let pipeX = finite(current.pipeX, WORLD_WIDTH + 12) - (PIPE_SPEED * dt);
  let pipeIndex = Math.max(0, Math.floor(finite(current.pipeIndex)));
  let gapY = finite(current.gapY, PIPE_GAPS[pipeIndex % PIPE_GAPS.length]);
  let pipePassed = current.pipePassed === true;
  let score = Math.max(0, Math.floor(finite(current.score)));

  if (!pipePassed && pipeX + PIPE_WIDTH < BIRD_X) {
    pipePassed = true;
    score += 1;
  }
  if (pipeX < -PIPE_WIDTH) {
    pipeIndex += 1;
    pipeX = WORLD_WIDTH + 24;
    gapY = PIPE_GAPS[pipeIndex % PIPE_GAPS.length];
    pipePassed = false;
  }

  const horizontalHit = (
    pipeX < BIRD_X + BIRD_WIDTH
    && pipeX + PIPE_WIDTH > BIRD_X
  );
  const pipeHit = horizontalHit && (
    birdY < gapY
    || birdY + BIRD_HEIGHT > gapY + PIPE_GAP
  );
  const boundaryHit = birdY <= 0 || birdY + BIRD_HEIGHT >= FLAPPY_HEIGHT;
  const crashed = pipeHit || boundaryHit;

  return {
    birdY: Math.max(0, Math.min(birdY, FLAPPY_HEIGHT - BIRD_HEIGHT)),
    velocityY,
    pipeX,
    gapY,
    pipeIndex,
    pipePassed,
    score,
    best: Math.max(finite(current.best), score),
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

export const FLAPPY_GAME_WORLD = Object.freeze({
  width: WORLD_WIDTH,
  height: FLAPPY_HEIGHT,
  birdX: BIRD_X,
  birdWidth: BIRD_WIDTH,
  birdHeight: BIRD_HEIGHT,
  pipeWidth: PIPE_WIDTH,
  pipeGap: PIPE_GAP,
});
