import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateElapsedSeconds } from './timer.ts';

test('calculates elapsed time from timestamps even when UI frames are suspended', () => {
  assert.equal(calculateElapsedSeconds(30, 1_000, 601_000), 630);
});

test('returns the accumulated time while paused', () => {
  assert.equal(calculateElapsedSeconds(630, null, 999_999), 630);
});

test('does not subtract study time when the device clock moves backwards', () => {
  assert.equal(calculateElapsedSeconds(45, 10_000, 9_000), 45);
});
