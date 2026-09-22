# Quick Testing Reference Card

## 🚀 5-Minute Quick Test

### Test 1: Edge Function (30 seconds)
```bash
curl -X POST https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}'

# Expected: {"success": true, "revoked": 0, ...}
```

### Test 2: Create Expired Data (1 minute)
Open Supabase SQL Editor and run:
```sql
INSERT INTO businesses (id, profile_id, nom, ville, has_manual_access, 
  manuel_access_expires_at, inscription, plan, statut) 
VALUES ('test-111', 'test-222', 'Test', 'City', true, 
  NOW() - INTERVAL '1 hour', NOW(), 'business', 'active');
```

### Test 3: Revoke & Verify (1 minute)
```bash
# Call function again
curl -X POST https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}'

# Expected: {"success": true, "revoked": 1, "revokedIds": ["test-111"], ...}
```

### Test 4: Browser Console (2 minutes)
```javascript
// Open aqualc.com → Press F12 → Paste in console:
checkAndRevokeExpiredAccess();

// Verify field names
STATE.businesses[0]  // Should have has_manual_access field
```

### Test 5: Cron Verification (30 seconds)
SQL Editor:
```sql
SELECT * FROM cron.job WHERE jobname LIKE '%revoke%';
-- Should see: revoke_expired_access_hourly scheduled at '0 * * * *'
```

---

## 📋 Detailed Test Scenarios

### Scenario A: Full Revocation Test

| Step | Command | Expected |
|------|---------|----------|
| 1 | Create expired record (SQL) | Record inserted with `has_manual_access=true` |
| 2 | Call Edge Function (curl) | Response: `revoked: 1` |
| 3 | Check database (SQL) | Record has `has_manual_access=false` |
| 4 | Login to app | See warning notification |
| 5 | Check console | `STATE.businesses[0].has_manual_access === false` |

### Scenario B: No Changes Test

| Step | Command | Expected |
|------|---------|----------|
| 1 | Create FUTURE access (SQL) | Record with date in future |
| 2 | Call Edge Function (curl) | Response: `revoked: 0` |
| 3 | Check database (SQL) | Record still `has_manual_access=true` |

### Scenario C: Multiple Records Test

| Step | Command | Expected |
|------|---------|----------|
| 1 | Create 5 expired records (SQL) | All inserted |
| 2 | Call Edge Function (curl) | Response: `revoked: 5` |
| 3 | Verify (SQL) | All 5 have `has_manual_access=false` |

---

## 🔍 Verification Checklist

### API/Backend
- [ ] Edge Function URL responds
- [ ] Response format is valid JSON
- [ ] `success` field is `true`
- [ ] `revoked` count matches expected

### Database
- [ ] Migration applied successfully
- [ ] `has_manual_access` column exists
- [ ] `manuel_access_expires_at` column exists
- [ ] Cron job scheduled (check `cron.job` table)

### Client
- [ ] `checkAndRevokeExpiredAccess()` function exists
- [ ] Called at app startup (boot function)
- [ ] Called after `BACKEND.hydrate()`
- [ ] Field names match: `has_manual_access`, `manuel_access_expires_at`

### User Experience
- [ ] Warning notification appears on expiration
- [ ] Expired access is revoked on reload
- [ ] Future access still active (not revoked)
- [ ] Multiple accounts handled correctly

---

## ⚡ Common Issues & Fixes

### ❌ "404 Not Found" on Edge Function

**Fix:**
```bash
# Redeploy function
supabase functions deploy revoke-expired-access

# Verify deployment
supabase functions list
```

### ❌ "Column does not exist" error

**Fix:**
```sql
-- Check if columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'businesses' 
AND column_name LIKE '%manual%access%';

-- If missing, add them:
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS has_manual_access boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS manuel_access_expires_at timestamp with time zone;
```

### ❌ Cron job not running

**Fix:**
```sql
-- Enable pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Reschedule
SELECT cron.schedule('revoke_expired_access_hourly', '0 * * * *', 
  'SELECT public.revoke_expired_access();');
```

### ❌ Client-side function not working

**Fix:**
```javascript
// Check if function is defined
typeof checkAndRevokeExpiredAccess  // Should be 'function'

// Check field names
STATE.businesses[0]  // Should have has_manual_access field

// Manually trigger
checkAndRevokeExpiredAccess();

// Check console for errors
```

---

## 📊 Expected Results Summary

| Component | Status | Evidence |
|-----------|--------|----------|
| **Edge Function** | ✅ Works | Returns `{"success": true}` |
| **Database** | ✅ Updated | Records have `has_manual_access=false` |
| **Cron Job** | ✅ Scheduled | Shows in `cron.job` table |
| **Client Function** | ✅ Integrated | Defined in index.html |
| **Notification** | ✅ Shows | Yellow warning appears |
| **Data Sync** | ✅ Correct | Field names match schema |

---

## 🎯 Test Pass Criteria

✅ **PASS** if ALL of these are true:

1. Edge Function responds with `"success": true`
2. Expired records are revoked (has_manual_access becomes false)
3. Future records are NOT revoked (has_manual_access stays true)
4. Cron job exists in `cron.job` table
5. Client function exists in index.html
6. Notification shows when access expires
7. Field names match database schema
8. No errors in browser console

---

## 📞 Troubleshooting Contacts

| Issue | Check |
|-------|-------|
| Function errors | `supabase functions logs revoke-expired-access` |
| Database errors | SQL Editor → Error messages |
| Cron job status | `SELECT * FROM cron.job_run_details;` |
| Client errors | Browser console (F12) |
| API calls | Network tab (F12 → Network) |

---

## 🚀 Production Readiness Checklist

- [ ] All 5 quick tests passed
- [ ] Edge Function deployed successfully
- [ ] Database migration applied
- [ ] Client-side code integrated
- [ ] Test data cleaned up
- [ ] No errors in logs
- [ ] Notification system working
- [ ] Cron job scheduled

**✅ Ready for Production!**

---

## Test Execution Template

**Date & Time:** _______________  
**Tested By:** _______________  
**Environment:** ☐ Local ☐ Staging ☐ Production  

| Test | Result | Notes |
|------|--------|-------|
| Quick Test (5 min) | ✅ ❌ | |
| Scenario A | ✅ ❌ | |
| Scenario B | ✅ ❌ | |
| Scenario C | ✅ ❌ | |
| All Checks | ✅ ❌ | |

**Overall:** ✅ PASS / ❌ FAIL

**Issues Found:** 
- [ ] None
- [ ] See TESTING_GUIDE.md for detailed testing steps

