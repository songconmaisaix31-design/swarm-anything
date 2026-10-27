const unsignedPID = value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff
const positivePID = value => unsignedPID(value) && value > 0
const creation = value => Number.isSafeInteger(value) && value > 0

export function incarnationOrder(parentCreationTimeMs, childCreationTimeMs) {
  if (!creation(parentCreationTimeMs) || !creation(childCreationTimeMs)) return 'unknown'
  return childCreationTimeMs < parentCreationTimeMs ? 'predates-parent' : 'ordered'
}

// Each call consumes one actual native callback batch. Historical rows must
// never fill a missing parent in this batch or become a different incarnation.
function collectStrict(actualRows, root, independentlyOwned = new Set()) {
  if (!Array.isArray(actualRows)) throw new TypeError('Actual process snapshot unavailable')
  const byPID = new Map(), byParent = new Map()
  const ownedRows = [], excludedEdges = [], unknownRows = []
  const unknownSeen = new Set(), visitedRows = new Set(), queuedPIDs = new Set()
  const unknown = (reason, actual) => {
    if (!unknownSeen.has(actual)) {
      unknownSeen.add(actual)
      unknownRows.push({ reason, actual })
    }
  }
  for (const row of actualRows) {
    if (!row || typeof row !== 'object' || !unsignedPID(row.pid) || !unsignedPID(row.ppid)) {
      unknown('invalid_native_process_row', row)
      continue
    }
    const identities = byPID.get(row.pid) ?? []
    identities.push(row)
    byPID.set(row.pid, identities)
    const children = byParent.get(row.ppid) ?? []
    children.push(row)
    byParent.set(row.ppid, children)
  }
  const roots = byPID.get(root.pid) ?? []
  const rootVerified = positivePID(root.pid) && creation(root.creationTimeMs) && roots.length === 1 && roots[0].creationTimeMs === root.creationTimeMs
  if (rootVerified) {
    ownedRows.push(roots[0])
    visitedRows.add(roots[0])
  } else {
    for (const row of roots) {
      // 较晚的同 PID 行是不同身份；原根的未验证子链仍由下面的队列逐条检查。
      if (positivePID(root.pid) && creation(root.creationTimeMs) && roots.length === 1 &&
          creation(row.creationTimeMs) && row.creationTimeMs > root.creationTimeMs) {
        excludedEdges.push({ reason: 'different-root-incarnation', actual: row, anchor: { pid: root.pid, creationTimeMs: root.creationTimeMs } })
      } else {
        unknown('current_root_identity_unverified', row)
      }
      visitedRows.add(row)
    }
  }
  // A completely absent root and no raw candidates is an ordinary EOF race.
  // It adds no invented unknown identity; the caller retains its known root.
  const queue = [{ pid: root.pid, creationTimeMs: root.creationTimeMs, verified: rootVerified }]
  queuedPIDs.add(root.pid)
  const enqueue = (row, verified) => {
    if (positivePID(row.pid) && !queuedPIDs.has(row.pid)) {
      queuedPIDs.add(row.pid)
      queue.push({ pid: row.pid, creationTimeMs: row.creationTimeMs, verified })
    }
  }
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index]
    for (const row of byParent.get(parent.pid) ?? []) {
      if (row.pid === root.pid) unknown('root_in_descendant_branch', row)
      if (visitedRows.has(row)) continue
      visitedRows.add(row)
      // 已知原根缺席时，先排除比该根更早的唯一直接子行；不补根或推断退出。
      if (roots.length === 0 && parent.pid === root.pid && parent.creationTimeMs === root.creationTimeMs &&
          positivePID(root.pid) && positivePID(row.pid) && byPID.get(row.pid)?.length === 1 &&
          incarnationOrder(root.creationTimeMs, row.creationTimeMs) === 'predates-parent') {
        excludedEdges.push({ reason: 'predates-root', actual: row, parent: { pid: parent.pid, creationTimeMs: parent.creationTimeMs } })
        continue
      }
      // Unknown parentage propagates through every raw-reachable child.
      // A readable child timestamp cannot repair that missing provenance.
      if (!parent.verified) {
        if (!independentlyOwned.has(row)) unknown('parent_incarnation_unverified', row)
        enqueue(row, false)
        continue
      }
      if (!positivePID(row.pid) || byPID.get(row.pid)?.length !== 1) {
        unknown('process_identity_not_unique', row)
        enqueue(row, false)
        continue
      }
      const rootOrder = incarnationOrder(root.creationTimeMs, row.creationTimeMs)
      const parentOrder = incarnationOrder(parent.creationTimeMs, row.creationTimeMs)
      if (rootOrder === 'unknown' || parentOrder === 'unknown') {
        unknown('creation_time_unavailable', row)
        enqueue(row, false)
        continue
      }
      if (rootOrder === 'predates-parent' || parentOrder === 'predates-parent') {
        excludedEdges.push({ reason: rootOrder === 'predates-parent' ? 'predates-root' : 'predates-parent', actual: row,
          parent: { pid: parent.pid, creationTimeMs: parent.creationTimeMs } })
        // This excludes only an impossible PPID edge, never a positive Job
        // membership. Do not expand this branch or erase any known identity.
        continue
      }
      const currentParent = byPID.get(parent.pid)
      if (currentParent?.length !== 1 || currentParent[0].creationTimeMs !== parent.creationTimeMs) {
        unknown('parent_incarnation_changed', row)
        enqueue(row, false)
        continue
      }
      ownedRows.push(row)
      enqueue(row, true)
    }
  }
  return { rootVerified, ownedRows, excludedEdges, unknownRows }
}

export function collectOwnedIncarnations(actualRows, root, knownOwnedBeforeQuery = []) {
  if (!Array.isArray(actualRows)) throw new TypeError('Actual process snapshot unavailable')
  if (!Array.isArray(knownOwnedBeforeQuery)) throw new TypeError('Prior owned process identities unavailable')
  if (knownOwnedBeforeQuery.length === 0) return collectStrict(actualRows, root)
  const currentByPID = new Map(), priors = new Map()
  for (const row of actualRows) {
    if (!row || typeof row !== 'object' || !unsignedPID(row.pid) || !unsignedPID(row.ppid)) continue
    const rows = currentByPID.get(row.pid) ?? []
    rows.push(row)
    currentByPID.set(row.pid, rows)
  }
  for (const prior of knownOwnedBeforeQuery) {
    if (prior && positivePID(prior.pid) && creation(prior.creationTimeMs)) priors.set(prior.pid + ':' + prior.creationTimeMs, prior)
  }
  const positive = new Set(), matched = [], unmatched = []
  // 先只按原 strict 证明本帧的准确独立根；所有未知均保留。
  for (const prior of priors.values()) {
    const current = currentByPID.get(prior.pid)
    if (current?.length === 1 && current[0].creationTimeMs === prior.creationTimeMs) {
      const result = collectStrict(actualRows, prior)
      matched.push({ anchor: prior, result })
      for (const row of result.ownedRows) positive.add(row)
    } else unmatched.push(prior)
  }
  const primary = collectStrict(actualRows, root, positive)
  const scopes = [{ result: primary }, ...matched]
  for (const prior of unmatched) scopes.push({ anchor: prior, result: collectStrict(actualRows, prior, positive) })
  const ownedRows = [], ownedSeen = new Set(), excludedEdges = [], unknownRows = []
  for (const { anchor, result } of scopes) {
    for (const row of result.ownedRows) if (!ownedSeen.has(row)) { ownedSeen.add(row); ownedRows.push(row) }
    excludedEdges.push(...result.excludedEdges)
    // 不按后继 positive 清除已有未知；保留每个实际扫描锚的证据。
    for (const entry of result.unknownRows) unknownRows.push(anchor ? { ...entry, source_anchor: {
      kind: 'additional', pid: anchor.pid, creation_time_ms: anchor.creationTimeMs
    } } : entry)
  }
  return { rootVerified: primary.rootVerified, ownedRows, excludedEdges, unknownRows }
}
