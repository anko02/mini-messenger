import { randomUUID } from "node:crypto";
import type { Repository } from "../storage/Repository";
import type { User } from "../models/User";
import { ValidationError } from "../errors";

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export class UserService {
    constructor(private readonly repo: Repository) { }

    create(rawName: string): User {
        const username = rawName.trim().toLowerCase();
        if (!USERNAME_RE.test(username)) {
            throw new ValidationError(
                "Username must be 3-20 characters: letters, digits or underscore.",
            );
        }
        if (this.repo.findUserByName(username)) {
            throw new ValidationError(`Username "${username}" is already taken.`);
        }
        const user: User = { id: randomUUID(), username, createdAt: new Date().toISOString() };
        this.repo.addUser(user);
        return user;
    }

    list(): User[] {
        return this.repo.getUsers().sort((a, b) => a.username.localeCompare(b.username));
    }

    getByName(rawName: string): User | undefined {
        return this.repo.findUserByName(rawName.trim().toLowerCase());
    }

    getByNameOrThrow(rawName: string): User {
        const user = this.getByName(rawName);
        if (!user) throw new ValidationError(`No such user: "${rawName}".`);
        return user;
    }
}