import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,StatusBar, Alert, Keyboard, Animated, LayoutAnimation, UIManager, Image, ActivityIndicator, Modal, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as chatService from '../services/chatService';
import { supabase } from '../services/supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import { PinchGestureHandler, PanGestureHandler } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatThreadScreen({ conversationId, otherUser, navigation, goBack, goToProfile }) {
  const queryClient = useQueryClient();
  
  // State
  const [input, setInput] = useState('');
  const [myId, setMyId] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [inputHeight, setInputHeight] = useState(68);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState({ visible: false, uri: null });
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeenAt, setPeerLastSeenAt] = useState(null);
  const [peerThresholdSec, setPeerThresholdSec] = useState(45);
  const [nowTs, setNowTs] = useState(Date.now());
  const [conversationExists, setConversationExists] = useState(true);
  
  const flatListRef = useRef(null);
  const pinchScale = useRef(new Animated.Value(1)).current;
  const modalTranslateY = useRef(new Animated.Value(0)).current;
  const modalOpacity = modalTranslateY.interpolate({
    inputRange: [0, 200],
    outputRange: [1, 0.5],
    extrapolate: 'clamp',
  });
  
  const [safeAreaInsets, setSafeAreaInsets] = useState({
    top: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0,
    bottom: Platform.OS === 'ios' ? 34 : 0,
  });
  
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Query Keys
  const QUERY_KEYS = {
    messages: ['messages', conversationId],
    conversationParticipants: ['conversation-participants', conversationId],
    userProfiles: ['user-profiles'],
    myUserId: ['my-user-id'],
    conversationExists: ['conversation-exists', conversationId],
    peerProfile: (peerId) => ['peer-profile', peerId],
  };

  // Get My User ID Query
  const { data: currentUserId } = useQuery({
    queryKey: QUERY_KEYS.myUserId,
    queryFn: chatService.getMyUserId,
    staleTime: Infinity, // User ID never changes
    cacheTime: Infinity,
    onSuccess: (id) => setMyId(id),
  });

  // Conversation Participants Query
  const { data: participants = [] } = useQuery({
    queryKey: QUERY_KEYS.conversationParticipants,
    queryFn: () => chatService.getConversationParticipants(conversationId),
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // User Profiles Query
  const userIds = participants.map(p => p.user_id);
  const { data: userProfiles = [] } = useQuery({
    queryKey: [...QUERY_KEYS.userProfiles, userIds],
    queryFn: () => chatService.getUserProfilesByIds(userIds),
    enabled: userIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Derived data
  const userMap = userProfiles.reduce((acc, profile) => {
    acc[profile.id] = profile.username;
    return acc;
  }, {});

  const peer = otherUser || (() => {
    const otherId = userIds.find(uid => uid !== currentUserId);
    return otherId ? { id: otherId, username: userMap[otherId] } : null;
  })();

  const myProfile = currentUserId ? { id: currentUserId, username: userMap[currentUserId] } : null;

  // Messages Query with enhanced image processing
  const { 
    data: messages = [], 
    isLoading: messagesLoading,
    error: messagesError 
  } = useQuery({
    queryKey: QUERY_KEYS.messages,
    queryFn: async () => {
      let list = await chatService.listMessages(conversationId);
      
      // Process images
      list = await Promise.all((list || []).map(async (m) => {
        try {
          const parsed = m?.content ? JSON.parse(m.content) : null;
          if (parsed && parsed.type === 'image' && parsed.path) {
            try {
              let url = await chatService.getSignedImageUrl(parsed.path);
              if (!url) {
                url = chatService.getPublicImageUrl(parsed.path);
              }
              return { ...m, _image: { ...parsed, url: url || null } };
            } catch (_) {
              try {
                const pub = chatService.getPublicImageUrl(parsed.path);
                return { ...m, _image: { ...parsed, url: pub || null } };
              } catch (__) {
                return { ...m, _image: { ...parsed, url: null } };
              }
            }
          }
        } catch (_) {}
        return m;
      }));
      
      return list;
    },
    enabled: !!conversationId,
    staleTime: Infinity,
    cacheTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  // Peer Profile Query for online status
  const { data: peerProfileData } = useQuery({
    queryKey: QUERY_KEYS.peerProfile(peer?.id),
    queryFn: () => chatService.getPeerProfile(peer?.id),
    enabled: !!peer?.id,
    // Always fresh to keep online/away accurate in thread
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
    cacheTime: 24 * 60 * 60 * 1000,
    onSuccess: (data) => {
      if (data) {
        setPeerLastSeenAt(data.last_seen_at || null);
        setPeerThresholdSec(data.online_threshold_seconds || 45);
      }
    },
  });

  // Conversation Exists Query
  const { data: conversationExistsData = true } = useQuery({
    queryKey: QUERY_KEYS.conversationExists,
    queryFn: () => chatService.checkConversationExists(conversationId),
    enabled: !!currentUserId && !!conversationId,
    staleTime: Infinity,
    cacheTime: 24 * 60 * 60 * 1000,
    onSuccess: (exists) => {
      setConversationExists(exists);
      if (!exists) {
        Alert.alert(
          'Conversation Deleted',
          'This conversation has been deleted by the other user. You will be redirected back.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (goBack) {
                  goBack();
                } else if (navigation?.goBack) {
                  navigation.goBack();
                }
              }
            }
          ],
          { cancelable: false }
        );
      }
    },
  });

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content) => {
      await chatService.sendMessage(conversationId, content);
    },
    onMutate: async (content) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.messages });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(QUERY_KEYS.messages);

      // Optimistically update to the new value
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        content,
        created_at: new Date().toISOString(),
        sender_id: currentUserId,
        is_read: false,
        conversation_id: conversationId,
      };

      queryClient.setQueryData(QUERY_KEYS.messages, (old = []) => [...old, optimisticMessage]);

      // Auto-scroll
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 50);

      return { previousMessages };
    },
    onError: (err, content, context) => {
      // Rollback to the previous value
      queryClient.setQueryData(QUERY_KEYS.messages, context.previousMessages);
      
      if (err.message && err.message.includes('row-level security policy')) {
        // Invalidate conversation exists query to recheck
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversationExists });
      } else {
        Alert.alert('Error', 'Could not send message. Please try again.');
      }
    },
    onSettled: () => {
      // Always refetch after error or success to sync with server
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages });
      }, 1000);
    },
  });

  // Send Image Message Mutation
  const sendImageMutation = useMutation({
    mutationFn: async ({ storagePath, mimeType }) => {
      await chatService.sendImageMessage(conversationId, { path: storagePath, mime: mimeType });
    },
    onMutate: async ({ asset }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.messages });
      
      const previousMessages = queryClient.getQueryData(QUERY_KEYS.messages);
      
      const tempId = `temp-img-${Date.now()}`;
      const optimisticMessage = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: currentUserId,
        created_at: new Date().toISOString(),
        content: JSON.stringify({ type: 'image', path: null }),
        _image: { type: 'image', path: null, url: asset.uri },
        localUri: asset.uri,
        is_read: false,
      };
      
      queryClient.setQueryData(QUERY_KEYS.messages, (old = []) => [...old, optimisticMessage]);
      
      setTimeout(() => {
        if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true });
      }, 50);

      return { previousMessages };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(QUERY_KEYS.messages, context.previousMessages);
      
      if (err.message && err.message.includes('row-level security policy')) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversationExists });
      } else {
        Alert.alert('Image', 'Could not send image.');
      }
    },
    onSettled: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages });
      }, 1000);
    },
  });

  // Mark Messages as Read Mutation
  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      await chatService.markMessagesAsRead(conversationId);
    },
    onSuccess: () => {
      // Optimistically update read status
      queryClient.setQueryData(QUERY_KEYS.messages, (old = []) => 
        old.map(msg => ({ ...msg, is_read: true }))
      );
      // Also zero unread for this conversation in inbox and recompute unread total badge
      try {
        queryClient.setQueryData(['conversations'], (prev = []) => {
          return prev.map(c => (c.id === conversationId ? { ...c, unread_count: 0 } : c));
        });
        const list = queryClient.getQueryData(['conversations']) || [];
        const total = list.reduce((s, c) => s + (c.unread_count || 0), 0);
        const uid = myId || currentUserId;
        if (uid) {
          queryClient.setQueryData(['unreadTotal', uid], total);
        }
      } catch (_) {}
    },
  });

  // Delete Conversation Mutation
  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      return chatService.deleteConversation(conversationId);
    },
    onSuccess: async () => {
      try {
        // Invalidate inbox and this thread
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.removeQueries({ queryKey: QUERY_KEYS.messages });
      } catch (_) {}
      // Navigate to ChatInboxScreen if available, else go back
      const nav = navigation;
      const goInbox = () => {
        try {
          if (typeof nav?.navigate === 'function') {
            // Try common route names
            try { nav.navigate('ChatInboxScreen'); return; } catch (_) {}
            try { nav.navigate('ChatInbox'); return; } catch (_) {}
          }
        } catch (_) {}
        if (goBack) { goBack(); }
        else if (typeof nav?.goBack === 'function') { nav.goBack(); }
      };
      goInbox();
    },
    onError: (e) => {
      Alert.alert('Delete Chat', e?.message || 'Failed to delete conversation.');
    }
  });

  // Gesture handlers
  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPinchStateChange = useCallback((event) => {
    const state = event?.nativeEvent?.state;
    if (state === 5) {
      Animated.spring(pinchScale, { toValue: 1, useNativeDriver: true }).start();
    }
  }, [pinchScale]);

  const onDragEvent = Animated.event([{ nativeEvent: { translationY: modalTranslateY } }], { useNativeDriver: true });
  const onDragStateChange = useCallback((event) => {
    const { state, translationY, velocityY } = event.nativeEvent || {};
    if (state === 5) {
      if ((translationY || 0) > 120 || (velocityY || 0) > 800) {
        setViewer({ visible: false, uri: null });
        Animated.timing(modalTranslateY, { toValue: 0, duration: 0, useNativeDriver: true }).start();
        Animated.timing(pinchScale, { toValue: 1, duration: 0, useNativeDriver: true }).start();
      } else {
        Animated.spring(modalTranslateY, { toValue: 0, useNativeDriver: true }).start();
      }
    }
  }, [modalTranslateY, pinchScale]);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  // Auto-scroll when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      if (flatListRef.current && messages.length > 0) {
        flatListRef.current.scrollToEnd({ animated: false });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Mark messages as read when messages load or conversation is entered
  useEffect(() => {
    if (messages.length > 0 && conversationId && !messagesLoading) {
      markAsReadMutation.mutate();
    }
  }, [conversationId, messages.length, messagesLoading]);

  // Keyboard listeners
  useEffect(() => {
    const keyboardWillShow = (e) => {
      const height = e.endCoordinates.height;
      setKeyboardHeight(height);
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    };

    const keyboardWillHide = () => {
      setKeyboardHeight(0);
    };

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, keyboardWillShow);
    const hideSubscription = Keyboard.addListener(hideEvent, keyboardWillHide);

    return () => {
      showSubscription?.remove();
      hideSubscription?.remove();
    };
  }, []);

  // Periodic timer for online status
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  // Presence subscription
  useEffect(() => {
    if (!peer?.id) return;
    
    const channel = supabase.channel('presence-users', {
      config: { presence: { key: String(currentUserId || 'viewer') } },
    });
    
    const handleSync = () => {
      try {
        const state = channel.presenceState();
        const online = !!state[String(peer.id)];
        setPeerOnline(online);
      } catch (_) {}
    };
    
    const handleJoin = () => handleSync();
    const handleLeave = () => handleSync();
    
    channel.on('presence', { event: 'sync' }, handleSync);
    channel.on('presence', { event: 'join' }, handleJoin);
    channel.on('presence', { event: 'leave' }, handleLeave);
    
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') handleSync();
    });
    
    return () => { 
      try { 
        channel.unsubscribe(); 
      } catch (_) {} 
    };
  }, [peer?.id, currentUserId]);

  // Realtime message subscription (do not wait for currentUserId)
  useEffect(() => {
    if (!conversationId) return;

    const ch = chatService.subscribeToThreadMessages(conversationId, {
      onInsert: (message) => {
        if (!message) return;
        queryClient.setQueryData(QUERY_KEYS.messages, (old = []) => {
          const cleaned = old.filter(m => !String(m.id).startsWith('temp-'));
          if (cleaned.some(m => m.id === message.id)) return cleaned;
          const updated = [...cleaned, message];
          if (message.sender_id && myId && message.sender_id !== myId) {
            setTimeout(() => {
              if (flatListRef.current) flatListRef.current.scrollToEnd({ animated: true });
            }, 80);
            // Mark as read when viewing this thread
            try { markAsReadMutation.mutate(); } catch (_) {}
          }
          return updated;
        });
      },
      onUpdate: (message) => {
        if (!message) return;
        queryClient.setQueryData(QUERY_KEYS.messages, (old = []) =>
          old.map(m => (m.id === message.id ? { ...m, ...message } : m))
        );
      }
    });

    return () => { try { ch.unsubscribe(); } catch {} };
  }, [conversationId, queryClient, myId, markAsReadMutation]);

  // Ensure latest messages when screen gains focus
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => {
      try { queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages }); } catch (_) {}
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, [navigation, queryClient, conversationId]);

  // Also refresh peer profile on focus so online/away matches Inbox behavior
  useEffect(() => {
    const unsub = navigation?.addListener?.('focus', () => {
      if (!peer?.id) return;
      try { queryClient.invalidateQueries({ queryKey: QUERY_KEYS.peerProfile(peer.id) }); } catch (_) {}
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, [navigation, queryClient, peer?.id]);

  // Conversation monitoring
  useEffect(() => {
    if (!conversationId || !currentUserId) return;

    const ch = chatService.subscribeToConversationMonitor(conversationId, {
      onParticipantDelete: () => {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversationExists });
      },
      onConversationDelete: () => {
        setConversationExists(false);
        Alert.alert(
          'Conversation Deleted',
          'This conversation has been deleted. You will be redirected back.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (goBack) {
                  goBack();
                } else if (navigation?.goBack) {
                  navigation.goBack();
                }
              }
            }
          ],
          { cancelable: false }
        );
      }
    });

    return () => { try { ch.unsubscribe(); } catch (_) {} };
  }, [conversationId, currentUserId, queryClient]);

  // Peer last seen subscription
  useEffect(() => {
    if (!peer?.id) return;
    const ch = chatService.subscribeToPeerLastSeen(peer.id, (row) => {
      if (!row) return;
      queryClient.setQueryData(QUERY_KEYS.peerProfile(peer.id), row);
      setPeerLastSeenAt(row.last_seen_at || null);
      setPeerThresholdSec(row.online_threshold_seconds || 45);
    });
    return () => { try { ch.unsubscribe(); } catch (_) {} };
  }, [peer?.id, queryClient]);

  // Enable smooth layout animations
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const onSend = async () => {
    if (!input.trim() || sendMessageMutation.isLoading || !conversationExistsData) return;
    
    const content = input.trim();
    setInput('');
    sendMessageMutation.mutate(content);
  };

  const handleImageUpload = async () => {
    if (!conversationExistsData || uploading) return;
    
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'We need access to your photos to send images.');
        return;
      }
      
      const useNewApi = !!ImagePicker?.MediaType;
      const pickerOpts = useNewApi
        ? { mediaTypes: [ImagePicker.MediaType.Images], quality: 0.8 }
        : { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
      
      const result = await ImagePicker.launchImageLibraryAsync(pickerOpts);
      if (result.canceled) return;
      
      const asset = result.assets?.[0];
      if (!asset?.uri) return;

      setUploading(true);
      
      let contentType = asset.mimeType || 'image/jpeg';
      try {
        const uriLower = asset.uri.split('?')[0].toLowerCase();
        if (uriLower.endsWith('.png')) contentType = 'image/png';
        else if (uriLower.endsWith('.webp')) contentType = 'image/webp';
        else if (uriLower.endsWith('.jpg') || uriLower.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (uriLower.endsWith('.heic')) contentType = 'image/heic';
      } catch (_) {}

      // Upload and send
      const storagePath = await chatService.uploadChatImageAsync(conversationId, asset.uri, contentType);
      sendImageMutation.mutate({ storagePath, mimeType: contentType, asset });
      
    } catch (e) {
      console.warn('Image send error:', e?.message || e);
      
      if (e.message && e.message.includes('row-level security policy')) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.conversationExists });
      } else {
        Alert.alert('Image', 'Could not send image.');
      }
    } finally {
      setUploading(false);
    }
  };

  const renderItem = ({ item }) => {
    const mine = currentUserId && item.sender_id === currentUserId;
    const isSelected = selectedMessageId === item.id;

    // Detect image message
    let imageMeta = null;
    if (item._image) {
      imageMeta = item._image;
    } else if (item?.content) {
      try {
        const parsed = JSON.parse(item.content);
        if (parsed?.type === 'image') imageMeta = parsed;
      } catch (_) {}
    }

    return (
      <View>
        <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowPeer]}>
          <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubblePeer, imageMeta && styles.imageWrapper]}>
            {imageMeta ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  const uri = item.localUri || imageMeta?.url || null;
                  if (uri) {
                    setViewer({ visible: true, uri });
                    Animated.timing(pinchScale, { toValue: 1, duration: 0, useNativeDriver: true }).start();
                    Animated.timing(modalTranslateY, { toValue: 0, duration: 0, useNativeDriver: true }).start();
                  }
                }}
                onLongPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSelectedMessageId(prev => (prev === item.id ? null : item.id));
                }}
              >
                <Image
                  source={{ uri: item.localUri || imageMeta.url }}
                  style={[
                    styles.imageBubble,
                    (imageMeta?.width && imageMeta?.height)
                      ? { width: Math.min(220, screenWidth * 0.6), height: undefined, aspectRatio: imageMeta.width / imageMeta.height }
                      : { width: Math.min(220, screenWidth * 0.6), height: Math.min(220, screenWidth * 0.6) },
                  ]}
                  resizeMode="cover"
                />
                {!!item.content && typeof item.content === 'string' && item.content.length > 0 && (
                  <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextPeer]} numberOfLines={2}>
                    {(() => { try { const p = JSON.parse(item.content); return p.caption || ''; } catch(_) { return ''; } })()}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setSelectedMessageId(prev => (prev === item.id ? null : item.id));
                }}
              >
                <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextPeer]}>
                  {item.content}
                </Text>
              </TouchableOpacity>
            )}
            {mine && (
              <View style={styles.readStatus}>
                <Ionicons 
                  name={item.is_read ? "checkmark-done" : "checkmark"} 
                  size={12} 
                  color={item.is_read ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.5)"} 
                />
              </View>
            )}
          </View>
          {isSelected && (
            <View style={[styles.timeStamp, mine ? styles.timeStampMine : styles.timeStampPeer]}>
              <Text style={styles.timeText}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Show loading state or deleted state
  if (messagesLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.deletedContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.deletedText}>Loading conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!conversationExistsData) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.deletedContainer}>
          <Ionicons name="trash-outline" size={64} color="#666666" />
          <Text style={styles.deletedTitle}>Conversation Deleted</Text>
          <Text style={styles.deletedText}>This conversation is no longer available.</Text>
          <TouchableOpacity 
            style={styles.deletedButton}
            onPress={() => {
              if (goBack) {
                goBack();
              } else if (navigation?.goBack) {
                navigation.goBack();
              }
            }}
          >
            <Text style={styles.deletedButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Derive online/away directly from peerProfileData to match Inbox logic
  const peerOnlineFlag = peerProfileData?.is_online === true;
  const onlineFromLastSeen = (() => {
    const last = peerProfileData?.last_seen_at;
    const thr = (peerProfileData?.online_threshold_seconds ?? 45) * 1000;
    if (!last) return false;
    return (nowTs - new Date(last).getTime()) < thr;
  })();
  const combinedOnline = peerOnlineFlag || onlineFromLastSeen;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => (goBack ? goBack() : navigation?.goBack?.())}>
          <Ionicons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <TouchableOpacity
            onPress={() => {
              const uid = peer?.id || null;
              const uname = peer?.username || 'user';
              if (!uid) return;
              if (typeof goToProfile === 'function') {
                goToProfile({ userId: uid, username: uname });
                return;
              }
              if (typeof navigation?.navigate === 'function') {
                navigation.navigate('ProfileScreen', { userId: uid, username: uname });
              }
            }}
            accessibilityLabel="Open user's profile"
            activeOpacity={0.7}
          >
            <Text style={styles.title}>@{peer?.username || 'user'}</Text>
          </TouchableOpacity>
          <View style={styles.onlineIndicator}>
            <View style={[styles.onlineDot, { backgroundColor: combinedOnline ? '#27AE60' : '#E74C3C' }]} />
            <Text style={styles.onlineText}>{combinedOnline ? 'Online' : 'Away'}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => {
            if (!conversationId || deleteConversationMutation.isLoading) return;
            Alert.alert(
              'Delete Chat',
              'Are you sure you want to delete this conversation? This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => deleteConversationMutation.mutate() }
              ]
            );
          }}
          accessibilityLabel="Delete chat"
        >
          {deleteConversationMutation.isLoading ? (
            <ActivityIndicator size="small" color="#C62828" />
          ) : (
            <Ionicons name="trash" size={20} color="#C62828" />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -safeAreaInsets.bottom}
      >
        <View style={styles.messagesContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.messagesList,
              { paddingBottom: 20 }
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onScrollBeginDrag={dismissKeyboard}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              if (flatListRef.current && messages.length > 0) {
                flatListRef.current.scrollToEnd({ animated: false });
              }
            }}
            onLayout={() => {
              if (flatListRef.current && messages.length > 0) {
                setTimeout(() => {
                  flatListRef.current.scrollToEnd({ animated: false });
                }, 100);
              }
            }}
          />
        </View>

        <View
          onLayout={(e) => setInputHeight(e.nativeEvent.layout.height)}
          style={[styles.inputContainer, !conversationExistsData && styles.inputContainerDisabled]}
        >
          <View style={styles.inputRow}>
            <TouchableOpacity
              style={[styles.attachBtn, (uploading || !conversationExistsData) && styles.attachBtnDisabled]}
              disabled={uploading || !conversationExistsData}
              onPress={handleImageUpload}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Ionicons name="image-outline" size={20} color="#000" />
              )}
            </TouchableOpacity>
            <View style={[styles.inputWrapper, !conversationExistsData && styles.inputWrapperDisabled]}>
              <TextInput
                style={[styles.input, !conversationExistsData && styles.inputDisabled]}
                placeholder={conversationExistsData ? "Type something..." : "Conversation deleted"}
                placeholderTextColor="#BDC3C7"
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={1000}
                selectionColor="#000"
                returnKeyType="send"
                blurOnSubmit={false}
                editable={conversationExistsData}
                onSubmitEditing={() => {
                  if (input.trim() && !sendMessageMutation.isLoading && conversationExistsData) {
                    onSend();
                  }
                }}
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || sendMessageMutation.isLoading || !conversationExistsData) && styles.sendBtnDisabled]}
              disabled={sendMessageMutation.isLoading || !input.trim() || !conversationExistsData}
              onPress={onSend}
            >
              {sendMessageMutation.isLoading ? (
                <ActivityIndicator size="small" color="#BDC3C7" />
              ) : (
                <Ionicons
                  name="send"
                  size={20}
                  color={(!input.trim() || sendMessageMutation.isLoading || !conversationExistsData) ? "#BDC3C7" : "#FFFFFF"}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={viewer.visible}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setViewer({ visible: false, uri: null })}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <TouchableOpacity
            onPress={() => setViewer({ visible: false, uri: null })}
            style={[styles.modalClose, { top: 8 + (safeAreaInsets?.top || 0) }]}
            accessibilityLabel="Close image"
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <PanGestureHandler onGestureEvent={onDragEvent} onHandlerStateChange={onDragStateChange}>
            <Animated.View style={[styles.modalImageContainer, { transform: [{ translateY: modalTranslateY }], opacity: modalOpacity }]}>
              <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
                <Animated.View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                  {viewer.uri ? (
                    <Animated.Image
                      source={{ uri: viewer.uri }}
                      style={[styles.modalImage, { transform: [{ scale: pinchScale }] }]}
                      resizeMode="contain"
                    />
                  ) : null}
                </Animated.View>
              </PinchGestureHandler>
            </Animated.View>
          </PanGestureHandler>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F8F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },

  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.2,
  },

  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },

  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },

  onlineText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666666',
    letterSpacing: 0.1,
  },

  deleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F8F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },

  // Main content area
  keyboardView: {
    flex: 1,
  },

  messagesContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    flexGrow: 1,
  },

  // Message bubble styles
  msgRow: {
    marginBottom: 12,
    maxWidth: '85%',
  },

  msgRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },

  msgRowPeer: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },

  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    position: 'relative',
    maxWidth: '100%',
  },

  bubbleMine: {
    backgroundColor: '#000000',
    borderBottomRightRadius: 6,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },

  bubblePeer: {
    backgroundColor: '#F5F5F5',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },

  msgText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
  },

  msgTextMine: {
    color: '#FFFFFF',
  },

  msgTextPeer: {
    color: '#000000',
  },

  // Image message styles
  imageWrapper: {
    padding: 4,
    overflow: 'hidden',
  },

  imageBubble: {
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },

  // Read status
  readStatus: {
    position: 'absolute',
    bottom: 6,
    right: 8,
  },

  // Timestamp
  timeStamp: {
    marginTop: 4,
    paddingHorizontal: 4,
  },

  timeStampMine: {
    alignItems: 'flex-end',
  },

  timeStampPeer: {
    alignItems: 'flex-start',
  },

  timeText: {
    fontSize: 11,
    color: '#999999',
    fontWeight: '500',
  },

  // Input area styles
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  inputContainerDisabled: {
    backgroundColor: '#F8F8F8',
    opacity: 0.6,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },

  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },

  attachBtnDisabled: {
    backgroundColor: '#F8F8F8',
    opacity: 0.5,
  },

  inputWrapper: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },

  inputWrapperDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.5,
  },

  input: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '400',
    lineHeight: 20,
    textAlignVertical: 'center',
    paddingVertical: 4,
  },

  inputDisabled: {
    color: '#999999',
  },

  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  sendBtnDisabled: {
    backgroundColor: '#E8E8E8',
    shadowOpacity: 0,
    elevation: 0,
  },

  // Send button icon colors
  sendIconActive: {
    color: '#FFFFFF',
  },

  sendIconDisabled: {
    color: '#BDC3C7',
  },

  // Modal styles for image viewer
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },

  modalImageContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalImage: {
    width: '90%',
    height: '70%',
  },

  // Deleted conversation states
  deletedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#FFFFFF',
  },

  deletedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000000',
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: -0.3,
  },

  deletedText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },

  deletedButton: {
    backgroundColor: '#000000',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },

  deletedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Loading states
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  loadingText: {
    fontSize: 16,
    color: '#666666',
    marginTop: 16,
    fontWeight: '500',
  },

  // Enhanced interactive states
  touchableOpacity: {
    opacity: 0.7,
  },

  // Refined typography
  caption: {
    fontSize: 12,
    color: '#999999',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Subtle dividers
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 8,
  },

  // Status indicators
  statusIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // Premium shadows for depth
  cardShadow: {
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  // Refined spacing system
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },

  // Typography scale
  typography: {
    largeTitle: {
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    body: {
      fontSize: 16,
      fontWeight: '400',
      lineHeight: 22,
    },
    caption: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 0.2,
    },
  },

  // Consistent border radius
  borderRadius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    round: 999,
  },
});