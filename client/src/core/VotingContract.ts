import { BrowserProvider, Contract, ethers } from 'ethers';
import { Vote, VotePhase } from './types';
import VotingABIFile from './VotingABI.json';
import ZKProofVerifierABIFile from './ZKProofVerifierABI.json';
import { VoteProof } from './VoteProof';
import { CONTRACT_ADDRESS } from './constants';

interface VotingContractInterface extends Contract {}
interface ZKProofVerifierInterface extends Contract {}

// 存储投票时的临时数据
interface VoteInfo {
  optionId: number;
}

export default class VotingContract {
  private static instance: VotingContract | null = null;
  private contract: VotingContractInterface | null = null;
  private verifier: ZKProofVerifierInterface | null = null;
  private provider: BrowserProvider | null = null;
  private voteProof: VoteProof;
  private listeners: { [event: string]: Function[] } = {};
  private voteStore: Map<string, VoteInfo> = new Map();
  private submittingVotes: Set<string> = new Set(); // 添加防重入锁

  private constructor() {
    this.voteProof = new VoteProof();
  }

  // 获取单例实例
  public static async getInstance(): Promise<VotingContract> {
    if (!VotingContract.instance) {
      VotingContract.instance = new VotingContract();
      await VotingContract.instance.initialize();
    }
    return VotingContract.instance;
  }

  // 初始化合约实例
  private async initialize() {
    if (this.contract) return;

    const win = window as any;
    if (!win.ethereum) {
      throw new Error('请安装MetaMask');
    }

    this.provider = new BrowserProvider(win.ethereum);
    const signer = await this.provider.getSigner();

    this.contract = new Contract(
      CONTRACT_ADDRESS,
      VotingABIFile.abi,
      signer
    ) as VotingContractInterface;

    // 初始化验证器合约实例
    const verifierAddress = await this.contract.getFunction('proofVerifier')();
    this.verifier = new Contract(
      verifierAddress,
      ZKProofVerifierABIFile.abi,
      signer
    ) as ZKProofVerifierInterface;

    this.setupEventListeners();
    this.loadVotes();
  }

  // 注册事件监听器
  public on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  // 移除事件监听器
  public off(event: string, callback: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  // 触发事件通知
  private emit(event: string, data: any) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(data));
  }

  // 设置合约事件监听器
  private setupEventListeners() {
    if (!this.contract || !this.verifier) return;

    // 监听 Voting 合约的事件
    this.contract.on('VoteCreated', (voteId, title) => {
      this.emit('voteCreated', { voteId: Number(voteId), title });
    });

    this.contract.on('VoterSignedUp', (voteId, voter) => {
      console.log('用户报名成功:', { voteId: Number(voteId), voter });
    });

    this.contract.on('VoteCast', (voteId) => {
      this.emit('voteCast', { voteId: Number(voteId) });
    });

    // 监听 ZKProofVerifier 合约的调试事件
    this.verifier.on('DebugVerifyPoint', (message: string, x: BigInt, y: BigInt) => {
      console.log(`验证器 - ${message}:`, {
        x: x.toString(),
        y: y.toString()
      });
    });

    this.verifier.on('DebugUint', (message: string, value: BigInt) => {
      console.log(`验证器 - ${message}:`, value.toString());
    });
  }

  // 创建新投票
  public async createVote(
    title: string,
    description: string,
    startTime: number,
    endTime: number,
    options: string[]
  ): Promise<void> {
    const contract = await this.getContract();
    await contract.getFunction('createVote')(
      title, 
      description, 
      startTime,
      endTime,
      options
    );
  }

  // 获取单个投票信息
  public async getVote(voteId: number): Promise<Vote> {
    const contract = await this.getContract();
    const data = await contract.getFunction('getVote')(voteId);
    return {
      id: Number(data[0]),
      title: data[1],
      description: data[2],
      startTime: Number(data[3]),
      endTime: Number(data[4]),
      voterCount: Number(data[5]),
      totalVotes: Number(data[6]),  // 使用totalVotes来表示总投票数
      phase: await this.getCurrentPhase(voteId)
    };
  }

  public async getTotalVoteProjects(): Promise<number> {
    const contract = await this.getContract();
    const count = await contract.getFunction('totalVoteProjects')();
    return Number(count);
  }

  // 获取投票的当前阶段
  public async getCurrentPhase(voteId: number): Promise<VotePhase> {
    const contract = await this.getContract();
    const phase = await contract.getFunction('getCurrentPhase')(voteId);
    return phase;
  }

  // 检查是否在报名时间内
  public async isInRegistrationPeriod(voteId: number): Promise<boolean> {
    const phase = await this.getCurrentPhase(voteId);
    return phase === VotePhase.Registration;
  }

  // 检查是否在投票时间内
  public async isInVotingPeriod(voteId: number): Promise<boolean> {
    const phase = await this.getCurrentPhase(voteId);
    return phase === VotePhase.Voting;
  }

  // 检查是否已结束
  public async isEnded(voteId: number): Promise<boolean> {
    const phase = await this.getCurrentPhase(voteId);
    return phase === VotePhase.Ended;
  }

  // 获取所有投票列表
  public async getVotes(): Promise<Vote[]> {
    const contract = await this.getContract();
    const voteCount = Number(await contract.getFunction('totalVoteProjects')());
    
    const promises = [];
    for (let i = 1; i <= voteCount; i++) {
      promises.push(this.getVote(i));
    }
    
    return Promise.all(promises);
  }

  // 获取选项信息
  public async getOption(voteId: number, optionId: number) {
    const contract = await this.getContract();
    const data = await contract.getFunction('getOption')(voteId, optionId);
    return {
      text: data[0],
      voteCount: Number(data[1])
    };
  }

  // 获取选项数量
  public async getOptionCount(voteId: number): Promise<number> {
    const contract = await this.getContract();
    return Number(await contract.getFunction('getOptionCount')(voteId));
  }

  // 报名参与投票
  public async signUpForVote(voteId: number): Promise<void> {
    const contract = await this.getContract();
    await contract.getFunction('signUpForVote')(voteId);
  }

  // 提交投票
  public async submitVote(
    voteId: number, 
    optionId: number, 
    proof?: Uint8Array
  ): Promise<void> {
    const voteKey = `${voteId}-${optionId}`;
    if (this.submittingVotes.has(voteKey)) {
      throw new Error('投票正在处理中，请勿重复提交');
    }
    
    this.submittingVotes.add(voteKey);
    
    try {
      await this.initialize();

      try {
        const contract = await this.getContract();
        const signer = await this.provider!.getSigner();
        const userAddress = await signer.getAddress();

        // 检查投票状态
        const [phase, isSignedUp, hasVoted] = await Promise.all([
          this.getCurrentPhase(voteId),
          this.isSignedUp(voteId, userAddress),
          this.hasVoted(voteId, userAddress)
        ]);

        if (Number(phase) !== VotePhase.Voting) {
          throw new Error('当前不在投票阶段');
        }

        if (!isSignedUp) {
          throw new Error('您尚未注册参与此投票');
        }

        if (hasVoted) {
          throw new Error('您已经为此投票提交过选项');
        }

        // 处理证明数据
        let proofData = proof;
        
        if (!proofData) {
          const result = await this.generateVoteProof(voteId, optionId);
          proofData = result.proof;
        }

        // 验证并打印提交数据
        if (!proofData || proofData.length !== 192) {
            throw new Error(`证明数据长度错误: ${proofData?.length}, 期望: 192`);
        }

        let proofHex: string;
        try {
            // 验证数组是否为标准的 Uint8Array
            if (!(proofData instanceof Uint8Array)) {
                console.error('证明数据类型错误:', typeof proofData);
                throw new Error('证明数据必须是Uint8Array类型');
            }

            // 验证数据是否包含有效内容
            const hasValidData = proofData.some(byte => byte !== 0);
            if (!hasValidData) {
                throw new Error('证明数据全为零');
            }

            // 使用 VoteProof 的方法进行编码
            proofHex = VoteProof.bytesToHex(proofData, true); // 生成带0x前缀的十六进制

            // 验证十六进制字符串长度
            const expectedLength = 2 + (192 * 2); // 0x + (192 bytes * 2 chars per byte)
            if (proofHex.length !== expectedLength) {
                throw new Error(`十六进制字符串长度错误: ${proofHex.length}, 期望: ${expectedLength}`);
            }
        } catch (error) {
            console.error('证明数据转换失败:', {
                error,
                proofData: proofData ? {
                    type: proofData.constructor.name,
                    length: proofData.length,
                    isArray: Array.isArray(proofData),
                    isUint8Array: proofData instanceof Uint8Array
                } : 'null'
            });
            throw new Error('证明数据格式错误: ' + (error as Error).message);
        }

        // 打印证明数据
        console.log('证明数据:', proofHex);

        // 提交交易
        const tx = await contract.getFunction('submitVote')(
          voteId,
          optionId,
          proofHex
        );
        
        const receipt = await tx.wait();
        
        // 保存投票记录
        this.saveVote(voteId, { optionId });
          
      } catch (error: any) {
        console.error('投票提交失败:', error);
        
        if (error.data) {
          console.log('错误数据:', error.data);
        }
        if (error.error) {
          console.log('错误详情:', error.error);
        }
        if (error.transaction) {
          console.log('交易数据:', error.transaction);
        }
        
        if (error.message?.includes('missing revert data')) {
          throw new Error('投票提交失败，请检查投票数据格式是否正确。详细错误：' + error.message);
        }
        
        if (error.message?.includes('user rejected transaction')) {
          throw new Error('您取消了交易');
        }

        if (error.message?.includes('proof invalid')) {
          throw new Error('投票证明无效，请重试');
        }
        
        throw error;
      }
    } finally {
      this.submittingVotes.delete(voteKey);
    }
  }

  // 检查用户是否已投票
  public async hasVoted(voteId: number, account: string): Promise<boolean> {
    const contract = await this.getContract();
    return contract.getFunction('hasVoted')(voteId, account);
  }

  // 检查用户是否已报名
  public async isSignedUp(voteId: number, account: string): Promise<boolean> {
    const contract = await this.getContract();
    return contract.getFunction('signedUpVoters')(voteId, account);
  }

  private async getContract(): Promise<Contract> {
    await this.initialize();
    if (!this.contract) {
      throw new Error('合约未初始化');
    }
    return this.contract;
  }

  // 生成投票证明
  public async generateVoteProof(voteId: number, optionId: number): Promise<{
    proof: Uint8Array;
    commitment: string;
  }> {
    try {
      // 生成投票证明
      const result = await this.voteProof.generateVoteProof(voteId, optionId);
      if (!result.proof || !result.commitment) {
        throw new Error('生成投票证明失败');
      }

      // 验证生成的证明
      const isValid = await this.voteProof.verifyProof(result.proof, optionId,voteId);
      if (!isValid) {
        throw new Error('生成的投票证明无效');
      }

      return result;
    } catch (error) {
      console.error('生成投票证明失败:', error);
      throw error;
    }
  }

  // 辅助方法：保存投票信息
  private saveVote(voteId: number, info: VoteInfo) {
    const key = voteId.toString();
    this.voteStore.set(key, info);
    
    try {
      const storageData = localStorage.getItem('voteInfo') || '{}';
      const data = JSON.parse(storageData);
      data[key] = info;
      localStorage.setItem('voteInfo', JSON.stringify(data));
    } catch (e) {
      console.error('保存投票信息失败:', e);
    }
  }

  // 辅助方法：加载投票信息
  private loadVotes() {
    try {
      const storageData = localStorage.getItem('voteInfo');
      if (storageData) {
        const data = JSON.parse(storageData);
        for (const [key, value] of Object.entries(data)) {
          this.voteStore.set(key, value as VoteInfo);
        }
      }
    } catch (e) {
      console.error('加载投票信息失败:', e);
    }
  }
}
