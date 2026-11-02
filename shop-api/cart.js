/** Only product IDs and quantities are accepted from browsers. */
export function validateCart(input, products) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 50) {
    throw new Error('Cart must contain between 1 and 50 different products.');
  }
  const seen = new Set();
  return input.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.id !== 'string' || !products.has(item.id) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 ||
        seen.has(item.id)) {
      throw new Error('Cart contains an invalid product or quantity.');
    }
    seen.add(item.id);
    return { id: item.id, quantity: item.quantity };
  });
}
