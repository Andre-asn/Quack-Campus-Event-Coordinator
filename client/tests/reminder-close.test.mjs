import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldDropReminderAfterUnmount } from '../src/reminderClose.ts';

test('closing the sheet keeps a reminder saved in flight', () => {
  assert.equal(shouldDropReminderAfterUnmount(false), false);
});

test('leaving or cancelling drops a reminder saved in flight', () => {
  assert.equal(shouldDropReminderAfterUnmount(true), true);
});
