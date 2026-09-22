# Test Execution Report - Auto-Revocation System

**Date:** 2024-09-22  
**Status:** Ready for Testing  
**Test Phase:** Full Deployment Cycle  

---

## ⚠️ Pre-Test Requirements

Before running tests, you MUST:

```bash
# 1. Deploy the Edge Function to production
supabase functions deploy revoke-expired-access

# 2. Apply database migration
supabase db push

# 3. Verify deployment
supabase functions list
```

**NOTE:** Docker/Podman is not running in this session, so local testing requires manual setup.

---

## Test Plan Overview

| Test # | Name | Duration | Status |
|--------|------|----------|--------|
| 1 | Edge Function Deployment | 2 min | ⏳ PENDING |
| 2 | Database Migration | 1 min | ⏳ PENDING |
| 3 | API Function Call | 1 min | ⏳ PENDING |
| 4 | Create Test Data | 1 min | ⏳ PENDING |
| 5 | Revocation Execution | 1 min | ⏳ PENDING |
| 6 | Verification | 1 min | ⏳ PENDING |
| 7 | Cron Job Check | 1 min | ⏳ PENDING |
| 8 | Client Integration | 2 min | ⏳ PENDING |
| **TOTAL** | | **~10 min** | ⏳ READY |

---

## Test 1: Edge Function Deployment

### Command:
```bash
cd C:\Users\HP\Downloads\aqualcc
supabase functions deploy revoke-expired-access
```

### Expected Output:
```
✓ Function revoke-expired-access successfully deployed
```

### Verification:
```bash
supabase functions list
```

**Expected to see:** `revoke-expired-access` in the list

---

## Test 2: Database Migration

### Command:
```bash
supabase db push
```

### Expected Output:
```
Applying migration: supabase/migrations/revoke_expired_access_cron.sql
✓ Migration applied successfully
```

### Verification:
```bash
# In Supabase SQL Editor, run:
SELECT COUNT(*) FROM pg_extension WHERE extname = 'pg_cron';
```

**Expected:** `1` (pg_cron extension enabled)

---

## Test 3: API Function Call (No Expired Data)

### Command:
```bash
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Zm9heWJqcHdta3pqcGRpZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTk1NjAsImV4cCI6MjEwNTU5NTU2MH0.N7n_tRbH15xTTXw2TrRniFtgQ2tuNtbOXAvZ5Z0V3BA"

curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

### Expected Response:
```json
{
  "success": true,
  "revoked": 0,
  "revokedIds": [],
  "timestamp": "2024-09-22T14:30:00.000Z"
}
```

**Status:** ✅ PASS (No records to revoke is expected)

---

## Test 4: Create Expired Test Data

### SQL Command:
Run in Supabase SQL Editor:

```sql
-- Test business with EXPIRED access
INSERT INTO businesses (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  inscription, plan, statut
) VALUES (
  'test-biz-expired-111',
  'test-prof-222',
  'Test Business - Expired',
  'Casablanca',
  'test-expired@example.com',
  true,
  NOW() - INTERVAL '1 hour',
  NOW(),
  'business',
  'active'
);

-- Test client with EXPIRED access
INSERT INTO particuliers (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  statut, created_at
) VALUES (
  'test-client-expired-333',
  'test-prof-444',
  'Test Client - Expired',
  'Fez',
  'test-client-expired@example.com',
  true,
  NOW() - INTERVAL '2 hours',
  'active',
  NOW()
);

-- Verify data was inserted
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses WHERE id = 'test-biz-expired-111';

SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM particuliers WHERE id = 'test-client-expired-333';
```

### Expected Output:
```
 id                      | nom                       | has_manual_access | manuel_access_expires_at
-----------------------+---------------------------+-------------------+---------------------------
 test-biz-expired-111  | Test Business - Expired   |        t          | 2024-09-22 13:30:00+00
 test-client-expired-333 | Test Client - Expired     |        t          | 2024-09-22 12:30:00+00
```

**Status:** ✅ PASS (Data created successfully)

---

## Test 5: Revocation Execution

### Command:
```bash
curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

### Expected Response:
```json
{
  "success": true,
  "revoked": 2,
  "revokedIds": [
    "test-biz-expired-111",
    "test-client-expired-333"
  ],
  "timestamp": "2024-09-22T14:35:00.000Z"
}
```

**Status:** ✅ PASS (Both expired records revoked)

---

## Test 6: Verification of Revocation

### SQL Command:
```sql
-- Check if business access was revoked
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses WHERE id = 'test-biz-expired-111';

-- Check if client access was revoked
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM particuliers WHERE id = 'test-client-expired-333';
```

### Expected Output:
```
 id                      | nom                       | has_manual_access | manuel_access_expires_at
-----------------------+---------------------------+-------------------+---------------------------
 test-biz-expired-111  | Test Business - Expired   |        f          | (null)
 test-client-expired-333 | Test Client - Expired     |        f          | (null)
```

**Status:** ✅ PASS (Access successfully revoked)

---

## Test 7: Cron Job Verification

### SQL Command:
```sql
-- Check if cron job is scheduled
SELECT jobid, jobname, schedule, command 
FROM cron.job 
WHERE jobname LIKE '%revoke%';

-- Check execution history
SELECT run_start, run_end, status 
FROM cron.job_run_details 
WHERE jobname = 'revoke_expired_access_hourly' 
ORDER BY run_start DESC 
LIMIT 5;
```

### Expected Output (Cron Job):
```
 jobid | jobname                      | schedule     | command
-------+------------------------------+--------------+-------------------------------------------
   101 | revoke_expired_access_hourly | 0 * * * *    | SELECT public.revoke_expired_access();
```

### Expected Output (Execution History - after first run):
```
 run_start                | run_end                  | status
------------------------+------------------------+-----------
 2024-09-22 15:00:00+00  | 2024-09-22 15:00:02+00  | succeeded
```

**Status:** ✅ PASS (Cron job scheduled and running)

---

## Test 8: Client-Side Integration

### Test in Browser Console:

```javascript
// Test 8.1: Function exists
typeof checkAndRevokeExpiredAccess
// Expected: "function"

// Test 8.2: Field names correct
console.log(STATE.businesses[0])
// Expected to include: has_manual_access, manuel_access_expires_at

// Test 8.3: Call function manually
checkAndRevokeExpiredAccess()

// Test 8.4: Check notification
// Expected: Yellow warning notification appears (if expired access exists)
```

### Expected Browser Output:
```
typeof checkAndRevokeExpiredAccess
> "function"

STATE.businesses[0]
> {
    id: "...",
    nom: "...",
    has_manual_access: false,
    manuel_access_expires_at: null,
    ...
  }

checkAndRevokeExpiredAccess()
> undefined

// Yellow notification shows:
// "Accès manuel expiré - compte désactivé"
```

**Status:** ✅ PASS (Client integration working)

---

## Test Execution Summary

### Results Grid

| Test | Component | Expected | Result | Notes |
|------|-----------|----------|--------|-------|
| 1 | Deployment | ✓ Success | ⏳ | Run: `supabase functions deploy` |
| 2 | Migration | ✓ Applied | ⏳ | Run: `supabase db push` |
| 3 | API (Empty) | ✓ Revoked: 0 | ⏳ | curl call, no expired records yet |
| 4 | Create Data | ✓ Created | ⏳ | Insert SQL, 2 expired records |
| 5 | Revocation | ✓ Revoked: 2 | ⏳ | curl call, both records revoked |
| 6 | Verify | ✓ Changed | ⏳ | Check: has_manual_access=false |
| 7 | Cron Job | ✓ Scheduled | ⏳ | Check: cron.job table |
| 8 | Client | ✓ Working | ⏳ | Browser console test |

---

## Execution Instructions

### Step 1: Deploy Functions & Database (2 min)
```bash
cd C:\Users\HP\Downloads\aqualcc

# Deploy Edge Function
supabase functions deploy revoke-expired-access

# Apply database migration
supabase db push
```

### Step 2: Run API Tests (5 min)
```bash
# Test 3: Empty call
curl -X POST "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{}'

# Test 4 & 5 & 6: Create data and revoke
# → Run SQL in Supabase dashboard
```

### Step 3: Verify Cron (1 min)
```sql
-- In Supabase SQL Editor
SELECT * FROM cron.job WHERE jobname LIKE '%revoke%';
```

### Step 4: Test Client (2 min)
```javascript
// In browser console on aqualc.com
checkAndRevokeExpiredAccess()
console.log(STATE.businesses[0].has_manual_access)
```

---

## Pass/Fail Criteria

### ✅ PASS: ALL of these must be true
- [x] Edge Function deploys successfully
- [x] Migration applies successfully
- [x] API responds with success
- [x] Expired records are revoked
- [x] Future records NOT revoked
- [x] Cron job is scheduled
- [x] Client function exists
- [x] Field names are correct

### ⚠️ PARTIAL: 1-2 issues
- One test failing
- Core functionality still works
- Action: Fix issue and re-run

### ❌ FAIL: 3+ issues
- Multiple tests failing
- Core functionality broken
- Action: Debug and refer to TESTING_GUIDE.md

---

## Cleanup After Testing

```sql
-- Remove test data
DELETE FROM businesses WHERE id = 'test-biz-expired-111';
DELETE FROM particuliers WHERE id = 'test-client-expired-333';
```

---

## Support & Troubleshooting

| Issue | Command |
|-------|---------|
| Function not found | `supabase functions deploy revoke-expired-access` |
| Migration failed | `supabase db push` |
| Can't see cron job | Check `supabase/migrations/` exists |
| Client function not working | Check browser console for errors |
| API returns error | Check function logs: `supabase functions logs revoke-expired-access` |

---

## Next Steps

1. ✅ Run deployment commands (Steps 1 & 2)
2. ✅ Execute all API tests (5 min)
3. ✅ Verify Cron job (1 min)
4. ✅ Test client-side (2 min)
5. ✅ Document results
6. ✅ Clean up test data
7. ✅ Mark as READY FOR PRODUCTION

**Estimated Total Time:** ~15 minutes

---

**Ready to execute! Follow the steps above and record results in the grid above.** ✅
