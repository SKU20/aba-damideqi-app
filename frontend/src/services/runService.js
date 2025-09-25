// frontend/src/services/runService.js
import { supabase } from './supabaseClient';

// Normalize UI-selected range into queryable fields stored in video_runs
// Returns { speed_unit, range_start, range_end, label }
export function normalizeRange(vehicleType, uiRange) {
  const vt = (vehicleType || 'car').toLowerCase();
  const r = (uiRange || '').toLowerCase();

  if (vt === 'car') {
    if (r === '0-100') return { speed_unit: 'kmh', range_start: 0, range_end: 100, label: '0-100' };
    if (r === '100-200') return { speed_unit: 'kmh', range_start: 100, range_end: 200, label: '100-200' };
    if (r === '0-200') return { speed_unit: 'kmh', range_start: 0, range_end: 200, label: '0-200' };
    // default fallback
    return { speed_unit: 'kmh', range_start: 0, range_end: 100, label: '0-100' };
  }

  // motorcycle (mph)
  if (r === '0-60mph' || r === '0-100') return { speed_unit: 'mph', range_start: 0, range_end: 60, label: '0-60mph' };
  if (r === '60-124mph' || r === '100-200' || r === '60-124') return { speed_unit: 'mph', range_start: 60, range_end: 124, label: '60-124mph' };
  if (r === '0-124mph' || r === '0-200') return { speed_unit: 'mph', range_start: 0, range_end: 124, label: '0-124mph' };
  return { speed_unit: 'mph', range_start: 0, range_end: 60, label: '0-60mph' };
}

// Fetch current user runs filtered by vehicle type and range
export async function getMyRuns({ vehicleType = 'car', range = '0-100', limit = 50 } = {}) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { speed_unit, range_start, range_end } = normalizeRange(vehicleType, range);

  const { data, error } = await supabase
    .from('video_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('vehicle_type', vehicleType)
    .eq('speed_unit', speed_unit)
    .eq('range_start', range_start)
    .eq('range_end', range_end)
    .order('best_elapsed_ms', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Fetch the single best run for the filter
export async function getMyBestRun({ vehicleType = 'car', range = '0-100' } = {}) {
  const runs = await getMyRuns({ vehicleType, range, limit: 1 });
  return runs?.[0] || null;
}

// Global leaderboard runs (no user_id filter)
export async function getLeaderboardRuns({ vehicleType = 'car', range = '0-100', limit = 50 } = {}) {
  const { speed_unit, range_start, range_end } = normalizeRange(vehicleType, range);

  const { data, error } = await supabase
    .from('video_runs')
    .select('*')
    .eq('vehicle_type', vehicleType)
    .eq('speed_unit', speed_unit)
    .eq('range_start', range_start)
    .eq('range_end', range_end)
    .order('best_elapsed_ms', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getLeaderboardBest({ vehicleType = 'car', range = '0-100' } = {}) {
  const runs = await getLeaderboardRuns({ vehicleType, range, limit: 1 });
  return runs?.[0] || null;
}

// Fetch runs for any user (not only current user)
export async function getUserRuns({ userId, vehicleType = 'car', range = '0-100', limit = 50 } = {}) {
  if (!userId) throw new Error('userId is required');
  const { speed_unit, range_start, range_end } = normalizeRange(vehicleType, range);

  const { data, error } = await supabase
    .from('video_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('vehicle_type', vehicleType)
    .eq('speed_unit', speed_unit)
    .eq('range_start', range_start)
    .eq('range_end', range_end)
    .order('best_elapsed_ms', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getUserBestRun({ userId, vehicleType = 'car', range = '0-100' } = {}) {
  const runs = await getUserRuns({ userId, vehicleType, range, limit: 1 });
  return runs?.[0] || null;
}

// Compute a user's leaderboard rank by counting how many runs are faster (lower ms)
export async function getUserLeaderboardRank({ userId, vehicleType = 'car', range = '0-100' } = {}) {
  if (!userId) throw new Error('userId is required');
  const best = await getUserBestRun({ userId, vehicleType, range });
  if (!best || best.best_elapsed_ms == null) return null; // user not on leaderboard

  const { speed_unit, range_start, range_end } = normalizeRange(vehicleType, range);

  // Count how many runs have a strictly lower (better) elapsed time
  const { count, error } = await supabase
    .from('video_runs')
    .select('*', { count: 'exact', head: true })
    .eq('vehicle_type', vehicleType)
    .eq('speed_unit', speed_unit)
    .eq('range_start', range_start)
    .eq('range_end', range_end)
    .lt('best_elapsed_ms', best.best_elapsed_ms);

  if (error) throw error;
  // rank is count of better runs + 1
  return (count ?? 0) + 1;
}
// Get a signed URL for a stored video
export async function getSignedVideoUrl(bucket = 'dragy-uploads', path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

export default {
  normalizeRange,
  getMyRuns,
  getMyBestRun,
  getLeaderboardRuns,
  getLeaderboardBest,
  getUserRuns,
  getUserBestRun,
  getUserLeaderboardRank,
  getSignedVideoUrl,
};
