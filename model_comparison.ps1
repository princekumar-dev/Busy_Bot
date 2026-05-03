$envPath = ".env"; $lines = Get-Content $envPath; 
function Get-EnvValue([string]$name) { $line = $lines | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1; if (-not $line) { return "" }; $val = ($line -split "=",2)[1].Trim(); return $val.Trim('"').Trim("'") };

$supaUrl = Get-EnvValue "VITE_SUPABASE_URL";
Write-Host "Supabase URL: $supaUrl" -ForegroundColor Yellow;
$supaKey = Get-EnvValue "VITE_SUPABASE_PUBLISHABLE_KEY";
$endpoint = "$($supaUrl.TrimEnd('/'))/functions/v1/webhook";
$restUrl = "$($supaUrl.TrimEnd('/'))/rest/v1/settings";

$headers = @{ "apikey" = $supaKey; "Authorization" = "Bearer $supaKey"; "Content-Type" = "application/json"; "Prefer" = "return=minimal" };

$models = @("llama-4-scout", "gpt-4o-mini", "llama-3-70b-instruct", "google/gemma-2-9b-it");
$testCases = @(
    @{ name="English (Meeting)"; text="Can we talk at 4pm?" },
    @{ name="Tanglish (Casual)"; text="Enna da panra? Cinema polama?" },
    @{ name="Hinglish (Check-in)"; text="Kya haal hai? Aaj sham ko milte hain?" }
);

$results = @();

foreach ($model in $models) {
    Write-Host "--- Testing Model: $model ---" -ForegroundColor Cyan;
    
    # Update settings to use this model
    $fullUri = $restUrl + "?user_id=eq.7cea03b3-5020-46f1-9279-084146ce6ae2"
    Write-Host "Updating URI: $fullUri" -ForegroundColor Gray
    $body = @{ ai_model = $model } | ConvertTo-Json;
    try {
        Invoke-RestMethod -Method Patch -Uri $fullUri -Headers $headers -Body $body;
        $check = Invoke-RestMethod -Method Get -Uri $fullUri -Headers $headers;
        Write-Host "Verified Model in DB: $($check[0].ai_model)" -ForegroundColor Gray;
    } catch {
        Write-Host "Failed to update model: $($_.Exception.Message)" -ForegroundColor Red;
        continue;
    }
    
    $caseIdx = 0;
    $targetNumber = "918778439728";
    foreach ($test in $testCases) {
        $caseIdx++;
        
        # Clear history for this number to ensure fresh test
        Write-Host "Cleaning history for $targetNumber..." -NoNewline;
        $convQuery = Invoke-RestMethod -Method Get -Uri ($supaUrl + "/rest/v1/conversations?contact_number=eq.$targetNumber&select=id") -Headers $headers;
        if ($convQuery) {
            foreach ($conv in $convQuery) {
                Invoke-RestMethod -Method Delete -Uri ($supaUrl + "/rest/v1/messages?conversation_id=eq.$($conv.id)") -Headers $headers;
                Invoke-RestMethod -Method Delete -Uri ($supaUrl + "/rest/v1/conversations?id=eq.$($conv.id)") -Headers $headers;
            }
        }
        Write-Host " DONE" -ForegroundColor Gray;

        $modelClean = $model.Replace("/", "-").Replace(".", "-");
        $remoteJid = "$targetNumber@s.whatsapp.net";
        Write-Host "Running Case: $($test.name) [$remoteJid] using $model..." -NoNewline;
        $eventId = "cmp-" + $modelClean + "-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
        $webhookBody = @{ event="messages.upsert"; data=@{ key=@{ remoteJid=$remoteJid; fromMe=$false; id=$eventId }; pushName="Tester"; message=@{ conversation=$test.text } } } | ConvertTo-Json -Depth 10;
        
        try {
            $resp = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType "application/json" -Body $webhookBody;
            $reply = $resp.results[0].reply;
            $results += [PSCustomObject]@{
                Model = $model;
                Case = $test.name;
                Intent = $resp.results[0].intent;
                Input = $test.text;
                Reply = $reply;
            };
            Write-Host " DONE" -ForegroundColor Green;
        } catch {
            Write-Host " ERROR: $($_.Exception.Message)" -ForegroundColor Red;
        }
        Start-Sleep -Seconds 1;
    }
}

$results | Export-Csv -Path "model_comparison_results.csv" -NoTypeInformation;
$results | Format-Table -AutoSize;
