import { LocalStorageProvider } from './LocalStorageProvider.js';
import {
  DigitalOceanSpacesProvider,
  R2StorageProvider,
  S3StorageProvider
} from './PlaceholderStorageProviders.js';

let cachedProvider = null;
let cachedName = '';

export function getStorageProvider() {
  const name = (process.env.MEDIA_STORAGE_PROVIDER || 'local').toLowerCase();
  if (cachedProvider && cachedName === name) return cachedProvider;
  const providers = {
    local: LocalStorageProvider,
    s3: S3StorageProvider,
    r2: R2StorageProvider,
    digitalocean_spaces: DigitalOceanSpacesProvider,
    spaces: DigitalOceanSpacesProvider
  };
  const Provider = providers[name];
  if (!Provider) {
    throw new Error(`MEDIA_STORAGE_PROVIDER no soportado: ${name}`);
  }
  cachedName = name;
  cachedProvider = new Provider();
  return cachedProvider;
}
