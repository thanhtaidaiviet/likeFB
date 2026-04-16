import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import OrderForm, { type OrderDraft } from './components/OrderForm'
import Sidebar, { type NavItem } from './components/Sidebar'
import TopupModal from './components/TopupModal'
import UserPanel from './components/UserPanel'
import { useAuth } from './auth/AuthContext'
import { apiOrdersPlace, apiSmmServicesPublic } from './api/smm'
import { SERVICE_OVERRIDES } from './servicesOverrides'

import type { Category, Platform, SmmService } from './types'

function hasToken(text: string, token: string) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s/\\\\|,._\\-])${escaped}([\\s/\\\\|,._\\-]|$)`).test(text)
}

function hasAnyToken(text: string, tokens: string[]) {
  return tokens.some((token) => hasToken(text, token))
}

function normalizePlatform(category: string, name: string): Platform {
  const s = `${category} ${name}`.toLowerCase()

  const hasFacebookSignals =
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fanpage') ||
    hasAnyToken(s, ['fb'])

  if (
    s.includes('telegram') ||
    s.includes('t.me') ||
    /tele\s*gram/.test(s) ||
    hasAnyToken(s, ['tg'])
  ) {
    return 'Telegram'
  }

  if (
    s.includes('tiktok') ||
    hasAnyToken(s, ['tt']) ||
    s.includes('douyin')
  ) {
    return 'TikTok'
  }

  if (
    s.includes('instagram') ||
    s.includes('insta') ||
    s.includes('threads') ||
    s.includes('threads.net') ||
    hasAnyToken(s, ['ig'])
  ) {
    return 'Instagram'
  }

  // "reel/reels" can appear in Facebook services too (FB Reels),
  // so only treat it as Instagram when we don't see Facebook signals.
  if (hasAnyToken(s, ['reel', 'reels']) && !hasFacebookSignals) {
    return 'Instagram'
  }

  if (
    s.includes('youtube') ||
    hasAnyToken(s, ['yt', 'ytb']) ||
    s.includes('shorts')
  ) {
    return 'YouTube'
  }

  if (
    s.includes('twitter') ||
    s.includes('x.com') ||
    hasAnyToken(s, ['tweet', 'tweets']) ||
    hasToken(s, 'x')
  ) {
    return 'X'
  }

  if (
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fanpage') ||
    hasAnyToken(s, ['fb'])
  ) {
    return 'Facebook'
  }

  return 'Facebook'
}

function coercePlatform(upstreamPlatform: unknown, category: string, name: string): Platform {
  if (typeof upstreamPlatform === 'string') {
    const trimmed = upstreamPlatform.trim()
    if (trimmed) return trimmed
  }

  // Fallback: if upstream doesn't provide a usable platform, infer from the service text.
  return normalizePlatform(category, name)
}

function toNumber(x: string | number) {
  const n = typeof x === 'number' ? x : Number(String(x).trim())
  return Number.isFinite(n) ? n : 0
}

function roundVnd(n: number) {
  return Math.round(n)
}

const DEFAULT_MARKUP = 1.5

function formatVnd(n: number) {
  return n.toLocaleString('vi-VN') + ' ₫'
}

export default function Dashboard() {
  const { status, user, token, logout, openLogin } = useAuth()
  const [activeNav, setActiveNav] = useState<Platform>('')
  const [balanceVnd, setBalanceVnd] = useState<number>(0)
  const [services, setServices] = useState<SmmService[]>([])
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)

  const [draft, setDraft] = useState<OrderDraft>({
    search: '',
    platform: '',
    category: 'All',
    serviceId: '',
    targetLink: '',
    quantity: 1000,
  })

  useEffect(() => {
    let cancelled = false
    setServicesLoading(true)
    setServicesError(null)
    apiSmmServicesPublic()
      .then((raw) => {
        if (cancelled) return
        const mapped: SmmService[] = raw
          .map((r) => {
            const id = String(r.service)
            const ov = SERVICE_OVERRIDES[id]
            if (ov?.hidden) return null

            const panelRate = toNumber(r.rate)
            const markupMultiplier = ov?.markupMultiplier ?? DEFAULT_MARKUP
            const sellRate = roundVnd(panelRate * markupMultiplier)

            return {
              id,
              platform: ov?.platform ?? coercePlatform(r.platform, r.category, r.name),
              category: ov?.category ?? String(r.category),
              name: ov?.name ?? r.name,
              desc: r.desc,
              panelRateVndPer1k: panelRate,
              markupMultiplier,
              rateVndPer1k: sellRate,
              min: toNumber(r.min),
              max: toNumber(r.max),
              avgCompletion: '-',
            } satisfies SmmService
          })
          .filter(Boolean) as SmmService[]
        setServices(mapped)
      })
      .catch((e: any) => {
        if (cancelled) return
        setServicesError(e?.message || 'SMM_SERVICES_FAILED')
      })
      .finally(() => {
        if (cancelled) return
        setServicesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status !== 'authed') {
      setBalanceVnd(0)
      return
    }
    setBalanceVnd(user?.balanceVnd ?? 0)
  }, [status, user?.balanceVnd])

  // Initialize active platform + draft when services are first loaded.
  useEffect(() => {
    if (!services.length) return
    const firstPlatform = services[0].platform
    setActiveNav((cur) => (cur ? cur : firstPlatform))
    setDraft((d) =>
      d.platform
        ? d
        : {
            ...d,
            platform: firstPlatform,
            category: 'All',
            serviceId: '',
            search: '',
          },
    )
  }, [services])

  const filteredServices = useMemo(() => {
    const q = draft.search.trim().toLowerCase()

    const filtered = services.filter((s) => {
      if (draft.platform && s.platform !== draft.platform) return false
      if (draft.category !== 'All' && s.category !== draft.category) return false
      if (!q) return true
      return (
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.platform.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      )
    })

    const categoryOrderForPlatform: Category[] = (() => {
      const seen = new Set<Category>()
      const list: Category[] = []
      for (const s of services) {
        if (s.platform !== draft.platform) continue
        if (seen.has(s.category)) continue
        seen.add(s.category)
        list.push(s.category)
      }
      return list
    })()

    const categoryIndex = new Map(categoryOrderForPlatform.map((c, i) => [c, i]))
    const serviceIndex = new Map(services.map((s, i) => [s.id, i]))

    return filtered.sort((a, b) => {
      const ai = categoryIndex.get(a.category) ?? Number.MAX_SAFE_INTEGER
      const bi = categoryIndex.get(b.category) ?? Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi

      // Preserve upstream order within the same category.
      return (serviceIndex.get(a.id) ?? 0) - (serviceIndex.get(b.id) ?? 0)
    })
  }, [services, draft.search, draft.platform, draft.category])

  const availableCategories = useMemo<Category[]>(() => {
    const seen = new Set<Category>()
    const list: Category[] = []
    for (const s of services) {
      if (s.platform !== draft.platform) continue
      if (seen.has(s.category)) continue
      seen.add(s.category)
      list.push(s.category)
    }
    return ['All' as Category, ...list]
  }, [services, draft.platform])

  const availablePlatforms = useMemo<Platform[]>(() => {
    const seen = new Set<Platform>()
    const list: Platform[] = []
    for (const s of services) {
      if (seen.has(s.platform)) continue
      seen.add(s.platform)
      list.push(s.platform)
    }
    return list
  }, [services])

  const navItems = useMemo<NavItem[]>(
    () => availablePlatforms.map((p) => ({ label: p, value: p })),
    [availablePlatforms],
  )

  useEffect(() => {
    if (!availableCategories.length) return
    setDraft((d) => {
      if (availableCategories.includes(d.category)) return d

      // Keep the previous default behavior when possible (prefer a concrete category over 'All').
      const fallback: Category = availableCategories.find((c) => c !== 'All') ?? 'All'
      return {
        ...d,
        category: fallback,
        serviceId: '',
      }
    })
  }, [availableCategories])

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === draft.serviceId) ?? null
  }, [draft.serviceId])

  const totalVnd = useMemo(() => {
    if (!selectedService) return 0
    const qty = Number.isFinite(draft.quantity) ? draft.quantity : 0
    return Math.max(0, roundVnd((qty / 1000) * selectedService.rateVndPer1k))
  }, [draft.quantity, selectedService])

  const canSubmit = useMemo(() => {
    if (!selectedService) return false
    if (!draft.targetLink.trim()) return false
    if (!Number.isFinite(draft.quantity)) return false
    if (draft.quantity < selectedService.min || draft.quantity > selectedService.max)
      return false
    if (totalVnd <= 0) return false
    if (totalVnd > balanceVnd) return false
    return true
  }, [balanceVnd, draft.quantity, draft.targetLink, selectedService, totalVnd])

  function handleNavChange(next: Platform) {
    setActiveNav(next)
    setDraft((d) => ({
      ...d,
      platform: next,
      category: 'All',
      serviceId: '',
      search: '',
    }))
  }

  async function handleSubmit() {
    if (!selectedService) return
    if (!canSubmit) return
    if (!token) return openLogin()

    try {
      const res = await apiOrdersPlace(token, {
        service: selectedService.id,
        link: draft.targetLink.trim(),
        quantity: draft.quantity,
      })

      setBalanceVnd(res.balanceVnd)
      setDraft((d) => ({
        ...d,
        targetLink: '',
        quantity: selectedService.min,
      }))
      // eslint-disable-next-line no-alert
      alert(
        `Đặt hàng thành công!\n\nService: ${selectedService.id}\nLink: ${draft.targetLink}\nSố lượng: ${draft.quantity}\nKết quả: ${JSON.stringify(
          res.smm,
        )}`,
      )
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert(`Đặt hàng thất bại: ${e?.message || 'SMM_ADD_FAILED'}`)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr_340px]">
        <aside className="hidden border-r border-slate-200 bg-white lg:block">
          <Sidebar
            items={navItems}
            activeValue={activeNav}
            onChange={(v) => handleNavChange(v as Platform)}
          />
        </aside>

        <div className="min-w-0">
          <Header
            userName={user?.email ?? 'user'}
            userRole="Agent / Reseller"
            activePlatform={activeNav}
            mobileMenuItems={navItems}
            onMobileNavChange={(v) => handleNavChange(v as Platform)}
            onTopupClick={() => setTopupOpen(true)}
          />

          <main className="px-4 py-6 sm:px-6">
            <div className="grid gap-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900">Đang đăng nhập</div>
                  <div className="mt-1 truncate text-sm text-slate-600">
                    {status === 'authed' ? user?.email ?? '—' : 'Khách (chưa đăng nhập)'}
                  </div>
                </div>
                {status === 'authed' ? (
                  <button
                    type="button"
                    onClick={logout}
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Đăng xuất
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openLogin}
                    className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    Đăng nhập
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid size-9 place-items-center rounded-lg bg-rose-600 text-white">
                    !
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">Thông báo quan trọng</div>
                    <div className="mt-1 text-sm text-rose-800">
                      Vui lòng kiểm tra kỹ link, số lượng và chọn đúng dịch vụ. Đơn sai link
                      không hoàn tiền.
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Kênh hỗ trợ Telegram
                    </div>
                    <div className="text-sm text-slate-600">
                      Nhắn admin để được hỗ trợ nhanh nhất.
                    </div>
                  </div>
                  <a
                    className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                    href="https://t.me/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở Telegram
                  </a>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-6">
                  <div className="text-base font-semibold">Đặt dịch vụ SMM</div>
                  <div className="mt-1 text-sm text-slate-600">
                    Chọn nền tảng, phân loại và dịch vụ phù hợp.
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  {servicesLoading ? (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      Đang tải danh sách dịch vụ...
                    </div>
                  ) : null}
                  {servicesError ? (
                    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                      Không tải được services: {servicesError}
                    </div>
                  ) : null}
                  <OrderForm
                    draft={draft}
                    onDraftChange={setDraft}
                    services={filteredServices}
                    platforms={availablePlatforms}
                    categories={availableCategories}
                    selectedService={selectedService}
                    totalVnd={totalVnd}
                    formatVnd={formatVnd}
                    canSubmit={canSubmit}
                    onSubmit={handleSubmit}
                    isGuest={status !== 'authed'}
                    onRequireAuth={openLogin}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>

        <aside className="border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
          <div className="px-4 py-6 sm:px-6 lg:px-5">
            <UserPanel
              userName={status === 'authed' ? user?.email ?? 'user' : 'guest'}
              userId={status === 'authed' ? user?.id ?? '—' : '—'}
              balanceVnd={balanceVnd}
              formatVnd={formatVnd}
              service={selectedService}
            />
          </div>
        </aside>
      </div>

      <TopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        userId={status === 'authed' ? user?.id : undefined}
        userEmail={status === 'authed' ? user?.email : undefined}
      />
    </div>
  )
}

