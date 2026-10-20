const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('Windows helper parses, compiles its Win32 declarations, and verifies unified metadata with fixtures', { skip: process.platform !== 'win32' }, () => {
  // Compile declarations and evaluate metadata-only paths. Fixtures intercept all
  // package, registry, and file discovery; no real application is activated.
  const code = String.raw`
$ErrorActionPreference = 'Stop'
$helper = $env:LAUNCHFX_TEST_HELPER
$tokens = $null; $errors = $null
$tree = [Management.Automation.Language.Parser]::ParseFile($helper, [ref]$tokens, [ref]$errors)
if ($errors -and $errors.Count -gt 0) { throw ($errors | Out-String) }
$source = [IO.File]::ReadAllText($helper)
$csharp = [regex]::Match($source, "(?s)Add-Type -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
if (-not $csharp) { throw 'Native declarations were not found.' }
Add-Type -TypeDefinition $csharp
function Get-AppxPackage {
  @(
    [pscustomobject]@{ Name='OpenAI.ChatGPT.Classic'; PackageFullName='classic'; PackageFamilyName='OpenAI.ChatGPT.Classic_abc'; InstallLocation='C:\Fixtures\Classic' },
    [pscustomobject]@{ Name='OpenAI.ChatGPT.New'; PackageFullName='unified'; PackageFamilyName='OpenAI.ChatGPT.New_abc'; InstallLocation='C:\Fixtures\Unified' }
  )
}
function Get-AppxPackageManifest {
  param($Package)
  if ($Package -eq 'unified') { return [xml]'<Package><Applications><Application Id="App" Executable="ChatGPT.exe"><Extensions><Extension Category="windows.protocol"><Protocol Name="codex"/></Extension></Extensions></Application></Applications></Package>' }
  return [xml]'<Package><Applications><Application Id="App" Executable="ChatGPT.exe"/></Applications></Package>'
}
function Test-Path { param($LiteralPath, $PathType) return $true }
function Get-Item {
  param($LiteralPath, $ErrorAction)
  $key = [pscustomobject]@{}
  $key | Add-Member -MemberType ScriptMethod -Name GetValue -Value { param($Name) return '"C:\Fixtures\Unified\ChatGPT.exe" "%1"' }
  return $key
}
function Invoke-Fixture($Action, $Data) {
  $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Data | ConvertTo-Json -Compress)))
  return (& ([scriptblock]::Create($source)) -Action $Action -Payload $payload | ConvertFrom-Json)
}
$detected = Invoke-Fixture 'detect' @{ target='codex' }
if ($detected.appUserModelId -ne 'OpenAI.ChatGPT.New_abc!App' -or -not $detected.supportsUnified) { throw 'Unified Store discovery selected the wrong application.' }
$matched = Invoke-Fixture 'inspect' @{ app='C:\Fixtures\Unified\ChatGPT.exe' }
$unmatched = Invoke-Fixture 'inspect' @{ app='C:\Fixtures\Classic\ChatGPT.exe' }
if (-not $matched.supportsUnified -or $unmatched.supportsUnified) { throw 'Protocol ownership did not remain pinned to its executable.' }
function Get-Process { param($ErrorAction) return @() }
$closed = Invoke-Fixture 'status' @{ app='store:OpenAI.ChatGPT.New_abc!App' }
if ($closed.running) { throw 'An empty process list was mistaken for a running Store application.' }
'native-fixtures-ok'
`;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const output = execFileSync(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
    env: { ...process.env, LAUNCHFX_TEST_HELPER: path.resolve(__dirname, '../native/windows/window.ps1') }
  });
  assert.match(output, /native-fixtures-ok/);
});
