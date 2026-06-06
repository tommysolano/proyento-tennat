import { loadEnv } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { seedDemoData } from './demoData.js';
import mongoose from 'mongoose';

loadEnv();

try {
  await connectDB();
  const result = await seedDemoData();
  console.log('Datos demo cargados:', result);
  await mongoose.connection.close();
  process.exit(0);
} catch (error) {
  console.error('No se pudieron cargar los datos demo:', error);
  await mongoose.connection.close();
  process.exit(1);
}
