const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const router = express.Router();


// POST /api/subscriptions - Create a new user subscription
router.post('/', async (req, res) => {
  
  try {
    const { user_id, plan_id } = req.body;
    
    // Validation
    if (!user_id || !plan_id) {
      return res.status(400).json({
        success: false,
        error: 'user_id and plan_id are required'
      });
    }

    const { data: planData, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .single();

    if (planError || !planData) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }

    const { data: existingSubscription, error: checkError } = await supabaseAdmin
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user_id)
      .in('status', ['active', 'trial'])
      .single();

    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        error: 'User already has an active subscription'
      });
    }
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now
    
    // Next payment date is after trial ends
    const nextPaymentDate = new Date(trialEndDate);
    
    // End date based on plan duration (after trial)
    const endDate = new Date(trialEndDate);
    endDate.setMonth(endDate.getMonth() + planData.duration_months);

    // Create the subscription record - STATUS SHOULD BE 'active' not 'trial'
    const subscriptionData = {
      user_id: user_id,
      plan_id: plan_id,
      start_date: now.toISOString(),
      trial_end_date: trialEndDate.toISOString(),
      next_payment_date: nextPaymentDate.toISOString(),
      end_date: endDate.toISOString(),
      status: 'active', 
      is_auto_renew: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    };

    const { data: subscription, error: insertError } = await supabaseAdmin
      .from('user_subscriptions')
      .insert([subscriptionData])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Subscription creation error:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create subscription',
        details: insertError.message
      });
    }

    // Return success response with subscription details
    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        status: subscription.status,
        trial_end_date: subscription.trial_end_date,
        next_payment_date: subscription.next_payment_date,
        end_date: subscription.end_date,
        plan_details: planData
      }
    });

  } catch (error) {
    console.error('Subscription creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// GET /api/subscriptions/:userId - Get user's current subscription
router.get('/:userId', async (req, res) => {
  
  try {
    const { userId } = req.params;

    const { data: subscription, error } = await supabaseAdmin
      .from('user_subscriptions')
      .select(`
        *,
        subscription_plans (
          id,
          name_en,
          name_ka,
          description_en,
          description_ka,
          price_gel,
          duration_months
        )
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Get subscription error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch subscription'
      });
    }

    res.status(200).json({
      success: true,
      subscription: subscription || null
    });

  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// router.put('/:subscriptionId/cancel', async (req, res) => {
  
//   try {
//     const { subscriptionId } = req.params;
//     const { cancel_reason } = req.body;

//     const { data: subscription, error } = await supabaseAdmin
//       .from('user_subscriptions')
//       .update({
//         status: 'cancelled',
//         cancel_reason: cancel_reason || 'User requested cancellation',
//         is_auto_renew: false,
//         updated_at: new Date().toISOString()
//       })
//       .eq('id', subscriptionId)
//       .select()
//       .single();

//     if (error) {
//       console.error('Cancel subscription error:', error);
//       return res.status(500).json({
//         success: false,
//         error: 'Failed to cancel subscription'
//       });
//     }

//     res.status(200).json({
//       success: true,
//       message: 'Subscription cancelled successfully',
//       subscription
//     });

//   } catch (error) {
//     console.error('Cancel subscription error:', error);
//     res.status(500).json({
//       success: false,
//       error: 'Internal server error'
//     });
//   }
// });

module.exports = router;