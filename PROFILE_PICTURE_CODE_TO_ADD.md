# Profile Picture Code to Add to MainScreen.js

## ✅ Already Added:
1. Imports (lines 40-41)
2. State variables (lines 104-106)
3. useEffect to load profile picture (lines 108-115)

## 📝 Code to Add Manually:

### Step 1: Add Handler Functions (after line 1178, after handleSaveLocation function)

```javascript
  // Handler for profile picture upload
  const handleUploadProfilePicture = async () => {
    if (!user?.id) return;
    
    try {
      setUploadingProfilePicture(true);
      
      const imageAsset = await profilePictureService.pickImage();
      if (!imageAsset) {
        setUploadingProfilePicture(false);
        return;
      }
      
      const result = await profilePictureService.uploadProfilePicture(user.id, imageAsset);
      
      if (result?.url) {
        setProfilePictureUrl(result.url);
        Alert.alert('Success', 'Profile picture updated successfully!');
      }
    } catch (error) {
      console.error('[MainScreen] Error uploading profile picture:', error);
      Alert.alert('Error', error.message || 'Failed to upload profile picture');
    } finally {
      setUploadingProfilePicture(false);
    }
  };

  // Handler for profile picture deletion
  const handleDeleteProfilePicture = async () => {
    if (!user?.id || !profilePictureUrl) return;
    
    Alert.alert(
      'Delete Profile Picture',
      'Are you sure you want to delete your profile picture?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploadingProfilePicture(true);
              await profilePictureService.deleteProfilePicture(user.id);
              setProfilePictureUrl(null);
              Alert.alert('Success', 'Profile picture deleted');
            } catch (error) {
              console.error('[MainScreen] Error deleting profile picture:', error);
              Alert.alert('Error', 'Failed to delete profile picture');
            } finally {
              setUploadingProfilePicture(false);
            }
          }
        }
      ]
    );
  };
```

### Step 2: Add UI to Profile Tab (in renderMyCars function, after line 1990, BEFORE the "Profile Location Editor" section)

```javascript
      {/* Profile Picture Section */}
      <View style={styles.profilePictureCard}>
        <Text style={styles.profileLocationTitle}>Profile Picture</Text>
        <View style={styles.profilePictureContainer}>
          <ProfilePicture
            uri={profilePictureUrl}
            size={100}
            showFullScreen={true}
          />
          <View style={styles.profilePictureActions}>
            <TouchableOpacity
              style={[styles.uploadPictureButton, uploadingProfilePicture && styles.disabledButton]}
              onPress={handleUploadProfilePicture}
              disabled={uploadingProfilePicture}
            >
              <Ionicons name="camera" size={moderateScale(16)} color="#fff" />
              <Text style={styles.uploadPictureButtonText}>
                {uploadingProfilePicture ? 'Uploading...' : profilePictureUrl ? 'Change' : 'Upload'}
              </Text>
            </TouchableOpacity>
            {profilePictureUrl && (
              <TouchableOpacity
                style={[styles.deletePictureButton, uploadingProfilePicture && styles.disabledButton]}
                onPress={handleDeleteProfilePicture}
                disabled={uploadingProfilePicture}
              >
                <Ionicons name="trash" size={moderateScale(16)} color="#fff" />
                <Text style={styles.deletePictureButtonText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
```

### Step 3: Add Styles (at the end of the styles object, before the closing brace)

```javascript
  profilePictureCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profilePictureContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  profilePictureActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  uploadPictureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  uploadPictureButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  deletePictureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc3545',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  deletePictureButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
```

## 🎯 Summary

**What's Already Done:**
- ✅ profilePictureService.js is complete
- ✅ ProfilePicture component exists
- ✅ Imports added to MainScreen.js
- ✅ State variables added
- ✅ Profile picture loading effect added
- ✅ chatService import fixed
- ✅ eventService.getAllEvents fixed to not require auth

**What You Need to Do:**
1. Add the two handler functions after line 1178
2. Add the UI section in renderMyCars function
3. Add the styles at the end of the StyleSheet

The profile picture functionality will then be fully integrated!
