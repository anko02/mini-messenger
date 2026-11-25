export interface Conversation {
    id: string;
    /** null for one-on-one chats (title is derived from the other person), set for groups. */
    title: string | null;
    /** Always unique; 2 for direct chats, 3+ for groups. */
    participantIds: string[];
    /** ISO-8601 timestamp in UTC. */
    createdAt: string;
}