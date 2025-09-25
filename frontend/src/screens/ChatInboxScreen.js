import React, { useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, SafeAreaView, Platform, StatusBar, Dimensions} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import * as chatService from '../services/chatService';

const { width } = Dimensions.get('window');

export default function ChatInboxScreen({ navigation, goBack, goToThread }) {
  const queryClient = useQueryClient();

  // QUERIES - Replace most useEffects with queries

  // Get current user ID
  const { data: myId } = useQuery({
    queryKey: ['currentUserId'],
    queryFn: () => chatService.getMyUserId(),
    staleTime: Infinity, // User ID doesn't change during session
    retry: 1,
  });

  // Get conversations list
  const { 
    data: conversationsData = [], 
    isLoading: loading, 
    refetch: refetchConversations,
    error: conversationsError 
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const list = await chatService.listConversations();
      return (list || []).sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      });
    },
    refetchInterval: false, // Disable polling, rely on real-time updates
    // Always treat as stale on mount so navigating to Inbox fetches latest server state
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    retry: (failureCount, error) => {
      console.warn('Conversations query error:', error?.message);
      return failureCount < 2;
    },
  });

  // Also refetch on navigation focus to guarantee up-to-date data when opening the inbox
  React.useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => {
      try { refetchConversations(); } catch (_) {}
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, [navigation, refetchConversations]);

  // Get user profiles for last seen data
  const userIds = useMemo(() => 
    conversationsData.map(conv => conv.otherUser?.id).filter(Boolean), 
    [conversationsData]
  );

  const { data: userProfiles = {} } = useQuery({
    queryKey: ['userProfiles', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      return await chatService.getUsersPresence(userIds);
    },
    enabled: userIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Get online presence data
  const { data: onlineUsers = new Set() } = useQuery({
    queryKey: ['onlinePresence'],
    queryFn: () => chatService.getOnlinePresenceSet(),
    enabled: !!myId,
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 25000,
  });

  // Current timestamp for last seen calculations
  const { data: nowTs = Date.now() } = useQuery({
    queryKey: ['currentTimestamp'],
    queryFn: () => Date.now(),
    refetchInterval: 30000, // Update every 30 seconds
    staleTime: 25000,
  });

  // DERIVED DATA
  const totalUnread = useMemo(() => 
    conversationsData.reduce((sum, conv) => sum + (conv.unread_count || 0), 0),
    [conversationsData]
  );

  // MUTATIONS - Replace direct state updates

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId) => chatService.deleteConversation(conversationId),
    onMutate: async (conversationId) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previousConversations = queryClient.getQueryData(['conversations']);
      
      queryClient.setQueryData(['conversations'], (old = []) =>
        old.filter(c => c.id !== conversationId)
      );
      
      return { previousConversations };
    },
    onError: (err, conversationId, context) => {
      // Rollback on error
      queryClient.setQueryData(['conversations'], context.previousConversations);
      console.warn('Delete conversation error:', err?.message || err);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: ({ conversationId, unreadCount }) => 
      chatService.markMessagesAsRead(conversationId),
    onMutate: async ({ conversationId }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previousConversations = queryClient.getQueryData(['conversations']);
      
      queryClient.setQueryData(['conversations'], (old = []) =>
        old.map(c => c.id === conversationId ? { ...c, unread_count: 0 } : c)
      );
      
      return { previousConversations };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['conversations'], context.previousConversations);
      console.warn('Mark as read error:', err?.message || err);
    },
  });

  // REAL-TIME SUBSCRIPTIONS - Only one useEffect for subscriptions
  React.useEffect(() => {
    if (!myId) return;

    // Presence subscription via service
    const presenceCh = chatService.subscribeToPresenceUsers(myId, (onlineSet) => {
      queryClient.setQueryData(['onlinePresence'], onlineSet);
    });

    // Inbox realtime subscription via service
    const inboxCh = chatService.subscribeToInboxLive({
      onMessageInsert: (row) => {
        if (!row?.conversation_id) return;
        queryClient.setQueryData(['conversations'], (prev = []) => {
          const idx = prev.findIndex(c => c.id === row.conversation_id);
          if (idx === -1) return prev;
          const copy = [...prev];
          const conv = { ...copy[idx] };
          conv.last_message_at = row.created_at || new Date().toISOString();
          conv.last_message_text = row.content || conv.last_message_text;
          conv.unread_count = (conv.unread_count || 0) + 1;
          copy.splice(idx, 1);
          copy.unshift(conv);
          return copy;
        });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }, 500);
      },
      onMessageUpdate: () => {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      },
      onConversationUpdate: (row) => {
        if (!row?.id) return;
        queryClient.setQueryData(['conversations'], (prev = []) => {
          const idx = prev.findIndex(c => c.id === row.id);
          if (idx === -1) return prev;
          const copy = [...prev];
          const conv = { ...copy[idx] };
          if (row.last_message_at) conv.last_message_at = row.last_message_at;
          if (row.last_message_text) conv.last_message_text = row.last_message_text;
          copy[idx] = conv;
          copy.sort((a, b) => {
            const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return tb - ta;
          });
          return copy;
        });
      },
      onUserProfileUpdate: (row) => {
        if (!row?.id) return;
        queryClient.setQueryData(['userProfiles', userIds], (prev = {}) => ({
          ...prev,
          [row.id]: {
            last_seen_at: row.last_seen_at,
            threshold: row.online_threshold_seconds || 45,
          },
        }));
      },
    });

    return () => {
      try {
        presenceCh?.unsubscribe?.();
        inboxCh?.unsubscribe?.();
      } catch (e) {
        console.warn('Error unsubscribing:', e.message);
      }
    };
  }, [myId, queryClient, userIds]);

  // HELPER FUNCTIONS
  const isUserOnline = useCallback((userId) => {
    const userData = userProfiles[userId];
    if (userData?.is_online) return true;
  
    // fallback to last_seen threshold if is_online is false/undefined
    if (!userData?.last_seen_at) return false;
    const last = new Date(userData.last_seen_at).getTime();
    const thresholdMs = (userData.threshold || 45) * 1000;
    return (nowTs - last) < thresholdMs;
  }, [userProfiles, nowTs]);

  const formatTimestamp = useCallback((timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins < 1 ? 'now' : `${diffMins}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else if (diffDays < 7) {
      return `${diffDays}d`;
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }, []);

  // HANDLERS
  const handleRefresh = useCallback(() => {
    refetchConversations();
    queryClient.invalidateQueries({ queryKey: ['userProfiles'] });
    queryClient.invalidateQueries({ queryKey: ['onlinePresence'] });
  }, [refetchConversations, queryClient]);

  const handleDeleteConversation = useCallback((conversationId) => {
    deleteConversationMutation.mutate(conversationId);
  }, [deleteConversationMutation]);

  const handleThreadPress = useCallback(async (item) => {
    // Mark as read when opening thread
    if (item.unread_count > 0) {
      markAsReadMutation.mutate({ 
        conversationId: item.id, 
        unreadCount: item.unread_count 
      });
    }
    
    if (goToThread) {
      goToThread(item);
    }
  }, [markAsReadMutation, goToThread]);

  // RENDER FUNCTIONS
  const renderRightActions = useCallback((conv) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteConversation(conv.id)}
    >
      <Ionicons name="trash" size={18} color="#fff" />
      <Text style={styles.deleteText}>Delete</Text>
    </TouchableOpacity>
  ), [handleDeleteConversation]);

  const renderItem = useCallback(({ item }) => {
    const hasUnread = (item.unread_count || 0) > 0;
    const userId = item.otherUser?.id;
    const online = userId ? isUserOnline(userId) : false;
    
    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        <TouchableOpacity 
          style={[styles.row, hasUnread && styles.rowUnread]} 
          onPress={() => handleThreadPress(item)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarTxt}>@</Text>
            {hasUnread && <View style={styles.unreadDot} />}
            <View style={[
              styles.onlineStatusDot, 
              { backgroundColor: online ? '#27AE60' : '#E74C3C' }
            ]} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.headerRow}>
              <Text 
                style={[styles.username, hasUnread && styles.usernameUnread]} 
                numberOfLines={1}
              >
                @{item.otherUser?.username || 'user'}
              </Text>
              {item.last_message_at && (
                <Text style={[styles.timestamp, hasUnread && styles.timestampUnread]}>
                  {formatTimestamp(item.last_message_at)}
                </Text>
              )}
            </View>
            <View style={styles.messageRow}>
              <Text 
                style={[styles.lastMsg, hasUnread && styles.lastMsgUnread]} 
                numberOfLines={1}
              >
                {item.last_message_text || 'No messages yet'}
              </Text>
              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.onlineStatusText}>
              {online ? 'Online' : 'Away'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>
      </Swipeable>
    );
  }, [isUserOnline, formatTimestamp, renderRightActions, handleThreadPress]);

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="chatbubbles-outline" size={80} color="#cccccc" />
      </View>
      <Text style={styles.emptyTitle}>No Active Chats</Text>
      <Text style={styles.emptySubtitle}>
        Start a conversation with someone to see your chats here
      </Text>
    </View>
  ), []);

  // Show error state if queries fail
  if (conversationsError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => (goBack ? goBack() : navigation?.goBack?.())}>
            <Ionicons name="arrow-back" size={22} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Chats</Text>
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Failed to load conversations</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => (goBack ? goBack() : navigation?.goBack?.())}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.title}>
          Chats
          {totalUnread > 0 && (
            <Text style={styles.titleUnread}> ({totalUnread})</Text>
          )}
        </Text>
        <View style={styles.headerRight}>
          {totalUnread > 0 && (
            <View style={styles.headerUnreadBadge}>
              <Text style={styles.headerUnreadText}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </Text>
            </View>
          )}
        </View>
      </View>
      
      {conversationsData.length === 0 && !loading ? (
        renderEmptyState()
      ) : (
        <FlatList
          data={conversationsData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} />}
          contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    backgroundColor: '#ffffff',
  },
  backBtn: {
    marginRight: 16,
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  titleUnread: {
    color: '#007AFF',
  },
  headerRight: {
    alignItems: 'center',
  },
  headerUnreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  headerUnreadText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    backgroundColor: '#ffffff',
  },
  rowUnread: {
    backgroundColor: '#f8f9ff',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8e8e8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  avatarTxt: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  unreadDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  onlineStatusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  usernameUnread: {
    fontWeight: '700',
    color: '#000000',
  },
  timestamp: {
    fontSize: 12,
    color: '#999999',
  },
  timestampUnread: {
    color: '#007AFF',
    fontWeight: '600',
  },
  messageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  lastMsg: {
    fontSize: 14,
    color: '#666666',
    flex: 1,
  },
  lastMsgUnread: {
    color: '#333333',
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  onlineStatusText: {
    fontSize: 11,
    color: '#999999',
  },
  deleteAction: {
    backgroundColor: '#ff4757',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4757',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});