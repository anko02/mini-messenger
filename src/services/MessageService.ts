import { randomUUID } from "node:crypto";
import type { Repository } from "../storage/Repository";
import type { Conversation } from "../models/Conversation";
import type { Message } from "../models/Message";
import type { User } from "../models/User";
import { ValidationError } from "../errors";

export const MAX_MESSAGE_LENGTH = 4000;

// Control characters except newline (\n) and tab (\t).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

export class MessageService {
    constructor(private readonly repo: Repository) { }

    send(conversation: Conversation, sender: User, rawText: string): Message {
        if (!conversation.participantIds.includes(sender.id)) {
            throw new ValidationError("You are not a participant of this conversation.");
        }
        const text = rawText.replace(CONTROL_CHARS, "").trim();
        if (text.length === 0) {
            throw new ValidationError("Message is empty.");
        }
        if (text.length > MAX_MESSAGE_LENGTH) {
            throw new ValidationError(
                `Message is too long (${text.length} characters, max ${MAX_MESSAGE_LENGTH}).`,
            );
        }

        const message: Message = {
            id: randomUUID(),
            conversationId: conversation.id,
            senderId: sender.id,
            text,
            sentAt: new Date().toISOString(), // always UTC
        };
        this.repo.addMessage(message);
        return message;
    }

    /** Oldest -> newest. Sorted at read time; ties keep insertion order (stable). */
    history(conversationId: string, limit?: number): Message[] {
        const sorted = this.sortByTime(this.repo.getMessages(conversationId));
        return limit === undefined ? sorted : sorted.slice(-limit);
    }

    /** Case-insensitive substring search across all conversations the user takes part in. */
    search(user: User, query: string): Message[] {
        const q = query.trim().toLowerCase();
        if (q.length === 0) throw new ValidationError("Search text is empty.");

        const myConversationIds = new Set(
            this.repo
                .getConversations()
                .filter((c) => c.participantIds.includes(user.id))
                .map((c) => c.id),
        );
        const hits = this.repo
            .getAllMessages()
            .filter((m) => myConversationIds.has(m.conversationId) && m.text.toLowerCase().includes(q));
        return this.sortByTime(hits);
    }

    private sortByTime(messages: Message[]): Message[] {
        return messages
            .map((m, index) => ({ m, index }))
            .sort((a, b) => a.m.sentAt.localeCompare(b.m.sentAt) || a.index - b.index)
            .map((x) => x.m);
    }
}