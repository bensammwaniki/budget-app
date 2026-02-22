/**
 * Generates a simple pseudo-random UUID for local database records.
 * Moved to a standalone file to prevent circular dependencies in the service layer.
 */
export const generateUUID = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export function generateColors(count: number): string[] {
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const hue = Math.floor((360 / count) * i); // evenly spread around color wheel
    colors.push(`hsl(${hue}, 70%, 50%)`);
  }

  return colors;
}