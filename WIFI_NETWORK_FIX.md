# WiFi Network Change Fix

## Problem:
When switching WiFi networks and reopening the app, you get:
- `Network request failed` errors
- Socket connection timeouts
- Failed API calls for cars, events, etc.

## Root Cause:
React Native's network stack doesn't automatically reset when WiFi changes. The app tries to use the old network connection which fails.

## ✅ Solution Applied:

### 1. **Socket Reconnection** (Line 554-557)
When app becomes active, check if socket is disconnected and reconnect:
```javascript
if (!socket.connected) {
  socket.connect()
}
```

### 2. **Query Refetch** (Line 563)
Refetch all active queries when app becomes active:
```javascript
queryClient.refetchQueries({ type: 'active' }).catch(() => {})
```

### 3. **Subscription Status Refresh** (Line 561)
Ensure subscription status is fresh:
```javascript
refetchUserStatus().catch(() => {})
```

## How It Works:

1. **User switches WiFi** → Old network connection breaks
2. **User reopens app** → `AppState` changes to 'active'
3. **Socket reconnects** → New network connection established
4. **All queries refetch** → Fresh data loaded
5. **App works normally** → No more network errors!

## Testing:
1. Open the app on WiFi A
2. Close the app (kill it)
3. Switch to WiFi B
4. Reopen the app
5. ✅ Everything should load without errors

## Additional Benefits:
- ✅ Handles mobile data ↔ WiFi switches
- ✅ Handles airplane mode recovery
- ✅ Handles network interruptions
- ✅ Subscription status stays fresh

## Files Modified:
- `frontend/App.js` (lines 552-564)

The app now gracefully handles all network changes!
