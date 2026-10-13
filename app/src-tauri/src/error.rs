//! Errors with a code, so the interface can react to each case (for example,
//! go back to the password screen if the space was locked), and with a stable
//! key, so it can show a clear message in the person's language without
//! depending on the text.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// The space is locked: the password has to be typed.
    Locked,
    WrongPassword,
    InvalidInput,
    NotFound,
    /// A file could not be decrypted or read: it was altered or damaged.
    Corrupted,
    /// Someone tried to save over a newer version of the document.
    Conflict,
    Io,
    Internal,
}

/// Reaches the interface as `{ code, key, message }`. `key` names the message
/// (`errors.<key>` in the interface's languages); `message` is the same text
/// in English, for logs and as a fallback.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Error {
    pub code: ErrorCode,
    pub key: &'static str,
    pub message: String,
}

pub type Result<T> = std::result::Result<T, Error>;

impl Error {
    pub fn new(code: ErrorCode, key: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            key,
            message: message.into(),
        }
    }

    pub fn locked() -> Self {
        Self::new(ErrorCode::Locked, "locked", "The space is locked.")
    }

    pub fn wrong_password() -> Self {
        Self::new(
            ErrorCode::WrongPassword,
            "wrong_password",
            "Wrong password.",
        )
    }

    pub fn invalid(key: &'static str, message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidInput, key, message)
    }

    pub fn corrupted(key: &'static str, message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Corrupted, key, message)
    }

    /// `key` names `context`; the system's error is added to the message only.
    pub fn io(key: &'static str, context: &str, error: std::io::Error) -> Self {
        Self::new(ErrorCode::Io, key, format!("{context}: {error}"))
    }

    pub fn internal() -> Self {
        Self::new(ErrorCode::Internal, "internal", "Internal error.")
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Error {}

/// Errors from `crypto.rs` are internal: they should never happen with valid data.
impl From<String> for Error {
    fn from(message: String) -> Self {
        Self::new(ErrorCode::Internal, "internal", message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_reach_the_interface_with_code_key_and_message() {
        let json = serde_json::to_value(Error::wrong_password()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "code": "wrong_password",
                "key": "wrong_password",
                "message": "Wrong password."
            })
        );
    }
}
