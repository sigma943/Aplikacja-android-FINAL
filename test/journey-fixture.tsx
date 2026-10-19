import {createRoot} from 'react-dom/client';
import JourneyPlanner from '../components/journeys/JourneyPlanner';
const dark=new URLSearchParams(location.search).get('theme')!=='light';
const root=document.documentElement;
root.style.setProperty('--ui-canvas',dark?'#101a26':'#f4f7f8');root.style.setProperty('--ui-surface',dark?'#152230':'#ffffff');root.style.setProperty('--ui-text',dark?'#edf2f7':'#172536');root.style.setProperty('--ui-muted',dark?'#9aaabb':'#64748b');root.style.setProperty('--ui-edge',dark?'#ffffff12':'#17253614');root.style.setProperty('--pks-accent','#00a3a2');
createRoot(document.getElementById('root')!).render(<div className="pks-theme-root" data-ui-theme={dark?'dark':'light'} style={{position:'relative',height:'100dvh'}}><JourneyPlanner stops={[]} dark={dark} active allowMap onClose={()=>{}}/></div>);
