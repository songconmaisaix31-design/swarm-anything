import { cpus, freemem } from 'node:os'
import { performance } from 'node:perf_hooks'
import { setTimeout } from 'node:timers/promises'
import { OrchestrationError } from '../../../third_party/orca-v1.4.230/src/main/runtime/orchestration/orchestration-error'

function totals() {
  const values = cpus()
  if (!values.length) throw new OrchestrationError('resource_refused', 'The actual processor sample is unavailable')
  return values.reduce((sum, cpu) => ({ count: sum.count + 1, idle: sum.idle + cpu.times.idle, total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { count: 0, idle: 0, total: 0 })
}

export async function admitWorkerResources() {
  const samples = []
  const started = performance.now()
  for (let index = 0; index < 1; index++) {
    const before = totals()
    await setTimeout(1000)
    const after = totals()
    const total = after.total - before.total, idle = after.idle - before.idle
    if (before.count !== after.count || total <= 0 || idle < 0 || idle > total) throw new OrchestrationError('resource_refused', 'The actual blocking CPU sample is unavailable')
    samples.push({ utc: new Date().toISOString(), elapsed_seconds: (performance.now() - started) / 1000, cpu_percent: 100 * (total - idle) / total, available_bytes: freemem() })
  }
  process.stderr.write(JSON.stringify({ type: 'swa_worker_resource_observation', samples }) + '\n')
  return samples
}
