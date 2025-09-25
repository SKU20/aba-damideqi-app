const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');

// GET /api/plans
router.get('/', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('subscription_plans')
    .select('*')
    .order('price_gel', { ascending: true });

  if (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
  res.json({ success: true, plans: data });
});

module.exports = router;