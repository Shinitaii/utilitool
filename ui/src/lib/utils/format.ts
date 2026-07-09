import { format, parse } from 'date-fns';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }).format(amount);
}

export function getReadingUnit(utilityType: string): string {
  if (utilityType === 'water') return 'm³';
  return 'kWh';
}

export function formatReading(amount: number, utilityType: string): string {
  const unit = getReadingUnit(utilityType);
  return `${amount.toLocaleString()} ${unit}`;
}

export function formatKwh(kwh: number): string {
  return `${kwh.toLocaleString()} kWh`;
}

export function formatDate(date: Date): string {
  return format(date, 'MMM d, yyyy');
}

export function formatLongDate(date: Date): string {
  return format(date, 'MMMM d, yyyy');
}

export function formatDateTime(date: Date): string {
  return format(date, 'MMM d, yyyy · h:mm a');
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy');
}

export function parseDate(dateString: string): Date {
  return parse(dateString, 'yyyy-MM-dd', new Date());
}

export function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
