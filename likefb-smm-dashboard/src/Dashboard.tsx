import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header'
import OrderForm, { type OrderDraft } from './components/OrderForm'
import Sidebar, { type NavItem } from './components/Sidebar'
import TopupModal from './components/TopupModal'
import UserPanel from './components/UserPanel'
import { useAuth } from './auth/AuthContext'
import { apiOrdersPlace, apiSmmAdd, apiSmmServicesPublic } from './api/smm'
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

const FREE_LIKE_SERVICES: Record<string, string> = {
  Facebook: '4042',
  TikTok: '4876',
  Instagram: '4874',
}

export default function Dashboard() {
  const { status, user, token, logout, openLogin } = useAuth()
  const [activeNav, setActiveNav] = useState<Platform>('')
  const [balanceVnd, setBalanceVnd] = useState<number>(0)
  const [services, setServices] = useState<SmmService[]>([])
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)
  const [freeLikeOpen, setFreeLikeOpen] = useState(false)
  const [freePlatform, setFreePlatform] = useState<Platform>('')
  const [freeServiceId, setFreeServiceId] = useState<string>('4042')
  const [freeQty, setFreeQty] = useState<number>(10)
  const [freeLink, setFreeLink] = useState<string>('')

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
    setFreePlatform((cur) => {
      if (cur) return cur
      const allowed = ['Facebook', 'TikTok', 'Instagram'] as Platform[]
      const firstByServiceId =
        allowed.find((p) => {
          const id = FREE_LIKE_SERVICES[String(p)]
          return id ? services.some((s) => s.id === id) : false
        }) ?? null
      return firstByServiceId ?? firstPlatform
    })
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

  const freePlatforms = useMemo<Platform[]>(() => {
    const allowed = ['Facebook', 'TikTok', 'Instagram'] as Platform[]
    return allowed.filter((p) => {
      const id = FREE_LIKE_SERVICES[String(p)]
      if (!id) return false
      return services.some((s) => s.id === id)
    })
  }, [services])

  const freePlatformOptions = useMemo(() => {
    return freePlatforms.map((p) => {
      const id = FREE_LIKE_SERVICES[String(p)]
      const svc = id ? services.find((s) => s.id === id) ?? null : null
      const label = p
      return { platform: p, serviceId: id || '', label, service: svc }
    })
  }, [freePlatforms, services])

  useEffect(() => {
    if (!services.length) return
    if (!freePlatforms.length) return
    // Ensure selected platform is one of the allowed free-like platforms.
    if (freePlatform && freePlatforms.includes(freePlatform)) return
    setFreePlatform(freePlatforms[0])
  }, [freePlatform, freePlatforms, services.length])

  const freeServiceForPlatform = useMemo(() => {
    const serviceId = FREE_LIKE_SERVICES[String(freePlatform)] || ''
    if (!serviceId) return null
    return services.find((s) => s.id === serviceId) ?? null
  }, [freePlatform, services])

  useEffect(() => {
    if (!services.length) return
    if (!freePlatform) return
    const mapped = FREE_LIKE_SERVICES[String(freePlatform)]
    if (!mapped) return
    setFreeServiceId(mapped)
  }, [freePlatform, services.length])

  useEffect(() => {
    if (!freeServiceForPlatform) return
    setFreeQty(freeServiceForPlatform.min)
  }, [freeServiceForPlatform])

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

  async function handleFreeLikeSubmit() {
    if (!token) return openLogin()
    if (!freePlatform) {
      // eslint-disable-next-line no-alert
      alert('Vui lòng chọn nền tảng.')
      return
    }
    if (!freeServiceId || !freeServiceForPlatform) {
      // eslint-disable-next-line no-alert
      alert('Không tìm thấy dịch vụ theo nền tảng. Vui lòng thử lại sau.')
      return
    }
    const link = freeLink.trim()
    if (!link) {
      // eslint-disable-next-line no-alert
      alert('Vui lòng nhập link cần tăng.')
      return
    }
    const qty = Number.isFinite(freeQty) ? freeQty : freeServiceForPlatform.min
    try {
      const res = await apiSmmAdd(token, { service: freeServiceId, link, quantity: qty })
      setFreeLink('')
      setFreeLikeOpen(false)
      // eslint-disable-next-line no-alert
      alert(
        `Tăng like: gửi thành công!\n\nService: ${freeServiceId}\nLink: ${link}\nKết quả: ${JSON.stringify(
          res,
        )}`,
      )
    } catch (e: any) {
      // eslint-disable-next-line no-alert
      alert(`Tăng like thất bại: ${e?.message || 'SMM_ADD_FAILED'}`)
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
            isAuthed={status === 'authed'}
            activePlatform={activeNav}
            mobileMenuItems={navItems}
            onMobileNavChange={(v) => handleNavChange(v as Platform)}
            onTopupClick={() => setTopupOpen(true)}
            onLoginClick={openLogin}
            onLogoutClick={logout}
          />

          <main className="px-4 py-6 sm:px-6">
            <div className="grid gap-4">
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

              <button
                type="button"
                onClick={() => {
                  setFreeLikeOpen(true)
                }}
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-emerald-950 transition hover:bg-emerald-100/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">Tăng like miễn phí</div>
                  </div>
                </div>
              </button>

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

      <div className="fixed bottom-6 right-6 z-[54] flex flex-col gap-3">
        <a
          href={
            (import.meta.env.VITE_TELEGRAM_SUPPORT_USERNAME as string | undefined)
              ? `https://t.me/${import.meta.env.VITE_TELEGRAM_SUPPORT_USERNAME as string}`
              : 'https://t.me/'
          }
          target="_blank"
          rel="noreferrer"
          className="group inline-flex size-12 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg ring-1 ring-black/5 transition hover:bg-sky-700"
          aria-label="Hỗ trợ Telegram"
          title="Telegram"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M21.8 3.6c-.3-.3-.7-.4-1.2-.2L2.9 10.2c-.5.2-.8.6-.8 1.1 0 .5.3.9.8 1.1l4.6 1.6 1.7 5.3c.1.4.5.7.9.8.4.1.9 0 1.2-.3l2.6-2.5 4.9 3.6c.3.2.7.3 1.1.2.4-.1.7-.4.8-.8l3.4-16.1c.1-.4 0-.8-.3-1.1zM9.8 18.2l-1.2-3.8 8.9-8.2-10.9 7.2-3.8-1.3 14.7-5.7-2.9 13.8-4.7-3.4c-.4-.3-1-.3-1.3.1l-1.8 1.3z" />
          </svg>
        </a>

        <a
          href={(import.meta.env.VITE_ZALO_SUPPORT_URL as string | undefined) || 'https://zalo.me/'}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex size-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-1 ring-black/5 transition hover:bg-blue-700"
          aria-label="Hỗ trợ Zalo"
          title="Zalo"
        >
          <span className="text-sm font-extrabold">Z</span>
        </a>
      </div>

      {freeLikeOpen ? (
        <div className="fixed inset-0 z-[45]">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setFreeLikeOpen(false)}
            role="button"
            tabIndex={0}
            aria-label="Đóng"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">
                    Tăng like
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFreeLikeOpen(false)}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  aria-label="Đóng"
                >
                  ×
                </button>
              </div>

              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Nền tảng
                  </div>
                  <select
                    value={freePlatform}
                    onChange={(e) => setFreePlatform(e.target.value as Platform)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {servicesLoading ? (
                      <option value="" disabled>
                        Đang tải...
                      </option>
                    ) : freePlatformOptions.length ? (
                      freePlatformOptions.map((opt) => (
                        <option key={opt.platform} value={opt.platform}>
                          {opt.label}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>
                        Không có nền tảng miễn phí
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Dịch vụ
                  </div>
                  <input
                    value={
                      servicesLoading
                        ? 'Đang tải dịch vụ...'
                        : freeServiceForPlatform
                          ? `${freeServiceForPlatform.id} - ${freeServiceForPlatform.name}`
                          : freeServiceId
                            ? `Không tìm thấy service ${freeServiceId} từ API`
                            : '—'
                    }
                    disabled
                    className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 shadow-sm outline-none"
                  />
                  {freeServiceForPlatform ? (
                    <div className="mt-1 text-xs text-slate-500">
                      SL mặc định (min):{' '}
                      <span className="font-semibold">
                        {freeServiceForPlatform.min.toLocaleString('vi-VN')}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Link cần tăng
                  </div>
                  <input
                    value={freeLink}
                    onChange={(e) => setFreeLink(e.target.value)}
                    placeholder="https://..."
                    disabled={!freePlatform || !freeServiceForPlatform}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {!freePlatform || !freeServiceForPlatform ? (
                    <div className="mt-1 text-xs text-slate-500">
                      Vui lòng chọn nền tảng (và dịch vụ hợp lệ) trước khi nhập link.
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Số lượng
                  </div>
                  <input
                    value={freeQty}
                    disabled
                    className="mt-1 h-10 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 shadow-sm outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setFreeLikeOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleFreeLikeSubmit}
                  className={[
                    'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition',
                    'bg-emerald-600 text-white hover:bg-emerald-700',
                  ].join(' ')}
                >
                  Tăng like
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

