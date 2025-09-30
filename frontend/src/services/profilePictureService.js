// src/services/profilePictureService.js
import { supabase } from './supabaseClient';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const PROFILE_PICTURES_BUCKET = 'profile-pictures';

class ProfilePictureService {
  /**
   * Request permission and pick image from library
   */
  async pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Permission to access media library was denied');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) {
        return null;
      }

      return result.assets[0];
    } catch (error) {
      console.error('[ProfilePicture] Error picking image:', error);
      throw error;
    }
  }

  /**
   * Upload profile picture to Supabase storage
   */
  async uploadProfilePicture(userId, imageAsset) {
    try {
      if (!userId || !imageAsset?.uri) {
        throw new Error('Invalid userId or image');
      }

      // Generate unique filename
      const fileExt = imageAsset.uri.split('.').pop() || 'jpg';
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Create FormData for upload
      const formData = new FormData();
      formData.append('file', {
        uri: imageAsset.uri,
        type: `image/${fileExt}`,
        name: fileName,
      });

      // Upload to Supabase storage using arraybuffer
      const response = await fetch(imageAsset.uri);
      const arrayBuffer = await response.arrayBuffer();
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(PROFILE_PICTURES_BUCKET)
        .upload(filePath, arrayBuffer, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(PROFILE_PICTURES_BUCKET)
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl;

      if (!publicUrl) {
        throw new Error('Failed to get public URL');
      }

      // Update user profile with new picture URL
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          profile_picture_url: publicUrl,
          profile_picture_path: filePath,
        })
        .eq('id', userId);

      if (updateError) {
        // Try to clean up uploaded file
        await this.deleteFromStorage(filePath);
        throw updateError;
      }

      return {
        url: publicUrl,
        path: filePath,
      };
    } catch (error) {
      console.error('[ProfilePicture] Error uploading:', error);
      throw error;
    }
  }

  /**
   * Delete profile picture from storage
   */
  async deleteFromStorage(filePath) {
    try {
      if (!filePath) return;

      const { error } = await supabase.storage
        .from(PROFILE_PICTURES_BUCKET)
        .remove([filePath]);

      if (error) {
        console.warn('[ProfilePicture] Error deleting from storage:', error);
      }
    } catch (error) {
      console.warn('[ProfilePicture] Error deleting from storage:', error);
    }
  }

  /**
   * Delete user's profile picture
   */
  async deleteProfilePicture(userId) {
    try {
      if (!userId) {
        throw new Error('Invalid userId');
      }

      // Get current profile picture path
      const { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('profile_picture_path')
        .eq('id', userId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const oldPath = profile?.profile_picture_path;

      // Update user profile to remove picture
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ 
          profile_picture_url: null,
          profile_picture_path: null,
        })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      // Delete from storage
      if (oldPath) {
        await this.deleteFromStorage(oldPath);
      }

      return true;
    } catch (error) {
      console.error('[ProfilePicture] Error deleting profile picture:', error);
      throw error;
    }
  }

  /**
   * Get user's profile picture URL
   */
  async getProfilePictureUrl(userId) {
    try {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('profile_picture_url')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[ProfilePicture] Error fetching profile picture:', error);
        return null;
      }

      return data?.profile_picture_url || null;
    } catch (error) {
      console.warn('[ProfilePicture] Error fetching profile picture:', error);
      return null;
    }
  }

  /**
   * Get multiple users' profile pictures
   */
  async getProfilePictureUrls(userIds) {
    try {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return {};
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, profile_picture_url')
        .in('id', userIds);

      if (error) {
        console.warn('[ProfilePicture] Error fetching profile pictures:', error);
        return {};
      }

      // Convert to map
      const map = {};
      (data || []).forEach(item => {
        if (item.id && item.profile_picture_url) {
          map[item.id] = item.profile_picture_url;
        }
      });

      return map;
    } catch (error) {
      console.warn('[ProfilePicture] Error fetching profile pictures:', error);
      return {};
    }
  }
}

export default new ProfilePictureService();
