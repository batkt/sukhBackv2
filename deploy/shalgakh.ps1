<#
    Барилгын PC дээрх урсгалын төлөвийг НЭГ ФАЙЛД цуглуулна.

    Нууц үг, токеныг автоматаар *** болгож дарна — гаргасан файлыг
    шууд хуваалцаж болно.

        powershell -ExecutionPolicy Bypass -File .\shalgakh.ps1
        powershell -ExecutionPolicy Bypass -File .\shalgakh.ps1 -Zam "D:\zevelease"
#>

[CmdletBinding()]
param(
    # Үйлчилгээ суусан хавтас. Заагаагүй бол үйлчилгээнээс өөрөө олно.
    [string]$Zam = "",
    # Логоос хэдэн мөр авах.
    [int]$Mur = 60
)

$ErrorActionPreference = "Continue"

# Нууц үг, токен агуулсан хэсгийг дарна.
function Nuutsgui([string]$t) {
    if ($null -eq $t) { return "" }
    $t = $t -replace '://[^/@\s]*@', '://***@'
    $t = $t -replace '(?i)(token\s*=\s*")[^"]+', '$1***'
    $t = $t -replace '(?i)(password\s*=\s*")[^"]+', '$1***'
    $t = $t -replace '(?i)(pass(wd)?["\s:=]+)[^\s",]+', '$1***'
    return $t
}

if (-not $Zam) {
    $svc = Get-CimInstance Win32_Service -Filter "Name='DahuaParkingService'" -ErrorAction SilentlyContinue
    if ($svc -and $svc.PathName) { $Zam = Split-Path ($svc.PathName -replace '^"|"$', '') }
}
if (-not $Zam) { $Zam = "C:\zevtabselease" }

$Garalt = Join-Path $env:TEMP ("urgats-pc-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")

$out = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $out.Add($m) }

Say "=============================================================="
Say (" Барилгын PC — " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Say (" Хавтас: " + $Zam)
Say "=============================================================="
Say ""

Say "-- 1. Үйлчилгээ --------------------------------------------"
$s = Get-Service DahuaParkingService -ErrorAction SilentlyContinue
if ($s) { Say ("  DahuaParkingService: " + $s.Status + " / " + $s.StartType) }
else    { Say "  DahuaParkingService: СУУГААГҮЙ" }

Say ""
Say "-- 2. Процессууд -------------------------------------------"
$dp = @(Get-Process dahua-service -ErrorAction SilentlyContinue)
Say ("  dahua-service: " + $dp.Count + " процесс")
foreach ($p in $dp) { Say ("    pid " + $p.Id + "  эхэлсэн " + $p.StartTime) }
if ($dp.Count -gt 1) { Say "    (!) НЭГЭЭС ОЛОН — ижил зам руу зэрэг нийтэлж магадгүй" }
$fp = @(Get-Process ffmpeg -ErrorAction SilentlyContinue)
Say ("  ffmpeg: " + $fp.Count + " процесс")

Say ""
Say "-- 3. Тохиргоо (нууц дарагдсан) ----------------------------"
$cfg = Join-Path $Zam "config.toml"
if (Test-Path $cfg) {
    foreach ($line in (Get-Content $cfg)) {
        $t = $line.Trim()
        if ($t -and -not $t.StartsWith("#")) { Say ("  " + (Nuutsgui $t)) }
    }
} else { Say ("  config.toml олдсонгүй: " + $cfg) }

Say ""
Say "-- 4. Сүүлийн PUBLISH мөрүүд -------------------------------"
$log = Join-Path $Zam "service.log"
if (Test-Path $log) {
    $lines = Get-Content $log -Tail 4000
    foreach ($l in ($lines | Select-String -Pattern "PUBLISH" | Select-Object -Last $Mur)) { Say ("  " + (Nuutsgui $l.Line)) }

    Say ""
    Say "-- 5. ffmpeg-ийн алдаанууд ---------------------------------"
    $ff = @($lines | Select-String -Pattern "ffmpeg:" | Select-Object -Last 40)
    if ($ff.Count -eq 0) { Say "  (алдаа алга)" }
    foreach ($l in $ff) { Say ("  " + (Nuutsgui $l.Line)) }

    Say ""
    Say "-- 6. Socket / URGATS дохио --------------------------------"
    foreach ($l in ($lines | Select-String -Pattern "BRIDGE|URGATS" | Select-Object -Last 30)) { Say ("  " + (Nuutsgui $l.Line)) }

    Say ""
    Say "-- 7. SDK --------------------------------------------------"
    foreach ($l in ($lines | Select-String -Pattern "SDK DEV|SDK \|" | Select-Object -Last 12)) { Say ("  " + (Nuutsgui $l.Line)) }
} else { Say ("  service.log олдсонгүй: " + $log) }

Say ""
Say "-- 8. VPS хүртэлх холболт ----------------------------------"
foreach ($port in 8554, 8889) {
    $r = Test-NetConnection -ComputerName 103.236.194.99 -Port $port -WarningAction SilentlyContinue
    Say ("  103.236.194.99:" + $port + " -> " + $r.TcpTestSucceeded)
}

Say ""
Say "=============================================================="
Say (" Гаралт: " + $Garalt)
Say "=============================================================="

$out | ForEach-Object { Write-Host $_ }
[IO.File]::WriteAllLines($Garalt, $out, (New-Object Text.UTF8Encoding($true)))
