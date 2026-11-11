import { DuplicateError, NotFoundError } from '../../../shared/domain/errors.js';
import { User } from '../domain/user.js';
import { sign } from '../../../shared/auth/jwt.js';

export class UserAppService {
    constructor(userRepository, messageBus, hasher) {
        this.userRepository = userRepository;
        this.messageBus = messageBus;
        this.hasher = hasher;
    }

    // Cadastro público cria só 'user'; admin vem de seedAdmin.
    async signin({ username, password, email }, role = 'user') {
        const loginName = username || email;
        const exist = await this.userRepository.getByUsername(loginName);
        if (exist) throw new DuplicateError('username');

        // Gerar hash seguro com bcrypt
        const passwordHash = this.hasher ? await this.hasher.hash(password) : password;

        const user = new User(loginName, passwordHash, role);
        await this.userRepository.add(user);
        if (this.messageBus?.publish) {
            this.messageBus.publish({ type: 'UserCreated', userId: user.id, username: user.username });
        }
        return user.id;
    }
    
    async seedAdmin({ username, password }) {
        if (!username) return;
        const exist = await this.userRepository.getByUsername(username);
        if (exist) return;
        await this.signin({ username, password }, 'admin');
    }

    async authenticate({ username, password, email }) {
        const loginName = username || email;
        const user = await this.userRepository.getByUsername(loginName);
        if (!user) {
            throw new NotFoundError('username or password');
        }

        const storedHash = user.password || user.passwordHash;
        let valid = false;

        if (this.hasher && storedHash.startsWith('$2')) {
            valid = await this.hasher.compare(password, storedHash);
        } else {
            // Compatibilidade com senhas legadas em texto puro
            valid = (password === storedHash);
        }

        if (!valid) {
            throw new NotFoundError('username or password');
        }

        return { user, token: sign(user) };
    }
}
