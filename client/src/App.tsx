import React, { useState, useEffect } from 'react';
import { BrowserProvider } from 'ethers';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import VoteDetail from './VoteDetail';
import InitiateVote from './InitiateVote';
import VoteList from './VoteList';
import VotingContract from './core/VotingContract';
import { WindowWithEthereum } from './core/types';
import { ProgressProvider, useProgress, ProgressIndicator } from './ProgressContext';
import './styles/App.css';

const AppContent: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contract, setContract] = useState<VotingContract | null>(null);
  // 检测用户是否安装了MetaMask钱包
  const [hasMetaMask, setHasMetaMask] = useState(() => {
    const win = window as WindowWithEthereum;
    return !!win.ethereum;
  });
  const navigate = useNavigate();
  const location = useLocation();
  const { isVisible, steps, currentStep, title } = useProgress();

  useEffect(() => {
    // 在页面获得焦点时检查MetaMask状态，处理用户可能在使用过程中安装扩展的情况
    const checkMetaMask = () => {
      const win = window as WindowWithEthereum;
      const isAvailable = !!win.ethereum;
      setHasMetaMask(isAvailable);
      if (!isAvailable) {
        alert('请安装MetaMask扩展');
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkMetaMask();
      }
    });
  }, []);

  // 连接钱包并初始化合约实例
  const connectWallet = async () => {
    if (!hasMetaMask) return;
    
    try {
      setIsLoading(true);
      const win = window as WindowWithEthereum;
      // 请求用户授权连接钱包
      await win.ethereum.request({ method: 'eth_requestAccounts' });
      const provider = new BrowserProvider(win.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      
      // 验证网络是否为本地开发网络
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(1337) && network.chainId !== BigInt(5777)) {
        alert('请切换到本地网络');
        return;
      }

      // 获取合约单例实例
      const contractInstance = await VotingContract.getInstance();
      setContract(contractInstance);
    } catch (error) {
      alert('钱包连接失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`app ${!account ? 'app--with-bg' : ''}`}>
      <header className="header">
        {/* 只有在登录状态且不在首页时显示返回首页按钮 */}
        {account && location.pathname !== '/' && (
          <button className="btn" onClick={() => navigate('/')}>首页</button>
        )}
        <div className="header__auth">
          {account ? (
            // 已连接钱包状态
            <>
              {/* 显示钱包地址的简短形式 */}
              <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
              <img src="/metamask.png" alt="MetaMask" className="header__icon" />
              <button className="btn" onClick={() => {
                setAccount(null);
                navigate('/');
              }}>退出</button>
            </>
          ) : (
            // 未连接钱包状态
            <>
              <span>连接MetaMask钱包以登录</span>
              <img src="/metamask.png" alt="MetaMask" className="header__icon" />
              <button className="btn" onClick={connectWallet} disabled={isLoading}>
                {isLoading ? '连接中' : '登录'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 进度指示器组件，用于显示操作进度 */}
      <ProgressIndicator 
        visible={isVisible}
        steps={steps}
        currentStep={currentStep}
        title={title}
      />

      <main className="main">
        {/* 根据钱包连接状态展示不同内容 */}
        {!hasMetaMask ? null : !account ? (
          // 未连接钱包时显示欢迎页
          <div className="welcome">
            <h1 className="welcome__title">VoteX</h1>
            <p className="welcome__text">欢迎使用VoteX去中心化投票系统</p>
          </div>
        ) : (
          // 已连接钱包时根据路由显示不同页面
          <Routes>
            <Route path="/" element={<VoteList contract={contract!} />} />
            <Route path="/vote/:voteId" element={<VoteDetail account={account} />} />
            <Route path="/create" element={<InitiateVote account={account} />} />
          </Routes>
        )}
      </main>
    </div>
  );
};

// 应用根组件，使用ProgressProvider包装内容组件
const App: React.FC = () => {
  return (
    <ProgressProvider>
      <AppContent />
    </ProgressProvider>
  );
};

export default App;
