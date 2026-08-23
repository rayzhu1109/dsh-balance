/**
 * dsh-balance host entry.
 *
 * Mounts a single same-origin GET route `/dsh-balance/status` that returns:
 *   - `balance`: the live DeepSeek account balance from the official
 *     `GET https://api.deepseek.com/user/balance` endpoint (resolved with the
 *     `DEEPSEEK_API_KEY` credential reference, falling back to the process
 *     environment).
 *   - `daily`: a 5-day daily-spend series derived from persisted balance
 *     snapshots (day-over-day balance decrease). Snapshots accumulate while
 *     the plugin runs, so the chart fills in from install time.
 *
 * Only `node:*` builtins are imported, so the host half has no runtime package
 * dependencies beyond what the profile already provides.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'dsh-balance'

const DEFAULT_KEY_ENV = 'DEEPSEEK_API_KEY'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'

const DATA_DIR = join(homedir(), '.dsh', 'dsh-balance')
const HISTORY_FILE = join(DATA_DIR, 'history.json')

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(body)
}

/**
 * Resolve the DeepSeek API key per operation: the mounted credentials service
 * is authoritative (a key stored or rotated by the web Models page reaches the
 * next call without a restart); otherwise fall back to the process environment.
 */
async function resolveApiKey(ctx) {
  const credentials = ctx.get('credentials')
  if (credentials && typeof credentials.resolve === 'function') {
    try {
      const resolved = await credentials.resolve(DEFAULT_KEY_ENV)
      if (resolved && typeof resolved.value === 'string' && resolved.value.length > 0) {
        return resolved.value
      }
    } catch {
      // fall through to the environment below
    }
  }
  return process.env[DEFAULT_KEY_ENV] || ''
}

function readHistory() {
  try {
    if (!existsSync(HISTORY_FILE)) return []
    const parsed = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeHistory(history) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf8')
  } catch {
    // best effort — history is advisory, never fatal
  }
}

function dayKey(ms) {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayKey() {
  return dayKey(Date.now())
}

/** Record today's snapshot; the latest observation of a day wins. */
function recordSnapshot(history, balanceValue) {
  const key = todayKey()
  const next = history.filter((entry) => entry && entry.day !== key)
  next.push({ day: key, balance: balanceValue })
  return next.slice(-90)
}

/** Build the last `days` daily-spend bars (balance drop between consecutive days). */
function buildDaily(history, days) {
  const byDay = new Map()
  for (const entry of history) {
    if (entry && typeof entry.day === 'string' && typeof entry.balance === 'number') {
      byDay.set(entry.day, entry.balance)
    }
  }
  const result = []
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (days - 1 - i))
    const key = dayKey(d.getTime())
    const balance = byDay.get(key)
    const prev = byDay.get(dayKey(d.getTime() - 86400000))
    let spend = null
    if (typeof balance === 'number' && typeof prev === 'number') {
      spend = Math.max(0, prev - balance)
    }
    result.push({ day: key, balance: balance ?? null, spend })
  }
  return result
}

async function fetchBalance(apiKey) {
  const res = await fetch(`${DEFAULT_BASE_URL}/user/balance`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const parsed = await res.json()
      const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error
      if (typeof message === 'string' && message.length > 0) detail = message
    } catch {
      // keep the HTTP status detail
    }
    throw new Error(detail)
  }
  const data = await res.json()
  const info = Array.isArray(data?.balance_infos) ? data.balance_infos[0] : undefined
  return {
    is_available: data?.is_available === true,
    currency: info?.currency ?? 'CNY',
    total_balance: info?.total_balance ?? '0',
    granted_balance: info?.granted_balance ?? '0',
    topped_up_balance: info?.topped_up_balance ?? '0',
  }
}

export function apply(ctx) {
  ctx.inject(['webServer'], (host) => {
    const disposer = host.webServer.register({
      kind: 'exact',
      path: '/dsh-balance/status',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' })
          response.end()
          return
        }
        try {
          const apiKey = await resolveApiKey(ctx)
          const result = { balance: null, daily: buildDaily(readHistory(), 5), configured: apiKey.length > 0 }
          if (apiKey.length > 0) {
            const balance = await fetchBalance(apiKey)
            result.balance = balance
            const numeric = Number(balance.total_balance)
            if (Number.isFinite(numeric)) {
              const updated = recordSnapshot(readHistory(), numeric)
              writeHistory(updated)
              result.daily = buildDaily(updated, 5)
            }
          }
          sendJson(response, 200, result)
        } catch (error) {
          sendJson(response, 200, {
            balance: null,
            daily: buildDaily(readHistory(), 5),
            configured: (await resolveApiKey(ctx)).length > 0,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    })
    if (typeof host.effect === 'function') host.effect(() => disposer, 'dsh-balance: http routes')
  })
}
