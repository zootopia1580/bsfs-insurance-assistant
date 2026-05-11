import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initDatabase, getDatabase, saveDatabase, getLastInsertId } from './db/schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    title: '상담 어시스턴트',
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// sql.js용 헬퍼: SELECT 결과를 객체 배열로 변환
function execAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const db = getDatabase()
  const result = db.exec(sql, params)
  if (!result[0]) return []
  const { columns, values } = result[0]
  return values.map((row) =>
    Object.fromEntries(columns.map((col, i) => [col, row[i]]))
  )
}

function execGet(sql: string, params: unknown[] = []): Record<string, unknown> | null {
  const rows = execAll(sql, params)
  return rows[0] ?? null
}

function setupIpcHandlers() {
  ipcMain.handle('db:saveCustomer', (_event, customerData: {
    name: string; age: number; gender: string; birthDate: string; anniversaryDate: string
  }) => {
    const db = getDatabase()
    db.run(
      `INSERT INTO customers (name, age, gender, birth_date, anniversary_date) VALUES (?, ?, ?, ?, ?)`,
      [customerData.name, customerData.age, customerData.gender, customerData.birthDate, customerData.anniversaryDate]
    )
    const id = getLastInsertId()
    saveDatabase()
    return { id }
  })

  ipcMain.handle('db:getCustomers', () => {
    return execAll('SELECT * FROM customers ORDER BY created_at DESC')
  })

  ipcMain.handle('db:saveContracts', (_event, customerId: number, contracts: Array<{
    companyName: string; productName: string; monthlyPremium: number; expiryAge: number
    paymentCount: number; totalPaid: number; isRenewable: boolean; productType: string
    riders: Array<{ name: string; amount: number; expiryAge: number; isRenewable: boolean; category: string }>
  }>) => {
    const db = getDatabase()
    const contractIds: number[] = []
    for (const contract of contracts) {
      db.run(
        `INSERT INTO contracts (customer_id, company_name, product_name, monthly_premium, expiry_age, payment_count, total_paid, is_renewable, product_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerId, contract.companyName, contract.productName, contract.monthlyPremium,
         contract.expiryAge, contract.paymentCount, contract.totalPaid,
         contract.isRenewable ? 1 : 0, contract.productType]
      )
      const contractId = getLastInsertId()
      contractIds.push(contractId)
      for (const rider of contract.riders) {
        db.run(
          `INSERT INTO riders (contract_id, name, amount, expiry_age, is_renewable, category) VALUES (?, ?, ?, ?, ?, ?)`,
          [contractId, rider.name, rider.amount, rider.expiryAge, rider.isRenewable ? 1 : 0, rider.category]
        )
      }
    }
    saveDatabase()
    return contractIds
  })

  ipcMain.handle('db:saveAnalysis', (_event, customerId: number, analysis: {
    cancerActual: number; brainActual: number; heartActual: number
    problemTags: object; decisions: object; surrenderValues: object
  }) => {
    const db = getDatabase()
    db.run(
      `INSERT INTO analysis_results (customer_id, cancer_actual, brain_actual, heart_actual, problem_tags, decisions, surrender_values)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customerId, analysis.cancerActual, analysis.brainActual, analysis.heartActual,
       JSON.stringify(analysis.problemTags), JSON.stringify(analysis.decisions), JSON.stringify(analysis.surrenderValues)]
    )
    const id = getLastInsertId()
    saveDatabase()
    return { id }
  })

  ipcMain.handle('db:getAnalysis', (_event, customerId: number) => {
    const result = execGet(
      'SELECT * FROM analysis_results WHERE customer_id = ? ORDER BY created_at DESC LIMIT 1',
      [customerId]
    )
    if (!result) return null
    return {
      ...result,
      problemTags: JSON.parse(result.problem_tags as string),
      decisions: JSON.parse(result.decisions as string),
      surrenderValues: JSON.parse(result.surrender_values as string),
    }
  })

  ipcMain.handle('db:startSession', (_event, customerId: number) => {
    const db = getDatabase()
    db.run(
      `INSERT INTO consultation_sessions (customer_id, current_cf, current_md) VALUES (?, 'CF1', 'MD1-1')`,
      [customerId]
    )
    const id = getLastInsertId()
    saveDatabase()
    return { id }
  })

  ipcMain.handle('db:updateSession', (_event, sessionId: number, updates: {
    currentCF?: string; currentMD?: string; resistances?: string[]; conversionSuccess?: boolean
  }) => {
    const db = getDatabase()
    if (updates.currentCF || updates.currentMD) {
      db.run('UPDATE consultation_sessions SET current_cf = ?, current_md = ? WHERE id = ?',
        [updates.currentCF, updates.currentMD, sessionId])
    }
    if (updates.resistances) {
      db.run('UPDATE consultation_sessions SET resistances = ? WHERE id = ?',
        [JSON.stringify(updates.resistances), sessionId])
    }
    if (updates.conversionSuccess !== undefined) {
      db.run("UPDATE consultation_sessions SET conversion_success = ?, ended_at = datetime('now') WHERE id = ?",
        [updates.conversionSuccess ? 1 : 0, sessionId])
    }
    saveDatabase()
    return { success: true }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(async () => {
  await initDatabase()
  setupIpcHandlers()
  createWindow()
})
