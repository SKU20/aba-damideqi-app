import AuthService from './authService';
import { supabase } from './supabaseClient';

async function authHeaders() {
  try {
    // If AuthService already has token, let it handle headers
    if (AuthService.isAuthenticated && AuthService.isAuthenticated()) return {};
    // Fallback to supabase session token
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) return { Authorization: `Bearer ${token}` };
  } catch (_) {}
  return {};
}

const adminService = {
  async searchUsers(query) {
    const q = query || '';
    const res = await AuthService.makeRequest(`/admin/users/search?query=${encodeURIComponent(q)}`, { method: 'GET', headers: await authHeaders() });
    return res?.data || [];
  },

  async getUserDetails(userId) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/details`, { method: 'GET', headers: await authHeaders() });
    return res?.data || { profile: null, cars: [], runs: [], referral: { balance: 0, referrals: [], referral_code: null } };
  },

  async updateUserProfile(userId, payload = {}) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/profile`, {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    return res;
  },

  async listWithdrawals(status = 'requested') {
    const res = await AuthService.makeRequest(`/admin/referrals/withdrawals?status=${encodeURIComponent(status)}`, { method: 'GET', headers: await authHeaders() });
    return res?.data || [];
  },

  async approveWithdrawal(id) {
    const res = await AuthService.makeRequest(`/admin/referrals/withdrawals/${encodeURIComponent(id)}/approve`, { method: 'POST', headers: await authHeaders() });
    return res;
  },

  async rejectWithdrawal(id, reason = '') {
    const res = await AuthService.makeRequest(`/admin/referrals/withdrawals/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ reason }),
    });
    return res;
  },

  async createCar(userId, payload) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/cars`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload || {}),
    });
    return res;
  },

  async updateCar(userId, carId, payload) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/cars/${encodeURIComponent(carId)}`, {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify(payload || {}),
    });
    return res;
  },

  async deleteCar(userId, carId) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/cars/${encodeURIComponent(carId)}`, { method: 'DELETE', headers: await authHeaders() });
    return res;
  },

  async updateRun(userId, runId, payload) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/runs/${encodeURIComponent(runId)}`, {
      method: 'PUT',
      headers: await authHeaders(),
      body: JSON.stringify(payload || {}),
    });
    return res;
  },

  async deleteRun(userId, runId) {
    const res = await AuthService.makeRequest(`/admin/users/${encodeURIComponent(userId)}/runs/${encodeURIComponent(runId)}`, { method: 'DELETE', headers: await authHeaders() });
    return res;
  },
};

export default adminService;
