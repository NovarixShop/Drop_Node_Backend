import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api'),
  
  MONGODB_URI: z.string({ error: 'MONGODB_URI environment variable is required' }),
  
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ENABLED: z.coerce.boolean().default(true),
  
  JWT_SECRET: z.string({ error: 'JWT_SECRET is required' }),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string({ error: 'JWT_REFRESH_SECRET is required' }),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  EMAIL_HOST: z.string().default('smtp.mailtrap.io'),
  EMAIL_PORT: z.coerce.number().default(2525),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('noreply@ecommerce.com'),
  
  STRIPE_SECRET_KEY: z.string().default('sk_test_mock'),
  STRIPE_WEBHOOK_SECRET: z.string().default('whsec_mock'),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  CMS_URL: z.string().default('http://localhost:3001'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Environment validation failed:', JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
