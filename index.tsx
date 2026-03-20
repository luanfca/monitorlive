import React, { ReactNode, ErrorInfo } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Simple Error Boundary to capture React rendering crashes.
 * Refactored to use React.Component and constructor to ensure TypeScript correctly identifies props.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;
  public readonly props: Readonly<ErrorBoundaryProps>;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: 20, backgroundColor: '#09090b', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
          <h1 style={{fontSize: '24px', marginBottom: '10px', color: '#ef4444'}}>Ocorreu um erro</h1>
          <p style={{color: '#a1a1aa', marginBottom: '20px', maxWidth: '400px'}}>Algo deu errado na renderização do aplicativo.</p>
          <pre style={{backgroundColor: '#18181b', padding: '10px', borderRadius: '8px', fontSize: '12px', maxWidth: '90%', overflow: 'auto', border: '1px solid #27272a'}}>
            {this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            style={{marginTop: '20px', padding: '10px 20px', backgroundColor: '#10b981', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// REGISTRO OBRIGATÓRIO DO SERVICE WORKER
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Uso de caminho absoluto simples para maior compatibilidade
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('✅ Service Worker registrado:', reg.scope);
    } catch (err) {
      console.error('❌ Erro ao registrar SW:', err);
    }
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);