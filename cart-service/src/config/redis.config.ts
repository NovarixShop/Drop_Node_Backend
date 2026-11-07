import { createClient } from 'redis';

const memoryCache = new Map<string, { value: string; expiry: number | null }>();

class RedisCacheService {
  private client: ReturnType<typeof createClient> | null = null;
  private isConnected = false;

  constructor() {
    // On by default; REDIS_ENABLED=false switches to the in-memory fallback (it used to be ignored)
    const enabled = process.env.REDIS_ENABLED !== 'false';
    const url = process.env.REDIS_URL || 'redis://localhost:6379';

    if (enabled) {
      this.client = createClient({ url });

      this.client.on('connect', () => {
        console.log('🧠 Cart Service Redis connecting...');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        console.log('🧠 Cart Service Redis Client Connected and Ready');
      });

      this.client.on('error', (err) => {
        console.warn(`⚠️ Cart Service Redis Client Error: ${err.message}. Using in-memory fallback.`);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.warn('⚠️ Cart Service Redis connection closed. Using in-memory fallback.');
        this.isConnected = false;
      });
    }
  }

  public async connect(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.connect();
    } catch (error) {
      console.warn(`⚠️ Cart Service Redis failed to connect: ${error}. Using in-memory fallback.`);
      this.isConnected = false;
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.isConnected && this.client) {
      try {
        const data = await this.client.get(key);
        return data ? (JSON.parse(data) as T) : null;
      } catch (error) {
        console.error(`Redis GET error for key ${key}:`, error);
      }
    }

    const cached = memoryCache.get(key);
    if (!cached) return null;

    if (cached.expiry && Date.now() > cached.expiry) {
      memoryCache.delete(key);
      return null;
    }

    return JSON.parse(cached.value) as T;
  }

  public async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const stringifiedValue = JSON.stringify(value);

    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, stringifiedValue, { EX: ttlSeconds });
        } else {
          await this.client.set(key, stringifiedValue);
        }
        return;
      } catch (error) {
        console.error(`Redis SET error for key ${key}:`, error);
      }
    }

    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    memoryCache.set(key, { value: stringifiedValue, expiry });
  }

  public async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch (error) {
        console.error(`Redis DEL error for key ${key}:`, error);
      }
    }
    memoryCache.delete(key);
  }
}

export const redisCache = new RedisCacheService();
export default redisCache;
