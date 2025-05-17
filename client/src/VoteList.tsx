import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VotingContract from './core/VotingContract';
import { Vote, VotePhase } from './core/types';
import './styles/VoteList.css';

interface VoteListProps {
  contract: VotingContract;
}

// 投票阶段对应的CSS类名
const PHASE_CLASSES = {
  [VotePhase.Registration]: 'registration',
  [VotePhase.Voting]: 'voting',
  [VotePhase.Ended]: 'ended'
};

const VoteList: React.FC<VoteListProps> = ({ contract }) => {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!contract) return;
    
    // 监听合约事件，在投票状态变化时刷新列表
    const handleVoteCreated = () => loadVotes();
    const handleVoterSignedUp = () => loadVotes();
    const handleVoteCast = () => loadVotes();
    
    contract.on('voteCreated', handleVoteCreated);
    contract.on('voterSignedUp', handleVoterSignedUp);
    contract.on('voteCast', handleVoteCast);

    // 初始加载
    loadVotes();

    // 组件卸载时清理事件监听
    return () => {
      contract.off('voteCreated', handleVoteCreated);
      contract.off('voterSignedUp', handleVoterSignedUp);
      contract.off('voteCast', handleVoteCast);
    };
  }, [contract]);

  // 加载所有投票信息
  const loadVotes = async () => {
    try {
      if (!contract) {
        setError('合约实例不存在');
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      const votes = await contract.getVotes();
      setVotes(votes);
    } catch (err) {
      console.error('加载投票列表失败:', err);
      setError('获取投票列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div className="status">加载中...</div>;
  if (error) return <div className="status error">{error}</div>;

  return (
    <main className="vote-list">
      <div className="vote-grid">
        {votes.map(vote => (
          <article 
            key={vote.id} 
            className={`vote-card ${vote.phase !== undefined ? PHASE_CLASSES[vote.phase] : 'loading'}`}
            onClick={() => navigate(`/vote/${vote.id}`)}
          >
            <h3>{vote.title}</h3>
            <div className="vote-stats">
              <span>报名: {vote.voterCount}人</span>
              <span>已投票: {vote.totalVotes}票</span>
            </div>
            <div className="vote-dates">
              <div>投票时间: {new Date(vote.startTime*1000).toLocaleDateString()} - {new Date(vote.endTime*1000).toLocaleDateString()}</div>
            </div>
          </article>
        ))}
        <article className="vote-card new" onClick={() => navigate('/create')}>
          <span className="plus">+</span>
          <span>发起投票</span>
        </article>
      </div>
    </main>
  );
};

export default VoteList;