import { useState, useEffect, useCallback } from 'react';
import * as chatService from '../services/chatService';

// Custom hook to manage unread message counts
export function useUnreadCount() {
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const total = await chatService.getTotalUnreadCount();
      setTotalUnread(total);
    } catch (e) {
      console.warn('[useUnreadCount] Error fetching unread count:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  // Subscribe to real-time updates
  useEffect(() => {
    const subscription = chatService.subscribeToConversationUpdates((payload) => {
      // Refresh count when there are conversation updates
      refreshUnreadCount();
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [refreshUnreadCount]);

  const markAsRead = useCallback((conversationId, unreadCount = 1) => {
    setTotalUnread(prev => Math.max(0, prev - unreadCount));
  }, []);

  const addUnread = useCallback((count = 1) => {
    setTotalUnread(prev => prev + count);
  }, []);

  return {
    totalUnread,
    loading,
    refreshUnreadCount,
    markAsRead,
    addUnread
  };
}

// Context for sharing unread count across components
import React, { createContext, useContext } from 'react';

const UnreadCountContext = createContext();

export function UnreadCountProvider({ children }) {
  const unreadCount = useUnreadCount();
  
  return (
    <UnreadCountContext.Provider value={unreadCount}>
      {children}
    </UnreadCountContext.Provider>
  );
}

export function useUnreadCountContext() {
  const context = useContext(UnreadCountContext);
  if (!context) {
    throw new Error('useUnreadCountContext must be used within UnreadCountProvider');
  }
  return context;
}