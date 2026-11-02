import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCart } from '../cart.js';

const products = new Map([['zinc', { unitAmount: 3800 }], ['soil', { unitAmount: 5200 }], ['crop', { unitAmount: 4800 }]]);
test('validates a multi-product cart', () => {
  assert.deepEqual(validateCart([{ id: 'zinc', quantity: 2 }, { id: 'soil', quantity: 1 }], products),
    [{ id: 'zinc', quantity: 2 }, { id: 'soil', quantity: 1 }]);
});
test('rejects tampered products and quantities', () => {
  for (const cart of [[], [{ id: 'fake', quantity: 1 }], [{ id: 'zinc', quantity: 0 }],
    [{ id: 'zinc', quantity: 21 }], [{ id: 'zinc', quantity: '2' }],
    [{ id: 'zinc', quantity: 1.5 }], [{ id: 'zinc', quantity: 1 }, { id: 'zinc', quantity: 2 }]]) {
    assert.throws(() => validateCart(cart, products));
  }
});
test('does not accept browser-supplied prices', () => {
  assert.deepEqual(validateCart([{ id: 'crop', quantity: 1, price: 0 }], products),
    [{ id: 'crop', quantity: 1 }]);
});
