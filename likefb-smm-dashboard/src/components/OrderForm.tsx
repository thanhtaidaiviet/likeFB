import type { Dispatch, SetStateAction } from 'react'
import type { Category, Platform, SmmService } from '../types'
import { useToast } from '../ui/toast'

export type OrderDraft = {
  search: string
  platform: Platform
  category: Category
  serviceId: string
  targetLink: string
  quantity: number
  comments: string
}

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
  platforms,
  categories,
  selectedService,
  totalVnd,
  formatVnd,
  canSubmit,
  onSubmit,
  onRequireAuth,
  isGuest,
  submitting,
}: {
  draft: OrderDraft
  onDraftChange: Dispatch<SetStateAction<OrderDraft>>
  services: SmmService[]
  platforms: Platform[]
  categories: Category[]
  selectedService: SmmService | null
  totalVnd: number
  formatVnd: (n: number) => string
  canSubmit: boolean
  onSubmit: () => void
  onRequireAuth: () => void
  isGuest: boolean
  submitting?: boolean
}) {
  const { toast } = useToast()

  const minQty = selectedService?.min ?? 0
  const maxQty = selectedService?.max ?? Number.MAX_SAFE_INTEGER
  const needsComments =
    selectedService?.type != null && String(selectedService.type).toLowerCase() === 'custom comments'

  const commentLineCount = (() => {
    if (!needsComments) return 0
    return draft.comments
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean).length
  })()

  function validateBeforeSubmit() {
    const errors: string[] = []

    if (!draft.platform) errors.push('Vui lòng chọn Nền tảng.')
    if (!draft.category) errors.push('Vui lòng chọn Phân loại.')
    if (!draft.serviceId || !selectedService) errors.push('Vui lòng chọn Dịch vụ.')
    if (!draft.targetLink.trim()) errors.push('Vui lòng nhập Link cần tăng.')

    if (needsComments) {
      const c = draft.comments.trim()
      if (!c) errors.push('Vui lòng nhập Bình luận.')
      if (c.length > 10000) errors.push('Bình luận quá dài (tối đa 10000 ký tự).')
      if (selectedService) {
        if (commentLineCount < selectedService.min) {
          errors.push(
            `Service này yêu cầu tối thiểu ${selectedService.min.toLocaleString('vi-VN')} dòng bình luận.`,
          )
        }
        if (commentLineCount > selectedService.max) {
          errors.push(
            `Service này chỉ cho tối đa ${selectedService.max.toLocaleString('vi-VN')} dòng bình luận.`,
          )
        }
      }
    }

    const qty = draft.quantity
    if (!needsComments) {
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push('Vui lòng nhập Số lượng hợp lệ.')
      } else if (selectedService) {
        if (qty < selectedService.min) {
          errors.push(`Số lượng phải >= ${selectedService.min.toLocaleString('vi-VN')}.`)
        }
        if (qty > selectedService.max) {
          errors.push(`Số lượng phải <= ${selectedService.max.toLocaleString('vi-VN')}.`)
        }
      }
    }

    if (!needsComments) {
      if (totalVnd > 0) {
        // If canSubmit is false due to insufficient funds, show a specific message.
        // (The parent component already blocks submit when totalVnd > balanceVnd.)
        if (!canSubmit) {
          errors.push('Số dư không đủ để đặt hàng. Vui lòng nạp thêm tiền.')
        }
      }
    }

    // If all fields look OK but submit is still blocked, show a generic reason (e.g. insufficient balance).
    if (!errors.length && !canSubmit) {
      errors.push('Không thể đặt hàng. Vui lòng kiểm tra lại điều kiện (min/max, số dư, dịch vụ).')
    }

    return errors
  }

  const quantityHint =
    selectedService != null
      ? `Min ${selectedService.min.toLocaleString('vi-VN')} • Max ${selectedService.max.toLocaleString(
          'vi-VN',
        )}`
      : 'Chọn dịch vụ để xem giới hạn'

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            {fieldLabel('Nền tảng')}
            <select
              value={draft.platform}
              onChange={(e) =>
                onDraftChange((d) => ({
                  ...d,
                  platform: e.target.value as Platform,
                  category: 'All',
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
                  {c === 'All' ? 'Tất cả' : c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          {fieldLabel('Dịch vụ')}
          <select
            value={draft.serviceId}
            onChange={(e) => {
              if (isGuest) return onRequireAuth()
              const nextId = e.target.value
              const svc = services.find((s) => s.id === nextId) || null
              onDraftChange((d) => ({
                ...d,
                serviceId: nextId,
                quantity: svc ? svc.min : d.quantity,
                comments: '',
              }))
            }}
            className={inputClass(false)}
          >
            <option value="" disabled>
              {services.length ? 'Chọn dịch vụ...' : 'Không tìm thấy dịch vụ'}
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} • {s.name}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-slate-500">
            {selectedService ? null : 'Chọn dịch vụ để xem chi tiết.'}
          </div>
        </div>

        <div className="md:col-span-2">
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

        {selectedService?.type != null &&
        String(selectedService.type).toLowerCase() === 'custom comments' ? (
          <div className="md:col-span-2">
            {fieldLabel('Bình luận')}
            <textarea
              value={draft.comments}
              onChange={(e) => {
                const nextComments = e.target.value
                const lines = nextComments
                  .split(/\r?\n/)
                  .map((x) => x.trim())
                  .filter(Boolean).length
                onDraftChange((d) => ({ ...d, comments: nextComments, quantity: lines || d.quantity }))
              }}
              placeholder={'Mỗi dòng là 1 comment...\nVí dụ:\nNice!\nGreat post!'}
              className={[
                'mt-1 min-h-[110px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500',
              ].join(' ')}
            />
            <div className="mt-2 text-xs text-slate-500">
              Mỗi dòng là một comment.
              {selectedService ? (
                <>
                  {' '}
                  (Min <span className="font-semibold">{selectedService.min.toLocaleString('vi-VN')}</span> dòng)
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-1">
          {fieldLabel('Số lượng')}
          <input
            type="number"
            min={minQty}
            max={Number.isFinite(maxQty) ? maxQty : undefined}
            step={1}
            value={draft.quantity}
            disabled={needsComments}
            onChange={(e) =>
              onDraftChange((d) => ({
                ...d,
                quantity: (() => {
                  const rawNum = Number(e.target.value || 0)
                  const raw = Number.isFinite(rawNum) ? Math.trunc(rawNum) : 0
                  if (!selectedService) return raw
                  const clampedMin = Math.max(minQty, raw)
                  const clamped = Math.min(maxQty, clampedMin)
                  return Number.isFinite(clamped) ? clamped : minQty
                })(),
              }))
            }
            className={inputClass(false)}
          />
          <div className="mt-2 text-xs text-slate-500">
            {needsComments
              ? `Tự động theo số dòng bình luận: ${commentLineCount.toLocaleString(
                  'vi-VN',
                )} dòng (Min ${minQty.toLocaleString('vi-VN')} • Max ${Number.isFinite(maxQty) ? maxQty.toLocaleString('vi-VN') : '—'})`
              : quantityHint}
          </div>
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
                {selectedService ? (
                  <>
                    Công thức: (Số lượng / 1000) × {formatVnd(selectedService.rateVndPer1k)}
                  </>
                ) : (
                  'Công thức: (Số lượng / 1000) × Giá/1k'
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (submitting) return
                const errors = validateBeforeSubmit()
                if (errors.length) {
                  toast({
                    kind: 'error',
                    title: 'Thiếu thông tin',
                    description: errors.join('\n'),
                    durationMs: 4500,
                  })
                  return
                }
                if (isGuest) return onRequireAuth()
                onSubmit()
              }}
              disabled={Boolean(submitting)}
              className={[
                'inline-flex h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold shadow-sm transition',
                submitting
                  ? 'cursor-not-allowed bg-indigo-400 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700',
              ].join(' ')}
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                  Đang đặt...
                </span>
              ) : (
                'Đặt hàng'
              )}
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

