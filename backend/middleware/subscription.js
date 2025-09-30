const { supabaseAdmin } = require('../config/supabase');

async function hasActiveSubscription(userId) {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select('id, status, end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .or(`end_date.is.null,end_date.gte.${nowIso}`)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch (_) {
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
