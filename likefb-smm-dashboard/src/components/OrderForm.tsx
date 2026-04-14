import type { Dispatch, SetStateAction } from 'react'
import type { Category, Platform, SmmService } from '../types'

export type OrderDraft = {
  search: string
  platform: Platform
  category: Category
  serviceId: string
  targetLink: string
  quantity: number
}

const platforms: Platform[] = ['Facebook', 'TikTok', 'Instagram', 'YouTube', 'X']
const categories: Category[] = ['Followers', 'Likes', 'Views', 'Comments', 'Shares']

function fieldLabel(s: string) {
  return (
    <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
      {s}
    </div>
  )
}

function inputClass(disabled?: boolean) {
  return [
    'mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm shadow-sm outline-none transition focus:ring-2',
    disabled
      ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-500'
      : 'border-slate-200 text-slate-900 focus:ring-indigo-500',
  ].join(' ')
}

export default function OrderForm({
  draft,
  onDraftChange,
  services,
  selectedService,
  totalVnd,
  formatVnd,
  canSubmit,
  onSubmit,
  onRequireAuth,
  isGuest,
}: {
  draft: OrderDraft
  onDraftChange: Dispatch<SetStateAction<OrderDraft>>
  services: SmmService[]
  selectedService: SmmService | null
  totalVnd: number
  formatVnd: (n: number) => string
  canSubmit: boolean
  onSubmit: () => void
  onRequireAuth: () => void
  isGuest: boolean
}) {
  const quantityHint =
    selectedService != null
      ? `Min ${selectedService.min.toLocaleString('vi-VN')} • Max ${selectedService.max.toLocaleString(
          'vi-VN',
        )}`
      : 'Chọn dịch vụ để xem giới hạn'

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          {fieldLabel('Tìm dịch vụ')}
          <input
            value={draft.search}
            onChange={(e) =>
              onDraftChange((d) => ({ ...d, search: e.target.value }))
            }
            placeholder="Nhập ID hoặc tên dịch vụ..."
            className={inputClass(false)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            {fieldLabel('Nền tảng')}
            <select
              value={draft.platform}
              onChange={(e) =>
                onDraftChange((d) => ({
                  ...d,
                  platform: e.target.value as Platform,
                  serviceId: '',
                }))
              }
              className={inputClass(false)}
            >
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            {fieldLabel('Phân loại')}
            <select
              value={draft.category}
              onChange={(e) =>
                onDraftChange((d) => ({
                  ...d,
                  category: e.target.value as Category,
                  serviceId: '',
                }))
              }
              className={inputClass(false)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          {fieldLabel('Dịch vụ')}
          <select
            value={draft.serviceId}
            onChange={(e) => {
              if (isGuest) return onRequireAuth()
              onDraftChange((d) => ({ ...d, serviceId: e.target.value }))
            }}
            className={inputClass(false)}
          >
            <option value="" disabled>
              {services.length ? 'Chọn dịch vụ...' : 'Không tìm thấy dịch vụ'}
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} • {s.name} • {formatVnd(s.rateVndPer1k)}/1k
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-slate-500">
            {selectedService ? (
              <>
                <span className="font-semibold text-slate-700">
                  {formatVnd(selectedService.rateVndPer1k)}
                </span>
                /1k • Hoàn thành: {selectedService.avgCompletion}
              </>
            ) : (
              'Chọn dịch vụ để xem chi tiết.'
            )}
          </div>
        </div>

        <div>
          {fieldLabel('Link cần tăng')}
          <input
            value={draft.targetLink}
            onChange={(e) =>
              onDraftChange((d) => ({ ...d, targetLink: e.target.value }))
            }
            placeholder="https://..."
            className={inputClass(false)}
          />
          <div className="mt-2 text-xs text-slate-500">
            Hỗ trợ link bài viết, profile, video tùy dịch vụ.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          {fieldLabel('Số lượng')}
          <input
            type="number"
            min={0}
            step={1}
            value={draft.quantity}
            onChange={(e) =>
              onDraftChange((d) => ({
                ...d,
                quantity: Number(e.target.value || 0),
              }))
            }
            className={inputClass(false)}
          />
          <div className="mt-2 text-xs text-slate-500">{quantityHint}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Tổng tiền (tự động)
              </div>
              <div className="mt-1 text-2xl font-extrabold text-slate-900">
                {formatVnd(totalVnd)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Công thức: (Số lượng / 1000) × Giá/1k
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (isGuest) return onRequireAuth()
                onSubmit()
              }}
              disabled={!canSubmit}
              className={[
                'inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold shadow-sm transition',
                canSubmit
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'cursor-not-allowed bg-slate-200 text-slate-500',
              ].join(' ')}
            >
              Đặt hàng
            </button>
          </div>
          {!canSubmit ? (
            <div className="mt-3 text-xs text-slate-600">
              Gợi ý: chọn dịch vụ, nhập link, kiểm tra min/max và đảm bảo số dư đủ.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

