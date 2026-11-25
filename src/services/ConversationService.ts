import { randomUUID } from "node:crypto";
import type { Repository } from "../storage/Repository";
import type { Conversation } from "../models/Conversation";
import type { User } from "../models/User";
import { ValidationError } from "../errors";

export const MAX_TITLE_LENGTH = 40;
export const MIN_GROUP_SIZE = 3;

export class ConversationService {
    constructor(private readonly repo: Repository) { }

    /** Returns the existing one-on-one chat between two users, or creates it. */
    openDirect(a: User, b: User): Conversation {
        if (a.id === b.id) throw new ValidationError("You cannot start a chat with yourself.");

        const existing = this.repo
            .getConversations()
            .find(
                (c) =>
                    c.title === null &&
                    c.participantIds.length === 2 &&
                    c.participantIds.includes(a.id) &&
                    c.participantIds.includes(b.id),
            );
        if (existing) return existing;

        return this.create(null, [a.id, b.id]);
    }

    createGroup(title: string, creator: User, members: User[]): Conversation {
        const cleanTitle = title.trim();
        if (cleanTitle.length < 1 || cleanTitle.length > MAX_TITLE_LENGTH) {
            throw new ValidationError(`Group title must be 1-${MAX_TITLE_LENGTH} characters.`);
        }
        const ids = [...new Set([creator.id, ...members.map((m) => m.id)])];
        if (ids.length < MIN_GROUP_SIZE) {
            throw new ValidationError(
                `A group needs at least ${MIN_GROUP_SIZE} different participants (including you).`,
            );
        }
        return this.create(cleanTitle, ids);
    }

    listFor(user: User): Conversation[] {
        return this.repo.getConversations().filter((c) => c.participantIds.includes(user.id));
    }

    /** Display name of a conversation from the viewer's point of view. */
    titleFor(conversation: Conversation, viewer: User): string {
        if (conversation.title) return `#${conversation.title}`;
        const otherId = conversation.participantIds.find((id) => id !== viewer.id);
        const other = otherId ? this.repo.findUserById(otherId) : undefined;
        return other ? `@${other.username}` : "@unknown";
    }

    private create(title: string | null, participantIds: string[]): Conversation {
        if (participantIds.length < 2) {
            throw new ValidationError("A conversation needs participants.");
        }
        for (const id of participantIds) {
            if (!this.repo.findUserById(id)) throw new ValidationError("Unknown participant.");
        }
        const conversation: Conversation = {
            id: randomUUID(),
            title,
            participantIds,
            createdAt: new Date().toISOString(),
        };
        this.repo.addConversation(conversation);
        return conversation;
    }
}