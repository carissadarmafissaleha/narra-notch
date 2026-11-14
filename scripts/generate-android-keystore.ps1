# PowerShell script to generate Android Release Keystore & GitHub Secrets
param(
    [string]$KeystoreName = "release.keystore",
    [string]$Alias = "narra",
    [string]$Password = ""
)

Write-Host "=== Narra Notch: Android Release Keystore Generator ===" -ForegroundColor Cyan

# 1. Locate keytool
$keytool = Get-Command "keytool" -ErrorAction SilentlyContinue
if (-not $keytool) {
    $searchPaths = @(
        "C:\Program Files\Eclipse Adoptium\jdk-*\bin\keytool.exe",
        "C:\Program Files\Microsoft\jdk-*\bin\keytool.exe",
        "C:\Program Files\Java\jdk*\bin\keytool.exe",
        "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe"
    )
    foreach ($pattern in $searchPaths) {
        $found = Get-Item $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $keytool = $found.FullName
            break
        }
    }
}

if (-not $keytool) {
    Write-Host "[!] 'keytool' not found." -ForegroundColor Yellow
    Write-Host "    Silakan install OpenJDK dengan menjalankan perintah:" -ForegroundColor White
    Write-Host "    winget install EclipseAdoptium.Temurin.21.JDK" -ForegroundColor Green
    Write-Host "    Setelah selesai install, buka terminal baru dan jalankan script ini kembali.`n"
    exit 1
}

$keytoolCmd = if ($keytool -is [string]) { $keytool } else { $keytool.Source }
Write-Host "[v] Menggunakan keytool: $keytoolCmd" -ForegroundColor Green

# 2. Get password
if (-not $Password) {
    # Generate a strong 24-character random password if user doesn't specify
    $bytes = New-Object byte[] 18
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Password = [Convert]::ToBase64String($bytes)
    Write-Host "[*] Password otomatis dibuat (simpan password ini!): $Password" -ForegroundColor Yellow
}

$targetKeystore = Join-Path $PSScriptRoot "..\android\app\$KeystoreName"
if (Test-Path $targetKeystore) {
    Write-Host "[!] $targetKeystore sudah ada. Membatalkan agar tidak menimpa keystore lama." -ForegroundColor Red
    exit 1
}

# 3. Generate Keystore (PKCS12)
Write-Host "[*] Membuat keystore di $targetKeystore..." -ForegroundColor Cyan
& $keytoolCmd -genkeypair `
    -v `
    -keystore $targetKeystore `
    -alias $Alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storetype PKCS12 `
    -storepass $Password `
    -keypass $Password `
    -dname "CN=Narra Notch, OU=Mobile, O=Narra, L=Jakarta, ST=Jakarta, C=ID"

if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Gagal membuat keystore." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 4. Generate Base64
$bytes = [IO.File]::ReadAllBytes($targetKeystore)
$base64 = [Convert]::ToBase64String($bytes)
$base64File = Join-Path $PSScriptRoot "..\android\app\keystore-base64.txt"
$base64 | Set-Content $base64File

Write-Host "`n[SUCCESS] Release Keystore berhasil dibuat!" -ForegroundColor Green
Write-Host "File keystore: $targetKeystore" -ForegroundColor White
Write-Host "File base64:   $base64File" -ForegroundColor White

Write-Host "`n=== Langkah Selanjutnya untuk GitHub Secrets ===" -ForegroundColor Cyan
Write-Host "Buka: https://github.com/carissadarmafissaleha/narra-notch/settings/secrets/actions" -ForegroundColor White
Write-Host "Tambahkan 4 Repository Secrets berikut:" -ForegroundColor White
Write-Host "1. ANDROID_KEYSTORE_BASE64  -> (Copy seluruh isi file android\app\keystore-base64.txt)"
Write-Host "2. ANDROID_KEYSTORE_PASSWORD-> $Password"
Write-Host "3. ANDROID_KEY_ALIAS        -> $Alias"
Write-Host "4. ANDROID_KEY_PASSWORD     -> $Password"
Write-Host "`n[PENTING] Simpan file $KeystoreName dan password di tempat aman sebagai cadangan!" -ForegroundColor Yellow
