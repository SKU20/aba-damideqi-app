const { supabaseAdmin } = require('../config/supabase');
const { sendExpoPushAsync } = require('./expoPush');

/**
 * Initialize a Supabase realtime listener for new messages and send Expo push
 * notifications to other conversation participants.
 */
function initMessagePushListener() {
  try {
    const channel = supabaseAdmin
      .channel('server-message-push')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, async (payload) => {
        try {
          const msg = payload?.new;
          if (!msg || !msg.conversation_id || !msg.sender_id) return;

          // Fetch participants in the conversation except the sender
          const { data: participants, error: partErr } = await supabaseAdmin
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', msg.conversation_id);
          if (partErr) throw partErr;

          const recipientIds = (participants || [])
            .map((r) => r.user_id)
            .filter((uid) => String(uid) !== String(msg.sender_id));
          if (recipientIds.length === 0) return;

          // Fetch push tokens and usernames of recipients
          const { data: profiles, error: profErr } = await supabaseAdmin
            .from('user_profiles')
            .select('id, username, push_token')
            .in('id', recipientIds);
          if (profErr) throw profErr;

          // Sender username for notification body (best-effort)
          let senderUsername = 'New message';
          try {
            const { data: senderProf } = await supabaseAdmin
              .from('user_profiles')
              .select('username')
              .eq('id', msg.sender_id)
              .maybeSingle();
            if (senderProf?.username) senderUsername = senderProf.username;
          } catch (_) {}

          const plainText = (() => {
            try {
              // Support image messages (JSON) and plain text
              if (typeof msg.content === 'string' && msg.content.trim().startsWith('{')) {
                const parsed = JSON.parse(msg.content);
                if (parsed?.type === 'image') return '[image]';
              }
              return (msg.content || '').toString().slice(0, 120);
            } catch { return (msg.content || '').toString().slice(0, 120); }
          })();

          const payloads = [];
          for (const p of profiles || []) {
            const token = p?.push_token;
            if (!token) continue;
            payloads.push({
              to: token,
              title: 'New message',
              body: `${senderUsername}: ${plainText}`.trim(),
              channelId: 'default',
              data: {
                type: 'chat',
                conversationId: msg.conversation_id,
                senderId: msg.sender_id,
              },
            });
          }

          if (payloads.length > 0) {
            const res = await sendExpoPushAsync(payloads);
            if (res?.data) {
              // Clean up stale tokens
              for (let i = 0; i < res.data.length; i++) {
                const r = res.data[i];
                if (r?.status === 'error' && r.details?.error === 'DeviceNotRegistered') {
                  const badUserId = profiles[i]?.id;
                  if (badUserId) {
                    try {
                      await supabaseAdmin.from('user_profiles').update({ push_token: null }).eq('id', badUserId);
                    } catch (_) {}
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('[push] onMessage handler error:', err?.message || err);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[push] Message push listener subscribed');
        }
      });

    return channel;
  } catch (e) {
    console.error('[push] initMessagePushListener failed:', e?.message || e);
    return null;
  }
}

module.exports = { initMessagePushListener };
