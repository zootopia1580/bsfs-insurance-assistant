import { useAppStore } from '../../store'
import { CF_META, CF_ORDER, type CFId } from './cfMeta'
import { IF_SCRIPTS } from '../Guide/ifScripts'
import type { MDStage } from '../../types'

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// MD별 짧은 라벨 (사이드바용 1~2단어)
const MD_SHORT: Record<string, string> = {
  'MD1-1': '인사',
  'MD1-2': '건수 확인',
  'MD1-3': '걱정 파악',
  'MD1-4': '분석 예고',
  'MD2-1': '보험 현황',
  'MD2-2': '3대 수치',
  'MD2-3a': '담보 상세',
  'MD2-4': '처리 방향',
  'MD2-5': '현황 요약',
  'MD2-6': '해약환급금',
  'MD2-7': '특약 삭제',
  'MD3-1': '추가 정보',
  'MD3-2': '설계 공개',
  'MD3-3': 'A/B 선택',
  'MD4-2': '심사 제출',
  'MD4-3': '전자서명',
  'MD4-4': '최종 확인',
  'MD5-1': '해지 안내',
  'MD5-2': '팔로업',
}

export function ScriptNav() {
  const { currentCF, currentMD, goToMD, goToCF } = useAppStore()
  const currentCFIndex = CF_ORDER.indexOf(currentCF as CFId)

  return (
    <aside className="w-44 flex-shrink-0 flex flex-col overflow-y-auto" style={{ background: '#0c1322', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
      {/* 헤더 */}
      <div className="px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">상담 흐름</p>
      </div>

      {/* 타임라인 네비게이션 */}
      <nav className="flex-1 py-3 px-3">
        <div className="relative">
          {/* 수직 연결선 */}
          <div className="absolute left-[13px] top-4 bottom-4 w-px bg-slate-800" />

          {CF_ORDER.map((cfId, cfIdx) => {
            const meta = CF_META[cfId as CFId]
            const isActiveCF = cfId === currentCF
            const isDoneCF = cfIdx < currentCFIndex
            const isUpcomingCF = cfIdx > currentCFIndex

            return (
              <div key={cfId} className="relative mb-1">
                {/* CF 버튼 */}
                <button
                  onClick={() => {
                    goToCF(cfId as CFId)
                    scrollToId(`cf-${cfId}`)
                  }}
                  className={`relative z-10 w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-all duration-150 ${
                    isActiveCF
                      ? 'bg-blue-950/50'
                      : isDoneCF
                      ? 'hover:bg-slate-800/30'
                      : 'hover:bg-slate-800/20'
                  }`}
                >
                  {/* 상태 점 */}
                  <div className={`relative z-10 w-[14px] h-[14px] rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold transition-all duration-150 ${
                    isActiveCF
                      ? 'bg-blue-600 ring-2 ring-blue-600/30 ring-offset-1 ring-offset-slate-950'
                      : isDoneCF
                      ? 'bg-slate-700'
                      : 'bg-slate-800 border border-slate-700'
                  }`}>
                    {isDoneCF && <span className="text-slate-400 text-[7px]">✓</span>}
                    {!isDoneCF && !isActiveCF && (
                      <span className="text-slate-600">{cfIdx + 1}</span>
                    )}
                    {isActiveCF && <span className="text-white">{cfIdx + 1}</span>}
                  </div>

                  {/* CF 텍스트 */}
                  <div className="min-w-0 flex-1">
                    <div className={`text-[10px] font-bold truncate ${
                      isActiveCF ? 'text-blue-300' : isDoneCF ? 'text-slate-600' : 'text-slate-500'
                    }`}>
                      {meta.label}
                    </div>
                    <div className={`text-[9px] ${isActiveCF ? 'text-blue-600' : 'text-slate-700'}`}>
                      {cfId}
                    </div>
                  </div>
                </button>

                {/* MD 목록 — 현재 CF와 완료 CF에 표시 */}
                {!isUpcomingCF && (
                  <div className="ml-[27px] mt-0.5 mb-1.5 space-y-0.5">
                    {(meta.mds as readonly string[]).map((mdId) => {
                      const isCurrent = mdId === currentMD
                      const mdsArr = meta.mds as readonly string[]
                      const mdIdx = mdsArr.indexOf(mdId)
                      const currentMDIdx = mdsArr.indexOf(currentMD)
                      const isDoneMD = isDoneCF || (isActiveCF && mdIdx < currentMDIdx)
                      const mdMeta = IF_SCRIPTS[mdId]

                      return (
                        <button
                          key={mdId}
                          onClick={() => {
                            goToMD(mdId as MDStage)
                            scrollToId(`md-${mdId}`)
                          }}
                          title={mdMeta?.purpose}
                          className={`w-full text-left px-2 py-1 rounded-md text-[10px] transition-all duration-150 flex items-center gap-1.5 ${
                            isCurrent
                              ? 'bg-blue-900/50 text-blue-300 font-semibold'
                              : isDoneMD
                              ? 'text-slate-700 hover:text-slate-500 hover:bg-slate-800/30'
                              : 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/20'
                          }`}
                        >
                          {isCurrent && (
                            <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                          )}
                          {!isCurrent && isDoneMD && (
                            <span className="w-1 h-1 rounded-full bg-slate-700 flex-shrink-0" />
                          )}
                          {!isCurrent && !isDoneMD && (
                            <span className="w-1 h-1 rounded-full bg-slate-800 flex-shrink-0" />
                          )}
                          <span className="truncate">
                            {MD_SHORT[mdId] ?? mdId}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* 다가오는 CF — MD 숨김, 자리 표시만 */}
                {isUpcomingCF && (
                  <div className="ml-[27px] mt-0.5 mb-1.5">
                    <p className="text-[9px] text-slate-800 px-2 py-0.5 truncate">{meta.mds.length}단계</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </nav>

      {/* 현재 MD 요약 푸터 */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-[9px] text-slate-600 uppercase tracking-wider font-bold mb-1">현재</p>
        <p className="text-[10px] text-slate-400 font-medium">{currentMD}</p>
        {IF_SCRIPTS[currentMD] && (
          <p className="text-[9px] text-slate-600 leading-snug mt-0.5 line-clamp-2">
            {IF_SCRIPTS[currentMD].purpose}
          </p>
        )}
      </div>
    </aside>
  )
}
