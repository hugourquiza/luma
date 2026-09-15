import ReactDOM from 'react-dom/client';
import App from './app/App';
import { registerSW } from './offline/service-worker';
import './styles/global.css';

// PWA offline support (§11, §7)
registerSW();

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
