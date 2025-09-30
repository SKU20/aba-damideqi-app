# MainScreen.js Fix Required

## Problem
The MainScreen.js file has been corrupted. State declarations (lines 48-58) are outside the component function.

## How to Fix

### Option 1: Restore from Git
```bash
cd c:\Users\matel\OneDrive\Desktop\aba-damideqi-app
git checkout frontend/src/screens/MainScreen.js
```

Then manually add the profile picture implementation following the guide in `PROFILE_PICTURE_IMPLEMENTATION_GUIDE.md`.

### Option 2: Manual Fix

Find the line that starts with:
```javascript
const MainScreen = ({ selectedLanguage, setSelectedLanguage, user, profile, navigation, route, onLogout, ...
```

The corrupted lines 48-58 need to be MOVED INSIDE the MainScreen component, right after the component declaration.

**Currently (WRONG):**
```javascript
const { width, height } = Dimensions.get('window');

// derive events loading from query flag
const [refreshing, setRefreshing] = useState(false);  // ❌ OUTSIDE COMPONENT
const [dashboardVehicle, setDashboardVehicle] = useState('car');  // ❌ OUTSIDE COMPONENT
// ... more state declarations ...

const {
  data: userCarsInfiniteData,  // ❌ OUTSIDE COMPONENT
  // ... query code
} = useInfiniteQuery({ ... });
```

**Should be (CORRECT):**
```javascript
const { width, height } = Dimensions.get('window');

const isSmallDevice = width < 360;
const isMediumDevice = width < 400;

// Scaling helpers
function scale(size) { ... }
function verticalScale(size) { ... }
function moderateScale(size, factor = 0.5) { ... }

const MainScreen = ({ selectedLanguage, setSelectedLanguage, user, profile, ... }) => {
  // ✅ State declarations INSIDE component
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardVehicle, setDashboardVehicle] = useState('car');
  const [dashboardRange, setDashboardRange] = useState('0-100');
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [signedUrlMap, setSignedUrlMap] = useState({});
  const emergencyAttemptedRef = useRef(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [uploadingProfilePicture, setUploadingProfilePicture] = useState(false);
  
  // ✅ Queries INSIDE component
  const {
    data: userCarsInfiniteData,
    isLoading: userCarsLoading,
    // ...
  } = useInfiniteQuery({ ... });
  
  // ... rest of component code
};
```

## After Fixing

Once the file structure is correct, add the profile picture functionality by following the step-by-step guide in:
`PROFILE_PICTURE_IMPLEMENTATION_GUIDE.md`

## Quick Verification

After fixing, the file should have this structure:
1. Imports (lines 1-41)
2. Constants (width, height, device checks)
3. Helper functions (scale, verticalScale, moderateScale)
4. **MainScreen component starts here** ← All state/hooks go inside this
5. Component logic and render
6. Styles object
7. Export default MainScreen
