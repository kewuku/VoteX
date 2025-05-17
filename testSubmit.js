const Voting = artifacts.require("Voting");
const ZKProofVerifier = artifacts.require("ZKProofVerifier");
// truffle exec testSubmit.js --proof=
//自动发起测试投票、报名并提交投票数据
module.exports = async function(callback) {
    try {
        // 解析参数
        const params = {};
        process.argv.forEach(arg => {
            if (arg.startsWith('--')) {
                const [key, value] = arg.slice(2).split('=');
                params[key] = value;
            }
        });

        // 获取合约实例
        const voting = await Voting.deployed();
        const proofVerifier = await ZKProofVerifier.at(await voting.proofVerifier());
        const voter = (await web3.eth.getAccounts())[0];

        // 准备测试参数
        const voteId = parseInt(params.voteId) || 1;
        const optionId = parseInt(params.optionId) || 1;
        let proof = params.proof;
        const tokenHash = params.tokenHash || "0x" + "1234".padStart(64, '0');

        console.log('\n=== 创建测试投票 ===');
        const now = Math.floor(Date.now() / 1000);
        const startTime = now;
        const endTime = now + 3600;
        
 
        await voting.createVote(
            "测试投票",
            "这是一个用于测试的投票",
            startTime,
            endTime,
            ["选项1", "选项2","选项3"],
            { from: voter }
        );
        console.log('测试投票创建成功');
        
        // 验证投票详情
        
        // 报名参与投票
        console.log('\n=== 报名参与投票 ===');
        const phase = await voting.getCurrentPhase(voteId);
        console.log('当前投票阶段:', Number(phase));
        
        // 先检查是否已经报名
        const isAlreadySignedUp = await voting.isSignedUp(voteId, voter);
        
        if (!isAlreadySignedUp) {
            await voting.signUpForVote(voteId, { from: voter });
            console.log('报名成功');
        } else {
            console.log('已经报名，无需重复报名');
        }

        // 验证报名状态
        const [isSignedUp, hasVoted] = await Promise.all([
            voting.isSignedUp(voteId, voter),
            voting.hasVoted(voteId, voter)
        ]);
        console.log('报名状态:', { isSignedUp, hasVoted });

        // 等待交易确认
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 执行submitVote
        try {
            console.log('\n[调用Voting.submitVote()]');
            
            // 检查投票阶段
            const phase = await voting.getCurrentPhase(voteId);
            console.log('当前投票阶段:', Number(phase));

            const result = await voting.submitVote.call(voteId, optionId, proof, tokenHash, {
                from: voter,
                gas: 3000000
            });
            
            console.log('预执行结果:', result);
            
            if (!result) {
                console.error('\n✗ 投票预执行失败');
                
                // 获取最后的合约状态
                const logs = await voting.getPastEvents('allEvents', {
                    fromBlock: await web3.eth.getBlockNumber() - 1,
                    toBlock: 'latest'
                });
                
                if (logs.length > 0) {
                    console.log('\n合约事件日志:');
                    logs.forEach(log => {
                        if (log.event === 'DebugInfo') {
                            console.log('调试信息:', log.args[0]);
                        } else if (log.event === 'DebugUint') {
                            console.log('调试数据:', log.args[0], log.args[1].toString());
                        } else if (log.event === 'DebugBytes') {
                            console.log('调试字节:', log.args[0], log.args[1]);
                        }
                    });
                }
                
                callback(new Error('投票预执行失败'));
                return;
            }
            
            // 实际执行交易
            const tx = await voting.submitVote(voteId, optionId, proof, tokenHash, {
                from: voter,
                gas: 3000000
            });
            
            console.log('交易已提交，等待确认...');

            // 处理返回值
            const receipt = await web3.eth.getTransactionReceipt(tx.tx);
            
            // 检查是否成功
            if (!receipt.status) {
                console.error('\n✗ 投票提交失败: 交易被回滚');
                callback(new Error('交易被回滚'));
                return;
            }

            console.log('投票提交成功!');
            console.log('交易哈希:', tx.tx);
            

        } catch (error) {
            // 只输出一次错误信息
            if (error.reason) {
                console.error('投票失败:', error.reason);
            } else if (error.message) {
                const errorMessage = error.message.split('\n')[0];
                console.error('投票失败:', errorMessage);
            }
            callback(error);
            return;
        }

        callback();
    } catch (error) {
        // 顶层错误处理，保持简洁
        console.error('执行出错:', error.message.split('\n')[0]);
        callback(error);
    }
};
