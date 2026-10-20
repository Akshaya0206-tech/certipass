import { useMemo } from 'react'
import { Check, CircleAlert, RefreshCw } from 'lucide-react'
import { useAcademicConfig } from '../../hooks/useAcademics'
import { cn } from '../../lib/cn'
import { activeCategories } from '../../services/academicService'
import { describeAchievement } from '../../services/achievementService'
import { LIMITS, todayIso } from '../../services/achievementValidation'
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENT_TYPES, EVENT_MODES } from '../../types'
import type { AchievementCategory, AchievementFormData, FormField } from '../../types'
import { CATEGORY_ICON } from '../AchievementList'
import { Field, TextArea, TextInput } from '../ui/FormField'

export interface StepProps {
  form: AchievementFormData
  set: <K extends keyof AchievementFormData>(key: K, value: AchievementFormData[K]) => void
  /** Error for a field, once the student has tried to continue. */
  error: (field: FormField) => string | undefined
}

export const CATEGORY_HINTS: Record<AchievementCategory, string> = {
  Hackathon: 'Build events, ideathons and datathons',
  Workshop: 'Hands-on sessions, bootcamps and training',
  Internship: 'Industry or research placements',
  Competition: 'Contests, challenges and olympiads',
  Conference: 'Talks, summits, seminars and meetups',
  'Paper Presentation': 'Papers and posters you presented',
  Sports: 'Tournaments, meets and athletics',
  Cultural: 'Arts, music, theatre and quizzes',
  Other: 'Anything else worth recording',
}

export function InlineError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-3 flex items-start gap-1.5 text-[13px] text-terracotta-700">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

/** Step 1 — one category, chosen with a keyboard-accessible radio group. */
export function CategoryStep({ form, set, error }: StepProps) {
  // Categories an administrator has switched off aren't offered, unless this entry already uses one.
  const offered = activeCategories(useAcademicConfig())
  const categories = ACHIEVEMENT_CATEGORIES.filter((c) => offered.includes(c) || form.category === c)
  return (
    <div className="space-y-6">
      <fieldset aria-describedby={error('category') ? 'category-error' : undefined}>
        <legend className="sr-only">Achievement category (choose one)</legend>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => {
            const Icon = CATEGORY_ICON[c]
            const checked = form.category === c
            return (
              <label
                key={c}
                className={cn(
                  'relative flex cursor-pointer items-start gap-3 rounded-md border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lavender-500',
                  checked ? 'border-lavender-300 bg-lavender-50' : 'border-line bg-white hover:border-line-strong',
                )}
              >
                <input type="radio" name="category" value={c} checked={checked} onChange={() => set('category', c)} className="sr-only" />
                <Icon className={cn('mt-0.5 size-[18px] shrink-0', checked ? 'text-lavender-700' : 'text-ink-muted')} strokeWidth={1.6} aria-hidden />
                <span>
                  <span className="block text-[14px] font-medium text-navy-900">{c}</span>
                  <span className="block text-[12.5px] text-ink-muted">{CATEGORY_HINTS[c]}</span>
                </span>
                {checked && <Check className="absolute top-3 right-3 size-4 text-lavender-700" aria-hidden />}
              </label>
            )
          })}
        </div>
        <InlineError id="category-error" message={error('category')} />
      </fieldset>

      {form.category === 'Other' && (
        <Field label="What would you call it?" optional error={error('customCategory')} hint="A short label of your own, e.g. “Volunteering” or “Open-source contribution”.">
          <TextInput value={form.customCategory} onChange={(e) => set('customCategory', e.target.value)} maxLength={LIMITS.customCategory} className="sm:max-w-sm" />
        </Field>
      )}
    </div>
  )
}

/** Step 2 — the event. Student identity is never asked for here; it comes from the profile. */
export function EventStep({ form, set, error }: StepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Event name" required error={error('eventName')} className="sm:col-span-2">
        <TextInput value={form.eventName} onChange={(e) => set('eventName', e.target.value)} placeholder="e.g. Inter-College Coding Contest" maxLength={LIMITS.eventName} />
      </Field>
      <Field label="Organiser" required error={error('organizer')} className="sm:col-span-2" hint="The institution, club or company that ran the event.">
        <TextInput value={form.organizer} onChange={(e) => set('organizer', e.target.value)} maxLength={LIMITS.organizer} />
      </Field>
      <Field label="Event date" required error={error('eventDate')} hint="The date shown on the certificate.">
        <TextInput type="date" value={form.eventDate} max={todayIso()} onChange={(e) => set('eventDate', e.target.value)} />
      </Field>
      <Field label="Location" optional error={error('location')} hint="City or venue, if there was one.">
        <TextInput value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={LIMITS.location} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-[13px] font-medium text-ink-soft">
          Event mode <span className="font-normal text-ink-muted">(optional)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_MODES.map((m) => {
            const checked = form.eventMode === m
            return (
              <label
                key={m}
                className={cn(
                  'relative cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lavender-500',
                  checked ? 'border-lavender-300 bg-lavender-200 font-medium text-ink' : 'border-line-strong bg-white text-ink-soft hover:bg-parchment',
                )}
              >
                {/* A checkbox styled as a pill, so a choice can be undone — the field is optional. */}
                <input type="checkbox" checked={checked} onChange={() => set('eventMode', checked ? '' : m)} className="sr-only" />
                {m}
              </label>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

/** Step 3 — the result, plus a description generated from what was actually entered. */
export function ResultStep({ form, set, error }: StepProps) {
  const generated = useMemo(() => describeAchievement(form), [form])
  const description = form.descriptionEdited ? form.description : generated
  const isOther = form.achievementType === 'Other'

  return (
    <div className="space-y-6">
      <fieldset aria-describedby={error('achievementType') ? 'type-error' : undefined}>
        <legend className="mb-2.5 text-[13px] font-medium text-ink-soft">
          Achievement type <span className="text-terracotta-600" aria-hidden>*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {ACHIEVEMENT_TYPES.map((t) => {
            const checked = form.achievementType === t
            return (
              <label
                key={t}
                className={cn(
                  'relative cursor-pointer rounded-full border px-4 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-lavender-500',
                  checked ? 'border-lavender-300 bg-lavender-200 font-medium text-ink' : 'border-line-strong bg-white text-ink-soft hover:bg-parchment',
                )}
              >
                <input type="radio" name="achievementType" value={t} checked={checked} onChange={() => set('achievementType', t)} className="sr-only" />
                {t}
              </label>
            )
          })}
        </div>
        <InlineError id="type-error" message={error('achievementType')} />
      </fieldset>

      {form.achievementType && (
        <Field
          label={isOther ? 'Describe the result' : 'Prize or position'}
          required={isOther}
          optional={!isOther}
          error={error('position')}
          hint={isOther ? 'e.g. “Volunteer of the semester” or “Special mention”.' : 'A specific position, award title or prize, e.g. “First place, open track”.'}
        >
          <TextInput value={form.position} onChange={(e) => set('position', e.target.value)} maxLength={LIMITS.position} />
        </Field>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor="desc" className="text-[13px] font-medium text-ink-soft">
            Description <span className="font-normal text-ink-muted">— written from your answers; edit it if you like</span>
          </label>
          {form.descriptionEdited && (
            <button
              type="button"
              onClick={() => set('descriptionEdited', false)}
              className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-navy-800 hover:underline"
            >
              <RefreshCw className="size-3" aria-hidden /> Regenerate
            </button>
          )}
        </div>
        <TextArea
          id="desc"
          value={description}
          onChange={(e) => {
            set('descriptionEdited', true)
            set('description', e.target.value)
          }}
          rows={3}
          maxLength={LIMITS.description}
          placeholder="Enter the event details first and a description will be written for you."
          aria-invalid={error('description') ? true : undefined}
          className="bg-lavender-50/60 italic"
        />
        <p className="mt-1.5 text-[12.5px] text-ink-muted">
          {form.descriptionEdited ? 'You’ve edited this description.' : 'Built only from what you’ve entered — nothing is added or assumed.'}
        </p>
        <InlineError message={error('description')} />
      </div>
    </div>
  )
}

/** Step 4 — everything here is optional and the whole step can be skipped. */
export function AdditionalStep({ form, set, error }: StepProps) {
  return (
    <div className="space-y-5">
      <Field label="Additional notes" optional error={error('details')} hint="Team members, project title, skills used — anything worth keeping on the record.">
        <TextArea value={form.details} onChange={(e) => set('details', e.target.value)} maxLength={LIMITS.notes} rows={3} />
      </Field>
      <Field label="Prize details" optional error={error('prizeDetails')} hint="Cash prize, medal, trophy or scholarship, if any.">
        <TextArea value={form.prizeDetails} onChange={(e) => set('prizeDetails', e.target.value)} maxLength={LIMITS.notes} rows={2} />
      </Field>
      <Field label="About your certificate" optional error={error('evidenceNote')} hint="Anything worth noting about the file — e.g. “the award is on page 2”.">
        <TextArea value={form.evidenceNote} onChange={(e) => set('evidenceNote', e.target.value)} maxLength={LIMITS.notes} rows={2} />
      </Field>
    </div>
  )
}
