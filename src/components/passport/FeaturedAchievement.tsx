import { Link } from 'react-router-dom'
import { ArrowRight, Stamp } from 'lucide-react'
import { formatDate } from '../../lib/format'
import type { Achievement } from '../../types'
import { ResultBadge } from '../ui/StatusBadge'

/**
 * The student's most notable achievement, chosen by the result they
 * recorded and set like a pressed page with a seal. Shows an honest empty
 * state until they have submitted something.
 */
export function FeaturedAchievement({ achievement, href }: { achievement: Achievement | null; href?: string }) {
  if (!achievement || !href) {
    return (
      <section aria-labelledby="featured-heading" className="rounded-md border border-dashed border-line-strong bg-parchment/40 p-5">
        <h2 id="featured-heading" className="label-archival">Featured achievement</h2>
        <p className="mt-3 font-serif text-[15px] text-navy-900">Nothing here yet</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Add your first certificate and your most notable achievement will be featured here.
        </p>
      </section>
    )
  }
  const a = achievement
  return (
    <section aria-labelledby="featured-heading" className="relative overflow-hidden rounded-xl border border-line bg-white p-5 shadow-paper">
      <h2 id="featured-heading" className="label-archival">Featured achievement</h2>
      <Stamp className="absolute top-4 right-4 size-12 rotate-[-12deg] text-gold-dark/40" strokeWidth={1.2} aria-hidden />
      <p className="mt-3 pr-12 font-serif text-[17px] leading-snug text-navy-900">{a.eventName}</p>
      <p className="mt-1 font-serif text-[15px] text-navy-700 italic">{a.position ?? a.achievementType}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <div>
          <dt className="label-archival text-[9.5px]">Category</dt>
          <dd className="text-ink">{a.category}</dd>
        </div>
        <div>
          <dt className="label-archival text-[9.5px]">Event date</dt>
          <dd className="text-ink">{formatDate(a.eventDate)}</dd>
        </div>
      </dl>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-3">
        <ResultBadge type={a.achievementType} position={a.position} />
        <Link to={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-navy-800 hover:underline">
          View Details <ArrowRight className="size-3.5" aria-hidden />
          <span className="sr-only">: {a.eventName}</span>
        </Link>
      </div>
    </section>
  )
}
