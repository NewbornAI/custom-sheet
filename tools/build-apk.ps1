$ErrorActionPreference = 'Continue'
# the app folder is the folder this script lives in, so the repo can
# move without this file knowing about it
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$sdk = 'C:\Android\sdk'
$bt = Join-Path $sdk 'build-tools\34.0.0'
$androidJar = Join-Path $sdk 'platforms\android-34\android.jar'
$app = Join-Path $root 'app'
$out = Join-Path $root 'build'
$javaHome = 'C:\Program Files\Java\jdk-25'
$env:JAVA_HOME = $javaHome
$env:PATH = "$javaHome\bin;$env:PATH"

if (-not (Test-Path $androidJar)) { throw "android-34 is missing, run tools/install-android-sdk.ps1" }
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Output "1. the page travels with the app"
$assets = Join-Path $app 'assets'
if (Test-Path $assets) { Remove-Item $assets -Recurse -Force }
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Copy-Item (Join-Path $root 'dist\index.html') (Join-Path $assets 'index.html') -Force
Get-ChildItem (Join-Path $root 'dist\data') -Filter *.json | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $assets $_.Name) -Force
}

Write-Output "2. compiling resources"
$resZip = Join-Path $out 'res.zip'
if (Test-Path $resZip) { Remove-Item $resZip -Force }
& "$bt\aapt2.exe" compile --dir "$app\res" -o $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed" }

Write-Output "3. linking resources"
$baseApk = Join-Path $out 'base.apk'
if (Test-Path $baseApk) { Remove-Item $baseApk -Force }
& "$bt\aapt2.exe" link -o $baseApk --manifest "$app\AndroidManifest.xml" -I $androidJar -A $assets $resZip
if ($LASTEXITCODE -ne 0) { throw "aapt2 link failed" }

Write-Output "4. compiling java"
$classes = Join-Path $out 'classes'
if (Test-Path $classes) { Remove-Item $classes -Recurse -Force }
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$src = @(
  "$app\java\com\newbornai\customsheet\MainActivity.java"
  "$app\java\com\newbornai\customsheet\ApkProvider.java"
)
& "$javaHome\bin\javac.exe" --release 11 -cp $androidJar -d $classes $src
if ($LASTEXITCODE -ne 0) {
  Write-Output "retrying javac with source and target 11"
  & "$javaHome\bin\javac.exe" -source 11 -target 11 -bootclasspath $androidJar -d $classes $src
}
if ($LASTEXITCODE -ne 0) { throw "javac failed" }

Write-Output "5. dexing"
$dexDir = Join-Path $out 'dex'
if (Test-Path $dexDir) { Remove-Item $dexDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dexDir | Out-Null
$classesJar = Join-Path $out 'classes.jar'
if (Test-Path $classesJar) { Remove-Item $classesJar -Force }
& "$javaHome\bin\jar.exe" cf $classesJar -C $classes .
& "$bt\d8.bat" --lib $androidJar --min-api 24 --output $dexDir $classesJar
if ($LASTEXITCODE -ne 0) { throw "d8 failed" }

Write-Output "6. putting the dex in the package"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($baseApk, 'Update')
$entry = $zip.CreateEntry('classes.dex')
$stream = $entry.Open()
$bytes = [System.IO.File]::ReadAllBytes((Join-Path $dexDir 'classes.dex'))
$stream.Write($bytes, 0, $bytes.Length)
$stream.Close()
$zip.Dispose()

Write-Output "7. aligning"
$aligned = Join-Path $out 'aligned.apk'
if (Test-Path $aligned) { Remove-Item $aligned -Force }
& "$bt\zipalign.exe" -f -p 4 $baseApk $aligned
if ($LASTEXITCODE -ne 0) { throw "zipalign failed" }

Write-Output "8. signing"
$keystore = Join-Path $root 'keys\custom-sheet.keystore'
New-Item -ItemType Directory -Force -Path (Split-Path $keystore) | Out-Null
if (-not (Test-Path $keystore)) {
  & "$javaHome\bin\keytool.exe" -genkeypair -v -keystore $keystore -alias sheet -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=custom-sheet, O=Newborn AI, C=FR"
  if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
}
$signed = Join-Path $root 'dist\custom-sheet.apk'
if (Test-Path $signed) { Remove-Item $signed -Force }
& "$bt\apksigner.bat" sign --ks $keystore --ks-pass pass:android --key-pass pass:android --min-sdk-version 24 --out $signed $aligned
if ($LASTEXITCODE -ne 0) { throw "apksigner failed" }

Write-Output "9. verifying"
& "$bt\apksigner.bat" verify --print-certs $signed
Copy-Item $signed (Join-Path $out 'custom-sheet.apk') -Force
Write-Output ("APK ready: " + (Get-Item $signed).Length + " bytes at " + $signed)
