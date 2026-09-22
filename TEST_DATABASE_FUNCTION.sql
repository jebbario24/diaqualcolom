-- ============================================
-- TEST 2: Database-Side Auto-Revocation Function
-- ============================================

-- Step 1: Create test data with EXPIRED access
INSERT INTO businesses (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  inscription, plan, statut
) VALUES (
  'test-biz-222',
  'test-prof-333',
  'Test Business Expired',
  'Casablanca',
  'test-biz@example.com',
  true,
  NOW() - INTERVAL '1 hour',
  NOW(),
  'business',
  'active'
)
ON CONFLICT (id) DO UPDATE SET
  has_manual_access = true,
  manuel_access_expires_at = NOW() - INTERVAL '1 hour';

-- Step 2: Create test client with EXPIRED access
INSERT INTO particuliers (
  id, profile_id, nom, ville, email,
  has_manual_access, manuel_access_expires_at,
  statut, created_at
) VALUES (
  'test-client-444',
  'test-prof-555',
  'Test Client Expired',
  'Fez',
  'test-client@example.com',
  true,
  NOW() - INTERVAL '2 hours',
  'active',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  has_manual_access = true,
  manuel_access_expires_at = NOW() - INTERVAL '2 hours';

-- Step 3: Verify test data was created
SELECT '=== TEST DATA CREATED ===' as step;
SELECT id, nom, has_manual_access, manuel_access_expires_at
FROM businesses
WHERE id = 'test-biz-222';

SELECT id, nom, has_manual_access, manuel_access_expires_at
FROM particuliers
WHERE id = 'test-client-444';

-- Step 4: Execute the database revocation function
SELECT '=== EXECUTING REVOCATION FUNCTION ===' as step;
SELECT * FROM public.revoke_expired_access();

-- Step 5: Verify revocation worked
SELECT '=== VERIFICATION: After Revocation ===' as step;
SELECT id, nom, has_manual_access, manuel_access_expires_at
FROM businesses
WHERE id = 'test-biz-222';

SELECT id, nom, has_manual_access, manuel_access_expires_at
FROM particuliers
WHERE id = 'test-client-444';

-- Step 6: Check cron job status
SELECT '=== CRON JOB STATUS ===' as step;
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE jobname LIKE '%revoke%';

-- Step 7: Cleanup
SELECT '=== CLEANUP ===' as step;
DELETE FROM businesses WHERE id = 'test-biz-222';
DELETE FROM particuliers WHERE id = 'test-client-444';

SELECT '=== ALL TESTS COMPLETE ===' as result;
