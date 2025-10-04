import React, { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

// FIX: Changed `extends Component` to `extends React.Component`. The error "Property 'props' does not exist"
// on a class component can sometimes indicate a TypeScript type resolution issue.
// Using the fully qualified `React.Component` can resolve such ambiguities.
class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Atualiza o estado para que a próxima renderização mostre a UI de fallback.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Você também pode registrar o erro em um serviço externo aqui
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-red-50 rounded-xl">
          <h2 className="text-2xl font-bold text-red-700 mb-4">Oops! Algo deu errado.</h2>
          <p className="text-red-600 mb-6 max-w-md">
            Ocorreu um erro inesperado ao tentar exibir esta tela. Isso pode ter sido causado por uma resposta inesperada da IA ou um problema de renderização.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            Recarregar Aplicativo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
