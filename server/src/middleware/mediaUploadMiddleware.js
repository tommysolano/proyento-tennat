import multer from 'multer';
import { mediaMaxBytes } from '../modules/storage/mediaValidation.js';

export const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: mediaMaxBytes()
  }
});
