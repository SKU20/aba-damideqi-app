const supabaseAdmin = require('../config/supabaseAdmin');

async function hasActiveSubscription(userId) {
  try {
    const nowIso = new Date().toISOString();
    
    // First, let's see ALL subscriptions for this user for debugging
    const { data: allSubs, error: allError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id, status, end_date, created_at')
      .eq('user_id', userId);
    
    console.log(`[Subscription] User ${userId} has subscriptions:`, allSubs);
    
    // Now check for active subscriptions (including trial)
    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id, status, end_date')
      .eq('user_id', userId)
      .in('status', ['active', 'trial']) // Include both active and trial
      .or(`end_date.is.null,end_date.gte.${nowIso}`)
      .limit(1)
      .maybeSingle();
      
    console.log(`[Subscription] Active/trial check for user ${userId}:`, { data, error });
    
    if (error) return false;
    return !!data;
  } catch (error) {
    console.error('[Subscription] Error checking subscription:', error);
    return false;
  }
}

module.exports = {
  hasActiveSubscription,
  requireSubscription: async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      const ok = await hasActiveSubscription(req.user.id);
      if (!ok) {
        return res.status(402).json({ success: false, error: 'subscription_required' });
      }
      return next();
    } catch (e) {
      return res.status(500).json({ success: false, error: 'subscription_check_failed' });
    }
  }
};
