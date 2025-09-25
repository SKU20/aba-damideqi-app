// backend/routes/events.js
const express = require('express');
const multer = require('multer');
const { supabaseAdmin } = require('../config/supabase');
const router = express.Router();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// GET /api/events/:id/interest/status - per-user interest state + global count
router.get('/events/:id/interest/status', async (req, res) => {
  try {
    const eventId = req.params.id;

    // Auth required to know who is asking
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'No authorization token provided' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    // Is this user already interested?
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('events_interest')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existErr && existErr.code !== 'PGRST116') {
      console.error('Error checking interest status:', existErr);
      return res.status(500).json({ success: false, error: 'Failed to check interest' });
    }

    // Global count
    const { count, error: cntErr } = await supabaseAdmin
      .from('events_interest')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (cntErr) {
      console.error('Error counting interest:', cntErr);
      return res.status(500).json({ success: false, error: 'Failed to count interest' });
    }

    return res.json({ success: true, interested: !!existing, interestedCount: count || 0 });
  } catch (e) {
    console.error('Error in interest status:', e);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/events - Create new event
router.post('/events', upload.single('eventImage'), async (req, res) => {
  try {
    const { title, description, eventDate, eventTime, location } = req.body;

    // Get user from JWT token (assuming you have auth middleware)
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Validate required fields
    if (!title || !description || !eventDate || !eventTime || !location) {
      return res.status(400).json({ 
        error: 'All fields are required (title, description, eventDate, eventTime, location)' 
      });
    }

    let imageUrl = null;

    // Upload image if provided
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop();
      const fileName = `events/${user.id}/${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
      

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('car-photos')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }

      // Get signed URL (valid for 1 year)
      const { data: { signedUrl }, error: signError } = await supabaseAdmin.storage
        .from('car-photos')
        .createSignedUrl(fileName, 31536000); // 1 year expiry
      
      if (signError) {
        console.error('Error creating signed URL:', signError);
        return res.status(500).json({ error: 'Failed to create image URL' });
      }
      
      imageUrl = signedUrl;
    }

    // Insert event into database
    const { data: eventData, error: insertError } = await supabaseAdmin
      .from('events')
      .insert({
        user_id: user.id,
        title: title.trim(),
        description: description.trim(),
        event_date: eventDate,
        event_time: eventTime,
        location: location.trim(),
        image_url: imageUrl,
        status: 'active'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating event:', insertError);
      
      // If event creation failed and we uploaded an image, clean it up
      if (imageUrl) {
        await supabaseAdmin.storage.from('car-photos').remove([fileName]);
      }
      
      return res.status(500).json({ error: 'Failed to create event' });
    }

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      event: eventData
    });

  } catch (error) {
    console.error('Error in event creation:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/events/my - Get current user's events
router.get('/events/my', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Error fetching events:', error);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    res.json({
      success: true,
      events: events || []
    });

  } catch (error) {
    console.error('Error fetching user events:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// GET /api/events - Get all events (public)
router.get('/events', async (req, res) => {
  try {
    const { data: events, error } = await supabaseAdmin
      .from('events')
      .select(`
        *,
        user_profiles (
          first_name,
          last_name,
          username
        )
      `)
      .eq('status', 'active')
      .order('event_date', { ascending: true });

    if (error) {
      console.error('Error fetching events:', error);
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    // Convert public URLs to signed URLs for existing events
    const eventsWithSignedUrls = await Promise.all((events || []).map(async (event) => {
      if (event.image_url && event.image_url.includes('/public/')) {
        try {
          // Extract file path from public URL
          const urlParts = event.image_url.split('/public/car-photos/');
          if (urlParts.length > 1) {
            const filePath = urlParts[1];
            
            // Generate signed URL
            const { data: { signedUrl }, error: signError } = await supabaseAdmin.storage
              .from('car-photos')
              .createSignedUrl(filePath, 31536000); // 1 year expiry
            
            if (!signError && signedUrl) {
              event.image_url = signedUrl;
            }
          }
        } catch (urlError) {
          console.error('Error converting URL for event:', event.id, urlError);
        }
      }
      return event;
    }));

    res.json({
      success: true,
      events: eventsWithSignedUrls
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// POST /api/events/:id/interest - Add interest to event (increment counter)
router.post('/events/:id/interest', async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // Get user from JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if event exists and get event details
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('user_id, interested_people')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Prevent users from being interested in their own events
    if (event.user_id === user.id) {
      return res.status(400).json({ error: 'Cannot be interested in your own event' });
    }

    // Record user-specific interest in events_interest table (upsert)
    // Expected table schema:
    //   events_interest(id uuid default gen_random_uuid(), event_id bigint, user_id uuid, created_at timestamptz default now())
    // Unique constraint recommended: unique(event_id, user_id)

    // Check if already interested
    const { data: existing, error: existErr } = await supabaseAdmin
      .from('events_interest')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (existErr && existErr.code !== 'PGRST116') {
      console.error('Error checking existing interest:', existErr);
      return res.status(500).json({ error: 'Failed to check interest' });
    }

    if (!existing) {
      const { error: insErr } = await supabaseAdmin
        .from('events_interest')
        .insert({ event_id: eventId, user_id: user.id });
      if (insErr) {
        console.error('Error inserting interest:', insErr);
        return res.status(500).json({ error: 'Failed to add interest' });
      }
    }

    // Get fresh count of interested users
    const { count, error: cntErr } = await supabaseAdmin
      .from('events_interest')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);
    if (cntErr) {
      console.error('Error counting interest:', cntErr);
      return res.status(500).json({ error: 'Failed to count interest' });
    }

    const newCount = count || 0;

    // Update events table cached counter for compatibility
    const { error: updateError } = await supabaseAdmin
      .from('events')
      .update({ interested_people: newCount })
      .eq('id', eventId);
    if (updateError) {
      console.warn('Warning: counter not synced to events table:', updateError.message);
    }

    res.json({ success: true, interested: true, interestedCount: newCount });

  } catch (error) {
    console.error('Error adding interest:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Cleanup job to delete events 24 hours after they start
const cleanupExpiredEvents = async () => {
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    // Delete events where event_date + event_time is more than 24 hours ago
    const { data: expiredEvents, error: selectError } = await supabaseAdmin
      .from('events')
      .select('id, title, event_date, event_time')
      .lt('event_date', twentyFourHoursAgo.toISOString().split('T')[0]);
    
    if (selectError) {
      console.error('Error finding expired events:', selectError);
      return;
    }

    if (expiredEvents && expiredEvents.length > 0) {
      const expiredEventIds = expiredEvents.map(event => event.id);
      
      const { error: deleteError } = await supabaseAdmin
        .from('events')
        .delete()
        .in('id', expiredEventIds);
      
      if (deleteError) {
        console.error('Error deleting expired events:', deleteError);
      } else {
        console.log(`🗑️ Deleted ${expiredEvents.length} expired events:`, expiredEvents.map(e => e.title));
      }
    }
  } catch (error) {
    console.error('Error in cleanup job:', error);
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredEvents, 60 * 60 * 1000);

// DELETE /api/events/:id - Delete event (owner only)
router.delete('/events/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    
    // Get user from JWT token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization token provided' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if event exists and user is the owner
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('user_id, image_url')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user is the owner
    if (event.user_id !== user.id) {
      return res.status(403).json({ error: 'You can only delete your own events' });
    }

    // Delete the image from storage if it exists
    if (event.image_url) {
      try {
        // Extract file path from URL
        let filePath = null;
        if (event.image_url.includes('/car-photos/')) {
          const urlParts = event.image_url.split('/car-photos/');
          if (urlParts.length > 1) {
            filePath = urlParts[1].split('?')[0]; // Remove query parameters
          }
        }
        
        if (filePath) {
          await supabaseAdmin.storage
            .from('car-photos')
            .remove([filePath]);
        }
      } catch (imageError) {
        console.error('Error deleting event image:', imageError);
        // Continue with event deletion even if image deletion fails
      }
    }

    // Delete the event
    const { error: deleteError } = await supabaseAdmin
      .from('events')
      .delete()
      .eq('id', eventId);

    if (deleteError) {
      console.error('Error deleting event:', deleteError);
      return res.status(500).json({ error: 'Failed to delete event' });
    }

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Run cleanup on startup
cleanupExpiredEvents();

module.exports = router;