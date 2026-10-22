/**
 * Supporting-document content is kept in this browser's IndexedDB so faculty
 * can preview what a student attached (in the same browser). Nothing is sent
 * anywhere. Seeded demo documents carry metadata only and have no content.
 */
const DB = 'rec-od-files'
const STORE = 'files'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putFile(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blob, id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function getFile(id: string): Promise<Blob | null> {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function deleteFile(id: string): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // ignore
  }
}

export const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
}
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const MAX_FILES = 3

export function checkFile(file: File): string | null {
  if (!ALLOWED_TYPES[file.type]) return `${file.name}: only PDF, JPG or PNG files are accepted.`
  if (file.size > MAX_FILE_BYTES) return `${file.name}: the file is larger than 5 MB.`
  if (file.size === 0) return `${file.name}: the file is empty.`
  return null
}
