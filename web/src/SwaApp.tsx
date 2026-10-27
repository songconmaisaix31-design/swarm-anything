import { useRoute, navigate } from './router';
import { SwaWorkspace } from './pages/swarm/SwaWorkspace';
import { SwaProjectsPage } from './pages/workspace/SwaProjectsPage';
import './styles/swa.css';

export function SwaApp() {
  const route = useRoute();
  const tasks = ['/', '/swarm', '/swarm/'].includes(route.path);
  const projects = ['/workspace', '/workspace/'].includes(route.path);
  return <div className="swa-shell">
    <a className="swa-skip" href="#swa-main">跳转到内容</a>
    <header className="swa-header"><button className="swa-brand" type="button" onClick={() => navigate('/swarm')}>SWA<span>Swarm Anything</span></button><nav aria-label="主导航"><button className="ac-button secondary compact" type="button" aria-current={tasks ? 'page' : undefined} onClick={() => navigate('/swarm')}>任务与交付</button><button className="ac-button secondary compact" type="button" aria-current={projects ? 'page' : undefined} onClick={() => navigate('/workspace')}>项目与权限</button></nav><span className="swa-local">本机人工会话</span></header>
    <main id="swa-main" className="swa-main" tabIndex={-1}>{tasks ? <SwaWorkspace /> : projects ? <SwaProjectsPage /> : <section><h1>此页面不属于 SWA</h1><p>请从导航打开任务或项目权限。</p><button className="ac-button compact" type="button" onClick={() => navigate('/swarm', true)}>打开任务工作台</button></section>}</main>
  </div>;
}
