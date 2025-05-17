// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;

// 用于管理合约部署迁移的合约
contract Migrations {
  address public owner = msg.sender;
  uint public last_completed_migration;

  // 仅合约所有者可调用的函数修饰器
  modifier restricted() {
    require(msg.sender == owner, unicode"此功能仅限合约所有者调用");
    _;
  }

  // 更新已完成的迁移进度
  function setCompleted(uint completed) public restricted {
    last_completed_migration = completed;
  }
}
