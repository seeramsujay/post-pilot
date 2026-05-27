import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          margin: '2rem auto',
          maxWidth: '600px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '12px',
          color: '#f87171',
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
          backdropFilter: 'blur(8px)'
        }}>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, margin: '0 0 1rem 0', color: '#ef4444' }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#e5e7eb', marginBottom: '1.5rem' }}>
            The PostPilot Webview experienced an unexpected error. Don't worry, your draft state is safe.
          </p>
          <pre style={{
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '1rem',
            borderRadius: '6px',
            overflowX: 'auto',
            fontSize: '0.85rem',
            textAlign: 'left',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.1)'
          }}>
            {this.state.error?.toString() || 'Unknown Error'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem',
              padding: '0.6rem 1.5rem',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s',
              fontFamily: 'inherit'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#dc2626'}
            onMouseOut={(e) => e.currentTarget.style.background = '#ef4444'}
          >
            Reload Webview
          </button>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;
