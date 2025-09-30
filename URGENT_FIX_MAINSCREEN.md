# URGENT: MainScreen.js Recovery

## Problem
The MainScreen.js file is completely broken. The component declaration is missing, causing the error:
```
'return' outside of function. (2324:0)
```

## Solution: Restore from Git

### Step 1: Restore the Original File
```bash
cd c:\Users\matel\OneDrive\Desktop\aba-damideqi-app
git checkout frontend/src/screens/MainScreen.js
```

This will restore the working version of MainScreen.js.

### Step 2: Verify the App Runs
```bash
npm start
```

Make sure the app builds and runs without errors.

### Step 3: Add Profile Picture Support (After Restoration)

Once the file is restored and working, follow these steps to add profile picture functionality:

#### A. Add Imports (at the top with other imports)
```javascript
import ProfilePicture from '../components/ProfilePicture';
import profilePictureService from '../services/profilePictureService';
```

Also ensure `ActivityIndicator` is imported from 'react-native':
```javascript
import {
  View,
  Text,
  // ... other imports
  ActivityIndicator,  // Add this if not present
} from 'react-native';
```

#### B. Add State Variables (inside MainScreen component, with other useState declarations)
```javascript
const [profilePictureUrl, setProfilePictureUrl] = useState(null);
const [uploadingProfilePicture, setUploadingProfilePicture] = useState(false);
```

#### C. Add useEffect to Load Profile Picture (with other useEffects)
```javascript
// Load profile picture on mount
useEffect(() => {
  if (!user?.id || isPreview) return;
  const loadProfilePicture = async () => {
    try {
      const url = await profilePictureService.getProfilePictureUrl(user.id);
      setProfilePictureUrl(url);
    } catch (error) {
      console.warn('[MainScreen] Error loading profile picture:', error);
    }
  };
  loadProfilePicture();
}, [user?.id, isPreview]);
```

#### D. Add Handler Functions (before the render functions)
```javascript
// Handle profile picture upload
const handleUploadProfilePicture = async () => {
  try {
    setUploadingProfilePicture(true);
    const imageAsset = await profilePictureService.pickImage();
    
    if (!imageAsset) {
      setUploadingProfilePicture(false);
      return;
    }

    const result = await profilePictureService.uploadProfilePicture(user.id, imageAsset);
    setProfilePictureUrl(result.url);
    Alert.alert('Success', 'Profile picture uploaded successfully');
  } catch (error) {
    console.error('[MainScreen] Error uploading profile picture:', error);
    Alert.alert('Error', error.message || 'Failed to upload profile picture');
  } finally {
    setUploadingProfilePicture(false);
  }
};

// Handle profile picture delete
const handleDeleteProfilePicture = async () => {
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
            await profilePictureService.deleteProfilePicture(user.id);
            setProfilePictureUrl(null);
            Alert.alert('Success', 'Profile picture deleted successfully');
          } catch (error) {
            console.error('[MainScreen] Error deleting profile picture:', error);
            Alert.alert('Error', error.message || 'Failed to delete profile picture');
          }
        },
      },
    ]
  );
};
```

#### E. Update renderProfile() Function

Find the `renderProfile` function and update the Profile Header section:

**Replace this:**
```javascript
{/* Profile Header */}
<View style={styles.profileHeader}>
  <Text style={styles.profileName}>
    {profile?.first_name || user?.first_name || profile?.firstName || user?.firstName || 'User'}
  </Text>
  <Text style={styles.profileUsername}>@{profile?.username || user?.username || 'username'}</Text>
</View>
```

**With this:**
```javascript
{/* Profile Header */}
<View style={styles.profileHeader}>
  <View style={styles.profilePictureContainer}>
    <ProfilePicture
      uri={profilePictureUrl}
      size={100}
      showFullScreen={true}
      iconName="person"
    />
    {uploadingProfilePicture && (
      <View style={styles.uploadingOverlay}>
        <ActivityIndicator size="small" color="#fff" />
      </View>
    )}
    <View style={styles.profilePictureActions}>
      <TouchableOpacity
        style={styles.profilePictureButton}
        onPress={handleUploadProfilePicture}
        disabled={uploadingProfilePicture}
      >
        <Ionicons name={profilePictureUrl ? "camera" : "add"} size={16} color="#fff" />
      </TouchableOpacity>
      {profilePictureUrl && (
        <TouchableOpacity
          style={[styles.profilePictureButton, styles.deleteButton]}
          onPress={handleDeleteProfilePicture}
          disabled={uploadingProfilePicture}
        >
          <Ionicons name="trash" size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  </View>
  <Text style={styles.profileName}>
    {profile?.first_name || user?.first_name || profile?.firstName || user?.firstName || 'User'}
  </Text>
  <Text style={styles.profileUsername}>@{profile?.username || user?.username || 'username'}</Text>
</View>
```

#### F. Add Styles (in the StyleSheet.create at the bottom)

Add these new styles to the styles object:
```javascript
profilePictureContainer: {
  alignItems: 'center',
  marginBottom: 16,
},
profilePictureActions: {
  flexDirection: 'row',
  marginTop: 12,
  gap: 12,
},
profilePictureButton: {
  backgroundColor: '#000',
  width: 40,
  height: 40,
  borderRadius: 20,
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: '#fff',
},
deleteButton: {
  backgroundColor: '#ff4757',
},
uploadingOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: 50,
},
```

## Quick Steps Summary

1. ✅ Restore file: `git checkout frontend/src/screens/MainScreen.js`
2. ✅ Verify app runs
3. ✅ Add imports
4. ✅ Add state variables
5. ✅ Add useEffect
6. ✅ Add handler functions
7. ✅ Update renderProfile()
8. ✅ Add styles
9. ✅ Test!

## After These Changes

You'll have:
- Profile picture display in Profile tab
- Upload button (+ icon when no picture, camera icon when picture exists)
- Delete button (trash icon, only shows when picture exists)
- Full-screen viewer when tapping picture
- Loading indicator during upload

For adding profile pictures to other screens (Dashboard, Chat), see:
`PROFILE_PICTURE_IMPLEMENTATION_GUIDE.md`
