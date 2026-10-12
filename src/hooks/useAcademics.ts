import { useMemo } from 'react'
import { getAcademicConfig } from '../services/academicService'
import { useStore } from '../services/store'

/** The current academic configuration (re-renders when an administrator changes it). */
export function useAcademicConfig() {
  const config = useStore((s) => s.config)
  return useMemo(() => getAcademicConfig({ config }), [config])
}
