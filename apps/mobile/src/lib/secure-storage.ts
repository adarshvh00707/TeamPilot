import * as SecureStore from 'expo-secure-store';

// SecureStore values are limited (~2 KB on some platforms) and Supabase sessions can exceed that,
// so values are split across numbered keys. Everything stays in the Keychain / Keystore.
const CHUNK_SIZE = 1800;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, OPTIONS);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`, OPTIONS);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await secureStorage.removeItem(key);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(`${k}.${i}`, chunks[i]!, OPTIONS);
    }
    await SecureStore.setItemAsync(`${k}.n`, String(chunks.length), OPTIONS);
  },

  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, OPTIONS);
    await SecureStore.deleteItemAsync(`${k}.n`, OPTIONS);
    for (let i = 0; i < Number(count ?? 0); i++) {
      await SecureStore.deleteItemAsync(`${k}.${i}`, OPTIONS);
    }
  },
};
