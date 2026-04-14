import { useMemo, useState } from 'react'
import Header from './components/Header'
import OrderForm, { type OrderDraft } from './components/OrderForm'
import Sidebar, { type NavItem } from './components/Sidebar'
import UserPanel from './components/UserPanel'
import { useAuth } from './auth/AuthContext'

import type { Platform, SmmService } from './types'

const navItems: NavItem[] = [
  { label: 'Facebook', value: 'Facebook' },
  { label: 'TikTok', value: 'TikTok' },
  { label: 'Instagram', value: 'Instagram' },
  { label: 'YouTube', value: 'YouTube' },
  { label: 'X', value: 'X' },
]

const services: SmmService[] = [
  {
    id: 'FB-10231',
    platform: 'Facebook',
    category: 'Followers',
    name: 'Follow Việt Nam - Tốc độ cao',
    rateVndPer1k: 39000,
    min: 100,
    max: 50000,
    avgCompletion: '0-6 giờ',
    note: 'Có thể tụt nhẹ 1-3%',
  },
  {
    id: 'FB-88310',
    platform: 'Facebook',
    category: 'Likes',
    name: 'Like bài viết - Global',
    rateVndPer1k: 22000,
    min: 50,
    max: 200000,
    avgCompletion: '0-12 giờ',
  },
  {
    id: 'TT-77801',
    platform: 'TikTok',
    category: 'Views',
    name: 'View video - Refill 7 ngày',
    rateVndPer1k: 1200,
    min: 1000,
    max: 2000000,
    avgCompletion: '0-3 giờ',
  },
  {
    id: 'IG-44201',
    platform: 'Instagram',
    category: 'Followers',
    name: 'Follow - HQ (no refill)',
    rateVndPer1k: 65000,
    min: 50,
    max: 30000,
    avgCompletion: '0-24 giờ',
  },
  {
    id: 'YT-33012',
    platform: 'YouTube',
    category: 'Views',
    name: 'View - Tốc độ vừa',
    rateVndPer1k: 8000,
    min: 1000,
    max: 500000,
    avgCompletion: '0-48 giờ',
  },
]

function formatVnd(n: number) {
  return n.toLocaleString('vi-VN') + ' ₫'
}

export default function Dashboard() {
  const { status, user, logout, openLogin } = useAuth()
  const [activeNav, setActiveNav] = useState<Platform>('Facebook')
  const [balanceVnd, setBalanceVnd] = useState<number>(1_250_000)

  const [draft, setDraft] = useState<OrderDraft>({
    search: '',
    platform: activeNav,
    category: 'Followers',
    serviceId: '',
    targetLink: '',
    quantity: 1000,
  })

  const filteredServices = useMemo(() => {
    const q = draft.search.trim().toLowerCase()
    return services.filter((s) => {
      if (draft.platform && s.platform !== draft.platform) return false
      if (draft.category && s.category !== draft.category) return false
      if (!q) return true
      return (
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.platform.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      )
    })
  }, [draft.search, draft.platform, draft.category])

  const selectedService = useMemo(() => {
    return services.find((s) => s.id === draft.serviceId) ?? null
  }, [draft.serviceId])

  const totalVnd = useMemo(() => {
    if (!selectedService) return 0
    const qty = Number.isFinite(draft.quantity) ? draft.quantity : 0
    return Math.max(0, (qty / 1000) * selectedService.rateVndPer1k)
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
      serviceId: '',
      search: '',
    }))
  }

  function handleSubmit() {
    if (!selectedService) return
    if (!canSubmit) return
    setBalanceVnd((b) => b - totalVnd)
    setDraft((d) => ({
      ...d,
      targetLink: '',
      quantity: selectedService.min,
    }))
    // demo-only: no API call
    // eslint-disable-next-line no-alert
    alert(
      `Đặt hàng thành công!\n\nDịch vụ: ${selectedService.id} - ${selectedService.name}\nSố lượng: ${draft.quantity}\nTổng tiền: ${formatVnd(
        totalVnd,
      )}`,
    )
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
                  <OrderForm
                    draft={draft}
                    onDraftChange={setDraft}
                    services={filteredServices}
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
    </div>
  )
}

