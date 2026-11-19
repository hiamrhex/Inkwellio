/**
 * Public API of the identity module.
 *
 * The schema is exported because other modules need the table it owns as a
 * foreign-key target. They import the table, never this module's internals.
 */
export { users } from "./schema";
