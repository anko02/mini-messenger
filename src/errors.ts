/** The user did something invalid (empty message, bad username, ...). Safe to show as-is. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Reading or writing the storage failed (corrupt file, disk full, ...). */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}