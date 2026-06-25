'use client'

import { useRef } from 'react'

export interface ReferenceItem {
  file: File
  description: string
  role: string
}

function isImage(file: File) {
  return file.type.startsWith('image/')
}

/**
 * Append a list of references to a FormData object as `references` files plus a
 * positionally-aligned `reference_meta` JSON array. Mirrors what the backend
 * `_store_references` helper expects.
 */
export function appendReferences(form: FormData, items: ReferenceItem[]) {
  const meta = items.map(it => ({ description: it.description, role: it.role }))
  items.forEach(it => form.append('references', it.file))
  form.append('reference_meta', JSON.stringify(meta))
}

export default function ReferenceUploader({
  items,
  onChange,
  accent = 'purple',
}: {
  items: ReferenceItem[]
  onChange: (items: ReferenceItem[]) => void
  accent?: 'purple' | 'yellow'
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const next = Array.from(files).map(file => ({ file, description: '', role: '' }))
    onChange([...items, ...next])
  }

  const update = (i: number, patch: Partial<ReferenceItem>) => {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i))
  }

  const ring = accent === 'yellow' ? 'focus:border-yellow-500' : 'focus:border-purple-500'
  const border = accent === 'yellow' ? 'hover:border-yellow-500' : 'hover:border-purple-500'

  return (
    <div className="space-y-3">
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`w-full bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg p-5 text-center cursor-pointer transition-colors ${border}`}
      >
        <div className="text-gray-500 text-2xl mb-1">＋</div>
        <div className="text-gray-400 text-sm">Add reference files</div>
        <div className="text-gray-600 text-xs mt-1">
          Images, mood boards, lyrics, scripts, notes — anything that captures your idea
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.markdown,.rtf,.csv,.pdf,.doc,.docx"
        className="hidden"
        onChange={e => { addFiles(e.target.files); if (fileInputRef.current) fileInputRef.current.value = '' }}
      />

      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
              <div className="flex items-start gap-3">
                {isImage(it.file) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={URL.createObjectURL(it.file)}
                    alt={it.file.name}
                    className="w-16 h-16 object-cover rounded-md flex-shrink-0 border border-gray-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-md flex-shrink-0 border border-gray-700 bg-gray-800 flex items-center justify-center text-2xl">
                    📄
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-300 truncate">{it.file.name}</span>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="text-gray-500 hover:text-red-400 text-sm flex-shrink-0"
                      aria-label="Remove reference"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    type="text"
                    value={it.description}
                    onChange={e => update(i, { description: e.target.value })}
                    placeholder={isImage(it.file) ? 'Who or what is this? (e.g. the lead character, Mara)' : 'What is this? (e.g. handwritten lyrics, scene notes)'}
                    className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none ${ring}`}
                  />
                  <input
                    type="text"
                    value={it.role}
                    onChange={e => update(i, { role: e.target.value })}
                    placeholder="Where does it fit in the video? (e.g. opening shot, recurring symbol)"
                    className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-600 text-sm focus:outline-none ${ring}`}
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-gray-600 text-xs">
            Describing each file helps the AI lock onto your vision — and can mean fewer images to generate.
          </p>
        </div>
      )}
    </div>
  )
}
