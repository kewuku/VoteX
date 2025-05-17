import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VotingContract from './core/VotingContract';
import { MIN_VOTE_DURATION_HOURS } from './core/constants';
import { Option } from './core/types';
import { useProgress } from './ProgressContext';
import './styles/InitiateVote.css';

interface FormData {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
}

const InitiateVote: React.FC<{ account: string | null }> = ({ account }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    startTime: '',
    endTime: ''
  });
  const [options, setOptions] = useState<Option[]>([]);
  const [newOption, setNewOption] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showProgress, updateStep, nextStep, hideProgress } = useProgress();

  // 处理表单字段变更
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 添加投票选项
  const handleAddOption = () => {
    const text = newOption.trim();
    if (!text) return;
    
    setOptions(prev => [...prev, {
      id: Date.now().toString(),
      text
    }]);
    setNewOption('');
  };

  // 表单验证
  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('请输入投票标题');
      return false;
    }
    if (!formData.startTime || !formData.endTime) {
      setError('请设置投票时间');
      return false;
    }
    if (options.length < 2) {
      setError('请至少添加两个投票选项');
      return false;
    }

    const startDate = new Date(formData.startTime);
    const endDate = new Date(formData.endTime);
    
    // 确保结束时间在开始时间之后
    if (endDate <= startDate) {
      setError('结束时间必须在开始时间之后');
      return false;
    }
    
    // 计算投票持续时间（小时）
    const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 3600);
    if (durationHours < MIN_VOTE_DURATION_HOURS) {
      setError(`投票持续时间不能少于${MIN_VOTE_DURATION_HOURS}小时`);
      return false;
    }

    return true;
  };

  // 提交创建投票表单
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!account) {
      setError('请先连接钱包');
      return;
    }

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      showProgress('发起投票', [
        { id: 'preparing', message: '准备投票数据', status: 'active' },
        { id: 'wallet', message: '连接钱包', status: 'pending' },
        { id: 'contract', message: '调用智能合约', status: 'pending' },
        { id: 'confirmation', message: '等待区块确认', status: 'pending' },
        { id: 'completion', message: '完成创建', status: 'pending' }
      ]);

      await new Promise(resolve => setTimeout(resolve, 800));
      updateStep('preparing', 'completed');
      nextStep();

      updateStep('wallet', 'active');
      await new Promise(resolve => setTimeout(resolve, 600));
      updateStep('wallet', 'completed');
      nextStep();

      updateStep('contract', 'active');
      const contract = await VotingContract.getInstance();

      try {
        const startDate = new Date(formData.startTime);
        const endDate = new Date(formData.endTime);
        
        // 转换为Unix时间戳（秒）
        const startTime = Math.floor(startDate.getTime() / 1000);
        const endTime = Math.floor(endDate.getTime() / 1000);
        
        await contract.createVote(
          formData.title,
          formData.description,
          startTime,
          endTime,
          options.map(opt => opt.text)
        );

        updateStep('contract', 'completed');
        nextStep();

        updateStep('confirmation', 'active');
        await new Promise(resolve => setTimeout(resolve, 1200));
        updateStep('confirmation', 'completed');
        nextStep();

        updateStep('completion', 'active');
        await new Promise(resolve => setTimeout(resolve, 500));
        updateStep('completion', 'completed');

        setTimeout(() => {
          hideProgress();
          navigate('/?t=' + Date.now());
        }, 1000);
      } catch (err) {
        updateStep('contract', 'error');
        throw err;
      }
    } catch (err) {
      setError('创建投票失败，请稍后重试');
      console.error('创建投票失败:', err);
      
      setTimeout(() => {
        hideProgress();
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-vote">
      {error && <div className="error">{error}</div>}

      <form onSubmit={handleSubmit} className="form">
        <div className="form-container">
          <div className="form-left">
            <div className="form-group">
              <label>投票标题 *</label>
              <input
                type="text"
                name="title"
                className="input"
                value={formData.title}
                onChange={handleChange}
                placeholder="输入投票标题"
                required
              />
            </div>

            <div className="form-group">
              <label>投票描述</label>
              <textarea
                name="description"
                className="input"
                value={formData.description}
                onChange={handleChange}
                placeholder="输入投票描述"
                rows={3}
              />
            </div>
          </div>

          <div className="form-right">
            <div className="form-group">
              <label>开始时间 *</label>
              <input
                type="datetime-local"
                name="startTime"
                className="input"
                value={formData.startTime}
                onChange={handleChange}
                required
                />
                <small>注册时间将自动设置为开始时间前两天</small>
            </div>
            
            <div className="form-group">
              <label>结束时间 *</label>
              <input
                type="datetime-local"
                name="endTime"
                className="input"
                value={formData.endTime}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        </div>

        <div className="options-section">
          <label>投票选项 *</label>
          <div className="option-input">
            <input
              type="text"
              value={newOption}
              onChange={e => setNewOption(e.target.value)}
              placeholder="输入选项内容"
              className="input"
            />
            <button 
              type="button"
              onClick={handleAddOption}
              className="btn"
            >
              添加
            </button>
          </div>

          {options.length > 0 && (
            <ul className="option-list">
              {options.map(option => (
                <li key={option.id} className="option-item">
                  <span>{option.text}</span>
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => setOptions(prev => prev.filter(opt => opt.id !== option.id))}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          className="btn submit-btn"
          disabled={isSubmitting || !account}
        >
          {isSubmitting ? '提交中...' : '发起投票'}
        </button>
      </form>
    </div>
  );
};

export default InitiateVote;
