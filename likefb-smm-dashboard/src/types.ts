// We use platform/category directly from upstream API.
// `All` is a special UI filter value for category dropdown.
export type Platform = string
export type Category = string

export type SmmService = {
  id: string
  platform: Platform
  category: Category
  name: string
  panelRateVndPer1k?: number
  markupMultiplier?: number
  rateVndPer1k: number
  min: number
  max: number
  avgCompletion: string
  // Upstream provides rich HTML description in `desc` (may include <p>, <br>, entities, ...).
  desc?: string
}

