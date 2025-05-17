import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import VotingContract from './core/VotingContract';
import { VotePhase, Vote as VoteType } from './core/types';
import { useProgress } from './ProgressContext';
import './styles/VoteDetail.css';

interface Option {
  id: number;
  text: string;
  voteCount?: number;
}

const VoteDetail: React.FC<{ account: string | null }> = ({ account }) => {
  const { voteId } = useParams<{ voteId: string }>();
  const [vote, setVote] = useState<VoteType | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSignedUp, setIsSignedUp] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [options, setOptions] = useState<Option[]>([]);
  const { showProgress, updateStep, nextStep, hideProgress } = useProgress();
  
  const numericVoteId = voteId ? parseInt(voteId) : null;

  // 加载投票数据、选项和用户状态
  const loadVoteData = useCallback(async () => {
    if (!account || numericVoteId === null) return;
    
    try {
      setIsLoading(true);
      const contract = await VotingContract.getInstance();
      
      // 先获取投票基本信息
      const voteData = await contract.getVote(numericVoteId);
      
      // 获取用户状态
      const [voted, registered] = await Promise.all([
        contract.hasVoted(numericVoteId, account),
        contract.isSignedUp(numericVoteId, account)
      ]);

      // 获取选项信息
      const optionCount = await contract.getOptionCount(numericVoteId);
      const optionPromises = Array.from({ length: optionCount }, (_, i) => 
        contract.getOption(numericVoteId, i + 1)
      );
      
      const optionsData = await Promise.all(optionPromises);
      const optionsList = optionsData.map((opt, i) => ({
        id: i + 1,
        text: opt.text,
        voteCount: Number(opt.voteCount)
      }));

      // 所有数据都获取完成后再更新状态
      setVote(voteData);
      setHasVoted(voted);
      setIsSignedUp(registered);
      setOptions(optionsList);

    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('获取投票详情失败:', err);
      setError(`获取投票详情失败: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [account, numericVoteId]);

  // 定期刷新投票数据
  useEffect(() => {
    if (numericVoteId !== null) {
      loadVoteData();
      const interval = setInterval(loadVoteData, 3000);
      return () => clearInterval(interval);
    }
  }, [numericVoteId, account, loadVoteData]);

  // 处理用户报名操作
  const handleSignup = async () => {
    if (!account || numericVoteId === null) {
      setError('请先连接钱包');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 报名流程的进度提示
      showProgress('正在报名', [
        { id: 'wallet', message: '连接钱包', status: 'active' },
        { id: 'contract', message: '调用智能合约', status: 'pending' },
        { id: 'confirmation', message: '等待交易确认', status: 'pending' }
      ]);
      
      updateStep('wallet', 'completed');
      nextStep();
      
      const contract = await VotingContract.getInstance();
      
      try {
        // 调用合约报名方法
        await contract.signUpForVote(numericVoteId);
        updateStep('contract', 'completed');
        nextStep();
        updateStep('confirmation', 'completed');
        setIsSignedUp(true);
      } catch (err) {
        updateStep('contract', 'error');
        throw err;
      }
      
      // 完成后延迟隐藏进度提示
      setTimeout(hideProgress, 1500);
      
      await loadVoteData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      console.error('报名失败:', err);
      setError(`报名失败: ${msg}`);
      
      setTimeout(hideProgress, 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理提交投票
  const handleVote = async () => {
    if (!account || numericVoteId === null || !selectedOption) {
      setError('请先连接钱包并选择投票选项');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // 投票过程的进度提示
      showProgress('提交投票', [
        { id: 'wallet', message: '连接钱包', status: 'active' },
        { id: 'proof', message: '生成零知识证明', status: 'pending' },
        { id: 'contract', message: '提交到区块链', status: 'pending' },
        { id: 'confirmation', message: '等待交易确认', status: 'pending' }
      ]);
      
      updateStep('wallet', 'completed');
      nextStep();
      
      const contract = await VotingContract.getInstance();
      
      try {
        // 生成零知识证明
        updateStep('proof', 'active');
        const { proof } = await contract.generateVoteProof(numericVoteId, selectedOption);
        
        if (!proof) {
          throw new Error('生成投票证明失败');
        }
        updateStep('proof', 'completed');
        nextStep();
        
        // 提交投票到区块链
        updateStep('contract', 'active');
        await contract.submitVote(numericVoteId, selectedOption, proof);
        
        updateStep('contract', 'completed');
        nextStep();
        
        // 等待确认
        updateStep('confirmation', 'active');
        await new Promise(resolve => setTimeout(resolve, 1000));
        updateStep('confirmation', 'completed');
        
        setHasVoted(true);
      } catch (err) {
        if (err instanceof Error) {
          const msg = err.message;
          if (msg.includes('proof') || msg.includes('证明')) {
            updateStep('proof', 'error');
          } else {
            updateStep('contract', 'error');
          }
          throw err;
        }
        updateStep('contract', 'error');
        throw err;
      }
      
      // 完成后延迟隐藏进度提示
      setTimeout(hideProgress, 1500);
      
      await loadVoteData();
    } catch (err) {
      console.error('提交投票失败:', err);
      const msg = err instanceof Error ? err.message : '投票失败，请稍后重试';
      setError(msg);
      setTimeout(hideProgress, 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // 各种状态的渲染处理
  if (!numericVoteId) return <div className="status error">无效的投票ID</div>;
  if (isLoading && !vote) return <div className="status">加载中...</div>;
  if (error) return <div className="status error">{error}</div>;
  if (!vote) return <div className="status error">投票不存在</div>;

  return (
    <div className="detail">
      <div className="header-container">
        <div className="title-section">
          <h2>{vote?.title}</h2>
          {vote?.description && <p className="description">{vote.description}</p>}
        </div>
      </div>

      <div className="info-bar">
        <span className={`user-status ${
          !isSignedUp ? 'status-unsigned' : 
          hasVoted ? 'status-voted' : 
          'status-signed'
        }`}>
          {!isSignedUp ? '未报名' : 
           hasVoted ? '已投票' : 
           '已报名'}
        </span>
        <span>报名人数: {vote?.voterCount || 0}</span>
        <span>已投票数: {vote?.totalVotes || 0}</span>
        <span className="vote-time">投票时间: {vote ? new Date(vote.startTime * 1000).toLocaleString() : '-'} 至 {vote ? new Date(vote.endTime * 1000).toLocaleString() : '-'}</span>
        <div style={{fontSize: '12px', color: '#666', marginTop: '8px'}}>
        </div>
      </div>

      {/* 未报名状态 */}
      {!isSignedUp && (
        <>
          {(
            (Date.now()/1000 >= vote.startTime - 48 * 60 * 60 &&Date.now()/1000<=vote.endTime) ? (
              <div className="signup">
                <button 
                  onClick={handleSignup} 
                  disabled={isLoading || !account} 
                  className="btn"
                >
                  {!account ? '请先连接钱包' : isLoading ? '处理中...' : '立即报名'}
                </button>
                <p>可在投票结束前随时报名参与投票</p>
              </div>
            ) : (
              <div className="status-info warning">
                <p>投票开始前48小时开放报名</p>
              </div>
            )
          )}
        </>
      )}

      {/* 已报名状态 */}
      {isSignedUp && !hasVoted && (
        <>
          {Number(vote?.phase) === VotePhase.Voting ? (
            <div className="vote-form">
              <h3>请选择投票选项</h3>
              <div className="options">
                {options.map(option => (
                  <div 
                    key={option.id}
                    className={`option ${selectedOption === option.id ? 'selected' : ''}`}
                    onClick={() => setSelectedOption(option.id)}
                  >
                    {option.text}
                  </div>
                ))}
              </div>
              <button 
                onClick={handleVote}
                disabled={!selectedOption || isLoading}
                className="btn"
              >
                {isLoading ? '处理中...' : '提交投票'}
              </button>
            </div>
          ) : Number(vote?.phase) === VotePhase.Registration ? (
            <div className="status-info">
              <p>已报名，请等待投票开始</p>
            </div>
          ) : Number(vote?.phase) === VotePhase.Ended ? (
            <div className="status-info warning">
              <p>投票已结束</p>
            </div>
          ) : null}
        </>
      )}
    

      {/* 结果展示区域 - 已投票或投票结束时显示 */}
      {(hasVoted || vote?.phase === VotePhase.Ended) && (
        <div className="results">
          <h3>投票结果{vote?.phase !== VotePhase.Ended && '（实时）'}</h3>
          <div className="result-list">
            {options.map(option => (
              <div key={option.id} className="result-item">
                <div className="result-text">{option.text}</div>
                <div className="result-count">{option.voteCount || 0}票</div>
                <div 
                  className="result-bar" 
                  style={{
                    width: `${((option.voteCount || 0) / Math.max(vote?.totalVotes || 1, 1)) * 100}%`
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoteDetail;
