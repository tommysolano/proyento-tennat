import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI no esta definido');
  }

  try {
    mongoose.set('strictQuery', true);
    const connection = await mongoose.connect(mongoUri);
    logger.info('mongodb.connected', { host: connection.connection.host });
    return connection;
  } catch (error) {
    logger.error('mongodb.connection_failed', error);
    await mongoose.disconnect().catch(() => {});
    throw error;
  }
}
