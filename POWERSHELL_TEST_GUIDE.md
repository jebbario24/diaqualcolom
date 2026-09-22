# PowerShell Testing Guide for Auto-Revocation

Since you're in PowerShell, use these commands instead of bash/curl.

---

## ⚠️ Step 0: Deploy the Function First

```powershell
cd C:\Users\HP\Downloads\aqualcc

# Deploy Edge Function
supabase functions deploy revoke-expired-access

# Apply database migration
supabase db push
```

**Wait for:** ✅ Function successfully deployed message

---

## Test 1: Call Edge Function (PowerShell)

```powershell
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Zm9heWJqcHdta3pqcGRpZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTk1NjAsImV4cCI6MjEwNTU5NTU2MH0.N7n_tRbH15xTTXw2TrRniFtgQ2tuNtbOXAvZ5Z0V3BA"
$URL = "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access"

# Test 1: Empty call (no expired data yet)
Write-Host "=== TEST 1: Edge Function (Empty) ===" -ForegroundColor Green

$response = Invoke-WebRequest -Uri $URL `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "Content-Type" = "application/json"
    } `
    -Body '{}' `
    -UseBasicParsing

Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
$result = $response.Content | ConvertFrom-Json
Write-Host "Response:" -ForegroundColor Green
$result | Format-List

# Expected output:
# success      : True
# revoked      : 0
# revokedIds   : {}
# timestamp    : 2024-...
```

**Expected:** `success: True`, `revoked: 0` ✅

---

## Test 2: Create Test Data (SQL Editor)

Go to **Supabase Dashboard** → **SQL Editor** and paste this:

```sql
-- Create test business with EXPIRED access
INSERT INTO businesses (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  inscription, plan, statut
) VALUES (
  'test-biz-111',
  'test-prof-222',
  'Test Business Expired',
  'Casablanca',
  'test@example.com',
  true,
  NOW() - INTERVAL '1 hour',
  NOW(),
  'business',
  'active'
);

-- Create test client with EXPIRED access
INSERT INTO particuliers (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  statut, created_at
) VALUES (
  'test-client-333',
  'test-prof-444',
  'Test Client Expired',
  'Fez',
  'client@example.com',
  true,
  NOW() - INTERVAL '2 hours',
  'active',
  NOW()
);

-- Verify creation
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses WHERE id = 'test-biz-111';

SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM particuliers WHERE id = 'test-client-333';
```

**Expected:** Both records show `has_manual_access = true` ✅

---

## Test 3: Execute Revocation (PowerShell)

Run this in PowerShell:

```powershell
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Zm9heWJqcHdta3pqcGRpZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTk1NjAsImV4cCI6MjEwNTU5NTU2MH0.N7n_tRbH15xTTXw2TrRniFtgQ2tuNtbOXAvZ5Z0V3BA"
$URL = "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access"

Write-Host "=== TEST 3: Revocation ===" -ForegroundColor Green

$response = Invoke-WebRequest -Uri $URL `
    -Method POST `
    -Headers @{
        "Authorization" = "Bearer $ANON_KEY"
        "Content-Type" = "application/json"
    } `
    -Body '{}' `
    -UseBasicParsing

Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
$result = $response.Content | ConvertFrom-Json
Write-Host "Response:" -ForegroundColor Green
$result | Format-List

# Expected output:
# success      : True
# revoked      : 2
# revokedIds   : {test-biz-111, test-client-333}
# timestamp    : 2024-...
```

**Expected:** `success: True`, `revoked: 2`, both IDs in revokedIds ✅

---

## Test 4: Verify Revocation (SQL Editor)

In SQL Editor, run:

```sql
-- Check if records were revoked
SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM businesses WHERE id = 'test-biz-111';

SELECT id, nom, has_manual_access, manuel_access_expires_at 
FROM particuliers WHERE id = 'test-client-333';
```

**Expected:** Both show `has_manual_access = false` and `manuel_access_expires_at = NULL` ✅

---

## Test 5: Check Cron Job (SQL Editor)

```sql
-- Verify cron job is scheduled
SELECT jobid, jobname, schedule, command 
FROM cron.job 
WHERE jobname LIKE '%revoke%';
```

**Expected:**
```
 jobid | jobname                      | schedule     | command
-------+------------------------------+--------------+-------------------------------------------
   101 | revoke_expired_access_hourly | 0 * * * *    | SELECT public.revoke_expired_access();
```

✅

---

## Test 6: Cleanup (SQL Editor)

```sql
-- Remove test data
DELETE FROM businesses WHERE id = 'test-biz-111';
DELETE FROM particuliers WHERE id = 'test-client-333';

-- Verify deletion
SELECT COUNT(*) FROM businesses WHERE id = 'test-biz-111';
SELECT COUNT(*) FROM particuliers WHERE id = 'test-client-333';
```

**Expected:** Both return 0 ✅

---

## PowerShell Script (Complete)

Save this as `test-revocation.ps1`:

```powershell
# Full test script for auto-revocation system

$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Zm9heWJqcHdta3pqcGRpZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTk1NjAsImV4cCI6MjEwNTU5NTU2MH0.N7n_tRbH15xTTXw2TrRniFtgQ2tuNtbOXAvZ5Z0V3BA"
$URL = "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access"

function Test-EdgeFunction {
    Write-Host "=== TEST 1: Edge Function (Empty) ===" -ForegroundColor Green
    
    try {
        $response = Invoke-WebRequest -Uri $URL `
            -Method POST `
            -Headers @{
                "Authorization" = "Bearer $ANON_KEY"
                "Content-Type" = "application/json"
            } `
            -Body '{}' `
            -UseBasicParsing
        
        Write-Host "✅ Status: $($response.StatusCode)" -ForegroundColor Green
        $result = $response.Content | ConvertFrom-Json
        Write-Host "Success: $($result.success)" -ForegroundColor Green
        Write-Host "Revoked: $($result.revoked)" -ForegroundColor Green
        Write-Host "Timestamp: $($result.timestamp)" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-WithExpiredData {
    Write-Host "`n=== TEST 2: Revocation (With Expired Data) ===" -ForegroundColor Green
    Write-Host "⏳ Create test data in Supabase SQL Editor first" -ForegroundColor Yellow
    Write-Host "Then run this command:" -ForegroundColor Yellow
    
    Write-Host "`nPowershell:`n" -ForegroundColor Cyan
    Write-Host "`$ANON_KEY = `"$ANON_KEY`"" -ForegroundColor Gray
    Write-Host "`$URL = `"$URL`"" -ForegroundColor Gray
    Write-Host "`n`$response = Invoke-WebRequest -Uri `$URL -Method POST -Headers @{ 'Authorization' = 'Bearer ' + `$ANON_KEY; 'Content-Type' = 'application/json' } -Body '{}' -UseBasicParsing" -ForegroundColor Gray
    Write-Host "`$response.Content | ConvertFrom-Json | Format-List" -ForegroundColor Gray
}

# Run tests
$test1 = Test-EdgeFunction
Test-WithExpiredData

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
if ($test1) {
    Write-Host "✅ Test 1 PASSED: Edge Function responsive" -ForegroundColor Green
    Write-Host "⏳ Test 2 PENDING: Awaiting test data creation" -ForegroundColor Yellow
}
else {
    Write-Host "❌ Test 1 FAILED: Deploy function first" -ForegroundColor Red
    Write-Host "   Run: supabase functions deploy revoke-expired-access" -ForegroundColor Yellow
}
```

Run it:
```powershell
.\test-revocation.ps1
```

---

## Quick Reference: PowerShell vs Bash

| Bash | PowerShell |
|------|-----------|
| `export VAR=value` | `$VAR = "value"` |
| `curl -X POST url` | `Invoke-WebRequest -Uri url -Method POST` |
| `-H "header: value"` | `-Headers @{"header" = "value"}` |
| `-d '{}'` | `-Body '{}'` |
| `\| jq` | `\| ConvertFrom-Json` |

---

## Troubleshooting

### Error: "Impossible de trouver un paramètre correspondant au nom « X »"
**Cause:** Using bash syntax in PowerShell  
**Fix:** Use `Invoke-WebRequest` instead of `curl`

### Error: "(404) Introuvable"
**Cause:** Edge Function not deployed  
**Fix:** Run `supabase functions deploy revoke-expired-access`

### Error: "AuthenticationException"
**Cause:** Invalid ANON_KEY  
**Fix:** Copy the key from `config.js` again

---

## Next Steps

1. ✅ Deploy Edge Function: `supabase functions deploy revoke-expired-access`
2. ✅ Deploy Migration: `supabase db push`
3. ✅ Run Test 1 (PowerShell)
4. ✅ Create test data (SQL Editor)
5. ✅ Run Test 2 (PowerShell)
6. ✅ Verify in SQL Editor
7. ✅ Cleanup test data

**Total time: ~10 minutes**

---

Copy the Test 1 PowerShell code and run it now! 🚀
