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

// ---- Auth ----
export const getSession = async () => (await supabase.auth.getSession()).data.session;
export const onAuthChange = cb => supabase.auth.onAuthStateChange((_e, s) => cb(s));
export const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password });
export const signUp  = (email, password, display_name) =>
  supabase.auth.signUp({ email, password, options: { data: { display_name } } });
export const signOut = () => supabase.auth.signOut();
export const resetPassword = email =>
  supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
export const updatePassword = password => supabase.auth.updateUser({ password });

export async function getProfile() {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', (await getSession())?.user?.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function findProfileByEmail(email) {
  const { data, error } = await supabase.from('profiles').select('id, email, display_name').ilike('email', email.trim()).maybeSingle();
  if (error) throw error;
  return data;
}

// ---- Inventories ----
// RLS limits this to inventories the user owns, is a member of, or (admin) all.
export async function listInventories() {
  const { data, error } = await supabase
    .from('inventories')
    .select('*, owner_profile:profiles!inventories_owner_id_fkey(id, email, display_name)')
    .eq('is_archived', false)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function createInventory({ name, owner, notes }) {
  const session = await getSession();
  const { data, error } = await supabase
    .from('inventories')
    .insert({ name: name.trim(), owner: owner?.trim() || null, notes: notes?.trim() || null, owner_id: session.user.id })
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

export async function deleteInventory(id) {
  // items cascade-restrict: must be empty (or admin moves them first)
  const { error } = await supabase.from('inventories').delete().eq('id', id);
  if (error) throw error;
}

// ---- Sharing ----
export async function listMembers(inventoryId) {
  const { data, error } = await supabase
    .from('inventory_members')
    .select('user_id, role, added_at, profile:profiles(id, email, display_name)')
    .eq('inventory_id', inventoryId);
  if (error) throw error;
  return data;
}

export async function addMemberByEmail(inventoryId, email, role = 'editor') {
  const p = await findProfileByEmail(email);
  if (!p) throw new Error(`No user with email ${email} — they need to sign up first.`);
  const { error } = await supabase.from('inventory_members').upsert({ inventory_id: inventoryId, user_id: p.id, role });
  if (error) throw error;
  return p;
}

export async function removeMember(inventoryId, userId) {
  const { error } = await supabase.from('inventory_members').delete().match({ inventory_id: inventoryId, user_id: userId });
  if (error) throw error;
}

// ---- Admin ----
export async function adminOverview() {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
  if (error) throw error;
  return data;
}

export async function setAdmin(userId, isAdmin) {
  const { error } = await supabase.from('profiles').update({ is_admin: isAdmin }).eq('id', userId);
  if (error) throw error;
}

export async function reassignInventory(inventoryId, newOwnerId) {
  const { error } = await supabase.from('inventories').update({ owner_id: newOwnerId }).eq('id', inventoryId);
  if (error) throw error;
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
