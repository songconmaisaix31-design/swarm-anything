const elements = Object.fromEntries(
  ['refresh', 'probe', 'notice', 'agents', 'count', 'agent-name', 'installed', 'version', 'configured', 'startable', 'adapter',
    'project-path', 'choose-project', 'connect', 'connection'].map((id) => [id, document.getElementById(id)]),
);

let agents = [];
let selected;
let project;
let busy = false;
let connection = '';

const observation = (status) => ({ available: '已确认', unavailable: '不可用', unknown: '待验证' }[status] || '待验证');

function discovered(agent) {
  return agent.installed?.status === 'available';
}

function discoveryStatus(agent) {
  if (discovered(agent)) return '已发现';
  if (agent.installed?.status === 'unavailable') return '未发现';
  return '待验证';
}

function showNotice(message, error = false) {
  elements.notice.hidden = !message;
  elements.notice.classList.toggle('error', error);
  elements.notice.textContent = message;
}

function renderDetails() {
  elements['agent-name'].textContent = selected?.display_name || '选择 Agent';
  elements.installed.textContent = selected ? discoveryStatus(selected) : '—';
  elements.version.textContent = selected?.version || '—';
  elements.configured.textContent = selected ? observation(selected.configured?.status) : '—';
  elements.startable.textContent = selected ? observation(selected.startable?.status) : '—';
  elements.adapter.textContent = selected?.adapter || '—';
  elements['project-path'].textContent = project || '尚未选择目录';
  elements.connection.textContent = connection;
  elements.connect.disabled = busy || !project || !selected?.adapter || !discovered(selected);
  elements.refresh.disabled = busy;
  elements.probe.disabled = busy;
  elements['choose-project'].disabled = busy;
}

function renderInventory() {
  const installed = agents.filter(discovered).length;
  elements.count.textContent = `${installed} / ${agents.length} 已发现`;
  elements.agents.replaceChildren(...agents.map((agent) => {
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
    button.append(name, state);
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
    selected = agents.find((agent) => agent.id === selected?.id) || agents.find(discovered) || agents[0];
    connection = '';
    renderInventory();
    showNotice(probe ? '版本探测结束。' : '');
  });
}

elements.refresh.addEventListener('click', () => scan(false));
elements.probe.addEventListener('click', () => scan(true));
elements['choose-project'].addEventListener('click', () => operation(async () => {
  const chosen = unwrap(await window.swarm.chooseProject());
  if (!chosen) return;
  project = chosen;
  connection = '';
}));
elements.connect.addEventListener('click', () => operation(async () => {
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
