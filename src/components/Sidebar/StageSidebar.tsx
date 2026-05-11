import type { CFStage } from '../../types'

interface Props {
  currentCF: CFStage
  currentMD: string
}

const CF_STAGES = [
  { id: 'CF1', label: '신뢰 형성', mds: ['MD1-1', 'MD1-2', 'MD1-3', 'MD1-4'] },
  { id: 'CF2', label: '문제 인식', mds: ['MD2-1', 'MD2-2', 'MD2-3', 'MD2-4', 'MD2-5'] },
  { id: 'CF3', label: '솔루션 확정', mds: ['MD3-1', 'MD3-2', 'MD3-3'] },
  { id: 'CF4', label: '조율 & 확정', mds: ['MD4-2', 'MD4-3'] },
  { id: 'CF5', label: '클로징', mds: ['MD5-1', 'MD5-2'] },
]

const CF_ORDER = ['CF1', 'CF2', 'CF3', 'CF4', 'CF5']

export function StageSidebar({ currentCF, currentMD }: Props) {
  const currentCFIndex = CF_ORDER.indexOf(currentCF)

  return (
    <aside className="w-48 bg-slate-900 border-r border-slate-800 flex flex-col py-4 flex-shrink-0">
      <div className="px-4 mb-6">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">상담 단계</h2>
      </div>

      <nav className="flex-1 px-2 space-y-1">
        {CF_STAGES.map((stage, idx) => {
          const isActive = stage.id === currentCF
          const isCompleted = idx < currentCFIndex
          const isPending = idx > currentCFIndex

          return (
            <div key={stage.id} className="mb-3">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    : isCompleted
                    ? 'text-slate-500'
                    : 'text-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                      ? 'bg-slate-600 text-slate-400'
                      : 'bg-slate-800 text-slate-600 border border-slate-700'
                  }`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <span className="truncate">{stage.label}</span>
              </div>

              {isActive && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {stage.mds.map((md) => (
                    <div
                      key={md}
                      className={`px-3 py-1 text-xs rounded ${
                        md === currentMD
                          ? 'text-blue-300 bg-blue-900/30'
                          : 'text-slate-600'
                      }`}
                    >
                      {md}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
