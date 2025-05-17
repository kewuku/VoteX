import React, { createContext, useState, useContext, ReactNode } from 'react';
import './styles/ProgressIndicator.css';

export interface ProgressStep {
  id: string;
  message: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

interface ProgressContextType {
  showProgress: (title: string, steps: ProgressStep[]) => void;
  updateStep: (stepId: string, status: 'pending' | 'active' | 'completed' | 'error') => void;
  nextStep: () => void;
  hideProgress: () => void;
  isVisible: boolean;
  title: string;
  steps: ProgressStep[];
  currentStep: number;
}

const ProgressContext = createContext<ProgressContextType | undefined>(undefined);

export const ProgressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const showProgress = (title: string, steps: ProgressStep[]) => {
    setTitle(title);
    setSteps(steps);
    setCurrentStep(0);
    setIsVisible(true);
  };

  const updateStep = (stepId: string, status: 'pending' | 'active' | 'completed' | 'error') => {
    setSteps(prevSteps => 
      prevSteps.map(step => 
        step.id === stepId ? { ...step, status } : step
      )
    );
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      // 将当前步骤标记为已完成
      if (currentStep >= 0 && currentStep < steps.length) {
        updateStep(steps[currentStep].id, 'completed');
      }
      
      // 将下一步骤标记为活动
      const nextStepIndex = currentStep + 1;
      if (nextStepIndex < steps.length) {
        updateStep(steps[nextStepIndex].id, 'active');
      }
      
      setCurrentStep(nextStepIndex);
    }
  };

  const hideProgress = () => {
    setIsVisible(false);
  };

  const value = {
    showProgress,
    updateStep,
    nextStep,
    hideProgress,
    isVisible,
    title,
    steps,
    currentStep
  };

  return (
    <ProgressContext.Provider value={value}>
      {children}
      <ProgressIndicator 
        visible={isVisible}
        steps={steps}
        currentStep={currentStep}
        title={title}
      />
    </ProgressContext.Provider>
  );
};

export const useProgress = (): ProgressContextType => {
  const context = useContext(ProgressContext);
  if (context === undefined) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
};

// 将 ProgressIndicator 组件合并到当前文件
export const ProgressIndicator: React.FC<{
  visible: boolean;
  steps: ProgressStep[];
  currentStep: number;
  title?: string;
}> = ({
  visible,
  steps,
  currentStep,
  title = '处理中'
}) => {
  if (!visible) return null;

  return (
    <div className="progress-indicator">
      <div className="progress-indicator-content">
        <h3>{title}</h3>
        <div className="progress-steps">
          {steps.map((step, index) => (
            <div 
              key={step.id} 
              className={`progress-step ${step.status} ${index === currentStep ? 'current' : ''}`}
            >
              <div className="step-indicator">
                {step.status === 'completed' ? (
                  <span className="checkmark">✓</span>
                ) : step.status === 'error' ? (
                  <span className="error-mark">✗</span>
                ) : (
                  <span className="step-number">{index + 1}</span>
                )}
              </div>
              <div className="step-message">{step.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};