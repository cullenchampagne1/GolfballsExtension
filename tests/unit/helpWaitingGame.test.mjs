import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createWaitingGameState,
  jumpWaitingGame,
  stepWaitingGame,
  WAITING_GAME_WORLD,
} from '../../src/lib/helpWaitingGame.js';

describe('Help Companion waiting runner', () => {
  it('jumps from the ground and returns under bounded gravity', () => {
    let state = jumpWaitingGame(createWaitingGameState());
    assert.ok(state.velocityY > 0);
    state = stepWaitingGame(state, 0.1);
    assert.ok(state.runnerY > 0);
    for (let index = 0; index < 20; index += 1) {
      state = stepWaitingGame(state, 0.1);
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
    assert.equal(state.distance, 1);
  });
});
