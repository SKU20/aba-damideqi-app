const express = require('express');
const authMiddleware = require('../middleware/auth');
const { hasActiveSubscription } = require('../middleware/subscription');

const router = express.Router();

// GET /api/user/status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[UserStatus] Checking subscription for user: ${userId}`);
    
    const active = await hasActiveSubscription(userId);
    console.log(`[UserStatus] hasActiveSubscription result:`, active, `(type: ${typeof active})`);
    
    const hasActiveSub = !!active;
    console.log(`[UserStatus] !!active conversion:`, hasActiveSub);

    // Get detailed subscription data like the backend logs show
    const { supabase } = require('../config/supabase');
    let subscriptionDetails = null;
    
    if (hasActiveSub) {
      try {
        const nowIso = new Date().toISOString();
        console.log(`[UserStatus] Fetching detailed subscription for user: ${userId}`);
        
        const { data: subscription, error } = await supabase
          .from('user_subscriptions')
          .select('id, status, end_date, created_at')
          .eq('user_id', userId)
          .in('status', ['active', 'trial'])
          .or(`end_date.is.null,end_date.gte.${nowIso}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
          
        console.log(`[UserStatus] Detailed subscription query result:`, { data: subscription, error });
          
        if (!error && subscription) {
          subscriptionDetails = subscription;
          console.log(`[UserStatus] ✅ Detailed subscription data:`, subscriptionDetails);
        } else {
          console.log(`[UserStatus] ❌ No subscription details found:`, error);
        }
      } catch (detailError) {
        console.warn(`[UserStatus] Could not fetch subscription details:`, detailError);
      }
    }

    const result = {
      success: true,
      data: {
        hasActiveSubscription: hasActiveSub,
        subscription: subscriptionDetails
      }
    };
    
    console.log(`[UserStatus] Returning response with details:`, result);
    return res.json(result);
  } catch (error) {
    console.error('GET /api/user/status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch user status' });
  }
});

module.exports = router;
