# Backend Deployment Guide - Manual Access Auto-Revocation

This guide walks through deploying the server-side auto-revocation feature for expired manual access.

## What Gets Deployed

- **Edge Function** (`supabase/functions/revoke-expired-access/index.ts`) - Manual trigger via HTTP
- **Database Migration** (`supabase/migrations/revoke_expired_access_cron.sql`) - Automatic hourly execution
- **PL/pgSQL Function** - Direct database function for revoking access

## Prerequisites

- Supabase CLI installed: `npm install -g supabase`
- Project directory: `C:\Users\HP\Downloads\aqualcc`
- Access to Supabase project (credentials configured)

---

## Step 1: Deploy the Edge Function

```bash
cd C:\Users\HP\Downloads\aqualcc

# Deploy to Supabase
supabase functions deploy revoke-expired-access
```

**Expected Output:**
```
✓ Function revoke-expired-access successfully deployed
```

---

## Step 2: Apply the Database Migration

### Option A: Via Supabase CLI (Recommended)

```bash
supabase db push
```

This will automatically detect and apply the new migration file.

### Option B: Via Supabase Dashboard

1. Go to: `https://app.supabase.com/project/[YOUR_PROJECT]/sql/new`
2. Copy contents of `supabase/migrations/revoke_expired_access_cron.sql`
3. Paste into SQL editor
4. Click "Run"

### Option C: Via psql (Direct)

```bash
psql -h db.nxfoaybjpwmkzjpdifuq.supabase.co \
     -U postgres \
     -d postgres \
     -f supabase/migrations/revoke_expired_access_cron.sql
```

When prompted for password, use your Supabase database password.

---

## Step 3: Verify Deployment

### Check Edge Function is Live

```bash
# Get your Supabase URL
SUPABASE_URL=$(grep 'SUPABASE_URL' config.js | grep -o 'https://[^"]*')
ANON_KEY=$(grep 'SUPABASE_KEY' config.js | grep -o 'eyJ[^"]*')

# Call the function
curl -X POST \
  "${SUPABASE_URL}/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response:**
```json
{
  "success": true,
  "revoked": 0,
  "revokedIds": [],
  "timestamp": "2024-03-22T14:30:00.000Z"
}
```

### Check Database Function

```bash
# Connect to your Supabase database and run:
SELECT public.revoke_expired_access();
```

**Expected Output:**
```
 revoked_count | revoked_ids
---------------+-------------
             0 | 
```

### Check Cron Job is Scheduled

```bash
# In Supabase SQL editor, run:
SELECT jobid, jobname, schedule, command FROM cron.job;
```

**Expected Output:**
```
 jobid | jobname                      | schedule     | command
-------+------------------------------+--------------+---------------------
   101 | revoke_expired_access_hourly | 0 * * * *    | SELECT public.revoke_expired_access();
```

---

## Step 4: Test with Expired Access Records

### Create Test Data

```sql
-- Insert a test particulier with expired manual access
INSERT INTO particuliers (
  id, business_id, email, has_manual_access, 
  manuel_access_expires_at, created_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000099',
  'test-expired@example.com',
  true,
  NOW() - INTERVAL '1 hour',
  NOW()
) ON CONFLICT DO NOTHING;
```

### Trigger Revocation

```bash
# Via Edge Function
curl -X POST \
  "${SUPABASE_URL}/functions/v1/revoke-expired-access" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -d '{}'

# Or via direct function call
psql -c "SELECT public.revoke_expired_access();"
```

### Verify Revocation

```sql
SELECT id, email, has_manual_access, manuel_access_expires_at
FROM particuliers
WHERE id = '00000000-0000-0000-0000-000000000001';
```

**Expected Result:**
```
                  id                  | email                  | has_manual_access | manuel_access_expires_at
--------------------------------------+------------------------+-------------------+--------------------------
 00000000-0000-0000-0000-000000000001 | test-expired@example.com |        f          | 
```

---

## Step 5: Monitor in Production

### View Edge Function Logs

```bash
supabase functions logs revoke-expired-access
```

### View Database Cron Logs

```sql
-- Check last run status
SELECT run_start, run_end, status
FROM cron.job_run_details
WHERE jobname = 'revoke_expired_access_hourly'
ORDER BY run_start DESC
LIMIT 10;
```

---

## Two-Layer Architecture

The implementation uses both approaches for reliability:

### 1. **Edge Function** (index.ts)
- **Trigger**: Manual via HTTP or webhook
- **Use Case**: On-demand revocation, API calls
- **Logs**: Viewable via `supabase functions logs`
- **Auth**: Requires `secret` key

### 2. **Database Function** (cron.sql)
- **Trigger**: Automatic hourly (00:00, 01:00, etc.)
- **Use Case**: Background cleanup
- **Logs**: Viewable via `cron.job_run_details`
- **Auth**: Runs with `SECURITY DEFINER` privileges

---

## Customization

### Change Cron Schedule

Edit the migration file or run:

```sql
-- Remove old schedule
SELECT cron.unschedule('revoke_expired_access_hourly');

-- Add new schedule (every 30 minutes)
SELECT cron.schedule(
  'revoke_expired_access_30min',
  '*/30 * * * *',
  'SELECT public.revoke_expired_access();'
);
```

### Cron Schedule Format

```
 ┌───────────── minute (0 - 59)
 │ ┌───────────── hour (0 - 23)
 │ │ ┌───────────── day of month (1 - 31)
 │ │ │ ┌───────────── month (1 - 12)
 │ │ │ │ ┌───────────── day of week (0 - 6, Sunday = 0)
 │ │ │ │ │
 │ │ │ │ │
 * * * * *

Examples:
  0 * * * *  ← Every hour
  */30 * * * * ← Every 30 minutes
  0 0 * * *  ← Daily at midnight
  0 12 * * 1 ← Mondays at noon
```

---

## Troubleshooting

### Edge Function Returns 500 Error

```bash
# Check logs
supabase functions logs revoke-expired-access

# Common issues:
# 1. Auth mode wrong (should be "secret")
# 2. Table doesn't exist (check particuliers table)
# 3. Missing columns (has_manual_access, manuel_access_expires_at)
```

### Cron Job Not Running

```sql
-- Check if pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify cron.job table exists
SELECT * FROM cron.job;

-- Check for errors in job runs
SELECT * FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY run_start DESC;
```

### No Access Being Revoked

```sql
-- Check if there are any expired records
SELECT COUNT(*) as expired_count
FROM particuliers
WHERE has_manual_access = true
  AND manuel_access_expires_at IS NOT NULL
  AND manuel_access_expires_at < NOW();

-- Verify function works manually
SELECT * FROM public.revoke_expired_access();
```

---

## Rollback

If you need to disable the cron job:

```sql
SELECT cron.unschedule('revoke_expired_access_hourly');
```

To remove the function completely:

```sql
DROP FUNCTION IF EXISTS public.revoke_expired_access();
```

---

## Summary

✅ **Edge Function Deployed** - Manual trigger via HTTP  
✅ **Database Function Created** - Direct revocation logic  
✅ **Cron Job Scheduled** - Hourly automatic execution  
✅ **Monitoring Available** - Logs in CLI and database  

**Result**: Manual access expires automatically every hour with zero downtime.
