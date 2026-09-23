// Shared category definitions. Keep in sync with supabase/schema.sql enum
// and web/src/categories.js.

export const CATEGORIES = [
  { id: 'musical_instrument', label: 'Musical instrument', ebayCategoryId: '619' },
  { id: 'vintage_toy',        label: 'Vintage toy',        ebayCategoryId: '220' },
  { id: 'model_airplane',     label: 'Model airplane',     ebayCategoryId: '2580' },
  { id: 'lp_record',          label: 'LP / vinyl record',  ebayCategoryId: '176985' },
  { id: 'comic',              label: 'Comic book',         ebayCategoryId: '63' },
  { id: 'coin',               label: 'Coin / currency',    ebayCategoryId: '11116' },
  { id: 'electronics',        label: 'Electronics',       ebayCategoryId: '293' },
  { id: 'furniture',          label: 'Furniture',         ebayCategoryId: '3197' },
  { id: 'knick_knack',        label: 'Knick-knack / decor', ebayCategoryId: '1' },
  { id: 'other',              label: 'Other',              ebayCategoryId: null },
];

export const CATEGORY_IDS = CATEGORIES.map(c => c.id);

export function ebayCategoryFor(id) {
  return CATEGORIES.find(c => c.id === id)?.ebayCategoryId || null;
}
