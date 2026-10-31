import { api, type Rule, type SimulateReport } from '../../api'
import { guard, useStore } from '../../store'
import { toastError, toastOk } from '../toast'

/**
 * Включить или выключить правило. Включается только прогнанное: черновик сначала проходит эмулятор,
 * и встаёт в работу, лишь если прогон прошёл. Так кнопка не обходит линтер и прогон.
 */
export async function setRuleEnabled(rule: Rule, next: boolean): Promise<{ report?: SimulateReport; saved: boolean }> {
  let report: SimulateReport | undefined
  if (next && rule.status !== 'tested' && rule.status !== 'active') {
    report = await guard(api.simulate(rule))
    if (!report) return { saved: false }
    if (!report.passed) {
      toastError(`«${rule.title}»: прогон не прошёл, правило не включено`)
      return { report, saved: false }
    }
  }
  const saved = await guard(api.updateRule({ ...rule, enabled: next, status: next ? 'active' : rule.status }))
  if (saved) toastOk(next ? `«${rule.title}» включено` : `«${rule.title}» выключено`)
  await guard(useStore.getState().reloadRules())
  return { report, saved: Boolean(saved) }
}
