import { StorageProvider } from './StorageProvider.js';

class UnconfiguredCloudStorageProvider extends StorageProvider {
  constructor(name) {
    super();
    this.name = name;
  }

  unavailable() {
    throw Object.assign(
      new Error(`${this.name} storage esta preparado pero no configurado`),
      { status: 503, retryable: false }
    );
  }

  uploadBuffer() {
    return this.unavailable();
  }

  uploadStream() {
    return this.unavailable();
  }

  getSignedUrl() {
    return this.unavailable();
  }

  deleteObject() {
    return this.unavailable();
  }

  getObjectMetadata() {
    return this.unavailable();
  }

  createReadStream() {
    return this.unavailable();
  }
}

export class S3StorageProvider extends UnconfiguredCloudStorageProvider {
  constructor() {
    super('s3');
  }
}

export class R2StorageProvider extends UnconfiguredCloudStorageProvider {
  constructor() {
    super('r2');
  }
}

export class DigitalOceanSpacesProvider extends UnconfiguredCloudStorageProvider {
  constructor() {
    super('digitalocean_spaces');
  }
}
