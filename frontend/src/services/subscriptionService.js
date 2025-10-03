// SubscriptionService - Simple direct connection
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from './authService';

class SubscriptionService {
  constructor() {
    this.apiUrl = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized && this.apiUrl) return;
    // Use the same URL logic as other services for consistency
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com';
    this.apiUrl = baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
    this.isInitialized = true;
    console.log('[SubscriptionService] Initialized with API URL:', this.apiUrl);
  }

  async makeRequest(endpoint, options = {}) {
    await this.initialize();
    await authService.initialize();
    
    // Ensure AuthService has a valid token
    if (!authService.token) {
      console.warn('[SubscriptionService] No token available, user may need to log in');
      throw new Error('Access token required - please log in');
    }
    
    // Use AuthService's makeRequest method which handles token refresh automatically
    console.log('[SubscriptionService] Making request to:', endpoint, 'with auth:', !!authService.token);
    return await authService.makeRequest(endpoint, options);
  }

  // Subscription methods
  async fetchPlans() {
    try {
      const result = await this.makeRequest('/plans');
      
      return {
        success: true,
        plans: result.plans || [],
      };
    } catch (error) {
      console.error('Error fetching plans:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch plans',
        plans: []
      };
    }
  }

  async createSubscription(userId, planId, options = {}) {
    try {
      const result = await this.makeRequest('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          plan_id: planId,
          apply_referral_discount: options.applyReferralDiscount === true
        }),
      });

      return {
        success: true,
        subscription: result.subscription,
        message: result.message
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      return {
        success: false,
        error: error.message || 'Network error occurred'
      };
    }
  }

  async getUserSubscription() {
    try {
      const result = await this.makeRequest('/subscriptions/me');

      console.log('[SubscriptionService] User subscription:', result.subscription);
      return {
        success: true,
        subscription: result.subscription
      };
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch subscription',
        subscription: null
      };
    }
  }

  // Check if user has active subscription (simpler method)
  async hasActiveSubscription() {
    try {
      console.log('[SubscriptionService] 🔄 Checking subscription status...');
      const result = await this.makeRequest('/user/status');
      console.log('[SubscriptionService] Raw API response:', result);
      console.log('[SubscriptionService] result.data:', result.data);
      console.log('[SubscriptionService] result.data.hasActiveSubscription:', result.data?.hasActiveSubscription);
      
      // Display detailed subscription data from backend (same as backend logs)
      if (result.data?.subscription) {
        console.log('[SubscriptionService] Detailed subscription from backend:', {
          data: result.data.subscription,
          error: null
        });
      } else {
        console.log('[SubscriptionService] No subscription details returned from backend');
      }
      
      const hasActive = result.data?.hasActiveSubscription || false;
      console.log('[SubscriptionService] ✅ Final return value:', hasActive);
      
      return hasActive;
    } catch (error) {
      console.error('[SubscriptionService] ❌ Error checking subscription status:', error);
      return false;
    }
  }

  async cancelSubscription(subscriptionId, cancelReason = '') {
    try {
      const result = await this.makeRequest(`/subscriptions/${subscriptionId}/cancel`, {
        method: 'PUT',
        body: JSON.stringify({
          cancel_reason: cancelReason
        }),
      });

      return {
        success: true,
        subscription: result.subscription,
        message: result.message
      };
    } catch (error) {
      console.error('Error canceling subscription:', error);
      return {
        success: false,
        error: error.message || 'Network error occurred'
      };
    }
  }

  // Utility method
  getApiUrl() { 
    return this.apiUrl; 
  }
}

export default new SubscriptionService();