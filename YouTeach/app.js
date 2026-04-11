export function generateId() {
  return "YT-" + Math.random().toString(36).substring(2, 8).toUpperCase();
}
