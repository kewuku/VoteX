module.exports = {
  ganache: {
    quiet: true,
    _useGanacheGUIClient: true
  },
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
      gas: 6000000,           // 提供足够的gas用于部署
      gasPrice: 20000000000,  // 20 Gwei
      timeoutBlocks: 100,     // 防止卡住
      networkCheckTimeout: 10000
    }
  },
  compilers: {
    solc: {
      version: "0.8.19",  // 使用最新的稳定版本
      settings: {
        optimizer: {
          enabled: true,
          runs: 1000      // 增加优化运行次数
        },
        viaIR: true,     // 启用新的优化管道
        evmVersion: "paris",
        metadata: {
          useLiteralContent: true
        }
      }
    }
  },
  db: {
    enabled: false
  }
};
