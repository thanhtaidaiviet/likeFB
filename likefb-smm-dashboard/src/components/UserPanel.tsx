import type { SmmService } from '../types'

export default function UserPanel({
  userName,
  userId: _userId,
  balanceVnd,
  formatVnd,
  service,
}: {
  userName: string
  userId: string
  balanceVnd: number
  formatVnd: (n: number) => string
  service: SmmService | null
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="break-words text-sm font-semibold text-slate-900">
              {userName}
            </div>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            Online
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Số dư
          </div>
          <div className="mt-1 text-2xl font-extrabold text-slate-900">
            {formatVnd(balanceVnd)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Số dư tự trừ sau khi đặt hàng.
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-900">
          Thông tin dịch vụ
        </div>
        <div className="mt-3 grid gap-3 text-sm">
          <Row label="Trạng thái" value={service ? 'Đã chọn' : 'Chưa chọn'} />
          <Row label="Service ID" value={service?.id ?? '-'} />
          <Row label="Giá / 1k" value={service ? formatVnd(service.rateVndPer1k) : '-'} />
          <Row label="Min" value={service ? service.min.toLocaleString('vi-VN') : '-'} />
          <Row label="Max" value={service ? service.max.toLocaleString('vi-VN') : '-'} />
          <Row label="Hoàn thành" value={service?.avgCompletion ?? '-'} />
          <Row label="Ghi chú" value={service?.note ?? '-'} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="min-w-0 text-sm font-semibold text-slate-800">
        <span className="break-words whitespace-normal">{value}</span>
      </div>
    </div>
  )
}

