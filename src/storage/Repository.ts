import type { User } from "../models/User";
import type { Conversation } from "../models/Conversation";
import type { Message } from "../models/Message";

/**
 * Storage contract. Services only know this interface, so JSON can be swapped
 * for SQLite later without touching any business logic.
 * Every add* method either fully persists or throws StorageError (and leaves
 * the in-memory state unchanged).
 */
export interface Repository {
    addUser(user: User): void;
    getUsers(): User[];
    findUserById(id: string): User | undefined;
    findUserByName(username: string): User | undefined;

    addConversation(conversation: Conversation): void;
    getConversations(): Conversation[];
    findConversationById(id: string): Conversation | undefined;

    addMessage(message: Message): void;
    getMessages(conversationId: string): Message[];
    getAllMessages(): Message[];
}