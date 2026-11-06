use std::{
    io::Read,
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};
pub const MAX_EXTRACTED_BYTES: usize = 8 * 1024 * 1024;

pub fn bounded_text(reader: impl Read) -> Result<String, String> {
    let mut bytes = Vec::new();
    reader
        .take((MAX_EXTRACTED_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_EXTRACTED_BYTES {
        return Err("O texto extraído excede 8 MiB. Divida o documento antes de indexar.".into());
    }
    String::from_utf8(bytes).map_err(|_| "O documento não contém texto UTF-8 válido.".into())
}

pub fn pdf_text(path: &Path) -> Result<String, String> {
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    let mut command = Command::new("pdftotext");
    command
        .arg("-layout")
        .arg(path)
        .arg("-")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    bounded_command(command, Duration::from_secs(30))
}

fn bounded_command(mut command: Command, timeout: Duration) -> Result<String, String> {
    let mut child = command.spawn().map_err(|_| {
        "Não foi possível iniciar pdftotext. Instale o extrator PDF ou escolha outro formato."
            .to_string()
    })?;
    let Some(stdout) = child.stdout.take() else {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Saída do extrator indisponível.".into());
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let reader = std::thread::spawn(move || {
        let _ = tx.send(bounded_text(stdout));
    });
    let deadline = Instant::now() + timeout;
    let mut text = None;
    let result = loop {
        if text.is_none() {
            match rx.try_recv() {
                Ok(Ok(value)) => text = Some(value),
                Ok(Err(error)) => break Err(error),
                Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                    break Err("Falha ao ler a saída do extrator.".into())
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => {}
            }
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                if !status.success() {
                    break Err("Falha ao extrair o PDF.".into());
                }
                if let Some(value) = text.take() {
                    break Ok(value);
                }
            }
            Ok(None) => {}
            Err(_) => break Err("Falha ao aguardar o extrator.".into()),
        }
        if Instant::now() >= deadline {
            break Err(
                "A extração do PDF excedeu 30 segundos. Divida ou converta o documento.".into(),
            );
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    if result.is_err() {
        let _ = child.kill();
    }
    let _ = child.wait();
    let _ = reader.join();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_expansion_and_invalid_encoding() {
        assert!(
            bounded_text(std::io::repeat(b'x').take((MAX_EXTRACTED_BYTES + 10) as u64)).is_err()
        );
        assert!(bounded_text(&[0xff][..]).is_err());
        assert_eq!(
            bounded_text("Segurança 🦀".as_bytes()).unwrap(),
            "Segurança 🦀"
        );
    }
    #[cfg(unix)]
    #[test]
    fn times_out_and_reaps_extractor() {
        let mut command = Command::new("sh");
        command
            .args(["-c", "while :; do :; done"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        assert!(bounded_command(command, Duration::from_millis(50)).is_err());
    }
}
