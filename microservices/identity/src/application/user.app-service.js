import { DuplicateError, NotFoundError } from '../../../shared/domain/errors.js';
import { User } from '../domain/user.js';
import { sign } from '../../../shared/auth/jwt.js';

export class UserAppService {
    constructor(userRepository, messageBus) {
        this.userRepository = userRepository;
        this.messageBus = messageBus;
    }

    // Cadastro público cria só 'user'; admin vem de seedAdmin.
    async signin({ username, password, email }, role = 'user') {
        const loginName = username || email;
        let exist = this.userRepository.getByUsername(loginName);
        if (exist) throw new DuplicateError('username');
        const user = new User(loginName, password, role);
        this.messageBus.transaction(() => {
            this.userRepository.add(user);
            this.messageBus.publish({ type: 'UserCreated', userId: user.id, username: user.username });
        });
        return user.id;
    }
    
    async seedAdmin({ username, password }) {
        if (!username || this.userRepository.getByUsername(username)) return;
        await this.signin({ username, password }, 'admin');
    }

    async authenticate({ username, password, email }) {
        const loginName = username || email;
        const user = await this.userRepository.getByUsername(loginName);
        if (!user || user.password != password) {
            throw new NotFoundError('username or password');
        }
        return { user, token: sign(user) };
    }
}
