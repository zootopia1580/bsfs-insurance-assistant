import type { ResistanceDetection } from '../types'

export const RESISTANCE_PATTERNS: Record<string, { label: string; keywords: string[] }> = {
  'MD4-1a': {
    label: '배우자·가족 상의 요청',
    keywords: ['배우자', '남편', '아내', '상의', '얘기해봐야', '가족이랑', '집에서'],
  },
  'MD4-1b': {
    label: '해지 부담',
    keywords: ['해지', '무서', '걱정', '건드리기', '그냥 놔둬', '손대기'],
  },
  'MD4-1c': {
    label: '보험료 추가 부담',
    keywords: ['보험료 더', '추가로', '늘어', '부담', '더 나가', '돈이 더'],
  },
  'MD4-1d': {
    label: '오래 낸 게 아깝다',
    keywords: ['오래 낸', '아깝', '납입완료', '그동안', '10년', '15년', '20년 넘게'],
  },
  'MD4-1e': {
    label: '숫자 불일치 불안',
    keywords: ['숫자 다르', '금액 다르', '이상한', '다른 것 같', '틀린'],
  },
  CF3_ENTER: {
    label: '솔루션 요청 신호',
    keywords: ['얼마면', '어떻게 하면', '채워', '보여줘', '어떻게 해야', '얼마 들어요'],
  },
  RESIST_EXIT: {
    label: '이탈 신호',
    keywords: ['생각해볼', '나중에', '천천히', '일단', '조금 더', '다음에'],
  },
}

export function detectResistance(text: string): ResistanceDetection[] {
  const detected: ResistanceDetection[] = []
  const normalizedText = text.toLowerCase()

  for (const [type, { label, keywords }] of Object.entries(RESISTANCE_PATTERNS)) {
    const matchedKeywords = keywords.filter((kw) => normalizedText.includes(kw))
    if (matchedKeywords.length > 0) {
      detected.push({ type, label, keywords: matchedKeywords })
    }
  }

  return detected
}

export function getStrongestSignal(detections: ResistanceDetection[]): ResistanceDetection | null {
  if (detections.length === 0) return null
  // CF3_ENTER 신호 최우선
  const cf3Signal = detections.find((d) => d.type === 'CF3_ENTER')
  if (cf3Signal) return cf3Signal
  // 매칭된 키워드 수가 많은 것 우선
  return detections.sort((a, b) => b.keywords.length - a.keywords.length)[0]
}
