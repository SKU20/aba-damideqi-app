# Profile Picture Migration Instructions

## ✅ What's Been Done:

### Frontend Changes:
1. ✅ Profile picture upload/delete functionality added to MainScreen Profile tab
2. ✅ Profile pictures display in Dashboard leaderboard with rank badges
3. ✅ Profile pictures added to ProfileScreen
4. ✅ Chat service updated to include profile pictures
5. ✅ Fixed React Native Reanimated gesture handler issues

### Backend Changes Needed:
You need to run the SQL migration to:
1. Add profile_picture columns to user_profiles table
2. Update the chat RPC function to return profile pictures

## 🔧 How to Run the Migration:

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `backend/migrations/add_profile_pictures.sql`
4. Paste and run the SQL

### Option 2: Via Command Line
```bash
cd backend
# If you have Supabase CLI installed:
supabase db push
```

## 📝 Migration File Location:
`backend/migrations/add_profile_pictures.sql`

## 🎯 What the Migration Does:

1. **Adds columns to user_profiles table:**
   - `profile_picture_url` - Public URL of the profile picture
   - `profile_picture_path` - Storage path for deletion

2. **Creates index** for faster profile picture lookups

3. **Updates RPC function** `list_conversations_with_unread` to include:
   - `other_profile_picture` field for chat inbox

## ✅ After Migration:

### Profile Pictures Will Appear In:
- ✅ **Profile Tab** - Centered at top with upload/delete buttons
- ✅ **Dashboard/Leaderboard** - Next to each user with rank badge overlay
- ✅ **Chat Inbox** - Next to each conversation (after you add ProfilePicture component)
- ✅ **ProfileScreen** - Already implemented
- ✅ **Car Profile** - When viewing other users' cars

### Test the Upload:
1. Go to Profile tab
2. Click "Upload" button
3. Select an image
4. Image should upload and display immediately
5. You can click the image to view full-screen with pinch-to-zoom
6. Delete button appears after upload

## 🔍 Troubleshooting:

### If images don't appear after migration:
1. Check Supabase Storage bucket `profile-pictures` exists
2. Verify RLS policies allow public read access
3. Check browser console for errors

### If upload fails:
1. Verify Supabase storage is configured
2. Check that the bucket has proper permissions
3. Ensure user is authenticated

## 📊 Database Schema After Migration:

```sql
user_profiles table:
- id (UUID, primary key)
- username (TEXT)
- first_name (TEXT)
- last_name (TEXT)
- profile_picture_url (TEXT) ← NEW
- profile_picture_path (TEXT) ← NEW
- ... other columns
```

## 🎨 UI Features:

### Profile Tab:
- Centered profile picture (80px)
- Name and username below
- Upload/Change button
- Delete button (when picture exists)

### Dashboard:
- Profile picture (50px) with rank badge overlay
- Gold/Silver/Bronze badges for top 3
- Black badge for others
- Compact, space-efficient layout

### Full-Screen Viewer:
- Tap any profile picture to view full-screen
- Pinch to zoom (1x to 4x)
- Pan when zoomed in
- Close button to exit

## 🚀 Ready to Go!

Once you run the migration, all profile picture functionality will be live!
