import { useState } from 'react'
import { useAppStore } from '../../store'
import { detectResistance } from '../../engine/keywords'
import type { ResistanceDetection } from '../../types'
import { IF_SCRIPTS } from './ifScripts'

export function GuidePanel() {
  const { currentCF, currentMD, customerData, activeBranch, setActiveBranch, setDetectedResistances, advanceMD } = useAppStore()
  const [customerInput, setCustomerInput] = useState('')
  const [detections, setDetections] = useState<ResistanceDetection[]>([])
  const [copied, setCopied] = useState(false)

  const customer = customerData!
  const scriptKey = activeBranch || currentMD
  const script = IF_SCRIPTS[scriptKey]

  function fillVariables(text: string): string {
    const analysis = customer.analysis
    return text
      .replace(/{이름}/g, customer.info.name)
      .replace(/{월보험료}/g, analysis?.totalMonthlyPremium.toLocaleString() || '?')
      .replace(/{보험수}/g, customer.contracts.length.toString())
      .replace(/{암실질}/g, analysis?.coverage.cancerActual.toLocaleString() || '?')
      .replace(/{뇌실질}/g, analysis?.coverage.brainActual.toLocaleString() || '?')
      .replace(/{심장실질}/g, analysis?.coverage.heartActual.toLocaleString() || '?')
  }

  function handleAnalyzeInput() {
    if (!customerInput.trim()) return
    const detected = detectResistance(customerInput)
    setDetections(detected)
    setDetectedResistances(detected)
    if (detected.length > 0 && detected[0].type !== 'RESIST_EXIT') {
      setActiveBranch(detected[0].type)
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(fillVariables(text))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* 단계 표시 */}
      <div className="p-4 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-blue-400">{currentCF}</span>
          <span className="text-xs text-slate-500">{currentMD}</span>
        </div>
        {script && (
          <p className="text-xs text-slate-400">{script.purpose}</p>
        )}
      </div>

      {/* 발화 스크립트 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activeBranch && (
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setActiveBranch(null)}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
            >
              ← 메인으로
            </button>
            <span className="text-xs text-orange-400 font-medium">
              분기: {activeBranch}
            </span>
          </div>
        )}

        {script ? (
          <>
            {script.scripts.map((item, idx) => (
              <div key={idx} className="card p-3">
                {item.label && (
                  <div className="text-xs text-slate-500 mb-2">{item.label}</div>
                )}
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                  {fillVariables(item.text)}
                </p>
                <button
                  onClick={() => handleCopy(item.text)}
                  className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {copied ? '복사됨 ✓' : '복사'}
                </button>
              </div>
            ))}
          </>
        ) : (
          <div className="text-sm text-slate-500 text-center py-8">
            {currentMD} 스크립트
          </div>
        )}
      </div>

      {/* 고객 반응 입력 */}
      <div className="p-4 border-t border-slate-700 bg-slate-800/30">
        <div className="text-xs text-slate-500 mb-2">고객 반응 붙여넣기 (분기 감지)</div>
        <textarea
          value={customerInput}
          onChange={(e) => setCustomerInput(e.target.value)}
          placeholder="고객 메시지를 여기에 붙여넣으세요..."
          className="w-full h-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={handleAnalyzeInput} className="btn-primary text-xs py-1.5 flex-1">
            분기 감지
          </button>
          <button onClick={advanceMD} className="btn-secondary text-xs py-1.5">
            다음 단계 →
          </button>
        </div>

        {detections.length > 0 && (
          <div className="mt-2 space-y-1">
            {detections.map((d, i) => (
              <button
                key={i}
                onClick={() => setActiveBranch(d.type)}
                className="w-full text-left text-xs bg-orange-900/20 border border-orange-700/50 rounded px-2 py-1.5 text-orange-400 hover:bg-orange-900/30 transition-colors"
              >
                {d.label} → {d.type}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
