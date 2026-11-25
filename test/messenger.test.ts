import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonRepository } from "../src/storage/JsonRepository";
import { UserService } from "../src/services/UserService";
import { ConversationService } from "../src/services/ConversationService";
import { MessageService, MAX_MESSAGE_LENGTH } from "../src/services/MessageService";
import { StorageError, ValidationError } from "../src/errors";

function setup() {
    const dir = mkdtempSync(join(tmpdir(), "messenger-"));
    const file = join(dir, "data", "messenger.json");
    const build = () => {
        const repo = new JsonRepository(file);
        return {
            repo,
            users: new UserService(repo),
            convs: new ConversationService(repo),
            msgs: new MessageService(repo),
        };
    };
    return { dir, file, build };
}

test("a message survives a restart", () => {
    const { dir, build } = setup();
    try {
        const a = build();
        const alice = a.users.create("alice");
        const bob = a.users.create("bob");
        const chat = a.convs.openDirect(alice, bob);
        a.msgs.send(chat, alice, "Hey, ready for class?");

        const b = build(); // "restart": new repository reads the file
        const history = b.msgs.history(chat.id);
        assert.equal(history.length, 1);
        assert.equal(history[0]?.text, "Hey, ready for class?");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("empty, whitespace-only and too-long messages are rejected", () => {
    const { dir, build } = setup();
    try {
        const s = build();
        const alice = s.users.create("alice");
        const bob = s.users.create("bob");
        const chat = s.convs.openDirect(alice, bob);

        assert.throws(() => s.msgs.send(chat, alice, ""), ValidationError);
        assert.throws(() => s.msgs.send(chat, alice, "   \n\t "), ValidationError);
        assert.throws(() => s.msgs.send(chat, alice, "x".repeat(MAX_MESSAGE_LENGTH + 1)), ValidationError);
        assert.doesNotThrow(() => s.msgs.send(chat, alice, "x".repeat(MAX_MESSAGE_LENGTH)));
        assert.equal(s.msgs.history(chat.id).length, 1);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("usernames are validated and unique (case-insensitive)", () => {
    const { dir, build } = setup();
    try {
        const s = build();
        s.users.create("Alice");
        assert.throws(() => s.users.create("alice"), ValidationError);
        assert.throws(() => s.users.create("ab"), ValidationError);
        assert.throws(() => s.users.create("bad name!"), ValidationError);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("non-participants cannot post; direct chats are reused", () => {
    const { dir, build } = setup();
    try {
        const s = build();
        const alice = s.users.create("alice");
        const bob = s.users.create("bob");
        const carol = s.users.create("carol");
        const chat = s.convs.openDirect(alice, bob);
        assert.equal(s.convs.openDirect(bob, alice).id, chat.id);
        assert.throws(() => s.msgs.send(chat, carol, "hi"), ValidationError);
        assert.throws(() => s.convs.openDirect(alice, alice), ValidationError);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("groups need at least 3 distinct participants", () => {
    const { dir, build } = setup();
    try {
        const s = build();
        const alice = s.users.create("alice");
        const bob = s.users.create("bob");
        const carol = s.users.create("carol");
        assert.throws(() => s.convs.createGroup("duo", alice, [bob, bob]), ValidationError);
        assert.throws(() => s.convs.createGroup("", alice, [bob, carol]), ValidationError);
        const group = s.convs.createGroup("study", alice, [bob, carol]);
        assert.equal(group.participantIds.length, 3);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("history is ordered by time even if the file order is wrong", () => {
    const { dir, file, build } = setup();
    try {
        const s = build();
        const alice = s.users.create("alice");
        const bob = s.users.create("bob");
        const chat = s.convs.openDirect(alice, bob);
        s.msgs.send(chat, alice, "first");
        s.msgs.send(chat, bob, "second");

        // Hand-edit the file: swap the message order.
        const data = JSON.parse(readFileSync(file, "utf8"));
        data.messages.reverse();
        writeFileSync(file, JSON.stringify(data));

        const reloaded = build();
        const texts = reloaded.msgs.history(chat.id).map((m) => m.text);
        assert.deepEqual(texts, ["first", "second"]);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("search is case-insensitive and limited to your own conversations", () => {
    const { dir, build } = setup();
    try {
        const s = build();
        const alice = s.users.create("alice");
        const bob = s.users.create("bob");
        const carol = s.users.create("carol");
        const ab = s.convs.openDirect(alice, bob);
        const bc = s.convs.openDirect(bob, carol);
        s.msgs.send(ab, alice, "Lunch at NOON?");
        s.msgs.send(bc, bob, "noon works for me too");

        assert.equal(s.msgs.search(alice, "noon").length, 1);
        assert.equal(s.msgs.search(bob, "NOON").length, 2);
        assert.equal(s.msgs.search(carol, "lunch").length, 0);
        assert.throws(() => s.msgs.search(alice, "  "), ValidationError);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a corrupt data file is reported and never overwritten", () => {
    const { dir, file, build } = setup();
    try {
        build().users.create("alice"); // creates the file
        writeFileSync(file, "{ this is not json");
        assert.throws(() => build(), StorageError);
        assert.equal(readFileSync(file, "utf8"), "{ this is not json");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("saving leaves no .tmp file behind", () => {
    const { dir, file, build } = setup();
    try {
        build().users.create("alice");
        assert.equal(existsSync(`${file}.tmp`), false);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("a failed save rolls back the in-memory change", () => {
    const { dir, file, build } = setup();
    try {
        const s = build();
        s.users.create("alice");

        // Sabotage storage: replace the data file with a directory so the final rename fails.
        rmSync(file);
        mkdirSync(file);

        assert.throws(() => s.users.create("bob"), StorageError);
        assert.deepEqual(s.users.list().map((u) => u.username), ["alice"]); // bob was rolled back
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});