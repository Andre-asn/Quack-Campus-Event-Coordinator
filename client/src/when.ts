// "Today, 7:30 PM". 48 hours can reach the day after tomorrow, which reads best by name.
export function formatWhen(date: Date, now: Date = new Date()): string {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(date) - midnight(now)) / 86_400_000);
  const day = days === 0
    ? 'Today'
    : days === 1
      ? 'Tomorrow'
      : days === -1
        ? 'Yesterday'
        : date.toLocaleDateString([], { weekday: 'long' });
  return `${day}, ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// "in 25 min", "in 2 hr 5 min", "10 min ago", or "now" within a minute either way.
export function relativeStart(date: Date, now: Date = new Date()): string {
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (minutes === 0) {
    return 'now';
  }
  const span = Math.abs(minutes);
  const hours = Math.floor(span / 60);
  const rest = span % 60;
  const amount = hours === 0 ? `${span} min` : rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
  return minutes > 0 ? `in ${amount}` : `${amount} ago`;
}
