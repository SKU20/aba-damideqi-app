// src/services/notificationService.js
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabaseClient'
import socket from './socket'

class NotificationService {
  constructor() {
    this.messageChannelRef = null
    this.pushTokenRef = null
    this.myUserIdRef = null
    this.currentScreen = null
    this.currentChatContext = null
    
    // Callbacks that will be set by the app
    this.onNewNotification = null
    this.onShowNotificationPanel = null
    this.onUpdateUnreadCount = null
    this.onShowToast = null
    this.onRefreshUnreadTotal = null
  }

  // Initialize notification service with callbacks
  initialize(callbacks) {
    this.onNewNotification = callbacks.onNewNotification
    this.onShowNotificationPanel = callbacks.onShowNotificationPanel
    this.onUpdateUnreadCount = callbacks.onUpdateUnreadCount
    this.onShowToast = callbacks.onShowToast
    this.onRefreshUnreadTotal = callbacks.onRefreshUnreadTotal

    // Set up notification handler
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false
      })
    })

    // Set Android notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      })
    }
  }

  // Update current app state (screen and chat context)
  updateAppState(screen, chatContext) {
    this.currentScreen = screen
    this.currentChatContext = chatContext
  }

  // Register for push notifications
  async registerForPushNotifications(userId) {
    try {
      // Skip in Expo Go
      const isExpoGo = Constants?.appOwnership === 'expo'
      if (isExpoGo) {
        console.warn('[push] Skipping push token registration in Expo Go. Use a dev or production build.')
        return null
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }

      if (finalStatus !== 'granted') {
        console.warn('[push] Permission not granted')
        return null
      }

      // Get the Expo push token
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId
      const tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync()

      const token = tokenData?.data || null
      this.pushTokenRef = token

      if (token && userId) {
        // Save token to profile
        try {
          await supabase
            .from('user_profiles')
            .update({ push_token: token })
            .eq('id', userId)
          console.log('[push] Token saved to profile')
        } catch (error) {
          console.error('[push] Error saving token:', error)
        }
      }

      return token
    } catch (error) {
      console.error('[push] Error registering for push notifications:', error)
      return null
    }
  }

  // Start message subscription for real-time notifications
  startMessageSubscription(user) {
    if (!user?.id) return
    this.myUserIdRef = user.id

    try {
      if (this.messageChannelRef) {
        try { 
          this.messageChannelRef.unsubscribe() 
        } catch {}
      }

      console.log('[notification] Starting message subscription for user:', user.id)

      const channel = supabase
        .channel('rt-messages-notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        }, async (payload) => {
          await this.handleNewMessage(payload, user)
        })
        .subscribe()

      this.messageChannelRef = channel
    } catch (error) {
      console.error('[notification] Error setting up message subscription:', error)
    }
  }

  // Handle new message from real-time subscription
  async handleNewMessage(payload, user) {
    try {
      const msg = payload?.new || {}
      console.log('[notification] New message:', {
        id: msg?.id,
        conv: msg?.conversation_id,
        sender: msg?.sender_id
      })

      if (!msg?.conversation_id || !msg?.sender_id) return

      // Skip own messages
      if (String(msg.sender_id) === String(user.id)) {
        console.log('[notification] Skipping own message')
        return
      }

      // Skip if currently in the same chat thread
      if (this.currentScreen === 'ChatThread' && 
          this.currentChatContext?.conversationId === msg.conversation_id) {
        console.log('[notification] Skipping - currently in this chat thread')
        return
      }

      // Skip notifications on Home or Auth screens
      if (this.currentScreen === 'Home' || this.currentScreen === 'Auth') {
        console.log('[notification] Skipping - on Home/Auth screen')
        return
      }

      // Verify user is member of conversation
      const isMember = await this.verifyConversationMembership(msg.conversation_id, user.id)
      if (!isMember) {
        console.log('[notification] User not member of conversation, skipping')
        return
      }

      // Get sender information
      const senderInfo = await this.getSenderInfo(msg.sender_id)
      
      // Parse message content
      const messagePreview = this.parseMessageContent(msg.content)

      // Create notification object
      const notification = {
        id: msg.id,
        conversationId: msg.conversation_id,
        fromUserId: msg.sender_id,
        username: senderInfo.username,
        content: messagePreview,
        created_at: msg.created_at || new Date().toISOString()
      }

      console.log('[notification] Creating notification:', notification)

      // Trigger callbacks
      if (this.onNewNotification) {
        this.onNewNotification(notification)
      }

      if (this.onUpdateUnreadCount) {
        this.onUpdateUnreadCount()
      }

      if (this.onShowNotificationPanel) {
        this.onShowNotificationPanel(true)
      }

      if (this.onRefreshUnreadTotal) {
        this.onRefreshUnreadTotal()
      }

      // Optional: Show toast notification as fallback (disabled to avoid duplicates)
      // if (this.onShowToast) {
      //   this.onShowToast({
      //     title: `@${senderInfo.username}`,
      //     message: messagePreview,
      //     conversationId: msg.conversation_id,
      //     fromUserId: msg.sender_id
      //   })
      // }

    } catch (error) {
      console.error('[notification] Error handling new message:', error)
    }
  }

  // Verify if user is member of conversation
  async verifyConversationMembership(conversationId, userId) {
    try {
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)

      return Array.isArray(participants) && 
             participants.some(p => String(p.user_id) === String(userId))
    } catch (error) {
      console.error('[notification] Error verifying membership:', error)
      return false
    }
  }

  // Get sender information
  async getSenderInfo(senderId) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('username')
        .eq('id', senderId)
        .maybeSingle()

      return {
        username: profile?.username || 'user'
      }
    } catch (error) {
      console.error('[notification] Error getting sender info:', error)
      return { username: 'user' }
    }
  }

  // Parse message content for preview
  parseMessageContent(content) {
    try {
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content)
          if (parsed?.type === 'image') {
            return parsed?.caption ? `📷 ${parsed.caption}` : '📷 Image'
          } else {
            return content
          }
        } catch {
          return content
        }
      }
      return content || ''
    } catch (error) {
      console.error('[notification] Error parsing message content:', error)
      return ''
    }
  }

  // Stop message subscription
  stopMessageSubscription() {
    try {
      if (this.messageChannelRef) {
        this.messageChannelRef.unsubscribe()
        this.messageChannelRef = null
        console.log('[notification] Message subscription stopped')
      }
    } catch (error) {
      console.error('[notification] Error stopping message subscription:', error)
    }
  }

  // Set up notification response handlers
  setupNotificationHandlers(callbacks) {
    try {
      // Handle notification taps
      const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response?.notification?.request?.content?.data || {}
          const convId = data?.conversationId
          const senderId = data?.senderId

          if (convId && callbacks.onNotificationTap) {
            callbacks.onNotificationTap({
              conversationId: convId,
              senderId
            })
          }
        } catch (error) {
          console.error('[notification] Error handling notification response:', error)
        }
      })

      // Handle foreground notifications
      const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[notification] Foreground notification received:', notification)
        // Can add additional foreground handling here if needed
      })

      return {
        responseSubscription,
        receivedSubscription
      }
    } catch (error) {
      console.error('[notification] Error setting up notification handlers:', error)
      return null
    }
  }

  // Clean up all subscriptions
  cleanup() {
    this.stopMessageSubscription()
    this.myUserIdRef = null
    this.pushTokenRef = null
    this.currentScreen = null
    this.currentChatContext = null
    
    // Clear callbacks
    this.onNewNotification = null
    this.onShowNotificationPanel = null
    this.onUpdateUnreadCount = null
    this.onShowToast = null
    this.onRefreshUnreadTotal = null
  }
}

// Export singleton instance
export default new NotificationService()