export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    text: string;
    /** ISO-8601 timestamp in UTC, e.g. 2026-11-25T10:46:03.512Z */
    sentAt: string;
}