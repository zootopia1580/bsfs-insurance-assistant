import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { CF_META, CF_ORDER, MD_VARIANTS, RESISTANCE_BRANCHES, BRANCH_LABELS, type CFId } from './cfMeta'
import { IF_SCRIPTS } from '../Guide/ifScripts'
import type { MDStage, RiderWithEffect, InsuranceContract } from '../../types'
import { firstName } from '../../utils'

// ── 모듈 레벨 상수 ─────────────────────────────────────────────────────────────
const DIRECTION_LABEL: Record<string, string> = { keep: '유지', terminate: '정리', adjust: '일부 조정' }

// 보험사 단축명
const COMPANY_SHORT: Record<string, string> = {
  '삼성화재': '삼성화재', 'DB손해보험': 'DB손보', 'KB손해보험': 'KB손보',
  '현대해상': '현대해상', '메리츠화재': '메리츠', '미래에셋생명': '미래에셋',
  '동양생명': '동양', '우체국보험': '우체국', 'AIA생명': 'AIA',
  '한화생명': '한화', '교보생명': '교보', '흥국화재': '흥국',
  '롯데손해보험': '롯데손보', '삼성생명': '삼성생명',
}

// 보험사 고객센터 번호
const PHONE_MAP: Record<string, string> = {
  '삼성화재': '1588-5114', '현대해상': '1588-5656', 'DB손해보험': '1588-0100',
  '메리츠화재': '1566-7711', '롯데손해보험': '1588-3344', '우체국보험': '1588-1900',
  'AIA생명': '1588-9898', '흥국화재': '1688-1688', '동양생명': '1577-1004',
  'KB손해보험': '1544-0114', '미래에셋생명': '1588-0220', '삼성생명': '1588-3114',
  '한화생명': '1588-2488', '교보생명': '1588-1001',
}

// 상품명 단축 (브랜드명/불필요 접두어 제거)
function shortProductName(productName: string, companyName?: string): string {
  let s = productName
  if (companyName) s = s.replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
  return s
    .replace(/^\(무\)\s*/, '').replace(/^무배당\s*/, '')
    .replace(/무해지환급형?\s*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 18) || productName.slice(0, 18)
}

// 한국어 종성 여부 → 은/는, 이랑/랑 조사 선택
function hasJongseong(word: string): boolean {
  const last = word.trim().at(-1)
  if (!last) return false
  const code = last.charCodeAt(0)
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 !== 0
  return false
}
const eunNeun  = (w: string) => hasJongseong(w) ? '은' : '는'
const irangRang = (w: string) => hasJongseong(w) ? '이랑' : '랑'

// 담보목록 카톡 발화 빌더
function buildRiderNarrative(
  riders: RiderWithEffect[],
  contracts: InsuranceContract[],
  catLabel: '암' | '뇌혈관' | '허혈심장',
  effectiveTotal: number,
): string {
  if (!riders.length) return `결국 실질 ${catLabel} 진단금은 0원이에요.`

  const getContract = (id: string) => contracts.find(c => c.id === id)

  // 계약별 단축 표시명 생성
  const contractIds = [...new Set(riders.map(r => r.contractId))]
  const companyCountMap: Record<string, number> = {}
  contractIds.forEach(id => {
    const co = getContract(id)?.companyName ?? ''
    companyCountMap[co] = (companyCountMap[co] ?? 0) + 1
  })

  function shortName(contractId: string): string {
    const c = getContract(contractId)
    if (!c) return contractId
    const base = COMPANY_SHORT[c.companyName] ?? c.companyName
    if (companyCountMap[c.companyName] > 1) {
      // 같은 보험사 계약이 여러 개 → 상품명 약어 추가
      const abbr = c.productName
        .replace(/^\(무\)\s*/, '').replace(/무배당\s*/,'').replace(/무해지환급형?\s*/,'')
        .replace(c.companyName, '')
        .replace(/비갱신|건강보험|실손|의료|종신|어린이|손해|생명|화재/g, '')
        .replace(/\s+/g, ' ').trim().slice(0, 8)
      if (abbr.length > 1) return `${base} ${abbr}`
    }
    return base
  }

  const lines: string[] = []

  // ── 1) 유효 담보 (✅) ──────────────────────────────────────────────
  const effective = riders.filter(r => r.effectReason === '유효' && r.effectiveAmount > 0)
  effective.forEach(r => {
    const sn = shortName(r.contractId)
    const expiryStr = r.expiryAge >= 8000 ? '종신' : `${r.expiryAge}세`
    lines.push(`${sn} ${r.name}에 ${r.effectiveAmount.toLocaleString()}만원이 있어요. 비갱신 ${expiryStr}라 실제로 작동해요. ✅`)
  })

  // ── 2) 부분인정 담보 (⚠️ 보장기간공백) ─────────────────────────────
  const partial = riders.filter(r => r.effectReason === '보장기간공백' && r.effectiveAmount > 0)
  partial.forEach(r => {
    const sn = shortName(r.contractId)
    lines.push(`${sn} ${r.name}${eunNeun(r.name)} ${r.expiryAge}세 만기예요. ${r.expiryAge}세까지 ${r.effectiveAmount.toLocaleString()}만원 부분 인정이에요. ⚠️`)
  })

  // ── 3) 실질 0원 담보 — 계약별 묶기 후 같은 사유 합산 ────────────────
  const ineffective = riders.filter(r => r.effectiveAmount === 0)

  // 계약별 그룹화
  type ContractGroup = { sn: string; riders: RiderWithEffect[]; reason: string; expiryAge: number }
  const byContract: Record<string, ContractGroup> = {}
  ineffective.forEach(r => {
    if (!byContract[r.contractId]) {
      byContract[r.contractId] = { sn: shortName(r.contractId), riders: [], reason: r.effectReason, expiryAge: r.expiryAge }
    }
    byContract[r.contractId].riders.push(r)
  })

  // 같은 reason + expiryAge 끼리 회사명 묶기
  type MergedGroup = { names: string[]; reason: string; expiryAge: number; riders: RiderWithEffect[] }
  const merged: MergedGroup[] = []

  Object.values(byContract).forEach(cg => {
    // 같은 계약 내 담보가 모두 같은 reason인지 확인
    const reasons = [...new Set(cg.riders.map(r => r.effectReason))]
    const expiries = [...new Set(cg.riders.map(r => r.expiryAge))]
    const key = reasons.length === 1 && expiries.length === 1
      ? `${reasons[0]}:${expiries[0]}`
      : `unique:${cg.sn}`

    const existing = merged.find(m => `${m.reason}:${m.expiryAge}` === key)
    if (existing && reasons.length === 1 && expiries.length === 1) {
      if (!existing.names.includes(cg.sn)) existing.names.push(cg.sn)
      existing.riders.push(...cg.riders)
    } else {
      merged.push({
        names: [cg.sn],
        reason: reasons.length === 1 ? reasons[0] : cg.reason,
        expiryAge: expiries.length === 1 ? expiries[0] : cg.expiryAge,
        riders: [...cg.riders],
      })
    }
  })

  const narrowDisease: Record<string, string> = {
    '암': '일반암', '뇌혈관': '뇌경색', '허혈심장': '협심증',
  }

  merged.forEach(({ names, reason, expiryAge, riders: mRiders }) => {
    // 2개 이상 회사 → "A이랑 B는"
    const namesStr = names.length === 1
      ? names[0]
      : names.slice(0, -1).join(', ') + irangRang(names.at(-2)!) + ' ' + names.at(-1)!
    const particle = eunNeun(names.at(-1)!)

    const allSameReason = new Set(mRiders.map(r => r.effectReason)).size === 1

    if (allSameReason) {
      if (reason === '갱신형') {
        if (mRiders.length > 1) {
          lines.push(`${namesStr}${particle} 전체 갱신형이에요. ${catLabel} 관련 담보 전부 실질 0원이에요.`)
        } else {
          const minExpiry = Math.min(...mRiders.map(r => r.expiryAge).filter(a => a < 8000))
          lines.push(`${namesStr}${particle} 갱신형이에요. ${minExpiry}세에 소멸돼요.`)
        }
      } else if (reason === '만기단기') {
        lines.push(`${namesStr}${particle} ${expiryAge}세 만기예요. 가장 필요한 시기에 보장이 끊기는 구조예요.`)
      } else if (reason === '협소범위') {
        const disease = narrowDisease[catLabel]
        if (mRiders.length === 1) {
          lines.push(`${namesStr} ${mRiders[0].name}은 협소범위예요. 가장 흔한 ${disease}은 해당이 안 돼요.`)
        } else {
          lines.push(`${namesStr}${particle} 협소범위예요. 가장 흔한 ${disease}은 해당이 안 돼요.`)
        }
      } else if (reason === 'CI/GI구조') {
        lines.push(`${namesStr}${particle} CI구조예요. 일반 진단으로는 받기 어려워요.`)
      } else if (reason === '해당없음') {
        lines.push(`${namesStr}${particle} 해당 없는 담보예요.`)
      }
    } else {
      // 같은 계약 내 담보가 다른 사유 → 각각 표기
      mRiders.forEach(r => {
        const sn = shortName(r.contractId)
        if (r.effectReason === '갱신형') {
          lines.push(`${sn} ${r.name}은 갱신형이에요. ${r.expiryAge}세에 소멸돼요.`)
        } else if (r.effectReason === '만기단기') {
          lines.push(`${sn} ${r.name}은 ${r.expiryAge}세 만기예요. 가장 필요한 시기에 끊기는 구조예요.`)
        } else if (r.effectReason === '협소범위') {
          lines.push(`${sn} ${r.name}은 협소범위예요. 가장 흔한 ${narrowDisease[catLabel]}은 해당이 안 돼요.`)
        } else if (r.effectReason === 'CI/GI구조') {
          lines.push(`${sn}은 CI구조예요.`)
        }
      })
    }
  })

  // ── 4) 결론 ─────────────────────────────────────────────────────────
  lines.push(`결국 실질 ${catLabel} 진단금은 ${effectiveTotal > 0 ? effectiveTotal.toLocaleString() + '만원' : '0원'}이에요.`)

  return lines.join(' ')
}

function buildPartialCoverage(riders: RiderWithEffect[]): string {
  const partial = riders.filter(r => r.effectReason === '보장기간공백' && r.effectiveAmount > 0)
  if (!partial.length) return ''
  const groups: Record<number, number> = {}
  partial.forEach(r => { groups[r.expiryAge] = (groups[r.expiryAge] ?? 0) + r.effectiveAmount })
  const desc = Object.entries(groups)
    .map(([age, amt]) => `${age}세까지 +${amt.toLocaleString()}만`)
    .join(', ')
  return ` (${desc})`
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

    // ── 고객 기본 정보 ───────────────────────────────────────────────
    const name = firstName(info.name)
    const age = info.age.toString()
    const gender = info.gender === 'M' ? '남' : '여'

    // ── 보험 현황 ────────────────────────────────────────────────────
    const companyList = [...new Set(customerData.contracts.map(c => c.companyName).filter(Boolean))].join(', ')

    // ── 계약별 처리 방향 요약 ────────────────────────────────────────
    const contractDecisions = analysis.decisions.map(d => {
      const c = customerData.contracts.find(ct => ct.id === d.contractId)
      if (!c) return ''
      const dir = DIRECTION_LABEL[d.direction] ?? d.direction
      return `${c.companyName} ${c.productName} — 월 ${c.monthlyPremium.toLocaleString()}원 → ${dir}\n${d.reason}`
    }).filter(Boolean).join('\n\n')

    // ── 만기보장 (81~99세 부분인정) ──────────────────────────────────
    const cancerPartial = buildPartialCoverage(analysis.breakdown.cancer)
    const brainPartial  = buildPartialCoverage(analysis.breakdown.brain)
    const heartPartial  = buildPartialCoverage(analysis.breakdown.heart)

    // ── 해약환급금 합산 ──────────────────────────────────────────────
    const surrenderMin = analysis.surrenderValues.reduce((s, v) => s + v.minValue, 0)
    const surrenderMax = analysis.surrenderValues.reduce((s, v) => s + v.maxValue, 0)

    // ── 설계 결과 (Plan A) ───────────────────────────────────────────
    const newCompany = newPlanData?.contracts.map(c => c.companyName).join(', ') ?? '[새설계안 미입력]'
    const newCount   = newPlanData ? newPlanData.contracts.length.toString() : '[새설계안 미입력]'
    const newTotal   = newPlanData?.totalMonthlyPremium.toLocaleString() ?? '[새설계안 미입력]'
    const newList    = newPlanData
      ? newPlanData.contracts.map(c => `• ${c.companyName} ${c.productName} — 월 ${c.monthlyPremium.toLocaleString()}원`).join('\n')
      : '[새설계안 미입력]'
    const firstNewPremium = newPlanData?.contracts[0]?.monthlyPremium.toLocaleString() ?? '[새설계안 미입력]'

    // ── 정리합계 (terminate 대상 월보험료 합산) ──────────────────────
    const terminateSum = analysis.decisions
      .filter(d => d.direction === 'terminate')
      .reduce((s, d) => {
        const c = customerData.contracts.find(ct => ct.id === d.contractId)
        return s + (c?.monthlyPremium ?? 0)
      }, 0)
    const terminateList = analysis.decisions
      .filter(d => d.direction === 'terminate')
      .map(d => {
        const c = customerData.contracts.find(ct => ct.id === d.contractId)
        if (!c) return ''
        const co = COMPANY_SHORT[c.companyName] ?? c.companyName
        const phone = PHONE_MAP[c.companyName] ?? '고객센터'
        return `• ${co} ${shortProductName(c.productName, c.companyName)} → ${c.companyName} 앱 또는 ${phone}`
      }).filter(Boolean).join('\n')

    // ── 계약별 방향 발화 (자동 생성) ─────────────────────────────────
    const buildDirectionText = (dir: 'keep' | 'terminate' | 'adjust') => {
      const label = { keep: '유지', terminate: '정리', adjust: '일부 조정' }[dir]
      const items = analysis.decisions
        .filter(d => d.direction === dir)
        .map(d => {
          const c = customerData.contracts.find(ct => ct.id === d.contractId)
          if (!c) return ''
          const co = COMPANY_SHORT[c.companyName] ?? c.companyName
          const prod = shortProductName(c.productName, c.companyName)
          return `${co} ${prod} — 월 ${c.monthlyPremium.toLocaleString()}원 → ${label}\n${d.reason}`
        }).filter(Boolean)
      return items.length ? items.join('\n\n') : `(${label} 대상 없음)`
    }

    // ── 해약환급금 발화 (자동 생성) ──────────────────────────────────
    const surrenderText = analysis.surrenderValues.length
      ? analysis.surrenderValues.map(sv => {
          const c = customerData.contracts.find(ct => ct.id === sv.contractId)
          const co = c ? (COMPANY_SHORT[c.companyName] ?? c.companyName) : ''
          const prod = c ? shortProductName(sv.productName, c.companyName) : sv.productName.slice(0, 18)
          const minV = Math.round(sv.minValue / 10000).toLocaleString()
          const maxV = Math.round(sv.maxValue / 10000).toLocaleString()
          return `${co} ${prod} → 약 ${minV}만~${maxV}만원 추정\n(${sv.basis})`
        }).join('\n\n')
      : '해약환급금 추정값 없음'

    // ── 변경 후 월보험료 & 절감액 ────────────────────────────────────
    const newMonthly   = newPlanData
      ? analysis.effectiveMonthlyPremium - terminateSum + newPlanData.totalMonthlyPremium
      : 0
    const savings = newPlanData ? analysis.effectiveMonthlyPremium - newMonthly : 0

    // ── 부족액 ───────────────────────────────────────────────────────
    const cancerShort  = Math.max(0, 5000 - analysis.coverage.cancerActual)
    const brainShort   = Math.max(0, 3000 - analysis.coverage.brainActual)
    const heartShort   = Math.max(0, 3000 - analysis.coverage.heartActual)

    // ── 실손 여부 ────────────────────────────────────────────────────
    const hasLoss = customerData.contracts.some(c => c.riders.some(r => r.category === 'loss'))
    const lossStr = hasLoss ? '있음' : '없음 (신규 5세대 실손 추가 필요)'

    return text
      // 고객 기본
      .replace(/{이름}/g, name)
      .replace(/{상담사}/g, consultantName)
      .replace(/{나이}/g, age)
      .replace(/{성별}/g, gender)
      .replace(/{상령일}/g, info.anniversaryDate || '[상령일 없음]')
      // 보험 현황
      .replace(/{보험사목록}/g, companyList || '[보험사 정보 없음]')
      .replace(/{보험수}/g, customerData.contracts.length.toString())
      .replace(/{월보험료}/g, analysis.totalMonthlyPremium.toLocaleString())
      .replace(/{실납입보험료}/g, analysis.effectiveMonthlyPremium.toLocaleString())
      // 실질 보장
      .replace(/{암실질}/g, analysis.coverage.cancerActual.toLocaleString())
      .replace(/{뇌실질}/g, analysis.coverage.brainActual.toLocaleString())
      .replace(/{심장실질}/g, analysis.coverage.heartActual.toLocaleString())
      // 만기보장 (부분인정)
      .replace(/{암만기보장}/g, cancerPartial)
      .replace(/{뇌만기보장}/g, brainPartial)
      .replace(/{심장만기보장}/g, heartPartial)
      // 담보 목록 (카톡 발화 서술형)
      .replace(/{암담보목록}/g, buildRiderNarrative(analysis.breakdown.cancer, customerData.contracts, '암', analysis.coverage.cancerActual))
      .replace(/{뇌담보목록}/g, buildRiderNarrative(analysis.breakdown.brain, customerData.contracts, '뇌혈관', analysis.coverage.brainActual))
      .replace(/{심담보목록}/g, buildRiderNarrative(analysis.breakdown.heart, customerData.contracts, '허혈심장', analysis.coverage.heartActual))
      // 처리 방향
      .replace(/{계약별처리방향}/g, contractDecisions || '[분석 결과 없음]')
      .replace(/{정리계약_발화}/g, buildDirectionText('terminate'))
      .replace(/{유지계약_발화}/g, buildDirectionText('keep'))
      .replace(/{조정계약_발화}/g, buildDirectionText('adjust'))
      // 해약환급금
      .replace(/{해약환급금하한}/g, surrenderMin > 0 ? Math.round(surrenderMin / 10000).toLocaleString() : '[추정불가]')
      .replace(/{해약환급금상한}/g, surrenderMax > 0 ? Math.round(surrenderMax / 10000).toLocaleString() : '[추정불가]')
      .replace(/{해약환급금_발화}/g, surrenderText)
      // 설계 결과
      .replace(/{신규보험사}/g, newCompany)
      .replace(/{신규보험료}/g, firstNewPremium)
      .replace(/{신규건수}/g, newCount)
      .replace(/{신규합계}/g, newTotal)
      .replace(/{신규보험목록}/g, newList)
      // 목표치
      .replace(/{암목표}/g, '5,000만')
      .replace(/{뇌목표}/g, '3,000만')
      .replace(/{심장목표}/g, '3,000만')
      // 정리합계 & 변경후 계산
      .replace(/{정리합계}/g, terminateSum > 0 ? terminateSum.toLocaleString() : '[분석 결과 없음]')
      .replace(/{정리보험목록}/g, terminateList || '[정리 대상 없음]')
      .replace(/{변경후월보험료}/g, newPlanData ? newMonthly.toLocaleString() : '[새설계안 미입력]')
      .replace(/{절감액}/g, newPlanData ? savings.toLocaleString() : '[새설계안 미입력]')
      // 부족액
      .replace(/{암부족액}/g, cancerShort.toLocaleString())
      .replace(/{뇌부족액}/g, brainShort.toLocaleString())
      .replace(/{심장부족액}/g, heartShort.toLocaleString())
      // 실손
      .replace(/{실손여부}/g, lossStr)
      // Plan B
      .replace(/{B안월보험료}/g, newPlanB?.totalMonthlyPremium.toLocaleString() ?? '[B안 미입력]')
      .replace(/{A보험료}/g, newPlanData?.totalMonthlyPremium.toLocaleString() ?? '[A안 미입력]')
      .replace(/{B보험료}/g, newPlanB?.totalMonthlyPremium.toLocaleString() ?? '[B안 미입력]')
      // 해지 안내 목록
      .replace(/{해지안내목록}/g, terminateList || '[정리 대상 없음]')
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
