import { supabase } from './supabaseClient'

export async function getMyUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user?.id
}

// One-time presence snapshot helper (returns empty set; rely on subscription to fill live data)
export async function getOnlinePresenceSet() {
  // Presence state requires an active channel; we do not persist a channel here
  // Return empty set; the calling screen should subscribe via subscribeToPresenceUsers
  return new Set()
}

// Subscribe to global presence for the current user key
export function subscribeToPresenceUsers(myId, onSync) {
  if (!myId) return null
  const presenceChannel = supabase.channel('presence-users', {
    config: { presence: { key: String(myId) } },
  })
  const handler = () => {
    try {
      const state = presenceChannel.presenceState()
      if (onSync) onSync(new Set(Object.keys(state)))
    } catch (_) {}
  }
  presenceChannel
    .on('presence', { event: 'sync' }, handler)
    .on('presence', { event: 'join' }, handler)
    .on('presence', { event: 'leave' }, handler)
    .subscribe((status) => { if (status === 'SUBSCRIBED') handler() })
  return presenceChannel
}

// Fetch presence fields for a list of users (last_seen_at, threshold)
export async function getUsersPresence(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return {}
  const { data, error } = await supabase
    .from('user_profiles')
    // before: .select('id, last_seen_at, online_threshold_seconds')
.select('id, last_seen_at, online_threshold_seconds, is_online')
    .in('id', userIds)
  if (error) throw error
  const map = {}
  ;(data || []).forEach((row) => {
    map[row.id] = {
      last_seen_at: row.last_seen_at,
  threshold: row.online_threshold_seconds || 45,
  is_online: !!row.is_online,
    }
  })
  return map
}

// Subscribe to "inbox-live" database changes for inbox view
export function subscribeToInboxLive({
  onMessageInsert,
  onMessageUpdate,
  onConversationUpdate,
  onUserProfileUpdate,
} = {}) {
  const ch = supabase
    .channel('inbox-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      if (onMessageInsert) onMessageInsert(payload?.new)
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
      if (onMessageUpdate) onMessageUpdate(payload?.new)
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, (payload) => {
      if (onConversationUpdate) onConversationUpdate(payload?.new)
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_profiles' }, (payload) => {
      if (onUserProfileUpdate) onUserProfileUpdate(payload?.new)
    })
    .subscribe()
  return ch
}

// Subscribe to thread messages (insert+update) on a simple channel name
export function subscribeToThreadMessages(conversationId, { onInsert, onUpdate } = {}) {
  const ch = supabase
    .channel(`thread-${conversationId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
      if (onInsert) onInsert(payload.new)
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`
    }, (payload) => {
      if (onUpdate) onUpdate(payload.new)
    })
    .subscribe()
  return ch
}

// Subscribe to conversation deletions affecting this thread
export function subscribeToConversationMonitor(conversationId, { onParticipantDelete, onConversationDelete } = {}) {
  const ch = supabase
    .channel(`conversation-monitor-${conversationId}`)
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'conversation_participants',
      filter: `conversation_id=eq.${conversationId}`
    }, () => {
      if (onParticipantDelete) onParticipantDelete()
    })
    .on('postgres_changes', {
      event: 'DELETE',
      schema: 'public',
      table: 'conversations',
      filter: `id=eq.${conversationId}`
    }, () => {
      if (onConversationDelete) onConversationDelete()
    })
    .subscribe()
  return ch
}

// Subscribe to peer last_seen changes
export function subscribeToPeerLastSeen(peerId, callback) {
  if (!peerId) return null
  const ch = supabase
    .channel(`presence-lastseen-${peerId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'user_profiles',
      filter: `id=eq.${peerId}`,
    }, (payload) => {
      if (callback) callback(payload.new)
    })
    .subscribe()
  return ch
}

// Upload an image to Supabase Storage (bucket: chat-uploads) and return its storage path
export async function uploadChatImageAsync(conversationId, fileUri, contentType = 'image/jpeg') {
  if (!conversationId) throw new Error('conversationId is required')
  if (!fileUri) throw new Error('fileUri is required')
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')

  // Create a unique path: chat-uploads/{conversationId}/{timestamp}-{rand}.ext
  const extGuess = fileUri.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() || 'jpg'
  const fileName = `${Date.now()}-${Math.floor(Math.random()*1e6)}.${extGuess}`
  const path = `${conversationId}/${fileName}`

  // React Native/Expo: use arrayBuffer rather than blob
  const res = await fetch(fileUri)
  const bytes = await res.arrayBuffer()

  const { data, error } = await supabase
    .storage
    .from('chat-uploads')
    .upload(path, bytes, { contentType: contentType || 'image/jpeg', upsert: false })
  if (error) throw error
  return data?.path || path
}

// Create a signed URL for a stored image path (works for private buckets)
export async function getSignedImageUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase
    .storage
    .from('chat-uploads')
    .createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data?.signedUrl || null
}

export function getPublicImageUrl(path) {
  const { data } = supabase
    .storage
    .from('chat-uploads')
    .getPublicUrl(path)
  return data?.publicUrl || null
}

// Send an image message by storing JSON in the content field
export async function sendImageMessage(conversationId, { path, width = null, height = null, mime = 'image/jpeg' }) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')
  if (!conversationId) throw new Error('conversationId is required')
  if (!path) throw new Error('image path is required')

  const payload = {
    type: 'image',
    path,
    width,
    height,
    mime,
  }

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: myId,
      content: JSON.stringify(payload),
      is_read: false,
    })
    .select('*')
    .single()
  if (error) throw error

  // Update conversation summary
  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_text: '[image]'
    })
    .eq('id', conversationId)

  return msg
}

// Find an existing 1:1 conversation between me and otherUserId
async function findDirectConversation(otherUserId) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')

  const { data: myConvs, error: e1 } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', myId)
  if (e1) throw e1

  const convIds = (myConvs || []).map(r => r.conversation_id)
  if (convIds.length === 0) return null

  const { data: both, error: e2 } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .in('conversation_id', convIds)
    .eq('user_id', otherUserId)
  if (e2) throw e2

  const found = (both || [])[0]?.conversation_id || null
  return found
}

export async function startDirectConversation(otherUserId, initialMessage) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')
  if (!otherUserId) throw new Error('otherUserId is required')

  const existing = await findDirectConversation(otherUserId)
  if (existing) {
    if (initialMessage && initialMessage.trim()) {
      await sendMessage(existing, initialMessage.trim())
    }
    return existing
  }

  const { data: convId, error: rpcErr } = await supabase.rpc('start_direct_conversation', {
    p_other_user: otherUserId,
    p_initial_message: (initialMessage || '').trim() || null,
  })
  if (rpcErr) throw rpcErr
  return convId
}

export async function getOrCreateConversation(otherUserId) {
  return startDirectConversation(otherUserId, null)
}

export async function sendMessage(conversationId, content) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')
  if (!conversationId) throw new Error('conversationId is required')
  if (!content || !content.trim()) return null

  const { data: msg, error } = await supabase
    .from('messages')
    .insert({ 
      conversation_id: conversationId, 
      sender_id: myId, 
      content: content.trim(),
      is_read: false // New messages start as unread
    })
    .select('*')
    .single()
  if (error) throw error

  // Update conversation last message summary
  await supabase
    .from('conversations')
    .update({ 
      last_message_at: new Date().toISOString(), 
      last_message_text: content.trim()
    })
    .eq('id', conversationId)

  console.log('[chatService] Sent message to conversation:', conversationId)
  return msg
}

export async function listMessages(conversationId, limit = 200) {
  if (!conversationId) throw new Error('conversationId is required')
  
  const { data, error } = await supabase
    .from('messages')
    .select(`
      *,
      sender:user_profiles!messages_sender_id_fkey(id, username)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  
  if (error) throw error
  console.log('[chatService] listMessages fetched', (data||[]).length, 'messages for', conversationId)
  return data || []
}

export async function markMessagesAsRead(conversationId) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')
  if (!conversationId) throw new Error('conversationId is required')

  try {
    const { error } = await supabase.rpc('mark_messages_as_read', {
      p_conversation_id: conversationId,
      p_user_id: myId
    })
    if (error) throw error
    console.log('[chatService] Marked messages as read for conversation:', conversationId)
    return true
  } catch (e) {
    console.warn('[chatService] Error marking messages as read:', e.message)
    throw e
  }
}

export async function getUnreadCount(conversationId) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')
  if (!conversationId) throw new Error('conversationId is required')

  try {
    const { data, error } = await supabase.rpc('get_unread_count', {
      p_conversation_id: conversationId,
      p_user_id: myId
    })
    if (error) throw error
    return data || 0
  } catch (e) {
    console.warn('[chatService] Error getting unread count:', e.message)
    return 0
  }
}

export async function getTotalUnreadCount() {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')

  try {
    // Get all my conversations and sum unread counts
    const conversations = await listConversations()
    let total = 0
    for (const conv of conversations) {
      total += conv.unread_count || 0
    }
    return total
  } catch (e) {
    console.warn('[chatService] Error getting total unread count:', e.message)
    return 0
  }
}

export async function deleteConversation(conversationId) {
  if (!conversationId) throw new Error('conversationId is required')
  const { data, error } = await supabase.rpc('delete_conversation_if_member', {
    p_conversation_id: conversationId,
  })
  if (error) throw error
  return true
}

export async function deleteAllMessages(conversationId) {
  if (!conversationId) throw new Error('conversationId is required')
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('conversation_id', conversationId)
  if (error) throw error
  console.log('[chatService] deleted all messages for', conversationId)
  return true
}

export async function listConversations() {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')

  try {
    const { data, error } = await supabase.rpc('list_conversations_with_unread', {
      p_user_id: myId
    })
    if (error) throw error

    return (data || []).map(conv => ({
      id: conv.id,
      is_group: conv.is_group,
      created_at: conv.created_at,
      last_message_at: conv.last_message_at,
      last_message_text: conv.last_message_text,
      unread_count: conv.unread_count || 0,
      otherUserId: conv.other_user_id,
      otherUser: conv.other_user_id ? {
        id: conv.other_user_id,
        username: conv.other_username
      } : null
    }))
  } catch (e) {
    console.warn('[chatService] Error listing conversations:', e.message)
    return []
  }
}

// Participants for a conversation
export async function getConversationParticipants(conversationId) {
  if (!conversationId) throw new Error('conversationId is required')
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
  if (error) throw error
  return data || []
}

// Fetch minimal user profiles by a list of ids
export async function getUserProfilesByIds(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return []
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, username')
    .in('id', userIds)
  if (error) throw error
  return data || []
}

// Fetch a single user's presence fields
export async function getPeerProfile(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, last_seen_at, online_threshold_seconds, is_online')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

// Check if the current user is still a member of the conversation
export async function checkConversationExists(conversationId) {
  const myId = await getMyUserId()
  if (!myId) throw new Error('Not authenticated')
  if (!conversationId) return true
  const { data, error } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', myId)
    .maybeSingle()
  if (error) {
    console.warn('[chatService] checkConversationExists error:', error.message)
    return false
  }
  return !!data
}

// Real-time subscription helpers
export function subscribeToConversationUpdates(callback) {
  const myUserId = getMyUserId()
  
  return supabase
    .channel('conversations')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'messages'
      },
      (payload) => {
        console.log('[chatService] Message update:', payload)
        if (callback) callback(payload)
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations'
      },
      (payload) => {
        console.log('[chatService] Conversation update:', payload)
        if (callback) callback(payload)
      }
    )
    .subscribe()
}

export function subscribeToMessageUpdates(conversationId, callback) {
  return supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        console.log('[chatService] New message:', payload.new)
        if (callback) callback(payload.new)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      (payload) => {
        console.log('[chatService] Message updated:', payload.new)
        if (callback) callback(payload.new)
      }
    )
    .subscribe()
}

export default {
  getOrCreateConversation,
  sendMessage,
  sendImageMessage,
  listMessages,
  listConversations,
  markMessagesAsRead,
  getUnreadCount,
  getTotalUnreadCount,
  subscribeToConversationUpdates,
  subscribeToMessageUpdates,
  uploadChatImageAsync,
  getSignedImageUrl,
  getPublicImageUrl,
}