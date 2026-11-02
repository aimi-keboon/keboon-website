export const PRODUCT_IDS = Object.freeze(['zinc', 'amino', 'chito', 'soil', 'crop']);

/** Treat all cart data from the browser as untrusted. */
export function validateCart(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > PRODUCT_IDS.length) {
    throw new Error('Cart must contain between 1 and 5 different products.');
  }

  const seen = new Set();
  return input.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.id !== 'string' || !PRODUCT_IDS.includes(item.id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 ||
        seen.has(item.id)) {
      throw new Error('Cart contains an invalid product or quantity.');
    }
    seen.add(item.id);
    return { id: item.id, quantity: item.quantity };
  });
}
