export const ROLES = {
  PILOT:         'pilot',
  FC:            'fc',
  WAR_COMMANDER: 'war_commander',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
