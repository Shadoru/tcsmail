// SPDX-License-Identifier: MPL-2.0
// Explicit byte/text boundaries. This module uses only std so its regressions
// can run without starting Tauri, opening a database, or connecting to a server.

#[cfg(any(target_os = "windows", test))]
pub(crate) const WINDOWS_FONT_SCRIPT: &str = r#"[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); $OutputEncoding = [Console]::OutputEncoding; (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts','HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts' -ErrorAction SilentlyContinue).PSObject.Properties | Where-Object {$_.Name -notmatch '^PS'} | ForEach-Object {$_.Name -replace ' \(.+?\)$',''}"#;

pub(crate) fn decode_font_output(raw: &[u8]) -> Option<&str> {
    // No code-page guessing or replacement characters in displayed font names.
    std::str::from_utf8(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(raw)).ok()
}

const PREVIEW_ENCODING_ERROR: &str = "Não foi possível pré-visualizar o texto: codificação não suportada ou dados inválidos. Use Abrir ou Salvar.";

pub(crate) fn decode_preview_text(raw: &[u8]) -> Result<String, &'static str> {
    // UTF-32 BOMs overlap UTF-16 LE. Reject them before considering UTF-16.
    if raw.starts_with(b"\xff\xfe\x00\x00") || raw.starts_with(b"\x00\x00\xfe\xff") {
        return Err(PREVIEW_ENCODING_ERROR);
    }
    let utf16 = raw
        .strip_prefix(b"\xff\xfe")
        .map(|bytes| (bytes, true))
        .or_else(|| raw.strip_prefix(b"\xfe\xff").map(|bytes| (bytes, false)));
    if let Some((bytes, little_endian)) = utf16 {
        if bytes.len() % 2 != 0 {
            return Err(PREVIEW_ENCODING_ERROR);
        }
        let units = bytes
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| {
                let pair = [pair[0], pair[1]];
                if little_endian {
                    u16::from_le_bytes(pair)
                } else {
                    u16::from_be_bytes(pair)
                }
            })
            .collect::<Vec<_>>();
        return String::from_utf16(&units).map_err(|_| PREVIEW_ENCODING_ERROR);
    }
    let bytes = raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(raw);
    std::str::from_utf8(bytes)
        .map(str::to_owned)
        .map_err(|_| PREVIEW_ENCODING_ERROR)
}

pub(crate) fn split_mbox(raw: &[u8]) -> Vec<Vec<u8>> {
    // Keep the existing line-delimited "From " envelope convention, but never
    // decode/re-encode RFC822/MIME payloads, normalize EOLs, or unescape bodies.
    let mut out = Vec::new();
    let mut current = Vec::new();
    for line in raw.split_inclusive(|byte| *byte == b'\n') {
        if line.starts_with(b"From ") {
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.extend_from_slice(line);
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mbox_preserves_non_utf8_binary_mime_and_mixed_line_endings() {
        let first = b"Subject: synthetic\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n\x00\x80\xff\xfe\r\n>From escaped\r\n";
        let second = b"Subject: synthetic 2\nContent-Type: text/plain; charset=windows-1252\n\nA\xe7\xe3o\nFromage\nfinal\x80";
        let mut raw = b"From synthetic Sat Jan 01 00:00:00 2022\r\n".to_vec();
        raw.extend_from_slice(first);
        raw.extend_from_slice(b"From synthetic Sun Jan 02 00:00:00 2022\n");
        raw.extend_from_slice(second);
        assert_eq!(split_mbox(&raw), vec![first.to_vec(), second.to_vec()]);
    }

    #[test]
    fn mbox_without_envelope_is_a_byte_identical_single_message() {
        for raw in [
            b"Subject: synthetic\r\n\r\n\xff\x80".as_slice(),
            b"\x00\xff",
            b"\n",
        ] {
            assert_eq!(split_mbox(raw), vec![raw.to_vec()]);
        }
        assert!(split_mbox(b"").is_empty());
        assert!(split_mbox(b"From synthetic\nFrom synthetic\n").is_empty());
    }

    #[test]
    fn preview_accepts_strict_utf8_with_optional_bom_without_normalizing_text() {
        let text = "Segurança 日本語 😀 e\u{301}\r\n";
        assert_eq!(decode_preview_text(text.as_bytes()), Ok(text.into()));
        let mut bom = b"\xef\xbb\xbf".to_vec();
        bom.extend_from_slice(text.as_bytes());
        assert_eq!(decode_preview_text(&bom), Ok(text.into()));
        // A correctly encoded U+FFFD is content, not a decoder substitution.
        assert_eq!(
            decode_preview_text("\u{fffd}".as_bytes()),
            Ok("\u{fffd}".into())
        );
        assert_eq!(decode_preview_text(b""), Ok(String::new()));
    }

    #[test]
    fn preview_accepts_bom_utf16_in_both_byte_orders_including_surrogate_pairs() {
        let text = "Ação 日本語 😀\r\n";
        for little_endian in [false, true] {
            let mut bytes = if little_endian {
                vec![0xff, 0xfe]
            } else {
                vec![0xfe, 0xff]
            };
            for unit in text.encode_utf16() {
                bytes.extend_from_slice(&if little_endian {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                });
            }
            assert_eq!(decode_preview_text(&bytes), Ok(text.into()));
        }
    }

    #[test]
    fn preview_rejects_unsupported_and_malformed_encodings_without_replacement() {
        for raw in [
            b"A\xe7\xe3o".as_slice(),         // Windows-1252 / ISO-8859-1, no guessing.
            b"\xc0\xaf",                      // Overlong UTF-8.
            b"\xed\xa0\x80",                  // UTF-8 encoding of an unpaired surrogate.
            b"\xef\xbb\xbf\xff",              // UTF-8 BOM followed by invalid UTF-8.
            b"\xff\xfeA",                     // Odd UTF-16 byte count.
            b"\xff\xfe\x00\xd8",              // Unpaired UTF-16 LE high surrogate.
            b"\xfe\xff\xdc\x00",              // Unpaired UTF-16 BE low surrogate.
            b"\xff\xfe\x00\x00A\x00\x00\x00", // UTF-32 LE.
            b"\x00\x00\xfe\xff\x00\x00\x00A", // UTF-32 BE.
        ] {
            assert_eq!(decode_preview_text(raw), Err(PREVIEW_ENCODING_ERROR));
        }
        assert!(PREVIEW_ENCODING_ERROR.contains("Abrir ou Salvar"));
    }

    #[test]
    fn font_output_requires_utf8_and_preserves_international_family_names() {
        let names = "Família Sintética\r\n日本語\r\n😀\r\n";
        assert_eq!(decode_font_output(names.as_bytes()), Some(names));
        let mut bom = b"\xef\xbb\xbf".to_vec();
        bom.extend_from_slice(names.as_bytes());
        assert_eq!(decode_font_output(&bom), Some(names));
        assert_eq!(decode_font_output(b"Fam\xedlia"), None);
    }

    #[test]
    fn windows_font_script_declares_utf8_for_console_and_pipeline() {
        assert!(WINDOWS_FONT_SCRIPT.starts_with("[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); $OutputEncoding = [Console]::OutputEncoding;"));
        assert!(WINDOWS_FONT_SCRIPT.contains("Get-ItemProperty"));
    }
}
