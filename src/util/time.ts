export function getISOTimestamp(): string {
  return new Date().toISOString();
}

export function getUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
