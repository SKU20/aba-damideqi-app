// src/services/profileService.js
import { supabase } from './supabaseClient'

async function upsertUserProfile({
  id,
  city = null,
  country = null,
  region = null,
  location_updated_at = null,
  // Presence-related optional fields
  is_online = undefined,
  last_seen_at = undefined,
  online_threshold_seconds = undefined,
}) {
  if (!id) throw new Error('id is required')
  const payload = {
    id,
    city,
    country,
    region,
    location_updated_at: location_updated_at || new Date().toISOString(),
  }
  // Only set presence fields if provided
  if (typeof is_online === 'boolean') payload.is_online = is_online
  if (typeof last_seen_at === 'string') payload.last_seen_at = last_seen_at
  if (typeof online_threshold_seconds === 'number') payload.online_threshold_seconds = online_threshold_seconds
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
  if (error) throw error
  return data
}

async function getUserProfileLocation(userId) {
  if (!userId) throw new Error('userId is required')
  const { data, error } = await supabase
    .from('user_profiles')
    .select('city,country,region')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function updateAllUserCarsLocation(userId, { city = null, country = null, region = null }) {
  if (!userId) throw new Error('userId is required')
  const { data, error } = await supabase
    .from('user_cars')
    .update({
      city,
      country,
      region,
      location_timestamp: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (error) throw error
  return data
}

async function fetchUserProfilesByIds(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return []
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, city, country, region')
    .in('id', userIds)
  if (error) throw error
  return data || []
}

export {
  upsertUserProfile,
  getUserProfileLocation,
  updateAllUserCarsLocation,
  fetchUserProfilesByIds,
};

export default {
  upsertUserProfile,
  getUserProfileLocation,
  updateAllUserCarsLocation,
  fetchUserProfilesByIds,
};