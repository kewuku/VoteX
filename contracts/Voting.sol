// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ZKProofVerifier.sol";

contract Voting {
    struct Option {
        string text;
        uint votesReceived;
    }

    enum VotePhase { Registration, Voting, Ended }
    
    struct VoteData {
        uint id;
        string title;
        string description;
        uint startTime;
        uint endTime;
        uint voterCount;
        uint totalVotes;
        uint optionCount;
        mapping(uint => Option) options;
        mapping(address => bool) hasVoted;
    }

    mapping(uint => VoteData) public votes;
    uint public totalVoteProjects;
    mapping(uint => mapping(address => bool)) public signedUpVoters;
    
    ZKProofVerifier public immutable proofVerifier;

    event VoteCreated(uint indexed voteId, string title);
    event VoterSignedUp(uint indexed voteId, address indexed voter);
    event VoteCast(uint indexed voteId);
    event VoteFeedback(string message, string result);
    
    constructor(ZKProofVerifier _proofVerifier) {
        require(address(_proofVerifier) != address(0), unicode"无效的证明验证器地址");
        proofVerifier = _proofVerifier;
    }

    function createVote(
        string memory _title,
        string memory _description,
        uint _startTime,
        uint _endTime,
        string[] memory _options
    ) public {
        require(_endTime > _startTime, unicode"结束时间必须在开始时间之后");
        require(_options.length > 0, unicode"至少需要一个选项");
        
        totalVoteProjects++;
        VoteData storage voteData = votes[totalVoteProjects];
        voteData.id = totalVoteProjects;
        voteData.title = _title;
        voteData.description = _description;
        voteData.startTime = _startTime;
        voteData.endTime = _endTime;
        voteData.optionCount = _options.length;
        
        for (uint i = 0; i < _options.length; i++) {
            voteData.options[i+1] = Option(_options[i], 0);
        }
        
        emit VoteCreated(totalVoteProjects, _title);
    }

    function signUpForVote(uint _voteId) public {
        VoteData storage voteData = votes[_voteId];
        require(voteData.id > 0, unicode"投票ID无效");
        
        uint registrationStartTime = voteData.startTime - 2 days;
        require(block.timestamp >= registrationStartTime, unicode"报名未开始");
        require(block.timestamp <= voteData.endTime, unicode"报名已结束"); // 允许在投票期间报名
        require(!signedUpVoters[_voteId][msg.sender], unicode"已报名");
        
        signedUpVoters[_voteId][msg.sender] = true;
        voteData.voterCount++;
        
        emit VoterSignedUp(_voteId, msg.sender);
    }

    function submitVote(
        uint _voteId,
        uint _optionId,
        bytes calldata _proof
    ) public {
        VoteData storage voteData = votes[_voteId];
        
        // 验证投票阶段
        VotePhase phase = getCurrentPhase(_voteId);
        require(phase == VotePhase.Voting, unicode"不在投票阶段");
        
        // 验证选项ID
        require(_optionId > 0 && _optionId <= voteData.optionCount, unicode"选项ID无效");
        
        // 验证用户未投票
        bool hasAlreadyVoted = voteData.hasVoted[msg.sender];
        require(!hasAlreadyVoted, unicode"已经投票");

        // 验证证明，传递voteId
        bool isProofValid = verifyProofUsingPrecompiles(_proof, _voteId);
        require(isProofValid, unicode"投票证明无效");
        
        // 更新状态
        voteData.options[_optionId].votesReceived++;
        voteData.totalVotes++;
        voteData.hasVoted[msg.sender] = true;
        
        emit VoteCast(_voteId);
    }
    
    function verifyProofUsingPrecompiles(
        bytes calldata _proof,
        uint _voteId
    ) internal returns (bool) {
        // 调用ZKProofVerifier合约验证证明
        bool isValid = proofVerifier.verifyVoteProof(_proof, _voteId);
        emit VoteFeedback(unicode"投票证明验证", isValid ? unicode"成功" : unicode"失败");
        return isValid;
    }

    function getCurrentPhase(uint _voteId) public view returns (VotePhase) {
        VoteData storage voteData = votes[_voteId];
        require(voteData.id > 0, unicode"投票ID无效");
        
        uint currentTime = block.timestamp;
        uint registrationStartTime = voteData.startTime - 2 days;

        // 先检查是否已经结束
        if (currentTime > voteData.endTime) {
            return VotePhase.Ended;
        }
        // 然后检查是否在投票阶段
        else if (currentTime >= voteData.startTime) {
            return VotePhase.Voting;
        }
        // 最后检查是否在报名阶段
        else if (currentTime >= registrationStartTime) {
            return VotePhase.Registration;
        }
        // 如果都不是，则表示还未开始报名
        else {
            return VotePhase.Ended;
        }
    }

    function getVote(uint _voteId) public view returns (
        uint id,
        string memory title,
        string memory description,
        uint startTime,
        uint endTime,
        uint voterCount,
        uint numVotes  // 改名以避免shadowing
    ) {
        require(_voteId > 0 && _voteId <= totalVoteProjects, unicode"投票ID无效");
        VoteData storage voteData = votes[_voteId];
        return (
            voteData.id,
            voteData.title,
            voteData.description,
            voteData.startTime,
            voteData.endTime,
            voteData.voterCount,
            voteData.totalVotes
        );
    }

    function getOption(uint _voteId, uint _optionId) public view returns (
        string memory optionText,
        uint voteCount
    ) {
        VoteData storage voteData = votes[_voteId];
        require(_optionId > 0 && _optionId <= voteData.optionCount, unicode"选项ID无效");
        
        Option storage option = voteData.options[_optionId];
        
        // 如果投票未结束且用户未投票，则不显示具体票数
        if (getCurrentPhase(_voteId) != VotePhase.Ended && !voteData.hasVoted[msg.sender]) {
            return (option.text, 0);
        }
        
        return (option.text, option.votesReceived);
    }

    function getOptionCount(uint _voteId) public view returns (uint) {
        return votes[_voteId].optionCount;
    }

    function hasVoted(uint _voteId, address _voter) public view returns (bool) {
        return votes[_voteId].hasVoted[_voter];
    }

    function isSignedUp(uint _voteId, address _voter) public view returns (bool) {
        return signedUpVoters[_voteId][_voter];
    }
}
