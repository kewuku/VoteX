const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 关键路径配置
const BUILD_DIR = path.join(__dirname, 'build', 'contracts');
const VOTING_ABI_DEST = path.join(__dirname, 'client', 'src', 'core', 'VotingABI.json');
const VERIFIER_ABI_DEST = path.join(__dirname, 'client', 'src', 'core', 'ZKProofVerifierABI.json');
const CONSTANTS_FILE = path.join(__dirname, 'client', 'src', 'core', 'constants.ts');
const network = process.argv[2] || 'development';

console.log('开始部署智能合约...\n');

try {
  // 部署合约
  console.log(`部署到${network}网络...`);
  execSync(`npx truffle migrate --reset --network ${network}`, { encoding: 'utf8', stdio: 'inherit' });
  
  // 获取合约地址
  const votingJsonPath = path.join(BUILD_DIR, 'Voting.json');
  if (!fs.existsSync(votingJsonPath)) throw new Error('找不到合约文件');
  
  const votingJson = JSON.parse(fs.readFileSync(votingJsonPath, 'utf8'));
  if (!votingJson.networks || Object.keys(votingJson.networks).length === 0) {
    throw new Error('部署失败：未找到网络部署信息');
  }
  
  const networkId = Object.keys(votingJson.networks).at(-1);
  const address = votingJson.networks[networkId]?.address;
  if (!address) throw new Error('无法获取合约地址');
  
  // 更新前端配置
  fs.copyFileSync(votingJsonPath, VOTING_ABI_DEST);
  
  // 拷贝 ZKProofVerifier ABI
  const verifierJsonPath = path.join(BUILD_DIR, 'ZKProofVerifier.json');
  if (!fs.existsSync(verifierJsonPath)) throw new Error('找不到 ZKProofVerifier 合约文件');
  fs.copyFileSync(verifierJsonPath, VERIFIER_ABI_DEST);

  // 更新合约地址
  fs.writeFileSync(
    CONSTANTS_FILE, 
    fs.readFileSync(CONSTANTS_FILE, 'utf8').replace(
      /(export const CONTRACT_ADDRESS = ').*(';)/, 
      `$1${address}$2`
    )
  );
  
  console.log('\n部署成功！');
  console.log(`合约地址: ${address}`);
  console.log('正在创建测试投票并报名...');
  execSync('truffle exec testAuto.js', { encoding: 'utf8', stdio: 'inherit' });
  
  console.log('正在启动前端开发服务器...');
  process.chdir(path.join(__dirname, 'client'));
  execSync('pnpm dev', { encoding: 'utf8', stdio: 'inherit' });
  
} catch (error) {
  console.error('部署失败:', error.message);
  process.exit(1);
}