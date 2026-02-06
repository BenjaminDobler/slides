use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::Rng;

use crate::error::{AppError, AppResult};

const KEY_ENV: &str = "SLIDES_ENCRYPTION_KEY";
const NONCE_SIZE: usize = 12;

fn get_key() -> [u8; 32] {
    let key_str = std::env::var(KEY_ENV).unwrap_or_else(|_| "slides-desktop-default-key-32b!".to_string());
    let mut key = [0u8; 32];
    let bytes = key_str.as_bytes();
    let len = bytes.len().min(32);
    key[..len].copy_from_slice(&bytes[..len]);
    key
}

pub fn encrypt(plaintext: &str) -> AppResult<String> {
    let key = get_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Internal(format!("Failed to create cipher: {}", e)))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Internal(format!("Encryption failed: {}", e)))?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(BASE64.encode(combined))
}

pub fn decrypt(encrypted: &str) -> AppResult<String> {
    let key = get_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Internal(format!("Failed to create cipher: {}", e)))?;

    let combined = BASE64
        .decode(encrypted)
        .map_err(|e| AppError::Internal(format!("Base64 decode failed: {}", e)))?;

    if combined.len() < NONCE_SIZE {
        return Err(AppError::Internal("Invalid encrypted data".to_string()));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| AppError::Internal(format!("Decryption failed: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| AppError::Internal(format!("UTF-8 decode failed: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let original = "my-secret-api-key";
        let encrypted = encrypt(original).unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }
}
