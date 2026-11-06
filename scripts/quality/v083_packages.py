"""Native payload inspection; never execute or install the application."""
from pathlib import Path
import hashlib
import json
import plistlib
import struct
import subprocess
import sys
import tempfile

from v083_release import IDENTIFIER, MSI_VERSION, VERSION


def require(value, message):
    if not value:
        raise ValueError(message)


def check_pe(path, *, app=False):
    raw = path.read_bytes()
    require(len(raw) >= 64 and raw[:2] == b"MZ", f"Invalid PE executable: {path.name}")
    offset = struct.unpack_from("<I", raw, 0x3c)[0]
    require(offset + 94 <= len(raw) and raw[offset:offset + 4] == b"PE\0\0", "Invalid PE header")
    if app:
        require(struct.unpack_from("<H", raw, offset + 4)[0] == 0x8664, "Windows application must be x64")
    require(struct.unpack_from("<H", raw, offset + 24 + 68)[0] == 2, "Windows executable must use GUI subsystem")


def inspect_windows(selected, basedir):
    require(sys.platform == "win32", "Inspect MSI on a native Windows runner")
    exe = next(p for p in selected if p.suffix.lower() == ".exe")
    msi = next(p for p in selected if p.suffix.lower() == ".msi")
    require(VERSION in exe.name and VERSION in msi.name, "Installer filename has stale public version")
    check_pe(exe)  # NSIS bootstrap can be x86 even with an x64 application.
    check_pe(basedir.parent / "tcs-mail.exe", app=True)
    # Read the MSI database without launching an installer. No path interpolation.
    script = r'''
$ErrorActionPreference = 'Stop'
$installer = New-Object -ComObject WindowsInstaller.Installer
$db = $installer.OpenDatabase($env:TCS_INSPECT_MSI, 0)
$result = @{}
foreach ($name in @('ProductName','ProductVersion','UpgradeCode')) {
  $view = $db.OpenView("SELECT ``Value`` FROM ``Property`` WHERE ``Property``='$name'")
  $view.Execute()
  $record = $view.Fetch()
  if ($null -eq $record) { throw "Missing MSI property $name" }
  $result[$name] = $record.StringData(1)
  $view.Close()
}
$result['Template'] = $db.SummaryInformation(0).Property(7)
$result | ConvertTo-Json -Compress
'''
    import os
    env = os.environ.copy()
    env["TCS_INSPECT_MSI"] = str(msi.resolve())
    result = subprocess.check_output(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                                     env=env, encoding="utf-8")
    info = json.loads(result)
    require(info["ProductName"] == "TCS Mail", "MSI product identity changed")
    require(info["ProductVersion"] == MSI_VERSION, "MSI embedded version mismatch")
    require(info["Template"].split(";")[0].lower() == "x64", "MSI architecture mismatch")
    require(bool(info["UpgradeCode"]), "Missing MSI upgrade identity")


def app_signature(app, arch):
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    require(info["CFBundleIdentifier"] == IDENTIFIER, "macOS persisted application identity changed")
    require(info["CFBundleShortVersionString"] == VERSION, "macOS embedded version mismatch")
    executable = app / "Contents/MacOS" / info["CFBundleExecutable"]
    require(executable.is_file(), "macOS application executable missing")
    architectures = subprocess.check_output(["lipo", "-archs", str(executable)], encoding="utf-8").split()
    require(architectures == [arch], f"macOS architecture mismatch: {architectures}")
    require(any((app / "Contents/Resources").glob("*.icns")), "macOS packaged icon missing")
    digest = hashlib.sha256()
    for path in sorted(app.rglob("*")):
        digest.update(str(path.relative_to(app)).encode("utf-8"))
        if path.is_symlink():
            digest.update(b"symlink:" + str(path.readlink()).encode("utf-8"))
        elif path.is_file():
            digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def inspect_mac(selected, kind):
    require(sys.platform == "darwin", "Inspect APP/DMG on a native macOS runner")
    app = next(p for p in selected if p.suffix.lower() == ".app")
    dmg = next(p for p in selected if p.suffix.lower() == ".dmg")
    arch = "x86_64" if kind == "mac_intel" else "arm64"
    signature = app_signature(app, arch)
    subprocess.run(["hdiutil", "verify", str(dmg)], check=True)
    with tempfile.TemporaryDirectory(prefix="v083-dmg-") as tmp:
        mount = Path(tmp) / "volume"
        subprocess.run(["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(dmg)], check=True)
        try:
            apps = list(mount.glob("*.app"))
            require(len(apps) == 1, "DMG must contain exactly one APP")
            require(app_signature(apps[0], arch) == signature, "DMG payload differs from the inspected APP")
        finally:
            subprocess.run(["hdiutil", "detach", str(mount)], check=True)


def inspect_native(selected, kind, basedir):
    if kind == "windows":
        inspect_windows(selected, basedir)
    elif kind in {"mac_intel", "mac_arm"}:
        inspect_mac(selected, kind)
