import mongoose from 'mongoose';

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI no esta definido');
  }

  try {
    mongoose.set('strictQuery', true);
    const connection = await mongoose.connect(mongoUri);
    console.log(`MongoDB conectado correctamente: ${connection.connection.host}`);
    return connection;
  } catch (error) {
    console.error(`Error al conectar con MongoDB: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
    throw error;
  }
}
