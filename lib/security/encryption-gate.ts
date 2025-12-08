/**
 * Encryption Gate - Handles gradual encryption migration for document content
 *
 * This module provides utilities to:
 * 1. Detect if content is already encrypted
 * 2. Encrypt unencrypted content on-the-fly during reads
 * 3. Always encrypt new content during writes
 * 4. Support graceful migration without database schema changes
 */

import { encrypt, decrypt } from "./encryption";

/**
 * Checks if content appears to be encrypted
 * Encrypted content follows format: "hex:hex:hex" (iv:authTag:encrypted)
 */
export function isEncrypted(content: any): boolean {
  // Handle null/undefined
  if (!content) {
    return false;
  }

  // If content is a string, check for encryption format
  if (typeof content === "string") {
    // Encrypted strings follow pattern: hex:hex:hex
    const parts = content.split(":");
    if (parts.length === 3) {
      // Verify each part is valid hex
      const hexPattern = /^[0-9a-f]+$/i;
      return parts.every((part) => hexPattern.test(part) && part.length > 0);
    }
    return false;
  }

  // If content is an object (JSONB), check if it has encrypted fields
  if (typeof content === "object" && content !== null) {
    // Check for encrypted marker or if all text fields appear encrypted
    if ("__encrypted" in content && content.__encrypted === true) {
      return true;
    }

    // For arrays, check if elements are encrypted
    if (Array.isArray(content)) {
      if (content.length === 0) return false;
      // Check if first element is encrypted (assume all are same state)
      return isEncrypted(content[0]);
    }

    // For other objects, assume not encrypted
    return false;
  }

  return false;
}

/**
 * Encrypts content if it's not already encrypted
 * Handles both string and object content formats
 */
export function ensureEncrypted(content: any): any {
  if (isEncrypted(content)) {
    return content;
  }

  // Handle string content (most common for document chunks)
  if (typeof content === "string") {
    return encrypt(content);
  }

  // Handle array content
  if (Array.isArray(content)) {
    return content.map((part) => ensureEncrypted(part));
  }

  // Handle other object content by serializing and encrypting
  if (typeof content === "object" && content !== null) {
    const serialized = JSON.stringify(content);
    return {
      __encrypted: true,
      __encryptedData: encrypt(serialized),
    };
  }

  return content;
}

/**
 * Decrypts content if it's encrypted
 * Handles both string and object content formats
 */
export function ensureDecrypted(content: any): any {
  if (!isEncrypted(content)) {
    return content;
  }

  // Handle encrypted string
  if (typeof content === "string") {
    try {
      return decrypt(content);
    } catch (error) {
      console.error(
        "[EncryptionGate] Failed to decrypt string content:",
        error
      );
      // Return original if decryption fails (might be corrupted or wrong key)
      return content;
    }
  }

  // Handle array of encrypted content
  if (Array.isArray(content)) {
    return content.map((part) => ensureDecrypted(part));
  }

  // Handle encrypted object content
  if (
    typeof content === "object" &&
    content !== null &&
    "__encrypted" in content &&
    content.__encrypted === true &&
    "__encryptedData" in content
  ) {
    try {
      const decrypted = decrypt(content.__encryptedData);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error(
        "[EncryptionGate] Failed to decrypt object content:",
        error
      );
      return content;
    }
  }

  return content;
}

/**
 * Migration gate: Decrypts content if encrypted, then re-encrypts it
 * This is used during reads to ensure all content is encrypted after access
 *
 * Returns: { decrypted: any, needsReEncryption: boolean, encrypted: any }
 */
export function applyEncryptionGate(content: any): {
  decrypted: any;
  needsReEncryption: boolean;
  encrypted: any;
} {
  const wasEncrypted = isEncrypted(content);
  const decrypted = wasEncrypted ? ensureDecrypted(content) : content;
  const encrypted = ensureEncrypted(decrypted);

  return {
    decrypted,
    needsReEncryption: !wasEncrypted,
    encrypted,
  };
}

/**
 * Encrypts document content for storage
 * Always encrypts, regardless of current state
 */
export function encryptDocumentContent(content: any): any {
  return ensureEncrypted(content);
}

/**
 * Decrypts document content for retrieval/processing
 * Handles both encrypted and unencrypted content gracefully
 */
export function decryptDocumentContent(content: any): any {
  return ensureDecrypted(content);
}
