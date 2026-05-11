import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useAppStore } from '../../store'
import { CF_ORDER } from '../Script/cfMeta'
import { firstName } from '../../utils'

interface Props {
  children: ReactNode
}

export function MainLayout({ children }: Props) {
  const { currentCF, currentMD, customerData, consultantName, setConsultantName } = useAppStore()
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(consultantName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) inputRef.current?.select()
  }, [editingName])

  function commitName() {
    const trimmed = draft.trim()
    if (trimmed) setConsultantName(trimmed)
    else setDraft(consultantName)
    setEditingName(false)
  }

  const cfIndex = CF_ORDER.indexOf(currentCF as typeof CF_ORDER[number])

  return (
    <div className="flex h-screen overflow-hidden flex-col" style={{ background: '#080e1c' }}>
      {/* 상단 헤더 */}
      <header className="h-11 flex items-center px-5 flex-shrink-0 gap-4" style={{ background: '#0c1322', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-semibold text-slate-300">상담 어시스턴트</span>
        </div>

        {customerData && (
          <>
            <div className="h-4 w-px bg-slate-700" />
            <span className="text-sm text-slate-400">{firstName(customerData.info.name)}님</span>

            {/* 진행률 바 */}
            <div className="flex items-center gap-1.5 ml-2">
              {CF_ORDER.map((cf, i) => (
                <div
                  key={cf}
                  className={`h-1.5 rounded-full transition-all ${
                    i < cfIndex
                      ? 'w-6 bg-blue-500'
                      : i === cfIndex
                      ? 'w-8 bg-blue-400'
                      : 'w-4 bg-slate-700'
                  }`}
                  title={cf}
                />
              ))}
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* 상담사 이름 설정 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-600">상담사</span>
            {editingName ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName()
                  if (e.key === 'Escape') { setDraft(consultantName); setEditingName(false) }
                }}
                className="w-20 text-xs bg-slate-800 border border-blue-600 rounded px-1.5 py-0.5 text-white focus:outline-none"
              />
            ) : (
              <button
                onClick={() => { setDraft(consultantName); setEditingName(true) }}
                className="text-xs text-slate-300 hover:text-white rounded px-1.5 py-0.5 transition-colors duration-150"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                title="상담사 이름 변경"
              >
                {consultantName}
              </button>
            )}
          </div>

          <div className="h-3.5 w-px bg-slate-700" />

          <span className="text-xs font-medium text-blue-400 bg-blue-950/50 border border-blue-800/50 px-2 py-0.5 rounded">
            {currentCF}
          </span>
          <span className="text-xs text-slate-500">/</span>
          <span className="text-xs text-slate-400">{currentMD}</span>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
