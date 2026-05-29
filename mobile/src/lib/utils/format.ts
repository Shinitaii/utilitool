export function getReadingUnit(utilityType: string): string {
  return utilityType === 'water' ? 'm³' : 'kWh';
}

export function formatReading(amount: number, utilityType: string): string {
  return `${amount.toFixed(2)} ${getReadingUnit(utilityType)}`;
}
