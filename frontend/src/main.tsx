import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AppProviders } from './app/providers';
import { ErrorBoundary } from './components/error-boundary';
import './styles/index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Expected a #root element in index.html.');
}

createRoot(container).render(
  <StrictMode>
    {/* Outside the providers, so a provider that throws is still caught. */}
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
