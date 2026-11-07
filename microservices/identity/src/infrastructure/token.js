// Infrastructure – JWT token adapter
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export class JwtTokenService {
  sign(payload) {
    return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  }

  verify(token) {
    return jwt.verify(token, config.jwt.secret);
  }

  expiresInSeconds() {
    // parse the expiresIn value to return a number for the response
    const val = config.jwt.expiresIn;
    if (typeof val === 'number') return val;
    const match = String(val).match(/^(\d+)([smhd]?)$/);
    if (!match) return 900;
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 1;
    return n * mult;
  }
}

