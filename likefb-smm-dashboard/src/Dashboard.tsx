import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import Header from './components/Header'
import MainNavPanel, { type NavKey } from './components/MainNavPanel'
import OrderForm, { type OrderDraft } from './components/OrderForm'

import TopupModal from './components/TopupModal'
import UserPanel from './components/UserPanel'
import { useAuth } from './auth/AuthContext'
import { apiAdminTopup, apiOrdersPlace, apiOrdersSummary, apiSmmServicesPublic } from './api/smm'
import { SERVICE_OVERRIDES } from './servicesOverrides'
import { useToast } from './ui/toast'
import { prependLocalOrder } from './localOrders'

import type { Category, Platform, SmmService } from './types'

function normalizePlatform(category: string, name: string): Platform {
  const s = `${category} ${name}`.toLowerCase()
  const hasTok = (text: string, token: string) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[\\s/\\\\|,._\\-])${escaped}([\\s/\\\\|,._\\-]|$)`).test(text)
  }
  const anyTok = (tokens: string[]) => tokens.some((token) => hasTok(s, token))

  const hasFacebookSignals =
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fanpage') ||
    anyTok(['fb'])

  if (
    s.includes('telegram') ||
    s.includes('t.me') ||
    /tele\s*gram/.test(s) ||
    anyTok(['tg'])
  ) {
    return 'Telegram'
  }

  if (
    s.includes('tiktok') ||
    anyTok(['tt']) ||
    s.includes('douyin')
  ) {
    return 'TikTok'
  }

  if (
    s.includes('instagram') ||
    s.includes('insta') ||
    s.includes('threads') ||
    s.includes('threads.net') ||
    anyTok(['ig'])
  ) {
    return 'Instagram'
  }

  // "reel/reels" can appear in Facebook services too (FB Reels),
  // so only treat it as Instagram when we don't see Facebook signals.
  if (anyTok(['reel', 'reels']) && !hasFacebookSignals) {
    return 'Instagram'
  }

  if (
    s.includes('youtube') ||
    anyTok(['yt', 'ytb']) ||
    s.includes('shorts')
  ) {
    return 'YouTube'
  }

  if (
    s.includes('twitter') ||
    s.includes('x.com') ||
    anyTok(['tweet', 'tweets']) ||
    hasTok(s, 'x')
  ) {
    return 'X'
  }

  if (
    s.includes('facebook') ||
    s.includes('messenger') ||
    s.includes('fanpage') ||
    anyTok(['fb'])
  ) {
    return 'Facebook'
  }

  return 'Facebook'
}

function toNumber(x: string | number) {
  const n = typeof x === 'number' ? x : Number(String(x).trim())
  return Number.isFinite(n) ? n : 0
}

function parseQty(text: string | number) {
  const raw = String(text ?? '')
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return NaN
  const n = Number(digits)
  return Number.isFinite(n) ? n : NaN
}

const DEFAULT_MARKUP = 1.5

function formatVnd(n: number) {
  return n.toLocaleString('vi-VN') + ' ₫'
}

const ADMIN_EMAIL = 'adminlike@gmail.com'

export default function Dashboard() {
  const { status, user, token, logout, openLogin } = useAuth()
  const { toast } = useToast()
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const prevNavMenuOpenRef = useRef(false)

  useLayoutEffect(() => {
    const syncDesktopDefault = () => setNavMenuOpen(window.innerWidth >= 640)
    syncDesktopDefault()
    const id = window.requestAnimationFrame(() => {
      syncDesktopDefault()
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!navMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navMenuOpen])

  useEffect(() => {
    const prev = prevNavMenuOpenRef.current
    prevNavMenuOpenRef.current = navMenuOpen
    if (prev && !navMenuOpen) {
      menuButtonRef.current?.focus()
    }
  }, [navMenuOpen])
  const [supportNavOpen, setSupportNavOpen] = useState(false)
  const [activeNavKey, setActiveNavKey] = useState<NavKey>('overview')
  const [lang, setLang] = useState<'vi' | 'en'>('vi')
  const [darkMode, setDarkMode] = useState(false)
  const [balanceVnd, setBalanceVnd] = useState<number>(0)
  const [services, setServices] = useState<SmmService[]>([])
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [servicesLoading, setServicesLoading] = useState(false)
  const [topupOpen, setTopupOpen] = useState(false)
  const [adminTopupOpen, setAdminTopupOpen] = useState(false)
  const [adminTopupEmail, setAdminTopupEmail] = useState('')
  const [adminTopupEmailTouched, setAdminTopupEmailTouched] = useState(false)
  const [adminTopupAmount, setAdminTopupAmount] = useState<number>(10000)
  const [adminTopupBusy, setAdminTopupBusy] = useState(false)
  const adminTopupEmailInputRef = useRef<HTMLInputElement | null>(null)

  const [placingOrder, setPlacingOrder] = useState(false)
  const orderSectionRef = useRef<HTMLDivElement | null>(null)
  const overviewRegionRef = useRef<HTMLDivElement | null>(null)
  const mainScrollRef = useRef<HTMLElement | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const [kpiTotalOrders, setKpiTotalOrders] = useState(0)
  const [kpiTotalSpendVnd, setKpiTotalSpendVnd] = useState(0)
  const [kpiProcessing, setKpiProcessing] = useState(0)

  const [draft, setDraft] = useState<OrderDraft>({
    search: '',
    platform: '',
    category: 'All',
    serviceId: '',
    targetLink: '',
    quantity: 1000,
    comments: '',
  })

  useEffect(() => {
    try {
      const savedLang = String(localStorage.getItem('likefb_lang') || '')
      if (savedLang === 'en' || savedLang === 'vi') setLang(savedLang)
      const savedTheme = String(localStorage.getItem('likefb_theme') || '')
      if (savedTheme === 'dark') setDarkMode(true)
      if (savedTheme === 'light') setDarkMode(false)
      if (!savedTheme) {
        const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
        setDarkMode(Boolean(prefersDark))
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('likefb_lang', lang)
    } catch {
      // ignore
    }
  }, [lang])

  useEffect(() => {
    try {
      localStorage.setItem('likefb_theme', darkMode ? 'dark' : 'light')
    } catch {
      // ignore
    }
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [darkMode])

  useEffect(() => {
    let cancelled = false
    setServicesLoading(true)
    setServicesError(null)
    apiSmmServicesPublic()
      .then((raw) => {
        if (cancelled) return
        const mapped: SmmService[] = raw
          .map((r) => {
            const id = String(r.service ?? r.service_id ?? r.serviceId ?? r.id ?? '').trim()
            if (!id) return null
            const ov = SERVICE_OVERRIDES[id]
            if (ov?.hidden) return null

            const panelRate = toNumber(r.rate)
            const markupMultiplier = ov?.markupMultiplier ?? DEFAULT_MARKUP
            const sellRate = Math.round(panelRate * markupMultiplier)

            const upstreamPlat = r.platform
            const resolvedPlat =
              typeof upstreamPlat === 'string' && upstreamPlat.trim()
                ? upstreamPlat.trim()
                : normalizePlatform(r.category, r.name)

            return {
              id,
              platform: ov?.platform ?? resolvedPlat,
              category: ov?.category ?? String(r.category),
              name: ov?.name ?? r.name,
              type: r.type,
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

  useEffect(() => {
    let cancelled = false
    if (status !== 'authed' || !token) {
      setKpiTotalOrders(0)
      setKpiTotalSpendVnd(0)
      setKpiProcessing(0)
      setKpiLoading(false)
      return
    }

    ;(async () => {
      setKpiLoading(true)
      try {
        // One request for both history and KPI (server-side aggregation).
        const res = await apiOrdersSummary(token, { limit: 1, offset: 0 })
        if (cancelled) return
        setKpiTotalOrders(Number(res.kpi?.totalOrders) || 0)
        setKpiTotalSpendVnd(Math.max(0, Math.round(Number(res.kpi?.totalSpendVnd) || 0)))
        setKpiProcessing(Number(res.kpi?.processing) || 0)
      } catch {
        // keep KPI as-is on error
      } finally {
        if (!cancelled) setKpiLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [status, token])

  // Initialize active platform + draft when services are first loaded.
  useEffect(() => {
    if (!services.length) return
    const firstPlatform = services[0].platform
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

  // Sidebar removed.

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
    const qty = parseQty(draft.quantity)
    if (!Number.isFinite(qty)) return 0
    return Math.max(0, Math.round((qty / 1000) * selectedService.rateVndPer1k))
  }, [draft.quantity, selectedService])

  const canSubmit = useMemo(() => {
    if (!selectedService) return false
    if (!draft.targetLink.trim()) return false
    const qty = parseQty(draft.quantity)
    if (!Number.isFinite(qty)) return false
    if (qty < selectedService.min || qty > selectedService.max) return false
    if (totalVnd <= 0) return false
    if (totalVnd > balanceVnd) return false
    return true
  }, [balanceVnd, draft.quantity, draft.targetLink, selectedService, totalVnd])

  async function handleSubmit() {
    if (!selectedService) return
    if (!canSubmit) return
    if (!token) return openLogin()
    if (placingOrder) return

    setPlacingOrder(true)
    try {
      const res = await apiOrdersPlace(token, {
        service: selectedService.id,
        link: draft.targetLink.trim(),
        quantity: draft.quantity,
        comments: draft.comments.trim() ? draft.comments : undefined,
      })

      setBalanceVnd(res.balanceVnd)
      try {
        const smmAny = res?.smm as any
        const smmOrderId =
          smmAny && typeof smmAny === 'object'
            ? smmAny.order != null
              ? String(smmAny.order)
              : smmAny.data?.order != null
                ? String(smmAny.data.order)
                : null
            : null
        prependLocalOrder({
          id: res.orderId,
          serviceId: String(selectedService.id),
          link: draft.targetLink.trim(),
          quantity: Number(draft.quantity) || 0,
          totalVnd: Number(res.chargedVnd) || 0,
          smmOrderId,
          smmStatus: smmOrderId ? 'running' : 'Pending',
          refundedVnd: 0,
          refundedAt: null,
          createdAt: new Date().toISOString(),
        })
      } catch {
        // ignore local history failure
      }
      setDraft((d) => ({
        ...d,
        targetLink: '',
        quantity: selectedService.min,
        comments: '',
      }))
      toast({
        kind: 'success',
        title: 'Đặt hàng thành công',
        description: `Service ${selectedService.id} • SL ${draft.quantity.toLocaleString('vi-VN')} • Trừ ${formatVnd(
          res.chargedVnd,
        )}`,
        durationMs: 4500,
      })
    } catch (e: any) {
      const raw = String(e?.message || 'ORDER_PLACE_FAILED')
      const hint =
        raw.includes('Service ID does not exists')
          ? `${raw}\nGợi ý: Panel có thể yêu cầu SMM_COOKIE hoặc SMM_API_URL/SMM_API_KEY chưa đúng.`
          : raw
      toast({
        kind: 'error',
        title: 'Đặt hàng thất bại',
        description: hint,
        durationMs: 6000,
      })
    } finally {
      setPlacingOrder(false)
    }
  }

  const isAdmin = status === 'authed' && String(user?.email || '').toLowerCase() === ADMIN_EMAIL

  const navMenuItems = useMemo(() => {
    const vi = [
      { key: 'overview' as const, label: 'Tổng quan' },
      { key: 'newOrder' as const, label: 'Đặt đơn mới' },
      { key: 'history' as const, label: 'Lịch sử đơn hàng' },
      { key: 'topup' as const, label: 'Nạp tiền' },
      { key: 'support' as const, label: 'Hỗ trợ' },
    ]
    const en = [
      { key: 'overview' as const, label: 'Overview' },
      { key: 'newOrder' as const, label: 'New order' },
      { key: 'history' as const, label: 'Order history' },
      { key: 'topup' as const, label: 'Top up' },
      { key: 'support' as const, label: 'Support' },
    ]
    return lang === 'en' ? en : vi
  }, [lang])

  const supportTelegramUrl = useMemo(() => {
    const u = import.meta.env.VITE_TELEGRAM_SUPPORT_URL as string | undefined
    if (u) return u
    const username = import.meta.env.VITE_TELEGRAM_SUPPORT_USERNAME as string | undefined
    return username ? `https://t.me/${username}` : 'https://t.me/'
  }, [])

  const hotline = useMemo(() => {
    const raw = import.meta.env.VITE_HOTLINE as string | undefined
    return raw && raw.trim() ? raw.trim() : undefined
  }, [])

  const apiResellerUrl = useMemo(() => {
    const raw = import.meta.env.VITE_API_RESELLER_URL as string | undefined
    return raw && raw.trim() ? raw.trim() : undefined
  }, [])

  const supportZaloUrl = useMemo(
    () => (import.meta.env.VITE_ZALO_SUPPORT_URL as string | undefined) || 'https://zalo.me/',
    [],
  )

  const handleMainNav = useCallback(
    (key: NavKey) => {
      if (key === 'support') {
        setActiveNavKey('support')
        setSupportNavOpen((o) => !o)
        if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
          setNavMenuOpen(false)
        }
        return
      }
      setActiveNavKey(key)
      setSupportNavOpen(false)
      if (key === 'overview') mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      if (key === 'newOrder') orderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (key === 'history') {
        const el = document.getElementById('order-history')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (key === 'topup') {
        if (status !== 'authed') {
          openLogin()
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
            setNavMenuOpen(false)
          }
          return
        }
        setTopupOpen(true)
      }
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
        setNavMenuOpen(false)
      }
    },
    [openLogin, status],
  )

  useEffect(() => {
    const main = mainScrollRef.current
    const overviewEl = overviewRegionRef.current
    const orderEl = orderSectionRef.current
    if (!main || !overviewEl || !orderEl) return

    const historyEl = document.getElementById('order-history')
    const sections: { key: NavKey; el: Element }[] = [
      { key: 'overview', el: overviewEl },
      { key: 'newOrder', el: orderEl },
    ]
    if (historyEl) sections.push({ key: 'history', el: historyEl })

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting && e.intersectionRatio > 0)
        if (intersecting.length === 0) return
        const best = intersecting.reduce((a, b) =>
          a.intersectionRatio >= b.intersectionRatio ? a : b,
        )
        const found = sections.find((s) => s.el === best.target)
        if (!found) return
        setActiveNavKey(found.key)
      },
      { root: main, rootMargin: '-42% 0px -42% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    )

    for (const s of sections) observer.observe(s.el)
    return () => observer.disconnect()
  }, [])

  const adminTopupEmailTrimmed = adminTopupEmail.trim().toLowerCase()
  const adminTopupEmailValid = Boolean(adminTopupEmailTrimmed) && adminTopupEmailTrimmed.includes('@')

  async function handleAdminTopupSubmit() {
    if (!token) return openLogin()
    if (!isAdmin) return

    setAdminTopupEmailTouched(true)
    const email = adminTopupEmailTrimmed
    if (!email) {
      adminTopupEmailInputRef.current?.focus()
      return
    }
    if (!email.includes('@')) {
      adminTopupEmailInputRef.current?.focus()
      return
    }

    const amount = Math.round(Number(adminTopupAmount))
    if (!Number.isFinite(amount) || amount <= 0) {
      // eslint-disable-next-line no-alert
      alert('Số tiền không hợp lệ.')
      return
    }

    setAdminTopupBusy(true)
    try {
      const res = await apiAdminTopup(token, { email, amountVnd: amount })
      // eslint-disable-next-line no-alert
      alert(
        `Nạp tiền thành công!\n\nUser: ${res.user.email}\nCộng: ${res.amountVnd.toLocaleString(
          'vi-VN',
        )} ₫\nBalance mới: ${res.user.balanceVnd.toLocaleString('vi-VN')} ₫`,
      )
      setAdminTopupOpen(false)
      setAdminTopupEmail('')
    } catch (e: any) {
      const msg = String(e?.message || '')
      if (msg.includes('USER_NOT_FOUND')) {
        // eslint-disable-next-line no-alert
        alert(`Không tìm thấy user trong DB theo email: ${email}`)
        return
      }
      if (msg.includes('FORBIDDEN')) {
        // eslint-disable-next-line no-alert
        alert('Bạn không có quyền nạp tiền.')
        return
      }
      // eslint-disable-next-line no-alert
      alert(`Nạp tiền thất bại: ${e?.message || 'TOPUP_FAILED'}`)
    } finally {
      setAdminTopupBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#eef2f7] text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <Header
          userName={user?.email ?? 'user'}
          isAuthed={status === 'authed'}
          menuOpen={navMenuOpen}
          onMenuClick={() => setNavMenuOpen((v) => !v)}
          menuButtonRef={menuButtonRef}
          onLoginClick={openLogin}
          onLogoutClick={logout}
          onTopupClick={() => {
            if (status !== 'authed') return openLogin()
            setTopupOpen(true)
          }}
          supportTelegramUrl={supportTelegramUrl}
          hotline={hotline}
          apiResellerUrl={apiResellerUrl}
          lang={lang}
          onLangChange={setLang}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((v) => !v)}
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
        {navMenuOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-[29] cursor-default bg-slate-900/40 sm:hidden"
            onClick={() => setNavMenuOpen(false)}
            aria-label="Đóng menu"
          />
        ) : null}
        {navMenuOpen ? (
          <aside className="flex min-h-0 w-[min(280px,85vw)] flex-col border-r border-slate-200/80 bg-white/95 dark:border-slate-700 dark:bg-slate-900/95 max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:top-14 max-sm:z-30 max-sm:shadow-xl sm:relative sm:z-auto sm:w-[280px] sm:shrink-0 sm:shadow-[4px_0_24px_-12px_rgba(15,23,42,0.08)]">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:max-h-[calc(100vh-4rem)] sm:py-4">
              <MainNavPanel
                navMenuItems={navMenuItems}
                activeNavKey={activeNavKey}
                supportNavOpen={supportNavOpen}
                supportTelegramUrl={supportTelegramUrl}
                supportZaloUrl={supportZaloUrl}
                onNavKey={(key) => handleMainNav(key)}
                ariaLabel="Điều hướng chính"
                autoFocusFirstItem={navMenuOpen}
              />
            </div>
          </aside>
        ) : null}

        <main
          ref={mainScrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto w-full max-w-[min(100%,88rem)] space-y-5">
                <div ref={overviewRegionRef} className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-violet-600 via-indigo-600 to-fuchsia-600 p-5 text-white shadow-sm dark:border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
                    <span className="rounded-full bg-white/15 px-2 py-0.5">Chào mừng</span>
                    <span className="rounded-full bg-white/15 px-2 py-0.5">Starter</span>
                  </div>
                  <div className="mt-3 text-2xl font-extrabold leading-tight">
                    Chào {status === 'authed' ? (user?.email?.split('@')[0] ?? 'bạn') : 'bạn'}, sẵn sàng bứt phá chưa?
                  </div>
                  <div className="mt-2 max-w-2xl text-sm text-white/85">
                    {lang === 'en'
                      ? 'Boost likes today, close orders tomorrow. Turn every interaction into customers.'
                      : 'Tăng like hôm nay, chốt đơn ngày mai. Biến mọi tương tác thành khách hàng.'}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavKey('newOrder')
                        orderSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm hover:bg-white/90"
                    >
                      Đặt đơn mới
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveNavKey('topup')
                        if (status !== 'authed') return openLogin()
                        setTopupOpen(true)
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      Nạp tiền
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Số dư ví
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-50">{formatVnd(balanceVnd)}</div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-600">
                      {status === 'authed' ? 'Có thể dùng cho đơn hàng' : 'Đăng nhập để xem'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tổng đơn hàng
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                    {kpiLoading ? '—' : kpiTotalOrders.toLocaleString('vi-VN')}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Từ trước đến nay</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tổng chi tiêu
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                    {kpiLoading ? '—' : formatVnd(kpiTotalSpendVnd)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Toàn thời gian</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Đang xử lý
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                    {kpiLoading ? '—' : kpiProcessing.toLocaleString('vi-VN')}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Đơn đang chạy</div>
                </div>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 dark:border-rose-500/35 dark:bg-rose-950/70 dark:text-rose-50">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid size-9 place-items-center rounded-lg bg-rose-600 text-white dark:bg-rose-500">
                    !
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-rose-950 dark:text-rose-50">Thông báo quan trọng</div>
                    <div className="mt-1 text-sm text-rose-900 dark:text-rose-100">
                      Vui lòng kiểm tra kỹ link, số lượng và chọn đúng dịch vụ. Đơn sai link
                      không hoàn tiền.
                    </div>
                    <div className="mt-2 text-[11px] leading-tight text-rose-900/95 dark:text-rose-200">
                      <div className="font-semibold">Không cài đè đơn hàng:</div>
                      <div>
                        Vui lòng chờ đơn hàng hiện tại hoàn tất trước khi cài đơn mới. Việc cài đè có thể gây xung đột
                        tài nguyên và dẫn đến lỗi thiếu số lượng.
                      </div>
                      <div className="mt-1 font-semibold">Chính sách bảo hành:</div>
                      <div>Chúng tôi không bảo hành các trường hợp cài đè đơn hàng.</div>
                    </div>
                  </div>
                </div>
              </div>

              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setAdminTopupOpen(true)}
                  className="w-full rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-left text-indigo-950 transition hover:bg-indigo-100/60 dark:border-indigo-500/35 dark:bg-indigo-950/50 dark:text-indigo-50 dark:hover:bg-indigo-950/70"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">Nạp tiền cho tài khoản</div>
                    </div>
                  </div>
                </button>
              ) : null}
                </div>

              <div ref={orderSectionRef} className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-700">
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-50">Đặt dịch vụ SMM</div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Chọn nền tảng, phân loại và dịch vụ phù hợp.
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  {servicesLoading ? (
                    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                      Đang tải danh sách dịch vụ...
                    </div>
                  ) : null}
                  {servicesError ? (
                    <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-100">
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
                    submitting={placingOrder}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-900">
                <UserPanel
                  userId={status === 'authed' ? user?.id ?? '—' : '—'}
                  formatVnd={formatVnd}
                  token={token}
                  isAuthed={status === 'authed'}
                  isAdmin={isAdmin}
                />
              </div>
          </div>
        </main>
      </div>

      <TopupModal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        userEmail={status === 'authed' ? user?.email : undefined}
      />

      {adminTopupOpen ? (
        <div className="fixed inset-0 z-[46]">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => (adminTopupBusy ? null : setAdminTopupOpen(false))}
            role="button"
            tabIndex={0}
            aria-label="Đóng"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">Nạp tiền</div>
                </div>
                <button
                  type="button"
                  onClick={() => (adminTopupBusy ? null : setAdminTopupOpen(false))}
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Đóng"
                  disabled={adminTopupBusy}
                >
                  ×
                </button>
              </div>

              <div className="grid gap-4 p-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Email user
                  </div>
                  <input
                    ref={adminTopupEmailInputRef}
                    value={adminTopupEmail}
                    onChange={(e) => {
                      setAdminTopupEmail(e.target.value)
                      if (!adminTopupEmailTouched) setAdminTopupEmailTouched(true)
                    }}
                    onBlur={() => setAdminTopupEmailTouched(true)}
                    placeholder="user@example.com"
                    disabled={adminTopupBusy}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                  {adminTopupEmailTouched && !adminTopupEmailTrimmed ? (
                    <div className="mt-1 text-xs font-semibold text-rose-700">
                      Bắt buộc nhập email user.
                    </div>
                  ) : adminTopupEmailTouched && adminTopupEmailTrimmed && !adminTopupEmailValid ? (
                    <div className="mt-1 text-xs font-semibold text-rose-700">
                      Email không hợp lệ.
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Số tiền (VND)
                  </div>
                  <input
                    value={adminTopupAmount}
                    onChange={(e) => setAdminTopupAmount(Number(e.target.value))}
                    placeholder="10000"
                    disabled={adminTopupBusy}
                    inputMode="numeric"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setAdminTopupOpen(false)}
                  disabled={adminTopupBusy}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleAdminTopupSubmit}
                  disabled={adminTopupBusy}
                  className={[
                    'inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60',
                    'bg-indigo-600 text-white hover:bg-indigo-700',
                  ].join(' ')}
                >
                  {adminTopupBusy ? 'Đang nạp...' : 'Nạp tiền'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

