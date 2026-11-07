// Production startup checks: refuse to boot with missing or placeholder secrets instead of silently
// falling back to the development defaults that are committed in the source code.

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

const MIN_SECRET_LENGTH = 32;

/**
 * Throws (so the service exits on startup) when a required secret is missing or too short in production.
 * In development it only warns, so `npm run dev` keeps working without a full .env file.
 */
export const assertSecureEnv = (serviceName: string, secrets: string[]): void => {
  const problems: string[] = [];

  for (const name of secrets) {
    const value = process.env[name];
    if (!value) {
      problems.push(`${name} is not set`);
    } else if (value.length < MIN_SECRET_LENGTH) {
      problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }

  if (problems.length === 0) return;

  const message = `[${serviceName}] Insecure configuration: ${problems.join('; ')}`;
  if (isProduction()) {
    throw new Error(`${message}. Refusing to start in production.`);
  }
  console.warn(`⚠️  ${message} (allowed outside production only)`);
};

export default assertSecureEnv;
