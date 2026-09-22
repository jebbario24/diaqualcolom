-- Add manual access columns to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS has_manual_access boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS manuel_access_expires_at timestamp with time zone;

-- Add manual access columns to particuliers table
ALTER TABLE particuliers ADD COLUMN IF NOT EXISTS has_manual_access boolean DEFAULT false;
ALTER TABLE particuliers ADD COLUMN IF NOT EXISTS manuel_access_expires_at timestamp with time zone;

-- Verify columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('businesses', 'particuliers')
AND column_name LIKE '%manual%access%'
ORDER BY table_name, column_name;
