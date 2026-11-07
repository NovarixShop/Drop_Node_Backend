const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const dns = require('dns');
const path = require('path');

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: true,
      minlength: [6, 'Password must be at least 6 characters']
    },
    role: { type: String, enum: ['customer', 'admin', 'vendor'], default: 'customer' },
    isVerified: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Hash password before saving if modified
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

const seedDatabase = async (uri, dbName) => {
  try {
    const maskedUri = uri.replace(/:([^:@]{4})[^:@]*@/, ':****@');
    console.log(`⏳ Connecting to MongoDB (${dbName}) at ${maskedUri}...`);
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 8000 }).asPromise();
    console.log(`✅ Connected to MongoDB (${dbName})`);

    const UserModel = conn.model('User', UserSchema);

    const email = (process.env.ADMIN_SEED_EMAIL || 'novarixshop5@gmail.com').toLowerCase().trim();
    const password = process.env.ADMIN_SEED_PASSWORD || '123456';

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      console.log(`ℹ️ [${dbName}] User ${email} exists. Updating role to admin and ensuring verified...`);
      existingUser.role = 'admin'; // Must be lowercase 'admin'
      existingUser.isVerified = true;
      existingUser.isEmailVerified = true;
      existingUser.password = password; // pre-save hook will hash it ONCE
      await existingUser.save();
      console.log(`🎉 [${dbName}] Admin (${email}) updated successfully.`);
    } else {
      await UserModel.create({
        name: 'Super Admin',
        email,
        password: password,
        role: 'admin', // Must be lowercase 'admin'
        isVerified: true,
        isEmailVerified: true,
      });
      console.log(`🎉 [${dbName}] Admin user (${email}) created successfully.`);
    }
    await conn.close();
  } catch (err) {
    console.error(`❌ Failed to seed ${dbName}:`, err.message);
  }
};

const getServiceUri = (baseUri, targetDb) => {
  if (!baseUri) return `mongodb://localhost:27017/${targetDb}`;
  if (baseUri.includes('?')) {
    return baseUri.replace(/\/([^/?]+)\?/, `/${targetDb}?`);
  }
  return baseUri.replace(/\/[^/]+$/, `/${targetDb}`);
};

const resolveHostUri = async (uri) => {
  // If URI points to Docker hostname "mongo", check if it can be resolved from current environment
  if (uri.includes('//mongo:') || uri.includes('@mongo:')) {
    return new Promise((resolve) => {
      dns.lookup('mongo', (err) => {
        if (err) {
          console.log('ℹ️ "mongo" host not resolvable in host DNS. Falling back to localhost:27017.');
          resolve(uri.replace('//mongo:', '//127.0.0.1:').replace('@mongo:', '@127.0.0.1:'));
        } else {
          resolve(uri);
        }
      });
    });
  }
  return uri;
};

const main = async () => {
  let defaultUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ecommerce';
  defaultUri = await resolveHostUri(defaultUri);

  console.log('🚀 Running Admin Seed Script...');
  await seedDatabase(defaultUri, 'Main DB');

  const authUri = getServiceUri(defaultUri, 'ecommerce_auth');
  if (authUri !== defaultUri) {
    await seedDatabase(authUri, 'Auth Service DB');
  }

  console.log('🏁 Admin Seed complete.');
  process.exit(0);
};

main();
