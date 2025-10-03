import AuthService from './authService';
import { supabase } from './supabaseClient';

const userStatusService = {
  async getStatus() {
    // Primary: use backend-auth token via AuthService
    try {
      const res = await AuthService.makeRequest('/user/status', { method: 'GET' });
      return res?.data || { hasActiveSubscription: false };
    } catch (e) {
      // Fallback: if unauthorized or no token, try Supabase session token directly
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (!accessToken) throw e;

        const apiUrl = AuthService.getApiUrl?.() || process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com/api';
        const resp = await fetch(`${apiUrl}/user/status`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) throw e;
        const data = await resp.json();
        return data?.data || { hasActiveSubscription: false };
      } catch (_) {
        return { hasActiveSubscription: false };
      }
    }
  }
};

export default userStatusService;
