import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { User } from '../src/models/user.model';
import { UserRole } from '../src/constants';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const seedDatabase = async (uri: string, dbName: string) => {
  try {
    const conn = await mongoose.createConnection(uri).asPromise();
    console.log(`Connected to MongoDB (${dbName})`);

    const UserModel = conn.model('User', User.schema);

    const email = 'novarixshop5@gmail.com';
    const password = '1234';

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      console.log(`[${dbName}] User ${email} exists. Updating role to ADMIN...`);
      existingUser.role = UserRole.ADMIN;
      existingUser.password = await bcrypt.hash(password, 12);
      await existingUser.save();
      console.log(`[${dbName}] User updated to ADMIN successfully.`);
    } else {
      const hashedPassword = await bcrypt.hash(password, 12);
      await UserModel.create({
        name: 'Super Admin',
        email,
        password: hashedPassword,
        role: UserRole.ADMIN,
        isEmailVerified: true,
        isVerified: true,
      });
      console.log(`[${dbName}] Admin user created successfully.`);
    }
    await conn.close();
  } catch (err: any) {
    console.error(`Failed to seed ${dbName}:`, err.message);
  }
};

const main = async () => {
  const defaultUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';
  
  // Seed main db
  await seedDatabase(defaultUri, 'Main DB');
  
  // Seed auth-service db if microservices are used
  if (!defaultUri.endsWith('/ecommerce_auth')) {
    const authUri = defaultUri.replace(/\/[^/]+$/, '/ecommerce_auth');
    await seedDatabase(authUri, 'Auth Service DB');
  }

  process.exit(0);
};

main();
