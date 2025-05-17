const Voting = artifacts.require("Voting");
// 自动发起测试投票并报名
module.exports = async function(callback) {
    try {
        // 获取合约实例
        const voting = await Voting.deployed();
        const voter = (await web3.eth.getAccounts())[0];

        console.log('\n=== 创建测试投票 ===');
        const now = Math.floor(Date.now() / 1000);
        const startTime = now;
        const endTime = now + 36000;
        const voteId = 1;
        
        try {
            await voting.createVote(
                "测试投票",
                "这是一个用于测试的投票",
                startTime,
                endTime,
                ["选项1","选项2", "选项3"],
                { from: voter }
            );
            console.log('测试投票创建成功');
            
            // 验证投票详情
            const voteData = await voting.getVote(voteId);
            console.log('投票详情:', {
                id: Number(voteData[0]),
                title: voteData[1],
                description: voteData[2],
                startTime: Number(voteData[3]),
                endTime: Number(voteData[4]),
                voterCount: Number(voteData[5]),
                totalVotes: Number(voteData[6])
            });
            
            // 报名参与投票
            console.log('\n=== 报名参与投票 ===');
            const phase = await voting.getCurrentPhase(voteId);
            console.log('当前投票阶段:', Number(phase));
            
            await voting.signUpForVote(voteId, { from: voter });
            console.log('报名成功');

            // 验证报名状态
            const [isSignedUp, hasVoted] = await Promise.all([
                voting.isSignedUp(voteId, voter),
                voting.hasVoted(voteId, voter)
            ]);
            console.log('报名状态:', { isSignedUp, hasVoted });

        } catch (error) {
            console.error('创建投票或报名失败:', error);
            if (error.reason) {
                console.error('原因:', error.reason);
            }
            callback(error);
            return;
        }

        callback();
    } catch (error) {
        callback(error);
    }
};
