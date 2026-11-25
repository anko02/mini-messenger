import * as readline from "node:readline";
import type { UserService } from "../services/UserService";
import type { ConversationService } from "../services/ConversationService";
import type { MessageService } from "../services/MessageService";
import type { Repository } from "../storage/Repository";
import type { User } from "../models/User";
import type { Conversation } from "../models/Conversation";
import type { Message } from "../models/Message";
import { StorageError, ValidationError } from "../errors";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = paint("32");
const bright = paint("1;32");
const dim = paint("2;32");
const red = paint("31");

const HELP = `
Commands:
  /users                       list all users
  /newuser <name>              create a user
  /login <name>                switch identity
  /chats                       list your conversations
  /open <number>               open a conversation from /chats
  /dm <user>                   open (or create) a chat with a user
  /group <title> <u1> <u2> ... create a group (use _ for spaces in title)
  /history                     show recent messages again
  /search <text>               search your messages
  /help                        show this help
  /quit                        exit
Anything else you type is sent as a message to the open conversation.`;

export class ConsoleUi {
    private me: User | undefined;
    private current: Conversation | undefined;
    private readonly rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    private readonly lines = this.rl[Symbol.asyncIterator]();

    constructor(
        private readonly repo: Repository,
        private readonly users: UserService,
        private readonly conversations: ConversationService,
        private readonly messages: MessageService,
    ) { }

    async run(): Promise<void> {
        this.println(bright("=== mini-messenger :: IRC edition ==="));
        this.println(dim(`${this.users.list().length} user(s) registered. Type /help once logged in.`));

        await this.login();
        if (!this.me) return this.quit();

        this.println(HELP);
        for (; ;) {
            const line = await this.ask(this.prompt());
            if (line === null) break;
            const input = line.trim();
            if (input === "") continue;

            try {
                if (input.startsWith("/")) {
                    const shouldQuit = this.handleCommand(input);
                    if (shouldQuit) break;
                } else {
                    this.sendMessage(input);
                }
            } catch (err) {
                this.printError(err);
            }
        }
        this.quit();
    }

    // ---- login ----

    private async login(): Promise<void> {
        for (; ;) {
            const name = await this.ask("login as (a new name creates an account): ");
            if (name === null) return;
            if (name.trim() === "") continue;
            try {
                const existing = this.users.getByName(name);
                this.me = existing ?? this.users.create(name);
                this.println(green(existing ? `Welcome back, ${this.me.username}.` : `Account "${this.me.username}" created.`));
                return;
            } catch (err) {
                this.printError(err);
            }
        }
    }

    // ---- commands ----

    /** Returns true if the app should exit. */
    private handleCommand(input: string): boolean {
        const [cmd = "", ...args] = input.slice(1).split(/\s+/);
        const rest = input.slice(1 + cmd.length).trim();

        switch (cmd.toLowerCase()) {
            case "help":
                this.println(HELP);
                break;
            case "quit":
            case "exit":
                return true;
            case "users":
                for (const u of this.users.list()) {
                    this.println(`  ${u.username}${u.id === this.me?.id ? dim(" (you)") : ""}`);
                }
                break;
            case "newuser": {
                const u = this.users.create(rest);
                this.println(green(`User "${u.username}" created.`));
                break;
            }
            case "login": {
                const u = this.users.getByNameOrThrow(rest);
                this.me = u;
                this.current = undefined;
                this.println(green(`Now logged in as ${u.username}.`));
                break;
            }
            case "chats":
                this.printChats();
                break;
            case "open":
                this.openByNumber(args[0]);
                break;
            case "dm": {
                const other = this.users.getByNameOrThrow(args[0] ?? "");
                this.open(this.conversations.openDirect(this.requireMe(), other));
                break;
            }
            case "group": {
                const [title, ...names] = args;
                if (!title) throw new ValidationError("Usage: /group <title> <user1> <user2> ...");
                const members = names.map((n) => this.users.getByNameOrThrow(n));
                this.open(this.conversations.createGroup(title.replaceAll("_", " "), this.requireMe(), members));
                break;
            }
            case "history":
                this.printHistory();
                break;
            case "search":
                this.search(rest);
                break;
            default:
                throw new ValidationError(`Unknown command "/${cmd}". Try /help.`);
        }
        return false;
    }

    private sendMessage(text: string): void {
        if (!this.current) throw new ValidationError("Open a conversation first (/chats, /dm, /group).");
        const message = this.messages.send(this.current, this.requireMe(), text);
        this.println(this.format(message));
    }

    private search(query: string): void {
        const me = this.requireMe();
        const hits = this.messages.search(me, query);
        if (hits.length === 0) {
            this.println(dim("No matches."));
            return;
        }
        for (const m of hits) {
            const conv = this.repo.findConversationById(m.conversationId);
            const where = conv ? this.conversations.titleFor(conv, me) : "?";
            this.println(`${dim(where)} ${dim(this.time(m))} <${this.nick(m.senderId)}> ${this.snippet(m.text, query)}`);
        }
        this.println(dim(`${hits.length} match(es).`));
    }

    // ---- conversations ----

    private sortedChats(): Conversation[] {
        const me = this.requireMe();
        const lastActivity = (c: Conversation) => this.messages.history(c.id, 1)[0]?.sentAt ?? c.createdAt;
        return this.conversations
            .listFor(me)
            .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
    }

    private printChats(): void {
        const me = this.requireMe();
        const chats = this.sortedChats();
        if (chats.length === 0) {
            this.println(dim("No conversations yet. Try /dm <user> or /group <title> <u1> <u2>."));
            return;
        }
        chats.forEach((c, i) => {
            const marker = c.id === this.current?.id ? "*" : " ";
            this.println(`${marker} ${i + 1}. ${this.conversations.titleFor(c, me)} ${dim(`(${c.participantIds.length} people)`)}`);
        });
    }

    private openByNumber(arg: string | undefined): void {
        const n = Number(arg);
        const chats = this.sortedChats();
        const chat = Number.isInteger(n) ? chats[n - 1] : undefined;
        if (!chat) throw new ValidationError("Usage: /open <number> (see /chats).");
        this.open(chat);
    }

    private open(conversation: Conversation): void {
        this.current = conversation;
        this.println(green(`-- ${this.conversations.titleFor(conversation, this.requireMe())} --`));
        this.printHistory();
    }

    private printHistory(): void {
        if (!this.current) throw new ValidationError("No conversation is open.");
        const history = this.messages.history(this.current.id, 20);
        if (history.length === 0) this.println(dim("(no messages yet, say hi)"));
        for (const m of history) this.println(this.format(m));
    }

    // ---- formatting ----

    private prompt(): string {
        const me = this.requireMe();
        const where = this.current ? this.conversations.titleFor(this.current, me) : "-";
        return `${me.username}@${where}> `;
    }

    private time(m: Message): string {
        return `[${new Date(m.sentAt).toLocaleString()}]`; // stored in UTC, shown in local time
    }

    private nick(userId: string): string {
        return this.repo.findUserById(userId)?.username ?? "unknown";
    }

    private format(m: Message): string {
        return `${dim(this.time(m))} ${bright(`<${this.nick(m.senderId)}>`)} ${green(m.text)}`;
    }

    private snippet(text: string, query: string): string {
        const flat = text.replace(/\s+/g, " ");
        const idx = flat.toLowerCase().indexOf(query.trim().toLowerCase());
        const start = Math.max(0, idx - 20);
        return `${start > 0 ? "…" : ""}${flat.slice(start, start + 70)}${flat.length > start + 70 ? "…" : ""}`;
    }

    private printError(err: unknown): void {
        if (err instanceof ValidationError) this.println(red(`! ${err.message}`));
        else if (err instanceof StorageError) this.println(red(`!! STORAGE ERROR: ${err.message}`));
        else throw err;
    }

    // ---- io helpers ----

    private requireMe(): User {
        if (!this.me) throw new ValidationError("Not logged in.");
        return this.me;
    }

    private println(text: string): void {
        console.log(text);
    }

    /** Returns null on end of input (Ctrl+D / closed pipe). */
    private async ask(prompt: string): Promise<string | null> {
        this.rl.setPrompt(prompt);
        this.rl.prompt();
        const { value, done } = await this.lines.next();
        return done ? null : (value as string);
    }

    private quit(): void {
        this.println(dim("Everything is saved. Bye."));
        this.rl.close();
    }
}