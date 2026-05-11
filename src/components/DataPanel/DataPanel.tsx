import { useState, useMemo } from 'react'
import { useAppStore } from '../../store'
import { parseInsuranceText } from '../../engine/parser'
import { runFullAnalysis } from '../../engine/analyzer'
import { IF_SCRIPTS } from '../Guide/ifScripts'
import { BRANCH_LABELS, RESISTANCE_BRANCHES, CF_META, type CFId } from '../Script/cfMeta'
import type { RiderWithEffect, NewPlanData, InsuranceContract, CustomerData } from '../../types'
import { firstName } from '../../utils'

// ─── 보험료 비중 기반 특약 보험료 추정 ───────────────────────────────────
function estimateRiderPremium(riderName: string, contract: InsuranceContract): number {
  const totalRiderAmount = contract.riders.reduce((s, r) => s + r.amount, 0)
  if (totalRiderAmount === 0 || contract.monthlyPremium === 0) return 0
  const rider = contract.riders.find(r =>
    riderName.includes(r.name) ||
    r.name.includes(riderName.replace(/협소범위:\s*|CI보험 구조|갱신형 구조/g, '').trim())
  )
  if (!rider) return 0
  return Math.round((rider.amount / totalRiderAmount) * contract.monthlyPremium * 0.7 / 100) * 100
}

// ─── 새 설계안 파싱 ──────────────────────────────────────────────────────
function parseNewPlan(text: string): NewPlanData | null {
  const parsed = parseInsuranceText(text)
  if (parsed.contracts.length === 0) return null
  const fullContracts = parsed.contracts.map((c, i) => ({
    id: `np_${i}`,
    companyName: c.companyName ?? '',
    productName: c.productName ?? '',
    monthlyPremium: c.monthlyPremium ?? 0,
    expiryAge: c.expiryAge ?? 100,
    paymentCount: c.paymentCount ?? 0,
    totalPaid: c.totalPaid ?? 0,
    isRenewable: c.isRenewable ?? false,
    productType: (c.productType ?? 'health') as InsuranceContract['productType'],
    riders: c.riders ?? [],
    isPaidOff: c.isPaidOff,
  }))
  const npAnalysis = runFullAnalysis(fullContracts)
  return {
    contracts: fullContracts.map(c => ({
      companyName: c.companyName,
      productName: c.productName,
      monthlyPremium: c.monthlyPremium,
    })),
    totalMonthlyPremium: npAnalysis.effectiveMonthlyPremium,
    coverageCancer: npAnalysis.coverage.cancerActual,
    coverageBrain: npAnalysis.coverage.brainActual,
    coverageHeart: npAnalysis.coverage.heartActual,
    rawText: text,
  }
}

// ─── 키워드 → IF 스크립트 매핑 ───────────────────────────────────────────
interface ReactionRule {
  keywords: RegExp
  scriptIds: string[]
  label: string
}

const REACTION_RULES: ReactionRule[] = [
  { keywords: /가족|남편|아내|배우자|상의|의논|물어보|얘기해|집에서/, scriptIds: ['MD4-1a'], label: '가족 상의' },
  { keywords: /아까워|오래|납부|낸 돈|억울|손해|날아가|날리|惜/, scriptIds: ['MD4-1d'], label: '기존 납입 아까움' },
  { keywords: /추가로|더 나가|돈이 없|비싸|부담|추가 보험료|여력/, scriptIds: ['MD4-1c'], label: '추가 비용 우려' },
  { keywords: /해지|무서워|불안|위험|괜찮을까|리스크|망설|걱정/, scriptIds: ['MD4-1b'], label: '해지 부담' },
  { keywords: /생각|나중에|다음에|좀 있다|천천히|바빠|시간|여유|고민|결정이/, scriptIds: ['RESIST_EXIT'], label: '결정 미루기' },
  { keywords: /숫자|달라|다르|틀려|안 맞|맞지 않|이상|확인|오류/, scriptIds: ['MD4-1e'], label: '숫자 불일치' },
  { keywords: /갱신형이면|갱신이 뭐|갱신 어때|갱신해도|갱신은 괜찮|계속 내면/, scriptIds: ['MD2-3a'], label: '갱신형 무관심' },
  { keywords: /CI|GI|중증|말기|개흉|의식불명|심각해야/, scriptIds: ['MD2-3c'], label: 'CI/GI 보험 한계' },
  { keywords: /뇌출혈|협소|범위가 좁|해당이 안|적용이 안|뇌경색은/, scriptIds: ['MD2-3b'], label: '협소범위 이의' },
]

interface MatchedScript {
  scriptId: string
  label: string
  ruleLabel: string
  purpose: string
}

function matchReaction(input: string): MatchedScript[] {
  const results: MatchedScript[] = []
  const seen = new Set<string>()

  for (const rule of REACTION_RULES) {
    if (rule.keywords.test(input)) {
      for (const scriptId of rule.scriptIds) {
        if (!seen.has(scriptId)) {
          seen.add(scriptId)
          const script = IF_SCRIPTS[scriptId]
          if (script) {
            results.push({
              scriptId,
              label: BRANCH_LABELS[scriptId] ?? scriptId,
              ruleLabel: rule.label,
              purpose: script.purpose,
            })
          }
        }
      }
    }
  }
  return results.slice(0, 4)
}

// ─── Claude 프롬프트 생성 ─────────────────────────────────────────────────
function buildClaudePrompt(
  customerData: CustomerData,
  currentCF: string,
  currentMD: string,
  reaction: string,
): string {
  const { info, contracts } = customerData
  const analysis = customerData.analysis!
  const { decisions, coverage, effectiveMonthlyPremium } = analysis

  const contractSummary = contracts.map((c: InsuranceContract, i: number) => {
    const dec = decisions.find((d: { contractId: string }) => d.contractId === c.id)
    const dir = dec?.direction === 'keep' ? '유지' : dec?.direction === 'adjust' ? '일부조정' : '정리'
    return `${i + 1}. ${c.companyName} ${c.productName} (${c.isRenewable ? '갱신형' : '비갱신'}, ${c.monthlyPremium.toLocaleString()}원/월) → ${dir}`
  }).join('\n')

  return `보험 리모델링 상담 중 예상치 못한 고객 반응에 대응해야 합니다. 아래 상황에 맞는 대응 스크립트를 제안해 주세요.

## 상담 현황
- 고객: ${firstName(info.name)} (${info.age}세, ${info.gender === 'F' ? '여' : '남'})
- 단계: ${currentCF} ${CF_META[currentCF as CFId]?.label ?? ''} / ${currentMD}
- 월 보험료: ${effectiveMonthlyPremium.toLocaleString()}원
- 실질 보장: 암 ${coverage.cancerActual.toLocaleString()}만 / 뇌 ${coverage.brainActual.toLocaleString()}만 / 심장 ${coverage.heartActual.toLocaleString()}만

## 계약 현황 (${contracts.length}건)
${contractSummary}

## 고객 반응
"${reaction}"

## 요청
위 상황에서 상담사가 자연스럽게 대응할 수 있는 짧고 임팩트 있는 스크립트를 1~3문장으로 작성해 주세요.
- 고객에게 직접 말하는 방식 (존댓말)
- 심리적 저항을 부드럽게 풀어주는 방향
- 전문가로서의 자신감 유지
- 보험 상담 특화 한국어 표현 사용`
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────
export function DataPanel() {
  const {
    customerData, currentCF, currentMD,
    setActiveBranch, setShowDataInput,
    newPlanData, setNewPlanData,
    newPlanB, setNewPlanB,
    riderPremiumMap, setRiderPremium,
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<'analysis' | 'cards'>('analysis')
  const [expandedSection, setExpandedSection] = useState<'cancer' | 'brain' | 'heart' | null>(null)
  const [showAssist, setShowAssist] = useState(false)
  const [reaction, setReaction] = useState('')
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [copiedScript, setCopiedScript] = useState<string | null>(null)
  const [planAText, setPlanAText] = useState('')
  const [planBText, setPlanBText] = useState('')

  const matches = useMemo(() => matchReaction(reaction), [reaction])

  if (!customerData?.analysis) return null

  const { info, contracts, analysis } = customerData
  const { coverage, breakdown, problems, decisions, surrenderValues, effectiveMonthlyPremium } = analysis

  const directionLabel = { keep: '유지', adjust: '일부조정', terminate: '정리' }
  const formatBirth = (bd: string) => {
    if (!bd) return ''
    const [y, m, d] = bd.split('-')
    return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일생`
  }

  const isInCF3 = currentCF === 'CF3' || currentMD.startsWith('MD3')
  const isInCF4 = currentCF === 'CF4' || currentMD.startsWith('MD4')

  function handleCopyPrompt() {
    if (!reaction.trim() || !customerData) return
    const prompt = buildClaudePrompt(customerData, currentCF, currentMD, reaction)
    navigator.clipboard.writeText(prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  function handleCopyScript(scriptId: string) {
    const script = IF_SCRIPTS[scriptId]
    if (!script) return
    const text = script.scripts.map(s => (s.label ? `[${s.label}]\n` : '') + s.text).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopiedScript(scriptId)
    setTimeout(() => setCopiedScript(null), 1500)
  }

  return (
    <aside className="w-72 flex-shrink-0 flex flex-col overflow-y-auto" style={{ background: '#0c1322', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>

      {/* 탭 버튼 */}
      <div className="flex border-b border-white/[0.05]" style={{ background: '#0c1322' }}>
        <button
          onClick={() => setActiveTab('analysis')}
          className={`flex-1 text-[10px] py-2.5 font-medium transition-colors ${
            activeTab === 'analysis'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          분석결과
        </button>
        <button
          onClick={() => setActiveTab('cards')}
          className={`flex-1 text-[10px] py-2.5 font-medium transition-colors ${
            activeTab === 'cards'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          보험카드
        </button>
      </div>

      {activeTab === 'cards' && (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {contracts.map((contract, idx) => (
            <SidebarContractCard key={contract.id} contract={contract} idx={idx} />
          ))}
        </div>
      )}

      {activeTab === 'analysis' && <>

      {/* 고객 요약 */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">{firstName(info.name)}님</h3>
            <p className="text-xs text-slate-500">
              {info.age}세 · {info.gender === 'F' ? '여' : '남'} · {contracts.length}건
            </p>
            {info.birthDate && (
              <p className="text-[11px] text-slate-600 mt-0.5">{formatBirth(info.birthDate)}</p>
            )}
          </div>
          <button
            onClick={() => setShowDataInput(true)}
            className="text-[10px] text-slate-600 hover:text-slate-400 border border-slate-700 rounded px-2 py-1 transition-colors"
          >
            계약 보기
          </button>
        </div>
        <div className="mt-2 space-y-0.5">
          <p className="text-xs text-slate-400">
            총 월보험료 <span className="text-white font-medium">{analysis.totalMonthlyPremium.toLocaleString()}</span>원
          </p>
          {effectiveMonthlyPremium !== analysis.totalMonthlyPremium && (
            <p className="text-xs text-blue-400">
              납입 중 <span className="font-medium">{effectiveMonthlyPremium.toLocaleString()}</span>원
              <span className="text-slate-600 ml-1">(납입완료 제외)</span>
            </p>
          )}
        </div>
      </div>

      {/* 실질 보장금액 */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2">실질 보장금액</p>
        <div className="space-y-2">
          <CoverageSection label="암 진단금" actual={coverage.cancerActual} target={5000}
            riders={breakdown.cancer} isExpanded={expandedSection === 'cancer'}
            onToggle={() => setExpandedSection(expandedSection === 'cancer' ? null : 'cancer')} />
          <CoverageSection label="뇌혈관 진단금" actual={coverage.brainActual} target={3000}
            riders={breakdown.brain} isExpanded={expandedSection === 'brain'}
            onToggle={() => setExpandedSection(expandedSection === 'brain' ? null : 'brain')} />
          <CoverageSection label="심장 진단금" actual={coverage.heartActual} target={3000}
            riders={breakdown.heart} isExpanded={expandedSection === 'heart'}
            onToggle={() => setExpandedSection(expandedSection === 'heart' ? null : 'heart')} />
        </div>
      </div>

      {/* 진단 결과 */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2">진단 결과</p>
        <div className="space-y-1">
          <ProblemBadge active={problems.insufficientCoverage} label="3대 진단금 부족" />
          <ProblemBadge active={problems.hasRenewable} label="갱신형 구조" />
          <ProblemBadge active={problems.hasCoverageGap} label="보장기간 공백" />
          <ProblemBadge active={problems.hasNarrowScope} label="협소범위 담보" />
        </div>
      </div>

      {/* 계약별 처리 방향 */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2">계약별 처리 방향</p>
        <div className="space-y-3">
          {contracts.map((c, i) => {
            const dec = decisions.find((d) => d.contractId === c.id)
            const dir = dec?.direction ?? 'keep'
            const sv = surrenderValues.find((s) => s.contractId === c.id)
            const problematicRiders = dec?.problematicRiders ?? []
            const totalRiderPremiumToRemove = problematicRiders.reduce((sum, rName) => {
              const stored = riderPremiumMap[`${c.id}::${rName}`]
              return sum + (stored !== undefined ? stored : estimateRiderPremium(rName, c))
            }, 0)
            const adjustedPremium = Math.max(0, (c.isPaidOff ? 0 : c.monthlyPremium) - totalRiderPremiumToRemove)

            return (
              <div key={c.id} className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-slate-600 flex-shrink-0 mt-0.5">{'❶❷❸❹❺❻❼❽❾'[i]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-slate-400 truncate">{c.companyName || '(보험사)'}</span>
                      <span className={`text-[10px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded ${
                        dir === 'keep' ? 'bg-emerald-900/40 text-emerald-400' :
                        dir === 'adjust' ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-red-900/40 text-red-400'
                      }`}>
                        {directionLabel[dir]}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 truncate">{c.productName}</p>
                    <p className="text-[10px] text-slate-700">
                      {c.isPaidOff
                        ? <span className="text-emerald-700">납입완료 (0원/월)</span>
                        : `${c.monthlyPremium.toLocaleString()}원/월`}
                    </p>
                  </div>
                </div>

                {dir === 'adjust' && problematicRiders.length > 0 && (
                  <div className="ml-5 pl-2 border-l border-yellow-800/40 space-y-1.5">
                    <p className="text-[10px] text-yellow-600 font-medium">삭제 권고 특약 · 보험료 조정</p>
                    {problematicRiders.map((rName, rIdx) => {
                      const key = `${c.id}::${rName}`
                      const estimate = estimateRiderPremium(rName, c)
                      const stored = riderPremiumMap[key]
                      const displayVal = stored !== undefined ? stored : estimate
                      return (
                        <div key={rIdx} className="space-y-0.5">
                          <p className="text-[10px] text-yellow-700/80">— {rName}</p>
                          <div className="flex items-center gap-1">
                            <input type="number" value={displayVal || ''} placeholder={estimate > 0 ? `추정 ${estimate.toLocaleString()}` : '직접 입력'}
                              onChange={(e) => setRiderPremium(c.id, rName, parseInt(e.target.value) || 0)}
                              className="w-full bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-yellow-600 placeholder-slate-600" />
                            <span className="text-[10px] text-slate-600 flex-shrink-0">원</span>
                          </div>
                        </div>
                      )
                    })}
                    {!c.isPaidOff && (
                      <div className="text-[10px] pt-1 border-t border-yellow-900/30">
                        <div className="flex justify-between"><span className="text-slate-600">현재 보험료</span><span className="text-slate-400">{c.monthlyPremium.toLocaleString()}원</span></div>
                        <div className="flex justify-between"><span className="text-slate-600">삭제 예상 절감</span><span className="text-yellow-600">−{totalRiderPremiumToRemove.toLocaleString()}원</span></div>
                        <div className="flex justify-between font-medium mt-0.5"><span className="text-slate-400">조정 후 예상</span><span className="text-yellow-400">{adjustedPremium.toLocaleString()}원/월</span></div>
                      </div>
                    )}
                  </div>
                )}

                {dir === 'terminate' && sv && (
                  <div className="ml-5 pl-2 border-l border-red-800/40 space-y-0.5">
                    <p className="text-[10px] text-red-500/80 font-medium">예상 해약환급금</p>
                    <p className="text-[10px] text-red-400 font-medium">
                      {sv.minValue > 0 ? `${sv.minValue.toLocaleString()}~${sv.maxValue.toLocaleString()}만원` : '거의 없음 (갱신형)'}
                    </p>
                    <p className="text-[10px] text-slate-700 leading-relaxed">{sv.basis}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* CF3: 새 설계안 A / B */}
      {isInCF3 && (
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2">새 설계안 — CF3 입력</p>
          <div className="space-y-3">
            <PlanInput label="A안" plan={newPlanData} text={planAText} onTextChange={setPlanAText}
              onParse={() => { const d = parseNewPlan(planAText); if (d) setNewPlanData(d) }}
              onClear={() => { setNewPlanData(null); setPlanAText('') }} accentClass="blue" />
            <PlanInput label="B안" plan={newPlanB} text={planBText} onTextChange={setPlanBText}
              onParse={() => { const d = parseNewPlan(planBText); if (d) setNewPlanB(d) }}
              onClear={() => { setNewPlanB(null); setPlanBText('') }} accentClass="purple" />
          </div>
        </div>
      )}

      {/* CF4: 저항 분기 빠른 선택 */}
      {isInCF4 && (
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider font-semibold mb-2">저항 분기 선택</p>
          <div className="space-y-1">
            {RESISTANCE_BRANCHES.map((branchId) => (
              <button key={branchId} onClick={() => setActiveBranch(branchId)}
                className="w-full text-left text-[10px] bg-slate-800/40 hover:bg-orange-900/20 border border-slate-700/40 hover:border-orange-700/40 rounded px-2 py-1.5 text-slate-500 hover:text-orange-300 transition-colors duration-150">
                {BRANCH_LABELS[branchId]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 고객 반응 대응 ── */}
      <div className="px-4 py-3 mt-auto border-t border-white/[0.05]">
        <button
          onClick={() => setShowAssist(!showAssist)}
          className="w-full flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-300 transition-colors duration-150"
        >
          <span className="uppercase tracking-wider font-semibold">고객 반응 대응</span>
          <span className="text-slate-600">{showAssist ? '▲' : '▼'}</span>
        </button>

        {showAssist && (
          <div className="mt-3 space-y-3 animate-in">
            {/* 고객 반응 입력 */}
            <div>
              <label className="text-[10px] text-slate-500 font-medium block mb-1.5">고객이 한 말 / 반응</label>
              <textarea
                value={reaction}
                onChange={(e) => setReaction(e.target.value)}
                placeholder="예: 가족이랑 상의해봐야 할 것 같아요..."
                rows={2}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-slate-500 transition-colors duration-150"
              />
            </div>

            {/* 키워드 매칭 결과 */}
            {reaction.trim().length > 2 && (
              <div className="space-y-1.5">
                {matches.length > 0 ? (
                  <>
                    <p className="text-[10px] text-slate-600 font-medium">관련 IF 스크립트</p>
                    {matches.map((m) => (
                      <div key={m.scriptId} className="rounded-lg border border-slate-700/40 bg-slate-800/30 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[9px] font-bold bg-orange-900/40 text-orange-400 px-1.5 py-px rounded">{m.scriptId}</span>
                              <span className="text-[10px] font-medium text-slate-300 truncate">{m.label || m.ruleLabel}</span>
                            </div>
                            <p className="text-[9px] text-slate-600 leading-snug line-clamp-1">{m.purpose}</p>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => setActiveBranch(m.scriptId)}
                              className="text-[9px] text-slate-500 hover:text-blue-400 border border-slate-700 hover:border-blue-700/50 rounded px-1.5 py-0.5 transition-colors duration-150"
                            >
                              이동
                            </button>
                            <button
                              onClick={() => handleCopyScript(m.scriptId)}
                              className={`text-[9px] border rounded px-1.5 py-0.5 transition-colors duration-150 ${
                                copiedScript === m.scriptId
                                  ? 'text-emerald-400 border-emerald-700'
                                  : 'text-slate-500 hover:text-orange-400 border-slate-700 hover:border-orange-700/50'
                              }`}
                            >
                              {copiedScript === m.scriptId ? '✓' : '복사'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-[10px] text-slate-700 text-center py-1">
                    매핑된 스크립트가 없습니다
                  </p>
                )}
              </div>
            )}

            {/* 구분선 */}
            {reaction.trim().length > 2 && (
              <div className="border-t border-white/[0.05]" />
            )}

            {/* Claude 프롬프트 생성 */}
            <div className="space-y-1.5">
              <p className="text-[10px] text-slate-600 font-medium">Claude에게 직접 물어보기</p>
              <p className="text-[9px] text-slate-700 leading-snug">
                현황·계약·고객 반응이 담긴 프롬프트를 생성합니다.<br />
                복사 후 Claude.ai에 붙여넣으세요.
              </p>
              <button
                onClick={handleCopyPrompt}
                disabled={!reaction.trim()}
                className={`w-full text-xs font-medium py-1.5 rounded-lg border transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ${
                  copiedPrompt
                    ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60 hover:text-white'
                }`}
              >
                {copiedPrompt ? '✓ 클립보드에 복사됨' : 'Claude 프롬프트 복사'}
              </button>
            </div>
          </div>
        )}
      </div>
      </>}
    </aside>
  )
}

// ─── PlanInput ─────────────────────────────────────────────────────────────
function PlanInput({ label, plan, text, onTextChange, onParse, onClear, accentClass }: {
  label: string; plan: NewPlanData | null; text: string
  onTextChange: (v: string) => void; onParse: () => void; onClear: () => void; accentClass: 'blue' | 'purple'
}) {
  const accent = accentClass === 'blue'
    ? { border: 'border-blue-700/40', text: 'text-blue-400', val: 'text-blue-400' }
    : { border: 'border-purple-700/40', text: 'text-purple-400', val: 'text-purple-400' }

  return (
    <div className={`rounded-lg border p-2.5 space-y-1.5 ${plan ? accent.border : 'border-slate-700/40'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold ${accent.text}`}>{label}</span>
        {plan && <button onClick={onClear} className="text-[10px] text-slate-600 hover:text-slate-400">초기화</button>}
      </div>
      {plan ? (
        <div className="space-y-0.5">
          {plan.contracts.map((c, i) => (
            <div key={i} className="flex justify-between text-[10px]">
              <span className="text-slate-500 truncate max-w-[120px]">{c.companyName} {c.productName}</span>
              <span className="text-slate-400">{c.monthlyPremium.toLocaleString()}원</span>
            </div>
          ))}
          <div className="border-t border-white/[0.05] pt-1 mt-1 space-y-0.5">
            <div className="flex justify-between text-[10px] font-medium">
              <span className="text-slate-400">월보험료</span>
              <span className={accent.val}>{plan.totalMonthlyPremium.toLocaleString()}원</span>
            </div>
            {[['암', plan.coverageCancer, 5000], ['뇌', plan.coverageBrain, 3000], ['심장', plan.coverageHeart, 3000]] .map(([name, val, tgt]) => (
              <div key={String(name)} className="flex justify-between text-[10px]">
                <span className="text-slate-600">{name}</span>
                <span className={(val as number) >= (tgt as number) ? 'text-emerald-400' : 'text-yellow-400'}>{(val as number).toLocaleString()}만</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <textarea value={text} onChange={(e) => onTextChange(e.target.value)}
            placeholder={`${label} 설계안 텍스트 붙여넣기...`}
            className="w-full h-14 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-slate-200 placeholder-slate-700 resize-none focus:outline-none focus:border-blue-600" />
          <button onClick={onParse} disabled={!text.trim()}
            className="w-full text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-200 rounded py-1 disabled:opacity-40 transition-colors duration-150">
            파악하기
          </button>
        </>
      )}
    </div>
  )
}

// ─── CoverageSection & ProblemBadge ───────────────────────────────────────
const REASON_LABEL: Record<string, string> = {
  '갱신형': '갱신형', '협소범위': '협소범위', 'CI/GI구조': 'CI/GI',
  '만기단기': '만기단기', '보장기간공백': '보장공백', '유효': '유효', '해당없음': '미산정',
}
const CATEGORY_LABEL: Record<string, string> = {
  cancer_general: '일반암', cancer_expensive: '고액암', cancer_minor: '소액암',
  cerebrovascular: '뇌혈관', stroke: '뇌졸중', brain_hemorrhage: '뇌출혈',
  ischemic_heart: '허혈성심장', ami: '심근경색', ci_gi: 'CI/GI',
  death: '사망', other: '기타',
}

function CoverageSection({ label, actual, target, riders, isExpanded, onToggle }: {
  label: string; actual: number; target: number
  riders: RiderWithEffect[]; isExpanded: boolean; onToggle: () => void
}) {
  const ok = actual >= target
  const pct = Math.min((actual / target) * 100, 100)

  // 80~99세 만기 담보: 실질 합산엔 제외되지만 UI에 별도 표시
  const partialRiders = riders.filter(r => r.effectReason === '보장기간공백')
  const partialTotal = partialRiders.reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex justify-between text-xs mb-0.5">
          <span className="text-slate-500">{label}</span>
          <span className={ok ? 'text-emerald-400' : 'text-red-400'}>
            {actual.toLocaleString()}만
            {partialTotal > 0 && (
              <span className="text-amber-500/70 ml-1 text-[10px]">+{partialTotal.toLocaleString()}부분</span>
            )}
            <span className="text-slate-700 ml-1">/ {target.toLocaleString()}만</span>
            <span className="text-slate-600 ml-1 text-[10px]">{isExpanded ? '▲' : '▼'}</span>
          </span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-300 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </button>
      {isExpanded && (
        <div className="mt-1.5 space-y-1 pl-1 animate-in">
          {riders.length === 0 && <p className="text-[10px] text-slate-700 pl-1">해당 특약 없음</p>}
          {riders.map((r, i) => {
            const isPartial = r.effectReason === '보장기간공백'
            const isIrrelevant = r.effectReason === '해당없음'
            return (
              <div key={i} className={`text-[10px] rounded px-2 py-1.5 border ${
                r.isEffective          ? 'bg-emerald-950/30 border-emerald-800/40'
                : isPartial           ? 'bg-amber-950/20 border-amber-800/30'
                : isIrrelevant        ? 'bg-slate-800/20 border-slate-700/20 opacity-40'
                : 'bg-slate-800/40 border-slate-700/40'
              }`}>
                <div className="text-slate-600 mb-0.5 truncate text-[9px]">{r.contractName}</div>
                <div className="flex justify-between items-start gap-1">
                  <span className={`font-medium truncate ${
                    r.isEffective ? 'text-emerald-300'
                    : isPartial   ? 'text-amber-400/80'
                    : 'text-slate-500'
                  }`}>
                    {r.isEffective ? '✓' : isIrrelevant ? '—' : isPartial ? '⚠' : '✗'} {r.name}
                  </span>
                  <span className={`flex-shrink-0 font-medium ${
                    r.isEffective ? 'text-emerald-400'
                    : isPartial   ? 'text-amber-500/70'
                    : 'text-slate-600'
                  }`}>
                    {r.amount.toLocaleString()}만
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 mt-0.5">
                  <span>{CATEGORY_LABEL[r.category] ?? r.category}</span>
                  <span className="flex items-center gap-1.5">
                    {r.expiryDate
                      ? <span>{r.expiryDate.slice(0, 7)}</span>
                      : r.expiryAge > 0
                        ? <span>{r.expiryAge === 9999 ? '종신' : `~${r.expiryAge}세`}</span>
                        : null}
                    {/* 유효: 표시 없음 */}
                    {/* 해당없음 */}
                    {isIrrelevant && <span className="text-slate-600">미산정</span>}
                    {/* 보장기간공백 (80~99세): OO세까지 부분인정 */}
                    {isPartial && (
                      <span className="text-amber-500/80 font-medium">
                        {r.expiryAge}세까지 부분인정
                      </span>
                    )}
                    {/* 그 외 무효 사유: → 실질 0원 */}
                    {!r.isEffective && !isPartial && !isIrrelevant && (
                      <span className="text-red-500/80 font-medium">
                        {REASON_LABEL[r.effectReason] ?? r.effectReason} → 실질 0원
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )
          })}
          {/* 80~99세 부분인정 합계 안내 */}
          {partialTotal > 0 && (
            <p className="text-[9px] text-amber-600/60 pl-1 pt-0.5">
              ⚠ 부분인정 {partialTotal.toLocaleString()}만원은 실질 합산에서 제외됩니다
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ProblemBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${active ? 'text-red-400' : 'text-slate-700'}`}>
      <span className={`w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold ${active ? 'bg-red-500 text-white' : 'bg-slate-800'}`}>
        {active ? '!' : '✓'}
      </span>
      {label}
    </div>
  )
}

function SidebarContractCard({ contract, idx }: { contract: InsuranceContract; idx: number }) {
  const [expanded, setExpanded] = useState(false)

  const RIDER_GROUPS_COMPACT = [
    { key: 'cancer', label: '암', cats: ['cancer_general', 'cancer_expensive', 'cancer_minor'], color: 'text-red-400' },
    { key: 'brain', label: '뇌', cats: ['cerebrovascular', 'stroke', 'brain_hemorrhage', 'specific_cerebrovascular'], color: 'text-blue-400' },
    { key: 'heart', label: '심', cats: ['ischemic_heart', 'ami', 'specific_ischemic_heart'], color: 'text-amber-400' },
    { key: 'loss', label: '실손', cats: ['loss'], color: 'text-sky-400' },
    { key: 'surgery', label: '수술·장해', cats: ['surgery', 'disability'], color: 'text-slate-400' },
    { key: 'other', label: '기타', cats: ['hospitalization', 'ci_gi', 'death', 'other'], color: 'text-slate-600' },
  ]

  const NARROW_CATS = ['brain_hemorrhage', 'stroke', 'ami', 'specific_cerebrovascular', 'specific_ischemic_heart']

  const SC_LABEL: Record<string, string> = {
    cancer_general: '일반암', cancer_expensive: '고액암', cancer_minor: '소액암',
    cerebrovascular: '뇌혈관', stroke: '뇌졸중', brain_hemorrhage: '뇌출혈',
    specific_cerebrovascular: '특정뇌혈관', ischemic_heart: '허혈성',
    ami: '심근경색', specific_ischemic_heart: '특정허혈심장',
    ci_gi: 'CI/GI', loss: '실손', disability: '장해',
    surgery: '수술', hospitalization: '입원', death: '사망', other: '기타',
  }

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 pt-2.5 pb-2"
      >
        <div className="flex items-start gap-2 justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-600">
              <span className="text-slate-700 mr-1">{'❶❷❸❹❺❻❼❽❾'[idx]}</span>
              {contract.companyName}
            </p>
            <p className="text-[11px] text-white font-medium leading-snug mt-0.5 truncate">{contract.productName}</p>
          </div>
          <div className="flex flex-wrap gap-1 flex-shrink-0 mt-0.5">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-md border ${
              contract.isRenewable
                ? 'bg-red-900/30 text-red-400 border-red-700/40'
                : 'bg-emerald-900/30 text-emerald-400 border-emerald-700/40'
            }`}>
              {contract.isRenewable ? '갱신' : '비갱신'}
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md border bg-slate-800/50 text-slate-500 border-slate-700/30">
              {contract.expiryAge === 9999 ? '종신' : `${contract.expiryAge}세`}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[10px] text-slate-600">
            {contract.isPaidOff
              ? <span className="text-emerald-700">납입완료</span>
              : `${contract.monthlyPremium.toLocaleString()}원/월`}
          </p>
          <span className="text-[9px] text-slate-700">
            {expanded ? '▲' : '▼'} 특약 {contract.riders.length}건
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.05] pt-2 space-y-2">
          {RIDER_GROUPS_COMPACT.map(group => {
            const items = contract.riders.filter(r => group.cats.includes(r.category))
            if (items.length === 0) return null
            return (
              <div key={group.key}>
                <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${group.color}`}>
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {items.map((rider, rIdx) => (
                    <div key={rIdx} className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="text-slate-400 min-w-0 flex-1 truncate leading-snug">
                        {rider.name}
                        {rider.isRenewable && <span className="text-red-700 ml-1 text-[9px]">갱신</span>}
                        {NARROW_CATS.includes(rider.category) && <span className="text-orange-700 ml-1 text-[9px]">협소</span>}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-slate-300 font-medium">{rider.amount.toLocaleString()}만</span>
                        {rider.expiryAge > 0 && rider.expiryAge !== 9999 && (
                          <span className={`text-[9px] px-1 py-px rounded ${
                            rider.expiryAge >= 100 ? 'text-slate-600'
                            : rider.expiryAge > 80 ? 'text-amber-600'
                            : 'text-red-700'
                          }`}>~{rider.expiryAge}세</span>
                        )}
                        <span className="text-[9px] text-slate-700">
                          {SC_LABEL[rider.category] ?? rider.category}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
