# PowerShell Test Script for Auto-Revocation System

# Step 1: Set credentials
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54Zm9heWJqcHdta3pqcGRpZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTk1NjAsImV4cCI6MjEwNTU5NTU2MH0.N7n_tRbH15xTTXw2TrRniFtgQ2tuNtbOXAvZ5Z0V3BA"
$URL = "https://nxfoaybjpwmkzjpdifuq.supabase.co/functions/v1/revoke-expired-access"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST 1: Edge Function (Empty Call)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri $URL `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $ANON_KEY"
            "Content-Type" = "application/json"
        } `
        -Body '{}' `
        -UseBasicParsing

    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | Format-List
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "Response: $($_.Exception.Response | ConvertFrom-Json)" -ForegroundColor Red
    }
}

Write-Host "`n"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "1. Go to Supabase Dashboard → SQL Editor" -ForegroundColor White
Write-Host "2. Run the SQL to create test data:" -ForegroundColor White
Write-Host "`n" -ForegroundColor White

$sql = @"
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
"@

Write-Host $sql -ForegroundColor Gray

Write-Host "`n"
Write-Host "3. Then run this command again to revoke:" -ForegroundColor White
Write-Host "   $PSCommandPath -Step 2" -ForegroundColor Gray

Write-Host "`n"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
