# Google Sign-In Setup Checklist

## Phase 1: Preparation (5 minutes)

### Google Cloud Console
- [ ] Go to https://console.cloud.google.com/
- [ ] Create new project or select existing
- [ ] Project name: "Trading AI News" (or similar)
- [ ] Enable Google+ API
  - [ ] Search "Google+ API"
  - [ ] Click "Enable"
- [ ] Create OAuth 2.0 credentials
  - [ ] Go to Credentials
  - [ ] Click "Create Credentials"
  - [ ] Select "OAuth 2.0 Client ID"
  - [ ] Select "Web application"
  - [ ] Name: "Trading AI News - Web"

### Authorized Redirect URIs
Add these in Google Console:
```
- [ ] http://localhost:3000
- [ ] http://localhost:5173
- [ ] http://127.0.0.1:5173
- [ ] http://127.0.0.1:3000
```

### Copy Your Credentials
- [ ] Copy Client ID: `________________`
- [ ] Save in a text file temporarily

---

## Phase 2: Local Setup (10 minutes)

### Frontend Environment
```bash
# From project root, go to frontend folder
cd frontend

# Create .env.local file
# On Windows PowerShell:
echo "VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE" > .env.local
echo "VITE_API_URL=http://localhost:3001" >> .env.local

# On Git Bash or Mac/Linux:
cat > .env.local << EOF
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE
VITE_API_URL=http://localhost:3001
EOF
```

- [ ] Replace `YOUR_CLIENT_ID_HERE` with actual Client ID
- [ ] File created at: `frontend/.env.local`
- [ ] Verified Client ID is correct

### Backend Environment
```bash
# From project root, go to backend folder
cd backend

# Edit or create .env file
# Verify these are set:
# MONGODB_URI=your_mongodb_connection
# JWT_SECRET=your_jwt_secret
```

- [ ] `backend/.env` has MONGODB_URI
- [ ] `backend/.env` has JWT_SECRET
- [ ] SMTP credentials configured (if using email)

---

## Phase 3: Dependencies (5 minutes)

### Frontend Dependencies
```bash
cd frontend
npm install
# or
yarn install
```

- [ ] `frontend/node_modules` folder created
- [ ] No install errors
- [ ] `@react-oauth/google` is installed

Check:
```bash
npm list @react-oauth/google
```

- [ ] Shows version: @react-oauth/google@0.12.1 (or newer)

### Backend Dependencies
```bash
cd backend
bun install
# or if you don't have bun:
npm install
```

- [ ] `backend/node_modules` folder created (or `bun_modules` if using bun)
- [ ] No install errors

---

## Phase 4: Start Servers (5 minutes)

### Terminal 1 - Frontend
```bash
cd frontend
npm run dev
```

Expected output:
```
  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

- [ ] Frontend server running
- [ ] No errors in console
- [ ] URL is http://localhost:5173

### Terminal 2 - Backend
```bash
cd backend
bun run --watch src/index.ts
# or npm run dev
```

Expected output:
```
Listening on http://0.0.0.0:3001
```

- [ ] Backend server running
- [ ] No errors in console
- [ ] URL is http://localhost:3001

---

## Phase 5: Browser Testing (5 minutes)

### Open Frontend
1. [ ] Open browser
2. [ ] Go to http://localhost:5173/signup

### Check Elements
3. [ ] See "Smart Money Calendar" logo
4. [ ] See "Create Account" heading
5. [ ] See "Sign up with Google" button
6. [ ] Google button has Google colors/logo

### Test Sign-Up
7. [ ] Click "Sign up with Google"
8. [ ] Google login popup appears
9. [ ] Select or enter Google account
10. [ ] Grant permissions
11. [ ] Redirect to dashboard
12. [ ] User info displayed in dashboard

---

## Phase 6: Email Conflict Test (5 minutes)

### Create Email Account
1. [ ] Go to http://localhost:5173/signup
2. [ ] Fill in:
   - Email: `testuser@example.com`
   - Username: `testuser123`
   - Password: `TestPassword123!`
3. [ ] Click "Create Account"
4. [ ] Account created successfully
5. [ ] Redirected to dashboard
6. [ ] Logout (if available)

### Try Google with Same Email
1. [ ] Go to http://localhost:5173/login
2. [ ] Click "Sign in with Google"
3. [ ] Select/enter same Google account as `testuser@example.com`
4. [ ] Should see error:
   ```
   "This email is already registered. 
    Please sign in with your password."
   ```
5. [ ] Error handling working correctly

### Test Different Google Account
1. [ ] Go to http://localhost:5173/signup
2. [ ] Click "Sign up with Google"
3. [ ] Use DIFFERENT Google account
4. [ ] Should successfully sign up
5. [ ] Redirected to dashboard

---

## Phase 7: Local Storage Verification (3 minutes)

### Browser DevTools
1. [ ] Press F12 to open Developer Tools
2. [ ] Go to "Storage" or "Application" tab
3. [ ] Click "Local Storage"
4. [ ] Look for your site (localhost:5173)

### Check Storage
- [ ] `authToken` exists
- [ ] `authToken` value is not empty
- [ ] `authUser` exists
- [ ] `authUser` contains user data with:
  - [ ] `email` field
  - [ ] `username` field
  - [ ] `_id` or `id` field

### Example authUser:
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "username": "john.doe",
  "authMethod": "google",
  ...
}
```

---

## Phase 8: Network Request Verification (3 minutes)

### Open Network Tab
1. [ ] Press F12
2. [ ] Go to "Network" tab
3. [ ] Reload page
4. [ ] Try Google Sign-In again

### Check Requests
Look for POST request to `/api/auth/google`:

- [ ] Request exists
- [ ] Method is POST
- [ ] Request body contains:
  ```json
  {
    "googleId": "...",
    "email": "...",
    "username": "..."
  }
  ```
- [ ] Response status is 200 (success)
- [ ] Response body contains:
  ```json
  {
    "statusCode": 200,
    "success": true,
    "data": {
      "user": {...},
      "token": "..."
    }
  }
  ```

---

## Phase 9: Console Checks (2 minutes)

### Frontend Console
1. [ ] Press F12
2. [ ] Go to "Console" tab
3. [ ] No red errors
4. [ ] No authentication-related errors

### Backend Console
1. [ ] Check backend terminal
2. [ ] No 500 errors
3. [ ] See POST request logs
4. [ ] Response shows successful

---

## Phase 10: Login/Logout Cycle (3 minutes)

### Test Complete Cycle
1. [ ] Start fresh - open incognito window
2. [ ] Go to http://localhost:5173/login
3. [ ] Click "Sign in with Google"
4. [ ] Use same Google account
5. [ ] Successfully sign in
6. [ ] [ ] Dashboard displays
7. [ ] [ ] User menu shows correct email

### Logout Test
1. [ ] Click logout button (if available)
2. [ ] Redirected to login page
3. [ ] Check localStorage (should be empty)
4. [ ] Token cleared: `authToken = null`
5. [ ] User cleared: `authUser = null`

---

## Phase 11: Error Handling (3 minutes)

### Missing Environment Variable
1. [ ] Temporarily rename `.env.local` to `.env.local.bak`
2. [ ] Refresh page
3. [ ] Should see error or fallback
4. [ ] Rename back to `.env.local`
5. [ ] Refresh page
6. [ ] Works again

### Network Error
1. [ ] Open Network tab
2. [ ] Stop backend server
3. [ ] Try to sign in with Google
4. [ ] Should see network error message
5. [ ] Start backend server again
6. [ ] Works again

### Invalid Email Format
1. [ ] Go to login
2. [ ] Try signing in with invalid email
3. [ ] Should show validation error
4. [ ] (If applicable)

---

## Phase 12: Mobile Responsiveness (2 minutes)

### DevTools Mobile View
1. [ ] Press F12
2. [ ] Click mobile icon (Ctrl+Shift+M)
3. [ ] Select iPhone or Android
4. [ ] Refresh page

### Check Layout
- [ ] [ ] Google button is visible
- [ ] [ ] Text is readable
- [ ] [ ] Button is clickable
- [ ] [ ] No horizontal scroll
- [ ] [ ] Form is centered
- [ ] [ ] All elements fit on screen

---

## Phase 13: Documentation Review (5 minutes)

### Check All Docs Exist
- [ ] `GOOGLE_SIGNIN_SETUP.md` ✓
- [ ] `ENV_SETUP.md` ✓
- [ ] `IMPLEMENTATION_SUMMARY.md` ✓
- [ ] `AUTH_FLOW_DIAGRAMS.md` ✓
- [ ] `GOOGLE_SIGNIN_QUICK_REFERENCE.md` ✓
- [ ] `DOCUMENTATION_INDEX.md` ✓

### Read Key Sections
- [ ] Read "Email Conflict Protection" section
- [ ] Read "Troubleshooting" section
- [ ] Read "Security Features" section

---

## Phase 14: Final Verification (5 minutes)

### Code Quality
```bash
# Frontend
cd frontend
npm run lint
```
- [ ] No critical errors
- [ ] Warnings are acceptable

### Files Modified (Verify)
- [ ] `backend/src/models/User.ts` - Google fields added
- [ ] `backend/src/routes/auth.ts` - /auth/google endpoint added
- [ ] `frontend/package.json` - @react-oauth/google added
- [ ] `frontend/src/contexts/AuthContext.jsx` - googleAuth method added
- [ ] `frontend/src/pages/app.jsx` - GoogleOAuthProvider added
- [ ] `frontend/src/pages/auth/login.jsx` - Google button added
- [ ] `frontend/src/pages/auth/signup.jsx` - Google button added

### New Files
- [ ] `frontend/src/hooks/useGoogleAuth.js` - exists

---

## Phase 15: Cleanup (2 minutes)

### Temporary Files
- [ ] Delete Client ID from text file (keep in .env only)
- [ ] No sensitive data in git (if using)

### Browser Cleanup (Optional)
- [ ] Clear browser cache if needed
- [ ] Close development tools
- [ ] Close temporary tabs

---

## Success Criteria ✅

You're done when:
- ✅ Frontend running on localhost:5173
- ✅ Backend running on localhost:3001
- ✅ Google Sign-In button appears on login/signup
- ✅ Can sign up with Google
- ✅ Can sign in with Google
- ✅ Email conflict protection works
- ✅ JWT token stored in localStorage
- ✅ Redirect to dashboard works
- ✅ No console errors
- ✅ Documentation reviewed

---

## Troubleshooting Quick Links

| Problem | Solution |
|---------|----------|
| "VITE_GOOGLE_CLIENT_ID undefined" | Check .env.local exists in frontend folder |
| Google button not appearing | Check @react-oauth/google installed |
| "Invalid Client ID" | Verify Client ID in .env.local matches Google Console |
| CORS error | Check backend running on 3001 |
| Auth fails silently | Check browser console for errors |
| Port already in use | Kill process or use different port |
| MongoDB connection error | Check MONGODB_URI is correct |

---

## Next Steps After Setup

1. [ ] Read GOOGLE_SIGNIN_QUICK_REFERENCE.md
2. [ ] Bookmark GOOGLE_SIGNIN_SETUP.md for reference
3. [ ] Set up production credentials in Google Console
4. [ ] Plan for additional OAuth providers (optional)
5. [ ] Test with real users
6. [ ] Monitor authentication logs
7. [ ] Deploy to staging
8. [ ] Deploy to production

---

## Time Summary

- Phase 1 (Prep): 5 minutes
- Phase 2 (Setup): 10 minutes
- Phase 3 (Dependencies): 5 minutes
- Phase 4 (Servers): 5 minutes
- Phase 5 (Browser Test): 5 minutes
- Phase 6 (Email Conflict): 5 minutes
- Phase 7-15 (Verification): ~30 minutes

**Total: ~65 minutes** (First time setup)

---

**You're all set! Happy coding! 🚀**
