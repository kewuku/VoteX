// 投票阶段枚举
export enum VotePhase {
  Registration, // 报名阶段：开始前48小时
  Voting,      // 投票阶段：开始时间到结束时间
  Ended        // 已结束
}

export interface Vote {
  id: number;
  title: string;
  description: string;
  startTime: number;      // 投票开始时间
  endTime: number;        // 投票结束时间
  voterCount: number;     // 已报名人数
  totalVotes: number;     // 已投票数
  phase?: VotePhase;      // 当前投票阶段
  hasVoted?: boolean;     // 当前用户是否已投票
}

export interface Option {
  id: number | string;
  text: string;
}

export interface WindowWithEthereum extends Window {
  ethereum?: any;
}