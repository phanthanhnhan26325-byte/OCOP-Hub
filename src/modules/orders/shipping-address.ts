export interface ShippingAddress {
  receiver_name?: string;
  phone?: string;
  address?: string;
  ward?: string;
  district?: string;
  city?: string;
  note?: string;
}

export function mergeShippingAddress(child: unknown, parent: unknown): ShippingAddress {
  const result: ShippingAddress = {};
  const local = child && typeof child === 'object' && !Array.isArray(child) ? child as Record<string, unknown> : {};
  const inherited = parent && typeof parent === 'object' && !Array.isArray(parent) ? parent as Record<string, unknown> : {};
  for (const key of ['receiver_name', 'phone', 'address', 'ward', 'district', 'city', 'note'] as const) {
    const own = typeof local[key] === 'string' ? local[key].trim() : '';
    const fallback = typeof inherited[key] === 'string' ? inherited[key].trim() : '';
    if (own || fallback) result[key] = own || fallback;
  }
  return result;
}
