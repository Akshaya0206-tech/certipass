/**
 * Two small SVG charts. Purple is the main series, gold marks the emphasised
 * one (approved). Each chart has a text summary table for screen readers.
 */
interface BarDatum {
  label: string
  total: number
  approved: number
}

export function DepartmentBars({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div>
      <ul className="space-y-3" aria-label="Applications by department">
        {data.map((d) => (
          <li key={d.label}>
            <div className="mb-1 flex items-baseline justify-between text-[13px]">
              <span className="font-semibold text-ink">{d.label}</span>
              <span className="text-ink-muted tabular-nums">
                {d.total} total · {d.approved} approved
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-sm bg-lavender-deep" aria-hidden>
              <div className="absolute inset-y-0 left-0 bg-purple" style={{ width: `${(d.total / max) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 bg-gold" style={{ width: `${(d.approved / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <Legend />
    </div>
  )
}

export function TrendColumns({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.total))
  const W = 100 / data.length
  return (
    <div>
      <svg viewBox="0 0 300 150" role="img" aria-label="Applications submitted per month" className="h-44 w-full">
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1="0" x2="300" y1={120 - t * 100} y2={120 - t * 100} stroke="#e4dcec" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = i * (300 / data.length)
          const bw = (300 / data.length) * 0.5
          const h = (d.total / max) * 100
          const ah = (d.approved / max) * 100
          return (
            <g key={d.label} transform={`translate(${x + (300 / data.length - bw) / 2},0)`}>
              <rect y={120 - h} width={bw} height={h} fill="#512080" rx="1.5" />
              <rect y={120 - ah} width={bw} height={ah} fill="#f4c542" rx="1.5" />
              <text x={bw / 2} y={120 - h - 4} textAnchor="middle" fontSize="9" fill="#30104f" fontWeight="600">
                {d.total}
              </text>
              <text x={bw / 2} y="136" textAnchor="middle" fontSize="9" fill="#71677b">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <Legend />
      <table className="sr-only">
        <caption>Applications submitted per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Submitted</th>
            <th scope="col">Approved</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label} style={{ width: `${W}%` }}>
              <th scope="row">{d.label}</th>
              <td>{d.total}</td>
              <td>{d.approved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Legend() {
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-purple" aria-hidden /> Submitted
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-gold" aria-hidden /> Approved
      </span>
    </p>
  )
}
