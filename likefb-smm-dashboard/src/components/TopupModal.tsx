import { useMemo, useState } from 'react'
import { useToast } from '../ui/toast'

type TopupModalProps = {
  open: boolean
  onClose(): void
  userEmail?: string
}

function env(name: string) {
  return (import.meta.env[name] as string | undefined) ?? undefined
}

/** Mở app MoMo (điện thoại). Có thể ghi đè bằng VITE_MOMO_APP_URL nếu MoMo cấp deeplink riêng. */
function openMomoApp() {
  const url = (env('VITE_MOMO_APP_URL') || 'momo://').trim() || 'momo://'
  window.location.assign(url)
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', 'true')
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
}

export default function TopupModal({ open, onClose, userEmail }: TopupModalProps) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'qr' | 'transfer'>('qr')

  const momoName = env('VITE_MOMO_NAME') || 'Nguyễn Quốc Cường'
  const qrUrl = env('VITE_MOMO_QR_IMAGE_URL') || '/momo-qr.png'
  const notePrefix = env('VITE_MOMO_NOTE_PREFIX') || 'Noidung'

  const loginName = useMemo(() => {
    const email = (userEmail || '').trim()
    const nameFromEmail = email ? email.split('@')[0]?.trim() : ''
    return nameFromEmail || 'user'
  }, [userEmail])

  const transferNote = useMemo(() => {
    const p = notePrefix.trim().replace(/_+$/g, '')
    return `${p}_${loginName}`
  }, [loginName, notePrefix])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[55]">
      <div
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
        role="button"
        tabIndex={0}
        aria-label="Đóng"
      />
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
        <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:max-h-[calc(100vh-2rem)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <img src="/logo.svg" alt="LikeTikTok.xyz" className="size-5" />
                <div className="truncate text-base font-semibold text-slate-900">Nạp tiền (MoMo)</div>
              </div>
              <div className="mt-0.5 text-sm text-slate-600">
                Quét QR hoặc chuyển khoản theo thông tin bên dưới.
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              aria-label="Đóng"
            >
              ×
            </button>
          </div>

          <div className="border-b border-slate-200/70 px-4 py-2 sm:hidden">
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-extrabold text-slate-700">
              <button
                type="button"
                onClick={() => setTab('qr')}
                className={tab === 'qr' ? 'h-9 rounded-lg bg-white shadow-sm' : 'h-9 rounded-lg hover:bg-white/60'}
              >
                QR
              </button>
              <button
                type="button"
                onClick={() => setTab('transfer')}
                className={tab === 'transfer' ? 'h-9 rounded-lg bg-white shadow-sm' : 'h-9 rounded-lg hover:bg-white/60'}
              >
                Chuyển khoản
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-4 p-4 sm:gap-5 sm:p-5 md:grid-cols-[280px_1fr]">
              {/* QR */}
              <div className={tab === 'transfer' ? 'hidden sm:block' : ''}>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    QR MoMo
                  </div>
                  <div className="mt-2 overflow-hidden rounded-xl bg-white">
                    {qrUrl ? (
                      <img
                        src={qrUrl}
                        alt="QR MoMo"
                        className="h-auto max-h-[44vh] w-full object-contain md:max-h-none"
                        loading="lazy"
                      />
                    ) : (
                      <div className="grid aspect-square place-items-center p-4 text-center text-sm text-slate-600">
                        Chưa cấu hình QR.
                        <div className="mt-1 text-xs text-slate-500">
                          Set <span className="font-semibold">VITE_MOMO_QR_IMAGE_URL</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Transfer */}
              <div className={tab === 'qr' ? 'hidden sm:block' : ''}>
                <div className="min-w-0">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Thông tin chuyển khoản</div>
                    <div className="mt-3 grid gap-3 text-sm">
                      <Field
                        label="Người nhận"
                        value={momoName}
                        onCopy={async () => {
                          await copyText(momoName)
                          toast({
                            kind: 'success',
                            title: 'Đã copy',
                            description: 'Tên người nhận',
                            durationMs: 2500,
                          })
                        }}
                      />
                      <Field
                        label="Nội dung"
                        value={transferNote}
                        valueClassName="font-extrabold text-rose-700"
                        onCopy={async () => {
                          await copyText(transferNote)
                          toast({
                            kind: 'success',
                            title: 'Đã copy',
                            description: 'Nội dung chuyển khoản',
                            durationMs: 2500,
                          })
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                    <div className="text-sm font-semibold">Lưu ý</div>
                    <div className="mt-1 text-sm text-amber-900">
                      Vui lòng nhập đúng <span className="font-semibold">Nội dung</span> để hệ thống đối soát nhanh.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={openMomoApp}
                className="inline-flex items-center justify-center rounded-lg bg-[#a50064] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#8c0054] sm:order-first"
              >
                Mở app MoMo
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  disabled,
  valueClassName,
  onCopy,
}: {
  label: string
  value: string
  disabled?: boolean
  valueClassName?: string
  onCopy(): void
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[110px_1fr_auto] sm:gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:pt-1">{label}</div>
      <div className="min-w-0 sm:pt-0.5">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800">
          <span className={['break-words whitespace-normal', valueClassName || ''].join(' ')}>{value}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onCopy}
        disabled={Boolean(disabled)}
        className={[
          'inline-flex h-10 w-full items-center justify-center rounded-lg border px-3 text-xs font-semibold sm:h-8 sm:w-auto',
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
        ].join(' ')}
      >
        Copy
      </button>
    </div>
  )
}

