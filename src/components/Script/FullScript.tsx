import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { CF_META, CF_ORDER, MD_VARIANTS, RESISTANCE_BRANCHES, BRANCH_LABELS, type CFId } from './cfMeta'
import { IF_SCRIPTS } from '../Guide/ifScripts'
import type { MDStage, RiderWithEffect } from '../../types'
import { firstName } from '../../utils'

// ── 모듈 레벨 상수 ─────────────────────────────────────────────────────────────
const REASON_LABEL: Record<string, string> = {
  '유효': '✓ 유효',
  '갱신형': '✗ 갱신형 (실질 0원)',
  '협소범위': '✗ 협소범위 (실질 0원)',
  'CI/GI구조': '✗ CI/GI구조 (실질 0원)',
  '만기단기': '✗ 만기 짧음 (실질 0원)',
  '해당없음': '✗ 해당없음 (실질 0원)',
}

const DIRECTION_LABEL: Record<string, string> = { keep: '유지', terminate: '정리', adjust: '일부 조정' }

function buildRiderList(riders: RiderWithEffect[]): string {
  if (!riders.length) return '해당 담보 없음'
  return riders.map(r => {
    const label = REASON_LABEL[r.effectReason] ?? r.effectReason
    const amtStr = r.effectiveAmount > 0
      ? `${r.effectiveAmount.toLocaleString()}만`
      : `${r.amount.toLocaleString()}만 → ${label}`
    return `• ${r.name} ${amtStr}`
  }).join('\n')
}

// ── Design tokens ──────────────────────────────────────────────────────────────
type Status = 'current' | 'done' | 'upcoming'

const CARD_STYLE: Record<Status, React.CSSProperties> = {
  current:  { background: '#162032', boxShadow: '0 4px 20px rgba(0,0,0,0.55), 0 0 0 1px rgba(59,130,246,0.18)' },
  done:     { background: 'rgba(255,255,255,0.02)', boxShadow: 'none' },
  upcoming: { background: 'rgba(255,255,255,0.025)', boxShadow: 'none' },
}

const card: Record<Status, string> = {
  current:  '',
  done:     'opacity-35',
  upcoming: 'opacity-55',
}

const bodyText: Record<Status, string> = {
  current:  'text-slate-200',
  done:     'text-slate-500',
  upcoming: 'text-slate-500',
}

// ── CopyButton ─────────────────────────────────────────────────────────────────
interface CopyButtonProps {
  copyId: string
  activeCopyId: string | null
  onCopy: () => void
  accent?: 'blue' | 'orange'
}
function CopyButton({ copyId, activeCopyId, onCopy, accent = 'blue' }: CopyButtonProps) {
  const copied = activeCopyId === copyId
  return (
    <button
      onClick={onCopy}
      className={`mt-1.5 text-[11px] font-medium transition-colors duration-150 ${
        copied
          ? 'text-emerald-400'
          : accent === 'orange'
          ? 'text-slate-600 hover:text-orange-400'
          : 'text-slate-600 hover:text-blue-400'
      }`}
    >
      {copied ? '복사됨 ✓' : '복사'}
    </button>
  )
}

// ── ScriptContent ──────────────────────────────────────────────────────────────
interface ScriptItem { label?: string; text: string }

interface ScriptContentProps {
  scripts: ScriptItem[]
  mdId: string
  status: Status
  activeCopyId: string | null
  onCopy: (text: string, id: string) => void
  fillVariables: (text: string) => string
  accent?: 'blue' | 'orange'
}
function ScriptContent({ scripts, mdId, status, activeCopyId, onCopy, fillVariables, accent }: ScriptContentProps) {
  return (
    <div className="px-4 py-3 space-y-4">
      {scripts.map((item, idx) => {
        const copyId = `${mdId}-${idx}`
        return (
          <div key={idx}>
            {item.label && (
              <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
                {item.label}
              </span>
            )}
            <p className={`text-sm leading-relaxed whitespace-pre-line ${bodyText[status]}`}>
              {fillVariables(item.text)}
            </p>
            <CopyButton
              copyId={copyId}
              activeCopyId={activeCopyId}
              onCopy={() => onCopy(item.text, copyId)}
              accent={accent}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── BranchCard ─────────────────────────────────────────────────────────────────
interface BranchCardProps {
  branchId: string
  isActive: boolean
  onToggle: () => void
  activeCopyId: string | null
  onCopy: (text: string, id: string) => void
  fillVariables: (text: string) => string
}
function BranchCard({ branchId, isActive, onToggle, activeCopyId, onCopy, fillVariables }: BranchCardProps) {
  const script = IF_SCRIPTS[branchId]
  return (
    <div
      className="rounded-[14px] transition-all duration-200 overflow-hidden"
      style={isActive
        ? { background: 'rgba(154,52,18,0.12)', boxShadow: '0 2px 10px rgba(0,0,0,0.4), 0 0 0 1px rgba(234,88,12,0.22)' }
        : { background: 'rgba(255,255,255,0.025)', boxShadow: '0 0 0 1px rgba(255,255,255,0.05)' }
      }
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 transition-colors duration-150 ${
            isActive ? 'bg-orange-600 text-white' : 'bg-slate-700/60 text-slate-500'
          }`}
        >
          IF
        </span>
        <span className={`text-xs font-medium flex-1 min-w-0 transition-colors duration-150 ${
          isActive ? 'text-orange-300' : 'text-slate-400'
        }`}>
          {BRANCH_LABELS[branchId] ?? branchId}
        </span>
        <span className="text-[10px] text-slate-700 flex-shrink-0 mr-1">{branchId}</span>
        <span className={`text-xs transition-transform duration-200 ${isActive ? 'text-orange-500 rotate-180' : 'text-slate-600'}`}>
          ▾
        </span>
      </button>

      {isActive && script && (
        <div className="animate-in">
          <div className="px-3.5 pb-1 border-t border-orange-800/20 pt-2">
            <p className="text-[10px] text-orange-400/60">{script.purpose}</p>
          </div>
          <ScriptContent
            scripts={script.scripts}
            mdId={branchId}
            status="current"
            activeCopyId={activeCopyId}
            onCopy={onCopy}
            fillVariables={fillVariables}
            accent="orange"
          />
        </div>
      )}
    </div>
  )
}

// ── MDCard ─────────────────────────────────────────────────────────────────────
interface MDCardProps {
  mdId: string
  status: Status
  onGoTo: () => void
  onAdvance?: () => void
  activeCopyId: string | null
  onCopy: (text: string, id: string) => void
  fillVariables: (text: string) => string
  mdRef?: React.Ref<HTMLDivElement>
  activeBranch: string | null
  onSetBranch: (id: string | null) => void
}
function MDCard({ mdId, status, onGoTo, onAdvance, activeCopyId, onCopy, fillVariables, mdRef, activeBranch, onSetBranch }: MDCardProps) {
  const script = IF_SCRIPTS[mdId]
  const isCurrent = status === 'current'
  const variants = MD_VARIANTS[mdId] ?? []

  return (
    <div ref={mdRef}>
      <div className={`rounded-[14px] transition-all duration-150 overflow-hidden ${card[status]}`} style={CARD_STYLE[status]}>
        {/* MD 헤더 */}
        <div className={`flex items-center gap-3 px-4 pt-3 pb-2.5 ${
          isCurrent ? 'border-b border-blue-700/20' : script ? 'border-b border-slate-700/10' : ''
        }`}>
          <button
            onClick={onGoTo}
            className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors duration-150 ${
              isCurrent
                ? 'bg-blue-600 text-white'
                : status === 'done'
                ? 'bg-slate-700/40 text-slate-500'
                : 'bg-slate-700/25 text-slate-600 hover:bg-slate-700/50 hover:text-slate-400'
            }`}
          >
            {mdId}
          </button>
          <div className="flex-1 min-w-0">
            {script && (
              <p className={`text-xs leading-snug ${
                isCurrent ? 'text-blue-200/75 font-medium' : 'text-slate-600'
              }`}>
                {script.purpose}
              </p>
            )}
          </div>
          {isCurrent && onAdvance && (
            <button
              onClick={onAdvance}
              className="flex-shrink-0 text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors duration-150 ml-1"
            >
              다음 →
            </button>
          )}
        </div>

        {/* 스크립트 */}
        {script && (
          <ScriptContent
            scripts={script.scripts}
            mdId={mdId}
            status={status}
            activeCopyId={activeCopyId}
            onCopy={onCopy}
            fillVariables={fillVariables}
          />
        )}
      </div>

      {/* IF 분기 변형 */}
      {variants.length > 0 && (
        <div className="mt-2 pl-5 space-y-1.5">
          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-1.5">
            IF — 상황별 대응
          </p>
          {variants.map((branchId) => (
            <BranchCard
              key={branchId}
              branchId={branchId}
              isActive={activeBranch === branchId}
              onToggle={() => onSetBranch(activeBranch === branchId ? null : branchId)}
              activeCopyId={activeCopyId}
              onCopy={onCopy}
              fillVariables={fillVariables}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── CFHeader ───────────────────────────────────────────────────────────────────
interface CFHeaderProps {
  cfId: string
  cfIdx: number
  cfStatus: Status
  meta: typeof CF_META[CFId] & { customerState?: string; counselorFocus?: string }
}
function CFHeader({ cfId, cfIdx, cfStatus, meta }: CFHeaderProps) {
  return (
    <div
      className="rounded-[14px] px-5 py-4 transition-all duration-200"
      style={cfStatus === 'current'
        ? { background: 'rgba(30,58,138,0.25)', boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.18)' }
        : cfStatus === 'done'
        ? { background: 'rgba(255,255,255,0.025)', boxShadow: 'none', opacity: 0.6 }
        : { background: 'rgba(255,255,255,0.015)', boxShadow: 'none', opacity: 0.7 }
      }
    >
      {/* 제목 행 */}
      <div className="flex items-center gap-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all duration-200 ${
          cfStatus === 'current'
            ? 'bg-blue-600 text-white ring-2 ring-blue-600/25'
            : cfStatus === 'done'
            ? 'bg-slate-700/50 text-slate-500'
            : 'bg-slate-800/60 text-slate-600 border border-slate-700/40'
        }`}>
          {cfStatus === 'done' ? '✓' : cfIdx + 1}
        </div>
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={`text-[10px] font-bold tracking-widest flex-shrink-0 ${
            cfStatus === 'current' ? 'text-blue-500' : 'text-slate-600'
          }`}>
            {cfId}
          </span>
          <h2 className={`text-sm font-bold truncate ${
            cfStatus === 'current' ? 'text-white' : cfStatus === 'done' ? 'text-slate-500' : 'text-slate-600'
          }`}>
            {meta.label}
          </h2>
        </div>
      </div>

      {/* 현재 CF — 확장 상세 */}
      {cfStatus === 'current' && (
        <div className="mt-3 pl-10 space-y-2.5 animate-in">
          <p className="text-xs text-slate-300 leading-relaxed">{meta.purpose}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-0.5">고객 상태</p>
              <p className="text-[11px] text-slate-400 leading-snug">{meta.customerState}</p>
            </div>
            <div>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest font-bold mb-0.5">상담사 초점</p>
              <p className="text-[11px] text-slate-400 leading-snug">{meta.counselorFocus}</p>
            </div>
          </div>
          <div className="pt-2 border-t border-blue-800/25 flex items-start gap-2">
            <span className="text-[9px] text-blue-500 font-bold uppercase tracking-widest flex-shrink-0 mt-px">목표</span>
            <span className="text-[11px] text-blue-300/60 leading-snug">{meta.goal}</span>
          </div>
        </div>
      )}
      {cfStatus === 'done' && (
        <p className="pl-10 mt-1.5 text-[11px] text-slate-600 truncate">{meta.purpose}</p>
      )}
      {cfStatus === 'upcoming' && (
        <p className="pl-10 mt-1.5 text-[11px] text-slate-700 truncate">{meta.purpose}</p>
      )}
    </div>
  )
}

// ── FullScript ─────────────────────────────────────────────────────────────────
export function FullScript() {
  const {
    currentCF, currentMD, activeBranch, setActiveBranch,
    advanceMD, goToMD, customerData, newPlanData, newPlanB, consultantName,
  } = useAppStore()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const currentMDRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const currentCFIndex = CF_ORDER.indexOf(currentCF as CFId)

  // 현재 MD로 스크롤 — sticky 헤더 높이를 계산해 그 아래에 표시
  useEffect(() => {
    const mdEl = currentMDRef.current
    const container = scrollContainerRef.current
    if (!mdEl || !container) return

    requestAnimationFrame(() => {
      const section = mdEl.closest('section')
      const stickyEl = section?.querySelector('[data-sticky-header]') as HTMLElement | null
      const stickyHeight = stickyEl?.offsetHeight ?? 100

      const containerRect = container.getBoundingClientRect()
      const mdTop = mdEl.getBoundingClientRect().top - containerRect.top + container.scrollTop

      container.scrollTo({
        top: mdTop - stickyHeight - 16,
        behavior: 'smooth',
      })
    })
  }, [currentMD])

  function fillVariables(text: string): string {
    const info = customerData?.info
    const analysis = customerData?.analysis
    if (!info || !analysis) return text

    // 보험사 목록 (중복 제거, "삼성화재, 한화생명, ..." 형태)
    const companyList = [...new Set(customerData.contracts.map(c => c.companyName).filter(Boolean))].join(', ')

    // 계약별 처리 방향 요약
    const contractDecisions = analysis.decisions.map(d => {
      const c = customerData.contracts.find(ct => ct.id === d.contractId)
      if (!c) return ''
      const dir = DIRECTION_LABEL[d.direction] ?? d.direction
      return `${c.companyName} ${c.productName} — 월 ${c.monthlyPremium.toLocaleString()}원 → ${dir}\n${d.reason}`
    }).filter(Boolean).join('\n\n')

    return text
      .replace(/{이름}/g, firstName(info.name))
      .replace(/{상담사}/g, consultantName)
      .replace(/{보험사목록}/g, companyList || '[보험사 정보 없음]')
      .replace(/{월보험료}/g, analysis.effectiveMonthlyPremium.toLocaleString())
      .replace(/{보험수}/g, customerData.contracts.length.toString())
      .replace(/{암실질}/g, analysis.coverage.cancerActual.toLocaleString())
      .replace(/{뇌실질}/g, analysis.coverage.brainActual.toLocaleString())
      .replace(/{심장실질}/g, analysis.coverage.heartActual.toLocaleString())
      .replace(/{암담보목록}/g, buildRiderList(analysis.breakdown.cancer))
      .replace(/{뇌담보목록}/g, buildRiderList(analysis.breakdown.brain))
      .replace(/{심담보목록}/g, buildRiderList(analysis.breakdown.heart))
      .replace(/{계약별처리방향}/g, contractDecisions || '[분석 결과 없음]')
      .replace(/{새월보험료}/g, newPlanData?.totalMonthlyPremium.toLocaleString() ?? '[새설계안 미입력]')
      .replace(/{새암진단금}/g, newPlanData?.coverageCancer.toLocaleString() ?? '[새설계안 미입력]')
      .replace(/{새뇌진단금}/g, newPlanData?.coverageBrain.toLocaleString() ?? '[새설계안 미입력]')
      .replace(/{새심장진단금}/g, newPlanData?.coverageHeart.toLocaleString() ?? '[새설계안 미입력]')
      .replace(/{새보험사}/g, newPlanData?.contracts.map(c => c.companyName).join(', ') ?? '[새설계안 미입력]')
      .replace(/{B안월보험료}/g, newPlanB?.totalMonthlyPremium.toLocaleString() ?? '[B안 미입력]')
      .replace(/{B안암진단금}/g, newPlanB?.coverageCancer.toLocaleString() ?? '[B안 미입력]')
      .replace(/{B안보험사}/g, newPlanB?.contracts.map(c => c.companyName).join(', ') ?? '[B안 미입력]')
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(fillVariables(text))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  function getMDStatus(cfId: CFId, mdId: string): Status {
    const cfIdx = CF_ORDER.indexOf(cfId)
    if (cfIdx < currentCFIndex) return 'done'
    if (cfIdx > currentCFIndex) return 'upcoming'
    const mds = CF_META[cfId].mds as readonly string[]
    const mdIdx = mds.indexOf(mdId)
    const curIdx = mds.indexOf(currentMD)
    if (mdId === currentMD) return 'current'
    if (mdIdx < curIdx) return 'done'
    return 'upcoming'
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto" style={{ background: '#080e1c' }}>
      <div className="max-w-2xl mx-auto py-8 px-6">
        {CF_ORDER.map((cfId, cfIdx) => {
          const meta = CF_META[cfId as CFId] as typeof CF_META[typeof cfId] & {
            customerState?: string; counselorFocus?: string
          }
          const cfStatus: Status = cfIdx < currentCFIndex ? 'done' : cfIdx === currentCFIndex ? 'current' : 'upcoming'

          return (
            <section key={cfId} id={`cf-${cfId}`}>
              {/* CF 헤더 — sticky, data 속성으로 높이 측정 */}
              <div
                data-sticky-header
                className={`sticky top-0 z-10 pb-3 ${cfIdx > 0 ? 'pt-4 border-t border-white/[0.04]' : 'pt-6'}`} style={{ background: '#080e1c' }}
              >
                <CFHeader cfId={cfId} cfIdx={cfIdx} cfStatus={cfStatus} meta={meta} />
              </div>

              {/* MD 블록 목록 */}
              <div className="space-y-2.5 px-0.5 pb-8">
                {(meta.mds as readonly string[]).map((mdId) => {
                  const status = getMDStatus(cfId as CFId, mdId)
                  return (
                    <MDCard
                      key={mdId}
                      mdId={mdId}
                      status={status}
                      onGoTo={() => goToMD(mdId as MDStage)}
                      onAdvance={status === 'current' ? advanceMD : undefined}
                      activeCopyId={copiedId}
                      onCopy={handleCopy}
                      fillVariables={fillVariables}
                      mdRef={status === 'current' ? currentMDRef : undefined}
                      activeBranch={activeBranch}
                      onSetBranch={setActiveBranch}
                    />
                  )
                })}

                {/* CF4 저항 분기 모음 */}
                {cfId === 'CF4' && (
                  <div className="mt-2 pt-4 border-t border-slate-800/40">
                    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2.5">
                      IF 저항 분기 — 고객 반응에 따라 선택
                    </p>
                    <div className="space-y-1.5">
                      {RESISTANCE_BRANCHES.map((branchId) => (
                        <BranchCard
                          key={branchId}
                          branchId={branchId}
                          isActive={activeBranch === branchId}
                          onToggle={() => setActiveBranch(activeBranch === branchId ? null : branchId)}
                          activeCopyId={copiedId}
                          onCopy={handleCopy}
                          fillVariables={fillVariables}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )
        })}

        {/* 하단 여백 */}
        <div className="h-16" />
      </div>
    </div>
  )
}
