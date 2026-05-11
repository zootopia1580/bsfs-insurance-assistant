import { useAppStore } from '../../store'
import type { ContractDecision, SurrenderValueEstimate } from '../../types'

export function AnalysisResult() {
  const { customerData } = useAppStore()

  if (!customerData?.analysis) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        분석 결과가 없습니다.
      </div>
    )
  }

  const { analysis, info, contracts } = customerData
  const { coverage, problems, decisions, surrenderValues, totalMonthlyPremium } = analysis

  return (
    <div className="space-y-5">
      {/* 고객 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">{info.name}님 분석 결과</h1>
          <p className="text-sm text-slate-400">
            {info.age}세 · {info.gender === 'M' ? '남' : '여'} · 보험 {contracts.length}건 ·
            월 {totalMonthlyPremium.toLocaleString()}원
          </p>
        </div>
      </div>

      {/* 실질 보장금액 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          실질 보장금액 (3대 진단금)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <CoverageCard
            label="암"
            actual={coverage.cancerActual}
            target={5000}
            expensive={coverage.cancerExpensive}
          />
          <CoverageCard label="뇌혈관" actual={coverage.brainActual} target={3000} />
          <CoverageCard label="허혈성심장" actual={coverage.heartActual} target={3000} />
        </div>
      </div>

      {/* 4대 문제 태깅 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          진단 결과
        </h2>
        <div className="card p-4">
          <div className="grid grid-cols-2 gap-3">
            <ProblemTag
              active={problems.insufficientCoverage}
              label="3대 진단금 부족"
              desc="암 5,000만 / 뇌 3,000만 / 심장 3,000만 기준"
            />
            <ProblemTag
              active={problems.hasRenewable}
              label="갱신형 구조 존재"
              desc="나이 들수록 보험료 급증"
            />
            <ProblemTag
              active={problems.hasCoverageGap}
              label="보장기간 공백"
              desc="100세 미만 만기 비갱신 계약"
            />
            <ProblemTag
              active={problems.hasNarrowScope}
              label="협소범위 담보"
              desc="뇌출혈·급성심근경색 등 좁은 범위"
            />
          </div>
        </div>
      </div>

      {/* 보험별 처리 방향 */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          보험별 처리 방향
        </h2>
        <div className="space-y-2">
          {contracts.map((contract) => {
            const decision = decisions.find((d) => d.contractId === contract.id)
            if (!decision) return null
            return (
              <ContractDecisionCard
                key={contract.id}
                contractName={`${contract.companyName} ${contract.productName}`}
                monthlyPremium={contract.monthlyPremium}
                decision={decision}
              />
            )
          })}
        </div>
      </div>

      {/* 해약환급금 */}
      {surrenderValues.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            해약환급금 추정
          </h2>
          <div className="space-y-2">
            {surrenderValues.map((sv) => (
              <SurrenderValueCard key={sv.contractId} value={sv} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CoverageCard({
  label,
  actual,
  target,
  expensive,
}: {
  label: string
  actual: number
  target: number
  expensive?: number
}) {
  const isInsufficient = actual < target
  return (
    <div className={`card p-4 ${isInsufficient ? 'border-red-700/50' : 'border-emerald-700/50'}`}>
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <div className={`text-2xl font-bold ${isInsufficient ? 'text-red-400' : 'text-emerald-400'}`}>
        {actual.toLocaleString()}만
      </div>
      <div className="text-xs text-slate-500 mt-1">목표: {target.toLocaleString()}만원</div>
      {expensive !== undefined && expensive > 0 && (
        <div className="text-xs text-slate-500 mt-0.5">
          고액암: +{expensive.toLocaleString()}만
        </div>
      )}
      <div className="mt-2">
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isInsufficient ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min((actual / target) * 100, 100)}%` }}
          />
        </div>
        <div className="text-xs text-slate-600 mt-1">
          {Math.round((actual / target) * 100)}%
        </div>
      </div>
    </div>
  )
}

function ProblemTag({
  active,
  label,
  desc,
}: {
  active: boolean
  label: string
  desc: string
}) {
  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg ${active ? 'bg-red-900/20' : 'bg-slate-900/50'}`}>
      <div
        className={`w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-xs ${
          active ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-400'
        }`}
      >
        {active ? '!' : '✓'}
      </div>
      <div>
        <div className={`text-xs font-medium ${active ? 'text-red-400' : 'text-slate-500'}`}>
          {label}
        </div>
        <div className="text-xs text-slate-600 mt-0.5">{desc}</div>
      </div>
    </div>
  )
}

function ContractDecisionCard({
  contractName,
  monthlyPremium,
  decision,
}: {
  contractName: string
  monthlyPremium: number
  decision: ContractDecision
}) {
  const directionLabel = {
    keep: '유지',
    adjust: '조정',
    terminate: '정리',
  }[decision.direction]

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white font-medium truncate">{contractName}</span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-xs text-slate-400">{monthlyPremium.toLocaleString()}원/월</span>
          <span
            className={
              decision.direction === 'keep'
                ? 'badge-keep'
                : decision.direction === 'adjust'
                ? 'badge-adjust'
                : 'badge-terminate'
            }
          >
            {directionLabel}
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-400">{decision.reason}</p>
      {decision.problematicRiders.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {decision.problematicRiders.map((rider, i) => (
            <span key={i} className="bg-slate-900 text-slate-500 border border-slate-700 px-2 py-0.5 rounded text-xs">
              {rider}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SurrenderValueCard({ value }: { value: SurrenderValueEstimate }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-white">{value.productName}</span>
        {value.minValue > 0 ? (
          <span className="text-sm font-bold text-blue-400">
            {value.minValue.toLocaleString()}만~{value.maxValue.toLocaleString()}만원
          </span>
        ) : (
          <span className="text-sm text-slate-500">거의 없음</span>
        )}
      </div>
      <p className="text-xs text-slate-500">{value.basis}</p>
    </div>
  )
}
