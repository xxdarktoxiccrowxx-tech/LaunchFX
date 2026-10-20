param(
  [ValidateSet('detect', 'inspect', 'status', 'launch')][string]$Action,
  [string]$Payload
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Send-Result($Value) {
  Write-Output ($Value | ConvertTo-Json -Compress -Depth 5)
}
function Test-UnifiedStoreEntry($Entry) {
  if (-not $Entry) { return $false }
  $protocols = @($Entry.SelectNodes(".//*[local-name()='Protocol']"))
  return (@($protocols | Where-Object { $_.GetAttribute('Name') -ieq 'codex' }).Count -gt 0)
}
function Test-UnifiedExecutable([string]$Executable) {
  foreach ($root in @('Registry::HKEY_CURRENT_USER\Software\Classes', 'Registry::HKEY_LOCAL_MACHINE\Software\Classes')) {
    try {
      $key = Get-Item -LiteralPath "$root\codex\shell\open\command" -ErrorAction Stop
      $command = [string]$key.GetValue('')
      # Read only the first executable token. Registry commands are never executed.
      $match = [regex]::Match($command, '^\s*(?:"([^"]+)"|([^\s"]+))')
      if (-not $match.Success) { continue }
      $registered = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
      $registered = [Environment]::ExpandEnvironmentVariables($registered)
      if ([IO.Path]::IsPathRooted($registered) -and [IO.Path]::GetFullPath($registered) -ieq [IO.Path]::GetFullPath($Executable)) { return $true }
    } catch { }
  }
  return $false
}
function Get-StoreEntry([string]$Identifier) {
  $parts = $Identifier.Split('!')
  $package = Get-AppxPackage | Where-Object { $_.PackageFamilyName -ceq $parts[0] } | Select-Object -First 1
  if (-not $package) { return $null }
  $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
  $entry = @($manifest.Package.Applications.Application) | Where-Object { $_.Id -ceq $parts[1] } | Select-Object -First 1
  if ($entry) { return @{ package = $package; entry = $entry } }
  return $null
}
function Get-StoreExecutable([string]$Identifier) {
  try {
    $found = Get-StoreEntry $Identifier
    if (-not $found) { return $null }
    $package = $found.package; $entry = $found.entry
    if (-not $entry.Executable) { return $null }
    $root = [IO.Path]::GetFullPath($package.InstallLocation).TrimEnd('\') + '\'
    $executable = [IO.Path]::GetFullPath((Join-Path $root ([string]$entry.Executable)))
    if ($executable.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetExtension($executable) -ieq '.exe' -and (Test-Path -LiteralPath $executable -PathType Leaf)) { return $executable }
  } catch { }
  return $null
}

try {
  $data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
  if ($Action -eq 'detect') {
    if ($data.target -notin @('chatgpt', 'codex')) { throw 'Invalid target application.' }
    $wanted = if ($data.target -eq 'codex') { 'Codex' } else { 'ChatGPT' }
    $packages = Get-AppxPackage | Where-Object { $_.Name -match '(?i)^OpenAI[.\-].*(ChatGPT|Codex)' } | Sort-Object -Property @{ Expression = { if ($_.Name -match "(?i)$wanted") { 0 } else { 1 } } }, Name
    foreach ($package in $packages) {
      $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
      foreach ($entry in @($manifest.Package.Applications.Application)) {
        $unified = Test-UnifiedStoreEntry $entry
        if ($entry.Id -and ($package.Name -match "(?i)$wanted" -or $unified)) {
          Send-Result @{ appUserModelId = "$($package.PackageFamilyName)!$($entry.Id)"; supportsUnified = [bool]$unified }
          return
        }
      }
    }
    Send-Result @{ appUserModelId = $null }
    return
  }
  $targetPath = [string]$data.app
  $storeApp = $targetPath.StartsWith('store:')
  if ($storeApp) {
    $appUserModelId = $targetPath.Substring(6)
    if ($appUserModelId -notmatch '^[A-Za-z0-9_.-]+![A-Za-z0-9_.-]+$') { throw 'Invalid Store application identifier.' }
  } else {
    if (-not [IO.Path]::IsPathRooted($targetPath) -or [IO.Path]::GetExtension($targetPath) -ine '.exe' -or $targetPath.IndexOf([char]0) -ge 0) { throw 'Choose a valid Windows application.' }
    $targetPath = [IO.Path]::GetFullPath($targetPath)
    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) { throw 'The selected application could not be found.' }
  }
  if ($Action -eq 'inspect') {
    if ($storeApp) {
      $found = Get-StoreEntry $appUserModelId
      Send-Result @{ supportsUnified = [bool](Test-UnifiedStoreEntry $found.entry) }
    } else {
      Send-Result @{ supportsUnified = [bool](Test-UnifiedExecutable $targetPath) }
    }
    return
  }
  if ($Action -eq 'status') {
    if ($storeApp) {
      $executable = Get-StoreExecutable $appUserModelId
      $matching = @()
      if ($executable) {
        $matching = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -ieq $executable } catch { $false } })
      }
      Send-Result @{ running = ($matching.Count -gt 0) }
    } else {
      $matching = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -ieq $targetPath } catch { $false } })
      Send-Result @{ running = ($matching.Count -gt 0) }
    }
    return
  }
  if ($data.target -notin @('chatgpt', 'codex') -or $data.mode -notin @('auto', 'application', 'unified')) { throw 'Invalid launch options.' }

  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace LaunchFX {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MonitorInfo { public int Size; public Rect Monitor; public Rect Work; public uint Flags; }
  [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IApplicationActivationManager {
    [PreserveSig]
    int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, [MarshalAs(UnmanagedType.LPWStr)] string arguments, uint options, out uint processId);
    [PreserveSig]
    int ActivateForFile([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray, [MarshalAs(UnmanagedType.LPWStr)] string verb, out uint processId);
    [PreserveSig]
    int ActivateForProtocol([MarshalAs(UnmanagedType.LPWStr)] string appUserModelId, IntPtr itemArray, out uint processId);
  }
  [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] class ApplicationActivationManager { }
  public static class Window {
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr64(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong32(IntPtr window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] static extern IntPtr SetWindowLongPtr64(IntPtr window, int index, IntPtr value);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")] static extern int SetWindowLong32(IntPtr window, int index, int value);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    public static long GetStyle(IntPtr window, int index) { return IntPtr.Size == 8 ? GetWindowLongPtr64(window, index).ToInt64() : (long)(uint)GetWindowLong32(window, index); }
    public static void SetStyle(IntPtr window, int index, long value) { if (IntPtr.Size == 8) SetWindowLongPtr64(window, index, new IntPtr(value)); else SetWindowLong32(window, index, unchecked((int)value)); }
    public static uint Activate(string id, string arguments) {
      var manager = (IApplicationActivationManager)new ApplicationActivationManager();
      uint pid; int result = manager.ActivateApplication(id, arguments, 0, out pid);
      if (result < 0) Marshal.ThrowExceptionForHR(result);
      return pid;
    }
    public static MonitorInfo Monitor(IntPtr window) {
      MonitorInfo info = new MonitorInfo(); info.Size = Marshal.SizeOf(typeof(MonitorInfo));
      if (!GetMonitorInfo(MonitorFromWindow(window, 2), ref info)) throw new Exception("Could not identify the application display.");
      return info;
    }
    public static Rect Bounds(IntPtr window) { Rect rect; if (!GetWindowRect(window, out rect)) throw new Exception("Could not read the target window bounds."); return rect; }
    public static bool OwnedBy(IntPtr window, uint pid) { uint owner; return IsWindow(window) && GetWindowThreadProcessId(window, out owner) != 0 && owner == pid; }
  }
}
'@
  [LaunchFX.Window]::SetProcessDpiAwarenessContext([IntPtr]::new(-4)) | Out-Null
  $uri = ''
  if ($data.mode -eq 'unified') {
    $route = if ($data.target -eq 'chatgpt') { 'chat' } else { 'codex' }
    $uri = "codex://new?mode=$route"
  }
  if ($storeApp) {
    $storeExecutable = Get-StoreExecutable $appUserModelId
    $targetPid = [int][LaunchFX.Window]::Activate($appUserModelId, $uri)
  } else {
    if ($uri) { $started = Start-Process -FilePath $targetPath -ArgumentList $uri -PassThru }
    else { $started = Start-Process -FilePath $targetPath -PassThru }
    $targetPid = $started.Id
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  $window = [IntPtr]::Zero
  $targetProcess = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($storeApp) {
      if ($storeExecutable) {
        $possible = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -ieq $storeExecutable } catch { $false } })
      } else {
        $possible = @(Get-Process -Id $targetPid -ErrorAction SilentlyContinue)
      }
    } else {
      # Electron may forward the launch to its existing instance. Match its exact executable path.
      $possible = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -ieq $targetPath } catch { $false } })
    }
    foreach ($candidate in $possible) {
      $candidate.Refresh()
      if ($candidate.MainWindowHandle -ne [IntPtr]::Zero -and [LaunchFX.Window]::OwnedBy($candidate.MainWindowHandle, [uint32]$candidate.Id)) {
        $targetProcess = $candidate; $targetPid = $candidate.Id; $window = $candidate.MainWindowHandle; break
      }
    }
    if ($window -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 120
  }
  if ($window -eq [IntPtr]::Zero) {
    Send-Result @{ ok = $true; warning = 'The application opened, but its main window was not available. Window mode could not be changed.' }
    return
  }
  if (-not [LaunchFX.Window]::OwnedBy($window, [uint32]$targetPid)) { throw 'The target window changed before it could be adjusted.' }
  $monitor = [LaunchFX.Window]::Monitor($window)
  $bounds = [LaunchFX.Window]::Bounds($window)
  $style = [LaunchFX.Window]::GetStyle($window, -16)
  $extendedStyle = [LaunchFX.Window]::GetStyle($window, -20)
  $stateDirectory = [string]$data.stateDirectory
  if (-not [IO.Path]::IsPathRooted($stateDirectory)) { throw 'Invalid local window-state directory.' }
  [IO.Directory]::CreateDirectory($stateDirectory) | Out-Null
  $stateFile = Join-Path $stateDirectory "$targetPid-$($window.ToInt64()).json"
  $identity = "$targetPid/$($targetProcess.StartTime.ToUniversalTime().Ticks)/$($window.ToInt64())"
  $previous = $null
  if (Test-Path -LiteralPath $stateFile) {
    try { $previous = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } catch { $previous = $null }
    if ($previous.identity -ne $identity) { $previous = $null }
  }
  $overlapped = [long]0x00CF0000
  if ([bool]$data.fullscreen) {
    if (-not $previous) {
      @{ identity = $identity; style = $style; extendedStyle = $extendedStyle; left = $bounds.Left; top = $bounds.Top; width = $bounds.Right - $bounds.Left; height = $bounds.Bottom - $bounds.Top } |
        ConvertTo-Json -Compress | Set-Content -LiteralPath $stateFile -Encoding UTF8
    }
    [LaunchFX.Window]::ShowWindow($window, 9) | Out-Null
    [LaunchFX.Window]::SetStyle($window, -16, ($style -band (-bnot $overlapped)))
    [LaunchFX.Window]::SetWindowPos($window, [IntPtr]::Zero, $monitor.Monitor.Left, $monitor.Monitor.Top, $monitor.Monitor.Right - $monitor.Monitor.Left, $monitor.Monitor.Bottom - $monitor.Monitor.Top, 0x0060) | Out-Null
  } elseif ($previous) {
    [LaunchFX.Window]::SetStyle($window, -16, [long]$previous.style)
    [LaunchFX.Window]::SetStyle($window, -20, [long]$previous.extendedStyle)
    [LaunchFX.Window]::ShowWindow($window, 9) | Out-Null
    [LaunchFX.Window]::SetWindowPos($window, [IntPtr]::Zero, [int]$previous.left, [int]$previous.top, [int]$previous.width, [int]$previous.height, 0x0060) | Out-Null
    Remove-Item -LiteralPath $stateFile
  } else {
    [LaunchFX.Window]::ShowWindow($window, 9) | Out-Null
    $fillsScreen = $bounds.Left -le $monitor.Monitor.Left -and $bounds.Top -le $monitor.Monitor.Top -and $bounds.Right -ge $monitor.Monitor.Right -and $bounds.Bottom -ge $monitor.Monitor.Bottom
    if ($fillsScreen -and ($style -band 0x00C00000) -eq 0) {
      [LaunchFX.Window]::SetStyle($window, -16, ($style -bor $overlapped))
      $width = [int](($monitor.Work.Right - $monitor.Work.Left) * 0.85)
      $height = [int](($monitor.Work.Bottom - $monitor.Work.Top) * 0.85)
      [LaunchFX.Window]::SetWindowPos($window, [IntPtr]::Zero, $monitor.Work.Left + 40, $monitor.Work.Top + 40, $width, $height, 0x0060) | Out-Null
    }
  }
  [LaunchFX.Window]::SetForegroundWindow($window) | Out-Null
  $warning = ''
  if ([bool]$data.fullscreen) {
    $after = [LaunchFX.Window]::Bounds($window)
    if ($after.Left -ne $monitor.Monitor.Left -or $after.Top -ne $monitor.Monitor.Top -or $after.Right -ne $monitor.Monitor.Right -or $after.Bottom -ne $monitor.Monitor.Bottom) {
      $warning = 'The application opened, but Windows did not confirm the requested full-screen bounds.'
    }
  }
  Send-Result @{ ok = $true; pid = $targetPid; warning = $warning }
} catch {
  Send-Result @{ error = $_.Exception.Message }
}
