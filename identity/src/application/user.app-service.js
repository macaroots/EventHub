import { DuplicateError, NotFoundError } from "../../../shared/domain/errors.js";
import { User } from "../domain/user.js";

export class UserAppService {
    constructor(userRepository, messageBus) {
        this.userRepository = userRepository;
        this.messageBus = messageBus;
    }
    async signin({username, password}) {
        let exist = this.userRepository.getByUsername(username)
        if (exist) throw new DuplicateError('name');
        const user = new User(username, password);
        await this.userRepository.add(user);
        this.messageBus.publish({type: 'UserCreated', userId: user.id })
        return user.id;
    }
    
    async authenticate({username, password}) {
        const user = await this.userRepository.getByUsername(username);
        if (!user || user.password != password) {
            throw new NotFoundError('username or password');
        }
        return user;
    }
}

class UserUpdated {
    constructor(bean) {

    }
}