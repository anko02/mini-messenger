import {
    closeSync,
    existsSync,
    fsyncSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    writeSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Repository } from "./Repository";
import type { User } from "../models/User";
import type { Conversation } from "../models/Conversation";
import type { Message } from "../models/Message";
import { StorageError } from "../errors";

interface Data {
    version: 1;
    users: User[];
    conversations: Conversation[];
    messages: Message[];
}

const emptyData = (): Data => ({ version: 1, users: [], conversations: [], messages: [] });

/**
 * Keeps everything in memory (fast reads) and writes the whole file on every change.
 * Writes are atomic: data goes to "<file>.tmp", is fsync'ed, then renamed over the
 * real file. A crash mid-write leaves the old file intact.
 */
export class JsonRepository implements Repository {
    private data: Data = emptyData();

    constructor(private readonly filePath: string) {
        if (existsSync(filePath)) {
            this.data = this.read();
        } else {
            this.save(); // create the file cleanly on first run
        }
    }

    // ---- users ----
    addUser(user: User): void {
        this.commit(
            () => this.data.users.push(user),
            () => this.data.users.pop(),
        );
    }
    getUsers(): User[] {
        return [...this.data.users];
    }
    findUserById(id: string): User | undefined {
        return this.data.users.find((u) => u.id === id);
    }
    findUserByName(username: string): User | undefined {
        const name = username.toLowerCase();
        return this.data.users.find((u) => u.username === name);
    }

    // ---- conversations ----
    addConversation(conversation: Conversation): void {
        this.commit(
            () => this.data.conversations.push(conversation),
            () => this.data.conversations.pop(),
        );
    }
    getConversations(): Conversation[] {
        return [...this.data.conversations];
    }
    findConversationById(id: string): Conversation | undefined {
        return this.data.conversations.find((c) => c.id === id);
    }

    // ---- messages ----
    addMessage(message: Message): void {
        this.commit(
            () => this.data.messages.push(message),
            () => this.data.messages.pop(),
        );
    }
    getMessages(conversationId: string): Message[] {
        return this.data.messages.filter((m) => m.conversationId === conversationId);
    }
    getAllMessages(): Message[] {
        return [...this.data.messages];
    }

    // ---- internals ----

    /** Apply a change in memory, persist it, and roll back the change if persisting fails. */
    private commit(apply: () => void, undo: () => void): void {
        apply();
        try {
            this.save();
        } catch (err) {
            undo();
            throw err;
        }
    }

    private read(): Data {
        try {
            const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<Data>;
            if (
                !Array.isArray(parsed.users) ||
                !Array.isArray(parsed.conversations) ||
                !Array.isArray(parsed.messages)
            ) {
                throw new Error("file does not have the expected structure");
            }
            return {
                version: 1,
                users: parsed.users,
                conversations: parsed.conversations,
                messages: parsed.messages,
            };
        } catch (err) {
            // We deliberately do NOT overwrite a file we cannot understand: it may be recoverable by hand.
            throw new StorageError(
                `Cannot read "${this.filePath}": ${(err as Error).message}. ` +
                `Fix or move the file; the app will not overwrite it.`,
            );
        }
    }

    private save(): void {
        const tmp = `${this.filePath}.tmp`;
        try {
            mkdirSync(dirname(this.filePath), { recursive: true });
            const fd = openSync(tmp, "w");
            try {
                writeSync(fd, JSON.stringify(this.data, null, 2));
                fsyncSync(fd); // make sure bytes are on disk before the rename
            } finally {
                closeSync(fd);
            }
            renameSync(tmp, this.filePath); // atomic replace
        } catch (err) {
            throw new StorageError(`Could not save data: ${(err as Error).message}`);
        }
    }
}