const express = require('express');
const authMiddleware = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabase');

const router = express.Router();

function genReferralCode() {
  // 3 uppercase letters + 2 digits, e.g., ABC12
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const numbers = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${letters}${numbers}`;
}

async function getOrCreateUniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = genReferralCode();
    const { data, error } = await supabaseAdmin.from('user_profiles').select('id').eq('referral_code', code).maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error('Could not generate unique referral code');
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Ensure user has a referral code
    let { data: profile, error: pErr } = await supabaseAdmin
      .from('user_profiles')
      .select('id, referral_code')
      .eq('id', userId)
      .single();
    if (pErr && pErr.code !== 'PGRST116') throw pErr;

    if (!profile || !profile.referral_code) {
      const newCode = await getOrCreateUniqueCode();
      const up = await supabaseAdmin.from('user_profiles').update({ referral_code: newCode }).eq('id', userId).select('id, referral_code').single();
      if (up.error) throw up.error;
      profile = up.data;
    }

    // Fetch all invitations for this inviter
    const { data: invites, error: iErr } = await supabaseAdmin
      .from('referral_invitations')
      .select('id, inviter_user_id, invited_user_id, invited_email, code_used, status, funds_paid, created_at, completed_at')
      .eq('inviter_user_id', userId)
      .order('created_at', { ascending: false });
    if (iErr) throw iErr;

    // Completed referrals with active subscription (eligible earnings)
    const completedInvites = (invites || []).filter(x => x.status === 'completed' && x.invited_user_id);
    const invitedIds = completedInvites.map(x => x.invited_user_id);
    let activeIdsSet = new Set();
    if (invitedIds.length > 0) {
      const { data: activeSubs, error: subsErr } = await supabaseAdmin
        .from('user_subscriptions')
        .select('user_id')
        .in('user_id', invitedIds)
        .eq('status', 'active');
      if (subsErr) throw subsErr;
      activeIdsSet = new Set((activeSubs || []).map(r => r.user_id));
    }
    const eligibleCompletedCount = completedInvites.filter(x => activeIdsSet.has(x.invited_user_id)).length;

    // Sum withdrawals by status
    const { data: wAll } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .select('amount, status')
      .eq('user_id', userId);
    const sumByStatus = (arr, stat) => (arr || [])
      .filter(r => (r.status || '').toLowerCase() === stat)
      .reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

    const sumRequested = sumByStatus(wAll, 'requested');
    const sumProcessed = sumByStatus(wAll, 'processed');
    const totalWithdrawnOrPending = sumRequested + sumProcessed;

    // 1 GEL per eligible completed referral
    const available = Math.max(0, eligibleCompletedCount - Math.floor(totalWithdrawnOrPending));
    const pendingRequested = Math.floor(sumRequested);

    // Assign payout coverage oldest-first among ELIGIBLE completed invites
    const eligibleCandidates = (invites || [])
      .filter(x => x.status === 'completed' && activeIdsSet.has(x.invited_user_id))
      .slice()
      .sort((a, b) => new Date(a.completed_at || a.created_at) - new Date(b.completed_at || b.created_at));

    const paidIds = new Set();
    const reservedIds = new Set();
    // First, cover processed withdrawals as "paid"
    const paidCount = Math.min(Math.floor(sumProcessed), eligibleCandidates.length);
    for (let i = 0; i < paidCount; i++) paidIds.add(eligibleCandidates[i].id);
    // Then, cover requested withdrawals as "reserved"
    const remaining = eligibleCandidates.filter(c => !paidIds.has(c.id));
    const reserveCount = Math.min(Math.floor(pendingRequested), remaining.length);
    for (let i = 0; i < reserveCount; i++) reservedIds.add(remaining[i].id);

    const invitesWithPending = (invites || []).map(x => ({
      ...x,
      // Override fields for UI without touching DB values
      funds_paid: paidIds.has(x.id) ? true : false,
      withdrawal_pending: reservedIds.has(x.id)
    }));

    res.json({
      success: true,
      data: {
        referral_code: profile.referral_code,
        balance: parseFloat(available.toFixed(2)),
        pending_amount: parseFloat(pendingRequested.toFixed(2)),
        referrals: invitesWithPending
      }
    });
  } catch (error) {
    console.error('GET /referral/me error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch referral data' });
  }
});

// Check if current user was invited (used referral)
router.get('/invited/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('referral_invitations')
      .select('id, status')
      .eq('invited_user_id', userId)
      .limit(1);
    if (error) throw error;
    const invited = Array.isArray(data) && data.length > 0;
    res.json({ success: true, invited, record: invited ? data[0] : null });
  } catch (error) {
    console.error('GET /referral/invited/me error:', error);
    res.status(500).json({ success: false, error: 'Failed to check invited status' });
  }
});

// Attach a referral code to an already registered user
// Body: { code }
router.post('/use-code', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const raw = (req.body?.code || '').toString().trim().toUpperCase();
    if (!raw || raw.length < 5) {
      return res.status(400).json({ success: false, error: 'Invalid code' });
    }

    // Find inviter by code
    const { data: inviter, error: invErr } = await supabaseAdmin
      .from('user_profiles')
      .select('id, referral_code')
      .eq('referral_code', raw)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!inviter) return res.status(404).json({ success: false, error: 'Code not found' });
    if (inviter.id === userId) return res.status(400).json({ success: false, error: 'Cannot use your own code' });

    // Check if this user already has an invitation row
    const { data: existingInvite, error: existErr } = await supabaseAdmin
      .from('referral_invitations')
      .select('id, inviter_user_id, status, funds_paid')
      .eq('invited_user_id', userId)
      .maybeSingle();
    if (existErr && existErr.code !== 'PGRST116') throw existErr;
    if (existingInvite) {
      return res.json({ success: true, already_set: true, message: 'Referral already recorded' });
    }

    // Get user email for record keeping
    let invitedEmail = null;
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      invitedEmail = authUser?.user?.email || null;
    } catch (_) {}

    // Create invitation with pending status (completion will be set by payment webhook)
    const insert = await supabaseAdmin
      .from('referral_invitations')
      .insert({
        inviter_user_id: inviter.id,
        invited_user_id: userId,
        invited_email: invitedEmail,
        code_used: raw,
        status: 'pending',
        funds_paid: false,
      })
      .select('id')
      .single();
    if (insert.error) throw insert.error;

    return res.json({ success: true, message: 'Referral linked successfully' });
  } catch (error) {
    console.error('POST /referral/use-code error:', error);
    return res.status(500).json({ success: false, error: 'Failed to apply referral code' });
  }
});

router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== 'string' || code.length < 5) {
      return res.json({ success: true, valid: false });
    }
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('referral_code', code)
      .single();
    if (error && error.code !== 'PGRST116') throw error;

    if (!data) return res.json({ success: true, valid: false });
    res.json({ success: true, valid: true, inviter: { id: data.id } });
  } catch (error) {
    console.error('POST /referral/validate error:', error);
    res.status(500).json({ success: false, error: 'Validation failed' });
  }
});

router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Determine eligible completed referrals (only if invited user has an active subscription)
    const { data: allInvites, error: invErr } = await supabaseAdmin
      .from('referral_invitations')
      .select('id, invited_user_id, status, completed_at, created_at')
      .eq('inviter_user_id', userId)
      .order('created_at', { ascending: true });
    if (invErr) throw invErr;

    const completedInvites = (allInvites || []).filter(x => x.status === 'completed' && x.invited_user_id);
    const invitedIds = completedInvites.map(x => x.invited_user_id);

    let activeIdsSet = new Set();
    if (invitedIds.length > 0) {
      const { data: activeSubs, error: subsErr } = await supabaseAdmin
        .from('user_subscriptions')
        .select('user_id')
        .in('user_id', invitedIds)
        .eq('status', 'active');
      if (subsErr) throw subsErr;
      activeIdsSet = new Set((activeSubs || []).map(r => r.user_id));
    }

    const eligibleCompletedCount = completedInvites.filter(x => activeIdsSet.has(x.invited_user_id)).length;

    // Sum existing withdrawals for this user (requested + processed)
    const { data: wAll, error: wErr } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .select('amount, status')
      .eq('user_id', userId);
    if (wErr) throw wErr;
    const sumByStatus = (arr, stat) => (arr || [])
      .filter(r => (r.status || '').toLowerCase() === stat)
      .reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);
    const sumRequested = Math.floor(sumByStatus(wAll, 'requested'));
    const sumProcessed = Math.floor(sumByStatus(wAll, 'processed'));

    const maxAvailable = Math.max(0, eligibleCompletedCount - (sumRequested + sumProcessed));

    // Accept requested amount from user
    let requestedAmount = parseFloat(req.body?.amount);
    if (Number.isNaN(requestedAmount)) {
      return res.status(400).json({ success: false, error: 'Amount is required' });
    }
    // 1 GEL per eligible completed referral, round down to whole GEL
    requestedAmount = Math.floor(requestedAmount);

    if (requestedAmount < 10) {
      return res.status(400).json({ success: false, error: 'Minimum withdrawal amount is 10 GEL' });
    }
    if (requestedAmount > maxAvailable) {
      return res.status(400).json({ success: false, error: `You can request up to ${maxAvailable} GEL` });
    }

    // Enforce monthly limit: 100 GEL per calendar month (requested + processed)
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const { data: monthRows, error: monthErr } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .select('amount, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString())
      .lt('created_at', startOfNextMonth.toISOString());
    if (monthErr) throw monthErr;
    const monthSum = (monthRows || [])
      .filter(r => ['requested', 'processed'].includes((r.status || '').toLowerCase()))
      .reduce((acc, r) => acc + Math.floor(parseFloat(r.amount || 0)), 0);
    const MONTHLY_CAP = 100;
    const remainingMonthly = Math.max(0, MONTHLY_CAP - monthSum);
    if (requestedAmount > remainingMonthly) {
      return res.status(400).json({ success: false, error: `Monthly limit is ${MONTHLY_CAP} GEL. Remaining this month: ${remainingMonthly} GEL` });
    }

    // Create a withdrawal request record
    if (requestedAmount > 0) {
      await supabaseAdmin.from('referral_withdrawal_requests').insert({
        user_id: userId,
        amount: requestedAmount.toFixed(2),
        status: 'requested',
        full_name: (req.body?.full_name || '').trim(),
        iban: (req.body?.iban || '').trim(),
        bank_name: (req.body?.bank_name || '').trim(),
      });
    }

    res.json({
      success: true,
      message: 'Withdrawal requested. Our administration will contact you within 24 hours.',
      amount: requestedAmount.toFixed(2)
    });
  } catch (error) {
    console.error('POST /referral/withdraw error:', error);
    res.status(500).json({ success: false, error: 'Withdrawal request failed' });
  }
});

router.post('/webhook/payment', async (req, res) => {
  try {
    const { invited_user_id, invited_email } = req.body || {};
    if (!invited_user_id && !invited_email) {
      return res.status(400).json({ success: false, error: 'Missing invited_user_id or invited_email' });
    }
    const q = supabaseAdmin.from('referral_invitations').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('status', 'pending');
    if (invited_user_id) q.eq('invited_user_id', invited_user_id);
    if (invited_email) q.eq('invited_email', invited_email);
    const up = await q;
    if (up.error) throw up.error;
    res.json({ success: true, updated: up.count || null });
  } catch (error) {
    console.error('POST /referral/webhook/payment error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

router.post('/admin/markPaid', async (req, res) => {
  try {
    const { invitationId } = req.body || {};
    if (!invitationId) return res.status(400).json({ success: false, error: 'invitationId required' });
    const up = await supabaseAdmin.from('referral_invitations').update({ funds_paid: true }).eq('id', invitationId);
    if (up.error) throw up.error;
    res.json({ success: true });
  } catch (error) {
    console.error('POST /referral/admin/markPaid error:', error);
    res.status(500).json({ success: false, error: 'Mark paid failed' });
  }
});

// GET /api/referral/withdrawals/me - return authenticated user's withdrawal requests
router.get('/withdrawals/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .select('id, user_id, amount, status, full_name, iban, bank_name, created_at, processed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const withdrawals = data || [];
    return res.json({ success: true, userId, count: withdrawals.length, withdrawals });
  } catch (error) {
    console.error('GET /referral/withdrawals/me error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch withdrawal history' });
  }
});

module.exports = router;
