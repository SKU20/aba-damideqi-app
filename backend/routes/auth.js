const express = require('express');
const { body, validationResult } = require('express-validator');
const supabaseAdmin = require('../config/supabaseAdmin');
const supabaseClient = require('../config/supabaseClient');
const generateReferralCode = require('../utils/referralCodeGenerator');
const { sendVerificationEmail } = require('../services/emailService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Referral helpers (3 letters + 2 digits)
function genReferralCode() {
  return generateReferralCode();
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
  body('age').isInt({ min: 18, max: 120 }).withMessage('Age must be between 18 and 120'),
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
    // Create user without email confirmation (we'll handle it ourselves)
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
      email_confirm: true // Auto-confirm in Supabase, we'll track it ourselves
    });

    if (error) {
      console.error('Supabase auth error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create or update user_profiles with verification code
    let profileCode;
    try {
      profileCode = await getOrCreateUniqueCode();
      await supabaseAdmin.from('user_profiles').upsert({
        id: data.user.id,
        username: username,
        referral_code: profileCode,
        email_verified: false,
        verification_code: verificationCode,
        verification_code_expires_at: expiresAt.toISOString()
      }, { onConflict: 'id' });
    } catch (e) {
      console.error('Failed to set referral_code for user_profiles:', e);
    }

    // Send verification email via Resend
    try {
      await sendVerificationEmail(email, verificationCode);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails
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

    // Check if email is verified in user_profiles
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('email_verified')
      .eq('id', data.user.id)
      .single();

    if (!profile?.email_verified) {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email before logging in',
        emailVerified: false
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

// Verify email with code
router.post('/verify-email', [
  body('email').isEmail(),
  body('code').isLength({ min: 6, max: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input'
      });
    }

    const { email, code } = req.body;

    // Find user by email
    const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
    const user = authUser?.users?.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get profile with verification code
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('verification_code, verification_code_expires_at, email_verified')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        success: false,
        error: 'Profile not found'
      });
    }

    // Check if already verified
    if (profile.email_verified) {
      return res.json({
        success: true,
        message: 'Email already verified'
      });
    }

    // Check if code matches
    if (profile.verification_code !== code) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code'
      });
    }

    // Check if code expired
    if (new Date(profile.verification_code_expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Verification code expired'
      });
    }

    // Mark as verified
    await supabaseAdmin
      .from('user_profiles')
      .update({
        email_verified: true,
        verification_code: null,
        verification_code_expires_at: null
      })
      .eq('id', user.id);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed'
    });
  }
});

// Resend verification code
router.post('/resend-verification', [
  body('email').isEmail()
], async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const { data: authUser } = await supabaseAdmin.auth.admin.listUsers();
    const user = authUser?.users?.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Update code
    await supabaseAdmin
      .from('user_profiles')
      .update({
        verification_code: verificationCode,
        verification_code_expires_at: expiresAt.toISOString()
      })
      .eq('id', user.id);

    // Send email
    await sendVerificationEmail(email, verificationCode);

    res.json({
      success: true,
      message: 'Verification code sent'
    });
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend code'
    });
  }
});

module.exports = router;