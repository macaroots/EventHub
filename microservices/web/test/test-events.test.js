import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHiddenTestEvent } from '../src/events/test-events.js';
test('only the three named test events are hidden from listings', () => {
 for (const id of ['2cb5f8fb-888d-44de-94b2-94682d43fccd','843f5a28-32c1-406f-9393-89ad4a85396f','6831ca05-2c00-48e1-a4f1-52f0fa399deb']) assert.equal(isHiddenTestEvent(id), true);
 assert.equal(isHiddenTestEvent('outro-evento'), false);
});
