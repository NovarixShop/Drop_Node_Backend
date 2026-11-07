import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  role: string;
}

// Development-only fallbacks. In production, assertSecureEnv() refuses to start without real secrets,
// and getSecrets() refuses to sign/verify with these publicly known values.
const DEV_ACCESS_SECRET = 'ecommerce_jwt_access_secret_key_2026_safe_local';
const DEV_REFRESH_SECRET = 'ecommerce_jwt_refresh_secret_key_2026_safe_local';

const getSecrets = () => {
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET)) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
  }
  return {
    secret: process.env.JWT_SECRET || DEV_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET || DEV_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  };
};

export const generateAccessToken = (payload: TokenPayload): string => {
  const cfg = getSecrets();
  return jwt.sign(payload, cfg.secret, {
    algorithm: 'HS256',
    expiresIn: cfg.expiresIn as any,
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const cfg = getSecrets();
  return jwt.sign(payload, cfg.refreshSecret, {
    algorithm: 'HS256',
    expiresIn: cfg.refreshExpiresIn as any,
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  const cfg = getSecrets();
  return jwt.verify(token, cfg.secret, { algorithms: ['HS256'] }) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const cfg = getSecrets();
  return jwt.verify(token, cfg.refreshSecret, { algorithms: ['HS256'] }) as TokenPayload;
};
