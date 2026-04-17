import type { Category, Platform } from './types'

export type ServiceOverride = {
  hidden?: boolean
  name?: string
  platform?: Platform
  category?: Category
  markupMultiplier?: number
}

// Customize your service list here (local override).
// - hidden: remove from UI
// - name/platform/category: change display and grouping
// - markupMultiplier: override default x1.5 for a specific service
export const SERVICE_OVERRIDES: Record<string, ServiceOverride> = {
  // Example:
  // '4042': { hidden: false, category: 'Likes', markupMultiplier: 1.5 },
  // Listed by upstream but rejects `action=add` with "Service ID does not exists".
  '4042': { hidden: true },
}

