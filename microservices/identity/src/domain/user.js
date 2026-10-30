import { BlankError } from "../../../shared/domain/errors.js"

export class User {
    
    constructor(username, password, id=crypto.randomUUID()) {
        this.id = id;
        if (!username) throw new BlankError('username');
        this.username = username;
        if (!password || password.length < 2) 
            throw new Error('Password must have at least 2 chars');
        this.password = password
    }

    toJSON() {
        return {
            id: this.id,
            username: this.username,
        }
    }
}