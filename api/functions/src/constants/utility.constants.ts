export const UTILITY_TYPES = {
    ELECTRICITY: "electricity",
    WATER: "water",
}

export type UtilityType = typeof UTILITY_TYPES[keyof typeof UTILITY_TYPES];