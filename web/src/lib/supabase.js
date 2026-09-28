import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

export const BUCKET = 'item-photos';

export function photoUrl(path) {
  if (!supabase || !path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---- Inventories ----
export async function listInventories() {
  const { data, error } = await supabase
    .from('inventories')
    .select('*')
    .eq('is_archived', false)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function createInventory({ name, owner, notes }) {
  const { data, error } = await supabase
    .from('inventories')
    .insert({ name: name.trim(), owner: owner?.trim() || null, notes: notes?.trim() || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateInventory(id, fields) {
  const { data, error } = await supabase.from('inventories').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ---- Items ----
export async function listItems({ inventoryId, category, status, search } = {}) {
  let q = supabase
    .from('items')
    .select('*, item_photos(id, storage_path, is_primary)')
    .order('created_at', { ascending: false });
  if (inventoryId) q = q.eq('inventory_id', inventoryId);
  if (category) q = q.eq('category', category);
  if (status) q = q.eq('status', status);
  if (search) q = q.or(`title.ilike.%${search}%,brand.ilike.%${search}%,model.ilike.%${search}%,location.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getItem(id) {
  const { data, error } = await supabase
    .from('items')
    .select('*, item_photos(id, storage_path, is_primary, created_at)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function insertItem(fields) {
  const { data, error } = await supabase.from('items').insert(fields).select().single();
  if (error) throw error;
  return data;
}

export async function updateItem(id, fields) {
  const { data, error } = await supabase.from('items').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id) {
  // photos cascade in DB; remove storage objects too
  const { data: photos } = await supabase.from('item_photos').select('storage_path').eq('item_id', id);
  if (photos?.length) await supabase.storage.from(BUCKET).remove(photos.map(p => p.storage_path));
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

// ---- Photos ----
export async function uploadPhoto(itemId, blob, { isPrimary = false } = {}) {
  const path = `${itemId}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('item_photos')
    .insert({ item_id: itemId, storage_path: path, is_primary: isPrimary })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function counts(inventoryId) {
  let q = supabase.from('items').select('status, value_suggested, sold_price');
  if (inventoryId) q = q.eq('inventory_id', inventoryId);
  const { data, error } = await q;
  if (error) throw error;
  const c = { total: data.length, byStatus: {}, valueSum: 0, soldSum: 0 };
  for (const r of data) {
    c.byStatus[r.status] = (c.byStatus[r.status] || 0) + 1;
    c.valueSum += Number(r.value_suggested || 0);
    c.soldSum += Number(r.sold_price || 0);
  }
  return c;
}
