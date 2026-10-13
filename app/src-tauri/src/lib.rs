mod crypto;
mod documents;
mod error;
mod users;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use documents::{
    Asset, DocKind, Document, DocumentSummary, DocumentText, MapNode, Project, Snapshot,
};
use error::{Error, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use users::{SpaceStatus, Users};
use zeroize::Zeroizing;

const COPY_EXTENSION: &str = "ourabox";

/// The copy chosen to open. The path never travels to the interface: only its name.
#[derive(Default)]
struct ChosenCopy(Mutex<Option<PathBuf>>);

// Every command that touches the disk or the encryption runs with `async`: that
// way it runs off the window's thread and saving never stalls typing.
//
// Passwords and keys that arrive from the interface are wrapped in
// `Zeroizing` so they are wiped from memory as soon as they are used.
//
// Errors reach the interface as `{ code, key, message }` (see `error.rs`).

#[tauri::command]
fn vault_status(users: State<'_, Users>) -> SpaceStatus {
    users.status()
}

/// A new user. Returns the recovery key: it is shown only once.
#[tauri::command(async)]
fn create_vault(users: State<'_, Users>, user: String, password: String) -> Result<String> {
    let password = Zeroizing::new(password);
    users.create(&user, &password).map(|code| code.to_string())
}

#[tauri::command(async)]
fn unlock(users: State<'_, Users>, user: String, password: String) -> Result<()> {
    let password = Zeroizing::new(password);
    users.unlock(&user, &password)
}

/// The space from before users existed gets a name (with its usual password).
#[tauri::command(async)]
fn claim_space(users: State<'_, Users>, user: String, password: String) -> Result<()> {
    let password = Zeroizing::new(password);
    users.claim_legacy(&user, &password)
}

#[tauri::command]
fn lock(users: State<'_, Users>) {
    users.lock();
}

#[tauri::command(async)]
fn recover(users: State<'_, Users>, user: String, code: String, password: String) -> Result<()> {
    let (code, password) = (Zeroizing::new(code), Zeroizing::new(password));
    users.recover(&user, &code, &password)
}

#[tauri::command(async)]
fn change_password(users: State<'_, Users>, current: String, password: String) -> Result<()> {
    let store = users.store()?;
    let (current, password) = (Zeroizing::new(current), Zeroizing::new(password));
    store.change_password(&current, &password)
}

/// A new recovery key: it is shown only once.
#[tauri::command(async)]
fn new_recovery_code(users: State<'_, Users>, password: String) -> Result<String> {
    let store = users.store()?;
    let password = Zeroizing::new(password);
    Ok(store.new_recovery_code(&password)?.to_string())
}

/// Deletes the user who entered, with their whole space. Asks for their password.
#[tauri::command(async)]
fn delete_user(users: State<'_, Users>, password: String) -> Result<()> {
    let password = Zeroizing::new(password);
    users.delete_active(&password)
}

/// Text for a system dialog, in the person's language. The interface sends
/// it; without it (or if it looks wrong) the dialog is in English.
#[derive(serde::Deserialize, Default)]
struct DialogText {
    title: String,
    filter: String,
}

/// A label sent by the interface, if it is short plain text.
fn label(text: Option<&str>, fallback: &str) -> String {
    match text.map(str::trim) {
        Some(t)
            if !t.is_empty() && t.chars().count() <= 120 && !t.chars().any(char::is_control) =>
        {
            t.to_string()
        }
        _ => fallback.to_string(),
    }
}

/// Optional: opens the person's email program with a message to themselves
/// that contains their recovery key. OuraBox sends nothing.
#[tauri::command]
fn open_recovery_mail(
    app: AppHandle,
    to: String,
    code: String,
    subject: Option<String>,
    body: Option<String>,
) -> Result<()> {
    let to = to.trim();
    let valid = to.len() <= 254
        && to.split_once('@').is_some_and(|(user, host)| {
            !user.is_empty() && host.contains('.') && !host.starts_with('.') && !host.ends_with('.')
        })
        && !to.chars().any(|c| {
            c.is_whitespace() || matches!(c, '<' | '>' | '"' | ',' | ';' | '?' | '&' | '%')
        });
    if !valid {
        return Err(Error::invalid(
            "invalid_email",
            "That email doesn't look valid.",
        ));
    }
    if code.len() > 64 || !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(Error::invalid(
            "invalid_recovery_code",
            "That recovery key is not valid.",
        ));
    }
    let subject = label(subject.as_deref(), "My OuraBox recovery key");
    // The body comes from the interface in the person's language, with a
    // `{code}` mark where the key goes. Without the mark it is not used.
    let body = match body {
        Some(text) if text.contains("{code}") && text.chars().count() <= 2000 => text,
        _ => "My OuraBox recovery key:\n\n{code}\n\nWith it I can get into my space if I forget the password, and open my encrypted backups. Anyone who has it and has my computer or a backup can read my ideas: this email has to stay well protected.".to_string(),
    }
    .replace("{code}", &code);
    let url = format!(
        "mailto:{}?subject={}&body={}",
        percent_encode(to),
        percent_encode(&subject),
        percent_encode(&body)
    );
    app.opener().open_url(url, None::<&str>).map_err(|_| {
        Error::invalid(
            "no_mail_app",
            "No email program was found on this computer.",
        )
    })
}

/// Encodes a text to use it inside a `mailto:` link.
fn percent_encode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'@' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[tauri::command(async)]
fn list_documents(users: State<'_, Users>) -> Result<Vec<DocumentSummary>> {
    let store = users.store()?;
    store.list()
}

#[tauri::command(async)]
fn create_document(
    users: State<'_, Users>,
    project: Option<String>,
    kind: Option<DocKind>,
    parent: Option<String>,
) -> Result<Document> {
    let store = users.store()?;
    store.create(project, kind.unwrap_or_default(), parent)
}

#[tauri::command(async)]
fn set_note_meta(
    users: State<'_, Users>,
    id: String,
    label: Option<String>,
    color: Option<String>,
    unread: Option<bool>,
) -> Result<DocumentSummary> {
    let store = users.store()?;
    store.set_note_meta(&id, label, color, unread)
}

#[tauri::command(async)]
fn project_map(users: State<'_, Users>, project: Option<String>) -> Result<Vec<MapNode>> {
    let store = users.store()?;
    store.map(project.as_deref())
}

#[tauri::command(async)]
fn move_document(
    users: State<'_, Users>,
    id: String,
    project: Option<String>,
) -> Result<Vec<DocumentSummary>> {
    let store = users.store()?;
    store.move_document(&id, project)
}

#[tauri::command(async)]
fn set_document_kind(
    users: State<'_, Users>,
    id: String,
    kind: DocKind,
) -> Result<DocumentSummary> {
    let store = users.store()?;
    store.set_kind(&id, kind)
}

/// Asks where to save the encrypted backup and writes it. Returns the file's
/// name, or nothing if the person cancelled.
#[tauri::command(async)]
fn export_copy(
    app: AppHandle,
    users: State<'_, Users>,
    name: String,
    text: Option<DialogText>,
) -> Result<Option<String>> {
    let text = text.unwrap_or_default();
    let store = users.store()?;
    let name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(60)
        .collect();
    let Some(chosen) = app
        .dialog()
        .file()
        .set_title(label(Some(&text.title), "Save an encrypted backup"))
        .set_file_name(format!("{}.{COPY_EXTENSION}", name.trim()))
        .add_filter(
            label(Some(&text.filter), "OuraBox backup"),
            &[COPY_EXTENSION],
        )
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut path = chosen
        .into_path()
        .map_err(|_| Error::invalid("cannot_save_there", "It can't be saved there."))?;
    path = with_extension(path, COPY_EXTENSION)?;
    store.export_copy(&path)?;
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// What can be exported without encryption, at the person's request: its
/// extension and the name of the dialog's filter.
fn export_kind(kind: &str) -> Option<(&'static str, &'static str)> {
    match kind {
        "png" => Some(("png", "PNG image")),
        "md" => Some(("md", "Text (Markdown)")),
        "txt" => Some(("txt", "Text")),
        "html" => Some(("html", "Web page")),
        _ => None,
    }
}

const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;

/// Asks where to save an export (an image, the text) and writes it.
/// Exporting takes the content out of the encrypted space: it only happens
/// when the person asks for it and chooses where. Returns the file's name, or
/// nothing if it was cancelled.
#[tauri::command(async)]
fn save_export(
    app: AppHandle,
    name: String,
    kind: String,
    data: String,
    text: Option<DialogText>,
) -> Result<Option<String>> {
    let text = text.unwrap_or_default();
    let (extension, filter) =
        export_kind(&kind).ok_or_else(|| Error::invalid("unknown_format", "Unknown format."))?;
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|_| Error::invalid("export_damaged", "The export is damaged."))?;
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(Error::invalid(
            "export_too_large",
            "The export is too large.",
        ));
    }
    let name: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_'))
        .take(60)
        .collect();
    let name = if name.trim().is_empty() {
        "OuraBox".to_string()
    } else {
        name.trim().to_string()
    };
    let Some(chosen) = app
        .dialog()
        .file()
        .set_title(label(Some(&text.title), "Export"))
        .set_file_name(format!("{name}.{extension}"))
        .add_filter(label(Some(&text.filter), filter), &[extension])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut path = chosen
        .into_path()
        .map_err(|_| Error::invalid("cannot_save_there", "It can't be saved there."))?;
    path = with_extension(path, extension)?;
    std::fs::write(&path, bytes)
        .map_err(|_| Error::invalid("save_file_failed", "The file could not be saved."))?;
    Ok(path.file_name().map(|n| n.to_string_lossy().into_owned()))
}

/// Adds the extension if it is missing (ignoring case: "photo.PNG" already has
/// it). The dialog only asked whether to replace the name that was typed: if
/// another file already exists with the extension added, it is not overwritten.
fn with_extension(path: PathBuf, extension: &str) -> Result<PathBuf> {
    if path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(extension))
    {
        return Ok(path);
    }
    let mut name = path.into_os_string();
    name.push(format!(".{extension}"));
    let path = PathBuf::from(name);
    if path.exists() {
        return Err(Error::invalid(
            "file_exists",
            "There is already a file with that name. Choose another one.",
        ));
    }
    Ok(path)
}

/// Asks to choose a backup to open. Returns its name, or nothing if it was cancelled.
#[tauri::command(async)]
fn choose_copy(
    app: AppHandle,
    chosen: State<'_, ChosenCopy>,
    text: Option<DialogText>,
) -> Result<Option<String>> {
    let text = text.unwrap_or_default();
    let Some(file) = app
        .dialog()
        .file()
        .set_title(label(Some(&text.title), "Open an OuraBox backup"))
        .add_filter(
            label(Some(&text.filter), "OuraBox backup"),
            &[COPY_EXTENSION],
        )
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|_| Error::invalid("cannot_open_file", "That file can't be opened."))?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned());
    *chosen.0.lock().map_err(|_| Error::internal())? = Some(path);
    Ok(name)
}

/// Opens the chosen backup in this new space. With `password`, `secret` is the
/// recovery key and the backup gets that new password.
#[tauri::command(async)]
fn restore_copy(
    users: State<'_, Users>,
    chosen: State<'_, ChosenCopy>,
    user: String,
    secret: String,
    password: Option<String>,
) -> Result<()> {
    let secret = Zeroizing::new(secret);
    let password = password.map(Zeroizing::new);
    let path = chosen
        .0
        .lock()
        .map_err(|_| Error::internal())?
        .clone()
        .ok_or_else(|| Error::invalid("choose_copy_first", "Choose the backup first."))?;
    users.create_from_copy(
        &user,
        &path,
        &secret,
        password.as_deref().map(String::as_str),
    )
}

#[tauri::command(async)]
fn search_texts(users: State<'_, Users>) -> Result<Vec<DocumentText>> {
    let store = users.store()?;
    store.texts()
}

#[tauri::command(async)]
fn list_projects(users: State<'_, Users>) -> Result<Vec<Project>> {
    let store = users.store()?;
    store.projects()
}

#[tauri::command(async)]
fn create_project(users: State<'_, Users>, name: String) -> Result<Project> {
    let store = users.store()?;
    store.create_project(&name)
}

#[tauri::command(async)]
fn rename_project(users: State<'_, Users>, id: String, name: String) -> Result<Project> {
    let store = users.store()?;
    store.rename_project(&id, &name)
}

/// Moves a document to the Trash or restores it, with its roots.
#[tauri::command(async)]
fn trash_document(
    users: State<'_, Users>,
    id: String,
    trashed: bool,
) -> Result<Vec<DocumentSummary>> {
    let store = users.store()?;
    store.set_trashed(&id, trashed)
}

/// Moves a project to the Trash or restores it.
#[tauri::command(async)]
fn trash_project(users: State<'_, Users>, id: String, trashed: bool) -> Result<Project> {
    let store = users.store()?;
    store.set_project_trashed(&id, trashed)
}

#[tauri::command(async)]
fn delete_project(users: State<'_, Users>, id: String) -> Result<Vec<DocumentSummary>> {
    let store = users.store()?;
    store.delete_project(&id)
}

#[tauri::command(async)]
fn load_document(users: State<'_, Users>, id: String) -> Result<Document> {
    let store = users.store()?;
    store.load(&id)
}

#[tauri::command(async)]
fn save_document(users: State<'_, Users>, document: Document) -> Result<DocumentSummary> {
    let store = users.store()?;
    store.save(document)
}

#[tauri::command(async)]
fn delete_document(users: State<'_, Users>, id: String) -> Result<()> {
    let store = users.store()?;
    store.delete(&id)
}

/// Let go of an idea or bring it back, or let it rest until a date.
#[tauri::command(async)]
fn set_document_state(
    users: State<'_, Users>,
    id: String,
    released: Option<bool>,
    rest_until: Option<u64>,
) -> Result<DocumentSummary> {
    let store = users.store()?;
    store.set_state(&id, released, rest_until)
}

#[tauri::command(async)]
fn document_history(users: State<'_, Users>, id: String) -> Result<Vec<Snapshot>> {
    let store = users.store()?;
    store.history(&id)
}

#[tauri::command(async)]
fn load_snapshot(users: State<'_, Users>, id: String, name: String) -> Result<Document> {
    let store = users.store()?;
    store.load_snapshot(&id, &name)
}

/// Receives the image in base64 and returns its id.
#[tauri::command(async)]
fn put_asset(users: State<'_, Users>, mime: String, data: String) -> Result<String> {
    let store = users.store()?;
    let bytes = BASE64
        .decode(data.as_bytes())
        .map_err(|_| Error::invalid("invalid_image", "The image is not valid."))?;
    store.put_asset(&mime, &bytes)
}

#[tauri::command(async)]
fn get_asset(users: State<'_, Users>, id: String) -> Result<Asset> {
    let store = users.store()?;
    store.get_asset(&id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Each user has their own space; the one from before users existed
            // stays in "documents" until it is given a name (see users.rs).
            app.manage(Users::open(app.path().app_data_dir()?)?);
            app.manage(ChosenCopy::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            create_vault,
            unlock,
            claim_space,
            lock,
            recover,
            change_password,
            new_recovery_code,
            delete_user,
            open_recovery_mail,
            list_documents,
            create_document,
            load_document,
            save_document,
            delete_document,
            set_document_state,
            move_document,
            project_map,
            set_note_meta,
            set_document_kind,
            search_texts,
            export_copy,
            save_export,
            choose_copy,
            restore_copy,
            list_projects,
            create_project,
            rename_project,
            delete_project,
            trash_document,
            trash_project,
            document_history,
            load_snapshot,
            put_asset,
            get_asset
        ])
        .run(tauri::generate_context!())
        .expect("error while starting OuraBox");
}

#[cfg(test)]
mod tests {
    use super::percent_encode;

    #[test]
    fn mail_links_cannot_be_broken_by_their_text() {
        assert_eq!(percent_encode("ana@mail.com"), "ana@mail.com");
        assert_eq!(percent_encode("a b&c=d\nñ"), "a%20b%26c%3Dd%0A%C3%B1");
    }
}
