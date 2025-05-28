# VoteX - 基于零知识证明的区块链投票系统

VoteX 是一个使用零知识证明技术的区块链投票系统，通过智能合约实现安全、透明的投票流程。

## 技术栈

- 前端: React + TypeScript + Vite
- 智能合约: Solidity
- 区块链: Ethereum (Ganache测试网络)
- 零知识证明: 结合Pederson承诺的非交互式双基点Schnorr协议零知识证明
- Web3交互: ethers.js

## 功能特性

- 创建投票项目
- 投票人注册
- 匿名投票（基于零知识证明）
- 实时投票状态查看
- 投票结果验证
- 多阶段投票流程管理（注册、投票、结束）

## 项目结构

```
VoteX/
├── contracts/           # 智能合约源码
│   ├── Voting.sol      # 主投票合约
│   └── ZKProofVerifier.sol # 零知识证明验证合约
├── client/             # 前端应用
│   ├── src/           
│   │   ├── core/      # 核心功能实现
│   │   └── styles/    # 样式文件
│   └── public/        # 静态资源
├── migrations/         # Truffle迁移脚本
└── test/              # 测试文件
```

## 快速开始

### 环境准备
1. 安装并启动 Ganache，确保其运行在 `127.0.0.1:7545` 端口
2. 安装 MetaMask 浏览器扩展，并将其连接到 Ganache 本地网络

### 安装和部署
1. 安装前端依赖并启动项目
```bash
# 一键部署和启动（包含合约部署、创建测试投票和启动前端）
node deploy.js
```

部署脚本会自动完成以下操作：
- 部署智能合约到本地 Ganache 网络
- 更新前端配置文件
- 创建测试投票并完成初始化
- 启动前端开发服务器

## 开发指南

### 智能合约开发
- 合约位于 `contracts/` 目录
- 使用 Truffle 进行开发和部署
- 默认连接到 Ganache 本地网络 (http://127.0.0.1:7545)

### 前端开发
- 使用 React + TypeScript
- Vite 作为构建工具
- Web3 交互使用 ethers.js
- MetaMask 作为用户钱包

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 许可证

MIT License