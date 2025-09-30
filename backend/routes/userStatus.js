const express = require('express');
const authMiddleware = require('../middleware/auth');
const { hasActiveSubscription } = require('../middleware/subscription');

const router = express.Router();

// GET /api/user/status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const active = await hasActiveSubscription(userId);

    return res.json({
      success: true,
      data: {
        hasActiveSubscription: !!active,
      }
    });
  } catch (error) {
    console.error('GET /api/user/status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch user status' });
  }
});

module.exports = router;
