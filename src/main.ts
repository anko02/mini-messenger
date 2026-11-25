import { join } from "node:path";
import { JsonRepository } from "./storage/JsonRepository";
import { UserService } from "./services/UserService";
import { ConversationService } from "./services/ConversationService";
import { MessageService } from "./services/MessageService";
import { ConsoleUi } from "./ui/ConsoleUi";
import { StorageError } from "./errors";

const dataPath = process.env.MESSENGER_DATA ?? join(process.cwd(), "data", "messenger.json");

try {
    const repo = new JsonRepository(dataPath);
    const ui = new ConsoleUi(
        repo,
        new UserService(repo),
        new ConversationService(repo),
        new MessageService(repo),
    );
    await ui.run();
} catch (err) {
    if (err instanceof StorageError) {
        console.error(err.message);
        process.exit(1);
    }
    throw err;
}