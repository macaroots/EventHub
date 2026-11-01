import { DuplicateError, NotFoundError } from "../../../shared/domain/errors.js";
import { User } from "../domain/user.js";
import { sign } from "../../../shared/auth/jwt.js";

export class UserAppService {
    constructor(userRepository, messageBus) {
        this.userRepository = userRepository;
        this.messageBus = messageBus;
    }
    // Cadastro público cria só 'user'; admin vem de seedAdmin.
    async signin({username, password}, role = 'user') {
        let exist = this.userRepository.getByUsername(username)
        if (exist) throw new DuplicateError('name');
        const user = new User(username, password, role);
        await this.userRepository.add(user);
        this.messageBus.publish({type: 'UserCreated', userId: user.id })
        return user.id;
    }
    
    async seedAdmin({username, password}) {
        if (!username || this.userRepository.getByUsername(username)) return;
        await this.signin({username, password}, 'admin');
    }

    async authenticate({username, password}) {
        const user = await this.userRepository.getByUsername(username);
        if (!user || user.password != password) {
            throw new NotFoundError('username or password');
        }
        return { user, token: sign(user) };
    }
}

class UserUpdated {
    constructor(bean) {

    }
}