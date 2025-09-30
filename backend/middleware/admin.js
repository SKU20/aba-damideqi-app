const { supabaseAdmin } = require('../config/supabase');

// Requires standard authMiddleware to have run first and set req.user
module.exports = async function adminMiddleware(req, res, next) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Check role from user_profiles
    const { data: profile, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('adminMiddleware profile fetch error:', error);
      return res.status(500).json({ success: false, error: 'Admin check failed' });
    }

    const role = profile?.role || user?.app_metadata?.role || user?.user_metadata?.role;
    if (String(role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    next();
  } catch (e) {
    console.error('adminMiddleware error:', e);
    return res.status(500).json({ success: false, error: 'Admin check error' });
  }
}
