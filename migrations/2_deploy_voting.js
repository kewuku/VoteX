const ZKProofVerifier = artifacts.require("ZKProofVerifier");
const Voting = artifacts.require("Voting");

module.exports = async function(deployer) {
  try {
    // 1. 部署 ZKProofVerifier
    console.log('Deploying ZKProofVerifier...');
    await deployer.deploy(ZKProofVerifier);
    const zkProofVerifier = await ZKProofVerifier.deployed();
    
    // 2. 部署 Voting 合约，传入 ZKProofVerifier 地址
    console.log('Deploying Voting contract...');
    await deployer.deploy(Voting, zkProofVerifier.address);
    
    console.log('Deployment completed successfully');
    
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
};
