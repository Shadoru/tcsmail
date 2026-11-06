use thiserror::Error;

#[derive(Debug, Error)]
pub enum SecretError {
    #[error("credential not found")]
    NotFound,
    #[error("credential backend unavailable: {0}")]
    MissingTool(String),
    #[error("credential backend failed: {0}")]
    Failed(String),
}

pub struct SecretStore;

impl SecretStore {
    /// Store a namespaced application secret in the operating-system credential store.
    /// This is used for OAuth token sets and intentionally has no file/SQLite fallback.
    pub fn store_secret(key: &str, value: &str) -> Result<(), SecretError> {
        platform::store(key, value)
    }

    pub fn lookup_secret(key: &str) -> Result<String, SecretError> {
        platform::lookup(key)
    }

    pub fn clear_secret(key: &str) -> Result<(), SecretError> {
        platform::clear(key)
    }

    pub fn store_password(account_email: &str, password: &str) -> Result<(), SecretError> {
        platform::store(account_email, password)
    }

    pub fn optional_password(account_email: &str) -> Result<Option<String>, SecretError> {
        match platform::lookup(account_email) {
            Ok(value) => Ok(Some(value)),
            Err(SecretError::NotFound) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn lookup_password(account_email: &str) -> Result<String, SecretError> {
        platform::lookup(account_email)
    }

    pub fn clear_password(account_email: &str) -> Result<(), SecretError> {
        platform::clear(account_email)
    }

    pub fn migrate_password(old_email: &str, new_email: &str) -> Result<(), SecretError> {
        if old_email.eq_ignore_ascii_case(new_email) {
            return Ok(());
        }
        let password = Self::lookup_password(old_email)?;
        Self::store_password(new_email, &password)?;
        let _ = Self::clear_password(old_email);
        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::SecretError;
    use std::io::Write;
    use std::process::{Command, Stdio};

    pub fn store(account: &str, password: &str) -> Result<(), SecretError> {
        let mut child = Command::new("secret-tool")
            .args([
                "store",
                "--label",
                &format!("TCS Mail — {account}"),
                "application",
                "tcs-mail",
                "account",
                account,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| SecretError::MissingTool(e.to_string()))?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| SecretError::Failed("credential stdin unavailable".into()))?
            .write_all(password.as_bytes())
            .map_err(|e| SecretError::Failed(e.to_string()))?;
        let out = child
            .wait_with_output()
            .map_err(|e| SecretError::Failed(e.to_string()))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(SecretError::Failed(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ))
        }
    }

    pub fn lookup(account: &str) -> Result<String, SecretError> {
        let out = Command::new("secret-tool")
            .args(["lookup", "application", "tcs-mail", "account", account])
            .output()
            .map_err(|e| SecretError::MissingTool(e.to_string()))?;
        if !out.status.success() {
            if out.status.code() == Some(1) && out.stderr.is_empty() {
                return Err(SecretError::NotFound);
            }
            return Err(SecretError::Failed("credential lookup failed".into()));
        }
        let value = String::from_utf8(out.stdout)
            .map_err(|_| SecretError::Failed("credential is not UTF-8".into()))?;
        // secret-tool appends one newline; spaces are part of the password.
        let value = value.strip_suffix('\n').unwrap_or(&value).to_string();
        if value.is_empty() {
            Err(SecretError::NotFound)
        } else {
            Ok(value)
        }
    }

    pub fn clear(account: &str) -> Result<(), SecretError> {
        let out = Command::new("secret-tool")
            .args(["clear", "application", "tcs-mail", "account", account])
            .output()
            .map_err(|e| SecretError::MissingTool(e.to_string()))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(SecretError::Failed(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ))
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::SecretError;
    use security_framework::passwords::{
        delete_generic_password, generic_password, set_generic_password, PasswordOptions,
    };
    const SERVICE: &str = "com.thecreativesolver.TCSMail";

    pub fn store(account: &str, password: &str) -> Result<(), SecretError> {
        // Use Security.framework directly so OAuth/password material never appears in
        // a process command line (Apple explicitly documents security(1) -w as insecure).
        set_generic_password(SERVICE, account, password.as_bytes())
            .map_err(|e| SecretError::Failed(e.to_string()))
    }

    pub fn lookup(account: &str) -> Result<String, SecretError> {
        let bytes = generic_password(PasswordOptions::new_generic_password(SERVICE, account))
            .map_err(|e| {
                if e.code() == -25300 {
                    SecretError::NotFound
                } else {
                    SecretError::Failed(e.to_string())
                }
            })?;
        String::from_utf8(bytes)
            .map_err(|e| SecretError::Failed(format!("credential is not UTF-8: {e}")))
    }

    pub fn clear(account: &str) -> Result<(), SecretError> {
        delete_generic_password(SERVICE, account).map_err(|e| SecretError::Failed(e.to_string()))
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::SecretError;
    use std::io::Write;
    use std::process::{Command, Stdio};

    const SCRIPT: &str = r#"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class TcsCred {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct CREDENTIAL { public UInt32 Flags; public UInt32 Type; public string TargetName; public string Comment; public long LastWritten; public UInt32 CredentialBlobSize; public IntPtr CredentialBlob; public UInt32 Persist; public UInt32 AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
 [DllImport("Advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredWrite(ref CREDENTIAL cred, UInt32 flags);
 [DllImport("Advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credentialPtr);
 [DllImport("Advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
 [DllImport("Advapi32.dll", EntryPoint="CredFree", SetLastError=true)] public static extern void CredFree(IntPtr cred);
}
'@
$target='TCS Mail/'+$User
if($Op -eq 'set'){
  $secret=[Console]::In.ReadToEnd()
  $bytes=[Text.Encoding]::Unicode.GetBytes($secret)
  $ptr=[Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  try {[Runtime.InteropServices.Marshal]::Copy($bytes,0,$ptr,$bytes.Length);$c=New-Object TcsCred+CREDENTIAL;$c.Type=1;$c.TargetName=$target;$c.UserName=$User;$c.CredentialBlobSize=$bytes.Length;$c.CredentialBlob=$ptr;$c.Persist=2;if(-not [TcsCred]::CredWrite([ref]$c,0)){exit 2}} finally {[Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)}
}elseif($Op -eq 'get'){
  $p=[IntPtr]::Zero;if(-not [TcsCred]::CredRead($target,1,0,[ref]$p)){if([Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 1168){exit 3}else{exit 5}};try{$c=[Runtime.InteropServices.Marshal]::PtrToStructure($p,[type][TcsCred+CREDENTIAL]);$bytes=New-Object byte[] $c.CredentialBlobSize;[Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob,$bytes,0,$bytes.Length);[Console]::Out.Write([Text.Encoding]::Unicode.GetString($bytes))}finally{[TcsCred]::CredFree($p)}
}elseif($Op -eq 'delete'){if(-not [TcsCred]::CredDelete($target,1,0)){exit 4}}
"#;

    // Windows PowerShell 5.1 does not bind -Op/-User as parameters to a
    // script supplied via `-Command SCRIPT` in the form previously used here.
    // Encode the complete command as UTF-16LE Base64 (-EncodedCommand), and
    // independently encode the account key, preventing PowerShell injection.
    // The credential VALUE is never included in command arguments: stdin only.
    fn command(op: &str, user: &str) -> Result<std::process::Child, SecretError> {
        use base64::{engine::general_purpose::STANDARD, Engine as _};
        use std::os::windows::process::CommandExt;

        if !matches!(op, "set" | "get" | "delete") {
            return Err(SecretError::Failed("invalid credential operation".into()));
        }
        let op64 = STANDARD.encode(op.as_bytes());
        let user64 = STANDARD.encode(user.as_bytes());
        let script = format!(
            "$ErrorActionPreference='Stop'; \
             $Op=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{op64}')); \
             $User=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{user64}'));\n{SCRIPT}"
        );
        let mut utf16_le = Vec::with_capacity(script.len() * 2);
        for unit in script.encode_utf16() {
            utf16_le.extend_from_slice(&unit.to_le_bytes());
        }
        let encoded = STANDARD.encode(utf16_le);
        let mut child = Command::new("powershell.exe");
        child
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-EncodedCommand",
                encoded.as_str(),
            ])
            // Avoid creating another console window from a GUI application.
            .creation_flags(0x0800_0000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        child
            .spawn()
            .map_err(|e| SecretError::MissingTool(e.to_string()))
    }
    pub fn store(account: &str, password: &str) -> Result<(), SecretError> {
        let mut child = command("set", account)?;
        child
            .stdin
            .as_mut()
            .ok_or_else(|| SecretError::Failed("credential stdin unavailable".into()))?
            .write_all(password.as_bytes())
            .map_err(|e| SecretError::Failed(e.to_string()))?;
        let out = child
            .wait_with_output()
            .map_err(|e| SecretError::Failed(e.to_string()))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(SecretError::Failed(
                String::from_utf8_lossy(&out.stderr).trim().to_string(),
            ))
        }
    }
    pub fn lookup(account: &str) -> Result<String, SecretError> {
        let out = command("get", account)?
            .wait_with_output()
            .map_err(|e| SecretError::Failed(e.to_string()))?;
        if !out.status.success() {
            return Err(if out.status.code() == Some(3) {
                SecretError::NotFound
            } else {
                SecretError::Failed("credential lookup failed".into())
            });
        }
        let value = String::from_utf8(out.stdout)
            .map_err(|_| SecretError::Failed("credential is not UTF-8".into()))?;
        if value.is_empty() {
            Err(SecretError::NotFound)
        } else {
            Ok(value)
        }
    }
    pub fn clear(account: &str) -> Result<(), SecretError> {
        let out = command("delete", account)?
            .wait_with_output()
            .map_err(|e| SecretError::Failed(e.to_string()))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(SecretError::Failed("credential delete failed".into()))
        }
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
mod platform {
    use super::SecretError;
    pub fn store(_: &str, _: &str) -> Result<(), SecretError> {
        Err(SecretError::MissingTool("unsupported platform".into()))
    }
    pub fn lookup(_: &str) -> Result<String, SecretError> {
        Err(SecretError::MissingTool("unsupported platform".into()))
    }
    pub fn clear(_: &str) -> Result<(), SecretError> {
        Err(SecretError::MissingTool("unsupported platform".into()))
    }
}

// CI regression: credential values must roundtrip on Windows without a console
// window and without interpreting account keys as PowerShell source. Uses only
// synthetic, short-lived data; never reads real user credentials.
#[cfg(all(test, target_os = "windows"))]
mod windows_credential_tests {
    use super::SecretStore;

    #[test]
    fn windows_roundtrip_unicode_and_shell_metacharacters() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let key = format!("tcs-rc4-ci:{}:{};@'", std::process::id(), stamp);
        let value = r#"Senha-sintetica | ; ' " $ ( ) ê 漢字 🦀"#;
        SecretStore::store_secret(&key, value).expect("store synthetic credential");
        let fetched = SecretStore::lookup_secret(&key).expect("read synthetic credential");
        assert_eq!(fetched, value, "secret storage roundtrip mismatch");
        SecretStore::clear_secret(&key).expect("delete synthetic credential");
        assert!(
            SecretStore::lookup_secret(&key).is_err(),
            "credential survived delete"
        );
    }
}
