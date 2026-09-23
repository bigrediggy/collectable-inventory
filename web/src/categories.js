export const CATEGORIES = [
  { id: 'musical_instrument', label: 'Musical instrument', icon: '🎸' },
  { id: 'vintage_toy',        label: 'Vintage toy',        icon: '🧸' },
  { id: 'model_airplane',     label: 'Model airplane',     icon: '✈️' },
  { id: 'lp_record',          label: 'LP / vinyl',         icon: '💿' },
  { id: 'comic',              label: 'Comic',              icon: '📚' },
  { id: 'coin',               label: 'Coin / currency',    icon: '🪙' },
  { id: 'electronics',        label: 'Electronics',        icon: '📻' },
  { id: 'furniture',          label: 'Furniture',          icon: '🪑' },
  { id: 'knick_knack',        label: 'Knick-knack',        icon: '🏺' },
  { id: 'other',              label: 'Other',              icon: '📦' },
];

export const STATUSES = [
  { id: 'inventoried', label: 'Inventoried' },
  { id: 'valued',      label: 'Valued' },
  { id: 'listed',      label: 'Listed' },
  { id: 'sold',        label: 'Sold' },
  { id: 'donated',     label: 'Donated' },
  { id: 'kept',        label: 'Kept' },
  { id: 'trashed',     label: 'Trashed' },
];

export const CONDITIONS = ['Mint', 'Excellent', 'Good', 'Fair', 'Poor', 'Unknown'];

export const MARKETPLACES = ['ebay', 'facebook', 'craigslist', 'reverb', 'discogs', 'estate_sale', 'other'];

export const catLabel = id => CATEGORIES.find(c => c.id === id)?.label || id;
export const catIcon  = id => CATEGORIES.find(c => c.id === id)?.icon || '📦';
