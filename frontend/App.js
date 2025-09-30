import { StatusBar } from 'expo-status-bar'
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { View, Image, StyleSheet, Text, TouchableOpacity, Alert, Platform, Animated, Easing, Dimensions, StatusBar as RNStatusBar } from 'react-native'
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Import screens
import { UnreadCountProvider } from './src/hooks/useUnreadCount'
import HomeScreen from './src/screens/HomeScreen'
import AuthScreen from './src/screens/AuthScreen'
import SubscriptionScreen from './src/screens/SubscriptionScreen'
import MainScreen from './src/screens/MainScreen'
import AddCarScreen from './src/screens/AddCarScreen'
import CarProfileScreen from './src/screens/CarProfileScreen'
import EventDetailsScreen from './src/screens/EventDetailsScreen'
import EventScreen from './src/screens/EventScreen'
import UploadResultScreen from './src/screens/UploadResultScreen'
import ProfileScreen from './src/screens/ProfileScreen'
import ChatInboxScreen from './src/screens/ChatInboxScreen'
import ChatThreadScreen from './src/screens/ChatThreadScreen'
import ReferalScreen from './src/screens/ReferalScreen'
import AdminScreen from './src/screens/AdminScreen'

// Import services
import CarService from './src/services/carService'
import { authService, supabase } from './src/services/supabaseClient'
import AuthService from './src/services/authService'
import socket from './src/services/socket'
import * as chatService from './src/services/chatService'
import notificationService from './src/services/notificationService'
import { AppState } from 'react-native'
import { upsertUserProfile, updateAllUserCarsLocation } from './src/services/profileService'
import userStatusService from './src/services/userStatusService'
import locationService from './src/services/locationService'

// Configure global notification handler: suppress OS banner while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Foreground: no system banner/sound; background delivery unaffected
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Ensure Android channel exists (required for heads-up notifications on Android)
async function ensureAndroidChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

}
ensureAndroidChannel();

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25
const VELOCITY_THRESHOLD = 800

// Create the query client with cache-first, low-churn settings (manual refresh)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,           // Consider data always fresh until user refreshes
      cacheTime: 24 * 60 * 60 * 1000, // Keep cache for a day
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
    mutations: {
      retry: 1,
      onError: (error) => {
        console.error('Mutation error:', error)
      },
    },
  },
})

// Main App Component wrapped in providers
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}

// Main app content component
function AppContent() {
  const queryClient = useQueryClient()
  
  // Screen and state management
  const [screen, setScreen] = useState('Home')
  const [selectedLanguage, setSelectedLanguage] = useState('georgian')
  const [appIsReady, setAppIsReady] = useState(false)
  const [selectedCar, setSelectedCar] = useState(null)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [loadingCarProfile, setLoadingCarProfile] = useState(false)
  const [uploadParams, setUploadParams] = useState(null)
  const [mainRouteParams, setMainRouteParams] = useState(null)
  const [chatContext, setChatContext] = useState({ conversationId: null, otherUser: null })

  // Swipe animation states
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [previousScreen, setPreviousScreen] = useState(null)
  const swipeTranslateX = useRef(new Animated.Value(0)).current
  const previousScreenOpacity = useRef(new Animated.Value(0)).current
  const currentScreenOpacity = useRef(new Animated.Value(1)).current
  const overlayOpacity = useRef(new Animated.Value(0)).current
  // Guard to ensure navigation executes only once per gesture
  const hasNavigatedRef = useRef(false)

  // Refs for cleanup
  const presenceChannelRef = useRef(null)
  const appState = useRef(AppState.currentState)
  const heartbeatRef = useRef(null)
  const notificationSubscriptions = useRef(null)
  const processedInitialNotificationRef = useRef(false)
  const toastTimerRef = useRef(null)
  const notifTimerRef2 = useRef(null)
  const notifAnim = useRef(new Animated.Value(0)).current

  // Notification states
  const [toast, setToast] = useState({ visible: false, title: '', message: '', conversationId: null, fromUserId: null })
  const [notifications, setNotifications] = useState([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)

  // Rate-limit location syncs
const lastLocSyncRef = useRef(0);

/**
 * Auto-sync location to profile and all cars
 * - force = true bypasses cooldown
 * - cooldown = 5 minutes by default
 */
const autoSyncLocationAndCars = useCallback(async (userId, force = false) => {
  try {
    if (!userId) return
    const now = Date.now()
    const COOLDOWN_MS = 5 * 60 * 1000
    if (!force && now - lastLocSyncRef.current < COOLDOWN_MS) return

    const { city, country, region } = await locationService.getCityCountry()
    if (!city && !country && !region) return

    // Update profile
    try {
      await upsertUserProfile({
        id: userId,
        city: city || null,
        country: country || null,
        region: region || null,
      })
    } catch (_) {}

    // Update all cars
    try {
      await updateAllUserCarsLocation(userId, {
        city: city || null,
        country: country || null,
        region: region || null,
      })
    } catch (_) {}

    lastLocSyncRef.current = now
  } catch (_) {}
}, [])

  // TanStack Query for splash screen readiness - REMOVED onSuccess callback
  const { data: splashReady } = useQuery({
    queryKey: ['splashReady'],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 1500))
      return true
    },
    staleTime: Infinity,
    cacheTime: Infinity,
  })

  // Subscription status
  const {
    data: subscriptionStatus,
    refetch: refetchUserStatus
  } = useQuery({
    queryKey: ['userStatus', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { hasActiveSubscription: false }
      try {
        const s = await userStatusService.getStatus()
        return s
      } catch (_) {
        return { hasActiveSubscription: false }
      }
    },
    enabled: !!currentUser?.id,
    staleTime: 60_000,
  })
  const hasActiveSubscription = !!subscriptionStatus?.hasActiveSubscription

  // Ensure we have the freshest subscription status before gating actions
  const ensureSubscriptionFresh = React.useCallback(async () => {
    try {
      const res = await refetchUserStatus()
      return !!res?.data?.hasActiveSubscription
    } catch (_) {
      return !!subscriptionStatus?.hasActiveSubscription
    }
  }, [refetchUserStatus, subscriptionStatus?.hasActiveSubscription])

  // Preload persisted session so the app stays logged in after cold start
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          // Bridge Supabase session token to AuthService for backend endpoints (e.g., referral)
          try { if (session?.access_token) { AuthService.token = session.access_token } } catch (_) {}
          const uid = session.user.id
          // Navigate immediately for fast startup
          setScreen('Main')
          // Background: fetch profile and sync location without blocking UI
          ;(async () => {
            try {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('id, username, first_name, last_name, phone, age, city, country, region, role')
                .eq('id', uid)
                .maybeSingle()
              queryClient.setQueryData(['currentUser'], { ...session.user, profile: profile || null })
            } catch (_) {
              queryClient.setQueryData(['currentUser'], { ...session.user, profile: null })
            }
            try { await autoSyncLocationAndCars(uid, true) } catch (_) {}
          })()
        }
      } catch (_) {}
    })()
  }, [queryClient])

  // Request permission and get Expo push token
  const registerForPushNotificationsAsync = useCallback(async () => {
    try {
      // Allow Android emulator, block only on iOS simulator
      if (Platform.OS === 'ios' && !Device.isDevice) {
        console.log('Skipping push token on iOS simulator')
        return null
      }
      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') {
        console.log('Push permissions not granted')
        return null
      }
      const token = (await Notifications.getExpoPushTokenAsync()).data
      console.log('Expo push token:', token)
      return token
    } catch (e) {
      console.log('Failed to register for push', e?.message || e)
      return null
    }
  }, [])

  // Save Expo push token to backend for the signed-in user
  const savePushToken = useCallback(async (token, userId) => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_API_URL_HOME || 'http://10.0.2.2:3000'
      await fetch(`${baseUrl}/api/push/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, token, platform: Platform.OS }),
      })
    } catch (e) {
      console.log('Failed to save push token', e)
    }
  }, [])

  // Make app ready immediately to avoid startup delay
  useEffect(() => {
    setAppIsReady(true)
  }, [])

  // TanStack Query for platform setup
  const { data: platformSetup } = useQuery({
    queryKey: ['platformSetup'],
    queryFn: async () => {
      if (Platform.OS === 'android') {
        RNStatusBar.setTranslucent(false)
        RNStatusBar.setBackgroundColor('#ffffff', true)
        RNStatusBar.setBarStyle('dark-content', true)
      }
      return true
    },
    staleTime: Infinity,
    cacheTime: Infinity,
  })

  // TanStack Query for current user - SIMPLIFIED
  const {
    data: currentUser,
    isLoading: isUserLoading,
    error: userError,
    refetch: refetchUser
  } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) return null

      // Fetch user profile with all fields needed by MainScreen profile section
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, username, first_name, last_name, phone, age, city, country, region, role')
          .eq('id', user.id)
          .maybeSingle()
        
        return { ...user, profile: profile || null }
      } catch (profileError) {
        console.error('Error fetching user profile:', profileError)
        return { ...user, profile: null }
      }
    },
    staleTime: Infinity,
    cacheTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
    enabled: true,
  })

  // TanStack Query for unread chat count - SIMPLIFIED
  const {
    data: chatUnreadTotal = 0,
    refetch: refetchUnreadCount
  } = useQuery({
    queryKey: ['chatUnreadCount', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return 0
      
      try {
        const list = await chatService.listConversations()
        return (list || []).reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0)
      } catch (error) {
        console.warn('Failed to fetch unread count:', error)
        return 0
      }
    },
    enabled: !!currentUser?.id,
    staleTime: Infinity,
    cacheTime: 24 * 60 * 60 * 1000,
  })

  // Setup side effects with useEffect instead of queries
  useEffect(() => {
    if (!currentUser?.id) return

    const setupUserServices = async () => {
      try {
        // Start presence
        await startPresence(currentUser, currentUser.profile)
        
        // Start heartbeat
        startHeartbeat(currentUser.id)
        
        // Setup notifications: get Expo token and send to backend, then start service
        const expoToken = await registerForPushNotificationsAsync()
        if (expoToken && currentUser?.id) {
          try { await savePushToken(expoToken, currentUser.id) } catch (_) {}
        }
        notificationService.registerForPushNotifications(currentUser.id)
        notificationService.startMessageSubscription(currentUser)
      } catch (error) {
        console.warn('Error setting up user services:', error)
      }
    }

    setupUserServices()

    // Cleanup function
    return () => {
      try {
        presenceChannelRef.current?.untrack()
        presenceChannelRef.current?.unsubscribe()
      } catch {}
      stopHeartbeat()
      notificationService.stopMessageSubscription()
    }
  }, [currentUser?.id])

  // Setup notification service with useEffect
  useEffect(() => {
    notificationService.initialize({
      onNewNotification: (notification) => {
        setNotifications(prev => [notification, ...prev].slice(0, 5))
      },
      onShowNotificationPanel: (show) => {
        setShowNotifPanel(show)
        if (show) {
          if (notifTimerRef2.current) clearTimeout(notifTimerRef2.current)
          notifTimerRef2.current = setTimeout(() => setShowNotifPanel(false), 4000)
        }
      },
      onUpdateUnreadCount: () => {
        refetchUnreadCount()
      },
      onShowToast: showToast,
      onRefreshUnreadTotal: () => refetchUnreadCount()
    })

    const subscriptions = notificationService.setupNotificationHandlers({
      onNotificationTap: ({ conversationId, senderId }) => {
        goToChatThread({ 
          conversationId, 
          otherUser: { id: senderId } 
        })
      }
    })

    notificationSubscriptions.current = subscriptions

    return () => {
      if (subscriptions?.remove) {
        subscriptions.remove()
      }
    }
  }, [])

  // Handle cold-start launch from a notification
  useEffect(() => {
    (async () => {
      if (processedInitialNotificationRef.current) return
      if (!currentUser?.id) return // wait for session restore
      try {
        const last = await Notifications.getLastNotificationResponseAsync()
        const data = last?.notification?.request?.content?.data || null
        const convId = data?.conversationId
        const senderId = data?.senderId
        if (convId) {
          processedInitialNotificationRef.current = true
          // Ensure we are on Main first, then open the thread
          setScreen('Main')
          // Small delay to ensure Main mounted
          setTimeout(() => {
            goToChatThread({ conversationId: convId, otherUser: senderId ? { id: senderId } : null })
          }, 50)
        }
      } catch (_) {}
    })()
  }, [currentUser?.id])

  // Global Chat Inbox realtime subscription: keeps conversations cache live
  useEffect(() => {
    if (!currentUser?.id) return
    const inboxCh = chatService.subscribeToInboxLive({
      onMessageInsert: (row) => {
        if (!row?.conversation_id) return
        // Update conversations cache optimistically
        queryClient.setQueryData(['conversations'], (prev = []) => {
          const idx = prev.findIndex(c => c.id === row.conversation_id)
          if (idx === -1) {
            // If conversation is not present, do not create a fake one; just return prev
            return prev
          }
          const copy = [...prev]
          const conv = { ...copy[idx] }
          conv.last_message_at = row.created_at || new Date().toISOString()
          conv.last_message_text = row.content || conv.last_message_text
          // Increment unread if message is not from me
          if (String(row.sender_id) !== String(currentUser.id)) {
            conv.unread_count = (conv.unread_count || 0) + 1
          }
          // Move to top
          copy.splice(idx, 1)
          copy.unshift(conv)
          return copy
        })

        // Recompute unread total from conversations and update cache used by MainScreen badge
        try {
          const list = queryClient.getQueryData(['conversations']) || []
          const total = list.reduce((s, c) => s + (c.unread_count || 0), 0)
          queryClient.setQueryData(['unreadTotal', currentUser.id], total)
        } catch (_) {}
      },
      onMessageUpdate: () => {
        // Ensure any edits propagate
        queryClient.invalidateQueries({ queryKey: ['conversations'] })
      },
      onConversationUpdate: (row) => {
        if (!row?.id) return
        queryClient.setQueryData(['conversations'], (prev = []) => {
          const idx = prev.findIndex(c => c.id === row.id)
          if (idx === -1) return prev
          const copy = [...prev]
          const conv = { ...copy[idx] }
          if (row.last_message_at) conv.last_message_at = row.last_message_at
          if (row.last_message_text) conv.last_message_text = row.last_message_text
          copy[idx] = conv
          // Sort by last message time desc
          copy.sort((a, b) => {
            const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
            const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
            return tb - ta
          })
          return copy
        })
      },
    })

    return () => {
      try { inboxCh?.unsubscribe?.() } catch (_) {}
    }
  }, [currentUser?.id, queryClient])

  // Setup app state monitoring with useEffect
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prevAppState = appState.current
      appState.current = nextAppState
      const ch = presenceChannelRef.current
      
      if (!ch) return
      
      try {
        if (nextAppState === 'active') {
          ch.track({ ping: Date.now() })
          if (currentUser?.id) startHeartbeat(currentUser.id)
        } else {
          ch.untrack()
          stopHeartbeat()
          if (currentUser?.id) {
            // Foreground sync; allow cooldown to avoid spamming
            try { autoSyncLocationAndCars(currentUser.id, false) } catch (_) {}
          }
        }
      } catch {}
    })

    return () => {
      subscription?.remove()
    }
  }, [currentUser?.id])

  // Setup auth state monitoring with useEffect
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        try { 
          presenceChannelRef.current?.untrack()
          presenceChannelRef.current?.unsubscribe()
        } catch {}
        stopHeartbeat()
        notificationService.stopMessageSubscription()
        queryClient.clear()
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Keep AuthService token in sync with Supabase session
        try { if (session?.access_token) { AuthService.token = session.access_token } } catch (_) {}
        refetchUser()
        try { autoSyncLocationAndCars(session?.user?.id, true) } catch (_) {}
      }
    })
    
    return () => {
      subscription?.subscription?.unsubscribe()
    }
  }, [queryClient, refetchUser])

  // Admins can access Admin via floating button on Main screen (no auto-routing)

  // Notification animation side-effect
  useEffect(() => {
    if (showNotifPanel) {
      Animated.sequence([
        Animated.timing(notifAnim, {
          toValue: 1,
          duration: 350,
          easing: Easing.bezier(0.25, 0.46, 0.45, 0.94),
          useNativeDriver: true,
        }),
      ]).start()
    } else {
      Animated.timing(notifAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.bezier(0.55, 0.06, 0.68, 0.19),
        useNativeDriver: true,
      }).start()
    }
  }, [showNotifPanel])

  // Notification service app state updates
  useEffect(() => {
    if (!screen) return
    try { notificationService.updateAppState(screen, chatContext) } catch (_) {}
  }, [screen, chatContext])

  // Mutation for authentication - SIMPLIFIED
  const authMutation = useMutation({
    mutationFn: async ({ user, profile, hasActivePlan }) => {
      // Just set the data, don't trigger other queries
      queryClient.setQueryData(['currentUser'], { ...user, profile })
      return { user, profile, hasActivePlan }
    },
    onSuccess: ({ user, profile, hasActivePlan }) => {
      // Always land on Main; features will be gated if no subscription
      goToMain()
    }
  })

  // Pseudocode you can drop into App.js
useEffect(() => {
  const sub = supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user;
    if (event === 'SIGNED_IN' && user) {
      try {
        await upsertUserProfile({
          id: user.id,
          is_online: true,
          last_seen_at: new Date().toISOString(),
        });
      } catch (_) {}
    } else if (event === 'SIGNED_OUT' && user) {
      try {
        await upsertUserProfile({
          id: user.id,
          is_online: false,
          last_seen_at: new Date().toISOString(),
        });
      } catch (_) {}
    }
  });
  return () => sub?.data?.subscription?.unsubscribe?.();
}, []);

useEffect(() => {
  let t;
  function startHeartbeat(uid) {
    stopHeartbeat();
    if (!uid) return;
    t = setInterval(async () => {
      try {
        await upsertUserProfile({
          id: uid,
          last_seen_at: new Date().toISOString(),
          is_online: true, // keep true while foregrounded
        });
      } catch (_) {}
    }, 25000); // 25s
  }
  function stopHeartbeat() {
    if (t) clearInterval(t);
  }
  // When your app knows current user id:
  if (currentUser?.id) startHeartbeat(currentUser.id);
  return () => stopHeartbeat();
}, [currentUser?.id]);

useEffect(() => {
  const handler = (state) => {
    if (!currentUser?.id) return;
    if (state === 'active') {
      // went foreground
      upsertUserProfile({
        id: currentUser.id,
        is_online: true,
        last_seen_at: new Date().toISOString(),
      }).catch(() => {});
    } else {
      // background — optional: set offline immediately, or let threshold handle it
      upsertUserProfile({
        id: currentUser.id,
        is_online: false,
        last_seen_at: new Date().toISOString(),
      }).catch(() => {});
    }
  };
  const sub = AppState.addEventListener('change', handler);
  return () => sub?.remove?.();
}, [currentUser?.id]);

  // Mutation for logout
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        presenceChannelRef.current?.untrack()
        presenceChannelRef.current?.unsubscribe()
      } catch {}
      
      stopHeartbeat()
      notificationService.stopMessageSubscription()
      // Remove push token on server to stop further notifications for this device
      try {
        if (currentUser?.id) {
          autoSyncLocationAndCars(currentUser.id, true)

          await supabase
            .from('user_profiles')
            .update({ push_token: null })
            .eq('id', currentUser.id)
        }
      } catch (_) {}
      // Sign out so session is removed from AsyncStorage
      try { await supabase.auth.signOut() } catch (_) {}
      // Clear local caches
      queryClient.clear()
      
      return true
    },
    onSuccess: () => {
      setScreen('Home')
      setSelectedCar(null)
    }
  })

  // Mutation for car operations
  const carMutation = useMutation({
    mutationFn: async ({ action, carId, carData }) => {
      switch (action) {
        case 'delete':
          return await CarService.deleteCar(currentUser?.id, carId)
        case 'fetch':
          return await CarService.getCarWithOwner(carId)
        default:
          throw new Error('Unknown car action')
      }
    },
    onSuccess: (data, { action, carId }) => {
      if (action === 'delete') {
        queryClient.invalidateQueries({ queryKey: ['cars'] })
        queryClient.invalidateQueries({ queryKey: ['userCars', currentUser?.id] })
        goBackToMain()
      } else if (action === 'fetch') {
        setSelectedCar(data)
        setScreen('CarProfile')
      }
    },
    onError: (error, { action }) => {
      if (action === 'delete') {
        Alert.alert('Error', 'Could not delete car. Please try again.')
      } else if (action === 'fetch') {
        Alert.alert('Error', 'Could not load car details. Please try again.')
      }
    }
  })

  const refreshUnreadTotal = useCallback(async () => {
    refetchUnreadCount()
  }, [refetchUnreadCount])

  // Helper functions (keeping existing logic)
  const getPreviousScreen = (currentScreen) => {
    const navigationMap = {
      'AddCar': 'Main',
      'EventDetails': 'Main',
      'EventScreen': 'Main',
      'UploadResult': 'Main',
      'Profile': 'Main',
      'ChatInbox': 'Main',
      'ChatThread': 'ChatInbox',
      'CarProfile': 'Main',
      'Subscription': 'Main',
      'Referal': 'Main',
    }
    return navigationMap[currentScreen] || null
  }

  // Swipe gesture handler (keeping existing logic)
  const handleSwipeGesture = useCallback((event) => {
    const { state, translationX, translationY, velocityX, velocityY } = event.nativeEvent

    if (Math.abs(translationY) > Math.abs(translationX)) return

    const prevScreen = getPreviousScreen(screen)

    switch (state) {
      case State.BEGAN:
        hasNavigatedRef.current = false
        if (prevScreen) setPreviousScreen(prevScreen)
        setIsTransitioning(true)
        swipeTranslateX.setValue(0)
        previousScreenOpacity.setValue(0)
        currentScreenOpacity.setValue(1)
        overlayOpacity.setValue(0)
        break

      case State.ACTIVE:
        if (translationX > 0 && isTransitioning) {
          const progress = Math.min(translationX / SCREEN_WIDTH, 1)
          
          swipeTranslateX.setValue(translationX)
          previousScreenOpacity.setValue(Math.min(progress * 2, 1))
          currentScreenOpacity.setValue(1 - (progress * 0.3))
          overlayOpacity.setValue(progress * 0.3)
        }
        break

      case State.END:
      case State.CANCELLED:
        if (isTransitioning) {
          const shouldGoBack = translationX > SWIPE_THRESHOLD || velocityX > VELOCITY_THRESHOLD
          
          if (shouldGoBack && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true
            Animated.parallel([
              Animated.timing(swipeTranslateX, {
                toValue: SCREEN_WIDTH,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(previousScreenOpacity, {
                toValue: 1,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(currentScreenOpacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(overlayOpacity, {
                toValue: 0,
                duration: 200,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]).start(() => {
              // Navigate immediately so the target screen mounts while the previous snapshot is still visible
              executeNavigation(screen)
              // Keep the previous layer for one frame to hide mount work, then clear
              requestAnimationFrame(() => {
                resetSwipeAnimation()
              })
            })
          } else {
            Animated.parallel([
              Animated.spring(swipeTranslateX, {
                toValue: 0,
                tension: 100,
                friction: 8,
                useNativeDriver: true,
              }),
              Animated.spring(previousScreenOpacity, {
                toValue: 0,
                tension: 100,
                friction: 8,
                useNativeDriver: true,
              }),
              Animated.spring(currentScreenOpacity, {
                toValue: 1,
                tension: 100,
                friction: 8,
                useNativeDriver: true,
              }),
              Animated.spring(overlayOpacity, {
                toValue: 0,
                tension: 100,
                friction: 8,
                useNativeDriver: true,
              }),
            ]).start(() => {
              resetSwipeAnimation()
            })
          }
        }
        break
    }
  }, [screen, isTransitioning])

  const resetSwipeAnimation = () => {
    setIsTransitioning(false)
    setPreviousScreen(null)
    swipeTranslateX.setValue(0)
    previousScreenOpacity.setValue(0)
    currentScreenOpacity.setValue(1)
    overlayOpacity.setValue(0)
  }

  const executeNavigation = (currentScreen) => {
    if (currentScreen === 'Main') {
      Alert.alert(
        'Log out?',
        'Swiping right on Home will log you out and return to the start screen.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log out', style: 'destructive', onPress: () => handleLogout() },
        ]
      );
      return;
    } else {
      const navigationActions = {
        AddCar: () => { try { AsyncStorage.setItem('lastActiveTab', 'profile'); } catch (_) {} setMainRouteParams({ initialTab: 'profile' }); setScreen('Main'); },
        EventDetails: () => { try { AsyncStorage.setItem('lastActiveTab', 'events'); } catch (_) {} setMainRouteParams({ initialTab: 'events' }); setScreen('Main'); },
        EventScreen: () => { try { AsyncStorage.setItem('lastActiveTab', 'events'); } catch (_) {} setMainRouteParams({ initialTab: 'events' }); setScreen('Main'); },
        UploadResult: () => { try { AsyncStorage.setItem('lastActiveTab', 'dashboard'); } catch (_) {} setMainRouteParams({ initialTab: 'dashboard' }); setScreen('Main'); },
        Profile: () => goBackToMain(),
        ChatInbox: () => goBackToMain(),
        ChatThread: () => goBackFromThread(),
        CarProfile: () => goBackToMain(),
        Subscription: () => goToMain(),
        Referal: () => { try { AsyncStorage.setItem('lastActiveTab', 'profile'); } catch (_) {} setMainRouteParams({ initialTab: 'profile' }); setScreen('Main'); },
      };

      const action = navigationActions[currentScreen];
      if (typeof action === 'function') {
        action();
      }
    }
  }

  // Helper functions for presence management
  const stopHeartbeat = () => {
    try { 
      if (heartbeatRef.current) { 
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null 
      } 
    } catch {}
  }

  const beatOnce = async (userId) => {
    try {
      if (!userId) return
      await supabase
        .from('user_profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', userId)
    } catch (e) { /* silent */ }
  }

  const startHeartbeat = (userId) => {
    stopHeartbeat()
    if (!userId) return
    beatOnce(userId)
    heartbeatRef.current = setInterval(() => beatOnce(userId), 25000)
  }

  const startPresence = async (user, profile) => {
    try {
      if (!user?.id) return
      if (presenceChannelRef.current) {
        try { presenceChannelRef.current.unsubscribe() } catch {}
      }
      const ch = supabase.channel('presence-users', { 
        config: { presence: { key: String(user.id) } } 
      })
      presenceChannelRef.current = ch
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.track({ username: profile?.username || '', ts: Date.now() })
        }
      })
    } catch (e) { 
      console.log('presence start error', e?.message) 
    }
  }

  // Toast management
  const hideToast = () => {
    try { 
      if (toastTimerRef.current) { 
        clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null 
      } 
    } catch {}
    setToast(t => ({ ...t, visible: false }))
  }

  const showToast = ({ title, message, conversationId, fromUserId }) => {
    setToast({ 
      visible: true, 
      title: title || 'New message', 
      message: message || '', 
      conversationId, 
      fromUserId 
    })
    try { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) } catch {}
    toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 5000)
  }

  // Navigation functions
  const handleLogout = () => {
    console.log('Logging out user...')
    logoutMutation.mutate()
  }

  const onAuthSuccess = (user, profile, hasActivePlan) => {
    authMutation.mutate({ user, profile, hasActivePlan })
  }

  const goToCarProfile = async (carData) => {
    if (!carData) {
      console.error('No car data provided to goToCarProfile')
      Alert.alert('Error', 'No car data available')
      return
    }

    const needsCompleteData = !carData.username && !carData.first_name && !carData.user_profiles && !carData.owner

    if (needsCompleteData && carData.id) {
      console.log('Fetching complete car data with owner info...')
      setLoadingCarProfile(true)
      
      try {
        carMutation.mutate({ 
          action: 'fetch', 
          carId: carData.id 
        })
      } finally {
        setLoadingCarProfile(false)
      }
    } else {
      console.log('Car data already complete, using directly')
      setSelectedCar(carData)
      setScreen('CarProfile')
    }
  }

  const handleCarDelete = async (carId) => {
    console.log('Delete car:', carId)
    carMutation.mutate({ 
      action: 'delete', 
      carId 
    })
  }

  // Navigation helper functions
  const goToAuth = (language) => {
    setSelectedLanguage(language)
    setScreen('Auth')
  }

  const goToHome = () => {
    setScreen('Home')
    queryClient.removeQueries({ queryKey: ['currentUser'] })
    setSelectedCar(null)
  }

  const goToSubscription = () => {
    setScreen('Subscription')
  }

  const goToMain = () => {
    try { if (typeof refetchUserStatus === 'function') refetchUserStatus() } catch (_) {}
    setScreen('Main')
  }

  const goToAddCar = () => {
    if (!hasActiveSubscription) {
      Alert.alert('Subscription', 'Feature available only with subscription')
      setScreen('Subscription')
      return
    }
    console.log('goToAddCar called - changing screen from', screen, 'to AddCar')
    setScreen('AddCar')
  }

  const goToAddEvent = () => {
    console.log('goToAddEvent called - changing screen from', screen, 'to EventDetails')
    setScreen('EventDetails')
  }

  const goToUploadResult = (params) => {
    const withLang = { ...params, selectedLanguage }
    setUploadParams(withLang)
    setScreen('UploadResult')
  }

  const goToEventScreen = (eventData) => {
    console.log('goToEventScreen called with event:', eventData?.title)
    setSelectedEvent(eventData)
    setScreen('EventScreen')
  }

  const goToProfile = async (profileParams) => {
    let targetUserId = profileParams?.userId || null
    let targetUsername = profileParams?.username || ''

    if (!targetUserId && targetUsername) {
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('id, username')
          .eq('username', targetUsername)
          .maybeSingle()
        if (!error && data?.id) {
          targetUserId = data.id
          targetUsername = data.username || targetUsername
        }
      } catch (_) {}
    }

    if (!targetUserId) {
      console.warn('goToProfile could not determine userId')
      return
    }

    if (currentUser?.id && String(currentUser.id) === String(targetUserId)) {
      try { AsyncStorage.setItem('lastActiveTab', 'profile'); } catch (_) {}
      setMainRouteParams({ initialTab: 'profile' })
      setScreen('Main')
      return
    }
    setSelectedProfile({ userId: targetUserId, username: targetUsername || '' })
    setScreen('Profile')
  }

  const goBackToMain = () => {
    console.log('goBackToMain called - changing screen from', screen, 'to Main')
    setScreen('Main')
    setSelectedCar(null)
  }

  const goToChatInbox = () => {
    setScreen('ChatInbox')
  }

  const goToChatThread = async (arg) => {
    if (!arg) return
    const conversationId = arg.conversationId || arg.id || arg.conversation_id || null
    let otherUser = arg.otherUser || arg.other_user || null
    
    if (!conversationId) {
      console.warn('[goToChatThread] missing conversationId from arg:', arg)
      return
    }

    if (otherUser?.id && !otherUser.username) {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username')
          .eq('id', otherUser.id)
          .maybeSingle()
        
        if (profile?.username) {
          otherUser = { ...otherUser, username: profile.username }
        }
      } catch (error) {
        console.warn('Error fetching username for chat thread:', error)
      }
    }

    setChatContext({ conversationId, otherUser })
    setScreen('ChatThread')
  }

  const goBackFromThread = async () => {
    try {
      if (chatContext?.conversationId) {
        await AsyncStorage.setItem(`chat:lastRead:${chatContext.conversationId}`, new Date().toISOString())
      }
    } catch (e) {}
    setScreen('ChatInbox')
    refetchUnreadCount()
  }

  const openChatWithUser = async ({ userId, initialMessage }) => {
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      console.log('[openChatWithUser] start userId=', userId, 'auth user=', user?.id, 'err=', userErr?.message)

      const convId = await chatService.getOrCreateConversation(userId)
      console.log('[openChatWithUser] got conversationId =', convId)
      
      if (initialMessage && initialMessage.trim()) {
        await chatService.sendMessage(convId, initialMessage.trim())
        console.log('[openChatWithUser] first message sent')
      }
      
      try {
        socket.emit('chat:start', { conversationId: convId, fromUserId: user?.id, toUserId: userId })
      } catch (e) {}
      
      let otherUser = null
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('id, username')
          .eq('id', userId)
          .maybeSingle()
        otherUser = data || null
      } catch (e) {}
      
      console.log('[openChatWithUser] navigating to ChatThread')
      goToChatThread({ conversationId: convId, otherUser })
      refetchUnreadCount()
    } catch (e) {
      console.warn('openChatWithUser error', e.message)
    }
  }

  const onSubscriptionSuccess = () => {
    console.log('Subscription successful, redirecting to main screen')
    goToMain()
  }

  const onNotificationSwipe = useCallback((event) => {
    try {
      const { translationY, velocityY, state } = event.nativeEvent
      
      if (state === 5) { // ENDED state
        if (translationY < -50 || velocityY < -500) {
          setShowNotifPanel(false)
        }
      }
    } catch (error) {
      console.log('Swipe handler error:', error)
    }
  }, [])

  // Render previous screen component for smooth transitions
  const renderPreviousScreen = () => {
    if (!previousScreen) return null

    const screenComponents = {
      Main: (
        <MainScreen
          route={{ params: mainRouteParams || {} }}
          selectedLanguage={selectedLanguage}
          setSelectedLanguage={setSelectedLanguage}
          user={currentUser}
          profile={currentUser?.profile}
          onLogout={handleLogout}
          goToAddCar={goToAddCar}
          goToCarProfile={goToCarProfile}
          goToAddEvent={goToAddEvent}
          goToEventScreen={goToEventScreen}
          goToUploadResult={goToUploadResult}
          goToProfile={goToProfile}
          goToChatInbox={goToChatInbox}
          chatUnreadTotal={chatUnreadTotal}
          refreshUnreadTotal={refreshUnreadTotal}
          isPreview={true}
          ensureSubscriptionFresh={ensureSubscriptionFresh}
        />
      ),
      ChatInbox: (
        <ChatInboxScreen
          navigation={{ goBack: goBackToMain }}
          goBack={goBackToMain}
          goToThread={goToChatThread}
        />
      ),
    }

    return screenComponents[previousScreen] || null
  }

  // Let each screen handle its own safe area; keep root container as plain View
  const Container = View

  // Splash screen while app is loading
  if (!appIsReady) {
    return (
      <View style={styles.splashContainer}>
        <Image
          source={require('./assets/logo.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <UnreadCountProvider>
        <Container style={{ flex: 1 }}>
          <StatusBar style="dark" />
          
          {/* Previous Screen Layer (for smooth transitions) */}
          {isTransitioning && previousScreen && (
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  opacity: previousScreenOpacity,
                  transform: [
                    {
                      translateX: swipeTranslateX.interpolate({
                        inputRange: [0, SCREEN_WIDTH],
                        outputRange: [-SCREEN_WIDTH * 0.3, 0],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
              pointerEvents="none"
            >
              {renderPreviousScreen()}
            </Animated.View>
          )}

          {/* Main Content Layer */}
          <PanGestureHandler
            onHandlerStateChange={handleSwipeGesture}
            onGestureEvent={handleSwipeGesture}
            shouldCancelWhenOutside={false}
            hitSlop={{ left: 0, width: 40 }}
            activeOffsetX={[-5, 10]}
            failOffsetY={[-15, 15]}
            enabled={true}
          >
            <Animated.View
              style={[
                { flex: 1 },
                {
                  opacity: currentScreenOpacity,
                  transform: [{ translateX: swipeTranslateX }],
                },
              ]}
            >
              {/* Dark overlay during transition */}
              <Animated.View
                style={[
                  StyleSheet.absoluteFillObject,
                  {
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    opacity: overlayOpacity,
                  },
                ]}
                pointerEvents="none"
              />

              {/* Keep MainScreen mounted to avoid remount-refresh on back navigation */}
              <View style={{ flex: 1, display: screen === 'Main' ? 'flex' : 'none' }}>
                <MainScreen
                  route={{ params: mainRouteParams || {} }}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                  user={currentUser}
                  profile={currentUser?.profile}
                  hasActiveSubscription={hasActiveSubscription}
                  ensureSubscriptionFresh={ensureSubscriptionFresh}
                  goToSubscription={goToSubscription}
                  navigation={{
                    navigate: (name, params) => {
                      if (name === 'Referal') {
                        setScreen('Referal')
                        return
                      }
                      if (name === 'ChatInboxScreen') {
                        setScreen('ChatInbox')
                        return
                      }
                    },
                    goBack: goBackToMain,
                  }}
                  onLogout={handleLogout}
                  goToAddCar={goToAddCar}
                  goToCarProfile={goToCarProfile}
                  goToAddEvent={goToAddEvent}
                  goToEventScreen={goToEventScreen}
                  goToUploadResult={goToUploadResult}
                  goToProfile={goToProfile}
                  goToChatInbox={goToChatInbox}
                  chatUnreadTotal={chatUnreadTotal}
                  refreshUnreadTotal={refreshUnreadTotal}
                />
              </View>

              {/* Floating Admin button for admin users on Main screen */}
              {screen === 'Main' && currentUser?.profile?.role === 'admin' && (
                <TouchableOpacity style={styles.adminFab} onPress={() => setScreen('Admin')}>
                  <Text style={styles.adminFabText}>Admin</Text>
                </TouchableOpacity>
              )}
              
              {/* New Global Notification System */}
              {notifications.length > 0 && showNotifPanel && (
                <Animated.View
                  pointerEvents={showNotifPanel ? 'auto' : 'none'}
                  style={[
                    styles.newToastWrap,
                    {
                      opacity: notifAnim,
                      transform: [
                        { 
                          translateY: notifAnim.interpolate({ 
                            inputRange: [0, 1], 
                            outputRange: [-100, 0] 
                          }) 
                        },
                      ],
                    },
                  ]}
                >
                  <PanGestureHandler 
                    onHandlerStateChange={onNotificationSwipe} 
                    onGestureEvent={onNotificationSwipe}
                    shouldCancelWhenOutside={false}
                  >
                    <Animated.View>
                      <TouchableOpacity
                        activeOpacity={0.95}
                        style={styles.newToast}
                        onPress={() => {
                          setShowNotifPanel(false)
                          const item = notifications[0]
                          if (item?.conversationId) {
                            goToChatThread({ 
                              conversationId: item.conversationId, 
                              otherUser: { id: item.fromUserId } 
                            })
                          }
                        }}
                      >
                        <View style={styles.newToastIcon}>
                          <Text style={{ color: '#fff', fontSize: 16 }}>💬</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.newToastUser}>@{notifications[0]?.username}</Text>
                          <Text style={styles.newToastMsg} numberOfLines={2}>
                            {notifications[0]?.content}
                          </Text>
                        </View>
                        <Text style={styles.newToastTime}>
                          {new Date(notifications[0]?.created_at || Date.now()).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </Text>
                        <TouchableOpacity
                          style={styles.newToastClose}
                          onPress={(e) => {
                            e.stopPropagation()
                            setShowNotifPanel(false)
                          }}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={{ color: '#666', fontSize: 14, fontWeight: '600' }}>✕</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </Animated.View>
                  </PanGestureHandler>
                </Animated.View>
              )}

              {/* Original Toast (kept as fallback) */}
              {toast.visible && (
                <View style={styles.toastWrap} pointerEvents="box-none">
                  <View style={styles.toast}>
                    <View style={styles.toastIcon}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>✉️</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.toastUser}>{toast.title}</Text>
                      <Text style={styles.toastMsg} numberOfLines={2}>{toast.message}</Text>
                    </View>
                    <Text style={styles.toastTime}>now</Text>
                    <TouchableOpacity style={styles.toastClose} onPress={hideToast}>
                      <Text>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, marginRight: 16 }}>
                    <TouchableOpacity
                      onPress={() => {
                        hideToast()
                        if (toast.conversationId) {
                          goToChatThread({ conversationId: toast.conversationId, otherUser: { id: toast.fromUserId } })
                        }
                      }}
                      style={{ backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Open</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
              {screen === 'Home' && (
                <HomeScreen
                  goToAuth={goToAuth}
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                />
              )}
              
              {screen === 'Auth' && (
                <AuthScreen
                  goToHome={goToHome}
                  selectedLanguage={selectedLanguage}
                  onAuthSuccess={onAuthSuccess}
                />
              )}
              
              {screen === 'Subscription' && (
                <SubscriptionScreen
                  userId={currentUser?.id}
                  goToHome={goToHome}
                  goToMain={() => {
                    goBackToMain()
                    setTimeout(refetchUserStatus, 500)
                  }}
                  refetchUserStatus={refetchUserStatus}
                  selectedLanguage={selectedLanguage}
                />
              )}
              {screen === 'AddCar' && (
                <AddCarScreen
                  goBackToMain={goBackToMain}
                  selectedLanguage={selectedLanguage}
                  userId={currentUser?.id}
                />
              )}

              {screen === 'EventDetails' && (
                <EventDetailsScreen
                  goBackToMain={goBackToMain}
                  selectedLanguage={selectedLanguage}
                  userId={currentUser?.id}
                />
              )}
              
              {screen === 'EventScreen' && selectedEvent && (
                <EventScreen
                  route={{ params: { event: selectedEvent } }}
                  navigation={{ goBack: goBackToMain }}
                  currentUser={currentUser}
                  selectedLanguage={selectedLanguage}
                  goToProfile={goToProfile}
                />
              )}

              {screen === 'UploadResult' && (
                <UploadResultScreen
                  route={{ params: uploadParams || {} }}
                  navigation={{ goBack: goBackToMain }}
                  selectedLanguage={selectedLanguage}
                />
              )}

              {screen === 'Profile' && selectedProfile && (
                <ProfileScreen
                  route={{ params: { userId: selectedProfile.userId, username: selectedProfile.username } }}
                  navigation={{ goBack: goBackToMain }}
                  selectedLanguage={selectedLanguage}
                  currentUser={currentUser}
                  goToCarProfile={goToCarProfile}
                />
              )}

              {screen === 'ChatInbox' && (
                <ChatInboxScreen
                  navigation={{ goBack: goBackToMain }}
                  goBack={goBackToMain}
                  goToThread={goToChatThread}
                />
              )}

              {screen === 'ChatThread' && chatContext?.conversationId && (
                <ChatThreadScreen
                  conversationId={chatContext.conversationId}
                  otherUser={chatContext.otherUser}
                  navigation={{ goBack: goBackFromThread }}
                  goBack={goBackFromThread}
                  goToProfile={goToProfile}
                />
              )}

              {screen === 'CarProfile' && (
                loadingCarProfile ? (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text>Loading car details...</Text>
                  </View>
                ) : selectedCar ? (
                  <CarProfileScreen
                    goBackToMain={goBackToMain}
                    selectedLanguage={selectedLanguage}
                    carData={selectedCar}
                    userId={currentUser?.id}
                    user={currentUser}
                    profile={currentUser?.profile}
                    isOwner={selectedCar?.user_id === currentUser?.id}
                    onDelete={handleCarDelete}
                    goToProfile={goToProfile}
                    openChatWithUser={openChatWithUser}
                    hasActiveSubscription={hasActiveSubscription}
                    goToSubscription={goToSubscription}
                  />
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text>No car data available</Text>
                    <TouchableOpacity onPress={goBackToMain} style={{ marginTop: 20, padding: 10, backgroundColor: '#ddd' }}>
                      <Text>Go Back</Text>
                    </TouchableOpacity>
                  </View>
                )
              )}

              {screen === 'Referal' && (
                <ReferalScreen onClose={goBackToMain} selectedLanguage={selectedLanguage} />
              )}

              {screen === 'Admin' && (
                <AdminScreen onBack={goBackToMain} />
              )}
            </Animated.View>
          </PanGestureHandler>
        </Container>
      </UnreadCountProvider>
    </GestureHandlerRootView>
  )
}


const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 200,
    height: 200,
  },
  // Original toast styles (kept as fallback)
  toastWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 16,
    paddingTop: 16,
    pointerEvents: 'box-none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  toastIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toastUser: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  toastMsg: {
    fontSize: 13,
    color: '#666',
    lineHeight: 16,
  },
  toastTime: {
    fontSize: 11,
    color: '#999',
    marginHorizontal: 8,
  },
  toastClose: {
    padding: 4,
  },
  // New notification styles
  newToastWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2000,
    paddingTop: 60,
  },
  newToast: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#000',
    minHeight: 70,
  },
  newToastIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  newToastUser: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  newToastMsg: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    flex: 1,
  },
  newToastTime: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
    marginLeft: 8,
  },
  newToastClose: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  adminFab: {
    position: 'absolute',
    right: 20,
    bottom: 30,
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  adminFabText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
})