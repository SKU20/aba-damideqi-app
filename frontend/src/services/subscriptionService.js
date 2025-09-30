// SubscriptionService - Simple direct connection
import AsyncStorage from '@react-native-async-storage/async-storage';

class SubscriptionService {
  constructor() {
    this.apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://aba-damideqi-app.onrender.com/api';
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.apiUrl}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Invalid server response');
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
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

  async getUserSubscription(userId) {
    try {
      const result = await this.makeRequest(`/subscriptions/${userId}`);

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