import authService from './authService';
import subscriptionService from './subscriptionService';

class SubscriptionStatusManager {
  constructor() {
    this.currentStatus = false;
    this.isChecking = false;
    this.lastChecked = null;
    this.listeners = new Set();
    this.checkInterval = null;
    this.cacheTimeout = 30 * 1000; // Cache for 30 seconds for fast startup
  }

  // Add listener for subscription status changes
  addListener(callback) {
    console.log('[SubscriptionStatusManager] Adding listener, current count:', this.listeners.size);
    console.log('[SubscriptionStatusManager] Current status before adding:', this.currentStatus);
    this.listeners.add(callback);
    console.log('[SubscriptionStatusManager] Listener added, new count:', this.listeners.size);
    
    // Immediately call with current status
    console.log('[SubscriptionStatusManager] Immediately calling new listener with status:', this.currentStatus);
    try {
      callback(this.currentStatus);
    } catch (error) {
      console.error('[SubscriptionStatusManager] Error calling new listener:', error);
    }
    
    return () => {
      console.log('[SubscriptionStatusManager] Removing listener, current count:', this.listeners.size);
      this.listeners.delete(callback);
      console.log('[SubscriptionStatusManager] Listener removed, new count:', this.listeners.size);
    };
  }

  // Notify all listeners of status change
  notifyListeners(status) {
    console.log('[SubscriptionStatusManager] Notifying', this.listeners.size, 'listeners of status change:', status);
    this.currentStatus = status;
    this.listeners.forEach(callback => {
      try {
        console.log('[SubscriptionStatusManager] Calling listener with status:', status);
        callback(status);
      } catch (error) {
        console.error('[SubscriptionStatusManager] Listener error:', error);
      }
    });
  }

  // Check subscription status and notify listeners
  async checkStatus(force = false) {
    // Prevent multiple simultaneous checks
    if (this.isChecking && !force) {
      console.log('[SubscriptionStatusManager] Check already in progress, skipping...');
      return this.currentStatus;
    }

    // Fast cache for startup - shorter timeout for immediate response
    const now = Date.now();
    const cacheAge = this.lastChecked ? (now - this.lastChecked) : Infinity;
    
    if (!force && this.lastChecked && cacheAge < this.cacheTimeout) {
      console.log('[SubscriptionStatusManager] ⚡ Using fast cache, age:', Math.round(cacheAge/1000) + 's, status:', this.currentStatus);
      return this.currentStatus;
    }

    this.isChecking = true;
    this.lastChecked = now;

    try {
      console.log('[SubscriptionStatusManager] 🔄 Checking subscription status...');
      console.log('[SubscriptionStatusManager] Current status before check:', this.currentStatus);
      
      const status = await subscriptionService.hasActiveSubscription();
      console.log('[SubscriptionStatusManager] ✅ Subscription service returned:', status);
      console.log('[SubscriptionStatusManager] Status comparison - old:', this.currentStatus, 'new:', status);
      
      // Only notify if status changed
      if (status !== this.currentStatus) {
        console.log('[SubscriptionStatusManager] Status changed! Notifying listeners...');
        this.notifyListeners(status);
      } else {
        console.log('[SubscriptionStatusManager] Status unchanged, updating current status silently');
        // Update current status even if unchanged
        this.currentStatus = status;
      }
      
      return status;
    } catch (error) {
      console.error('[SubscriptionStatusManager] ❌ Error checking subscription status:', error);
      // Don't change status on error, keep current value
      return this.currentStatus;
    } finally {
      this.isChecking = false;
    }
  }

  // Start periodic checking
  startPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Check every 2 minutes
    this.checkInterval = setInterval(() => {
      this.checkStatus().catch(error => 
        console.warn('[SubscriptionStatusManager] Periodic check failed:', error)
      );
    }, 2 * 60 * 1000);

    console.log('[SubscriptionStatusManager] Started periodic checking');
  }

  // Stop periodic checking
  stopPeriodicCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[SubscriptionStatusManager] Stopped periodic checking');
    }
  }

  // Force refresh subscription status
  async refresh() {
    return await this.checkStatus(true);
  }

  // Get current status without checking
  getCurrentStatus() {
    return this.currentStatus;
  }

  // Initialize the manager
  async initialize(userId) {
    console.log('[SubscriptionStatusManager] ⚡ Fast initializing for user:', userId);
    
    // Start periodic checking every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkStatus();
    }, 5 * 60 * 1000);
    
    // Immediately check status for fast startup
    const initialStatus = await this.checkStatus(true);
    console.log('[SubscriptionStatusManager] ✅ Fast initialization complete, initial status:', initialStatus);
    
    return initialStatus;
  }

  // Cleanup
  destroy() {
    this.stopPeriodicCheck();
    this.listeners.clear();
  }
}

export default new SubscriptionStatusManager();
