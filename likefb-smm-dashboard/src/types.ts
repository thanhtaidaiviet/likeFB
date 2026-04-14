export type Platform = 'Facebook' | 'TikTok' | 'Instagram' | 'YouTube' | 'X'
export type Category = 'Followers' | 'Likes' | 'Views' | 'Comments' | 'Shares'

export type SmmService = {
  id: string
  platform: Platform
  category: Category
  name: string
  rateVndPer1k: number
  min: number
  max: number
  avgCompletion: string
  note?: string
}

