export enum VoteStatus {
  LOADING = 'loading',
  BEFORE_REGISTRATION = 'before-registration',
  REGISTRATION = 'registration',
  VOTING = 'voting',
  ENDED = 'ended'
}

export const VOTE_STATUS_LABELS: Record<VoteStatus, string> = {
  [VoteStatus.LOADING]: '加载中',
  [VoteStatus.BEFORE_REGISTRATION]: '未开放报名',
  [VoteStatus.REGISTRATION]: '报名中',
  [VoteStatus.VOTING]: '投票中',
  [VoteStatus.ENDED]: '已结束'
};

export const MIN_VOTE_DURATION_HOURS = 1; // 最小投票持续时间1小时

// 投票合约地址
export const CONTRACT_ADDRESS = '0x00E3686f1b8AaF3647Be609c952fd9Bf4515CF65';