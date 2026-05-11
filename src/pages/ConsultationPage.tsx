import { useAppStore } from '../store'
import { InsuranceDataInput } from '../components/DataInput/InsuranceDataInput'
import { ScriptNav } from '../components/Script/ScriptNav'
import { FullScript } from '../components/Script/FullScript'
import { DataPanel } from '../components/DataPanel/DataPanel'

export function ConsultationPage() {
  const { showDataInput, customerData } = useAppStore()

  if (showDataInput || !customerData) {
    return (
      <div className="h-full overflow-y-auto flex items-start justify-center py-8 px-4">
        <div className="w-full max-w-2xl">
          <InsuranceDataInput />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* 좌측: CF/MD 인덱스 네비게이션 */}
      <ScriptNav />

      {/* 중앙: 전체 상담 스크립트 (스크롤) */}
      <FullScript />

      {/* 우측: 고객 분석 데이터 고정 패널 */}
      <DataPanel />
    </div>
  )
}
