import { loadEnv, validateEnv } from './config/env.js';
import { connectDB } from './config/db.js';
import { seedDemoData } from './data/demoData.js';

loadEnv();

const port = process.env.PORT || 4000;

try {
  validateEnv();
  await connectDB();
  const { app } = await import('./app.js');

  if (process.env.DEMO_SEED === 'true') {
    const result = await seedDemoData();
    console.log('Datos demo listos:', result);
  }

  app.listen(port, () => {
    console.log(`API lista en http://localhost:${port}`);
  });
} catch (error) {
  console.error('No se pudo iniciar el servidor:', error.message);
  process.exit(1);
}
