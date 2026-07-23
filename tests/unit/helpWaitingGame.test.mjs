import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createFlappyGameState,
  createWaitingGameState,
  flapWaitingBird,
  FLAPPY_GAME_WORLD,
  jumpWaitingGame,
  pickWaitingGame,
  stepFlappyGame,
  stepWaitingGame,
  WAITING_GAME_KINDS,
  WAITING_GAME_WORLD,
} from '../../src/lib/helpWaitingGame.js';

describe('Help Companion waiting games', () => {
  it('selects runner and flappy variants from a deterministic random roll', () => {
    assert.equal(pickWaitingGame(() => 0.1), WAITING_GAME_KINDS.runner);
    assert.equal(pickWaitingGame(() => 0.9), WAITING_GAME_KINDS.flappy);
    assert.equal(pickWaitingGame(() => { throw new Error('no entropy'); }), WAITING_GAME_KINDS.runner);
  });

  it('gives the runner a short, bounded jump arc', () => {
    let state = jumpWaitingGame(createWaitingGameState());
    assert.ok(state.velocityY > 0);
    state = stepWaitingGame(state, 0.05);
    assert.ok(state.runnerY > 0);
    for (let index = 0; index < 11; index += 1) {
      state = stepWaitingGame(state, 0.05);
    }
    assert.equal(state.runnerY, 0);
    assert.equal(state.velocityY, 0);
  });

  it('detects a grounded collision and preserves the best score on restart', () => {
    const collision = stepWaitingGame({
      ...createWaitingGameState(),
      obstacleX: WAITING_GAME_WORLD.runnerX + 2,
      distance: 12.4,
    }, 0.01);
    assert.equal(collision.crashed, true);
    const restarted = jumpWaitingGame(collision);
    assert.equal(restarted.crashed, false);
    assert.equal(restarted.best, 12);
    assert.ok(restarted.velocityY > 0);
  });

  it('wraps an escaped obstacle without allowing unbounded frame steps', () => {
    const state = stepWaitingGame({
      ...createWaitingGameState(),
      obstacleX: -WAITING_GAME_WORLD.obstacleWidth - 1,
    }, 20);
    assert.ok(state.obstacleX > WAITING_GAME_WORLD.width);
    assert.equal(state.distance, 0.5);
  });

  it('flaps upward, collides with a pipe, and restarts with the best score', () => {
    const flapped = flapWaitingBird(createFlappyGameState());
    assert.ok(flapped.velocityY < 0);

    const collision = stepFlappyGame({
      ...createFlappyGameState({ best: 2 }),
      birdY: 5,
      pipeX: FLAPPY_GAME_WORLD.birdX + 1,
      gapY: 16,
      score: 3,
    }, 0.01);
    assert.equal(collision.crashed, true);

    const restarted = flapWaitingBird(collision);
    assert.equal(restarted.crashed, false);
    assert.equal(restarted.best, 3);
    assert.ok(restarted.velocityY < 0);
  });

  it('scores a cleared pipe and rotates the next gap after it leaves the world', () => {
    const scored = stepFlappyGame({
      ...createFlappyGameState(),
      pipeX: FLAPPY_GAME_WORLD.birdX - FLAPPY_GAME_WORLD.pipeWidth - 1,
      birdY: 18,
    }, 0.01);
    assert.equal(scored.score, 1);
    assert.equal(scored.pipePassed, true);

    const wrapped = stepFlappyGame({
      ...scored,
      pipeX: -FLAPPY_GAME_WORLD.pipeWidth - 1,
    }, 0.01);
    assert.ok(wrapped.pipeX > FLAPPY_GAME_WORLD.width);
    assert.equal(wrapped.pipeIndex, 1);
    assert.equal(wrapped.pipePassed, false);
  });
});
