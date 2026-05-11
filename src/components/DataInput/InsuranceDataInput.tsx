import { useState } from 'react'
import { parseInsuranceText } from '../../engine/parser'
import { runFullAnalysis } from '../../engine/analyzer'
import { useAppStore } from '../../store'
import type { CustomerData, InsuranceContract } from '../../types'

export function InsuranceDataInput() {
  const { setCustomerData, setAnalysis, setIsAnalyzing, customerData, setShowDataInput } = useAppStore()

  const [rawText, setRawText] = useState('')
  const [parsedData, setParsedData] = useState<Partial<CustomerData> | null>(
    customerData ? { info: customerData.info, contracts: customerData.contracts } : null
  )
  const [isParsed, setIsParsed] = useState(!!customerData)

  function handleParse() {
    if (!rawText.trim()) return
    const result = parseInsuranceText(rawText)
    setParsedData({
      info: {
        name: result.customerInfo.name || '',
        age: result.customerInfo.age || 0,
        gender: result.customerInfo.gender || 'M',
        birthDate: result.customerInfo.birthDate || '',
        anniversaryDate: result.customerInfo.anniversaryDate || '',
      },
      contracts: result.contracts as InsuranceContract[],
    })
    setIsParsed(true)
  }

  async function handleConfirm() {
    if (!parsedData?.info || !parsedData?.contracts) return
    setIsAnalyzing(true)
    try {
      const contracts = parsedData.contracts as InsuranceContract[]
      const analysis = runFullAnalysis(contracts)
      const cd: CustomerData = { info: parsedData.info, contracts, analysis }
      setCustomerData(cd)
      setAnalysis(analysis)
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-white mb-1">
            {customerData && isParsed ? '계약 보기 / 수정' : '고객 보험 데이터 입력'}
          </h1>
          <p className="text-xs text-slate-500">
            {customerData && isParsed
              ? '파싱된 계약 내용을 확인하거나 수정할 수 있습니다.'
              : '보험 증권 또는 계약 목록을 붙여넣으면 자동으로 파싱됩니다.'}
          </p>
        </div>
        {customerData && (
          <button
            onClick={() => setShowDataInput(false)}
            className="text-slate-400 hover:text-slate-200 text-xs rounded-[8px] px-3 py-1.5 ml-4 flex-shrink-0 transition-colors duration-150"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            ← 상담으로 돌아가기
          </button>
        )}
      </div>

      {!isParsed ? (
        <InputView
          rawText={rawText}
          onChange={setRawText}
          onParse={handleParse}
          onDemo={() => setRawText(DEMO_TEXT)}
        />
      ) : (
        <ParsedDataEditor
          parsedData={parsedData!}
          onEdit={setParsedData}
          onConfirm={handleConfirm}
          onReset={() => { setIsParsed(false); setParsedData(null); setRawText('') }}
          hasExistingData={!!customerData}
        />
      )}
    </div>
  )
}

// ── 입력 뷰 ────────────────────────────────────────────────────────────────────
interface InputViewProps {
  rawText: string
  onChange: (v: string) => void
  onParse: () => void
  onDemo: () => void
}
function InputView({ rawText, onChange, onParse, onDemo }: InputViewProps) {
  return (
    <div className="space-y-4">
      <div className="card p-4">
        <label className="block text-xs font-medium text-slate-400 mb-2">보험 데이터 붙여넣기</label>
        <textarea
          value={rawText}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`예시:\n성명: 홍길동\n생년월일: 1980-03-15\n성별: 남\n\n[삼성생명 종신보험]\n월 보험료: 150,000원\n만기: 100세\n납입횟수: 120/240회\n총 납입금액: 18,000,000원\n\n특약:\n일반암진단금 3,000만원 (비갱신, 100세)`}
          className="w-full h-64 rounded-[10px] p-3 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none font-mono transition-colors duration-150"
          style={{ background: '#0c1322', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onParse} disabled={!rawText.trim()} className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
          파싱 시작
        </button>
        <button onClick={onDemo} className="btn-secondary">
          데모 데이터
        </button>
      </div>
    </div>
  )
}

// ── 파싱 결과 에디터 ─────────────────────────────────────────────────────────────
interface ParsedDataEditorProps {
  parsedData: Partial<CustomerData>
  onEdit: (data: Partial<CustomerData>) => void
  onConfirm: () => void
  onReset: () => void
  hasExistingData?: boolean
}

function ParsedDataEditor({ parsedData, onEdit, onConfirm, onReset, hasExistingData }: ParsedDataEditorProps) {
  const info = parsedData.info!
  const contracts = (parsedData.contracts || []) as InsuranceContract[]

  function updateInfo(field: string, value: string | number) {
    onEdit({ ...parsedData, info: { ...info, [field]: value } })
  }

  function updateContract(idx: number, field: keyof InsuranceContract, value: string) {
    const updated = contracts.map((c, i) => i === idx ? { ...c, [field]: value } : c)
    onEdit({ ...parsedData, contracts: updated })
  }

  const totalMonthly = contracts.filter(c => !c.isPaidOff).reduce((s, c) => s + c.monthlyPremium, 0)
  const renewableCount = contracts.filter(c => c.isRenewable).length
  const unparsedCount = contracts.filter(c => !c.companyName || !c.productName).length

  return (
    <div className="space-y-4 animate-in">
      {/* 고객 정보 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">고객 정보</h2>
          {info.birthDate && (
            <span className="text-[11px] text-slate-500">생년월일 {info.birthDate}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1 font-medium">이름</label>
            <input type="text" value={info.name || ''} onChange={(e) => updateInfo('name', e.target.value)}
              className="w-full rounded-[8px] px-3 py-1.5 text-sm text-white focus:outline-none transition-colors duration-150" style={{ background: '#0c1322', border: '1px solid rgba(255,255,255,0.09)' }} data-input="true" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1 font-medium">나이</label>
            <input type="number" value={info.age || ''} onChange={(e) => updateInfo('age', parseInt(e.target.value, 10))}
              className="w-full rounded-[8px] px-3 py-1.5 text-sm text-white focus:outline-none transition-colors duration-150" style={{ background: '#0c1322', border: '1px solid rgba(255,255,255,0.09)' }} data-input="true" />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1 font-medium">성별</label>
            <select value={info.gender || 'M'} onChange={(e) => updateInfo('gender', e.target.value)}
              className="w-full rounded-[8px] px-3 py-1.5 text-sm text-white focus:outline-none transition-colors duration-150" style={{ background: '#0c1322', border: '1px solid rgba(255,255,255,0.09)' }} data-input="true">
              <option value="M">남</option>
              <option value="F">여</option>
            </select>
          </div>
        </div>
      </div>

      {/* 계약 요약 바 */}
      <div className="flex items-center gap-4 px-4 py-2.5 rounded-[10px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-xs text-slate-400">
          계약 <span className="text-white font-semibold">{contracts.length}건</span>
        </div>
        <div className="w-px h-3.5 bg-slate-700" />
        <div className="text-xs text-slate-400">
          월 보험료 <span className="text-white font-semibold">{totalMonthly.toLocaleString()}원</span>
        </div>
        <div className="w-px h-3.5 bg-slate-700" />
        <div className="text-xs text-slate-400">
          갱신형 <span className={`font-semibold ${renewableCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{renewableCount}건</span>
        </div>
        {unparsedCount > 0 && (
          <>
            <div className="w-px h-3.5 bg-slate-700" />
            <div className="text-xs text-yellow-500 font-medium">
              미파싱 {unparsedCount}건 — 아래에서 직접 입력 가능
            </div>
          </>
        )}
      </div>

      {/* 계약 카드 2열 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {contracts.map((contract, idx) => (
          <ContractCard
            key={contract.id}
            contract={contract}
            idx={idx}
            onUpdate={(field, value) => updateContract(idx, field, value)}
          />
        ))}
      </div>

      {/* 액션 버튼 */}
      <div className="flex gap-2 pt-2">
        <button onClick={onConfirm} className="btn-primary">
          {hasExistingData ? '다시 분석' : '분석 시작'}
        </button>
        <button onClick={onReset} className="btn-secondary">
          {hasExistingData ? '새 데이터 입력' : '다시 입력'}
        </button>
      </div>
    </div>
  )
}

// ── 계약 카드 ──────────────────────────────────────────────────────────────────
interface ContractCardProps {
  contract: InsuranceContract
  idx: number
  onUpdate: (field: keyof InsuranceContract, value: string) => void
}

function ContractCard({ contract, idx, onUpdate }: ContractCardProps) {
  const companyMissing = !contract.companyName || contract.companyName.trim() === ''
  const productMissing = !contract.productName || contract.productName.trim() === ''

  // 납입 계산
  const hasPaymentTerm = !!contract.paymentTerm && contract.paymentTerm < 99999 && contract.paymentTerm > 0
  const hasPaymentCount = contract.paymentCount > 0

  // 납입 횟수 표시
  let paymentCountStr: string
  if (contract.isPaidOff) {
    paymentCountStr = '납입완료'
  } else if (contract.paymentTerm === 99999) {
    paymentCountStr = '전기납'
  } else if (hasPaymentCount && hasPaymentTerm) {
    paymentCountStr = `${contract.paymentCount}회 / ${contract.paymentTerm}회`
  } else if (hasPaymentCount) {
    paymentCountStr = `${contract.paymentCount}회`
  } else if (hasPaymentTerm) {
    paymentCountStr = `총 ${contract.paymentTerm}회`
  } else {
    paymentCountStr = '-'
  }

  // 납입 현황 계산
  const totalPremium = hasPaymentTerm ? contract.monthlyPremium * contract.paymentTerm! : null
  const paidAmount = contract.totalPaid > 0 ? contract.totalPaid : null
  const remaining = totalPremium && paidAmount ? Math.max(0, totalPremium - paidAmount) : null

  const fmt = (won: number) => `${Math.floor(won / 10000).toLocaleString()}만`

  return (
    <div className="card p-3.5 flex flex-col gap-2.5">
      {/* 헤더: #번호 · 회사명 + 배지 + 상품명 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* 보험사명 — #번호 인라인 */}
          {companyMissing ? (
            <div className="mb-1">
              <label className="text-[10px] text-yellow-600 font-medium block mb-0.5">보험사명 미파싱</label>
              <input type="text" placeholder="예: 삼성생명"
                onChange={(e) => onUpdate('companyName', e.target.value)}
                className="w-full bg-yellow-950/20 border border-yellow-700/40 rounded px-2 py-1 text-xs text-white placeholder-yellow-900 focus:outline-none focus:border-yellow-500" />
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 font-medium mb-0.5">
              <span className="text-slate-700 mr-1">#{idx + 1}</span>{contract.companyName}
            </p>
          )}
          {/* 상품명 */}
          {productMissing ? (
            <div>
              <label className="text-[10px] text-yellow-600 font-medium block mb-0.5">상품명 미파싱</label>
              <input type="text" placeholder="예: 종신보험 무배당"
                onChange={(e) => onUpdate('productName', e.target.value)}
                className="w-full bg-yellow-950/20 border border-yellow-700/40 rounded px-2 py-1 text-xs text-white placeholder-yellow-900 focus:outline-none focus:border-yellow-500" />
            </div>
          ) : (
            <p className="text-sm font-semibold text-white leading-snug min-h-[2.5rem] flex items-start">{contract.productName}</p>
          )}
        </div>
        {/* 배지 — 갱신여부 + 만기 + 상품유형 */}
        <div className="flex flex-wrap gap-1 flex-shrink-0 mt-0.5">
          {contract.isRenewable ? (
            <span className="text-[10px] bg-red-900/40 text-red-400 border border-red-700/50 px-1.5 py-0.5 rounded-md">갱신</span>
          ) : (
            <span className="text-[10px] bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 px-1.5 py-0.5 rounded-md">비갱신</span>
          )}
          <span className="text-[10px] bg-slate-800/60 text-slate-400 border border-slate-700/40 px-1.5 py-0.5 rounded-md">
            {contract.expiryAge === 9999 ? '종신' : `${contract.expiryAge}세`}
          </span>
          {contract.productType === 'whole_life' && (
            <span className="text-[10px] bg-purple-900/40 text-purple-400 border border-purple-700/50 px-1.5 py-0.5 rounded-md">종신형</span>
          )}
          {contract.productType === 'ci' && (
            <span className="text-[10px] bg-orange-900/40 text-orange-400 border border-orange-700/50 px-1.5 py-0.5 rounded-md">CI</span>
          )}
        </div>
      </div>

      {/* 핵심 지표 2×2 그리드 */}
      <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.06] pt-2.5">
        {/* 월 보험료 */}
        <div className="bg-white/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[9px] text-slate-600 mb-0.5">월 보험료</p>
          <p className={`text-[11px] font-semibold ${contract.isPaidOff ? 'text-emerald-400' : 'text-white'}`}>
            {contract.isPaidOff ? '납입완료' : `${contract.monthlyPremium.toLocaleString()}원`}
          </p>
        </div>
        {/* 납입횟수 */}
        <div className="bg-white/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[9px] text-slate-600 mb-0.5">납입횟수</p>
          <p className={`text-[11px] ${contract.isPaidOff ? 'text-emerald-400' : 'text-slate-300'}`}>{paymentCountStr}</p>
        </div>
        {/* 납입보험료 */}
        <div className="bg-white/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[9px] text-slate-600 mb-0.5">납입보험료</p>
          <p className="text-[11px]">
            {paidAmount != null
              ? <span className="text-white font-medium">{fmt(paidAmount)}</span>
              : <span className="text-slate-700">-</span>}
            {paidAmount != null && totalPremium != null && (
              <span className="text-slate-700"> / <span className="text-slate-500">총 {fmt(totalPremium)}</span></span>
            )}
          </p>
        </div>
        {/* 잔여보험료 */}
        <div className="bg-white/[0.03] rounded-lg px-2.5 py-2">
          <p className="text-[9px] text-slate-600 mb-0.5">잔여보험료</p>
          <p className="text-[11px] text-slate-400">
            {remaining != null && remaining > 0 ? fmt(remaining) : <span className="text-slate-700">-</span>}
          </p>
        </div>
      </div>

      {/* 특약 그룹별 표시 */}
      {contract.riders.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2.5">
          <span className="text-[10px] text-slate-500 font-medium block mb-1.5">
            특약 {contract.riders.length}건
          </span>
          <RiderGroupList riders={contract.riders} />
        </div>
      )}
    </div>
  )
}

const RIDER_GROUPS: Array<{
  key: string
  label: string
  headerClass: string
  primaryCats: string[]
  secondaryCats: string[]
  primaryBadge: string
  secondaryBadge: string
}> = [
  {
    key: 'cancer', label: '암',
    headerClass: 'text-red-500',
    primaryCats: ['cancer_general'],
    secondaryCats: ['cancer_expensive', 'cancer_minor'],
    primaryBadge: 'bg-red-900/40 text-red-400',
    secondaryBadge: 'bg-slate-700/60 text-slate-500',
  },
  {
    key: 'brain', label: '뇌',
    headerClass: 'text-blue-500',
    primaryCats: ['cerebrovascular'],
    secondaryCats: ['stroke', 'brain_hemorrhage'],
    primaryBadge: 'bg-blue-900/40 text-blue-400',
    secondaryBadge: 'bg-slate-700/60 text-slate-500',
  },
  {
    key: 'heart', label: '심',
    headerClass: 'text-amber-500',
    primaryCats: ['ischemic_heart'],
    secondaryCats: ['ami'],
    primaryBadge: 'bg-amber-900/40 text-amber-400',
    secondaryBadge: 'bg-slate-700/60 text-slate-500',
  },
  {
    key: 'loss', label: '실손',
    headerClass: 'text-sky-500',
    primaryCats: ['loss'],
    secondaryCats: [],
    primaryBadge: 'bg-sky-900/40 text-sky-400',
    secondaryBadge: '',
  },
  {
    key: 'surgery_disability', label: '수술·장해',
    headerClass: 'text-slate-500',
    primaryCats: ['surgery', 'disability'],
    secondaryCats: [],
    primaryBadge: 'bg-slate-700/60 text-slate-400',
    secondaryBadge: '',
  },
  {
    key: 'other', label: '기타',
    headerClass: 'text-slate-600',
    primaryCats: ['hospitalization', 'ci_gi', 'other'],
    secondaryCats: [],
    primaryBadge: 'bg-slate-700/60 text-slate-500',
    secondaryBadge: '',
  },
]

function RiderGroupList({ riders }: { riders: InsuranceContract['riders'] }) {
  const groups = RIDER_GROUPS.map(g => {
    const allCats = [...g.primaryCats, ...g.secondaryCats]
    return {
      ...g,
      items: riders
        .filter(r => allCats.includes(r.category))
        .map(r => ({
          rider: r,
          isPrimary: g.primaryCats.includes(r.category),
          badgeClass: g.primaryCats.includes(r.category) ? g.primaryBadge : g.secondaryBadge,
        })),
    }
  }).filter(g => g.items.length > 0)

  return (
    <div className="space-y-1.5">
      {groups.map((group, gi) => (
        <div key={group.key}>
          {gi > 0 && <div className="border-t border-white/[0.05] my-1.5" />}
          <div className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${group.headerClass}`}>
            {group.label}
          </div>
          <div className="space-y-1">
            {group.items.map(({ rider, isPrimary, badgeClass }, rIdx) => (
              <div key={rIdx} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="text-slate-400 min-w-0 flex-1 leading-snug">
                  {rider.name}
                  {rider.isRenewable && <span className="text-red-700 ml-1 text-[9px]">갱신</span>}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-slate-300 font-medium">
                    {rider.amount.toLocaleString()}만
                  </span>
                  <span className={`px-1 py-px rounded text-[9px] ${badgeClass}`}>
                    {getCategoryLabel(rider.category)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    cancer_general:   '일반암',
    cancer_expensive: '고액암',
    cancer_minor:     '소액암',
    brain_hemorrhage: '뇌출혈',
    stroke:           '뇌졸중',
    cerebrovascular:  '뇌혈관',
    ami:              '심근경색',
    ischemic_heart:   '허혈성',
    ci_gi:            'CI/GI',
    loss:             '실손',
    disability:       '장해',
    surgery:          '수술',
    hospitalization:  '입원',
    other:            '기타',
  }
  return labels[category] || category
}

// ── 데모 데이터 ──────────────────────────────────────────────────────────────────
const DEMO_TEXT = `성명: 김철수
생년월일: 1975-06-20
성별: 남
나이: 50세

[한화생명 암보험]
월 보험료: 89,000원
만기: 80세
납입횟수: 120/180회
총 납입금액: 10,680,000원
갱신형

특약:
일반암진단금 2,000만원 (갱신형, 80세)
뇌출혈 1,000만원 (갱신형, 80세)
급성심근경색 1,000만원 (갱신형, 80세)

[교보생명 종신보험]
월 보험료: 230,000원
만기: 100세
납입횟수: 100/240회
총 납입금액: 23,000,000원
비갱신

특약:
일반암진단금 3,000만원 (비갱신, 100세)
뇌혈관질환 2,000만원 (비갱신, 100세)
허혈성심장질환 2,000만원 (비갱신, 100세)`
