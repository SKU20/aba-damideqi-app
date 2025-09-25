const express = require('express');
const router = express.Router();
const multer = require('multer');
const { supabaseClient, supabaseAdmin } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

const getPublicUrl = async (fileName) => {
  if (!fileName) {
    return null;
  }
  
  let actualFileName = fileName;
  
  // If it's a full URL, extract the path after 'car-photos/'
  if (fileName.startsWith('http')) {
    const match = fileName.match(/car-photos\/(.+)$/);
    if (match) {
      actualFileName = match[1];
    } else {
      return null;
    }
  }
  
  try {
    // Prefer signed URL to work with private buckets reliably
    const { data, error } = await supabaseAdmin.storage
      .from('car-photos')
      .createSignedUrl(actualFileName, 31536000); // 1 year expiry

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    // If signed URL failed for any reason, try public URL (in case bucket is public)
    const { data: publicData } = supabaseAdmin.storage
      .from('car-photos')
      .getPublicUrl(actualFileName);
    return publicData?.publicUrl || null;

  } catch (err) {
    console.error('getPublicUrl failed for', actualFileName, err?.message);
    return null;
  }
};

router.get('/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const includeOwner = req.query.includeOwner === 'true';

    // Validate limit and offset
    if (limit > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit cannot exceed 100'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .select(`
        id,
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
        motorcycle_type,
        drive_type,
        car_brands (
          id,
          name
        ),
        car_models (
          id,
          name
        ),
        moto_brands (
          id,
          name
        ),
        moto_models (
          id,
          name
        ),
        car_photos (
          id,
          photo_url,
          photo_name,
          upload_order
        )
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const processedData = await Promise.all(
      (data || []).map(async (car) => {
        // Process photos with proper async/await
        const processedPhotos = await Promise.all(
          (car.car_photos || []).map(async (photo) => ({
            ...photo,
            photo_url: await getPublicUrl(photo.photo_url)
          }))
        );

        // Sort photos by upload_order
        const sortedPhotos = processedPhotos.sort((a, b) => (a.upload_order || 0) - (b.upload_order || 0));
        
        let processedCar = {
          ...car,
          car_photos: sortedPhotos
        };

        // If owner info is requested, fetch it separately
        if (includeOwner && car.user_id) {
          const { data: profileData, error: profileError } = await supabaseAdmin
            .from('user_profiles')
            .select('id, username, first_name, last_name')
            .eq('id', car.user_id)
            .single();

          if (!profileError && profileData) {
            processedCar = {
              ...processedCar,
              username: profileData.username,
              first_name: profileData.first_name,
              last_name: profileData.last_name,
              owner_id: profileData.id
            };
          }
        }

        return processedCar;
      })
    );

    res.json({
      success: true,
      data: processedData,
      pagination: {
        limit: limit,
        offset: offset,
        total: processedData.length,
        hasMore: processedData.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching all cars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cars',
      error: error.message
    });
  }
});

// Get all car brands
router.get('/brands', async (req, res) => {
  try {
    const { vehicleType } = req.query;
    const table = vehicleType === 'motorcycle' ? 'moto_brands' : 'car_brands';
    const { data, error } = await supabaseClient
      .from(table)
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands',
      error: error.message
    });
  }
});

// Get models by brand ID
router.get('/brands/:brandId/models', async (req, res) => {
  try {
    const { brandId } = req.params;
    const { vehicleType } = req.query;
    const table = vehicleType === 'motorcycle' ? 'moto_models' : 'car_models';

    const { data, error } = await supabaseClient
      .from(table)
      .select('id, name')
      .eq('brand_id', brandId)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch models',
      error: error.message
    });
  }
});

// Get user's cars with photos
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .select(`
        id,
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
        car_brands (
          id,
          name
        ),
        car_models (
          id,
          name
        ),
        moto_brands (
          id,
          name
        ),
        moto_models (
          id,
          name
        ),
        car_photos (
          id,
          photo_url,
          photo_name,
          upload_order
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Process photos with proper async/await
    const processedData = await Promise.all(
      (data || []).map(async (car) => {
        // Process photos with proper async/await
        const processedPhotos = await Promise.all(
          (car.car_photos || []).map(async (photo) => ({
            ...photo,
            photo_url: await getPublicUrl(photo.photo_url)
          }))
        );

        // Sort photos by upload_order
        const sortedPhotos = processedPhotos.sort((a, b) => (a.upload_order || 0) - (b.upload_order || 0));

        return {
          ...car,
          car_photos: sortedPhotos
        };
      })
    );

    res.json({
      success: true,
      data: processedData
    });
  } catch (error) {
    console.error('Error fetching user cars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user cars',
      error: error.message
    });
  }
});

// Add new car
router.post('/user/:userId', authMiddleware, async (req, res) => {
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
      location,
      city,
      region,
      country
    } = req.body;

    // Validation
    if (!vehicleType || !year) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle type and year are required'
      });
    }

    // Check if custom vehicle type is provided when needed
    if (vehicleType === 'custom' && !customVehicleType) {
      return res.status(400).json({
        success: false,
        message: 'Custom vehicle type is required when vehicle type is custom'
      });
    }

    // Check if brand is provided (either brandId or customBrand)
    if (!brandId && !customBrand) {
      return res.status(400).json({
        success: false,
        message: 'Brand is required (either from list or custom)'
      });
    }

    // Check if model is provided (either modelId or customModel)
    if (!modelId && !customModel) {
      return res.status(400).json({
        success: false,
        message: 'Model is required (either from list or custom)'
      });
    }

    // Check if non-stock comment is provided when needed
    if (!isStock && (!nonStockComment || nonStockComment.trim() === '')) {
      return res.status(400).json({
        success: false,
        message: 'Modifications comment is required for non-stock vehicles'
      });
    }

    if (engineVolume) {
      const maxCapacity = vehicleType === 'motorcycle' ? 3.0 : 8.0;
      if (parseFloat(engineVolume) > maxCapacity) {
        return res.status(400).json({
          success: false,
          message: `Engine capacity cannot exceed ${maxCapacity}L for ${vehicleType}`
        });
      }
    }

    const carData = {
      user_id: userId,
      vehicle_type: vehicleType,
      custom_vehicle_type: vehicleType === 'custom' ? customVehicleType : null,
      year: parseInt(year),
      brand_id: vehicleType === 'car' ? (brandId || null) : null,
      custom_brand: customBrand || null,
      model_id: vehicleType === 'car' ? (modelId || null) : null,
      custom_model: customModel || null,
      moto_brand_id: vehicleType === 'motorcycle' ? (brandId || null) : null,
      moto_model_id: vehicleType === 'motorcycle' ? (modelId || null) : null,
      engine_capacity: engineVolume ? parseFloat(engineVolume) : null,
      horsepower: horsepower ? parseInt(horsepower) : null,
      is_stock: isStock,
      modifications_comment: !isStock ? nonStockComment : null,
      motorcycle_type: vehicleType === 'motorcycle' ? (motorcycleType || null) : null,
      drive_type: vehicleType === 'motorcycle' ? (driveType || null) : null,
      city: city || null,
      region: region || null,
      country: country || 'Georgia',
      // No lat/long stored
    };

    // Security: ensure the authenticated user matches the target userId
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to add a vehicle for this user'
      });
    }

    // Enforce per-user vehicle limits (max 2 cars and 2 motorcycles)
    try {
      const normalizedType = (vehicleType || '').toLowerCase();
      const limits = { car: 2, motorcycle: 2 };
      if (limits.hasOwnProperty(normalizedType)) {
        const { count, error: countError } = await supabaseAdmin
          .from('user_cars')
          .select('id', { head: true, count: 'exact' })
          .eq('user_id', userId)
          .eq('vehicle_type', normalizedType);

        if (countError) {
          throw countError;
        }

        if ((count || 0) >= limits[normalizedType]) {
          return res.status(400).json({
            success: false,
            message: `You can only add up to ${limits[normalizedType]} ${normalizedType === 'car' ? 'cars' : 'motorcycles'}`
          });
        }
      }
    } catch (limitErr) {
      console.error('Vehicle limit check failed:', limitErr);
      return res.status(500).json({
        success: false,
        message: 'Failed to validate vehicle limits'
      });
    }

    // Use admin client to bypass RLS after verifying auth
    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .insert([carData])
      .select('*')
      .single();

    if (error) throw error;

    // Now fetch the complete car data with brand and model names
    const { data: completeCarData, error: fetchError } = await supabaseAdmin
      .from('user_cars')
      .select(`
        id,
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
        created_at,
        car_brands!brand_id (
          id,
          name
        ),
        car_models!model_id (
          id,
          name
        ),
        moto_brands!moto_brand_id (
          id,
          name
        ),
        moto_models!moto_model_id (
          id,
          name
        )
      `)
      .eq('id', data.id)
      .single();

    if (fetchError) {
      console.error('Error fetching complete car data:', fetchError);
      return res.status(201).json({
        success: true,
        message: 'Car added successfully',
        data: data
      });
    }

    res.status(201).json({
      success: true,
      message: 'Car added successfully',
      data: completeCarData
    });
  } catch (error) {
    console.error('Error adding car:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add car',
      error: error.message
    });
  }
});

// Add this route to your backend cars.js file, preferably near the top after the /all route

router.get('/:carId', async (req, res) => {
  try {
    const { carId } = req.params;
    const includeOwner = req.query.includeOwner === 'true';
    
    // Debug: First check if the car exists at all
    const { data: debugData, error: debugError } = await supabaseAdmin
      .from('user_cars')
      .select('*')
      .eq('id', carId)
      .single();

    let selectQuery = `
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
      car_brands (
        id,
        name
      ),
      car_models (
        id,
        name
      ),
      moto_brands (
        id,
        name
      ),
      moto_models (
        id,
        name
      ),
      car_photos (
        id,
        photo_url,
        photo_name,
        upload_order
      )
    `;

    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .select(selectQuery)
      .eq('id', carId)
      .single();

    if (error) {
      console.log('🔍 Supabase error:', error);
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          message: 'Car not found'
        });
      }
      throw error;
    }

    // If owner info is requested, fetch it separately
    let ownerData = null;
    if (includeOwner && data.user_id) {
      
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, username, first_name, last_name')
        .eq('id', data.user_id)
        .single();

      if (!profileError && profileData) {
        ownerData = profileData;
      } else {
        console.log('🔍 No owner profile found or error:', profileError);
      }
    }

    // Process photos with proper async/await
    const processedPhotos = await Promise.all(
      (data.car_photos || []).map(async (photo) => ({
        ...photo,
        photo_url: await getPublicUrl(photo.photo_url)
      }))
    );

    // Sort photos by upload_order
    const sortedPhotos = processedPhotos.sort((a, b) => (a.upload_order || 0) - (b.upload_order || 0));

    // Combine car data with owner info
    let processedData = {
      ...data,
      car_photos: sortedPhotos
    };

    // Add owner information if available
    if (ownerData) {
      processedData = {
        ...processedData,
        username: ownerData.username,
        first_name: ownerData.first_name,
        last_name: ownerData.last_name,
        owner_id: ownerData.id
      };
    }

    res.json({
      success: true,
      data: processedData
    });
  } catch (error) {
    console.error('Error fetching car:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch car',
      error: error.message
    });
  }
});

// Upload car photos
router.post('/photos/upload', upload.array('photos', 10), async (req, res) => {
  try {
    const { carId, userId } = req.body;
    const files = req.files;

    if (!carId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Car ID and User ID are required'
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Verify that the car belongs to the user (use admin to bypass RLS)
    const { data: carData, error: carError } = await supabaseAdmin
      .from('user_cars')
      .select('id, user_id')
      .eq('id', carId)
      .single();

    if (carError || !carData || carData.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Car not found or you do not have permission to upload photos'
      });
    }

    const uploadedPhotos = [];
    const uploadPromises = files.map(async (file, index) => {
      try {
        // Generate unique filename
        const fileExtension = path.extname(file.originalname);
        const fileName = `${userId}/${carId}/${uuidv4()}${fileExtension}`;

        // Upload to Supabase Storage with admin client to avoid permissions issues
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('car-photos')
          .upload(fileName, file.buffer, {
            contentType: file.mimetype,
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw uploadError;
        }

        // Create a signed URL for 1 year (works with private buckets)
        const { data: signedData, error: signedErr } = await supabaseAdmin.storage
          .from('car-photos')
          .createSignedUrl(fileName, 31536000);

        // Save photo record to database - store just the filename, not full URL
        const { data: photoData, error: photoError } = await supabaseAdmin
          .from('car_photos')
          .insert([{
            car_id: carId,
            photo_url: fileName, // Store just the filename
            photo_name: file.originalname,
            file_size: file.size,
            mime_type: file.mimetype,
            upload_order: index
          }])
          .select()
          .single();

        if (photoError) {
          console.error('Database insert error:', photoError);
          throw photoError;
        }

        return {
          ...photoData,
          photo_url: signedErr ? null : signedData?.signedUrl // Return signed URL if available
        };
      } catch (error) {
        console.error('Error uploading photo:', error);
        throw error;
      }
    });

    const results = await Promise.all(uploadPromises);
    uploadedPhotos.push(...results);

    res.json({
      success: true,
      message: `${uploadedPhotos.length} photos uploaded successfully`,
      data: uploadedPhotos
    });

  } catch (error) {
    console.error('Error uploading photos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload photos',
      error: error.message
    });
  }
});

// Delete a photo
router.delete('/photos/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get photo info and verify ownership
    const { data: photoData, error: photoError } = await supabaseClient
      .from('car_photos')
      .select(`
        id,
        photo_url,
        car_id,
        user_cars!inner (
          user_id
        )
      `)
      .eq('id', photoId)
      .eq('user_cars.user_id', userId)
      .single();

    if (photoError || !photoData) {
      return res.status(403).json({
        success: false,
        message: 'Photo not found or you do not have permission to delete it'
      });
    }

    let fileName = photoData.photo_url;

    // Delete from storage
    const { error: storageError } = await supabaseClient.storage
      .from('car-photos')
      .remove([fileName]);

    if (storageError) {
      console.error('Error deleting from storage:', storageError);
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    const { error: deleteError } = await supabaseClient
      .from('car_photos')
      .delete()
      .eq('id', photoId);

    if (deleteError) throw deleteError;

    res.json({
      success: true,
      message: 'Photo deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete photo',
      error: error.message
    });
  }
});
router.put('/user/:userId/:carId', async (req, res) => {
  try {
    const { userId, carId } = req.params;
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
      nonStockComment
    } = req.body;

    const carData = {
      vehicle_type: vehicleType,
      custom_vehicle_type: vehicleType === 'custom' ? customVehicleType : null,
      year: parseInt(year),
      brand_id: vehicleType === 'car' ? (brandId || null) : null,
      custom_brand: customBrand || null,
      model_id: vehicleType === 'car' ? (modelId || null) : null,
      custom_model: customModel || null,
      moto_brand_id: vehicleType === 'motorcycle' ? (brandId || null) : null,
      moto_model_id: vehicleType === 'motorcycle' ? (modelId || null) : null,
      engine_capacity: engineVolume ? parseFloat(engineVolume) : null,
      horsepower: horsepower ? parseInt(horsepower) : null,
      is_stock: isStock,
      modifications_comment: !isStock ? nonStockComment : null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabaseClient
      .from('user_cars')
      .update(carData)
      .eq('id', carId)
      .eq('user_id', userId)
      .select(`
        id,
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
        created_at,
        updated_at,
        car_brands (
          id,
          name
        ),
        car_models (
          id,
          name
        ),
        moto_brands (
          id,
          name
        ),
        moto_models (
          id,
          name
        )
      `);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Car not found or you do not have permission to update it'
      });
    }

    res.json({
      success: true,
      message: 'Car updated successfully',
      data: data[0]
    });
  } catch (error) {
    console.error('Error updating car:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update car',
      error: error.message
    });
  }
});

// Delete car
// Note: This route validates ownership using the :userId param and database check.
// Auth is optional to preserve previous behavior in clients that don't send tokens.
router.delete('/user/:userId/:carId', async (req, res) => {
  try {
    const { userId, carId } = req.params;

    // Verify the car exists and belongs to the user
    const { data: carRow, error: carErr } = await supabaseAdmin
      .from('user_cars')
      .select('id, user_id')
      .eq('id', carId)
      .single();

    if (carErr || !carRow) {
      return res.status(404).json({ success: false, message: 'Car not found' });
    }
    if (carRow.user_id !== userId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this car' });
    }

    // First, get all photos associated with the car and delete from storage
    const { data: photos, error: photosError } = await supabaseAdmin
      .from('car_photos')
      .select('photo_url')
      .eq('car_id', carId);

    if (!photosError && photos && photos.length > 0) {
      const fileNames = photos.map(photo => photo.photo_url).filter(Boolean);

      if (fileNames.length > 0) {
        const { error: storageError } = await supabaseAdmin.storage
          .from('car-photos')
          .remove(fileNames);

        if (storageError) {
          console.error('Error deleting photos from storage:', storageError);
        }
      }
    }

    // Delete the car
    const { data, error } = await supabaseAdmin
      .from('user_cars')
      .delete()
      .eq('id', carId)
      .select('id');

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Car not found or you do not have permission to delete it'
      });
    }

    res.json({
      success: true,
      message: 'Car deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting car:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete car',
      error: error.message
    });
  }
});

// Test endpoint to check photo URL generation
router.get('/test-photo/:carId', async (req, res) => {
  try {
    const { carId } = req.params;
    
    const { data: photos, error } = await supabaseClient
      .from('car_photos')
      .select('*')
      .eq('car_id', carId);
    
    if (error) throw error;
    
    const processedPhotos = await Promise.all(
      photos.map(async photo => {
        const publicUrl = await getPublicUrl(photo.photo_url);
        
        return {
          original: photo,
          fileName: photo.photo_url,
          generatedUrl: publicUrl
        };
      })
    );
    
    res.json({
      success: true,
      data: processedPhotos
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;