import AsyncStorage from '@react-native-async-storage/async-storage';

class AuthService {
  constructor() {
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com/api';
    this.token = null;
    this.user = null;
    this.refreshToken = null;
    this.isInitialized = false;
    this.tokenExpiryTime = null;
    this.refreshInterval = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // Set API URL
      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com';
      this.apiUrl = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
      
      // Try to restore session from storage
      const [authToken, refreshToken, userData] = await AsyncStorage.multiGet([
        'authToken',
        'refreshToken', 
        'userData'
      ]);
      
      if (authToken[1] && userData[1]) {
        this.token = authToken[1];
        this.refreshToken = refreshToken[1] || null;
        this.user = JSON.parse(userData[1]);
        
        console.log('[AuthService] Session restored from storage for user:', this.user?.id);
        console.log('[AuthService] Token available:', !!this.token);
        
        // Start auto-refresh for restored session
        this.startAutoRefresh();
        
        // Check subscription status on initialization
        setTimeout(() => {
          this.checkSubscriptionStatus().catch(e => 
            console.warn('[AuthService] Initial subscription check failed:', e)
          );
        }, 2000);
      } else {
        console.log('[AuthService] No stored session found');
      }

      this.isInitialized = true;
      console.log('[AuthService] initialized with API URL:', this.apiUrl);
    } catch (error) {
      console.error('Initialization error:', error);
      await this.clearSession();
      this.isInitialized = true;
    }
  }

  async testConnection() {
    await this.initialize();

    try {
      const response = await fetch(`${this.apiUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
      
    } catch (error) {
      console.error('Connection failed:', error);
      return {
        success: false,
        error: 'Cannot reach server - make sure backend is running'
      };
    }
  }

  async makeRequest(endpoint, options = {}) {
    await this.initialize();

    // For protected endpoints, ensure we have a token
    const isAuthRequired = !endpoint.includes('/auth/login') && 
                          !endpoint.includes('/auth/register') && 
                          !endpoint.includes('/auth/check-username');
    
    if (isAuthRequired && !this.token) {
      throw new Error('Access token required');
    }

    const url = `${this.apiUrl}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    if (this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, config);
    
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid server response');
    }

    // Try to refresh token if it's expired
    if (!response.ok && response.status === 401 && this.token) {
      const errorMsg = data?.error || data?.message || '';
      // Try to refresh token for expiration errors
      if (errorMsg.toLowerCase().includes('expired') || 
          errorMsg.toLowerCase().includes('invalid') || 
          errorMsg.toLowerCase().includes('malformed') ||
          errorMsg.toLowerCase().includes('token')) {
        
        console.log('[AuthService] Token expired, attempting refresh...');
        const refreshResult = await this.refreshAuthToken();
        
        if (refreshResult.success) {
          console.log('[AuthService] Token refreshed successfully, retrying request');
          // Retry the request with new token
          config.headers.Authorization = `Bearer ${this.token}`;
          const retryResponse = await fetch(url, config);
          
          try {
            const retryData = await retryResponse.json();
            if (retryResponse.ok) {
              return retryData;
            }
            data = retryData;
          } catch {
            throw new Error('Invalid server response on retry');
          }
        } else {
          console.warn('[AuthService] Token refresh failed, clearing session');
          await this.clearSession();
        }
      } else {
        console.warn('[AuthService] 401 error but keeping session (might be endpoint-specific):', errorMsg);
      }
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  }

  // Store session data
  async storeSession(user, token, refreshToken) {
    try {
      this.user = user;
      this.token = token;
      this.refreshToken = refreshToken;
      
      await AsyncStorage.multiSet([
        ['authToken', typeof token === 'string' ? token : JSON.stringify(token)],
        ['refreshToken', typeof refreshToken === 'string' ? (refreshToken || '') : JSON.stringify(refreshToken || '')],
        ['userData', JSON.stringify(user)]
      ]);
      
      console.log('[AuthService] Session stored successfully with auto-refresh');
      
      // Start auto-refresh when session is stored
      this.startAutoRefresh();
      
      // Check subscription status immediately after login
      setTimeout(() => {
        this.checkSubscriptionStatus().catch(e => 
          console.warn('[AuthService] Initial subscription check failed:', e)
        );
      }, 1000);
      
      return { success: true };
    } catch (error) {
      console.error('[AuthService] Error storing session:', error);
      return { success: false, error: error.message };
    }
  }

  async clearSession() {
    try {
      // Clear auto-refresh interval
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
        this.refreshInterval = null;
      }
      
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('refreshToken');
      
      this.token = null;
      this.user = null;
      
      console.log('[AuthService] Session cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing session:', error);
      return false;
    }
  }

  // Authentication methods
  async signUp(email, password, profile) {
    try {
      const result = await this.makeRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, ...profile })
      });
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signIn(email, password) {
    try {
      const result = await this.makeRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (result.success && result.data?.session?.access_token) {
        await this.storeSession(
          result.data.session.access_token,
          result.data.user,
          result.data.profile,
          result.data.session.refresh_token
        );
      }

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async signOut() {
    try {
      if (this.token) {
        try {
          await this.makeRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
          console.log('Server logout failed, continuing with local logout');
        }
      }
      
      await this.clearSession();
      return { success: true, message: 'Logged out successfully' };
    } catch (error) {
      await this.clearSession();
      return { success: false, error: error.message };
    }
  }

  async getCurrentUser() {
    try {
      if (!this.token) {
        return { success: false, error: 'No active session' };
      }
      return await this.makeRequest('/auth/me');
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async checkUsernameAvailability(username) {
    try {
      return await this.makeRequest('/auth/check-username', {
        method: 'POST',
        body: JSON.stringify({ username })
      });
    } catch (error) {
      console.error('[AuthService] Username check error:', error);
      return { success: false, error: error.message };
    }
  }

  // Utility methods
  getStoredUser() { return this.user; }
  isAuthenticated() { return !!this.token && !!this.user; }
  getApiUrl() { return this.apiUrl; }
  // Check if user is authenticated and session is valid
  async checkAuthStatus() {
    await this.initialize();
    
    if (!this.isAuthenticated()) {
      return { authenticated: false, user: null };
    }
    
    // Optionally verify token with server
    try {
      const result = await this.getCurrentUser();
      if (result.success) {
        return { authenticated: true, user: this.user };
      }
    } catch (error) {
      console.warn('[AuthService] Auth check failed:', error.message);
      return { authenticated: !!this.token, user: this.user }; // Return local state
    }
  }

  // Check subscription status for current user
  async checkSubscriptionStatus() {
    try {
      if (!this.user || !this.token) {
        console.log('[AuthService] No user/token, subscription status: false');
        return false;
      }

      const response = await this.makeRequest('/user/status', { method: 'GET' });
      const hasSubscription = response.data?.hasActiveSubscription || false;
      console.log('[AuthService] Subscription status check:', hasSubscription);
      return hasSubscription;
    } catch (error) {
      console.error('[AuthService] Error checking subscription status:', error);
      return false;
    }
  }

  // Verify email with code
  async verifyEmail(email, code) {
    try {
      const response = await fetch(`${this.apiUrl}/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Resend verification code
  async resendVerificationCode(email) {
    try {
      const response = await fetch(`${this.apiUrl}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Auto-refresh token functionality
  startAutoRefresh() {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Refresh token every 50 minutes (before 1-hour expiry)
    this.refreshInterval = setInterval(async () => {
      try {
        console.log('[AuthService] ⏰ Auto-refresh triggered - refreshing token...');
        const result = await this.refreshAuthToken();
        if (result.success) {
          console.log('[AuthService] ✅ Auto-refresh completed successfully');
        } else {
          console.error('[AuthService] ❌ Auto-refresh failed:', result.error);
          await this.clearSession();
        }
      } catch (error) {
        console.error('[AuthService] ❌ Auto-refresh failed with error:', error);
        // If refresh fails, clear session
        await this.clearSession();
      }
    }, 50 * 60 * 1000); // 50 minutes

    console.log('[AuthService] Auto-refresh started');
  }

  // Refresh the current token
  async refreshAuthToken() {
    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.makeRequest('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({
          refresh_token: this.refreshToken
        })
      });

      if (response.success && response.data && response.data.session) {
        // Update tokens from session object
        this.token = response.data.session.access_token;
        this.refreshToken = response.data.session.refresh_token || this.refreshToken;
        
        // Update user if provided
        if (response.data.user) {
          this.user = response.data.user;
        }
        
        // Update storage
        await AsyncStorage.multiSet([
          ['authToken', this.token],
          ['refreshToken', this.refreshToken],
          ['userData', JSON.stringify(this.user)]
        ]);

        console.log('[AuthService] Token refreshed successfully');
        return { success: true };
      } else {
        throw new Error(response.error || 'Token refresh failed');
      }
    } catch (error) {
      console.error('[AuthService] Token refresh error:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new AuthService();