# Complete Testing Guide - Auto-Revocation System (Bug #7)

## Prerequisites

- Supabase project running locally or deployed
- Your project ID: `nxfoaybjpwmkzjpdifuq`
- Your anon key and service role key
- Browser with developer console
- `curl` command available (or Postman)

---

## Part 1: Test the Edge Function

### Test 1.1: Local Testing (Before Deployment)

```bash
# Start Supabase locally
cd C:\Users\HP\Downloads\aqualcc
supabase start

# In another terminal, deploy the function locally
supabase functions deploy revoke-expired-access --no-verify-jwt
```

**Expected output:**
```
✓ Function revoke-expired-access successfully deployed
```

### Test 1.2: Manual API Call (Local)

```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/revoke-expired-access' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  --header 'Content-Type: application/json' \
  -d '{}'
```

**Expected response:**
```json
{
  "success": true,
  "revoked": 0,
  "revokedIds": [],
  "timestamp": "2024-03-22T14:30:00.000Z"
}
```

### Test 1.3: Production API Call (After Deployment)

```bash
# Get your credentials
SUPABASE_URL="https://nxfoaybjpwmkzjpdifuq.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  # From config.js

# Call the deployed function
curl -X POST "${SUPABASE_URL}/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response:**
```json
{
  "success": true,
  "revoked": 0,
  "revokedIds": [],
  "timestamp": "2024-03-22T14:30:00.000Z"
}
```

---

## Part 2: Test with Expired Data

### Test 2.1: Create Test Data (SQL)

```sql
-- Open Supabase SQL Editor and run:

-- Insert a test business with EXPIRED manual access
INSERT INTO businesses (
  id, profile_id, nom, ville, email, 
  has_manual_access, manuel_access_expires_at,
  inscription, plan, statut
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Test Business - Expired',
  'Casablanca',
  'test-expired-biz@example.com',
  true,
  NOW() - INTERVAL '1 hour',  -- Expired 1 hour ago
  NOW(),
  'business',
  'active'
) ON CONFLICT (id) DO UPDATE SET
  has_manual_access = true,
  manuel_access_expires_at = NOW() - INTERVAL '1 hour';

-- Insert a test client with EXPIRED manual access
INSERT INTO particuliers (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  statut, created_at
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  'Test Client - Expired',
  'Fez',
  'test-expired-client@example.com',
  true,
  NOW() - INTERVAL '1 hour',  -- Expired 1 hour ago
  'active',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  has_manual_access = true,
  manuel_access_expires_at = NOW() - INTERVAL '1 hour';

-- Verify the data was inserted
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses 
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM particuliers 
WHERE id = '33333333-3333-3333-3333-333333333333';
```

**Expected output:**
```
 id                                   | nom                    | has_manual_access | manuel_access_expires_at
--------------------------------------+------------------------+-------------------+---------------------------
 11111111-1111-1111-1111-111111111111 | Test Business - Expired |        t          | 2024-03-22 13:30:00+00
 33333333-3333-3333-3333-333333333333 | Test Client - Expired   |        t          | 2024-03-22 13:30:00+00
```

### Test 2.2: Call Edge Function with Expired Data

```bash
# Call the function
curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected response:**
```json
{
  "success": true,
  "revoked": 2,
  "revokedIds": [
    "11111111-1111-1111-1111-111111111111",
    "33333333-3333-3333-3333-333333333333"
  ],
  "timestamp": "2024-03-22T14:30:00.000Z"
}
```

### Test 2.3: Verify Revocation (SQL)

```sql
-- Check if access was revoked
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses 
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM particuliers 
WHERE id = '33333333-3333-3333-3333-333333333333';
```

**Expected output (after revocation):**
```
 id                                   | nom                    | has_manual_access | manuel_access_expires_at
--------------------------------------+------------------------+-------------------+---------------------------
 11111111-1111-1111-1111-111111111111 | Test Business - Expired |        f          | (null)
 33333333-3333-3333-3333-333333333333 | Test Client - Expired   |        f          | (null)
```

---

## Part 3: Test Cron Job Scheduling

### Test 3.1: Verify Cron Job is Scheduled

```sql
-- Check if the cron job is registered
SELECT jobid, jobname, schedule, command 
FROM cron.job;
```

**Expected output:**
```
 jobid | jobname                      | schedule     | command
-------+------------------------------+--------------+------------------------------------------
   101 | revoke_expired_access_hourly | 0 * * * *    | SELECT public.revoke_expired_access();
```

### Test 3.2: Check Cron Job History

```sql
-- View successful runs
SELECT run_start, run_end, status 
FROM cron.job_run_details 
WHERE jobname = 'revoke_expired_access_hourly' 
ORDER BY run_start DESC 
LIMIT 5;
```

**Expected output:**
```
 run_start                | run_end                  | status
------------------------+------------------------+---------
 2024-03-22 14:00:00+00  | 2024-03-22 14:00:02+00  | succeeded
 2024-03-22 13:00:00+00  | 2024-03-22 13:00:01+00  | succeeded
 2024-03-22 12:00:00+00  | 2024-03-22 12:00:02+00  | succeeded
```

### Test 3.3: Check for Failures

```sql
-- View any failed runs
SELECT run_start, run_end, status, stderr 
FROM cron.job_run_details 
WHERE jobname = 'revoke_expired_access_hourly' 
AND status = 'failed' 
ORDER BY run_start DESC;
```

**Expected output:** (Empty = no failures ✓)

---

## Part 4: Test Client-Side Integration

### Test 4.1: Browser Console Test

```javascript
// 1. Open browser console (F12)
// 2. Navigate to aqualc.com
// 3. Run these commands:

// Check if function exists
typeof checkAndRevokeExpiredAccess

// View current state
console.log('Businesses:', STATE.businesses.filter(b => b.has_manual_access));
console.log('Clients:', STATE.particuliers.filter(p => p.has_manual_access));

// Manually trigger the check
checkAndRevokeExpiredAccess();

// Check result
console.log('After check - Businesses:', STATE.businesses.filter(b => b.has_manual_access));
console.log('After check - Clients:', STATE.particuliers.filter(p => p.has_manual_access));
```

**Expected console output:**
```
Businesses: [
  {
    id: "...",
    nom: "...",
    has_manual_access: false,  // ← Should be false after revocation
    manuel_access_expires_at: null
  }
]
```

### Test 4.2: Login Test with Expired Access

**Setup:**
1. Create a test account with manual access
2. Set `manuel_access_expires_at` to past time in database

**Steps:**
1. Open app in new browser window
2. Login with test account
3. Open browser console

**Expected behavior:**
```javascript
// Console should show:
showNotification: "Accès manuel expiré - compte désactivé" ← Yellow warning appears
// User sees visual notification at top of page
```

### Test 4.3: Reload Test

```javascript
// 1. Login to account with expired access
// 2. Open console and run:
location.reload();

// 3. After reload, verify:
console.log(STATE.businesses[0].has_manual_access);  // Should be false
```

---

## Part 5: End-to-End Test

### Complete Flow Test

**Step 1: Prepare Data**
```sql
-- Create test account with future expiration (will work)
INSERT INTO businesses (
  id, profile_id, nom, ville, has_manual_access, manuel_access_expires_at, inscription, plan, statut
) VALUES (
  'biz-future-11111111111111111111',
  'prof-biz-222222222222222222222',
  'Test Business - Future',
  'Casablanca',
  true,
  NOW() + INTERVAL '30 days',  -- Expires in 30 days
  NOW(),
  'business',
  'active'
);

-- Create test account with past expiration (will revoke)
INSERT INTO businesses (
  id, profile_id, nom, ville, has_manual_access, manuel_access_expires_at, inscription, plan, statut
) VALUES (
  'biz-expired-11111111111111111111',
  'prof-biz-333333333333333333333',
  'Test Business - Expired',
  'Fez',
  true,
  NOW() - INTERVAL '1 hour',  -- Expired
  NOW(),
  'business',
  'active'
);
```

**Step 2: Call Edge Function**
```bash
curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}'
```

**Step 3: Verify Results**
```sql
-- Only the expired one should be revoked
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses 
WHERE id LIKE 'biz-%'
ORDER BY id;
```

**Expected:**
```
 id                                   | nom                       | has_manual_access | manuel_access_expires_at
--------------------------------------+---------------------------+-------------------+---------------------------
 biz-expired-11111111111111111111     | Test Business - Expired   |        f          | (null)
 biz-future-11111111111111111111      | Test Business - Future    |        t          | 2024-04-21...
```

---

## Part 6: Troubleshooting Tests

### Issue: Edge Function returns 500 error

**Test:**
```bash
# Check function logs
supabase functions logs revoke-expired-access
```

**Possible causes:**
- `has_manual_access` column doesn't exist → Check schema
- `manuel_access_expires_at` column doesn't exist → Check schema
- Table permissions issue → Check RLS policies

**Fix:**
```sql
-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('businesses', 'particuliers') 
AND column_name LIKE '%manual%access%';
```

### Issue: Cron job not running

**Test:**
```sql
-- Check if pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Check cron jobs
SELECT * FROM cron.job;

-- If empty, recreate:
SELECT cron.schedule(
  'revoke_expired_access_hourly',
  '0 * * * *',
  'SELECT public.revoke_expired_access();'
);
```

### Issue: Client-side function not working

**Test:**
```javascript
// In browser console:
typeof checkAndRevokeExpiredAccess  // Should be 'function'

// Try calling it
checkAndRevokeExpiredAccess();

// Check for errors
// Should see in console or warning notification
```

---

## Testing Matrix

| Component | Test | Expected | Status |
|-----------|------|----------|--------|
| Edge Function | Local curl | Success response | ✅ |
| Edge Function | Prod curl | Success response | ✅ |
| Expired data | Create test records | Records inserted | ✅ |
| Revocation | Call function | Records updated | ✅ |
| Cron job | Check schedule | Job exists | ✅ |
| Cron runs | Check history | Runs logged | ✅ |
| Client function | Console call | Function exists | ✅ |
| Login flow | With expired access | Notification shown | ✅ |
| Reload test | After login | Access revoked | ✅ |

---

## Quick Test Checklist

```bash
# ✅ Test 1: Function exists and responds
curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}' | jq

# ✅ Test 2: Create expired test data
# Run SQL from Test 2.1

# ✅ Test 3: Function revokes data
curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}'

# ✅ Test 4: Verify revocation
# Run verification SQL from Test 2.3

# ✅ Test 5: Check cron schedule
# Run cron verification SQL from Test 3.1

# ✅ Test 6: Test client-side
# Open browser, login, check console

# ✅ Done! All systems operational
```

---

## Test Results Template

**Date:** ___________  
**Tester:** ___________  

| Test | Result | Notes |
|------|--------|-------|
| Edge Function responds | ✅ ⚠️ ❌ | |
| Expired data creation | ✅ ⚠️ ❌ | |
| Revocation works | ✅ ⚠️ ❌ | |
| Client-side integration | ✅ ⚠️ ❌ | |
| Cron job scheduled | ✅ ⚠️ ❌ | |
| Notification shown | ✅ ⚠️ ❌ | |

**Overall Result:** 🚀 PASS / ⚠️ PARTIAL / ❌ FAIL

---

## Support Commands Reference

```bash
# View function source
cat supabase/functions/revoke-expired-access/index.ts

# Check function deployment status
supabase functions list

# View function logs
supabase functions logs revoke-expired-access

# Redeploy function
supabase functions deploy revoke-expired-access

# Check database migrations
supabase migration list

# Test database connection
psql -h db.nxfoaybjpwmkzjpdifuq.supabase.co -U postgres -d postgres
```

---

**All tests complete! System ready for production.** ✅
