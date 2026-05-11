import type { CustomerData } from '../types'
import { IF_SCRIPTS } from '../components/Guide/ifScripts'

const API_KEY_STORAGE = 'claude_api_key'

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? ''
}

export function saveApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key)
}

function buildSystemPrompt(customerData: CustomerData, currentMD: string): string {
  const { info, contracts, analysis } = customerData
  const mdScript = IF_SCRIPTS[currentMD]

  const contractSummary = contracts.map((c, i) => {
    const dec = analysis?.decisions.find(d => d.contractId === c.id)
    return `  ${i + 1}. ${c.companyName} ${c.productName} (${dec?.direction === 'keep' ? '유지' : dec?.direction === 'adjust' ? '일부조정' : '정리'}) - 월 ${c.isPaidOff ? 0 : c.monthlyPremium}원`
  }).join('\n')

  const coverageSummary = analysis
    ? `암 ${analysis.coverage.cancerActual}만, 뇌 ${analysis.coverage.brainActual}만, 심장 ${analysis.coverage.heartActual}만`
    : '미분석'

  return `당신은 보험 리모델링 전문 상담 어시스턴트입니다. 상담사를 돕기 위해 상담사가 고객에게 직접 말할 수 있는 발화를 생성합니다.

【고객 정보】
이름: ${info.name}님, ${info.age}세 ${info.gender === 'F' ? '여' : '남'}성
현재 보험: ${contracts.length}건, 월 ${analysis?.effectiveMonthlyPremium.toLocaleString()}원
실질 보장: ${coverageSummary}
계약 현황:
${contractSummary}

【현재 상담 단계】
${currentMD}${mdScript ? ` - ${mdScript.purpose}` : ''}

【규칙】
- 상담사가 고객에게 바로 말할 수 있는 1~3문장의 자연스러운 발화를 생성하세요.
- 보험 용어는 쉽게 풀어서 말하세요.
- 고객의 감정에 공감하되, 상담 목표(보험 문제 인식 → 솔루션 제시 → 계약)를 향해 부드럽게 이끄세요.
- 응답은 발화 텍스트만, 설명이나 메타 코멘트 없이.`
}

export async function generateAIResponse({
  customerData,
  currentMD,
  customerMessage,
  signal,
}: {
  customerData: CustomerData
  currentMD: string
  customerMessage: string
  signal?: AbortSignal
}): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('API 키가 설정되지 않았습니다.')

  const systemPrompt = buildSystemPrompt(customerData, currentMD)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `고객 발화: "${customerMessage}"\n\n이 상황에 맞는 상담사 발화를 생성해주세요.`,
        },
      ],
    }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `API 오류 ${response.status}`)
  }

  const data = await response.json()
  return data.content[0]?.text ?? ''
}
