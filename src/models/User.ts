export interface User {
    id: string;
    /** Lowercase, 3-20 chars, [a-z0-9_]. Unique. */
    username: string;
    /** ISO-8601 timestamp in UTC. */
    createdAt: string;
}