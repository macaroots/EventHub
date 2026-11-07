// Domain entity – pure logic, no infrastructure dependencies.

const USERNAME_REGEX = /^[a-z0-9_.-]{3,30}$/;

export class User {
  constructor({ id, name, username, email, passwordHash, active = true, createdAt }) {
    this.id = id ?? crypto.randomUUID();
    this.name = name;
    this.username = username;
    this.email = email;
    this.passwordHash = passwordHash;
    this.active = active ?? true;
    this.createdAt = createdAt ?? new Date();
  }

  static validate({ name, username, email, password }) {
    const errors = [];

    if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 120)
      errors.push({ field: 'name', message: 'name must be between 1 and 120 characters' });

    if (!username || !USERNAME_REGEX.test(username))
      errors.push({ field: 'username', message: 'username must be 3-30 chars, only lowercase letters, digits, _, . and -' });

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push({ field: 'email', message: 'email must be a valid email address' });

    if (password !== undefined) {
      if (!password || password.length < 8)
        errors.push({ field: 'password', message: 'password must be at least 8 characters' });
    }

    return errors;
  }

  static validateUpdate({ name, email }) {
    const errors = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 120)
        errors.push({ field: 'name', message: 'name must be between 1 and 120 characters' });
    }

    if (email !== undefined) {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        errors.push({ field: 'email', message: 'email must be a valid email address' });
    }

    return errors;
  }

  toPublic() {
    return {
      id: this.id,
      name: this.name,
      username: this.username,
      email: this.email,
    };
  }

  toInternal() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
    };
  }
}
