import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCart } from '../cart.js';

test('validates a multi-product cart', () => {
  assert.deepEqual(validateCart([{ id: 'zinc', quantity: 2 }, { id: 'soil', quantity: 1 }]),
    [{ id: 'zinc', quantity: 2 }, { id: 'soil', quantity: 1 }]);
});

test('rejects altered product IDs and quantities', () => {
  for (const cart of [
    [], [{ id: 'fake', quantity: 1 }], [{ id: 'zinc', quantity: 0 }],
    [{ id: 'zinc', quantity: 21 }], [{ id: 'zinc', quantity: '2' }],
    [{ id: 'zinc', quantity: 1.5 }],
    [{ id: 'zinc', quantity: 1 }, { id: 'zinc', quantity: 2 }]
  ]) assert.throws(() => validateCart(cart));
});

test('discards untrusted client prices', () => {
  assert.deepEqual(validateCart([{ id: 'crop', quantity: 1, price: 0 }]),
    [{ id: 'crop', quantity: 1 }]);
});
