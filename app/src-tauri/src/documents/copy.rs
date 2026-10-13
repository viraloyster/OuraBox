//! Encrypted backups of the whole space, to keep wherever the person wants (a
//! USB drive, Google Drive, another computer) without anyone else being able
//! to read them.
//!
//! The space's files are already encrypted, so the backup stores them as they
//! are and adds a second layer: that way their names, how many there are and
//! their dates cannot be seen either. The backup carries the vault (the
//! wrapped master key), which is why it opens with the password there was
//! when it was made, or with the recovery key.
//!
//! Format of an `.ourabox` file:
//!
//! ```text
//! "OURABOX-COPY1\n"
//! u32 (LE)  length of the vault, and the vault (vault.json)
//! 16 bytes  id of the backup, random
//! chunks    u32 (LE) length + chunk sealed with the master key
//! ```
//!
//! Each chunk is bound to the backup's id, to its number and to whether it is
//! the last one: they cannot be reordered, mixed with another backup's or cut
//! short without it being noticed. Opened and joined, the chunks are a list
//! of files: u16 path length, the path, u64 length, the bytes.

use super::*;
use std::io::{BufReader, BufWriter, ErrorKind, Read};

const MAGIC: &[u8] = b"OURABOX-COPY1\n";
const CHUNK: usize = 1024 * 1024;
/// What the encryption adds to each chunk (nonce and tag), with some margin.
const CHUNK_OVERHEAD: usize = 64;
const MAX_VAULT_BYTES: usize = 64 * 1024;
const MAX_ENTRY_BYTES: u64 = (MAX_DOCUMENT_BYTES + CHUNK) as u64;
const RESTORE_DIR: &str = ".restoring";

impl Store {
    /// Writes an encrypted backup of the whole space to `target`.
    pub fn export_copy(&self, target: &Path) -> Result<()> {
        let key = self.key()?;
        // Nobody writes while copying: the backup stays consistent.
        let _guard = self.index_guard()?;
        let vault = fs::read(self.dir.join(VAULT_FILE))
            .map_err(|e| Error::io("read_vault_failed", "Could not read the vault", e))?;
        let mut tmp = target.as_os_str().to_owned();
        tmp.push(".tmp");
        let tmp = PathBuf::from(tmp);
        let result = self.write_copy(&key, &vault, &tmp).and_then(|()| {
            fs::rename(&tmp, target).map_err(save_copy_error)?;
            sync_dir(target.parent());
            Ok(())
        });
        if result.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        result
    }

    fn write_copy(&self, key: &SecretKey, vault: &[u8], path: &Path) -> Result<()> {
        let save_error = save_copy_error;
        let file = fs::File::create(path).map_err(save_error)?;
        let mut out = BufWriter::new(file);
        out.write_all(MAGIC).map_err(save_error)?;
        out.write_all(&(vault.len() as u32).to_le_bytes())
            .map_err(save_error)?;
        out.write_all(vault).map_err(save_error)?;
        let id = crypto::random_salt();
        out.write_all(&id).map_err(save_error)?;

        let mut chunks = ChunkWriter {
            out,
            key,
            id: hex(&id),
            number: 0,
            buffer: Vec::with_capacity(CHUNK * 2),
        };
        for (name, path) in self.copy_entries() {
            let data = fs::read(&path)
                .map_err(|e| Error::io("read_file_failed", "Could not read a file", e))?;
            chunks.entry(&name, &data)?;
        }
        let out = chunks.finish()?;
        let file = out.into_inner().map_err(|e| save_error(e.into_error()))?;
        file.sync_all().map_err(save_error)
    }

    /// The space's files that go in the backup, with their relative path.
    fn copy_entries(&self) -> Vec<(String, PathBuf)> {
        let mut entries = Vec::new();
        for name in [INDEX_FILE, PROJECTS_FILE] {
            let path = self.dir.join(name);
            if path.is_file() {
                entries.push((name.to_string(), path));
            }
        }
        for (id, path) in files_with_extension(&self.dir, DOCUMENT_EXT) {
            entries.push((format!("{id}.{DOCUMENT_EXT}"), path));
        }
        for path in read_dir_paths(&self.dir.join(ASSETS_DIR)) {
            if let Some(name) =
                file_name(&path).filter(|n| n.strip_suffix(".obx").is_some_and(is_valid_asset_id))
            {
                entries.push((format!("{ASSETS_DIR}/{name}"), path));
            }
        }
        for folder in read_dir_paths(&self.dir.join(HISTORY_DIR)) {
            let Some(id) = file_name(&folder).filter(|id| is_valid_id(id)) else {
                continue;
            };
            for path in read_dir_paths(&folder) {
                if let Some(name) = file_name(&path).filter(|n| {
                    n.strip_suffix(".obx")
                        .is_some_and(|stem| parse_snapshot_name(stem).is_some())
                }) {
                    entries.push((format!("{HISTORY_DIR}/{id}/{name}"), path));
                }
            }
        }
        entries
    }

    /// Opens a backup in a new space. With `new_password`, `secret` is the
    /// recovery key and the backup gets that new password; otherwise, `secret`
    /// is the password there was when the backup was made.
    pub fn restore_copy(
        &self,
        source: &Path,
        secret: &str,
        new_password: Option<&str>,
    ) -> Result<()> {
        if let Some(password) = new_password {
            validate_password(password)?;
        }
        let mut guard = self.index_guard()?;
        if self.dir.join(VAULT_FILE).exists()
            || self.dir.join(INDEX_FILE).exists()
            || !files_with_extension(&self.dir, DOCUMENT_EXT).is_empty()
        {
            return Err(Error::invalid(
                "copy_needs_new_space",
                "A backup can only be opened in a new space, without documents.",
            ));
        }
        let not_a_copy = || Error::corrupted("not_a_copy", "This file is not an OuraBox backup.");
        let file = fs::File::open(source).map_err(|_| {
            Error::new(
                ErrorCode::NotFound,
                "copy_not_found",
                "The backup was not found.",
            )
        })?;
        let mut input = BufReader::new(file);

        let mut magic = [0u8; MAGIC.len()];
        input.read_exact(&mut magic).map_err(|_| not_a_copy())?;
        if magic != MAGIC {
            return Err(not_a_copy());
        }
        let vault_len = read_u32(&mut input).map_err(|_| not_a_copy())? as usize;
        if vault_len > MAX_VAULT_BYTES {
            return Err(not_a_copy());
        }
        let mut vault_bytes = vec![0u8; vault_len];
        input
            .read_exact(&mut vault_bytes)
            .map_err(|_| not_a_copy())?;
        let mut vault: VaultFile =
            serde_json::from_slice(&vault_bytes).map_err(|_| not_a_copy())?;
        if vault.version != VAULT_VERSION {
            return Err(Error::invalid(
                "copy_from_newer_version",
                "This backup is from a newer version of OuraBox.",
            ));
        }
        let master = match new_password {
            Some(_) => {
                let code = crypto::normalize_recovery_code(secret).ok_or_else(|| {
                    Error::invalid("invalid_recovery_code", "That recovery key is not valid.")
                })?;
                unwrap_key(&vault.recovery, code.as_bytes(), vault.kdf, AAD_RECOVERY).map_err(
                    |()| {
                        Error::new(
                            ErrorCode::WrongPassword,
                            "wrong_recovery_code_for_copy",
                            "That recovery key does not open this backup.",
                        )
                    },
                )?
            }
            None => unwrap_key(&vault.password, secret.as_bytes(), vault.kdf, AAD_PASSWORD)
                .map_err(|()| {
                    Error::new(
                        ErrorCode::WrongPassword,
                        "wrong_password_for_copy",
                        "That password does not open this backup.",
                    )
                })?,
        };
        let mut id = [0u8; 16];
        input.read_exact(&mut id).map_err(|_| not_a_copy())?;

        // Everything is decrypted and checked in a separate folder; only at the
        // end does it move into the space. If something fails, the space stays
        // as it was.
        let staging = self.dir.join(RESTORE_DIR);
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging).map_err(open_copy_error)?;
        let result = read_copy(&mut input, &master, &hex(&id), &staging).and_then(|names| {
            for name in &names {
                let to = self.dir.join(name);
                if let Some(parent) = to.parent() {
                    fs::create_dir_all(parent).map_err(open_copy_error)?;
                }
                fs::rename(staging.join(name), &to).map_err(open_copy_error)?;
            }
            if let Some(password) = new_password {
                vault.password = self.wrap(&master, password.as_bytes(), AAD_PASSWORD)?;
            }
            // The vault goes last: if it exists, the whole backup was opened.
            self.write_vault(&vault)
        });
        let _ = fs::remove_dir_all(&staging);
        result?;
        *guard = None;
        drop(guard);
        self.set_key(master)
    }
}

struct ChunkWriter<'a> {
    out: BufWriter<fs::File>,
    key: &'a SecretKey,
    id: String,
    number: u64,
    buffer: Vec<u8>,
}

impl ChunkWriter<'_> {
    fn entry(&mut self, name: &str, data: &[u8]) -> Result<()> {
        self.buffer
            .extend_from_slice(&(name.len() as u16).to_le_bytes());
        self.buffer.extend_from_slice(name.as_bytes());
        self.buffer
            .extend_from_slice(&(data.len() as u64).to_le_bytes());
        self.buffer.extend_from_slice(data);
        // There is always something left for the last chunk, which is written at the end.
        while self.buffer.len() > CHUNK {
            let rest = self.buffer.split_off(CHUNK);
            let chunk = std::mem::replace(&mut self.buffer, rest);
            self.write_chunk(&chunk, false)?;
        }
        Ok(())
    }

    fn finish(mut self) -> Result<BufWriter<fs::File>> {
        let chunk = std::mem::take(&mut self.buffer);
        self.write_chunk(&chunk, true)?;
        Ok(self.out)
    }

    fn write_chunk(&mut self, chunk: &[u8], last: bool) -> Result<()> {
        let sealed = crypto::seal(
            self.key,
            chunk,
            chunk_aad(&self.id, self.number, last).as_bytes(),
        )?;
        self.number += 1;
        let save_error = save_copy_error;
        self.out
            .write_all(&(sealed.len() as u32).to_le_bytes())
            .map_err(save_error)?;
        self.out.write_all(&sealed).map_err(save_error)
    }
}

/// Reads the chunks, decrypts them and writes each file to `staging`.
/// Returns the paths written. Fails if the backup is cut short, damaged or has
/// something that is not an OuraBox file.
fn read_copy(
    input: &mut impl Read,
    key: &SecretKey,
    id: &str,
    staging: &Path,
) -> Result<Vec<String>> {
    let damaged = || Error::corrupted("copy_corrupted", "The backup is damaged or incomplete.");
    let mut buffer: Vec<u8> = Vec::new();
    let mut names = Vec::new();
    let mut number = 0u64;
    loop {
        let len = read_u32(input).map_err(|_| damaged())? as usize;
        if len > CHUNK + CHUNK_OVERHEAD {
            return Err(damaged());
        }
        let mut sealed = vec![0u8; len];
        input.read_exact(&mut sealed).map_err(|_| damaged())?;
        let (plain, last) =
            match crypto::open(key, &sealed, chunk_aad(id, number, false).as_bytes()) {
                Ok(plain) => (plain, false),
                Err(()) => (
                    crypto::open(key, &sealed, chunk_aad(id, number, true).as_bytes())
                        .map_err(|()| damaged())?,
                    true,
                ),
            };
        number += 1;
        buffer.extend_from_slice(&plain);
        // Complete files that have already arrived are written.
        let mut at = 0;
        while let Some((name, data, next)) = next_entry(&buffer[at..]).map_err(|()| damaged())? {
            if !is_copy_path(&name) {
                return Err(damaged());
            }
            let path = staging.join(&name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(open_copy_error)?;
            }
            fs::write(&path, data).map_err(open_copy_error)?;
            names.push(name);
            at += next;
        }
        buffer.drain(..at);
        if last {
            break;
        }
    }
    // Nothing can remain after the last chunk.
    let mut extra = [0u8; 1];
    let trailing = !matches!(input.read(&mut extra), Ok(0));
    if !buffer.is_empty() || trailing {
        return Err(damaged());
    }
    Ok(names)
}

/// The next complete file in the buffer: its path, its bytes and how much it
/// takes up. `Ok(None)` if it has not fully arrived yet.
#[allow(clippy::type_complexity)]
fn next_entry(buffer: &[u8]) -> std::result::Result<Option<(String, &[u8], usize)>, ()> {
    if buffer.len() < 2 {
        return Ok(None);
    }
    let name_len = u16::from_le_bytes([buffer[0], buffer[1]]) as usize;
    let header = 2 + name_len + 8;
    if buffer.len() < header {
        return Ok(None);
    }
    let name = String::from_utf8(buffer[2..2 + name_len].to_vec()).map_err(|_| ())?;
    let mut len = [0u8; 8];
    len.copy_from_slice(&buffer[2 + name_len..header]);
    let len = u64::from_le_bytes(len);
    if len > MAX_ENTRY_BYTES {
        return Err(());
    }
    let end = header + len as usize;
    if buffer.len() < end {
        return Ok(None);
    }
    Ok(Some((name, &buffer[header..end], end)))
}

/// Only paths that OuraBox writes are accepted: nothing can get out of the folder.
fn is_copy_path(name: &str) -> bool {
    if name == INDEX_FILE || name == PROJECTS_FILE {
        return true;
    }
    let parts: Vec<&str> = name.split('/').collect();
    let stem = |file: &str| file.strip_suffix(".obx").map(str::to_string);
    match parts.as_slice() {
        [file] => stem(file).is_some_and(|s| is_valid_id(&s)),
        [ASSETS_DIR, file] => stem(file).is_some_and(|s| is_valid_asset_id(&s)),
        [HISTORY_DIR, id, file] => {
            is_valid_id(id) && stem(file).is_some_and(|s| parse_snapshot_name(&s).is_some())
        }
        _ => false,
    }
}

fn save_copy_error(error: std::io::Error) -> Error {
    Error::io("save_copy_failed", "Could not save the backup", error)
}

fn open_copy_error(error: std::io::Error) -> Error {
    Error::io("open_copy_failed", "Could not open the backup", error)
}

fn chunk_aad(id: &str, number: u64, last: bool) -> String {
    format!("ourabox:copy:{id}:{number}:{}", u8::from(last))
}

fn read_u32(input: &mut impl Read) -> std::io::Result<u32> {
    let mut bytes = [0u8; 4];
    input.read_exact(&mut bytes)?;
    Ok(u32::from_le_bytes(bytes))
}

fn read_dir_paths(dir: &Path) -> Vec<PathBuf> {
    match fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(std::result::Result::ok)
            .map(|e| e.path())
            .collect(),
        Err(e) if e.kind() == ErrorKind::NotFound => Vec::new(),
        Err(_) => Vec::new(),
    }
}

fn file_name(path: &Path) -> Option<String> {
    path.file_name()?.to_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::super::tests::{new_store, unlocked, PASSWORD};
    use super::*;

    fn filled() -> (tempfile::TempDir, Store, Document) {
        let (dir, store) = unlocked();
        let project = store.create_project("Garden").unwrap();
        let mut document = store.create(Some(project.id), DocKind::File, None).unwrap();
        document.html = "<p>Secret centipedes</p>".into();
        let image = store.put_asset("image/png", b"png bytes").unwrap();
        document
            .html
            .push_str(&format!("<img data-asset=\"{image}\">"));
        store.save(document.clone()).unwrap();
        let document = store.load(&document.id).unwrap();
        (dir, store, document)
    }

    #[test]
    fn a_copy_opens_on_another_computer_with_the_password() {
        let (dir, store, document) = filled();
        let copy = dir.path().join("backup.ourabox");
        store.export_copy(&copy).unwrap();
        let bytes = fs::read(&copy).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("centipedes"));
        assert!(!String::from_utf8_lossy(&bytes).contains(&document.id));

        let other = tempfile::tempdir().unwrap();
        let restored = new_store(other.path());
        assert_eq!(
            restored
                .restore_copy(&copy, "other key", None)
                .unwrap_err()
                .code,
            ErrorCode::WrongPassword
        );
        restored.restore_copy(&copy, PASSWORD, None).unwrap();
        assert_eq!(restored.load(&document.id).unwrap(), document);
        assert_eq!(restored.projects().unwrap(), store.projects().unwrap());
        assert_eq!(restored.list().unwrap().len(), 1);
        assert!(!other.path().join("documents").join(RESTORE_DIR).exists());
        restored.lock();
        restored.unlock(PASSWORD).unwrap();
    }

    #[test]
    fn a_copy_opens_with_the_recovery_code_and_a_new_password() {
        let dir = tempfile::tempdir().unwrap();
        let store = new_store(dir.path());
        let code = store.create_vault(PASSWORD).unwrap();
        let document = store.create(None, DocKind::Note, None).unwrap();
        let copy = dir.path().join("backup.ourabox");
        store.export_copy(&copy).unwrap();

        let other = tempfile::tempdir().unwrap();
        let restored = new_store(other.path());
        restored
            .restore_copy(&copy, &code, Some("a new password"))
            .unwrap();
        assert_eq!(restored.load(&document.id).unwrap().kind, DocKind::Note);
        restored.lock();
        restored.unlock("a new password").unwrap();
    }

    #[test]
    fn a_damaged_or_cut_copy_is_rejected_and_leaves_nothing_behind() {
        let (dir, store, _) = filled();
        let copy = dir.path().join("backup.ourabox");
        store.export_copy(&copy).unwrap();
        let bytes = fs::read(&copy).unwrap();

        let try_restore = |bytes: &[u8]| {
            let other = tempfile::tempdir().unwrap();
            let path = other.path().join("x.ourabox");
            fs::write(&path, bytes).unwrap();
            let restored = new_store(other.path());
            let error = restored.restore_copy(&path, PASSWORD, None).unwrap_err();
            let docs = other.path().join("documents");
            assert!(!docs.join(VAULT_FILE).exists());
            assert!(files_with_extension(&docs, DOCUMENT_EXT).is_empty());
            error.code
        };
        let mut flipped = bytes.clone();
        let last = flipped.len() - 1;
        flipped[last] ^= 1;
        assert_eq!(try_restore(&flipped), ErrorCode::Corrupted);
        assert_eq!(
            try_restore(&bytes[..bytes.len() - 10]),
            ErrorCode::Corrupted
        );
        let mut longer = bytes.clone();
        longer.push(0);
        assert_eq!(try_restore(&longer), ErrorCode::Corrupted);
        assert_eq!(try_restore(b"not a backup"), ErrorCode::Corrupted);
    }

    #[test]
    fn a_copy_only_opens_in_a_new_space() {
        let (dir, store, _) = filled();
        let copy = dir.path().join("backup.ourabox");
        store.export_copy(&copy).unwrap();
        assert_eq!(
            store.restore_copy(&copy, PASSWORD, None).unwrap_err().code,
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn large_spaces_are_split_into_chunks() {
        let (dir, store) = unlocked();
        for i in 0..3 {
            let mut document = store.create(None, DocKind::File, None).unwrap();
            document.html = format!("<p>{i}</p>{}", "x".repeat(CHUNK));
            store.save(document).unwrap();
        }
        let copy = dir.path().join("backup.ourabox");
        store.export_copy(&copy).unwrap();
        let other = tempfile::tempdir().unwrap();
        let restored = new_store(other.path());
        restored.restore_copy(&copy, PASSWORD, None).unwrap();
        assert_eq!(restored.list().unwrap().len(), 3);
    }

    #[test]
    fn only_paths_written_by_ourabox_are_accepted() {
        assert!(is_copy_path("index.obx"));
        assert!(is_copy_path(&format!("{}.obx", "a".repeat(32))));
        assert!(is_copy_path(&format!("assets/{}.obx", "b".repeat(64))));
        assert!(is_copy_path(&format!("history/{}/1-2.obx", "c".repeat(32))));
        assert!(!is_copy_path("../vault.json"));
        assert!(!is_copy_path("vault.json"));
        assert!(!is_copy_path(&format!("history/../{}.obx", "a".repeat(32))));
        assert!(!is_copy_path("/etc/passwd"));
    }
}
