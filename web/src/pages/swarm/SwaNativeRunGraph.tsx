import { useId, type CSSProperties, type ReactNode } from 'react';
import type { readSwaRun } from './swaRunView';
import styles from './SwaNativeRunGraph.module.css';

type RunView = ReturnType<typeof readSwaRun>;
type RunTask = RunView['tasks'][number];

function placeTasks(tasks: RunTask[], rootID: string) {
  const children = new Map<string, RunTask[]>();
  const root = tasks.find(task => task.id === rootID);
  for (const task of tasks) {
    if (task.parentID === null) continue;
    const siblings = children.get(task.parentID);
    if (siblings) siblings.push(task);
    else children.set(task.parentID, [task]);
  }
  const placed: { task: RunTask; depth: number }[] = [];
  const seen = new Set<string>();
  const pending = root ? [{ task: root, depth: 0 }] : [];
  while (pending.length) {
    const position = pending.pop()!;
    if (seen.has(position.task.id)) continue;
    seen.add(position.task.id);
    placed.push(position);
    const descendants = children.get(position.task.id) ?? [];
    for (let index = descendants.length - 1; index >= 0; index -= 1) {
      pending.push({ task: descendants[index], depth: position.depth + 1 });
    }
  }
  for (const task of tasks) if (!seen.has(task.id)) placed.push({ task, depth: 0 });
  return placed;
}

const taskStatus: Record<string, string> = {
  pending: '待处理', ready: '待派发', dispatched: '已派发', blocked: '受阻', completed: '执行已完成', failed: '失败',
};

export function SwaNativeRunGraph({ view, renderControls }: { view: RunView; renderControls?: (dispatches: RunView['dispatches']) => ReactNode }) {
  const graphID = useId();
  const positions = placeTasks(view.tasks, view.taskID);
  const tasks = new Map(view.tasks.map((task, index) => [task.id, { task, anchor: `${graphID}-task-${index}` }]));
  const dispatches = new Map<string, RunView['dispatches']>();
  for (const dispatch of view.dispatches) {
    const group = dispatches.get(dispatch.taskID);
    if (group) group.push(dispatch);
    else dispatches.set(dispatch.taskID, [dispatch]);
  }
  function taskLink(id: string) {
    const target = tasks.get(id);
    return target ? <a href={`#${target.anchor}`}>{target.task.title || id}</a> : <span>{id}（本次视图未提供此节点）</span>;
  }
  return <section className={styles.graph} aria-labelledby={`${graphID}-heading`}>
    <h4 id={`${graphID}-heading`}>Run 任务关系图</h4>
    <p className={styles.intro}>缩进表示父子关系。依赖仅列实际记录的前置任务；执行完成不代表成果已验收。</p>
    <ul className={styles.nodes} aria-label="Run 任务节点">
      {positions.map(({ task, depth }) => <li key={task.id} className={styles.node} style={{ '--graph-depth': Math.min(depth, 4) } as CSSProperties}>
        <article className={styles.card} id={tasks.get(task.id)?.anchor} tabIndex={-1} aria-label={`任务 ${task.title || task.id}`}>
          <div className={styles.title}><h5>{task.title || task.id}</h5><span className={styles.status}>{taskStatus[task.status] ?? task.status}</span></div>
          <p className={styles.id}>Task {task.id}</p>
          <dl className={styles.relations}>
            <div><dt>父子关系</dt><dd>{task.id === view.taskID ? '根任务' : task.parentID ? taskLink(task.parentID) : '未记录父任务'}</dd></div>
            <div><dt>前置依赖</dt><dd>{task.dependencies.length ? <ul>{task.dependencies.map(id => <li key={id}>{taskLink(id)}</li>)}</ul> : '无记录'}</dd></div>
          </dl>
          <ul className={styles.dispatches} aria-label="派发记录">
            {(dispatches.get(task.id) ?? []).map(dispatch => <li key={dispatch.id}>
              Dispatch {dispatch.id} · 派发 {dispatch.status} · Worker {dispatch.workerState ?? '未知'} · 资源 {dispatch.releaseState ?? '未知'}
            </li>)}
          </ul>
          {renderControls?.(dispatches.get(task.id) ?? [])}
        </article>
      </li>)}
    </ul>
  </section>;
}
