const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const router = express.Router();

// GET /api/admin/users/search?query=@username
router.get('/users/search', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const raw = String(req.query.query || '').trim();
    if (!raw) return res.json({ success: true, data: [] });
    const q = raw.startsWith('@') ? raw.slice(1) : raw;

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('id, username, first_name, last_name, created_at')
      .ilike('username', `%${q}%`)
      .order('username', { ascending: true })
      .limit(50);

    if (error) throw error;

    return res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('GET /api/admin/users/search error:', error);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// GET /api/admin/referrals/withdrawals?status=requested|approved|rejected|all
router.get('/referrals/withdrawals', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const status = String(req.query.status || 'requested').toLowerCase();
    let qb = supabaseAdmin
      .from('referral_withdrawal_requests')
      .select('id, user_id, amount, status, full_name, iban, bank_name, created_at')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      const mapped = status === 'approved' ? 'processed' : status; // UI 'approved' => DB 'processed'
      qb = qb.eq('status', mapped);
    }

    const { data, error } = await qb;
    if (error) throw error;

    return res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('GET /api/admin/referrals/withdrawals error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch withdrawals' });
  }
});

// POST /api/admin/referrals/withdrawals/:id/approve
router.post('/referrals/withdrawals/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;

    // Fetch request
    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .select('id, user_id, amount, status')
      .eq('id', id)
      .single();
    if (reqErr || !reqRow) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }
    if (reqRow.status === 'approved') {
      return res.json({ success: true, message: 'Already approved' });
    }

    // Calculate how many invitations to mark paid (1 GEL per invite)
    const needed = Math.max(0, Math.floor(parseFloat(reqRow.amount || '0')));

    if (needed > 0) {
      // Select up to `needed` unpaid completed invitations
      const { data: invs, error: invSelErr } = await supabaseAdmin
        .from('referral_invitations')
        .select('id')
        .eq('inviter_user_id', reqRow.user_id)
        .eq('status', 'completed')
        .eq('funds_paid', false)
        .order('completed_at', { ascending: true })
        .limit(needed);
      if (invSelErr) throw invSelErr;

      const ids = (invs || []).map(r => r.id);
      if (ids.length > 0) {
        const { error: invUpErr } = await supabaseAdmin
          .from('referral_invitations')
          .update({ funds_paid: true })
          .in('id', ids);
        if (invUpErr) throw invUpErr;
      }
    }

    // Create a debit transaction matching the approved amount
    try {
      await supabaseAdmin
        .from('referral_transactions')
        .insert({ user_id: reqRow.user_id, amount: parseFloat(reqRow.amount).toFixed(2), type: 'debit', description: 'Referral withdrawal approved' });
    } catch (txErr) {
      console.warn('Approve withdrawal: unable to create transaction record:', txErr?.message || txErr);
    }

    // Update request status to the DB-allowed value 'processed'
    const { error: upErr } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .update({ status: 'processed' })
      .eq('id', id);
    if (upErr) throw upErr;

    return res.json({ success: true });
  } catch (error) {
    console.error('POST /api/admin/referrals/withdrawals/:id/approve error:', error);
    return res.status(500).json({ success: false, error: 'Approve failed' });
  }
});

// POST /api/admin/referrals/withdrawals/:id/reject
router.post('/referrals/withdrawals/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const reason = String(req.body?.reason || '').trim();

    // Update request status
    const { error: upErr } = await supabaseAdmin
      .from('referral_withdrawal_requests')
      .update({ status: 'cancelled', reason: reason || null })
      .eq('id', id);
    if (upErr) throw upErr;

    return res.json({ success: true });
  } catch (error) {
    console.error('POST /api/admin/referrals/withdrawals/:id/reject error:', error);
    return res.status(500).json({ success: false, error: 'Reject failed' });
  }
});

// Additional admin endpoints
// GET /api/admin/users/:userId/details
router.get('/users/:userId/details', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Profile
    const { data: profile, error: pErr } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (pErr) throw pErr;

    // Fetch auth email via Supabase Admin API
    try {
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (!authErr && authUser?.user?.email) {
        profile.email = authUser.user.email;
      }
    } catch (_) {}

    // Cars with photos
    const { data: cars, error: cErr } = await supabaseAdmin
      .from('user_cars')
      .select(`
        id,
        user_id,
        vehicle_type,
        custom_vehicle_type,
        year,
        brand_id,
        custom_brand,
        model_id,
        custom_model,
        moto_brand_id,
        moto_model_id,
        engine_capacity,
        horsepower,
        is_stock,
        modifications_comment,
        city,
        region,
        country,
        created_at,
        updated_at,
        car_brands ( id, name ),
        car_models ( id, name ),
        moto_brands ( id, name ),
        moto_models ( id, name ),
        car_photos ( id, photo_url, photo_name, upload_order )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (cErr) throw cErr;

    // Runs
    const { data: runs, error: rErr } = await supabaseAdmin
      .from('video_runs')
      .select('*')
      .eq('user_id', userId)
      .order('best_elapsed_ms', { ascending: true });
    if (rErr) throw rErr;

    // Referral summary
    const summary = { referral_code: null, balance: 0, referrals: [] };
    try {
      const { data: profRC } = await supabaseAdmin
        .from('user_profiles')
        .select('referral_code')
        .eq('id', userId)
        .maybeSingle();
      summary.referral_code = profRC?.referral_code || null;

      const { data: invites } = await supabaseAdmin
        .from('referral_invitations')
        .select('id, inviter_user_id, invited_user_id, invited_email, code_used, status, funds_paid, created_at, completed_at')
        .eq('inviter_user_id', userId)
        .order('created_at', { ascending: false });
      summary.referrals = invites || [];

      try {
        const { data: balRow } = await supabaseAdmin
          .from('referral_balances')
          .select('balance_gel')
          .eq('user_id', userId)
          .maybeSingle();
        if (balRow && balRow.balance_gel != null) {
          summary.balance = parseFloat(balRow.balance_gel);
        } else {
          const completedUnpaid = (invites || []).filter(x => x.status === 'completed' && x.funds_paid === false).length;
          summary.balance = parseFloat((completedUnpaid * 1.0).toFixed(2));
        }
      } catch (_) {
        const completedUnpaid = (summary.referrals || []).filter(x => x.status === 'completed' && x.funds_paid === false).length;
        summary.balance = parseFloat((completedUnpaid * 1.0).toFixed(2));
      }
    } catch (_) {}

    return res.json({ success: true, data: { profile, cars: cars || [], runs: runs || [], referral: summary } });
  } catch (error) {
    console.error('GET /api/admin/users/:userId/details error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch user details' });
  }
});

// PUT /api/admin/users/:userId/profile
router.put('/users/:userId/profile', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const allowed = ['first_name','last_name','username','phone','age','city','region','country','is_online','online_threshold_seconds','push_token','referral_code','role'];
    const update = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        update[k] = req.body[k];
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update(update)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/admin/users/:userId/profile error:', error);
    return res.status(500).json({ success: false, error: 'Profile update failed' });
  }
});

// PUT /api/admin/users/:userId/runs/:runId
router.put('/users/:userId/runs/:runId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, runId } = req.params;
    const allowed = ['best_elapsed_ms','detected_brand','detected_year','verification_verdict','range','speed_unit','range_start','range_end'];
    const update = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        update[k] = req.body[k];
      }
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    const { data, error } = await supabaseAdmin
      .from('video_runs')
      .update(update)
      .eq('id', runId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/admin/users/:userId/runs/:runId error:', error);
    return res.status(500).json({ success: false, error: 'Run update failed' });
  }
});

// DELETE /api/admin/users/:userId/runs/:runId
router.delete('/users/:userId/runs/:runId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, runId } = req.params;
    // Fetch run to know storage path
    const { data: run, error: rErr } = await supabaseAdmin
      .from('video_runs')
      .select('id, user_id, video_bucket, video_path')
      .eq('id', runId)
      .eq('user_id', userId)
      .single();
    if (rErr || !run) {
      return res.status(404).json({ success: false, error: 'Run not found' });
    }
    // Delete storage object first
    if (run.video_bucket && run.video_path) {
      const { error: remErr } = await supabaseAdmin.storage
        .from(run.video_bucket)
        .remove([run.video_path]);
      if (remErr) {
        console.error('Admin delete run: storage remove error:', remErr);
      }
    }
    // Delete row
    const { error: delErr } = await supabaseAdmin
      .from('video_runs')
      .delete()
      .eq('id', runId)
      .eq('user_id', userId);
    if (delErr) throw delErr;
    return res.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/users/:userId/runs/:runId error:', error);
    return res.status(500).json({ success: false, error: 'Run delete failed' });
  }
});

module.exports = router;

// Admin car management
// POST /api/admin/users/:userId/cars
router.post('/users/:userId/cars', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      vehicleType,
      customVehicleType,
      year,
      brandId,
      customBrand,
      modelId,
      customModel,
      engineVolume,
      horsepower,
      isStock,
      nonStockComment,
      motorcycleType,
      driveType,
      city,
      region,
      country
    } = req.body || {};

    const carData = {
      user_id: userId,
      vehicle_type: vehicleType,
      custom_vehicle_type: vehicleType === 'custom' ? (customVehicleType || null) : null,
      year: year ? parseInt(year) : null,
      brand_id: vehicleType === 'car' ? (brandId || null) : null,
      custom_brand: customBrand || null,
      model_id: vehicleType === 'car' ? (modelId || null) : null,
      custom_model: customModel || null,
      moto_brand_id: vehicleType === 'motorcycle' ? (brandId || null) : null,
      moto_model_id: vehicleType === 'motorcycle' ? (modelId || null) : null,
      engine_capacity: engineVolume ? parseFloat(engineVolume) : null,
      horsepower: horsepower ? parseInt(horsepower) : null,
      is_stock: !!isStock,
      modifications_comment: !isStock ? (nonStockComment || null) : null,
      motorcycle_type: vehicleType === 'motorcycle' ? (motorcycleType || null) : null,
      drive_type: vehicleType === 'motorcycle' ? (driveType || null) : null,
      city: city || null,
      region: region || null,
      country: country || 'Georgia',
    };

    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .insert([carData])
      .select('*')
      .single();
    if (error) throw error;

    return res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('POST /api/admin/users/:userId/cars error:', error);
    return res.status(500).json({ success: false, error: 'Create car failed' });
  }
});

// PUT /api/admin/users/:userId/cars/:carId
router.put('/users/:userId/cars/:carId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, carId } = req.params;
    const allowed = {
      vehicle_type: 'vehicleType',
      custom_vehicle_type: 'customVehicleType',
      year: 'year',
      brand_id: 'brandId',
      custom_brand: 'customBrand',
      model_id: 'modelId',
      custom_model: 'customModel',
      moto_brand_id: 'brandId',
      moto_model_id: 'modelId',
      engine_capacity: 'engineVolume',
      horsepower: 'horsepower',
      is_stock: 'isStock',
      modifications_comment: 'nonStockComment',
      motorcycle_type: 'motorcycleType',
      drive_type: 'driveType',
      city: 'city',
      region: 'region',
      country: 'country'
    };
    const update = {};
    for (const [dbKey, bodyKey] of Object.entries(allowed)) {
      if (Object.prototype.hasOwnProperty.call(req.body, bodyKey)) {
        update[dbKey] = req.body[bodyKey];
      }
    }
    // Normalize numeric/conditional fields similar to cars.js
    if (Object.prototype.hasOwnProperty.call(update, 'year')) update.year = parseInt(update.year);
    if (Object.prototype.hasOwnProperty.call(update, 'engine_capacity')) update.engine_capacity = update.engine_capacity ? parseFloat(update.engine_capacity) : null;
    if (Object.prototype.hasOwnProperty.call(update, 'horsepower')) update.horsepower = update.horsepower ? parseInt(update.horsepower) : null;
    if (Object.prototype.hasOwnProperty.call(update, 'is_stock')) update.is_stock = !!update.is_stock;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .update(update)
      .eq('id', carId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw error;
    return res.json({ success: true, data });
  } catch (error) {
    console.error('PUT /api/admin/users/:userId/cars/:carId error:', error);
    return res.status(500).json({ success: false, error: 'Update car failed' });
  }
});

// DELETE /api/admin/users/:userId/cars/:carId
router.delete('/users/:userId/cars/:carId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId, carId } = req.params;

    // Verify ownership
    const { data: carRow, error: carErr } = await supabaseAdmin
      .from('user_cars')
      .select('id, user_id')
      .eq('id', carId)
      .single();
    if (carErr || !carRow) return res.status(404).json({ success: false, error: 'Car not found' });

    // Delete car photos from storage and table
    const { data: photos, error: photosError } = await supabaseAdmin
      .from('car_photos')
      .select('id, photo_url')
      .eq('car_id', carId);
    if (!photosError && Array.isArray(photos) && photos.length > 0) {
      const fileNames = photos.map(p => p.photo_url).filter(Boolean);
      if (fileNames.length > 0) {
        await supabaseAdmin.storage.from('car-photos').remove(fileNames);
      }
      await supabaseAdmin.from('car_photos').delete().eq('car_id', carId);
    }

    // Delete video files for runs and then rows
    const { data: runs } = await supabaseAdmin
      .from('video_runs')
      .select('id, video_bucket, video_path')
      .eq('user_id', userId)
      .eq('car_id', carId);
    if (Array.isArray(runs) && runs.length > 0) {
      const byBucket = runs.reduce((acc, r) => {
        if (r.video_bucket && r.video_path) {
          if (!acc[r.video_bucket]) acc[r.video_bucket] = [];
          acc[r.video_bucket].push(r.video_path);
        }
        return acc;
      }, {});
      for (const [bucket, paths] of Object.entries(byBucket)) {
        if (paths.length > 0) {
          await supabaseAdmin.storage.from(bucket).remove(paths);
        }
      }
      await supabaseAdmin.from('video_runs').delete().eq('user_id', userId).eq('car_id', carId);
    }

    // Delete car row
    const { error: delCarErr } = await supabaseAdmin
      .from('user_cars')
      .delete()
      .eq('id', carId);
    if (delCarErr) throw delCarErr;

    return res.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/admin/users/:userId/cars/:carId error:', error);
    return res.status(500).json({ success: false, error: 'Delete car failed' });
  }
});
