\# mini-messenger — IRC edition



A tiny terminal chat app with users, one-on-one and group conversations, search, and storage that survives restarts and crashes. Styled like a 1990s IRC client: green on black, `<nick>` message format.



\## Level



\*\*Standard — "It's a Real Tool"\*\*: runtime user creation, multiple conversations, groups (3+ people), validation, search, error handling on storage failures, and separate models / services / storage / UI layers.



\## My twist



\*\*A retro IRC look.\*\* Monochrome green, monospace, `\[time] <nick> text`, and slash commands, because chat is just text. The retro style also stops me from hiding weak features behind pretty UI.



\## How to run



Requires Node.js 20+.



```bash

npm install

npm start

```



1\. Type a name at the `login as` prompt. A new name creates an account.

2\. Open a chat with `/dm bob` (create `bob` first with `/newuser bob`, or `/login bob` in a second session).

3\. Type a message and press Enter.

4\. `/quit`, run `npm start` again, and `/dm bob`: the message is still there.



| Command | What it does |

|---|---|

| `/users`, `/newuser <name>`, `/login <name>` | manage identities |

| `/chats`, `/open <n>` | list and switch conversations |

| `/dm <user>` | open or create a one-on-one chat |

| `/group <title> <u1> <u2> ...` | create a group (`\_` = space in title) |

| `/history` | show the latest 20 messages again |

| `/search <text>` | case-insensitive search of your messages |

| `/help`, `/quit` | |



Data lives in `data/messenger.json`. Override with `MESSENGER\_DATA=/path/to/file.json npm start`. Run the tests with `npm test`.



\## How data is stored



All data (users, conversations, messages) is one JSON file. At startup the file is loaded into memory, so reads are fast. Every change (new user, conversation, or message) is applied in memory and then the whole file is rewritten. The write is \*\*atomic\*\*: the new content goes to `messenger.json.tmp`, is `fsync`'ed to disk, and is then renamed over `messenger.json`. A rename either happens fully or not at all, so a crash mid-write leaves the previous good file. If saving fails (disk full, permissions), the in-memory change is rolled back so memory and disk never disagree, and the user sees an error. If the file is corrupt or hand-edited into invalid JSON, the app refuses to start and does \*\*not\*\* overwrite it, so the data can be repaired by hand. All timestamps are stored in UTC (ISO-8601) and converted to local time only for display. Messages are sorted by timestamp when shown, not by file order.



Model: a `User` has an id and a unique username. A `Conversation` has a list of participant ids and an optional title (`null` = one-on-one). A `Message` belongs to one conversation (`conversationId`) and one sender (`senderId`). The services only talk to a `Repository` interface, so `JsonRepository` can be replaced by SQLite without touching business logic.



\## Validation rules



\- \*\*Username:\*\* 3-20 chars, `\[a-z0-9\_]`, case-insensitive unique, so names are unambiguous and safe to display.

\- \*\*Message:\*\* control characters stripped, then trimmed. Empty is rejected and so is anything over 4000 characters, which protects the storage file and the screen.

\- \*\*Sender:\*\* must be a participant of the conversation.

\- \*\*Direct chat:\*\* not with yourself, and an existing chat between two people is reused (no duplicates).

\- \*\*Group:\*\* title 1-40 chars, at least 3 \*distinct\* participants.

\- \*\*Search:\*\* empty query rejected; only your own conversations are searched.



\## Architecture



```

ConsoleUi ──▶ Services (User / Conversation / Message) ──▶ Repository (interface)

&#x20;                                                              └─ JsonRepository

```



\## Known limits



\- One process at a time: two running copies would overwrite each other's file. Real multi-user use needs a server or SQLite.

\- Login has no passwords (Advanced side quest: authentication).

\- The whole file is rewritten on every message, which is fine for thousands of messages but not millions.

