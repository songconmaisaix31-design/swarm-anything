const elements = Object.fromEntries(
  ['refresh', 'probe', 'notice', 'agents', 'count', 'agent-query', 'agent-installed-only', 'agent-empty', 'agent-name', 'installed', 'version', 'configured', 'startable', 'adapter',
    'project-path', 'choose-project', 'connect', 'verify', 'connection'].map((id) => [id, document.getElementById(id)]),
);

let agents = [];
let selected;
let project;
let busy = false;
let connection = '';
let loaded = false;

const observation = (status) => ({ available: '已确认', unavailable: '不可用', unknown: '待验证' }[status] || '待验证');

function discovered(agent) {
  return agent?.installed?.status === 'available';
}

function discoveryStatus(agent) {
  if (discovered(agent)) return '已发现';
  if (agent.installed?.status === 'unavailable') return '未发现';
  return '待验证';
}

function adapterLabel(agent) {
  if (agent?.adapter === 'acp') return 'ACP 握手';
  if (agent?.adapter === 'browser-cli') return '浏览器工具';
  return '仅发现';
}

function showNotice(message, error = false) {
  elements.notice.hidden = !message;
  elements.notice.classList.toggle('error', error);
  elements.notice.textContent = message;
}

function renderDetails() {
  const tabbit = selected?.id === 'tabbit' && selected?.adapter === 'browser-cli';
  elements['agent-name'].textContent = selected?.display_name || '选择 Agent';
  elements.installed.textContent = selected ? discoveryStatus(selected) : '—';
  elements.version.textContent = selected?.version || '—';
  elements.configured.textContent = selected ? observation(selected.configured?.status) : '—';
  elements.startable.textContent = selected ? observation(selected.startable?.status) : '—';
  elements.adapter.textContent = selected ? adapterLabel(selected) : '—';
  elements['project-path'].textContent = project || '尚未选择目录';
  elements.connection.textContent = connection;
  elements.connect.textContent = tabbit ? '诊断浏览器工具' : '验证 ACP 连接';
  elements.connect.disabled = busy || !discovered(selected) || (!tabbit && (!project || selected?.adapter !== 'acp'));
  elements.verify.hidden = !selected?.verification;
  elements.verify.disabled = busy || !discovered(selected) || !selected?.verification;
  elements.verify.textContent = tabbit ? '验收公开网页' : '验收空白会话';
  elements.refresh.disabled = busy;
  elements.probe.disabled = busy;
  elements['agent-query'].disabled = busy;
  elements['agent-installed-only'].disabled = busy;
  elements['choose-project'].disabled = busy;
}

function renderInventory() {
  const query = elements['agent-query'].value.trim().toLowerCase();
  const visible = agents.filter(agent => (!elements['agent-installed-only'].checked || discovered(agent)) &&
    (!query || `${agent.display_name} ${agent.id}`.toLowerCase().includes(query)));
  const installed = visible.filter(discovered).length;
  if (selected && !visible.includes(selected)) {
    selected = undefined;
    connection = '';
  }
  elements.count.textContent = `${visible.length} 项 · ${installed} 已发现`;
  elements['agent-empty'].hidden = !loaded || visible.length > 0;
  elements.agents.replaceChildren(...visible.map((agent) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'agent';
    button.dataset.agentId = agent.id;
    button.setAttribute('aria-pressed', String(selected === agent));
    button.addEventListener('click', () => {
      if (busy || selected === agent) return;
      selected = agent;
      connection = '';
      for (const choice of elements.agents.querySelectorAll('button')) {
        choice.setAttribute('aria-pressed', String(choice === button));
      }
      renderDetails();
    });

    const name = document.createElement('span');
    name.textContent = agent.display_name;
    const state = document.createElement('span');
    state.className = discovered(agent) ? 'state found' : 'state';
    state.textContent = discoveryStatus(agent);
    const label = document.createElement('span');
    label.className = 'agent-name-stack';
    const adapter = document.createElement('small');
    adapter.textContent = adapterLabel(agent);
    label.append(name, adapter);
    button.append(label, state);
    item.append(button);
    return item;
  }));
  renderDetails();
}

async function operation(action) {
  if (busy) return;
  busy = true;
  showNotice('');
  renderDetails();
  try {
    await action();
  } catch (error) {
    showNotice(error.message, true);
  } finally {
    busy = false;
    renderDetails();
  }
}

function unwrap(reply) {
  if (!reply.ok) throw new Error(reply.message);
  return reply.result;
}

function scan(probe) {
  return operation(async () => {
    showNotice(probe ? '正在探测已发现的 Agent…' : '正在读取本机 Agent 清单…');
    const result = unwrap(await window.swarm.list(probe));
    if (!Array.isArray(result.items)) throw new Error('Swarm CLI 返回的 Agent 清单格式无效。');
    agents = result.items;
    loaded = true;
    selected = agents.find((agent) => agent.id === selected?.id) || agents.find(discovered) || agents[0];
    connection = '';
    renderInventory();
    showNotice(probe ? '版本探测结束。' : '');
  });
}

elements.refresh.addEventListener('click', () => scan(false));
elements.probe.addEventListener('click', () => scan(true));
elements['agent-query'].addEventListener('input', renderInventory);
elements['agent-installed-only'].addEventListener('change', renderInventory);
document.addEventListener('keydown', event => {
  if (!busy && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    elements['agent-query'].focus();
  }
});
elements['choose-project'].addEventListener('click', () => operation(async () => {
  const chosen = unwrap(await window.swarm.chooseProject());
  if (!chosen) return;
  project = chosen;
  connection = '';
}));
elements.verify.addEventListener('click', () => operation(async () => {
  if (!selected?.verification || !discovered(selected)) return;
  const before = connection;
  connection = '正在验收…';
  renderDetails();
  try {
    const result = unwrap(await window.swarm.verify(selected.id));
    if (result === null) {
      connection = before;
      return;
    }
    if (result.agent_id !== selected.id) throw new Error('验收结果与当前 Agent 不符。');
    if (selected.verification === 'browser_fixture') {
      if (result.state !== 'browser_task_verified' || result.cleanup_verified !== true) throw new Error('演练页、原回执和标签页清理未全部验证。');
      connection = '公开网页、原请求回执和本次标签页清理已验证。';
      return;
    }
    const states = { authentication_required: '需要在官方客户端登录', passed: '通过', rejected: '客户端拒绝', unknown: '未确认', unsupported: '客户端未提供此能力', not_attempted: '未尝试' };
    if (result.protocol_version !== 1 || !result.session_new || !result.session_load) throw new Error('空白会话验收结果格式无效。');
    const retained = result.workspace_retained === true && /^swa-acp-[0-9]+$/.test(result.workspace_name ?? '') ? ` 保留测试目录：${result.workspace_name}。` : '';
    connection = `创建：${states[result.session_new.state] ?? '未确认'}；重连：${states[result.session_load.state] ?? '未确认'}。本次未调用模型。${retained}`;
  } catch (error) {
    connection = '';
    throw error;
  }
}));
elements.connect.addEventListener('click', () => operation(async () => {
  if (!discovered(selected)) return;
  if (selected.id === 'tabbit' && selected.adapter === 'browser-cli') {
    connection = '正在运行 Tabbit CLI 诊断…';
    renderDetails();
    try {
      const result = unwrap(await window.swarm.diagnoseTabbit());
      if (result.agent_id !== 'tabbit' || result.state !== 'diagnose_exit_ok') throw new Error('Tabbit CLI 诊断结果格式无效。');
      connection = 'Tabbit CLI 诊断成功退出。尚未验证网页任务。';
    } catch (error) {
      connection = '';
      throw error;
    }
    return;
  }
  connection = '正在进行 ACP 握手…';
  renderDetails();
  try {
    const result = unwrap(await window.swarm.connect(selected.id));
    if (result.agent_id !== selected.id) throw new Error('Swarm CLI 返回的 Agent ID 与当前选择不同。');
    connection = `ACP ${result.protocol_version} 握手成功。模型和账户状态待验证。`;
  } catch (error) {
    connection = '';
    throw error;
  }
}));

scan(false);
