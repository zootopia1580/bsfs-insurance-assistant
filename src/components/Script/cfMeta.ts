export const CF_META = {
  CF1: {
    label: '신뢰 형성',
    purpose: '처음 만난 전문가를 경계하는 고객이 "한번 들어볼게요"라고 동의하는 단계',
    goal: '보험 점검 허락 + 걱정 포인트 파악',
    customerState: '경계심 있음 · "뭔가 팔려는 건 아닐까" 의심 중',
    counselorFocus: '부담 없는 첫인상 → 점검 동의 → 고객 걱정 포착',
    mds: ['MD1-1', 'MD1-2', 'MD1-3', 'MD1-4'],
  },
  CF2: {
    label: '문제 인식',
    purpose: '지금 내는 보험이 실제로 작동하지 않는다는 걸 고객 스스로 느끼는 단계',
    goal: '3대 진단금 부족 + 갱신형·협소범위 문제 수치로 납득',
    customerState: '"어? 내 보험이 이상한가?" 의심이 생기기 시작하는 상태',
    counselorFocus: '숫자로 보여주기 → 고객이 스스로 깨닫게 → 변화 필요성 자각',
    mds: ['MD2-1', 'MD2-2', 'MD2-3a', 'MD2-4', 'MD2-5', 'MD2-6', 'MD2-7'],
  },
  CF3: {
    label: '솔루션 확정',
    purpose: '문제를 인식한 고객에게 구체적 해결책을 보여주고 "이게 맞다"고 확신시키는 단계',
    goal: '건강 정보 수집 + 설계안 A/B 비교 + 납입기간 결정',
    customerState: '"뭔가 바꿔야겠다"는 마음은 있지만 아직 구체적 결정 전',
    counselorFocus: '설계안 비교 제시 → 비용 대비 보장 합리성 확인 → 고객 주도감 형성',
    mds: ['MD3-1', 'MD3-2', 'MD3-3'],
  },
  CF4: {
    label: '조율 & 확정',
    purpose: '마음은 기울었지만 한두 가지 걸리는 것이 있는 고객의 마지막 저항을 풀고 계약을 확정하는 단계',
    goal: '저항 유형별 맞춤 대응 → 전자서명 완료',
    customerState: '"하긴 해야 할 것 같은데…" 망설임 · 구체적 걸림돌 존재',
    counselorFocus: '저항 이유 파악 → 유형별 IF 대응 → 결정 후 바로 진행',
    mds: ['MD4-2', 'MD4-3', 'MD4-4'],
  },
  CF5: {
    label: '클로징',
    purpose: '계약 후 고객이 좋은 인상으로 떠나고 장기 관계로 이어지는 단계',
    goal: '기존 보험 해지 안내 + 감사 인사 + 다음 접점 형성',
    customerState: '계약 완료 · 안도감과 기대감 공존 · 실행 의지 필요',
    counselorFocus: '해지 프로세스 안내 → 신뢰 강화 → 소개 유도 씨앗 심기',
    mds: ['MD5-1', 'MD5-2'],
  },
} as const

export const CF_ORDER = ['CF1', 'CF2', 'CF3', 'CF4', 'CF5'] as const

export type CFId = keyof typeof CF_META

// MD 이후 상황에 따라 선택하는 병렬 변형 스크립트 (IF 분기 상황별 대응)
export const MD_VARIANTS: Record<string, string[]> = {}

// CF4 저항 처리 분기 (고객 반응 감지 시 활성화)
export const RESISTANCE_BRANCHES = ['MD4-1a', 'MD4-1b', 'MD4-1c', 'MD4-1d', 'MD4-1e']

export const BRANCH_LABELS: Record<string, string> = {
  'MD4-1a': '가족 상의 후 결정',
  'MD4-1b': '해지 부담 감소',
  'MD4-1c': '추가 보험료 우려',
  'MD4-1d': '기존 납입 아까움',
  'MD4-1e': '숫자 불일치 이의',
}
