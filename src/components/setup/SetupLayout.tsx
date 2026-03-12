import React from 'react';
import TitleBar from '../TitleBar';
import { useSetupFlow } from '../../contexts/SetupFlowContext';
import AppButton from '../AppButton';

interface SetupLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  canGoBack?: boolean;
  stepLabel?: string;
}

const SetupLayout: React.FC<SetupLayoutProps> = ({
  children,
  title,
  description,
  canGoBack = true,
  stepLabel,
}) => {
  const {
    errorMessage,
    goBackStep,
    isBusy,
  } = useSetupFlow();

  return (
    <div
      className="flex flex-col h-screen"
      style={{
        backgroundColor: 'var(--app-bg)',
        color: 'var(--app-text)',
      }}
    >
      <TitleBar />
      <div className="flex-1 overflow-auto px-4 py-4 md:px-8 md:py-6 lg:px-10">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-center">
          <div
            className="rounded-3xl border p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)] md:p-6"
            style={{
              backgroundColor: 'var(--app-bg-elevated)',
              borderColor: 'var(--app-border)',
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--app-border)' }}>
              <div>
                {stepLabel ? (
                  <div className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--app-text-muted)' }}>
                    {stepLabel}
                  </div>
                ) : null}
                <h1 className="mt-2 text-2xl font-semibold leading-tight md:text-3xl">{title}</h1>
                {description ? (
                  <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--app-text-muted)' }}>
                    {description}
                  </p>
                ) : null}
              </div>
              {canGoBack ? (
                <AppButton variant="secondary" onClick={goBackStep} disabled={isBusy}>
                  返回上一步
                </AppButton>
              ) : null}
            </div>

            {errorMessage ? (
              <div
                className="mt-4 rounded-xl border px-4 py-3 text-sm"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  borderColor: 'rgba(239, 68, 68, 0.28)',
                  color: '#fecaca',
                }}
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetupLayout;
