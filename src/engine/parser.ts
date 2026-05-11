import type { CustomerInfo, InsuranceContract, Rider, RiderCategory, ProductType } from '../types'

export interface ParsedData {
  customerInfo: Partial<CustomerInfo>
  contracts: Partial<InsuranceContract>[]
  rawText: string
}

// ────────────────────────────────────────────
// 특약명 → 카테고리 매핑
// ────────────────────────────────────────────
const RIDER_CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: RiderCategory }> = [
  // ── 수술비 — 진단금보다 반드시 먼저 체크 (뇌혈관/심장 수술비는 진단금 아님) ──
  { pattern: /뇌혈관.*수술비|뇌혈관질환수술비/, category: 'surgery' },
  { pattern: /허혈성심장.*수술비|허혈심장.*수술비|심장질환수술비|심장.*수술비/, category: 'surgery' },
  { pattern: /\d+대\s*질병수술비|질병\d+[~-]\d+종수술비|질병수술비/, category: 'surgery' },
  { pattern: /상해수술비|재해수술비/, category: 'surgery' },
  // ── 뇌: 특정(협소) 먼저, 그 다음 넓은 범위 ──
  { pattern: /특정\s*뇌혈관질환/, category: 'stroke' },   // 협소범위
  { pattern: /뇌혈관질환/, category: 'cerebrovascular' }, // 넓은 범위
  { pattern: /뇌졸중/, category: 'stroke' },
  { pattern: /뇌출혈/, category: 'brain_hemorrhage' },
  // ── 심장: 특정(협소) 먼저, 그 다음 넓은 범위 ──
  { pattern: /특정\s*허혈성심장질환|특정\s*허혈심장/, category: 'ami' },  // 협소범위
  { pattern: /허혈성심장질환|허혈심장질환|허혈성\s*심장/, category: 'ischemic_heart' },
  { pattern: /급성심근경색|주요심장질환/, category: 'ami' },
  // ── CI/GI 구조 담보 — 암·뇌·심장 폴백보다 먼저 체크 ──
  { pattern: /CI추가보장|중대한?\s*질병|중대한?\s*질환|산정특례|CI보험|GI보험|중증질환.*진단/, category: 'ci_gi' },
  // ── 고액/희귀 암 ──
  { pattern: /고액치료비암|5대고액|희귀난치|고액암|백혈병/, category: 'cancer_expensive' },
  // ── 일반암: "유사암 제외" 명시 or "일반암" 명칭 → 기타암 패턴보다 반드시 먼저 체크 ──
  { pattern: /유사암\s*제외|일반암/, category: 'cancer_general' },
  // ── 기타암 (소액/유사/특정 등) ──
  { pattern: /유사암|소액암|갑상선암|기타피부암|경계성종양/, category: 'cancer_minor' },
  { pattern: /소아암|전이암|특정암|재진단암/, category: 'cancer_minor' },
  // ── 일반암 진단비 (특약명에 "암진단" 포함, 위에서 미분류된 경우) ──
  { pattern: /암진단/, category: 'cancer_general' },
  // ── 암 치료·수술·통원·사망·검진 — 진단비 아님 (폴백 전에 먼저 처리) ──
  { pattern: /암수술|암.*직접치료수술/, category: 'surgery' },
  { pattern: /항암|암직접치료통원|암.*통원일당|항구토제|약제비/, category: 'other' },
  // ── 사망보험금 — 암사망보다 먼저 체크 ──
  { pattern: /상해\s*사망|질병\s*사망|사망보험금/, category: 'death' },
  { pattern: /암사망|암.*입원일당|암.*입원비/, category: 'other' },
  { pattern: /검진비|검진특약/, category: 'other' },
  // ── 실손/수술/입원/장해 ──
  { pattern: /실손의료비|실손/, category: 'loss' },
  { pattern: /후유장해|영구장해/, category: 'disability' },
  { pattern: /수술비|수술특약|수술급여금/, category: 'surgery' },
  { pattern: /입원일당|입원비|입원급여금/, category: 'hospitalization' },
]

function categorizeRider(name: string): RiderCategory {
  for (const { pattern, category } of RIDER_CATEGORY_PATTERNS) {
    if (pattern.test(name)) return category
  }
  // 암 글자 포함 + 수술·치료·통원·입원·사망·약제·검진이 아닌 경우 → 일반암 진단으로 간주
  if (/암/.test(name) && !/수술|치료비?|통원|방사선|약물|약제|입원|사망|사고|검진/.test(name)) return 'cancer_general'
  return 'other'
}

function detectProductType(productName: string): ProductType {
  // CI 구조 상품 — 종신 판단보다 먼저 체크
  if (/CI보험|GI보험|유니버셜\s*CI|리빙케어|뉴리빙케어|LivingCare|헬스케어|종신\s*CI/.test(productName)) return 'ci'
  if (/종신/.test(productName)) return 'whole_life'
  return 'health'
}

// ────────────────────────────────────────────
// 숫자 파싱 헬퍼
// ────────────────────────────────────────────
function parseAmountMan(text: string): number {
  const manMatch = text.match(/([0-9,]+)\s*만\s*원?/)
  if (manMatch) return parseInt(manMatch[1].replace(/,/g, ''), 10)
  const okMatch = text.match(/([0-9,]+)\s*억\s*([0-9,]*)\s*만?/)
  if (okMatch) {
    const ok = parseInt(okMatch[1].replace(/,/g, ''), 10) * 10000
    const man = okMatch[2] ? parseInt(okMatch[2].replace(/,/g, ''), 10) : 0
    return ok + man
  }
  return 0
}

function parseAmountWon(text: string): number {
  const m = text.match(/([0-9,]+)\s*원/)
  if (!m) return 0
  return parseInt(m[1].replace(/,/g, ''), 10)
}

function parseAgeFromText(text: string): number {
  const m = text.match(/\((\d+)세\)/)
  if (m) return parseInt(m[1], 10)
  const m2 = text.match(/(\d+)세/)
  if (m2) return parseInt(m2[1], 10)
  return 0
}

// ────────────────────────────────────────────
// 고객 정보 파싱
// ────────────────────────────────────────────
function parseCustomerInfo(text: string): Partial<CustomerInfo> {
  const info: Partial<CustomerInfo> = {}
  const header = text.slice(0, 500)

  const nameMatch =
    header.match(/([가-힣]{2,5})님의\s*보험\s*분석/) ||
    header.match(/회원명\s*\n?\s*([가-힣]{2,5})/) ||
    header.match(/성명\s*[:：]\s*([가-힣]{2,5})/)
  if (nameMatch) info.name = nameMatch[1]

  if (/여성|여자|성별\s*[:：]\s*여/.test(header)) info.gender = 'F'
  else if (/남성|남자|성별\s*[:：]\s*남/.test(header)) info.gender = 'M'

  const birthMatch =
    header.match(/생년월일\s*\n?\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/) ||
    text.match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/)
  if (birthMatch) {
    const [, y, m, d] = birthMatch
    info.birthDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const ageMatch =
    header.match(/보험나이\s*\n?\s*(\d+)세/) ||
    header.match(/나이\s*[:：]\s*(\d+)세/) ||
    header.match(/만\s*(\d+)세/)
  if (ageMatch) info.age = parseInt(ageMatch[1], 10)
  if (!info.age && info.birthDate) {
    info.age = new Date().getFullYear() - parseInt(info.birthDate.slice(0, 4), 10)
  }

  const annivMatch = text.match(/상령일\s*\n?\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (annivMatch) {
    const year = new Date().getFullYear()
    info.anniversaryDate = `${year}-${annivMatch[1].padStart(2, '0')}-${annivMatch[2].padStart(2, '0')}`
  }

  return info
}

// ────────────────────────────────────────────
// 보험 계약 목록 섹션에서 상품명 → 갱신형 여부 맵 추출
// 뱅크샐러드 데이터는 보험 계약 목록 섹션에 "갱신형" / "비갱신형" 태그를
// 상품명 바로 앞 줄에 표시하므로, 특약 리스트 파싱 전에 이 정보를 수집.
// ────────────────────────────────────────────
function extractContractRenewalMap(text: string): Map<string, boolean> {
  const result = new Map<string, boolean>()

  // 특약 리스트 섹션 시작 전까지만 탐색 (이후는 특약 데이터)
  const riderListStart = text.search(/보험별\s*특약\s*리스트\s*[❶①]/)
  const searchArea = riderListStart > 0 ? text.slice(0, riderListStart) : text.slice(0, 10000)

  const lines = searchArea.split('\n').map((l) => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (line !== '갱신형' && line !== '비갱신형') continue

    const nextLine = lines[i + 1]
    // 상품명 조건: 한글 포함, 3자 이상, 100자 이하, 숫자로 시작하지 않음, 필드 레이블 아님
    if (
      nextLine.length >= 3 &&
      nextLine.length < 100 &&
      /[가-힣]/.test(nextLine) &&
      !/^\d/.test(nextLine) &&
      !/^(보험사명|계약자|피보험|납입|월\s*보험료|총\s*보험료|보장|계약일|보험명)/.test(nextLine)
    ) {
      result.set(nextLine, line === '갱신형')
    }
  }

  return result
}

// ────────────────────────────────────────────
// 상품명 퍼지 매칭 (섹션 3 renewalMap ↔ 섹션 6 productName)
// 뱅크샐러드에서 섹션별 상품명 표기가 미묘하게 다를 수 있음.
// 우선순위: 완전일치 → (무) 제거 후 일치 → 포함 관계
// ────────────────────────────────────────────
function findInRenewalMap(
  productName: string,
  renewalMap: Map<string, boolean>
): boolean | undefined {
  // 1순위: 완전 일치
  if (renewalMap.has(productName)) return renewalMap.get(productName)!

  const normalize = (s: string) =>
    s.replace(/^\s*\(무\)\s*/, '').replace(/\s+/g, ' ').trim()
  const normName = normalize(productName)

  for (const [key, val] of renewalMap) {
    const normKey = normalize(key)

    // 2순위: (무) 제거 + 공백 정규화 후 일치
    if (normKey === normName) return val

    // 3순위: 포함 관계 (단 4자 이상이어야 오매칭 방지)
    if (normKey.length >= 4 && normName.length >= 4) {
      if (normKey.includes(normName) || normName.includes(normKey)) return val
    }
  }

  return undefined
}

// ────────────────────────────────────────────
// 특약 리스트 ❶❷❸❹ 섹션 파싱 (메인 경로)
// 핵심: 각 번호의 첫 번째 등장만 사용 (중복 데이터 무시)
// ────────────────────────────────────────────
function parseFromRiderSections(text: string, renewalMap: Map<string, boolean> = new Map()): Partial<InsuranceContract>[] {
  const NUMBER_CHARS = ['❶','❷','❸','❹','❺','❻','❼','❽','❾','①','②','③','④','⑤','⑥','⑦','⑧','⑨']

  // 각 번호의 첫 번째 등장 위치만 수집
  const firstOccurrences: Array<{ pos: number; num: string }> = []
  for (const num of NUMBER_CHARS) {
    const marker = `보험별 특약 리스트 ${num}`
    const idx = text.indexOf(marker) // indexOf = 무조건 첫 번째
    if (idx !== -1) firstOccurrences.push({ pos: idx, num })
  }

  if (firstOccurrences.length === 0) return []

  // 위치 순 정렬
  firstOccurrences.sort((a, b) => a.pos - b.pos)

  return firstOccurrences
    .map(({ pos, num }, i) => {
      const nextFirstPos = firstOccurrences[i + 1]?.pos ?? text.length

      // 같은 번호가 섹션 내에 또 나오면 (중복) 그 직전까지만 사용
      const sameMarker = `보험별 특약 리스트 ${num}`
      const dupPos = text.indexOf(sameMarker, pos + sameMarker.length + 10)
      const sectionEnd = dupPos !== -1 && dupPos < nextFirstPos ? dupPos : nextFirstPos

      const section = text.slice(pos, sectionEnd)
      return parseSingleRiderSection(section, i, renewalMap)
    })
    .filter((c): c is Partial<InsuranceContract> => c !== null)
}

function parseSingleRiderSection(
  section: string,
  index: number,
  renewalMap: Map<string, boolean> = new Map()
): Partial<InsuranceContract> | null {
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean)

  const contract: Partial<InsuranceContract> = {
    id: `contract_${index + 1}`,
    riders: [],
    isRenewable: false,
    paymentCount: 0,
    totalPaid: 0,
    expiryAge: 100,
  }

  let inRiderTable = false
  let companyFound = false
  let productFound = false

  const COMPANY_PATTERN = /메리츠|교보|삼성|한화|현대|흥국|DB손해|AIA|라이나|푸본|농협|신한|KB|롯데|미래에셋|동양|처브|DB생명|우체국/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 보험사명
    if (!companyFound && COMPANY_PATTERN.test(line) && line.length < 20) {
      contract.companyName = line
      companyFound = true
      continue
    }

    // 상품명 — 보험사 다음 첫 번째 비레이블 라인 (요구조건 완화)
    if (companyFound && !productFound) {
      const isFieldLabel = /^(보장기간|납입기간|납입횟수|납입완료|월\s*보험료|총\s*보험료|계약자|피보험자|수익자|갱신형|비갱신형?|특약명|특약\s*리스트|보험별\s*특약)/.test(line)
      const isSectionMarker = /보험별\s*특약\s*리스트|[❶❷❸❹❺❻❼❽❾①②③④⑤⑥⑦⑧⑨]/.test(line)
      const isShortGarbage = line.length < 3
      if (!isFieldLabel && !isSectionMarker && !isShortGarbage && line.length < 80) {
        contract.productName = line
        contract.productType = detectProductType(line)
        productFound = true
        continue
      }
    }

    // 보장기간 → 만기나이
    // 포맷: "보장기간" 단독 줄 + 다음 줄 날짜, 또는 "보장기간 / 2085. 01. 01 (100세)" 인라인
    if (/보장기간/.test(line)) {
      const combined = line + ' ' + (lines[i + 1] ?? '')
      if (/9999|8025|종신/.test(combined)) {
        contract.expiryAge = 9999
      } else if (/갱신형/.test(combined)) {
        contract.isRenewable = true
        const age = parseAgeFromText(combined)
        if (age > 0) contract.expiryAge = age
      } else {
        const age = parseAgeFromText(combined)
        if (age > 0) contract.expiryAge = age
      }
      continue
    }

    // 월 보험료 — "월 보험료\n금액", "월 보험료 / 금액", "월 보험료 금액" 세 가지 포맷
    if (/^월\s*보험료$/.test(line)) {
      contract.monthlyPremium = parseAmountWon(lines[i + 1] ?? '')
      i++
      continue
    }
    if (/^월\s*보험료\s*[\/／]/.test(line) || /^월\s*보험료\s+[0-9]/.test(line)) {
      contract.monthlyPremium = parseAmountWon(line)
      continue
    }

    // 납입완료 보험료
    if (/납입완료\s*보험료$/.test(line)) {
      contract.totalPaid = parseAmountWon(lines[i + 1] ?? '')
      i++
      continue
    }
    if (/납입완료\s*보험료\s*[\/／]/.test(line) || /납입완료\s*보험료\s+[0-9]/.test(line)) {
      contract.totalPaid = parseAmountWon(line)
      continue
    }

    // 총 보험료 — paymentTerm 역산용
    if (/^총\s*보험료$/.test(line)) {
      const total = parseAmountWon(lines[i + 1] ?? '')
      if (total > 0) { (contract as Record<string, unknown>)._totalPremium = total; i++ }
      continue
    }
    if (/^총\s*보험료\s*[\/／]/.test(line) || /^총\s*보험료\s+[0-9]/.test(line)) {
      const total = parseAmountWon(line)
      if (total > 0) (contract as Record<string, unknown>)._totalPremium = total
      continue
    }

    // 납입예정 보험료 — 0원이면 납입완료
    if (/납입예정\s*보험료$/.test(line)) {
      ;(contract as Record<string, unknown>)._expectedPremium = parseAmountWon(lines[i + 1] ?? '')
      i++
      continue
    }
    if (/납입예정\s*보험료\s*[\/／]/.test(line) || /납입예정\s*보험료\s+[0-9]/.test(line)) {
      ;(contract as Record<string, unknown>)._expectedPremium = parseAmountWon(line)
      continue
    }

    // 납입기간 (20년납/전기납 등)
    if (/납입기간/.test(line)) {
      const combined = line + ' ' + (lines[i + 1] ?? '')
      const yearMatch = combined.match(/(\d+)년\s*납/)
      if (yearMatch) {
        contract.paymentTerm = parseInt(yearMatch[1], 10) * 12
      } else if (/전기납/.test(combined)) {
        contract.paymentTerm = 99999
      }
      continue
    }

    // 납입횟수 — "N/M"(현재/전체) 또는 단독 숫자(=전체 납입기간)
    // 값이 다음 줄에 올 수 있으므로 next line도 확인
    if (/납입횟수/.test(line)) {
      const valueLine = /\d/.test(line) ? line : (lines[i + 1] ?? '')
      const slashMatch = valueLine.match(/(\d+)\s*\/\s*(\d+)/)
      if (slashMatch) {
        contract.paymentCount = parseInt(slashMatch[1], 10)
        contract.paymentTerm = parseInt(slashMatch[2], 10)
        if (valueLine !== line) i++
      } else {
        const single = valueLine.match(/(\d+)/)
        if (single && !contract.paymentTerm) {
          contract.paymentTerm = parseInt(single[1], 10)
          if (valueLine !== line) i++
        }
      }
      continue
    }

    // 계약 전체가 갱신형인지
    if (/^갱신형$/.test(line)) { contract.isRenewable = true; continue }
    if (/^비갱신형$/.test(line)) { contract.isRenewable = false; continue }

    // 특약 테이블 헤더 감지
    if (/특약명.*피보험자.*보유|특약명\s*피보험자/.test(line)) {
      inRiderTable = true
      continue
    }

    // 특약 테이블 종료 (섹션 구분자)
    if (/[가-힣]+[화재|생명|손해]+\s*—\s*특약\s*리스트/.test(line) ||
        /^보험별\s*특약\s*리스트/.test(line)) {
      inRiderTable = false
      continue
    }

    // 카테고리 소제목 행 스킵
    if (/^진단\s*관련\s*특약$|^의료.*실손.*입원|^사망\s*\/\s*장해|^기타\s*특약$|^수술비$/.test(line)) {
      continue
    }

    // 특약 행 파싱
    if (inRiderTable) {
      const rider = parseRiderLine(line)
      if (rider) {
        contract.riders = contract.riders ?? []
        contract.riders.push(rider)
      }
    }
  }

  // 섹션 3 갱신형/비갱신형 태그 최우선 적용 (퍼지 매칭)
  if (contract.productName) {
    const renewalFromMap = findInRenewalMap(contract.productName, renewalMap)
    if (renewalFromMap !== undefined) {
      contract.isRenewable = renewalFromMap
    }
  }

  // paymentTerm 역산: 총 보험료 ÷ 월보험료 (납입기간 미파싱 시)
  const totalPremium = (contract as Record<string, unknown>)._totalPremium as number | undefined
  if (!contract.paymentTerm && totalPremium && contract.monthlyPremium && contract.monthlyPremium > 0) {
    contract.paymentTerm = Math.round(totalPremium / contract.monthlyPremium)
  }

  // paymentCount 역산: 납입완료 보험료 ÷ 월보험료
  if (!contract.paymentCount && contract.totalPaid && contract.monthlyPremium && contract.monthlyPremium > 0) {
    contract.paymentCount = Math.round(contract.totalPaid / contract.monthlyPremium)
  }

  // 납입 완료 여부 판정
  if (contract.paymentTerm && contract.paymentTerm < 99999 && contract.paymentCount) {
    contract.isPaidOff = contract.paymentCount >= contract.paymentTerm
  }
  // 납입예정 보험료 0원 → 납입완료 (납입면제 포함)
  const expectedPremium = (contract as Record<string, unknown>)._expectedPremium as number | undefined
  if (!contract.isPaidOff && expectedPremium !== undefined && expectedPremium === 0) {
    contract.isPaidOff = true
  }

  if (!contract.companyName && !contract.productName) return null
  return contract
}

function parseRiderLine(line: string): Rider | null {
  // 탭 구분 형식: "특약명\t본인\t3,000만원\t2074.01.31(100세)"
  const parts = line.split('\t')

  let name = ''
  let amountText = ''
  let expiryText = ''

  if (parts.length >= 3) {
    name = parts[0].trim()
    // parts[1] = 피보험자 (본인 등) — 스킵
    amountText = parts[2]?.trim() ?? ''
    expiryText = parts[3]?.trim() ?? ''
  } else {
    // 탭 없는 경우 — "만원" 기준으로 분리
    const amtMatch = line.match(/^(.+?)\s+([0-9,]+\s*만\s*원?)\s*(.*)$/)
    if (!amtMatch) return null
    name = amtMatch[1].trim()
    amountText = amtMatch[2]
    expiryText = amtMatch[3] ?? ''
  }

  // 무효 행 필터
  if (!name || name.length < 2) return null
  if (/^(피보험자|보유\s*보장|특약만기일|본인|계약자)$/.test(name)) return null
  if (/^(진단\s*관련|의료|실손|입원|수술|사망|장해|기타\s*특약|후유)/.test(name)) return null

  const amount = parseAmountMan(amountText)
  if (amount === 0) return null

  // 갱신형: "(갱신형)", "(갱신형_15년)", "(갱신)", "(3년갱신)", "(20년갱신형)" 등 모든 변형 포함
  const isRenewable =
    /갱신형/.test(name) ||
    /\(갱신\)/.test(name) ||
    /\(\d+년갱신\)/.test(name) ||
    /갱신형/.test(expiryText)
  const cleanName = name
    .replace(/\[갱신형[^\]]*\]\s*/g, '')
    .replace(/\(갱신형[^)]*\)\s*/g, '')
    .replace(/\(갱신\)\s*/g, '')
    .replace(/\(\d+년갱신형?\)\s*/g, '')
    .trim()

  // 만기 나이: 종신 → 9999
  let expiryAge = 0
  if (/종신/.test(expiryText) || /종신/.test(name)) {
    expiryAge = 9999
  } else {
    expiryAge = parseAgeFromText(expiryText) || parseAgeFromText(name)
  }

  const category = categorizeRider(cleanName)

  // 만기 날짜 문자열 추출 (예: "2074.01.31")
  const dateMatch = expiryText.match(/(\d{4}[./]\d{2}[./]\d{2})/)
  const expiryDate = dateMatch ? dateMatch[1].replace(/\//g, '.') : undefined

  return { name: cleanName, amount, expiryAge, expiryDate, isRenewable, category }
}

// ────────────────────────────────────────────
// 폴백 1: "[보험사명 상품명]" 브라켓 형식 파싱
// ────────────────────────────────────────────
function parseFromBracketFormat(text: string): Partial<InsuranceContract>[] {
  // [보험사명 상품명] 헤더로 섹션 분리
  const sectionRegex = /\[([^\]]+)\]/g
  const headers: Array<{ match: string; company: string; product: string; index: number }> = []
  let m: RegExpExecArray | null
  while ((m = sectionRegex.exec(text)) !== null) {
    const inner = m[1].trim()
    // 한글 포함 보험 관련 내용만
    if (!/[가-힣]/.test(inner)) continue
    // 회사명 + 상품명 분리 (첫 번째 공백 기준)
    const spaceIdx = inner.search(/\s/)
    const company = spaceIdx > 0 ? inner.slice(0, spaceIdx) : inner
    const product = spaceIdx > 0 ? inner.slice(spaceIdx + 1).trim() : ''
    headers.push({ match: m[0], company, product, index: m.index })
  }

  if (headers.length === 0) return []

  const contracts: Partial<InsuranceContract>[] = []

  for (let i = 0; i < headers.length; i++) {
    const { company, product, index } = headers[i]
    const end = headers[i + 1]?.index ?? text.length
    const section = text.slice(index, end)
    const lines = section.split('\n').map(l => l.trim()).filter(Boolean)

    const contract: Partial<InsuranceContract> = {
      id: `contract_${contracts.length + 1}`,
      companyName: company,
      productName: product,
      productType: detectProductType(product),
      riders: [],
      isRenewable: false,
      paymentCount: 0,
      totalPaid: 0,
      expiryAge: 100,
    }

    let inRiders = false

    for (const line of lines) {
      if (/^특약\s*[:：]?\s*$/.test(line)) { inRiders = true; continue }
      if (inRiders) {
        const rider = parseRiderLine(line)
        if (rider) contract.riders!.push(rider)
        continue
      }

      if (/^월\s*보험료\s*[:：]/.test(line)) {
        contract.monthlyPremium = parseAmountWon(line)
        continue
      }
      if (/^총\s*납입금액\s*[:：]/.test(line)) {
        contract.totalPaid = parseAmountWon(line)
        continue
      }
      if (/^납입기간\s*[:：]/.test(line)) {
        const yearMatch = line.match(/(\d+)년\s*납/)
        if (yearMatch) {
          contract.paymentTerm = parseInt(yearMatch[1], 10) * 12
        } else if (/전기납/.test(line)) {
          contract.paymentTerm = 99999
        }
        continue
      }
      if (/^납입횟수\s*[:：]/.test(line)) {
        const slashMatch = line.match(/(\d+)\s*\/\s*(\d+)/)
        if (slashMatch) {
          contract.paymentCount = parseInt(slashMatch[1], 10)
          if (!contract.paymentTerm) contract.paymentTerm = parseInt(slashMatch[2], 10)
        } else {
          const single = line.match(/(\d+)/)
          if (single && !contract.paymentTerm) {
            // 단독 숫자 = 전체 납입기간(회), paymentCount는 totalPaid로 추정
            contract.paymentTerm = parseInt(single[1], 10)
          }
        }
        continue
      }
      if (/^만기\s*[:：]/.test(line)) {
        if (/종신/.test(line)) contract.expiryAge = 9999
        else contract.expiryAge = parseAgeFromText(line) || 100
        continue
      }
      if (/^갱신형$/.test(line)) { contract.isRenewable = true; continue }
      if (/^비갱신형?$/.test(line)) { contract.isRenewable = false; continue }
    }

    // paymentCount 추정
    if (!contract.paymentCount && contract.totalPaid && contract.monthlyPremium && contract.monthlyPremium > 0) {
      contract.paymentCount = Math.round(contract.totalPaid / contract.monthlyPremium)
    }
    // 납입 완료 판정
    if (contract.paymentTerm && contract.paymentTerm < 99999 && contract.paymentCount) {
      contract.isPaidOff = contract.paymentCount >= contract.paymentTerm
    }

    contracts.push(contract)
  }

  return contracts
}

// ────────────────────────────────────────────
// 폴백 2: "보험 계약 목록" 테이블 파싱
// ────────────────────────────────────────────
function parseFromContractTable(text: string): Partial<InsuranceContract>[] {
  const tableStart = text.indexOf('보험 계약 목록')
  if (tableStart === -1) return []
  const section = text.slice(tableStart, tableStart + 3000)
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean)

  const companies: string[] = []
  const premiums: number[] = []
  const paymentCounts: number[] = []

  for (const line of lines) {
    if (/보험사명\t/.test(line)) {
      companies.push(...line.split('\t').slice(1).map((p) => p.trim()).filter(Boolean))
    }
    if (/^월\s*보험료\t/.test(line)) {
      premiums.push(...line.split('\t').slice(1).map((p) => parseAmountWon(p)).filter((n) => n > 0))
    }
    if (/납입횟수\t/.test(line)) {
      for (const p of line.split('\t').slice(1)) {
        const m = p.match(/(\d+)\//)
        if (m) paymentCounts.push(parseInt(m[1], 10))
      }
    }
  }

  return companies.map((company, i) => ({
    id: `contract_${i + 1}`,
    companyName: company,
    productName: '',
    monthlyPremium: premiums[i] ?? 0,
    expiryAge: 100,
    paymentCount: paymentCounts[i] ?? 0,
    totalPaid: (premiums[i] ?? 0) * (paymentCounts[i] ?? 0),
    isRenewable: false,
    productType: 'health' as ProductType,
    riders: [],
  }))
}

// ────────────────────────────────────────────
// 메인 파서 (공개 API)
// ────────────────────────────────────────────
export function parseInsuranceText(rawText: string): ParsedData {
  const text = rawText
  const customerInfo = parseCustomerInfo(text)

  const renewalMap = extractContractRenewalMap(text)
  let contracts = parseFromRiderSections(text, renewalMap)
  if (contracts.length === 0) {
    contracts = parseFromBracketFormat(text)
  }
  if (contracts.length === 0) {
    contracts = parseFromContractTable(text)
  }

  // expiryAge 보정
  for (const c of contracts) {
    if (!c.expiryAge) c.expiryAge = 100
  }

  return { customerInfo, contracts, rawText }
}

// ────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────
export function calculateAnniversaryDate(birthDate: string): string {
  if (!birthDate) return ''
  const [, month, day] = birthDate.split('-').map(Number)
  const today = new Date()
  const year = today.getFullYear()
  const candidate = new Date(year, month - 1, day)
  const anniversary = candidate > today ? candidate : new Date(year + 1, month - 1, day)
  return anniversary.toISOString().split('T')[0]
}

export function daysUntilAnniversary(anniversaryDate: string): number {
  if (!anniversaryDate) return 365
  const today = new Date()
  const anniversary = new Date(anniversaryDate)
  return Math.ceil((anniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
