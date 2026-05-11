import type {
  InsuranceContract,
  Rider,
  RiderCategory,
  CoverageAnalysis,
  CoverageBreakdown,
  ProblemTags,
  ContractDecision,
  SurrenderValueEstimate,
  AnalysisResult,
  ProcessingDirection,
  RiderWithEffect,
  RiderEffectReason,
} from '../types'

// 뇌혈관 실질 보장 인정 카테고리 (PRD: 뇌혈관질환만 넓은 범위)
const BRAIN_VALID: RiderCategory[] = ['cerebrovascular']
// 심장 실질 보장 인정 카테고리
const HEART_VALID: RiderCategory[] = ['ischemic_heart']
// 암 실질 보장 인정 카테고리 (비갱신 일반암)
const CANCER_VALID: RiderCategory[] = ['cancer_general']
const CANCER_EXPENSIVE: RiderCategory[] = ['cancer_expensive']

// 협소범위 카테고리 (PRD: 뇌졸중도 협소 — 뇌혈관질환 > 뇌졸중 > 뇌출혈 순으로 좁아짐)
const NARROW_SCOPE_BRAIN: RiderCategory[] = ['brain_hemorrhage', 'stroke']
const NARROW_SCOPE_HEART: RiderCategory[] = ['ami']

/**
 * F1-1: 실질 보장금액 계산
 * - 갱신형 특약 → 0원
 * - 협소범위 특약 → 0원
 * - CI/GI 구조 → 0원
 * - 만기 80세 미만 → 0원
 */
export function calculateCoverage(contracts: InsuranceContract[]): CoverageAnalysis {
  let cancerActual = 0
  let brainActual = 0
  let heartActual = 0
  let cancerExpensive = 0

  for (const contract of contracts) {
    for (const rider of contract.riders) {
      if (!isRiderEffective(rider, contract.productType, contract.isRenewable)) continue

      if (CANCER_VALID.includes(rider.category)) {
        cancerActual += rider.amount
      } else if (CANCER_EXPENSIVE.includes(rider.category)) {
        cancerExpensive += rider.amount
      } else if (BRAIN_VALID.includes(rider.category)) {
        brainActual += rider.amount
      } else if (HEART_VALID.includes(rider.category)) {
        heartActual += rider.amount
      }
    }
  }

  return { cancerActual, brainActual, heartActual, cancerExpensive }
}

// 진단금 카테고리 (만기 체크 적용 대상)
const DIAGNOSIS_CATS: RiderCategory[] = [
  'cancer_general', 'cerebrovascular', 'ischemic_heart',
  'stroke', 'brain_hemorrhage', 'ami',
]

function getRiderEffectReason(rider: Rider, productType?: InsuranceContract['productType'], contractIsRenewable?: boolean): RiderEffectReason {
  if (contractIsRenewable || rider.isRenewable) return '갱신형'
  if (rider.category === 'ci_gi') return 'CI/GI구조'
  if (rider.category === 'cancer_expensive' || rider.category === 'cancer_minor') return '해당없음'
  // CI 상품(리빙케어·유니버셜CI 등)의 진단 특약은 구조상 실질 보장 불가
  if (productType === 'ci') return 'CI/GI구조'
  if (NARROW_SCOPE_BRAIN.includes(rider.category)) return '협소범위'
  if (NARROW_SCOPE_HEART.includes(rider.category)) return '협소범위'
  // 진단금: 만기 100세 미만은 실질 0원 (발병 최고조 시기에 보장 소멸)
  if (DIAGNOSIS_CATS.includes(rider.category) && rider.expiryAge > 0 && rider.expiryAge < 100) {
    return rider.expiryAge < 80 ? '만기단기' : '보장기간공백'
  }
  // 진단금 외 (실손·수술·입원 등): 80세 미만만 단기로 처리
  if (!DIAGNOSIS_CATS.includes(rider.category) && rider.expiryAge > 0 && rider.expiryAge < 80) {
    return '만기단기'
  }
  return '유효'
}

function isRiderEffective(rider: Rider, productType?: InsuranceContract['productType'], contractIsRenewable?: boolean): boolean {
  return getRiderEffectReason(rider, productType, contractIsRenewable) === '유효'
}

/**
 * F1-2: 4대 문제 자동 태깅
 */
export function tagProblems(contracts: InsuranceContract[], coverage: CoverageAnalysis): ProblemTags {
  const insufficientCoverage =
    coverage.cancerActual < 5000 ||
    coverage.brainActual < 3000 ||
    coverage.heartActual < 3000

  const hasRenewable = contracts.some(
    (c) => c.isRenewable || c.riders.some((r) => r.isRenewable)
  )

  // 보장기간 공백: 핵심 진단금(암·뇌혈관·허혈심장) 특약 만기 100세 미만 (계약 전체 만기 무관)
  const hasCoverageGap = contracts.some((c) =>
    c.riders.some(
      (r) =>
        CORE_DIAGNOSIS_CATS.includes(r.category) &&
        !r.isRenewable &&
        r.expiryAge > 0 && r.expiryAge < 100
    )
  )

  // 협소범위: 뇌출혈, 급성심근경색 담보 존재
  const hasNarrowScope = contracts.some((c) =>
    c.riders.some(
      (r) => NARROW_SCOPE_BRAIN.includes(r.category) || NARROW_SCOPE_HEART.includes(r.category)
    )
  )

  return { insufficientCoverage, hasRenewable, hasCoverageGap, hasNarrowScope }
}

// 핵심 진단금 카테고리 (판단 대상: 넓은범위만)
const CORE_DIAGNOSIS_CATS: RiderCategory[] = ['cancer_general', 'cerebrovascular', 'ischemic_heart']

// 진단금 전체 (자동정리 판단 기준)
const ALL_DIAG_CATS: RiderCategory[] = [
  'cancer_general', 'cancer_expensive', 'cerebrovascular', 'ischemic_heart',
  'stroke', 'brain_hemorrhage', 'ami', 'ci_gi',
]

function autoTerminateReason(
  contract: InsuranceContract,
  flags: { shortExpiry: boolean; allRenewable: boolean; isCI: boolean; myhealth: boolean; allNarrow: boolean }
): string {
  if (flags.shortExpiry) return `전체 ${contract.expiryAge}세 만기 — 발병 최고조 시기에 보장 소멸`
  if (flags.allRenewable) return '전체 갱신형 — 실질 진단금 0원'
  if (flags.isCI) return 'CI/GI 구조 — 실질 진단금 0원'
  if (flags.myhealth) return '마이헬스 패턴 — 진단금 전체 갱신형, 실질 0원'
  if (flags.allNarrow) return '핵심 진단금 전부 협소범위 — 실질 0원'
  return '실질 진단금 0원'
}

/**
 * F1-3: 보험별 처리 방향 분류 (판단 1~5)
 */
export function classifyContracts(contracts: InsuranceContract[]): ContractDecision[] {
  return contracts.map((contract) => {
    const riders = contract.riders
    const problematicRiders: string[] = []

    // ── 판단 4 자동 정리 조건 ──────────────────────────────────
    // 90세 이하 계약 전체 만기 → 발병 최고조 시기 보장 소멸 → 무조건 정리
    const shortExpiry = contract.expiryAge > 0 && contract.expiryAge < 100
    const allRenewable = contract.isRenewable
    const isCI = contract.productType === 'ci'

    // 마이헬스 패턴: ALL_DIAG_CATS 기반 (삼성은 ci_gi/stroke/ami 등 포함)
    const allDiagRiders = riders.filter((r) => ALL_DIAG_CATS.includes(r.category) && r.amount > 0)
    const myhealth = /마이헬스/.test(contract.productName ?? '') &&
      allDiagRiders.length > 0 && allDiagRiders.every((r) => r.isRenewable)

    // 핵심 진단금이 모두 협소범위 (CORE_DIAGNOSIS_CATS 기준)
    const coreDiagRiders = riders.filter((r) => CORE_DIAGNOSIS_CATS.includes(r.category))
    const allNarrow = coreDiagRiders.length > 0 &&
      coreDiagRiders.every((r) => NARROW_SCOPE_BRAIN.includes(r.category) || NARROW_SCOPE_HEART.includes(r.category))

    const autoTerminate = shortExpiry || allRenewable || isCI || myhealth || allNarrow

    // ── 판단 1: keepable 진단금 ──────────────────────────────────
    // 암 포함 모든 핵심 진단금: 100세 이상이어야 keepable (90세 = 보장공백 = 실질 0원)
    const isKeepableDiagnosis = (r: Rider): boolean => {
      if (r.isRenewable) return false
      if (contract.productType === 'ci' || r.category === 'ci_gi') return false
      if (!CORE_DIAGNOSIS_CATS.includes(r.category)) return false
      if (NARROW_SCOPE_BRAIN.includes(r.category) || NARROW_SCOPE_HEART.includes(r.category)) return false
      return r.expiryAge === 0 || r.expiryAge === 9999 || r.expiryAge >= 100
    }

    const keepableDiagRiders = riders.filter(isKeepableDiagnosis)
    const hasKeepableDiag = keepableDiagRiders.length > 0

    // ── 문제 특약 수집 ────────────────────────────────────────────
    for (const rider of riders) {
      if (rider.isRenewable) {
        problematicRiders.push(`갱신형: ${rider.name}`)
      } else if (rider.category === 'ci_gi') {
        problematicRiders.push(`CI/GI: ${rider.name}`)
      } else if (NARROW_SCOPE_BRAIN.includes(rider.category) || NARROW_SCOPE_HEART.includes(rider.category)) {
        problematicRiders.push(`협소범위: ${rider.name}`)
      } else if (
        // 핵심 진단금(암·뇌혈관·허혈심장) 100세 미만 → 보장공백
        CORE_DIAGNOSIS_CATS.includes(rider.category) &&
        !rider.isRenewable &&
        rider.expiryAge > 0 && rider.expiryAge < 100
      ) {
        problematicRiders.push(`보장공백: ${rider.name}(${rider.expiryAge}세)`)
      }
    }

    // ── 판단 3: 유지 가치 있는 기타 보장 ─────────────────────────
    // "납입완료 + 실질 진단금 없음 → 정리" 규칙에 따라 isPaidOff는 valuabe coverage 아님
    const hasValuableCoverage =
      !contract.isRenewable && (
        // 비갱신 100세 이상 수술비
        riders.some((r) => r.category === 'surgery' && !r.isRenewable &&
          (r.expiryAge === 9999 || r.expiryAge >= 100)) ||
        // 비갱신 100세 이상 후유장해
        riders.some((r) => r.category === 'disability' && !r.isRenewable &&
          (r.expiryAge === 9999 || r.expiryAge >= 100)) ||
        // 실손보험
        riders.some((r) => r.category === 'loss') ||
        // 비갱신 100세 이상 사망보험금
        riders.some((r) => r.category === 'death' && !r.isRenewable &&
          (r.expiryAge === 9999 || r.expiryAge >= 100))
      )

    // ── 방향 결정 ──────────────────────────────────────────────────
    let direction: ProcessingDirection
    let reason: string

    const flags = { shortExpiry, allRenewable, isCI, myhealth, allNarrow }

    if (autoTerminate) {
      if (hasValuableCoverage) {
        direction = 'adjust'
        reason = autoTerminateReason(contract, flags) + ' — 기타 보장 유지, 문제 특약 정리'
      } else {
        direction = 'terminate'
        reason = autoTerminateReason(contract, flags)
      }
    } else if (hasKeepableDiag) {
      if (problematicRiders.length > 0) {
        direction = 'adjust'
        reason = '실질 진단금 있음 — 문제 특약 정리 필요'
      } else {
        direction = 'keep'
        reason = '비갱신·넓은범위·100세 만기 조건 충족'
      }
    } else {
      // 실질 진단금 없음
      if (hasValuableCoverage) {
        direction = problematicRiders.length > 0 ? 'adjust' : 'keep'
        reason = problematicRiders.length > 0
          ? '실질 진단금 없음 — 기타 보장 유지, 문제 특약 정리'
          : '실질 진단금 없음 — 기타 보장(실손·수술·장해·사망) 유지'
      } else {
        direction = 'terminate'
        reason = '실질 인정 진단금 없음 + 유지 가치 있는 기타 보장 없음'
      }
    }

    return { contractId: contract.id, direction, reason, problematicRiders }
  })
}

/**
 * F1-4: 해약환급금 추정
 */
export function estimateSurrenderValues(contracts: InsuranceContract[]): SurrenderValueEstimate[] {
  return contracts.map((contract) => {
    const totalPaidMan = Math.floor(contract.totalPaid / 10000)
    const years = contract.paymentCount / 12

    let minRatio = 0
    let maxRatio = 0
    let basis = ''

    // 무해지형/해지환급금미지급형/(무) 표기 → 해약환급금 없음
    if (/무해지|해지환급금미지급|\(무\)/.test(contract.productName)) {
      return {
        contractId: contract.id,
        productName: contract.productName,
        minValue: 0,
        maxValue: 0,
        basis: '무해지형 — 해약환급금 없음',
      }
    }

    // 실질 갱신형: 계약 전체 갱신형이거나 금액이 있는 모든 특약이 갱신형
    const hasNonRenewableRider = contract.riders.some((r) => !r.isRenewable && r.amount > 0)
    if (contract.isRenewable || !hasNonRenewableRider) {
      return {
        contractId: contract.id,
        productName: contract.productName,
        minValue: 0,
        maxValue: 0,
        basis: '갱신형 구조 — 적립금 없음',
      }
    }

    if (contract.isRenewable) {
      minRatio = 0
      maxRatio = 0
      basis = '갱신형 구조 — 적립금 없음'
    } else if (contract.productType === 'whole_life') {
      if (years >= 15) {
        minRatio = 0.75
        maxRatio = 0.85
        basis = '종신보험 15년 이상 납입 — 납입금의 75~85%'
      } else if (years < 10) {
        minRatio = 0.40
        maxRatio = 0.60
        basis = '종신보험 10년 미만 납입 — 납입금의 40~60%'
      } else {
        minRatio = 0.60
        maxRatio = 0.75
        basis = '종신보험 10~15년 납입 — 납입금의 60~75%'
      }
    } else {
      minRatio = 0.50
      maxRatio = 0.70
      basis = '비갱신 건강보험 중도 해지 — 납입금의 50~70%'
    }

    return {
      contractId: contract.id,
      productName: contract.productName,
      minValue: Math.floor(totalPaidMan * minRatio),
      maxValue: Math.floor(totalPaidMan * maxRatio),
      basis,
    }
  })
}

/**
 * 커버리지 breakdown — 각 특약의 유효/무효 이유 포함
 */
export function buildCoverageBreakdown(contracts: InsuranceContract[]): CoverageBreakdown {
  const cancer: RiderWithEffect[] = []
  const brain: RiderWithEffect[] = []
  const heart: RiderWithEffect[] = []

  const CANCER_CATS: RiderCategory[] = ['cancer_general', 'cancer_expensive', 'cancer_minor', 'ci_gi']
  const BRAIN_CATS: RiderCategory[] = ['cerebrovascular', 'stroke', 'brain_hemorrhage']
  const HEART_CATS: RiderCategory[] = ['ischemic_heart', 'ami']

  for (const contract of contracts) {
    const contractName = `${contract.companyName} ${contract.productName}`.trim()
    for (const rider of contract.riders) {
      const reason = getRiderEffectReason(rider, contract.productType, contract.isRenewable)
      const isEffective = reason === '유효'
      const effectiveAmount = isEffective ? rider.amount : 0

      const base: RiderWithEffect = {
        ...rider,
        contractId: contract.id,
        contractName,
        isEffective,
        effectReason: reason,
        effectiveAmount,
      }

      if (CANCER_CATS.includes(rider.category)) cancer.push(base)
      else if (BRAIN_CATS.includes(rider.category)) brain.push(base)
      else if (HEART_CATS.includes(rider.category)) heart.push(base)
    }
  }

  return { cancer, brain, heart }
}

/**
 * 전체 분석 실행 (F1-1 ~ F1-4)
 */
export function runFullAnalysis(contracts: InsuranceContract[]): AnalysisResult {
  const coverage = calculateCoverage(contracts)
  const breakdown = buildCoverageBreakdown(contracts)
  const problems = tagProblems(contracts, coverage)
  const decisions = classifyContracts(contracts)
  const surrenderValues = estimateSurrenderValues(
    contracts.filter((c) => {
      const decision = decisions.find((d) => d.contractId === c.id)
      return decision?.direction === 'terminate'
    })
  )
  const totalMonthlyPremium = contracts.reduce((sum, c) => sum + c.monthlyPremium, 0)
  // 납입 완료된 계약은 실제 납입액 0원으로 계산
  const effectiveMonthlyPremium = contracts.reduce(
    (sum, c) => sum + (c.isPaidOff ? 0 : c.monthlyPremium),
    0
  )

  return { coverage, breakdown, problems, decisions, surrenderValues, totalMonthlyPremium, effectiveMonthlyPremium }
}
