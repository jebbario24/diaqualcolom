-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to revoke expired manual access
-- This runs directly on the database without HTTP calls
CREATE OR REPLACE FUNCTION public.revoke_expired_access()
RETURNS TABLE(revoked_count integer, revoked_ids uuid[]) AS $$
DECLARE
  v_revoked_ids uuid[];
  v_revoked_count integer;
BEGIN
  -- Get IDs of particuliers with expired manual access
  SELECT ARRAY_AGG(id)
  INTO v_revoked_ids
  FROM particuliers
  WHERE has_manual_access = true
    AND manuel_access_expires_at IS NOT NULL
    AND manuel_access_expires_at < NOW();

  -- Revoke expired access
  UPDATE particuliers
  SET
    has_manual_access = false,
    manuel_access_expires_at = NULL
  WHERE has_manual_access = true
    AND manuel_access_expires_at IS NOT NULL
    AND manuel_access_expires_at < NOW();

  -- Get the count
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  -- Return results
  RETURN QUERY SELECT v_revoked_count, v_revoked_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the cron job to run every hour
SELECT cron.schedule(
  'revoke_expired_access_hourly',
  '0 * * * *',
  'SELECT public.revoke_expired_access();'
);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.revoke_expired_access() TO authenticated;
