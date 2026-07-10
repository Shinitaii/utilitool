export function getUtilityTypeBadgeClasses(type: string): string {
	switch (type) {
		case 'electricity':
			return 'bg-yellow-100 text-yellow-800';
		case 'water':
			return 'bg-blue-100 text-blue-800';
		default:
			return 'bg-gray-100 text-gray-800';
	}
}
