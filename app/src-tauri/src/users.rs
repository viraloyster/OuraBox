//! Several people on the same computer: each one enters their own encrypted
//! space with their username and password (their own vault and their own
//! documents, in their own folder).
//!
//! Usernames are not stored in readable form: each user's folder is named
//! after a fingerprint of the name mixed with a salt unique to this computer.
//! So looking at the disk does not tell who uses OuraBox; to get in, the name
//! has to be typed.
//!
//! The space from before users existed (a single password) stays in its
//! folder until the person gives it a name: then it moves, whole, to that
//! user's folder.

use crate::crypto::{self, KdfParams};
use crate::documents::Store;
use crate::error::{Error, ErrorCode, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use zeroize::Zeroizing;

const USERS_DIR: &str = "users";
const LEGACY_DIR: &str = "documents";
const SALT_FILE: &str = "device.salt";
const MAX_NAME_CHARS: usize = 40;

/// What the door has to show.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SpaceState {
    /// There are no users: the first one has to be created.
    New,
    /// There is a space from before users existed: it has to be given a name.
    Legacy,
    Locked,
    Unlocked,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SpaceStatus {
    pub state: SpaceState,
    /// The name the person entered with (only while the space is open).
    pub user: Option<String>,
    /// A mark of the session, to keep each user's things on this computer
    /// separate (the documents they had open). It is not the name.
    pub slot: Option<String>,
}

struct Active {
    name: String,
    slot: String,
    store: Arc<Store>,
}

pub struct Users {
    root: PathBuf,
    kdf: KdfParams,
    active: Mutex<Option<Active>>,
}

impl Users {
    pub fn open(root: PathBuf) -> Result<Self> {
        Self::open_with_kdf(root, KdfParams::default())
    }

    pub(crate) fn open_with_kdf(root: PathBuf, kdf: KdfParams) -> Result<Self> {
        fs::create_dir_all(root.join(USERS_DIR)).map_err(|e| {
            Error::io(
                "create_data_folder_failed",
                "Could not create the data folder",
                e,
            )
        })?;
        Ok(Self {
            root,
            kdf,
            active: Mutex::new(None),
        })
    }

    /// The space of the user who entered, or "locked".
    pub fn store(&self) -> Result<Arc<Store>> {
        self.active
            .lock()
            .map_err(|_| Error::internal())?
            .as_ref()
            .map(|active| active.store.clone())
            .ok_or_else(Error::locked)
    }

    pub fn status(&self) -> SpaceStatus {
        if let Ok(active) = self.active.lock() {
            if let Some(active) = active.as_ref() {
                return SpaceStatus {
                    state: SpaceState::Unlocked,
                    user: Some(active.name.clone()),
                    slot: Some(active.slot.clone()),
                };
            }
        }
        let state = if Store::has_vault(&self.legacy_dir()) {
            SpaceState::Legacy
        } else if self.has_users() {
            SpaceState::Locked
        } else {
            SpaceState::New
        };
        SpaceStatus {
            state,
            user: None,
            slot: None,
        }
    }

    /// A new user with their space. Returns the recovery key, which is shown
    /// only once, and leaves the space open.
    pub fn create(&self, name: &str, password: &str) -> Result<Zeroizing<String>> {
        let (shown, dir, slot) = self.free_slot(name)?;
        let store = Store::open_with_kdf(dir.clone(), self.kdf)?;
        let code = store.create_vault(password).inspect_err(|_| {
            let _ = fs::remove_dir_all(&dir);
        })?;
        self.activate(shown, slot, store);
        Ok(code)
    }

    /// A new user from an encrypted backup (on another computer).
    pub fn create_from_copy(
        &self,
        name: &str,
        source: &Path,
        secret: &str,
        new_password: Option<&str>,
    ) -> Result<()> {
        let (shown, dir, slot) = self.free_slot(name)?;
        let store = Store::open_with_kdf(dir.clone(), self.kdf)?;
        store
            .restore_copy(source, secret, new_password)
            .inspect_err(|_| {
                let _ = fs::remove_dir_all(&dir);
            })?;
        self.activate(shown, slot, store);
        Ok(())
    }

    /// Enters with username and password. If the user does not exist, the error
    /// is the same as with a wrong password (and takes as long).
    pub fn unlock(&self, name: &str, password: &str) -> Result<()> {
        let (shown, slot) = self.slot_of(name)?;
        let dir = self.user_dir(&slot);
        if !Store::has_vault(&dir) {
            // The same cost as trying the password: it does not show whether the user exists.
            let _ = crypto::derive_key(password.as_bytes(), &[0u8; 16], self.kdf);
            return Err(wrong_user_or_password());
        }
        let store = Store::open_with_kdf(dir, self.kdf)?;
        store.unlock(password).map_err(|error| match error.code {
            ErrorCode::WrongPassword => wrong_user_or_password(),
            _ => error,
        })?;
        self.activate(shown, slot, store);
        Ok(())
    }

    /// Enters with the recovery key and chooses a new password.
    pub fn recover(&self, name: &str, code: &str, new_password: &str) -> Result<()> {
        let (shown, slot) = self.slot_of(name)?;
        let dir = self.user_dir(&slot);
        if !Store::has_vault(&dir) {
            return Err(Error::new(
                ErrorCode::WrongPassword,
                "wrong_username_or_recovery_code",
                "Wrong username or recovery key.",
            ));
        }
        let store = Store::open_with_kdf(dir, self.kdf)?;
        store.recover(code, new_password)?;
        self.activate(shown, slot, store);
        Ok(())
    }

    /// The space from before users existed gets a name: it opens with its usual
    /// password and moves, whole, to that user's folder.
    pub fn claim_legacy(&self, name: &str, password: &str) -> Result<()> {
        let legacy = self.legacy_dir();
        if !Store::has_vault(&legacy) {
            return Err(Error::new(
                ErrorCode::NotFound,
                "no_legacy_space",
                "There is no earlier space.",
            ));
        }
        // First the password is checked, without moving anything.
        Store::open_with_kdf(legacy.clone(), self.kdf)?.unlock(password)?;
        let (shown, dir, slot) = self.free_slot(name)?;
        fs::remove_dir(&dir).ok();
        fs::rename(&legacy, &dir).map_err(|e| {
            Error::io(
                "move_space_failed",
                "Could not move your space to your user",
                e,
            )
        })?;
        let store = Store::open_with_kdf(dir, self.kdf)?;
        store.unlock(password)?;
        self.activate(shown, slot, store);
        Ok(())
    }

    /// Signs out: the key is forgotten and nothing stays open.
    pub fn lock(&self) {
        if let Ok(mut active) = self.active.lock() {
            if let Some(active) = active.take() {
                active.store.lock();
            }
        }
    }

    /// Deletes the user who entered, with their whole space, after checking
    /// their password. The other users keep theirs. Encrypted backups already
    /// made are elsewhere and stay as they are.
    pub fn delete_active(&self, password: &str) -> Result<()> {
        // Holding `active` while deleting: no other command can reach the space meanwhile.
        let mut active = self.active.lock().map_err(|_| Error::internal())?;
        let current = active.as_ref().ok_or_else(Error::locked)?;
        let result = current.store.destroy(password);
        // Once the vault is gone the space can't be opened again: nobody stays
        // signed in, even if removing the rest of the folder failed.
        if !Store::has_vault(&self.user_dir(&current.slot)) {
            active.take();
        }
        result
    }

    // ---------- Pieces ----------

    fn activate(&self, name: String, slot: String, store: Store) {
        if let Ok(mut active) = self.active.lock() {
            if let Some(previous) = active.take() {
                previous.store.lock();
            }
            *active = Some(Active {
                name,
                slot,
                store: Arc::new(store),
            });
        }
    }

    fn legacy_dir(&self) -> PathBuf {
        self.root.join(LEGACY_DIR)
    }

    fn user_dir(&self, slot: &str) -> PathBuf {
        self.root.join(USERS_DIR).join(slot)
    }

    fn has_users(&self) -> bool {
        fs::read_dir(self.root.join(USERS_DIR))
            .map(|entries| entries.flatten().any(|e| Store::has_vault(&e.path())))
            .unwrap_or(false)
    }

    /// The folder for a new user: the name cannot be taken.
    fn free_slot(&self, name: &str) -> Result<(String, PathBuf, String)> {
        let (shown, slot) = self.slot_of(name)?;
        let dir = self.user_dir(&slot);
        if Store::has_vault(&dir) {
            return Err(Error::invalid(
                "username_taken",
                "There is already a user with that name on this computer.",
            ));
        }
        Ok((shown, dir, slot))
    }

    /// The fingerprint of the name (ignoring case and extra spaces).
    fn slot_of(&self, name: &str) -> Result<(String, String)> {
        let shown = clean_name(name)?;
        let salt = self.salt()?;
        let mut hasher = Sha256::new();
        hasher.update(b"ourabox:user:");
        hasher.update(&salt);
        hasher.update(shown.to_lowercase().as_bytes());
        let digest = hasher.finalize();
        let slot: String = digest[..16].iter().map(|b| format!("{b:02x}")).collect();
        Ok((shown, slot))
    }

    /// This computer's salt: it is created once.
    fn salt(&self) -> Result<Vec<u8>> {
        let path = self.root.join(USERS_DIR).join(SALT_FILE);
        if let Ok(bytes) = fs::read(&path) {
            if bytes.len() == 16 {
                return Ok(bytes);
            }
        }
        let salt = crypto::random_salt().to_vec();
        fs::write(&path, &salt)
            .map_err(|e| Error::io("prepare_users_failed", "Could not prepare the users", e))?;
        Ok(salt)
    }
}

fn wrong_user_or_password() -> Error {
    Error::new(
        ErrorCode::WrongPassword,
        "wrong_username_or_password",
        "Wrong username or password.",
    )
}

/// A username: 1 to 40 letters, numbers, spaces or `.-_`, without extra
/// spaces.
fn clean_name(name: &str) -> Result<String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(Error::invalid("username_required", "Type your username."));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(Error::invalid(
            "username_too_long",
            format!("A username can have up to {MAX_NAME_CHARS} characters."),
        ));
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, ' ' | '.' | '-' | '_'))
    {
        return Err(Error::invalid(
            "username_invalid_characters",
            "A username can only have letters, numbers, spaces, periods or dashes.",
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::documents::DocKind;

    const FAST: KdfParams = KdfParams {
        memory_kib: 1024,
        iterations: 1,
        parallelism: 1,
    };

    fn users() -> (tempfile::TempDir, Users) {
        let dir = tempfile::tempdir().unwrap();
        let users = Users::open_with_kdf(dir.path().to_path_buf(), FAST).unwrap();
        (dir, users)
    }

    #[test]
    fn each_user_has_their_own_space() {
        let (_dir, users) = users();
        assert_eq!(users.status().state, SpaceState::New);
        users.create("Ana", "ana long password").unwrap();
        assert_eq!(users.status().user.as_deref(), Some("Ana"));
        let mut doc = users
            .store()
            .unwrap()
            .create(None, DocKind::File, None)
            .unwrap();
        doc.html = "<p>from Ana</p>".into();
        users.store().unwrap().save(doc).unwrap();
        users.lock();
        assert_eq!(users.status().state, SpaceState::Locked);
        assert_eq!(users.store().err().map(|e| e.code), Some(ErrorCode::Locked));

        users.create("Beto", "beto long password").unwrap();
        assert!(users.store().unwrap().list().unwrap().is_empty());
        users.lock();

        // The name ignores case and extra spaces.
        users.unlock("  ana ", "ana long password").unwrap();
        assert_eq!(users.store().unwrap().list().unwrap().len(), 1);
    }

    #[test]
    fn a_wrong_user_and_a_wrong_password_look_the_same() {
        let (_dir, users) = users();
        users.create("Ana", "ana long password").unwrap();
        users.lock();
        let no_user = users.unlock("Nobody", "ana long password").unwrap_err();
        let bad_password = users.unlock("Ana", "another long password").unwrap_err();
        assert_eq!(no_user, bad_password);
        assert_eq!(users.status().state, SpaceState::Locked);
    }

    #[test]
    fn names_are_unique_and_not_stored_as_text() {
        let (dir, users) = users();
        users.create("Ana", "ana long password").unwrap();
        users.lock();
        assert_eq!(
            users
                .create("ANA", "another long password")
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        assert_eq!(
            users
                .create("<script>", "another long password")
                .unwrap_err()
                .code,
            ErrorCode::InvalidInput
        );
        for entry in fs::read_dir(dir.path().join(USERS_DIR)).unwrap().flatten() {
            assert!(!entry
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                .contains("ana"));
        }
    }

    #[test]
    fn deleting_a_user_needs_their_password() {
        let (dir, users) = users();
        users.create("Ana", "ana long password").unwrap();
        users
            .store()
            .unwrap()
            .create(None, DocKind::File, None)
            .unwrap();
        let slot = users.status().slot.unwrap();
        assert_eq!(
            users
                .delete_active("another long password")
                .unwrap_err()
                .key,
            "wrong_password"
        );
        assert_eq!(users.status().state, SpaceState::Unlocked);
        assert_eq!(users.store().unwrap().list().unwrap().len(), 1);
        assert!(dir.path().join(USERS_DIR).join(slot).exists());
    }

    #[test]
    fn deleting_the_only_user_leaves_the_computer_new() {
        let (dir, users) = users();
        users.create("Ana", "ana long password").unwrap();
        let slot = users.status().slot.unwrap();
        users.delete_active("ana long password").unwrap();
        assert!(!dir.path().join(USERS_DIR).join(slot).exists());
        assert_eq!(users.status().state, SpaceState::New);
        assert_eq!(users.store().err().map(|e| e.code), Some(ErrorCode::Locked));
        assert_eq!(
            users.unlock("Ana", "ana long password").unwrap_err().code,
            ErrorCode::WrongPassword
        );
        // The name is free again.
        users.create("Ana", "a new long password").unwrap();
        assert!(users.store().unwrap().list().unwrap().is_empty());
    }

    #[test]
    fn deleting_a_user_keeps_the_others() {
        let (_dir, users) = users();
        users.create("Ana", "ana long password").unwrap();
        let mut doc = users
            .store()
            .unwrap()
            .create(None, DocKind::File, None)
            .unwrap();
        doc.html = "<p>from Ana</p>".into();
        users.store().unwrap().save(doc).unwrap();
        users.lock();

        users.create("Beto", "beto long password").unwrap();
        users.delete_active("beto long password").unwrap();
        assert_eq!(users.status().state, SpaceState::Locked);
        assert!(users.unlock("Beto", "beto long password").is_err());

        users.unlock("Ana", "ana long password").unwrap();
        assert_eq!(users.store().unwrap().list().unwrap().len(), 1);
    }

    #[test]
    fn deleting_needs_someone_signed_in() {
        let (_dir, users) = users();
        users.create("Ana", "ana long password").unwrap();
        users.lock();
        assert_eq!(
            users.delete_active("ana long password").unwrap_err().code,
            ErrorCode::Locked
        );
        users.unlock("Ana", "ana long password").unwrap();
    }

    #[test]
    fn the_space_from_before_becomes_a_user() {
        let (dir, users) = users();
        let legacy = Store::open_with_kdf(dir.path().join(LEGACY_DIR), FAST).unwrap();
        legacy.create_vault("the usual password").unwrap();
        let mut doc = legacy.create(None, DocKind::File, None).unwrap();
        doc.html = "<p>old idea</p>".into();
        legacy.save(doc).unwrap();
        legacy.lock();

        assert_eq!(users.status().state, SpaceState::Legacy);
        assert_eq!(
            users
                .claim_legacy("Ana", "another password")
                .unwrap_err()
                .code,
            ErrorCode::WrongPassword
        );
        users.claim_legacy("Ana", "the usual password").unwrap();
        assert_eq!(users.store().unwrap().list().unwrap().len(), 1);
        users.lock();
        assert_eq!(users.status().state, SpaceState::Locked);
        users.unlock("ana", "the usual password").unwrap();
        assert_eq!(users.store().unwrap().list().unwrap().len(), 1);
    }
}
