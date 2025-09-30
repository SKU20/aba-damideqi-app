const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin, supabaseClient } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Referral helpers (3 letters + 2 digits)
function genReferralCode() {
  const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const numbers = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${letters}${numbers}`;
}

async function getOrCreateUniqueCode() {
  for (let i = 0; i < 12; i++) {
    const code = genReferralCode();
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error('Could not generate unique referral code');
}

// =====================
// Helper Functions
// =====================

const getUserData = async (userId) => {
  const [profileResult, subscriptionResult] = await Promise.all([
    supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single(),
    supabaseAdmin
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .or(`end_date.is.null,end_date.gte.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
  ]);

  return {
    profile: profileResult.data || null,
    subscription: subscriptionResult.data || null,
    hasActivePlan: !!subscriptionResult.data,
    profileError: profileResult.error,
    subscriptionError: subscriptionResult.error
  };
};

// =====================
// Authentication Routes
// =====================
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').trim().isLength({ min: 1, max: 50 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1, max: 50 }).withMessage('Last name is required'),
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('phone').trim().isLength({ min: 1 }).withMessage('Phone number is required'),
  body('age').isInt({ min: 17, max: 120 }).withMessage('Age must be between 17 and 120'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password, firstName, lastName, username, phone, age, referralCode } = req.body;
    const safeReferral = (referralCode || '').toString().trim().toUpperCase();

    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Username already taken'
      });
    }
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        username,
        phone,
        age: Number.parseInt(age, 10) || null
      },
      email_confirm: true
    });

    if (error) {
      console.error('Supabase auth error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Create or update user_profiles with referral_code and basic info (email is NOT a column in user_profiles)
    let profileCode;
    try {
      profileCode = await getOrCreateUniqueCode();
      await supabaseAdmin.from('user_profiles').upsert({
        id: data.user.id,
        username: username,
        referral_code: profileCode,
      }, { onConflict: 'id' });
    } catch (e) {
      console.error('Failed to set referral_code for user_profiles:', e);
    }

    // If referralCode is present, validate and create invitation with status 'pending'
    if (safeReferral && typeof safeReferral === 'string') {
      try {
        const { data: inviter, error: invErr } = await supabaseAdmin
          .from('user_profiles')
          .select('id, referral_code')
          .eq('referral_code', safeReferral)
          .single();
        if (!invErr && inviter && inviter.id !== data.user.id) {
          await supabaseAdmin.from('referral_invitations').insert({
            inviter_user_id: inviter.id,
            invited_user_id: data.user.id,
            invited_email: email,
            code_used: safeReferral,
            status: 'pending',
            completed_at: new Date().toISOString(),
            funds_paid: false
          });
        }
      } catch (e) {
        console.warn('Referral invite creation failed:', e?.message || e);
      }
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: data.user.id,
          email: data.user.email,
          created_at: data.user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Login user
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error);
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }

    const userData = await getUserData(data.user.id);

    if (userData.profileError) {
      console.error('Profile fetch error:', userData.profileError);
    }
    if (userData.subscriptionError) {
      console.error('Subscription fetch error:', userData.subscriptionError);
    }

    res.json({
      success: true,          
      message: 'Login successful',
      data: {
        user: data.user,
        session: data.session,
        profile: userData.profile,
        subscription: userData.subscription,
        hasActivePlan: userData.hasActivePlan
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Logout user
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userData = await getUserData(req.user.id);

    if (userData.profileError) {
      console.error('Profile fetch error:', userData.profileError);
    }
    if (userData.subscriptionError) {
      console.error('Subscription fetch error:', userData.subscriptionError);
    }

    res.json({
      success: true,
      data: {
        user: req.user,
        profile: userData.profile,
        subscription: userData.subscription,
        hasActivePlan: userData.hasActivePlan
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

// =====================
// Utility Routes
// =====================

// Check username availability
router.post('/check-username', [
  body('username').trim().isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format'
      });
    }

    const { username } = req.body;

    const { data: existingUser, error } = await supabaseAdmin
      .from('user_profiles')
      .select('username')
      .eq('username', username)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.json({
      success: true,
      available: !existingUser
    });

  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check username'
    });
  }
});


module.exports = router;