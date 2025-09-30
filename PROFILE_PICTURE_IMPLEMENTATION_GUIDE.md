# Profile Picture Implementation Guide

## Overview
This guide shows how to add profile pictures throughout your app with upload, delete, and full-screen view capabilities.

## Files Created

### 1. Profile Picture Service
**Location:** `frontend/src/services/profilePictureService.js`
- Handles image picking, uploading to Supabase storage, and deletion
- Methods: `pickImage()`, `uploadProfilePicture()`, `deleteProfilePicture()`, `getProfilePictureUrl()`, `getProfilePictureUrls()`

### 2. ProfilePicture Component
**Location:** `frontend/src/components/ProfilePicture.js`
- Reusable component that displays profile pictures
- Supports full-screen viewer with pinch-to-zoom
- Props:
  - `uri`: Image URL
  - `size`: Size in pixels (default: 64)
  - `showFullScreen`: Enable tap-to-view full screen (default: true)
  - `onPress`: Custom press handler
  - `iconName`: Ionicons name for placeholder (default: 'person')

## Database Setup

You need to add profile picture columns to your `user_profiles` table:

```sql
ALTER TABLE user_profiles 
ADD COLUMN profile_picture_url TEXT,
ADD COLUMN profile_picture_path TEXT;
```

## Storage Setup

Create a Supabase storage bucket named `profile-pictures`:

1. Go to Supabase Dashboard → Storage
2. Create new bucket: `profile-pictures`
3. Set it to **public** (or configure RLS policies as needed)

## Implementation Steps

### Step 1: MainScreen Profile Section

Add these imports to `MainScreen.js`:
```javascript
import ProfilePicture from '../components/ProfilePicture';
import profilePictureService from '../services/profilePictureService';
```

Add state variables inside the MainScreen component:
```javascript
const [profilePictureUrl, setProfilePictureUrl] = useState(null);
const [uploadingProfilePicture, setUploadingProfilePicture] = useState(false);
```

Add useEffect to load profile picture:
```javascript
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

Add upload handler:
```javascript
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
```

Add delete handler:
```javascript
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

Update the `renderProfile()` function to include profile picture:
```javascript
const renderProfile = () => (
  <ScrollView
    style={styles.profileContainer}
    showsVerticalScrollIndicator={false}
    refreshControl={
      <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    }
  >
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
        {profile?.first_name || user?.first_name || 'User'}
      </Text>
      <Text style={styles.profileUsername}>@{profile?.username || user?.username || 'username'}</Text>
    </View>
    {/* Rest of profile content... */}
  </ScrollView>
);
```

Add these styles to MainScreen styles:
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

### Step 2: Dashboard (Leaderboard Entries)

In the `renderDashboard()` function, add profile pictures to each leaderboard entry.

First, fetch profile pictures for all users in the leaderboard:
```javascript
const [leaderboardProfilePics, setLeaderboardProfilePics] = useState({});

useEffect(() => {
  if (activeTab !== 'dashboard' || !dashboardRuns?.length) return;
  
  const loadProfilePics = async () => {
    const userIds = [...new Set(dashboardRuns.map(r => r.user_id).filter(Boolean))];
    if (userIds.length === 0) return;
    
    const pics = await profilePictureService.getProfilePictureUrls(userIds);
    setLeaderboardProfilePics(pics);
  };
  
  loadProfilePics();
}, [activeTab, dashboardRuns]);
```

Then in your leaderboard entry rendering:
```javascript
<View style={styles.runCard}>
  <View style={styles.runHeader}>
    <ProfilePicture
      uri={leaderboardProfilePics[run.user_id]}
      size={40}
      showFullScreen={false}
      onPress={() => goToProfile && goToProfile({ userId: run.user_id, username: run.username })}
    />
    <Text style={styles.runUsername}>@{run.username}</Text>
  </View>
  {/* Rest of run card content... */}
</View>
```

### Step 3: ChatInboxScreen

Add profile pictures to conversation list items:
```javascript
import ProfilePicture from '../components/ProfilePicture';
import profilePictureService from '../services/profilePictureService';

// Inside component:
const [profilePictures, setProfilePictures] = useState({});

useEffect(() => {
  if (!conversationsData?.length) return;
  
  const loadPics = async () => {
    const userIds = conversationsData.map(c => c.otherUser?.id).filter(Boolean);
    if (userIds.length === 0) return;
    
    const pics = await profilePictureService.getProfilePictureUrls(userIds);
    setProfilePictures(pics);
  };
  
  loadPics();
}, [conversationsData]);

// In renderItem:
<TouchableOpacity style={styles.conversationItem} onPress={() => goToThread(conv)}>
  <ProfilePicture
    uri={profilePictures[conv.otherUser?.id]}
    size={50}
    showFullScreen={false}
    onPress={() => goToProfile && goToProfile({ 
      userId: conv.otherUser?.id, 
      username: conv.otherUser?.username 
    })}
  />
  <View style={styles.conversationInfo}>
    <Text style={styles.conversationUsername}>@{conv.otherUser?.username}</Text>
    <Text style={styles.lastMessage}>{conv.lastMessagePreview}</Text>
  </View>
  {conv.unread_count > 0 && (
    <View style={styles.unreadBadge}>
      <Text style={styles.unreadText}>{conv.unread_count}</Text>
    </View>
  )}
</TouchableOpacity>
```

### Step 4: ChatThreadScreen

Add profile picture to chat header:
```javascript
import ProfilePicture from '../components/ProfilePicture';
import profilePictureService from '../services/profilePictureService';

// Inside component:
const [peerProfilePicture, setPeerProfilePicture] = useState(null);

useEffect(() => {
  if (!peer?.id) return;
  
  const loadPic = async () => {
    const url = await profilePictureService.getProfilePictureUrl(peer.id);
    setPeerProfilePicture(url);
  };
  
  loadPic();
}, [peer?.id]);

// In header:
<View style={styles.header}>
  <TouchableOpacity onPress={goBack}>
    <Ionicons name="arrow-back" size={24} color="#000" />
  </TouchableOpacity>
  
  <TouchableOpacity 
    style={styles.headerCenter}
    onPress={() => goToProfile && goToProfile({ userId: peer?.id, username: peer?.username })}
  >
    <ProfilePicture
      uri={peerProfilePicture}
      size={36}
      showFullScreen={false}
    />
    <Text style={styles.headerTitle}>@{peer?.username || 'user'}</Text>
  </TouchableOpacity>
  
  <View style={{ width: 24 }} />
</View>
```

## Testing

1. **Upload**: Go to Profile tab → Tap the + button → Select image → Verify upload
2. **View**: Tap on any profile picture → Should open full-screen with pinch-to-zoom
3. **Delete**: Go to Profile tab → Tap trash icon → Confirm deletion
4. **Display**: Check that profile pictures appear in:
   - Profile screen header
   - Dashboard leaderboard entries
   - Chat inbox conversations
   - Chat thread header

## Troubleshooting

### Images not uploading
- Check Supabase storage bucket exists and is public
- Verify `profile-pictures` bucket name matches in service
- Check image picker permissions

### Images not displaying
- Verify `profile_picture_url` column exists in `user_profiles` table
- Check console for URL fetch errors
- Ensure URLs are publicly accessible

### Full-screen viewer not working
- Verify `react-native-reanimated` is properly configured
- Check gesture handler setup in your app

## Notes

- Profile pictures are stored in Supabase Storage under `profile-pictures/{userId}/`
- Old pictures are automatically deleted when uploading new ones
- Images are compressed to quality 0.8 during upload
- Aspect ratio is enforced to 1:1 (square) during selection
