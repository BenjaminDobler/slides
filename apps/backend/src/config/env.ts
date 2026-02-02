import 'dotenv/config';

export const config = {
  port: process.env.PORT || 3332,
  jwtSecret: process.env.JWT_SECRET || 'fallback-secret',
  encryptionKey: process.env.ENCRYPTION_KEY || 'fallback-32-char-encryption-key!',
};
