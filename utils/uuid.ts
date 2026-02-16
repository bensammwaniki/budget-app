/**
 * Generates a simple pseudo-random UUID for local database records.
 * Moved to a standalone file to prevent circular dependencies in the service layer.
 */
export const generateUUID = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
