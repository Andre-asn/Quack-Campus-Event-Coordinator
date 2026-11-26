export function mapEventQueryUrl(
  apiBaseUrl: string,
  bbox: string,
  from: string,
  to: string,
): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/api/v1/events?bbox=${encodeURIComponent(bbox)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`;
}

export function isLatestMapLoad(generation: number, latestGeneration: number): boolean {
  return generation === latestGeneration;
}
