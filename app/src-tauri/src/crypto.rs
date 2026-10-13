//! Encryption of the safe space.
//!
//! - The password is never stored. Argon2id turns it into a key; it is slow
//!   and uses a lot of memory on purpose, so that trying passwords is costly.
//! - Documents are encrypted with a random master key using
//!   XChaCha20-Poly1305, which also detects any tampering.
//! - The master key is stored "wrapped" (encrypted) twice: with the key from
//!   the password and with the one from the recovery key.
//! - Each encrypted file carries its own name as associated data: if someone
//!   swaps or modifies files, they cannot be opened.
//!
//! Only libraries from the RustCrypto project are used; there is no homemade
//! cryptography.

use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::rand_core::RngCore;
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub const KEY_LEN: usize = 32;
pub type SecretKey = Zeroizing<[u8; KEY_LEN]>;

/// Identifies the format of encrypted files, in case it changes in the future.
const MAGIC: &[u8; 4] = b"OBX1";
const NONCE_LEN: usize = 24;
const RECOVERY_BYTES: usize = 20;
const BASE32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Argon2id parameters. They are stored with the vault so they can be tuned
/// later without losing access to existing vaults.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    /// Memory in KiB.
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

impl Default for KdfParams {
    /// 64 MiB and 3 passes (RFC 9106's recommendation for machines with little
    /// memory), with a single thread so modest machines are not overwhelmed.
    fn default() -> Self {
        Self {
            memory_kib: 64 * 1024,
            iterations: 3,
            parallelism: 1,
        }
    }
}

pub fn derive_key(secret: &[u8], salt: &[u8], params: KdfParams) -> Result<SecretKey, String> {
    let params = Params::new(
        params.memory_kib,
        params.iterations,
        params.parallelism,
        Some(KEY_LEN),
    )
    .map_err(|e| format!("Invalid encryption parameters: {e}"))?;
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(secret, salt, key.as_mut())
        .map_err(|e| format!("Could not derive the key: {e}"))?;
    Ok(key)
}

pub fn random_key() -> SecretKey {
    let mut key = Zeroizing::new([0u8; KEY_LEN]);
    OsRng.fill_bytes(key.as_mut());
    key
}

pub fn random_salt() -> [u8; 16] {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Encrypts `plaintext`. The result is `OBX1 || nonce || ciphertext`.
pub fn seal(key: &SecretKey, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());
    // With XChaCha20 the nonce is 24 bytes: choosing it at random is safe.
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| "Could not encrypt".to_string())?;
    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Decrypts what [`seal`] produced. Fails if the key is not the right one, if
/// the file was altered or if `aad` does not match.
pub fn open(key: &SecretKey, data: &[u8], aad: &[u8]) -> Result<Zeroizing<Vec<u8>>, ()> {
    let header = MAGIC.len() + NONCE_LEN;
    if data.len() < header || &data[..MAGIC.len()] != MAGIC {
        return Err(());
    }
    let nonce = XNonce::from_slice(&data[MAGIC.len()..header]);
    let cipher = XChaCha20Poly1305::new(key.as_ref().into());
    cipher
        .decrypt(
            nonce,
            Payload {
                msg: &data[header..],
                aad,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| ())
}

/// A new recovery key: 160 random bits, in groups of 4 letters and numbers,
/// for example `K7QF-2MZA-…`.
pub fn new_recovery_code() -> Zeroizing<String> {
    let mut bytes = Zeroizing::new([0u8; RECOVERY_BYTES]);
    OsRng.fill_bytes(bytes.as_mut());
    let encoded = base32_encode(bytes.as_ref());
    let groups: Vec<&str> = encoded
        .as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).unwrap_or_default())
        .collect();
    Zeroizing::new(groups.join("-"))
}

/// Normalizes a recovery key typed by hand: ignores dashes, spaces and case,
/// and fixes common mix-ups (0→O, 1→I, 8→B).
pub fn normalize_recovery_code(code: &str) -> Option<Zeroizing<String>> {
    let normalized: String = code
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            '0' => 'O',
            '1' => 'I',
            '8' => 'B',
            other => other,
        })
        .collect();
    let valid = normalized.len() == RECOVERY_BYTES * 8 / 5
        && normalized.bytes().all(|b| BASE32.contains(&b));
    valid.then(|| Zeroizing::new(normalized))
}

fn base32_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 8 / 5 + 1);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for &byte in bytes {
        buffer = (buffer << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(BASE32[((buffer >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(BASE32[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    pub const FAST: KdfParams = KdfParams {
        memory_kib: 1024,
        iterations: 1,
        parallelism: 1,
    };

    #[test]
    fn seal_and_open_roundtrip() {
        let key = random_key();
        let sealed = seal(&key, b"my idea", b"doc").unwrap();
        assert_eq!(open(&key, &sealed, b"doc").unwrap().as_slice(), b"my idea");
    }

    #[test]
    fn sealed_data_does_not_contain_the_plaintext() {
        let key = random_key();
        let sealed = seal(&key, b"a water engine", b"doc").unwrap();
        assert!(!sealed.windows(6).any(|w| w == b"engine"));
    }

    #[test]
    fn open_fails_with_wrong_key_tampering_or_other_name() {
        let key = random_key();
        let mut sealed = seal(&key, b"my idea", b"doc-a").unwrap();
        assert!(open(&random_key(), &sealed, b"doc-a").is_err());
        assert!(open(&key, &sealed, b"doc-b").is_err());
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        assert!(open(&key, &sealed, b"doc-a").is_err());
        assert!(open(&key, b"OBX1", b"doc-a").is_err());
    }

    #[test]
    fn same_password_and_salt_give_same_key() {
        let salt = random_salt();
        let a = derive_key(b"a safe password", &salt, FAST).unwrap();
        let b = derive_key(b"a safe password", &salt, FAST).unwrap();
        let c = derive_key(b"a safe password", &random_salt(), FAST).unwrap();
        assert_eq!(a.as_ref(), b.as_ref());
        assert_ne!(a.as_ref(), c.as_ref());
    }

    #[test]
    fn recovery_codes_have_expected_shape_and_normalize() {
        let code = new_recovery_code();
        assert_eq!(code.len(), 32 + 7);
        assert_eq!(code.split('-').count(), 8);
        let normalized = normalize_recovery_code(&code.to_lowercase().replace('-', " ")).unwrap();
        assert_eq!(normalized.as_str(), code.replace('-', ""));
        assert!(normalize_recovery_code("too-short").is_none());
    }

    /// Measures how long unlocking takes with the real parameters:
    /// `cargo test --release -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn default_kdf_timing() {
        let start = std::time::Instant::now();
        derive_key(b"a long password", &random_salt(), KdfParams::default()).unwrap();
        println!("Default Argon2id: {:?}", start.elapsed());
    }

    #[test]
    fn base32_matches_rfc_4648() {
        assert_eq!(base32_encode(b"foobar"), "MZXW6YTBOI");
    }
}
