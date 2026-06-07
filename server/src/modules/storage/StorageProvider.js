export class StorageProvider {
  async uploadBuffer() {
    throw new Error('uploadBuffer no implementado');
  }

  async uploadStream() {
    throw new Error('uploadStream no implementado');
  }

  async getSignedUrl() {
    throw new Error('getSignedUrl no implementado');
  }

  async deleteObject() {
    throw new Error('deleteObject no implementado');
  }

  async getObjectMetadata() {
    throw new Error('getObjectMetadata no implementado');
  }

  async createReadStream() {
    throw new Error('createReadStream no implementado');
  }
}
