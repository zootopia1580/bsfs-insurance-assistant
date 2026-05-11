import { create } from 'zustand'
import type { CustomerData, AnalysisResult, CFStage, MDStage, ResistanceDetection, NewPlanData } from '../types'

interface AppState {
  // 고객 데이터
  customerData: CustomerData | null
  customerId: number | null
  sessionId: number | null
  newPlanData: NewPlanData | null   // Plan A
  newPlanB: NewPlanData | null       // Plan B
  riderPremiumMap: Record<string, number> // key: `${contractId}::${riderName}`

  // 현재 상담 단계
  currentCF: CFStage
  currentMD: MDStage

  // 분기 처리
  activeBranch: string | null
  detectedResistances: ResistanceDetection[]

  // UI 상태
  isAnalyzing: boolean
  showDataInput: boolean
  consultantName: string

  // 액션
  setConsultantName: (name: string) => void
  setCustomerData: (data: CustomerData, dbId?: number) => void
  setAnalysis: (result: AnalysisResult) => void
  setCustomerId: (id: number) => void
  setSessionId: (id: number) => void
  advanceMD: () => void
  goToMD: (md: MDStage) => void
  goToCF: (cf: CFStage) => void
  advanceCF: () => void
  setActiveBranch: (branch: string | null) => void
  setDetectedResistances: (resistances: ResistanceDetection[]) => void
  setIsAnalyzing: (value: boolean) => void
  setShowDataInput: (value: boolean) => void
  setNewPlanData: (data: NewPlanData | null) => void
  setNewPlanB: (data: NewPlanData | null) => void
  setRiderPremium: (contractId: string, riderName: string, premium: number) => void
  reset: () => void
}

const CF_MD_MAP: Record<CFStage, MDStage[]> = {
  CF1: ['MD1-1', 'MD1-2', 'MD1-3', 'MD1-4'],
  CF2: ['MD2-1', 'MD2-2', 'MD2-3a', 'MD2-4', 'MD2-5'],
  CF3: ['MD3-1', 'MD3-2', 'MD3-3'],
  CF4: ['MD4-2', 'MD4-3'],
  CF5: ['MD5-1', 'MD5-2'],
}

const CF_ORDER: CFStage[] = ['CF1', 'CF2', 'CF3', 'CF4', 'CF5']

export const useAppStore = create<AppState>((set, get) => ({
  customerData: null,
  customerId: null,
  sessionId: null,
  newPlanData: null,
  newPlanB: null,
  riderPremiumMap: {},
  currentCF: 'CF1',
  currentMD: 'MD1-1',
  activeBranch: null,
  detectedResistances: [],
  isAnalyzing: false,
  showDataInput: true,
  consultantName: '백승주',

  setConsultantName: (name) => set({ consultantName: name }),
  setCustomerData: (data, dbId) =>
    set({ customerData: data, customerId: dbId ?? null, showDataInput: false }),

  setAnalysis: (result) =>
    set((state) => ({
      customerData: state.customerData
        ? { ...state.customerData, analysis: result }
        : null,
    })),

  setCustomerId: (id) => set({ customerId: id }),
  setSessionId: (id) => set({ sessionId: id }),

  advanceMD: () => {
    const { currentCF, currentMD } = get()
    const mds = CF_MD_MAP[currentCF]
    const currentIndex = mds.indexOf(currentMD as MDStage)
    if (currentIndex < mds.length - 1) {
      set({ currentMD: mds[currentIndex + 1] })
    } else {
      // CF 전환
      get().advanceCF()
    }
  },

  goToMD: (md) => {
    const cf = (Object.entries(CF_MD_MAP) as [CFStage, MDStage[]][])
      .find(([, mds]) => mds.includes(md))?.[0]
    set({ currentMD: md, currentCF: cf ?? get().currentCF, activeBranch: null })
  },

  goToCF: (cf) => set({ currentCF: cf, currentMD: CF_MD_MAP[cf][0], activeBranch: null }),

  advanceCF: () => {
    const { currentCF } = get()
    const currentIndex = CF_ORDER.indexOf(currentCF)
    if (currentIndex < CF_ORDER.length - 1) {
      const nextCF = CF_ORDER[currentIndex + 1]
      set({ currentCF: nextCF, currentMD: CF_MD_MAP[nextCF][0] })
    }
  },

  setActiveBranch: (branch) => set({ activeBranch: branch }),
  setDetectedResistances: (resistances) => set({ detectedResistances: resistances }),
  setIsAnalyzing: (value) => set({ isAnalyzing: value }),
  setShowDataInput: (value) => set({ showDataInput: value }),
  setNewPlanData: (data) => set({ newPlanData: data }),
  setNewPlanB: (data) => set({ newPlanB: data }),
  setRiderPremium: (contractId, riderName, premium) =>
    set((state) => ({
      riderPremiumMap: {
        ...state.riderPremiumMap,
        [`${contractId}::${riderName}`]: premium,
      },
    })),

  reset: () =>
    set({
      customerData: null,
      customerId: null,
      sessionId: null,
      newPlanData: null,
      newPlanB: null,
      riderPremiumMap: {},
      currentCF: 'CF1',
      currentMD: 'MD1-1',
      activeBranch: null,
      detectedResistances: [],
      isAnalyzing: false,
      showDataInput: true,
      consultantName: '백승주',
    }),
}))
