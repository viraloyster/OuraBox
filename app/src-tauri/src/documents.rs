//! Local, encrypted storage of documents.
//!
//! Each document is saved encrypted in its own file (`<id>.obx`) inside the
//! app's data folder. A separate index, also encrypted, keeps only the
//! summaries (title, date and revision) so that listing does not require
//! decrypting heavy documents with images. While the space is open, the index
//! lives in memory; on locking, it is forgotten along with the key.
//!
//! Each save increments the document's revision. A save based on an old
//! revision is rejected: that way an older version never overwrites a newer
//! one, for example with the same document in two panes.
//!
//! See `crypto.rs` for the details of the encryption.

use crate::crypto::{self, KdfParams, SecretKey};
use crate::error::{Error, ErrorCode, Result};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};
use zeroize::Zeroizing;

mod copy;

/// Size limit for a saved document, so the disk is not filled by mistake.
const MAX_DOCUMENT_BYTES: usize = 64 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 120;
pub const MIN_PASSWORD_CHARS: usize = 8;

const VAULT_FILE: &str = "vault.json";
const VAULT_VERSION: u32 = 1;
/// Current format of documents. If it changes, a migration is added.
const DOCUMENT_FORMAT: u32 = 1;
const INDEX_FILE: &str = "index.obx";
const DOCUMENT_EXT: &str = "obx";
/// Files from the first version, which saved without encryption.
const LEGACY_EXT: &str = "json";
const LEGACY_INDEX_FILE: &str = "index.json";
const ASSETS_DIR: &str = "assets";
const HISTORY_DIR: &str = "history";
/// At most one version saved in the history every 5 minutes per document.
const SNAPSHOT_EVERY_MS: u64 = 5 * 60 * 1000;
const MAX_ASSET_BYTES: usize = 20 * 1024 * 1024;
const ASSET_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const AAD_PASSWORD: &[u8] = b"ourabox:vault:password";
const AAD_RECOVERY: &[u8] = b"ourabox:vault:recovery";
const AAD_INDEX: &[u8] = b"ourabox:index";
const AAD_PROJECTS: &[u8] = b"ourabox:projects";
const PROJECTS_FILE: &str = "projects.obx";
const MAX_PROJECT_NAME_CHARS: usize = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Stroke {
    /// The name of a palette color (`ink`, `agua`, `coral`…), which adapts to
    /// the chosen sky, or a fixed `#rrggbb` color.
    pub color: String,
    pub size: f32,
    /// Points `[x, y, pressure]` relative to the page.
    pub points: Vec<[f32; 3]>,
    /// How much the stroke was stabilized, from 0 (no smoothing) to 1.
    #[serde(default)]
    pub streamline: f32,
    /// The stroke was made without a pressure-sensitive pen (mouse or finger),
    /// so the pressure is simulated from the speed.
    #[serde(default)]
    pub simulate_pressure: bool,
    /// How opaque the stroke is, from almost transparent to 1 (solid).
    #[serde(default = "full_opacity")]
    pub opacity: f32,
    /// A pass of the eraser: erases what was drawn before, only where it passed.
    #[serde(default)]
    pub erase: bool,
    /// A shape (`line`, `arrow`, `rect`, `ellipse`) between the first point and the last.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<String>,
    /// It was drawn over the text; otherwise it goes behind.
    #[serde(default, skip_serializing_if = "is_false")]
    pub front: bool,
    /// An effect that blends colors (`watercolor`, `blur`, `smudge`) instead
    /// of painting a regular stroke.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
    /// A shape's fill: a palette color name or `#rrggbb`. None: not filled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
    /// Whether a shape keeps its outline. Only `false` is saved (filled, no outline).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline: Option<bool>,
}

fn full_opacity() -> f32 {
    1.0
}

fn is_false(value: &bool) -> bool {
    !*value
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub title: String,
    pub html: String,
    pub strokes: Vec<Stroke>,
    pub created_at: u64,
    pub updated_at: u64,
    /// How many times it was saved. Documents older than this field start at 0.
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub format: u32,
    /// What the person wants to achieve: the why, which survives even if the how changes.
    #[serde(default)]
    pub purpose: String,
    /// A single next step, chosen by the person.
    #[serde(default)]
    pub next_step: String,
    /// The box: what the idea takes for granted.
    #[serde(default)]
    pub assumptions: Vec<Assumption>,
    /// If it is an attempt at another idea, the id of the first attempt. All
    /// attempts at the same idea share this root.
    #[serde(default)]
    pub root: Option<String>,
    /// The person let go of this idea: it is not deleted, it moves to the let-go section.
    #[serde(default)]
    pub released: bool,
    /// The person let it rest: it is not suggested again before this date.
    #[serde(default)]
    pub rest_until: u64,
    /// The project (folder) it belongs to, or none.
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub kind: DocKind,
    /// The root it was born from when going deeper, or none. Roots form a tree
    /// inside the project, as deep as wanted.
    #[serde(default)]
    pub parent: Option<String>,
    /// Free text boxes, anywhere on the page and at any scale.
    #[serde(default)]
    pub boxes: Vec<TextBox>,
    /// To organize notes: a short label and a color. They change with their
    /// own command, not when saving.
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub color: Option<String>,
    /// A quick note that has not been opened yet.
    #[serde(default)]
    pub unread: bool,
    /// When it was moved to the Trash (0 if it is not there). From the Trash it
    /// is restored or deleted forever; nothing is deleted in one step.
    #[serde(default)]
    pub trashed_at: u64,
    /// The person gave it a name: the title no longer comes from the first line.
    #[serde(default)]
    pub named: bool,
    /// The page size and how many pages the file has.
    #[serde(default)]
    pub sheet: Sheet,
}

/// The size of each page (in pixels at 96 dpi: letter is 816 × 1056) and how
/// many pages the file has. Pages are added, removed and duplicated by hand;
/// only if the person asks for it, one is added on its own when reaching the end.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Sheet {
    pub width: u32,
    pub height: u32,
    /// 0 in files older than this field: they are counted by what they contain.
    pub pages: u32,
    /// Add pages on their own when writing or drawing past the last one.
    #[serde(default)]
    pub auto_pages: bool,
}

impl Default for Sheet {
    fn default() -> Self {
        Sheet {
            width: 816,
            height: 1056,
            pages: 0,
            auto_pages: false,
        }
    }
}

/// Possible page sizes, in pixels: from a card to a poster.
const SHEET_SIDE: std::ops::RangeInclusive<u32> = 200..=4000;
const MAX_PAGES: u32 = 500;

fn validate_sheet(sheet: &Sheet) -> Result<()> {
    if !SHEET_SIDE.contains(&sheet.width)
        || !SHEET_SIDE.contains(&sheet.height)
        || sheet.pages > MAX_PAGES
    {
        return Err(Error::invalid("invalid_page_size", "Invalid page size."));
    }
    Ok(())
}

/// A free text box. Its position and width are in page coordinates; `scale`
/// is the size of its lettering (1 = normal): a box written while zoomed in a
/// lot stays small on the page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TextBox {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub scale: f64,
    pub html: String,
}

/// The colors notes can be marked with: the palette's, which adapt to each
/// sky.
const NOTE_COLORS: [&str; 6] = ["ink", "agua", "coral", "sol", "alga", "crepusculo"];
const MAX_LABEL_CHARS: usize = 24;
const MAX_BOXES: usize = 5000;

/// A file is an idea for deep work; a note, something quick.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DocKind {
    #[default]
    File,
    Note,
}

/// The readable text of a document, for searching. It only lives in memory.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentText {
    pub id: String,
    pub text: String,
}

/// A root in a project's map: just enough to draw the tree.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MapNode {
    pub id: String,
    pub title: String,
    pub parent: Option<String>,
    pub kind: DocKind,
    pub assumptions: Vec<Assumption>,
}

/// A project: a folder that groups files and notes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    /// When it was moved to the Trash (0 if it is not there). Its documents go with it.
    #[serde(default)]
    pub trashed_at: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssumptionState {
    /// It is a real wall, for now.
    Accept,
    /// This is where the work outside the box is.
    Break,
    /// It needs to be found out.
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Assumption {
    pub text: String,
    pub state: AssumptionState,
}

/// A version saved in a document's history.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub name: String,
    pub updated_at: u64,
    pub revision: u64,
}

/// An image saved apart from the document.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Asset {
    pub mime: String,
    /// The bytes in base64.
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub title: String,
    pub updated_at: u64,
    #[serde(default)]
    pub revision: u64,
    #[serde(default)]
    pub root: Option<String>,
    #[serde(default)]
    pub released: bool,
    #[serde(default)]
    pub rest_until: u64,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub kind: DocKind,
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub unread: bool,
    #[serde(default)]
    pub trashed_at: u64,
}

impl Document {
    fn summary(&self) -> DocumentSummary {
        DocumentSummary {
            id: self.id.clone(),
            title: self.title.clone(),
            updated_at: self.updated_at,
            revision: self.revision,
            root: self.root.clone(),
            released: self.released,
            rest_until: self.rest_until,
            created_at: self.created_at,
            project: self.project.clone(),
            kind: self.kind,
            parent: self.parent.clone(),
            label: self.label.clone(),
            color: self.color.clone(),
            unread: self.unread,
            trashed_at: self.trashed_at,
        }
    }
}

/// The state of a vault (for tests: the app asks `users.rs`).
#[cfg(test)]
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VaultStatus {
    /// There is no password yet: it has to be created.
    New,
    Locked,
    Unlocked,
}

/// The vault: the master key wrapped with the password and with the recovery
/// key. It contains nothing readable without one of the two.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultFile {
    version: u32,
    kdf: KdfParams,
    password: WrappedKey,
    recovery: WrappedKey,
}

#[derive(Serialize, Deserialize)]
struct WrappedKey {
    salt: String,
    key: String,
}

pub struct Store {
    dir: PathBuf,
    kdf: KdfParams,
    key: Mutex<Option<SecretKey>>,
    /// The index in memory. The lock also serializes writes, so the index and
    /// the files never get out of step.
    index: Mutex<Option<Vec<DocumentSummary>>>,
}

impl Store {
    /// Is there a vault (a space with a password) in this folder?
    pub fn has_vault(dir: &Path) -> bool {
        dir.join(VAULT_FILE).exists()
    }

    pub(crate) fn open_with_kdf(dir: PathBuf, kdf: KdfParams) -> Result<Self> {
        fs::create_dir_all(&dir).map_err(|e| {
            Error::io(
                "create_data_folder_failed",
                "Could not create the data folder",
                e,
            )
        })?;
        Ok(Self {
            dir,
            kdf,
            key: Mutex::new(None),
            index: Mutex::new(None),
        })
    }

    // ---------- Vault ----------

    #[cfg(test)]
    pub fn status(&self) -> VaultStatus {
        if !self.dir.join(VAULT_FILE).exists() {
            VaultStatus::New
        } else if self.key.lock().is_ok_and(|key| key.is_some()) {
            VaultStatus::Unlocked
        } else {
            VaultStatus::Locked
        }
    }

    /// Creates the vault with a password and returns the recovery key, which is
    /// shown only this time. Encrypts any documents that existed unencrypted.
    pub fn create_vault(&self, password: &str) -> Result<Zeroizing<String>> {
        validate_password(password)?;
        let mut index = self.index_guard()?;
        if self.dir.join(VAULT_FILE).exists() {
            return Err(Error::invalid(
                "space_has_password",
                "This space already has a password.",
            ));
        }
        let master = crypto::random_key();
        let code = crypto::new_recovery_code();
        let normalized = crypto::normalize_recovery_code(&code).ok_or_else(Error::internal)?;
        let vault = VaultFile {
            version: VAULT_VERSION,
            kdf: self.kdf,
            password: self.wrap(&master, password.as_bytes(), AAD_PASSWORD)?,
            recovery: self.wrap(&master, normalized.as_bytes(), AAD_RECOVERY)?,
        };
        self.write_vault(&vault)?;
        *index = Some(self.migrate_legacy(&master)?);
        self.set_key(master)?;
        Ok(code)
    }

    pub fn unlock(&self, password: &str) -> Result<()> {
        let vault = self.read_vault()?;
        let master = unwrap_key(
            &vault.password,
            password.as_bytes(),
            vault.kdf,
            AAD_PASSWORD,
        )
        .map_err(|()| Error::wrong_password())?;
        self.set_key(master)
    }

    /// Forgets the key and the index: until unlocked again, nothing can be read or written.
    pub fn lock(&self) {
        if let Ok(mut key) = self.key.lock() {
            *key = None;
        }
        if let Ok(mut index) = self.index.lock() {
            *index = None;
        }
    }

    /// Opens the space with the recovery key and sets a new password.
    pub fn recover(&self, code: &str, new_password: &str) -> Result<()> {
        validate_password(new_password)?;
        let normalized = crypto::normalize_recovery_code(code).ok_or_else(|| {
            Error::invalid("invalid_recovery_code", "That recovery key is not valid.")
        })?;
        let _index = self.index_guard()?;
        let mut vault = self.read_vault()?;
        let master = unwrap_key(
            &vault.recovery,
            normalized.as_bytes(),
            vault.kdf,
            AAD_RECOVERY,
        )
        .map_err(|()| {
            Error::new(
                ErrorCode::WrongPassword,
                "wrong_recovery_code",
                "That recovery key does not open this space.",
            )
        })?;
        vault.password = self.wrap(&master, new_password.as_bytes(), AAD_PASSWORD)?;
        self.write_vault(&vault)?;
        self.set_key(master)
    }

    /// Changes the password. Asks for the current one even if the space is open,
    /// so that nobody who finds the computer unlocked can change it.
    /// Documents are not re-encrypted: only the wrapping of the master key changes.
    pub fn change_password(&self, current: &str, new_password: &str) -> Result<()> {
        validate_password(new_password)?;
        let _index = self.index_guard()?;
        let mut vault = self.read_vault()?;
        let master = unwrap_key(&vault.password, current.as_bytes(), vault.kdf, AAD_PASSWORD)
            .map_err(|()| Error::wrong_password())?;
        vault.password = self.wrap(&master, new_password.as_bytes(), AAD_PASSWORD)?;
        self.write_vault(&vault)
    }

    /// Creates a new recovery key and returns it; it is shown only this time.
    /// The previous one stops opening this space (backups already made still
    /// open with the key they had). Asks for the current password, just like
    /// changing it.
    pub fn new_recovery_code(&self, password: &str) -> Result<Zeroizing<String>> {
        let _index = self.index_guard()?;
        let mut vault = self.read_vault()?;
        let master = unwrap_key(
            &vault.password,
            password.as_bytes(),
            vault.kdf,
            AAD_PASSWORD,
        )
        .map_err(|()| Error::wrong_password())?;
        let code = crypto::new_recovery_code();
        let normalized = crypto::normalize_recovery_code(&code).ok_or_else(Error::internal)?;
        vault.recovery = self.wrap(&master, normalized.as_bytes(), AAD_RECOVERY)?;
        self.write_vault(&vault)?;
        Ok(code)
    }

    /// Deletes the whole space from the disk. Asks for the current password,
    /// like changing it. The key is forgotten first, and the vault is removed
    /// before everything else: if something fails halfway, what is left can no
    /// longer be opened nor counts as a user.
    pub fn destroy(&self, password: &str) -> Result<()> {
        // Holding the index waits for any save in progress to finish.
        let mut index = self.index_guard()?;
        let vault = self.read_vault()?;
        unwrap_key(
            &vault.password,
            password.as_bytes(),
            vault.kdf,
            AAD_PASSWORD,
        )
        .map_err(|()| Error::wrong_password())?;
        *self.key.lock().map_err(|_| Error::internal())? = None;
        *index = None;
        let failed = |e| Error::io("delete_user_failed", "Could not delete the user", e);
        fs::remove_file(self.dir.join(VAULT_FILE)).map_err(failed)?;
        fs::remove_dir_all(&self.dir).map_err(failed)
    }

    // ---------- Documents ----------

    /// Creates a document. With `parent`, it is born as a root of that document:
    /// it stays in the same project and is always a file.
    pub fn create(
        &self,
        project: Option<String>,
        kind: DocKind,
        parent: Option<String>,
    ) -> Result<Document> {
        let (project, kind) = match &parent {
            Some(parent) => {
                if !is_valid_id(parent) {
                    return Err(Error::invalid("invalid_root_id", "Invalid root id."));
                }
                let key = self.key()?;
                let mut guard = self.index_guard()?;
                let summary = self
                    .loaded_index(&mut guard, &key)
                    .iter()
                    .find(|s| &s.id == parent)
                    .cloned()
                    .ok_or_else(|| {
                        Error::new(
                            ErrorCode::NotFound,
                            "root_not_found",
                            "The root was not found.",
                        )
                    })?;
                (summary.project, DocKind::File)
            }
            None => {
                if let Some(project) = &project {
                    let key = self.key()?;
                    let _guard = self.index_guard()?;
                    self.require_project(&key, project)?;
                }
                (project, kind)
            }
        };
        let now = now_millis();
        let mut document = Document {
            id: uuid::Uuid::new_v4().simple().to_string(),
            title: String::new(),
            html: String::new(),
            strokes: Vec::new(),
            created_at: now,
            updated_at: now,
            revision: 0,
            format: DOCUMENT_FORMAT,
            purpose: String::new(),
            next_step: String::new(),
            assumptions: Vec::new(),
            root: None,
            released: false,
            rest_until: 0,
            project,
            kind,
            parent,
            boxes: Vec::new(),
            label: String::new(),
            color: None,
            unread: false,
            trashed_at: 0,
            named: false,
            sheet: Sheet::default(),
        };
        let summary = self.save(document.clone())?;
        document.updated_at = summary.updated_at;
        document.revision = summary.revision;
        Ok(document)
    }

    pub fn load(&self, id: &str) -> Result<Document> {
        let path = self.document_path(id)?;
        let key = self.key()?;
        self.read_document(&key, id, &path)
    }

    /// Saves the document if `document.revision` is the last one saved, and
    /// returns its summary with the new revision.
    pub fn save(&self, mut document: Document) -> Result<DocumentSummary> {
        let path = self.document_path(&document.id)?;
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        let index = self.loaded_index(&mut guard, &key);

        if let Some(saved) = index.iter().find(|s| s.id == document.id) {
            if saved.revision != document.revision {
                return Err(Error::new(
                    ErrorCode::Conflict,
                    "document_changed_elsewhere",
                    "This document changed somewhere else. Open it again to see the latest version.",
                ));
            }
            // The project and the kind change with their own commands; a pane
            // open with old data does not revert them.
            document.project = saved.project.clone();
            document.kind = saved.kind;
            document.parent = saved.parent.clone();
            document.label = saved.label.clone();
            document.color = saved.color.clone();
            document.unread = saved.unread;
            document.trashed_at = saved.trashed_at;
        } else if document.revision != 0 {
            // It is no longer in the index: it was deleted forever while it was
            // still open. Saving it would bring it back, on its own.
            return Err(Error::new(
                ErrorCode::NotFound,
                "document_deleted",
                "This document was deleted.",
            ));
        }
        validate_boxes(&document.boxes)?;
        validate_sheet(&document.sheet)?;
        if document
            .parent
            .as_deref()
            .is_some_and(|parent| !is_valid_id(parent) || parent == document.id)
        {
            return Err(Error::invalid("invalid_root_id", "Invalid root id."));
        }
        if document
            .project
            .as_deref()
            .is_some_and(|project| !is_valid_id(project))
        {
            return Err(Error::invalid("invalid_project_id", "Invalid project id."));
        }
        if document
            .root
            .as_deref()
            .is_some_and(|root| !is_valid_id(root))
        {
            return Err(Error::invalid("invalid_idea_id", "Invalid idea id."));
        }
        document.title = clean_title(&document.title);
        document.updated_at = now_millis();
        document.revision += 1;
        document.format = DOCUMENT_FORMAT;
        let json = Zeroizing::new(serde_json::to_vec(&document).map_err(|_| Error::internal())?);
        if json.len() > MAX_DOCUMENT_BYTES {
            return Err(Error::invalid(
                "document_too_large",
                "The document is too large.",
            ));
        }
        write_atomic(&path, &crypto::seal(&key, &json, document.id.as_bytes())?)?;

        let summary = document.summary();
        let mut next = index.clone();
        next.retain(|s| s.id != summary.id);
        next.push(summary.clone());
        self.write_index(&key, &next)?;
        *guard = Some(next);
        // The history is an extra: if a version could not be saved, the
        // document was still saved.
        let _ = self.maybe_snapshot(&key, &document, &json);
        Ok(summary)
    }

    /// Marks an idea as let go (or brings it back) and/or lets it rest until a date.
    pub fn set_state(
        &self,
        id: &str,
        released: Option<bool>,
        rest_until: Option<u64>,
    ) -> Result<DocumentSummary> {
        let mut document = self.load(id)?;
        if let Some(released) = released {
            document.released = released;
        }
        if let Some(rest_until) = rest_until {
            document.rest_until = rest_until;
        }
        self.save(document)
    }

    /// Moves a document to a project (or to none) with all its roots, without
    /// changing its revision, so that a pane that has it open can keep saving.
    /// If it was a root of another document, it is detached from it.
    /// Returns the summaries that changed.
    pub fn move_document(&self, id: &str, project: Option<String>) -> Result<Vec<DocumentSummary>> {
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        if let Some(project) = &project {
            self.require_project(&key, project)?;
        }
        let subtree = descendants(self.loaded_index(&mut guard, &key), id);
        let mut changed = vec![self.update_meta(&key, &mut guard, id, |document| {
            document.project = project.clone();
            document.parent = None;
        })?];
        for child in subtree {
            changed.push(self.update_meta(&key, &mut guard, &child, |document| {
                document.project = project.clone();
            })?);
        }
        Ok(changed)
    }

    /// The roots map of a project (or of the documents without a project):
    /// each document with its root and its assumptions. Ideas let go do not appear.
    pub fn map(&self, project: Option<&str>) -> Result<Vec<MapNode>> {
        let key = self.key()?;
        let ids: Vec<String> = {
            let mut guard = self.index_guard()?;
            self.loaded_index(&mut guard, &key)
                .iter()
                .filter(|s| !s.released && s.trashed_at == 0 && s.project.as_deref() == project)
                .map(|s| s.id.clone())
                .collect()
        };
        Ok(ids
            .into_iter()
            .filter_map(|id| {
                let path = self.document_path(&id).ok()?;
                let document = self.read_document(&key, &id, &path).ok()?;
                Some(MapNode {
                    id,
                    title: document.title,
                    parent: document.parent,
                    kind: document.kind,
                    assumptions: document.assumptions,
                })
            })
            .collect())
    }

    /// Changes the label, the color (`""` removes it) or whether a note is
    /// unopened, without changing its revision.
    pub fn set_note_meta(
        &self,
        id: &str,
        label: Option<String>,
        color: Option<String>,
        unread: Option<bool>,
    ) -> Result<DocumentSummary> {
        let label = label.map(|l| clean_label(&l));
        let color = match color {
            Some(c) if c.is_empty() => Some(None),
            Some(c) if NOTE_COLORS.contains(&c.as_str()) => Some(Some(c)),
            Some(_) => {
                return Err(Error::invalid(
                    "unknown_color",
                    "That color does not exist.",
                ))
            }
            None => None,
        };
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        self.update_meta(&key, &mut guard, id, |document| {
            if let Some(label) = label {
                document.label = label;
            }
            if let Some(color) = color {
                document.color = color;
            }
            if let Some(unread) = unread {
                document.unread = unread;
            }
        })
    }

    /// Moves a document to the Trash (or restores it), with the roots that were
    /// born from it, without changing its revision. On restoring, the roots
    /// that went with it come back, not the ones already in the Trash before.
    /// Returns the summaries that changed.
    pub fn set_trashed(&self, id: &str, trashed: bool) -> Result<Vec<DocumentSummary>> {
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        let index = self.loaded_index(&mut guard, &key);
        let current = index
            .iter()
            .find(|s| s.id == id)
            .map(|s| s.trashed_at)
            .ok_or_else(|| {
                Error::new(
                    ErrorCode::NotFound,
                    "document_gone",
                    "That document no longer exists.",
                )
            })?;
        let subtree: Vec<(String, u64)> = descendants(index, id)
            .into_iter()
            .filter_map(|child| {
                index
                    .iter()
                    .find(|s| s.id == child)
                    .map(|s| (child, s.trashed_at))
            })
            .collect();
        // Moving to the Trash something already there does not change its date
        // (otherwise its roots would not come back with it).
        if trashed && current != 0 {
            return Ok(Vec::new());
        }
        let stamp = if trashed { now_millis().max(1) } else { 0 };
        let mut changed = vec![self.update_meta(&key, &mut guard, id, |d| d.trashed_at = stamp)?];
        for (child, child_stamp) in subtree {
            let follows = if trashed {
                child_stamp == 0
            } else {
                current != 0 && child_stamp == current
            };
            if follows {
                changed.push(self.update_meta(&key, &mut guard, &child, |d| d.trashed_at = stamp)?);
            }
        }
        Ok(changed)
    }

    pub fn set_kind(&self, id: &str, kind: DocKind) -> Result<DocumentSummary> {
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        self.update_meta(&key, &mut guard, id, |document| document.kind = kind)
    }

    /// Changes data that is not content (project, kind) and rewrites the
    /// document and the index with the same revision.
    fn update_meta(
        &self,
        key: &SecretKey,
        guard: &mut Option<Vec<DocumentSummary>>,
        id: &str,
        change: impl FnOnce(&mut Document),
    ) -> Result<DocumentSummary> {
        let path = self.document_path(id)?;
        let mut document = self.read_document(key, id, &path)?;
        change(&mut document);
        let json = Zeroizing::new(serde_json::to_vec(&document).map_err(|_| Error::internal())?);
        write_atomic(&path, &crypto::seal(key, &json, document.id.as_bytes())?)?;
        let summary = document.summary();
        let mut next = self.loaded_index(guard, key).clone();
        next.retain(|s| s.id != summary.id);
        next.push(summary.clone());
        self.write_index(key, &next)?;
        *guard = Some(next);
        Ok(summary)
    }

    // ---------- Projects ----------

    /// The projects, from oldest to newest.
    pub fn projects(&self) -> Result<Vec<Project>> {
        let key = self.key()?;
        let _guard = self.index_guard()?;
        self.read_projects(&key)
    }

    pub fn create_project(&self, name: &str) -> Result<Project> {
        let name = clean_project_name(name)?;
        let key = self.key()?;
        let _guard = self.index_guard()?;
        let mut projects = self.read_projects(&key)?;
        let project = Project {
            id: uuid::Uuid::new_v4().simple().to_string(),
            name,
            created_at: now_millis(),
            trashed_at: 0,
        };
        projects.push(project.clone());
        self.write_projects(&key, &projects)?;
        Ok(project)
    }

    pub fn rename_project(&self, id: &str, name: &str) -> Result<Project> {
        let name = clean_project_name(name)?;
        let key = self.key()?;
        let _guard = self.index_guard()?;
        let mut projects = self.read_projects(&key)?;
        let project = projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(project_not_found)?;
        project.name = name;
        let project = project.clone();
        self.write_projects(&key, &projects)?;
        Ok(project)
    }

    /// Moves a project to the Trash (or restores it). Its documents do not
    /// change: while the project is in the Trash, so are they.
    pub fn set_project_trashed(&self, id: &str, trashed: bool) -> Result<Project> {
        let key = self.key()?;
        let _guard = self.index_guard()?;
        let mut projects = self.read_projects(&key)?;
        let project = projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(project_not_found)?;
        project.trashed_at = if trashed { now_millis().max(1) } else { 0 };
        let project = project.clone();
        self.write_projects(&key, &projects)?;
        Ok(project)
    }

    /// Deletes forever a project that is in the Trash, with all its documents.
    /// Returns the summaries that remain.
    pub fn delete_project(&self, id: &str) -> Result<Vec<DocumentSummary>> {
        let key = self.key()?;
        let members: Vec<String> = {
            let mut guard = self.index_guard()?;
            let project = self
                .read_projects(&key)?
                .into_iter()
                .find(|p| p.id == id)
                .ok_or_else(project_not_found)?;
            if project.trashed_at == 0 {
                return Err(Error::invalid(
                    "project_not_in_trash",
                    "The project has to go to the Trash first.",
                ));
            }
            self.loaded_index(&mut guard, &key)
                .iter()
                .filter(|s| s.project.as_deref() == Some(id))
                .map(|s| s.id.clone())
                .collect()
        };
        // Documents first: if something fails halfway, the project stays in the
        // Trash with whatever is left, and it can be tried again.
        for document in members {
            self.delete(&document)?;
        }
        let mut guard = self.index_guard()?;
        let mut projects = self.read_projects(&key)?;
        projects.retain(|p| p.id != id);
        self.write_projects(&key, &projects)?;
        let mut index = self.loaded_index(&mut guard, &key).clone();
        index.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
        Ok(index)
    }

    fn require_project(&self, key: &SecretKey, id: &str) -> Result<()> {
        if !is_valid_id(id) {
            return Err(Error::invalid("invalid_project_id", "Invalid project id."));
        }
        if self.read_projects(key)?.iter().any(|p| p.id == id) {
            Ok(())
        } else {
            Err(project_not_found())
        }
    }

    fn read_projects(&self, key: &SecretKey) -> Result<Vec<Project>> {
        let bytes = match fs::read(self.dir.join(PROJECTS_FILE)) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => {
                return Err(Error::io(
                    "read_projects_failed",
                    "Could not read the projects",
                    e,
                ))
            }
        };
        let json = crypto::open(key, &bytes, AAD_PROJECTS).map_err(|()| projects_corrupted())?;
        serde_json::from_slice(&json).map_err(|_| projects_corrupted())
    }

    fn write_projects(&self, key: &SecretKey, projects: &[Project]) -> Result<()> {
        let json = Zeroizing::new(serde_json::to_vec(projects).map_err(|_| Error::internal())?);
        write_atomic(
            &self.dir.join(PROJECTS_FILE),
            &crypto::seal(key, &json, AAD_PROJECTS)?,
        )
    }

    // ---------- Search ----------

    /// The text of all documents (including ideas let go), so the interface
    /// can search in memory. None of this is written to disk.
    pub fn texts(&self) -> Result<Vec<DocumentText>> {
        let key = self.key()?;
        let ids: Vec<String> = {
            let mut guard = self.index_guard()?;
            self.loaded_index(&mut guard, &key)
                .iter()
                .map(|s| s.id.clone())
                .collect()
        };
        Ok(ids
            .into_iter()
            .filter_map(|id| {
                let path = self.document_path(&id).ok()?;
                let document = self.read_document(&key, &id, &path).ok()?;
                Some(DocumentText {
                    text: searchable_text(&document),
                    id,
                })
            })
            .collect())
    }

    // ---------- History ----------

    /// The saved versions of a document, from oldest to newest.
    pub fn history(&self, id: &str) -> Result<Vec<Snapshot>> {
        self.document_path(id)?;
        self.key()?;
        let Ok(entries) = fs::read_dir(self.history_dir(id)) else {
            return Ok(Vec::new());
        };
        let mut snapshots: Vec<Snapshot> = entries
            .filter_map(std::result::Result::ok)
            .filter_map(|entry| {
                let name = entry.path().file_stem()?.to_str()?.to_string();
                let (updated_at, revision) = parse_snapshot_name(&name)?;
                Some(Snapshot {
                    name,
                    updated_at,
                    revision,
                })
            })
            .collect();
        snapshots.sort_by_key(|s| (s.updated_at, s.revision));
        Ok(snapshots)
    }

    pub fn load_snapshot(&self, id: &str, name: &str) -> Result<Document> {
        self.document_path(id)?;
        if parse_snapshot_name(name).is_none() {
            return Err(Error::invalid("invalid_version", "Invalid version."));
        }
        let key = self.key()?;
        let path = self.history_dir(id).join(format!("{name}.{DOCUMENT_EXT}"));
        let bytes = fs::read(path).map_err(|_| {
            Error::new(
                ErrorCode::NotFound,
                "version_not_found",
                "That version was not found.",
            )
        })?;
        let json = crypto::open(&key, &bytes, snapshot_aad(id, name).as_bytes())
            .map_err(|()| version_corrupted())?;
        serde_json::from_slice(&json).map_err(|_| version_corrupted())
    }

    /// Saves a version in the history if enough time passed since the last one.
    fn maybe_snapshot(&self, key: &SecretKey, document: &Document, json: &[u8]) -> Result<()> {
        let dir = self.history_dir(&document.id);
        let latest = fs::read_dir(&dir)
            .map(|entries| {
                entries
                    .filter_map(std::result::Result::ok)
                    .filter_map(|e| parse_snapshot_name(e.path().file_stem()?.to_str()?))
                    .map(|(updated_at, _)| updated_at)
                    .max()
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        // An empty document is not a version: the history starts when there is something.
        let empty = document.html.trim().is_empty() && document.strokes.is_empty();
        if empty || document.updated_at.saturating_sub(latest) < SNAPSHOT_EVERY_MS {
            return Ok(());
        }
        fs::create_dir_all(&dir)
            .map_err(|e| Error::io("create_history_failed", "Could not create the history", e))?;
        let name = format!("{}-{}", document.updated_at, document.revision);
        let sealed = crypto::seal(key, json, snapshot_aad(&document.id, &name).as_bytes())?;
        write_atomic(&dir.join(format!("{name}.{DOCUMENT_EXT}")), &sealed)
    }

    fn history_dir(&self, id: &str) -> PathBuf {
        self.dir.join(HISTORY_DIR).join(id)
    }

    // ---------- Images ----------

    /// Saves an encrypted image in its own file and returns its id, which is the
    /// fingerprint (SHA-256) of its content: the same image is saved only once.
    pub fn put_asset(&self, mime: &str, data: &[u8]) -> Result<String> {
        if !ASSET_TYPES.contains(&mime) {
            return Err(Error::invalid(
                "image_type_not_allowed",
                "That type of image is not allowed.",
            ));
        }
        if data.is_empty() || data.len() > MAX_ASSET_BYTES {
            return Err(Error::invalid("image_too_large", "The image is too large."));
        }
        let key = self.key()?;
        let id = hex(&Sha256::digest(data));
        let dir = self.dir.join(ASSETS_DIR);
        let path = dir.join(format!("{id}.{DOCUMENT_EXT}"));
        if !path.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| Error::io("save_image_failed", "Could not save the image", e))?;
            let mut payload = Zeroizing::new(Vec::with_capacity(mime.len() + 1 + data.len()));
            payload.extend_from_slice(mime.as_bytes());
            payload.push(b'\n');
            payload.extend_from_slice(data);
            write_atomic(
                &path,
                &crypto::seal(&key, &payload, asset_aad(&id).as_bytes())?,
            )?;
        }
        Ok(id)
    }

    pub fn get_asset(&self, id: &str) -> Result<Asset> {
        if !is_valid_asset_id(id) {
            return Err(Error::invalid("invalid_image_id", "Invalid image id."));
        }
        let key = self.key()?;
        let bytes = fs::read(
            self.dir
                .join(ASSETS_DIR)
                .join(format!("{id}.{DOCUMENT_EXT}")),
        )
        .map_err(|_| {
            Error::new(
                ErrorCode::NotFound,
                "image_not_found",
                "The image was not found.",
            )
        })?;
        let payload =
            crypto::open(&key, &bytes, asset_aad(id).as_bytes()).map_err(|()| image_corrupted())?;
        let split = payload
            .iter()
            .position(|&b| b == b'\n')
            .ok_or_else(image_corrupted)?;
        let mime = String::from_utf8(payload[..split].to_vec()).map_err(|_| image_corrupted())?;
        if !ASSET_TYPES.contains(&mime.as_str()) {
            return Err(image_corrupted());
        }
        Ok(Asset {
            mime,
            data: BASE64.encode(&payload[split + 1..]),
        })
    }

    pub fn delete(&self, id: &str) -> Result<()> {
        let path = self.document_path(id)?;
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        let mut next = self.loaded_index(&mut guard, &key).clone();
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => {
                return Err(Error::io(
                    "delete_document_failed",
                    "Could not delete the document",
                    e,
                ))
            }
        }
        // Its history goes with it. Images stay: they may be in other documents.
        let _ = fs::remove_dir_all(self.history_dir(id));
        next.retain(|s| s.id != id);
        self.write_index(&key, &next)?;
        *guard = Some(next);
        // Its roots are not deleted: they become loose documents of the project.
        let children: Vec<String> = self
            .loaded_index(&mut guard, &key)
            .iter()
            .filter(|s| s.parent.as_deref() == Some(id))
            .map(|s| s.id.clone())
            .collect();
        for child in children {
            self.update_meta(&key, &mut guard, &child, |d| d.parent = None)?;
        }
        Ok(())
    }

    /// Summaries of all documents, from most recent to oldest.
    pub fn list(&self) -> Result<Vec<DocumentSummary>> {
        let key = self.key()?;
        let mut guard = self.index_guard()?;
        let mut index = self.loaded_index(&mut guard, &key).clone();
        index.sort_by_key(|s| std::cmp::Reverse(s.updated_at));
        Ok(index)
    }

    // ---------- Internal ----------

    fn key(&self) -> Result<SecretKey> {
        self.key
            .lock()
            .map_err(|_| Error::internal())?
            .clone()
            .ok_or_else(Error::locked)
    }

    fn set_key(&self, key: SecretKey) -> Result<()> {
        *self.key.lock().map_err(|_| Error::internal())? = Some(key);
        Ok(())
    }

    fn index_guard(&self) -> Result<MutexGuard<'_, Option<Vec<DocumentSummary>>>> {
        self.index.lock().map_err(|_| Error::internal())
    }

    /// The index in memory; if it was not loaded yet, it is read from disk (or rebuilt).
    fn loaded_index<'a>(
        &self,
        guard: &'a mut Option<Vec<DocumentSummary>>,
        key: &SecretKey,
    ) -> &'a Vec<DocumentSummary> {
        guard.get_or_insert_with(|| self.read_index(key))
    }

    fn wrap(&self, master: &SecretKey, secret: &[u8], aad: &[u8]) -> Result<WrappedKey> {
        let salt = crypto::random_salt();
        let kek = crypto::derive_key(secret, &salt, self.kdf)?;
        let sealed = crypto::seal(&kek, master.as_ref(), aad)?;
        Ok(WrappedKey {
            salt: BASE64.encode(salt),
            key: BASE64.encode(sealed),
        })
    }

    fn read_vault(&self) -> Result<VaultFile> {
        let bytes = fs::read(self.dir.join(VAULT_FILE)).map_err(|_| {
            Error::new(
                ErrorCode::NotFound,
                "space_has_no_password",
                "This space has no password yet.",
            )
        })?;
        let vault: VaultFile = serde_json::from_slice(&bytes)
            .map_err(|_| Error::corrupted("vault_corrupted", "The vault is damaged."))?;
        if vault.version != VAULT_VERSION {
            return Err(Error::invalid(
                "vault_from_newer_version",
                "This vault is from a newer version of OuraBox.",
            ));
        }
        Ok(vault)
    }

    fn write_vault(&self, vault: &VaultFile) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(vault).map_err(|_| Error::internal())?;
        write_atomic(&self.dir.join(VAULT_FILE), &bytes)
    }

    fn document_path(&self, id: &str) -> Result<PathBuf> {
        if !is_valid_id(id) {
            return Err(Error::invalid(
                "invalid_document_id",
                "Invalid document id.",
            ));
        }
        Ok(self.dir.join(format!("{id}.{DOCUMENT_EXT}")))
    }

    fn read_document(&self, key: &SecretKey, id: &str, path: &Path) -> Result<Document> {
        let bytes = fs::read(path).map_err(|_| {
            Error::new(
                ErrorCode::NotFound,
                "document_not_found",
                "The document was not found.",
            )
        })?;
        let json = crypto::open(key, &bytes, id.as_bytes()).map_err(|()| document_corrupted())?;
        let document: Document = serde_json::from_slice(&json).map_err(|_| document_corrupted())?;
        if document.format > DOCUMENT_FORMAT {
            return Err(Error::invalid(
                "document_from_newer_version",
                "This document is from a newer version of OuraBox.",
            ));
        }
        Ok(document)
    }

    fn read_index(&self, key: &SecretKey) -> Vec<DocumentSummary> {
        fs::read(self.dir.join(INDEX_FILE))
            .ok()
            .and_then(|bytes| crypto::open(key, &bytes, AAD_INDEX).ok())
            .and_then(|json| serde_json::from_slice(&json).ok())
            .unwrap_or_else(|| self.rebuild_index(key))
    }

    /// Rebuilds the index by decrypting each document, in case the index is missing or damaged.
    fn rebuild_index(&self, key: &SecretKey) -> Vec<DocumentSummary> {
        files_with_extension(&self.dir, DOCUMENT_EXT)
            .into_iter()
            .filter_map(|(id, path)| self.read_document(key, &id, &path).ok())
            .map(|document| document.summary())
            .collect()
    }

    fn write_index(&self, key: &SecretKey, index: &[DocumentSummary]) -> Result<()> {
        let json = Zeroizing::new(serde_json::to_vec(index).map_err(|_| Error::internal())?);
        write_atomic(
            &self.dir.join(INDEX_FILE),
            &crypto::seal(key, &json, AAD_INDEX)?,
        )
    }

    /// Encrypts the documents that the first version saved unencrypted, deletes
    /// the originals and returns the new index. Note: deleting a file does not
    /// guarantee that its data disappears from the physical disk.
    fn migrate_legacy(&self, key: &SecretKey) -> Result<Vec<DocumentSummary>> {
        for (id, path) in files_with_extension(&self.dir, LEGACY_EXT) {
            let Some(mut document) = fs::read(&path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Document>(&bytes).ok())
                .filter(|document| document.id == id)
            else {
                continue;
            };
            document.format = DOCUMENT_FORMAT;
            let json =
                Zeroizing::new(serde_json::to_vec(&document).map_err(|_| Error::internal())?);
            write_atomic(
                &self.dir.join(format!("{id}.{DOCUMENT_EXT}")),
                &crypto::seal(key, &json, id.as_bytes())?,
            )?;
            fs::remove_file(&path).map_err(|e| {
                Error::io(
                    "delete_unencrypted_failed",
                    "Could not delete an unencrypted document",
                    e,
                )
            })?;
        }
        let _ = fs::remove_file(self.dir.join(LEGACY_INDEX_FILE));
        let index = self.rebuild_index(key);
        self.write_index(key, &index)?;
        Ok(index)
    }
}

fn unwrap_key(
    wrapped: &WrappedKey,
    secret: &[u8],
    kdf: KdfParams,
    aad: &[u8],
) -> std::result::Result<SecretKey, ()> {
    let salt = BASE64.decode(&wrapped.salt).map_err(|_| ())?;
    let sealed = BASE64.decode(&wrapped.key).map_err(|_| ())?;
    let kek = crypto::derive_key(secret, &salt, kdf).map_err(|_| ())?;
    let bytes = crypto::open(&kek, &sealed, aad)?;
    let mut key = Zeroizing::new([0u8; crypto::KEY_LEN]);
    if bytes.len() != key.len() {
        return Err(());
    }
    key.copy_from_slice(&bytes);
    Ok(key)
}

fn validate_password(password: &str) -> Result<()> {
    if password.chars().count() < MIN_PASSWORD_CHARS {
        return Err(Error::invalid(
            "password_too_short",
            format!("The password needs at least {MIN_PASSWORD_CHARS} characters."),
        ));
    }
    Ok(())
}

fn snapshot_aad(id: &str, name: &str) -> String {
    format!("ourabox:snapshot:{id}:{name}")
}

fn asset_aad(id: &str) -> String {
    format!("ourabox:asset:{id}")
}

/// Versions are named `<date in milliseconds>-<revision>`.
fn parse_snapshot_name(name: &str) -> Option<(u64, u64)> {
    let (time, revision) = name.split_once('-')?;
    let valid = |part: &str| {
        !part.is_empty() && part.len() <= 20 && part.bytes().all(|b| b.is_ascii_digit())
    };
    if !valid(time) || !valid(revision) {
        return None;
    }
    Some((time.parse().ok()?, revision.parse().ok()?))
}

fn is_valid_asset_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Only ids generated by OuraBox are accepted: 32 hexadecimal characters.
/// That way an id can never point outside the data folder.
fn is_valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// The folder's `<id>.<ext>` files whose name is a valid id.
fn files_with_extension(dir: &Path, ext: &str) -> Vec<(String, PathBuf)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .filter_map(std::result::Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|e| e == ext))
        .filter_map(|path| {
            let id = path.file_stem()?.to_str()?.to_string();
            is_valid_id(&id).then_some((id, path))
        })
        .collect()
}

/// Writes to a temporary file and then renames it, so a power cut never
/// leaves a half-written document. Then it syncs the folder, so the rename
/// also reaches the disk.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    let save_error = |e| Error::io("save_failed", "Could not save", e);
    let mut file = fs::File::create(&tmp).map_err(save_error)?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(save_error)?;
    fs::rename(&tmp, path).map_err(save_error)?;
    sync_dir(path.parent());
    Ok(())
}

#[cfg(unix)]
fn sync_dir(dir: Option<&Path>) {
    if let Some(dir) = dir.and_then(|d| fs::File::open(d).ok()) {
        let _ = dir.sync_all();
    }
}

/// On Windows the rename is already recorded by the file system.
#[cfg(not(unix))]
fn sync_dir(_dir: Option<&Path>) {}

/// Everything searchable in a document: the text of the page and what was
/// written in "About this idea", separated by lines.
fn searchable_text(document: &Document) -> String {
    let mut parts = vec![plain_text(&document.html)];
    parts.extend(document.boxes.iter().map(|b| plain_text(&b.html)));
    parts.push(document.label.clone());
    parts.push(document.purpose.clone());
    parts.push(document.next_step.clone());
    parts.extend(document.assumptions.iter().map(|a| a.text.clone()));
    parts.retain(|p| !p.trim().is_empty());
    parts.join("\n")
}

/// The text of an HTML, without tags. Blocks are separated with line breaks.
fn plain_text(html: &str) -> String {
    let mut text = String::with_capacity(html.len() / 2);
    let mut rest = html;
    while let Some(start) = rest.find('<') {
        text.push_str(&decode_entities(&rest[..start]));
        let Some(end) = tag_end(&rest[start..]) else {
            rest = "";
            break;
        };
        let tag = rest[start + 1..start + end]
            .trim_start_matches('/')
            .split(|c: char| c.is_whitespace() || c == '/')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if matches!(
            tag.as_str(),
            "p" | "div"
                | "br"
                | "li"
                | "h1"
                | "h2"
                | "h3"
                | "ul"
                | "ol"
                | "blockquote"
                | "hr"
                | "table"
                | "tr"
        ) && !text.ends_with('\n')
            && !text.is_empty()
        {
            // Without the space left by the row's last cell.
            if text.ends_with(' ') && matches!(tag.as_str(), "tr" | "table") {
                text.pop();
            }
            text.push('\n');
        } else if matches!(tag.as_str(), "td" | "th")
            && !text.is_empty()
            && !text.ends_with(['\n', ' '])
        {
            // A row's cells stay separate, so search does not run words together.
            text.push(' ');
        }
        rest = &rest[start + end + 1..];
    }
    text.push_str(&decode_entities(rest));
    text.trim().to_string()
}

/// Where a tag ends, without mistaking a `>` inside a quoted attribute.
fn tag_end(tag: &str) -> Option<usize> {
    let mut quote = None;
    for (i, c) in tag.char_indices() {
        match (quote, c) {
            (None, '"' | '\'') => quote = Some(c),
            (Some(q), c) if c == q => quote = None,
            (None, '>') => return Some(i),
            _ => {}
        }
    }
    None
}

fn decode_entities(text: &str) -> String {
    if !text.contains('&') {
        return text.to_string();
    }
    text.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// All the roots born from `id`, at any depth.
fn descendants(index: &[DocumentSummary], id: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut pending = vec![id.to_string()];
    while let Some(current) = pending.pop() {
        for summary in index {
            if summary.parent.as_deref() == Some(current.as_str()) && !found.contains(&summary.id) {
                found.push(summary.id.clone());
                pending.push(summary.id.clone());
            }
        }
    }
    found
}

fn clean_label(label: &str) -> String {
    label.trim().chars().take(MAX_LABEL_CHARS).collect()
}

/// Text boxes must have reasonable numbers: nothing infinite, and no
/// impossible sizes.
fn validate_boxes(boxes: &[TextBox]) -> Result<()> {
    if boxes.len() > MAX_BOXES {
        return Err(Error::invalid(
            "too_many_text_boxes",
            "Too many text boxes on one page.",
        ));
    }
    let valid = boxes.iter().all(|b| {
        !b.id.is_empty()
            && b.id.len() <= 32
            && b.id.bytes().all(|c| c.is_ascii_alphanumeric())
            && [b.x, b.y, b.width, b.scale].iter().all(|n| n.is_finite())
            && b.x.abs() <= 1e7
            && b.y.abs() <= 1e7
            && b.width > 0.0
            && b.width <= 1e5
            && (1e-4..=100.0).contains(&b.scale)
    });
    if valid {
        Ok(())
    } else {
        Err(Error::invalid(
            "invalid_text_box",
            "A text box has invalid data.",
        ))
    }
}

fn clean_project_name(name: &str) -> Result<String> {
    let name: String = name.trim().chars().take(MAX_PROJECT_NAME_CHARS).collect();
    if name.is_empty() {
        return Err(Error::invalid(
            "project_name_required",
            "The project needs a name.",
        ));
    }
    Ok(name)
}

fn project_not_found() -> Error {
    Error::new(
        ErrorCode::NotFound,
        "project_not_found",
        "The project was not found.",
    )
}

fn projects_corrupted() -> Error {
    Error::corrupted("projects_corrupted", "The list of projects is damaged.")
}

fn document_corrupted() -> Error {
    Error::corrupted("document_corrupted", "The document is damaged.")
}

fn version_corrupted() -> Error {
    Error::corrupted("version_corrupted", "That version is damaged.")
}

fn image_corrupted() -> Error {
    Error::corrupted("image_corrupted", "The image is damaged.")
}

fn clean_title(title: &str) -> String {
    title.trim().chars().take(MAX_TITLE_CHARS).collect()
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Argon2 with few resources, only so the tests are fast.
    const FAST: KdfParams = KdfParams {
        memory_kib: 1024,
        iterations: 1,
        parallelism: 1,
    };
    pub(super) const PASSWORD: &str = "a long password";

    pub(super) fn new_store(dir: &Path) -> Store {
        Store::open_with_kdf(dir.join("documents"), FAST).unwrap()
    }

    pub(super) fn unlocked() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = new_store(dir.path());
        store.create_vault(PASSWORD).unwrap();
        (dir, store)
    }

    fn documents_dir(dir: &tempfile::TempDir) -> PathBuf {
        dir.path().join("documents")
    }

    fn code(result: Result<impl std::fmt::Debug>) -> ErrorCode {
        result.unwrap_err().code
    }

    #[test]
    fn create_save_load_roundtrip() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.title = "  My idea  ".into();
        document.html = "<p>Hello</p>".into();
        document.strokes.push(Stroke {
            color: "ink".into(),
            size: 4.0,
            points: vec![[1.0, 2.0, 0.5], [3.0, 4.0, 0.5]],
            streamline: 0.0,
            simulate_pressure: true,
            opacity: 0.4,
            erase: false,
            shape: None,
            front: true,
            effect: Some("watercolor".into()),
            fill: None,
            outline: None,
        });
        document.strokes.push(Stroke {
            color: "ink".into(),
            size: 12.0,
            points: vec![[2.0, 2.0, 0.5], [3.0, 3.0, 0.5]],
            streamline: 0.0,
            simulate_pressure: false,
            opacity: 1.0,
            erase: true,
            shape: None,
            front: false,
            effect: None,
            fill: None,
            outline: None,
        });
        document.strokes.push(Stroke {
            color: "#123456".into(),
            size: 3.0,
            points: vec![[0.0, 0.0, 0.5], [9.0, 9.0, 0.5]],
            streamline: 0.0,
            simulate_pressure: false,
            opacity: 1.0,
            erase: false,
            shape: Some("ellipse".into()),
            front: false,
            effect: None,
            // A filled shape without an outline keeps both.
            fill: Some("#abcdef".into()),
            outline: Some(false),
        });
        document.sheet = Sheet {
            width: 794,
            height: 1123,
            pages: 3,
            auto_pages: true,
        };
        let mut huge = document.clone();
        huge.sheet.width = 50_000;
        assert!(store.save(huge).is_err());
        store.save(document.clone()).unwrap();

        let loaded = store.load(&document.id).unwrap();
        assert_eq!(loaded.sheet, document.sheet);
        assert!(loaded.strokes[0].front);
        assert_eq!(loaded.title, "My idea");
        assert_eq!(loaded.html, document.html);
        assert_eq!(loaded.strokes, document.strokes);
        assert_eq!(loaded.created_at, document.created_at);
        assert_eq!(loaded.format, DOCUMENT_FORMAT);
    }

    #[test]
    fn each_save_increments_the_revision() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        assert_eq!(document.revision, 1);
        document.revision = store.save(document.clone()).unwrap().revision;
        assert_eq!(document.revision, 2);
        assert_eq!(store.load(&document.id).unwrap().revision, 2);
        assert_eq!(store.list().unwrap()[0].revision, 2);
    }

    #[test]
    fn a_stale_save_never_overwrites_a_newer_one() {
        let (_dir, store) = unlocked();
        let original = store.create(None, DocKind::File, None).unwrap();
        let mut newer = original.clone();
        newer.html = "<p>new version</p>".into();
        store.save(newer).unwrap();

        let mut stale = original;
        stale.html = "<p>old version</p>".into();
        assert_eq!(code(store.save(stale.clone())), ErrorCode::Conflict);
        assert_eq!(store.load(&stale.id).unwrap().html, "<p>new version</p>");
    }

    #[test]
    fn index_cache_survives_lock_and_unlock() {
        let (dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        store.lock();
        assert_eq!(code(store.list()), ErrorCode::Locked);
        store.unlock(PASSWORD).unwrap();
        assert_eq!(store.list().unwrap()[0].id, document.id);
        // A second process (a new app) sees the same from the disk.
        let other = new_store(dir.path());
        other.unlock(PASSWORD).unwrap();
        assert_eq!(other.list().unwrap()[0].id, document.id);
    }

    #[test]
    fn nothing_readable_is_written_to_disk() {
        let (dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.title = "secret water engine".into();
        document.html = "<p>secret water engine</p>".into();
        document.purpose = "secret water engine".into();
        store.save(document).unwrap();
        store
            .put_asset("image/png", b"secret water engine")
            .unwrap();

        // Checks every file, including those of the history and the images.
        let mut pending = vec![documents_dir(&dir)];
        let mut files = 0;
        while let Some(path) = pending.pop() {
            if path.is_dir() {
                pending.extend(fs::read_dir(&path).unwrap().map(|e| e.unwrap().path()));
                continue;
            }
            let bytes = fs::read(&path).unwrap();
            assert!(!bytes.windows(6).any(|w| w == b"secret"), "{path:?}");
            assert!(!bytes.windows(6).any(|w| w == b"engine"), "{path:?}");
            files += 1;
        }
        assert!(files >= 5, "vault, document, index, history and image");
    }

    #[test]
    fn locked_store_refuses_everything() {
        let (_dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        store.lock();
        assert_eq!(store.status(), VaultStatus::Locked);
        assert_eq!(code(store.list()), ErrorCode::Locked);
        assert_eq!(code(store.load(&document.id)), ErrorCode::Locked);
        assert_eq!(code(store.save(document.clone())), ErrorCode::Locked);
        assert_eq!(code(store.delete(&document.id)), ErrorCode::Locked);
        assert_eq!(
            code(store.create(None, DocKind::File, None)),
            ErrorCode::Locked
        );
    }

    #[test]
    fn unlock_requires_the_right_password() {
        let (dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        drop(store);

        let store = new_store(dir.path());
        assert_eq!(store.status(), VaultStatus::Locked);
        assert_eq!(
            code(store.unlock("another long password")),
            ErrorCode::WrongPassword
        );
        store.unlock(PASSWORD).unwrap();
        assert_eq!(store.status(), VaultStatus::Unlocked);
        assert_eq!(store.load(&document.id).unwrap().id, document.id);
    }

    #[test]
    fn recovery_code_sets_a_new_password() {
        let dir = tempfile::tempdir().unwrap();
        let store = new_store(dir.path());
        let code_text = store.create_vault(PASSWORD).unwrap();
        let document = store.create(None, DocKind::File, None).unwrap();
        store.lock();

        assert_eq!(
            code(store.recover(
                "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA",
                "new long password"
            )),
            ErrorCode::WrongPassword
        );
        store
            .recover(&code_text.to_lowercase(), "new long password")
            .unwrap();
        assert_eq!(store.load(&document.id).unwrap().id, document.id);

        store.lock();
        assert!(store.unlock(PASSWORD).is_err());
        store.unlock("new long password").unwrap();
    }

    #[test]
    fn change_password_requires_the_current_one() {
        let (dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        assert_eq!(
            code(store.change_password("not the current one", "new long password")),
            ErrorCode::WrongPassword
        );
        assert_eq!(
            code(store.change_password(PASSWORD, "short")),
            ErrorCode::InvalidInput
        );
        store
            .change_password(PASSWORD, "new long password")
            .unwrap();
        drop(store);

        let store = new_store(dir.path());
        assert!(store.unlock(PASSWORD).is_err());
        store.unlock("new long password").unwrap();
        assert_eq!(store.load(&document.id).unwrap().id, document.id);
    }

    #[test]
    fn recovery_code_still_works_after_changing_the_password() {
        let dir = tempfile::tempdir().unwrap();
        let store = new_store(dir.path());
        let code_text = store.create_vault(PASSWORD).unwrap();
        store
            .change_password(PASSWORD, "new long password")
            .unwrap();
        store.lock();
        store.recover(&code_text, "another long password").unwrap();
    }

    #[test]
    fn a_new_recovery_code_replaces_the_old_one() {
        let dir = tempfile::tempdir().unwrap();
        let store = new_store(dir.path());
        let old = store.create_vault(PASSWORD).unwrap();
        assert_eq!(
            code(store.new_recovery_code("other key")),
            ErrorCode::WrongPassword
        );
        let new = store.new_recovery_code(PASSWORD).unwrap();
        assert_ne!(*old, *new);
        store.lock();
        assert_eq!(
            code(store.recover(&old, "new long password")),
            ErrorCode::WrongPassword
        );
        store.recover(&new, "new long password").unwrap();
        store.lock();
        store.unlock("new long password").unwrap();
    }

    #[test]
    fn rejects_short_passwords_and_a_second_vault() {
        let dir = tempfile::tempdir().unwrap();
        let store = new_store(dir.path());
        assert_eq!(code(store.create_vault("short")), ErrorCode::InvalidInput);
        assert_eq!(store.status(), VaultStatus::New);
        store.create_vault(PASSWORD).unwrap();
        assert_eq!(
            code(store.create_vault("another long password")),
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn swapped_or_tampered_files_cannot_be_opened() {
        let (dir, store) = unlocked();
        let a = store.create(None, DocKind::File, None).unwrap();
        let b = store.create(None, DocKind::File, None).unwrap();
        let path = |id: &str| documents_dir(&dir).join(format!("{id}.obx"));
        // Copy document A in place of B: B must not open with A's content.
        fs::copy(path(&a.id), path(&b.id)).unwrap();
        assert_eq!(code(store.load(&b.id)), ErrorCode::Corrupted);
        // Alter a byte of A.
        let mut bytes = fs::read(path(&a.id)).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        fs::write(path(&a.id), bytes).unwrap();
        assert_eq!(code(store.load(&a.id)), ErrorCode::Corrupted);
    }

    #[test]
    fn migrates_documents_saved_without_encryption() {
        let dir = tempfile::tempdir().unwrap();
        let docs = documents_dir(&dir);
        fs::create_dir_all(&docs).unwrap();
        let id = "0123456789abcdef0123456789abcdef";
        let legacy = format!(
            r#"{{"id":"{id}","title":"Old idea","html":"<p>Old idea</p>","strokes":[],"createdAt":1,"updatedAt":2}}"#
        );
        fs::write(docs.join(format!("{id}.json")), legacy).unwrap();
        fs::write(docs.join("index.json"), "[]").unwrap();

        let store = new_store(dir.path());
        store.create_vault(PASSWORD).unwrap();

        assert!(!docs.join(format!("{id}.json")).exists());
        assert!(!docs.join("index.json").exists());
        let loaded = store.load(id).unwrap();
        assert_eq!(loaded.title, "Old idea");
        assert_eq!(loaded.revision, 0);
        assert_eq!(store.list().unwrap()[0].id, id);
        // Migrated documents can still be saved.
        store.save(loaded).unwrap();
    }

    #[test]
    fn reads_strokes_saved_before_the_new_fields_existed() {
        let json = r##"{"color":"#e07a5f","size":4,"points":[[1,2,0.5]]}"##;
        let stroke: Stroke = serde_json::from_str(json).unwrap();
        assert_eq!(stroke.streamline, 0.0);
        assert!(!stroke.simulate_pressure);
        assert_eq!(stroke.opacity, 1.0);
        assert!(!stroke.erase);
    }

    #[test]
    fn list_is_sorted_by_most_recent() {
        let (_dir, store) = unlocked();
        let first = store.create(None, DocKind::File, None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        let second = store.create(None, DocKind::File, None).unwrap();
        let ids: Vec<_> = store.list().unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec![second.id, first.id]);
    }

    #[test]
    fn delete_removes_document_and_summary() {
        let (_dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        store.delete(&document.id).unwrap();
        assert_eq!(code(store.load(&document.id)), ErrorCode::NotFound);
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn rejects_ids_that_could_escape_the_folder() {
        let (_dir, store) = unlocked();
        for id in [
            "../secret",
            "..",
            "",
            "ABCDEF0123456789ABCDEF0123456789",
            "a/b",
        ] {
            assert_eq!(code(store.load(id)), ErrorCode::InvalidInput, "{id}");
            assert_eq!(code(store.delete(id)), ErrorCode::InvalidInput, "{id}");
        }
    }

    #[test]
    fn rebuilds_index_when_missing() {
        let (dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        fs::remove_file(documents_dir(&dir).join(INDEX_FILE)).unwrap();
        // A new app, without the index in memory, rebuilds it from the documents.
        let other = new_store(dir.path());
        other.unlock(PASSWORD).unwrap();
        let ids: Vec<_> = other.list().unwrap().into_iter().map(|s| s.id).collect();
        assert_eq!(ids, vec![document.id]);
    }

    #[test]
    fn rejects_documents_that_are_too_large() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.html = "x".repeat(MAX_DOCUMENT_BYTES + 1);
        assert_eq!(code(store.save(document)), ErrorCode::InvalidInput);
    }

    #[test]
    fn rejects_documents_from_a_newer_version() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.format = DOCUMENT_FORMAT + 1;
        // Saving normalizes the format; a file from a future version is simulated.
        let key = store.key().unwrap();
        let json = serde_json::to_vec(&document).unwrap();
        let path = store.document_path(&document.id).unwrap();
        write_atomic(
            &path,
            &crypto::seal(&key, &json, document.id.as_bytes()).unwrap(),
        )
        .unwrap();
        assert_eq!(code(store.load(&document.id)), ErrorCode::InvalidInput);
    }

    #[test]
    fn saves_purpose_next_step_assumptions_and_root() {
        let (_dir, store) = unlocked();
        let root = store.create(None, DocKind::File, None).unwrap();
        let mut attempt = store.create(None, DocKind::File, None).unwrap();
        attempt.purpose = "Clean, cheap energy".into();
        attempt.next_step = "Talk to an engineer".into();
        attempt.assumptions = vec![Assumption {
            text: "All the energy comes from water".into(),
            state: AssumptionState::Break,
        }];
        attempt.root = Some(root.id.clone());
        store.save(attempt.clone()).unwrap();
        let loaded = store.load(&attempt.id).unwrap();
        assert_eq!(loaded.purpose, attempt.purpose);
        assert_eq!(loaded.next_step, attempt.next_step);
        assert_eq!(loaded.assumptions, attempt.assumptions);
        assert_eq!(
            store
                .list()
                .unwrap()
                .iter()
                .find(|s| s.id == attempt.id)
                .unwrap()
                .root,
            Some(root.id)
        );

        let mut bad = loaded;
        bad.root = Some("../outside".into());
        assert_eq!(code(store.save(bad)), ErrorCode::InvalidInput);
    }

    #[test]
    fn documents_without_the_new_fields_still_load() {
        let json = r#"{"id":"0123456789abcdef0123456789abcdef","title":"","html":"","strokes":[],"createdAt":1,"updatedAt":2}"#;
        let document: Document = serde_json::from_str(json).unwrap();
        assert!(document.purpose.is_empty() && document.assumptions.is_empty());
        assert_eq!(document.root, None);
        assert!(!document.released);
    }

    #[test]
    fn projects_are_created_renamed_and_encrypted() {
        let (dir, store) = unlocked();
        assert!(store.projects().unwrap().is_empty());
        let project = store.create_project("  Garden  ").unwrap();
        assert_eq!(project.name, "Garden");
        assert_eq!(code(store.create_project("   ")), ErrorCode::InvalidInput);
        let renamed = store.rename_project(&project.id, "Urban garden").unwrap();
        assert_eq!(store.projects().unwrap(), vec![renamed]);
        let bytes = fs::read(documents_dir(&dir).join(PROJECTS_FILE)).unwrap();
        assert!(!String::from_utf8_lossy(&bytes).contains("Garden"));
        store.lock();
        assert_eq!(code(store.projects()), ErrorCode::Locked);
        store.unlock(PASSWORD).unwrap();
        assert_eq!(store.projects().unwrap()[0].name, "Urban garden");
    }

    #[test]
    fn documents_live_in_projects_and_keep_their_kind() {
        let (_dir, store) = unlocked();
        let project = store.create_project("Garden").unwrap();
        let note = store
            .create(Some(project.id.clone()), DocKind::Note, None)
            .unwrap();
        assert_eq!(note.kind, DocKind::Note);
        let summary = store
            .list()
            .unwrap()
            .into_iter()
            .find(|s| s.id == note.id)
            .unwrap();
        assert_eq!(summary.project.as_deref(), Some(project.id.as_str()));
        assert_eq!(summary.kind, DocKind::Note);
        let missing = "0".repeat(32);
        assert_eq!(
            code(store.create(Some(missing), DocKind::File, None)),
            ErrorCode::NotFound
        );
        assert_eq!(
            code(store.create(Some("../x".into()), DocKind::File, None)),
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn moving_or_converting_keeps_the_revision_and_open_panes_cannot_undo_it() {
        let (_dir, store) = unlocked();
        let project = store.create_project("Garden").unwrap();
        let mut open = store.create(None, DocKind::Note, None).unwrap();
        let moved = store
            .move_document(&open.id, Some(project.id.clone()))
            .unwrap();
        assert_eq!(moved[0].revision, open.revision);
        let converted = store.set_kind(&open.id, DocKind::File).unwrap();
        assert_eq!(converted.revision, open.revision);
        // A pane with the earlier version saves without a conflict and without undoing anything.
        open.html = "<p>still here</p>".into();
        let saved = store.save(open.clone()).unwrap();
        assert_eq!(saved.project.as_deref(), Some(project.id.as_str()));
        assert_eq!(saved.kind, DocKind::File);
        let loaded = store.load(&open.id).unwrap();
        assert_eq!(loaded.html, "<p>still here</p>");
        assert_eq!(loaded.project.as_deref(), Some(project.id.as_str()));
        assert_eq!(
            code(store.move_document(&open.id, Some("f".repeat(32)))),
            ErrorCode::NotFound
        );
    }

    #[test]
    fn roots_grow_inside_the_project_as_deep_as_wanted() {
        let (_dir, store) = unlocked();
        let project = store.create_project("Research").unwrap();
        let top = store
            .create(Some(project.id.clone()), DocKind::File, None)
            .unwrap();
        // A root inherits the project and is always a file, even if something else is asked for.
        let mut child = store
            .create(None, DocKind::Note, Some(top.id.clone()))
            .unwrap();
        assert_eq!(child.project.as_deref(), Some(project.id.as_str()));
        assert_eq!(child.kind, DocKind::File);
        assert_eq!(child.parent.as_deref(), Some(top.id.as_str()));
        let grandchild = store
            .create(None, DocKind::File, Some(child.id.clone()))
            .unwrap();
        // A pane with old data cannot change the root when saving.
        child.parent = None;
        child.assumptions = vec![Assumption {
            text: "The law forbids it".into(),
            state: AssumptionState::Unknown,
        }];
        let saved = store.save(child.clone()).unwrap();
        assert_eq!(saved.parent.as_deref(), Some(top.id.as_str()));

        let map = store.map(Some(&project.id)).unwrap();
        assert_eq!(map.len(), 3);
        let node = map.iter().find(|n| n.id == child.id).unwrap();
        assert_eq!(node.parent.as_deref(), Some(top.id.as_str()));
        assert_eq!(node.assumptions[0].text, "The law forbids it");
        assert!(store.map(None).unwrap().is_empty());

        assert_eq!(
            code(store.create(None, DocKind::File, Some("f".repeat(32)))),
            ErrorCode::NotFound
        );
        assert_eq!(
            code(store.create(None, DocKind::File, Some("../x".into()))),
            ErrorCode::InvalidInput
        );
        let _ = grandchild;
    }

    #[test]
    fn moving_a_root_takes_its_whole_branch() {
        let (_dir, store) = unlocked();
        let first = store.create_project("One").unwrap();
        let second = store.create_project("Two").unwrap();
        let top = store
            .create(Some(first.id.clone()), DocKind::File, None)
            .unwrap();
        let child = store
            .create(None, DocKind::File, Some(top.id.clone()))
            .unwrap();
        let grandchild = store
            .create(None, DocKind::File, Some(child.id.clone()))
            .unwrap();
        let changed = store
            .move_document(&child.id, Some(second.id.clone()))
            .unwrap();
        assert_eq!(changed.len(), 2);
        let list = store.list().unwrap();
        let find = |id: &str| list.iter().find(|s| s.id == id).unwrap().clone();
        // The whole branch goes; the moved root is detached from its origin.
        assert_eq!(find(&child.id).parent, None);
        assert_eq!(find(&child.id).project.as_deref(), Some(second.id.as_str()));
        assert_eq!(
            find(&grandchild.id).parent.as_deref(),
            Some(child.id.as_str())
        );
        assert_eq!(
            find(&grandchild.id).project.as_deref(),
            Some(second.id.as_str())
        );
        assert_eq!(find(&top.id).project.as_deref(), Some(first.id.as_str()));
    }

    #[test]
    fn deleting_a_root_keeps_its_children() {
        let (_dir, store) = unlocked();
        let top = store.create(None, DocKind::File, None).unwrap();
        let child = store
            .create(None, DocKind::File, Some(top.id.clone()))
            .unwrap();
        store.delete(&top.id).unwrap();
        let list = store.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, child.id);
        assert_eq!(list[0].parent, None);
        assert_eq!(store.load(&child.id).unwrap().parent, None);
    }

    #[test]
    fn projects_go_to_the_trash_before_being_deleted_with_their_documents() {
        let (_dir, store) = unlocked();
        let project = store.create_project("Garden").unwrap();
        let other = store.create_project("Workshop").unwrap();
        let inside = store
            .create(Some(project.id.clone()), DocKind::File, None)
            .unwrap();
        let elsewhere = store
            .create(Some(other.id.clone()), DocKind::Note, None)
            .unwrap();
        // Nothing is deleted in one step: first, the Trash.
        assert_eq!(
            code(store.delete_project(&project.id)),
            ErrorCode::InvalidInput
        );
        let trashed = store.set_project_trashed(&project.id, true).unwrap();
        assert!(trashed.trashed_at > 0);
        let restored = store.set_project_trashed(&project.id, false).unwrap();
        assert_eq!(restored.trashed_at, 0);
        store.set_project_trashed(&project.id, true).unwrap();
        let index = store.delete_project(&project.id).unwrap();
        assert_eq!(index.len(), 1);
        assert_eq!(index[0].id, elsewhere.id);
        assert_eq!(code(store.load(&inside.id)), ErrorCode::NotFound);
        assert_eq!(store.projects().unwrap().len(), 1);
        assert_eq!(store.projects().unwrap()[0].id, other.id);
        assert_eq!(code(store.delete_project(&project.id)), ErrorCode::NotFound);
    }

    #[test]
    fn documents_go_to_the_trash_with_their_roots() {
        let (_dir, store) = unlocked();
        let top = store.create(None, DocKind::File, None).unwrap();
        let child = store
            .create(None, DocKind::File, Some(top.id.clone()))
            .unwrap();
        let grandchild = store
            .create(None, DocKind::File, Some(child.id.clone()))
            .unwrap();
        // A root that was already in the Trash does not come back with its parent.
        store.set_trashed(&grandchild.id, true).unwrap();
        let earlier = store
            .list()
            .unwrap()
            .iter()
            .find(|s| s.id == grandchild.id)
            .unwrap()
            .trashed_at;
        std::thread::sleep(std::time::Duration::from_millis(5));
        let changed = store.set_trashed(&top.id, true).unwrap();
        assert_eq!(changed.len(), 2);
        let stamp = |id: &str| {
            store
                .list()
                .unwrap()
                .iter()
                .find(|s| s.id == id)
                .unwrap()
                .trashed_at
        };
        assert!(stamp(&top.id) > 0);
        assert_eq!(stamp(&child.id), stamp(&top.id));
        assert_eq!(stamp(&grandchild.id), earlier);
        // Saving does not take it out of the Trash.
        let mut loaded = store.load(&top.id).unwrap();
        loaded.html = "<p>hello</p>".into();
        store.save(loaded).unwrap();
        assert!(stamp(&top.id) > 0);
        store.set_trashed(&top.id, false).unwrap();
        assert_eq!(stamp(&top.id), 0);
        assert_eq!(stamp(&child.id), 0);
        assert_eq!(stamp(&grandchild.id), earlier);
        assert_eq!(
            code(store.set_trashed("0123456789abcdef0123456789abcdef", true)),
            ErrorCode::NotFound
        );
    }
    #[test]
    fn a_deleted_document_is_not_brought_back_by_an_open_pane() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.html = "<p>hello</p>".into();
        let saved = store.save(document.clone()).unwrap();
        document.revision = saved.revision;
        store.set_trashed(&document.id, true).unwrap();
        // Moving it to the Trash again does not change its date.
        assert!(store.set_trashed(&document.id, true).unwrap().is_empty());
        store.delete(&document.id).unwrap();
        assert_eq!(code(store.save(document.clone())), ErrorCode::NotFound);
        assert!(store.list().unwrap().iter().all(|s| s.id != document.id));
    }

    #[test]
    fn tables_and_lines_become_separate_words() {
        let html = "<p>Expenses</p><table><tbody><tr><th>Month</th><th>Total</th></tr><tr><td>January</td><td data-formula=\"=SUMA(B1:B2)\">20</td></tr></tbody></table><hr><p>End</p>";
        assert_eq!(plain_text(html), "Expenses\nMonth Total\nJanuary 20\nEnd");
    }

    #[test]
    fn texts_are_plain_and_include_the_idea() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.html =
            "<h1>Centipedes</h1><p>One &amp; two<br>three</p><img src=\"data:x\" alt=\"<no>\">"
                .into();
        document.purpose = "Understand bugs".into();
        document.assumptions = vec![Assumption {
            text: "They have a hundred legs".into(),
            state: AssumptionState::Break,
        }];
        store.save(document.clone()).unwrap();
        let texts = store.texts().unwrap();
        assert_eq!(texts.len(), 1);
        assert_eq!(
            texts[0].text,
            "Centipedes\nOne & two\nthree\nUnderstand bugs\nThey have a hundred legs"
        );
        store.lock();
        assert_eq!(code(store.texts()), ErrorCode::Locked);
    }

    #[test]
    fn text_boxes_are_saved_validated_and_searchable() {
        let (_dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        document.boxes = vec![TextBox {
            id: "a1".into(),
            x: 120.5,
            y: 3000.25,
            width: 3.2,
            scale: 0.01,
            html: "<p>A tiny detail</p>".into(),
        }];
        store.save(document.clone()).unwrap();
        let loaded = store.load(&document.id).unwrap();
        assert_eq!(loaded.boxes, document.boxes);
        assert!(store.texts().unwrap()[0].text.contains("A tiny detail"));

        let mut bad = loaded.clone();
        bad.boxes[0].scale = f64::INFINITY;
        assert_eq!(code(store.save(bad)), ErrorCode::InvalidInput);
        let mut bad = loaded.clone();
        bad.boxes[0].id = "../x".into();
        assert_eq!(code(store.save(bad)), ErrorCode::InvalidInput);
    }

    #[test]
    fn note_label_color_and_unread_do_not_change_the_revision() {
        let (_dir, store) = unlocked();
        let mut note = store.create(None, DocKind::Note, None).unwrap();
        let summary = store
            .set_note_meta(
                &note.id,
                Some("  vegan recipes and café ideas, really long  ".into()),
                Some("coral".into()),
                Some(true),
            )
            .unwrap();
        assert_eq!(summary.revision, note.revision);
        assert_eq!(summary.label, "vegan recipes and café i");
        assert_eq!(summary.color.as_deref(), Some("coral"));
        assert!(summary.unread);
        // A pane with old data does not undo it when saving.
        note.html = "<p>hello</p>".into();
        let saved = store.save(note.clone()).unwrap();
        assert!(saved.unread);
        assert_eq!(saved.color.as_deref(), Some("coral"));
        let summary = store
            .set_note_meta(&note.id, None, Some(String::new()), Some(false))
            .unwrap();
        assert_eq!(summary.color, None);
        assert!(!summary.unread);
        assert_eq!(summary.label, "vegan recipes and café i");
        assert_eq!(
            code(store.set_note_meta(&note.id, None, Some("red".into()), None)),
            ErrorCode::InvalidInput
        );
    }

    #[test]
    fn release_and_rest_change_the_summary() {
        let (_dir, store) = unlocked();
        let document = store.create(None, DocKind::File, None).unwrap();
        let summary = store
            .set_state(&document.id, Some(true), Some(1234))
            .unwrap();
        assert!(summary.released);
        assert_eq!(summary.rest_until, 1234);
        assert_eq!(summary.revision, document.revision + 1);
        let summary = store.set_state(&document.id, Some(false), None).unwrap();
        assert!(!summary.released);
        assert_eq!(summary.rest_until, 1234);
    }

    #[test]
    fn history_keeps_spaced_versions() {
        let (dir, store) = unlocked();
        let mut document = store.create(None, DocKind::File, None).unwrap();
        // An empty document has no history yet.
        assert!(store.history(&document.id).unwrap().is_empty());
        // The first time it has something, a version is saved.
        document.html = "<p>one</p>".into();
        document.revision = store.save(document.clone()).unwrap().revision;
        assert_eq!(store.history(&document.id).unwrap().len(), 1);
        // Saves in a row do not fill the history.
        document.html = "<p>two</p>".into();
        document.revision = store.save(document.clone()).unwrap().revision;
        assert_eq!(store.history(&document.id).unwrap().len(), 1);

        let first = &store.history(&document.id).unwrap()[0];
        assert_eq!(
            store.load_snapshot(&document.id, &first.name).unwrap().html,
            "<p>one</p>"
        );
        assert_eq!(
            code(store.load_snapshot(&document.id, "../vault")),
            ErrorCode::InvalidInput
        );

        // Nothing readable in the history.
        for entry in fs::read_dir(documents_dir(&dir).join(HISTORY_DIR).join(&document.id)).unwrap()
        {
            let bytes = fs::read(entry.unwrap().path()).unwrap();
            assert!(!bytes.windows(4).any(|w| w == b"html"));
        }

        store.delete(&document.id).unwrap();
        assert!(!documents_dir(&dir)
            .join(HISTORY_DIR)
            .join(&document.id)
            .exists());
    }

    #[test]
    fn assets_are_encrypted_deduplicated_and_validated() {
        let (dir, store) = unlocked();
        let png = b"\x89PNG sample image";
        let id = store.put_asset("image/png", png).unwrap();
        assert_eq!(store.put_asset("image/png", png).unwrap(), id);
        assert_eq!(
            fs::read_dir(documents_dir(&dir).join(ASSETS_DIR))
                .unwrap()
                .count(),
            1
        );

        let asset = store.get_asset(&id).unwrap();
        assert_eq!(asset.mime, "image/png");
        assert_eq!(BASE64.decode(asset.data).unwrap(), png);

        let path = documents_dir(&dir)
            .join(ASSETS_DIR)
            .join(format!("{id}.obx"));
        let mut bytes = fs::read(&path).unwrap();
        assert!(!bytes.windows(6).any(|w| w == b"sample"));
        let last = bytes.len() - 1;
        bytes[last] ^= 1;
        fs::write(&path, bytes).unwrap();
        assert_eq!(code(store.get_asset(&id)), ErrorCode::Corrupted);

        assert_eq!(
            code(store.put_asset("text/html", b"<script>")),
            ErrorCode::InvalidInput
        );
        assert_eq!(code(store.get_asset("../vault")), ErrorCode::InvalidInput);
        store.lock();
        assert_eq!(code(store.put_asset("image/png", png)), ErrorCode::Locked);
    }
}
