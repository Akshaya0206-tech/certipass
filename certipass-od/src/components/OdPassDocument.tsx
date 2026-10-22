import { QrCode } from 'lucide-react'
import { LogoMark } from './Logo'
import { departmentName } from '../data/seed'
import { dayCount, formatDate, formatRange } from '../lib/format'
import { getState } from '../services/store'
import type { OdApplication } from '../types'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-x-3 border-b border-[#e4dcec] py-2 text-[13px] sm:grid-cols-[11rem_1fr] print:py-1.5">
      <dt className="font-semibold text-[#30104f]">{label}</dt>
      <dd className="text-[#111]">{children}</dd>
    </div>
  )
}

/**
 * The printable OD pass. It is rendered only from an approved application and
 * shows only recorded facts: nothing is filled in on the approver's behalf.
 *
 * The frame stretches to a full A4 page; the signature block and footer note
 * sit at the bottom of it.
 */
export function OdPassDocument({ app }: { app: OdApplication }) {
  const decision = app.decision!
  const approver = getState().users.find((u) => u.id === decision.byId)
  const days = dayCount(app.odFrom, app.odUntil)

  return (
    <article
      aria-label={`OD pass ${app.passNumber}`}
      className="pass-sheet mx-auto flex w-full max-w-[210mm] flex-col bg-white p-3 text-[#111] shadow-pop sm:min-h-[297mm] sm:p-6 print:max-w-none"
    >
      <div className="flex flex-1 flex-col border-[1.5px] border-[#512080] p-1.5">
        <div className="flex flex-1 flex-col border border-[#d9a928] px-4 py-5 sm:px-8 sm:py-7 print:py-4">
          <header className="text-center">
            <LogoMark decorative className="mx-auto h-14 sm:h-[22mm] print:h-[20mm]" />
            <p className="pass-purple mt-3 font-serif text-xl font-bold tracking-wide text-[#30104f] sm:text-2xl print:mt-2">RAJALAKSHMI ENGINEERING COLLEGE</p>
            <p className="text-[11px] tracking-[0.14em] text-[#444] uppercase">An Autonomous Institution · Thandalam, Chennai</p>
            <div className="mx-auto my-4 h-px w-3/4 bg-[#d9a928] print:my-3" />
            <h2 className="pass-purple font-serif text-lg font-bold tracking-[0.18em] text-[#512080] sm:text-xl">ON-DUTY (OD) PASS</h2>
            <p className="mt-2 text-[13px]">
              OD Pass No. <span className="font-mono font-bold">{app.passNumber}</span>
            </p>
            <p className="text-xs text-[#444]">
              Application ID: <span className="font-mono">{app.id}</span>
            </p>
          </header>

          <section className="mt-6 print:mt-4" aria-label="Student details">
            <h3 className="pass-purple mb-1 text-[11px] font-bold tracking-[0.12em] text-[#512080] uppercase">Student</h3>
            <dl>
              <Row label="Student name">{app.studentName}</Row>
              <Row label="Register number">
                <span className="font-mono">{app.registerNo}</span>
              </Row>
              <Row label="Department">{departmentName(app.department)}</Row>
              <Row label="Year and section">
                {app.year} Year · Section {app.section}
              </Row>
            </dl>
          </section>

          <section className="mt-5 print:mt-3" aria-label="Event details">
            <h3 className="pass-purple mb-1 text-[11px] font-bold tracking-[0.12em] text-[#512080] uppercase">Event</h3>
            <dl>
              <Row label="Event name">
                <span className="font-semibold">{app.eventName}</span>
              </Row>
              <Row label="Organiser">{app.organizer}</Row>
              <Row label="Event venue">{app.venue}</Row>
              <Row label="Event dates">{formatRange(app.eventStart, app.eventEnd)}</Row>
            </dl>
          </section>

          <section className="mt-5 print:mt-3" aria-label="Approved OD period">
            <h3 className="pass-purple mb-1 text-[11px] font-bold tracking-[0.12em] text-[#512080] uppercase">Approved OD</h3>
            <dl>
              <Row label="OD period">
                <span className="font-semibold">{formatRange(app.odFrom, app.odUntil)}</span> ({days} {days === 1 ? 'day' : 'days'})
              </Row>
              <Row label="Approval date">{formatDate(decision.at)}</Row>
              <Row label="Approved by">
                {decision.byName}
                {approver?.designation && <span className="text-[#444]">, {approver.designation}</span>}
              </Row>
            </dl>
          </section>

          <p className="mt-5 text-[12px] leading-relaxed text-[#333] print:mt-3">
            The student named above is permitted On-Duty leave for the period stated to attend the event listed. Attendance for these dates is to be marked as On-Duty by the concerned class advisor.
          </p>

          <div className="mt-auto pt-8 print:pt-5">
            <footer className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="h-16 border-b border-[#111] print:h-12" />
                <p className="mt-1 text-[11px] text-[#333]">Authorised signatory (signature and seal, applied after printing)</p>
                <p className="text-[12px] font-semibold">{decision.byName}</p>
              </div>
              <div className="flex w-32 flex-col items-center">
                <div className="flex size-28 flex-col items-center justify-center border border-dashed border-[#999] p-2 text-center" role="img" aria-label="Verification QR not available in this prototype">
                  <QrCode className="size-7 text-[#999]" aria-hidden />
                  <span className="mt-1 text-[9px] leading-tight text-[#555]">QR verification unavailable in this prototype</span>
                </div>
              </div>
            </footer>

            <div className="mx-auto mt-6 h-px w-full bg-[#d9a928] print:mt-4" />
            <p className="mt-2 text-center text-[10px] text-[#555]">Generated from application {app.id}, approved on {formatDate(decision.at)}. Demo document: not valid for real attendance.</p>
          </div>
        </div>
      </div>
    </article>
  )
}
