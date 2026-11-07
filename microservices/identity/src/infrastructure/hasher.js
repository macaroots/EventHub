// Infrastructure – Bcrypt hasher adapter
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export class BcryptHasher {
  async hash(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  async compare(plain, hash) {
    return bcrypt.compare(plain, hash);
  }
}

