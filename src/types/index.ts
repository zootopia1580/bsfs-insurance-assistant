export type RiderCategory =
  | 'cancer_general'   // 일반암 — 중요 (착색)
  | 'cancer_expensive' // 고액암 — 회색
  | 'cancer_minor'     // 소액암/유사암 — 회색
  | 'brain_hemorrhage' // 뇌출혈 — 협소범위, 회색
  | 'specific_cerebrovascular'   // 특정뇌혈관질환 — 협소범위
  | 'stroke'           // 뇌졸중 — 협소범위, 회색
  | 'cerebrovascular'  // 뇌혈관질환 — 중요 (착색)
  | 'specific_ischemic_heart'    // 특정허혈성심장질환 — 협소범위
  | 'ami'              // 급성심근경색 — 협소범위, 회색
  | 'ischemic_heart'   // 허혈성심장질환 — 중요 (착색)
  | 'ci_gi'
  | 'loss'             // 실손의료비
  | 'disability'       // 후유장해
  | 'surgery'          // 수술비
  | 'hospitalization'  // 입원비
  | 'death'            // 사망보험금 (상해/질병)
  | 'other'

export type RiderEffectReason =
  | '유효'
  | '갱신형'
  | '협소범위'
  | 'CI/GI구조'
  | '만기단기'
  | '보장기간공백'
  | '해당없음'

export type ProductType = 'whole_life' | 'health' | 'ci' | 'other'

export type ProcessingDirection = 'keep' | 'adjust' | 'terminate'

export type CFStage = 'CF1' | 'CF2' | 'CF3' | 'CF4' | 'CF5'

export interface CustomerInfo {
  name: string
  age: number
  gender: 'M' | 'F'
  birthDate: string
  anniversaryDate: string
}

export interface Rider {
  id?: string
  name: string
  amount: number
  expiryAge: number
  expiryDate?: string   // 원본 날짜 문자열 "2074.01.31"
  isRenewable: boolean
  category: RiderCategory
}

export interface RiderWithEffect extends Rider {
  contractId: string
  contractName: string
  isEffective: boolean
  effectReason: RiderEffectReason
  effectiveAmount: number
}

export interface InsuranceContract {
  id: string
  companyName: string
  productName: string
  monthlyPremium: number
  expiryAge: number
  paymentCount: number
  paymentTerm?: number   // 납입기간 총 개월 수 (20년납=240, 전기납=99999)
  isPaidOff?: boolean    // 납입 완료 여부
  totalPaid: number
  isRenewable: boolean
  productType: ProductType
  riders: Rider[]
}

export interface CoverageAnalysis {
  cancerActual: number
  brainActual: number
  heartActual: number
  cancerExpensive: number
}

export interface ProblemTags {
  insufficientCoverage: boolean
  hasRenewable: boolean
  hasCoverageGap: boolean
  hasNarrowScope: boolean
}

export interface ContractDecision {
  contractId: string
  direction: ProcessingDirection
  reason: string
  problematicRiders: string[]
}

export interface SurrenderValueEstimate {
  contractId: string
  productName: string
  minValue: number
  maxValue: number
  basis: string
}

export interface CoverageBreakdown {
  cancer: RiderWithEffect[]
  brain: RiderWithEffect[]
  heart: RiderWithEffect[]
}

export interface AnalysisResult {
  coverage: CoverageAnalysis
  breakdown: CoverageBreakdown
  problems: ProblemTags
  decisions: ContractDecision[]
  surrenderValues: SurrenderValueEstimate[]
  totalMonthlyPremium: number        // 납입 완료 포함 전체
  effectiveMonthlyPremium: number    // 현재 실제 납입 중인 금액만
}

export interface NewPlanData {
  contracts: Array<{ companyName: string; productName: string; monthlyPremium: number }>
  totalMonthlyPremium: number
  coverageCancer: number
  coverageBrain: number
  coverageHeart: number
  rawText: string
}

export interface CustomerData {
  info: CustomerInfo
  contracts: InsuranceContract[]
  analysis?: AnalysisResult
}

export interface ResistanceDetection {
  type: string
  label: string
  keywords: string[]
}

export type MDStage =
  | 'MD1-1' | 'MD1-2' | 'MD1-3' | 'MD1-4'
  | 'MD2-1' | 'MD2-2' | 'MD2-2b' | 'MD2-3a' | 'MD2-3b' | 'MD2-3c' | 'MD2-3d'
  | 'MD2-4' | 'MD2-5' | 'MD2-6' | 'MD2-7'
  | 'MD3-1' | 'MD3-2' | 'MD3-3'
  | 'MD4-1a' | 'MD4-1b' | 'MD4-1c' | 'MD4-1d' | 'MD4-1e'
  | 'MD4-2' | 'MD4-3' | 'MD4-4'
  | 'MD5-1' | 'MD5-2'
