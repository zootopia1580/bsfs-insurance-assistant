import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    saveCustomer: (data: object) => ipcRenderer.invoke('db:saveCustomer', data),
    getCustomers: () => ipcRenderer.invoke('db:getCustomers'),
    saveContracts: (customerId: number, contracts: object[]) =>
      ipcRenderer.invoke('db:saveContracts', customerId, contracts),
    saveAnalysis: (customerId: number, analysis: object) =>
      ipcRenderer.invoke('db:saveAnalysis', customerId, analysis),
    getAnalysis: (customerId: number) => ipcRenderer.invoke('db:getAnalysis', customerId),
    startSession: (customerId: number) => ipcRenderer.invoke('db:startSession', customerId),
    updateSession: (sessionId: number, updates: object) =>
      ipcRenderer.invoke('db:updateSession', sessionId, updates),
  },
})

declare global {
  interface Window {
    electronAPI: {
      db: {
        saveCustomer: (data: object) => Promise<{ id: number }>
        getCustomers: () => Promise<unknown[]>
        saveContracts: (customerId: number, contracts: object[]) => Promise<number[]>
        saveAnalysis: (customerId: number, analysis: object) => Promise<{ id: number }>
        getAnalysis: (customerId: number) => Promise<unknown>
        startSession: (customerId: number) => Promise<{ id: number }>
        updateSession: (sessionId: number, updates: object) => Promise<{ success: boolean }>
      }
    }
  }
}
