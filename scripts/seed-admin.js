const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

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
    const conn = await mongoose.createConnection(uri).asPromise();
    console.log(`✅ Connected to MongoDB (${dbName})`);

    const UserModel = conn.model('User', UserSchema);

    const email = 'novarixshop5@gmail.com';
    const password = '123456';

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      console.log(`ℹ️ [${dbName}] User ${email} exists. Updating role to admin and password to 123456...`);
      existingUser.role = 'admin'; // Must be lowercase 'admin'
      existingUser.isVerified = true;
      existingUser.isEmailVerified = true;
      existingUser.password = password; // pre-save hook will hash it ONCE
      await existingUser.save();
      console.log(`🎉 [${dbName}] Admin updated successfully.`);
    } else {
      await UserModel.create({
        name: 'Super Admin',
        email,
        password: password,
        role: 'admin', // Must be lowercase 'admin'
        isVerified: true,
        isEmailVerified: true,
      });
      console.log(`🎉 [${dbName}] Admin user created successfully.`);
    }
    await conn.close();
  } catch (err) {
    console.error(`❌ Failed to seed ${dbName}:`, err.message);
  }
};

const main = async () => {
  const defaultUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecommerce';

  await seedDatabase(defaultUri, 'Main DB');

  const authUri = defaultUri.replace(/\/[^/]+$/, '/ecommerce_auth');
  if (authUri !== defaultUri) {
    await seedDatabase(authUri, 'Auth Service DB');
  }

  process.exit(0);
};

main();
