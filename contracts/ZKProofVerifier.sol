// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// 零知识证明验证器，实现结合Pederson承诺的标准非交互式双基点Schnorr协议
contract ZKProofVerifier {
    struct G1Point {
        uint256 x;
        uint256 y;
    }
    
    // bn128曲线常量
    uint256 constant private P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47;
    uint256 constant private N = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001;
    uint256 constant private B = 3; // b = 3 for bn128
    
    // 基点G的坐标常量（bn128的生成元）
    uint256 constant private G1_X = 1;
    uint256 constant private G1_Y = 2;
    
    // 系统使用的辅助点H
    G1Point public H;
    
    // 调试事件
    event DebugVerifyPoint(string message, uint256 x, uint256 y);
    event DebugUint(string message, uint256 value);
    event GasUsage(string functionName, uint256 gasUsed);
    
    // 获取基点G
    function getG1() internal pure returns (G1Point memory) {
        return G1Point(G1_X, G1_Y);
    }
    
    // 构造函数，初始化辅助点H
    constructor() {
        // 初始化一个已知在曲线上的有效辅助点H (bn128标准辅助点)
        uint256 hx = 0x26d54f2fc05f6c2317596cefcb2ab3d23119b28b91cfb8e29cf991ed30dedc91;
        uint256 hy = 0x20fb6823bbd8388fec2202f1062cac2f39849868bc381634587e4d5e1c80cb85;
        
        // 验证坐标范围
        require(hx < P && hy < P, unicode"辅助点坐标超出范围");
        
        // 验证点在曲线上
        require(isOnCurve(hx, hy), unicode"辅助点不在曲线上");
        
        // 初始化H点
        H = G1Point(hx, hy);
        
        // 确保H不是无穷远点
        require(H.x != 0 || H.y != 0, unicode"辅助点初始化失败: 得到无穷远点");
        
        // 输出辅助点信息用于调试
        emit DebugVerifyPoint(unicode"辅助点H已初始化", H.x, H.y);
    }
    
    // 优化的零知识证明验证函数 
    function verifyVoteProof(
        bytes calldata proof,
        uint256 voteId
    ) public returns (bool) {
        uint256 startGas = gasleft();
        
        // 验证Schnorr证明的长度必须是192字节
        require(proof.length == 192 && voteId != 0, unicode"无效的输入参数");
        
        // 直接提取证明组件
        (G1Point memory commPoint, G1Point memory R, uint256 s, uint256 sPrime) = 
            extractProofComponents(proof);
            
        // 验证范围并记录日志
        validateProofComponents(commPoint, R, s, sPrime);
        
        // 优化的挑战值计算，使用voteId
        uint256 e = computeChallenge(R, commPoint, voteId);
        emit DebugUint(unicode"挑战值e:", e);

        // 链式计算等式两边: sG + s'H ?= R + eC
        (G1Point memory left, G1Point memory right) = 
            computeVerificationEquation(s, sPrime, R, commPoint, e);
            
        bool valid = (left.x == right.x && left.y == right.y);
        
        uint256 gasUsed = startGas - gasleft();
        emit GasUsage("verifyVoteProof", gasUsed);
        
        return valid;
    }

    // 计算验证等式两边
    function computeVerificationEquation(
        uint256 s,
        uint256 sPrime,
        G1Point memory R,
        G1Point memory commPoint,
        uint256 e
    ) internal returns (G1Point memory left, G1Point memory right) {
        uint256 startGas = gasleft();
        
        // 左边：sG + s'H
        left = ecAdd(
            ecMul(getG1(), s),
            ecMul(H, sPrime)
        );
        emit DebugVerifyPoint(unicode"等式左边", left.x, left.y);

        // 右边：R + eC
        right = ecAdd(
            R,
            ecMul(commPoint, e)
        );
        emit DebugVerifyPoint(unicode"等式右边", right.x, right.y);
        
        uint256 gasUsed = startGas - gasleft();
        emit GasUsage("computeVerificationEquation", gasUsed);
    }
    
    // 从证明数据中提取组件，优化内存使用
    function extractProofComponents(bytes calldata proof) internal returns (
        G1Point memory commPoint,
        G1Point memory R,
        uint256 s,
        uint256 sPrime
    ) {
        uint256 startGas = gasleft();
        
        require(proof.length == 192, unicode"无效的证明长度");

        assembly {
            let ptr := mload(0x40)  // 获取空闲内存指针
            
            // 为两个点和标量值分配内存
            commPoint := ptr
            R := add(ptr, 64)
            
            // 扩展内存
            mstore(0x40, add(ptr, 128))
            
            // 提取承诺点坐标
            let x := calldataload(proof.offset)
            let y := calldataload(add(proof.offset, 32))
            
            // 验证点坐标范围
            if or(iszero(lt(x, P)), iszero(lt(y, P))) {
                revert(0, 0)
            }
            
            // 存储承诺点坐标
            mstore(commPoint, x)
            mstore(add(commPoint, 32), y)
            
            // 提取R点坐标
            x := calldataload(add(proof.offset, 64))
            y := calldataload(add(proof.offset, 96))
            
            // 验证点坐标范围
            if or(iszero(lt(x, P)), iszero(lt(y, P))) {
                revert(0, 0)
            }
            
            // 存储R点坐标
            mstore(R, x)
            mstore(add(R, 32), y)
            
            // 提取标量值
            s := calldataload(add(proof.offset, 128))
            sPrime := calldataload(add(proof.offset, 160))
            
            // 验证标量值范围
            if or(iszero(lt(s, N)), iszero(lt(sPrime, N))) {
                revert(0, 0)
            }
        }
        
        uint256 gasUsed = startGas - gasleft();
        emit GasUsage("extractProofComponents", gasUsed);
    }
    
    // 验证证明组件的有效性
    function validateProofComponents(
        G1Point memory commPoint,
        G1Point memory R,
        uint256 s,
        uint256 sPrime
    ) internal {
        // 优化的曲线点验证
        assembly {
            // 验证第一个点
            let xx := mulmod(mload(commPoint), mload(commPoint), P)
            let xxx := mulmod(xx, mload(commPoint), P)
            let yy := mulmod(mload(add(commPoint, 32)), mload(add(commPoint, 32)), P)
            if iszero(eq(yy, addmod(xxx, B, P))) {
                revert(0, 0)
            }
            
            // 验证第二个点
            xx := mulmod(mload(R), mload(R), P)
            xxx := mulmod(xx, mload(R), P)
            yy := mulmod(mload(add(R, 32)), mload(add(R, 32)), P)
            if iszero(eq(yy, addmod(xxx, B, P))) {
                revert(0, 0)
            }
        }
        
        // 输出调试信息
        emit DebugVerifyPoint(unicode"承诺点", commPoint.x, commPoint.y);
        emit DebugVerifyPoint(unicode"R点", R.x, R.y);
        emit DebugUint(unicode"s值", s);
        emit DebugUint(unicode"s'值", sPrime);
    }
    
    // 优化的挑战值计算
    function computeChallenge(
        G1Point memory R,
        G1Point memory commPoint,
        uint256 voteId  // 改为voteId
    ) internal returns (uint256) {
        uint256 startGas = gasleft();
        
        bytes32 preHash;
        assembly {
            let ptr := mload(0x40)      // 获取空闲内存指针
            
            // 填充数据到内存
            mstore(ptr, mload(R))        // R.x
            mstore(add(ptr, 32), mload(add(R, 32)))  // R.y
            mstore(add(ptr, 64), mload(commPoint))   // commPoint.x
            mstore(add(ptr, 96), mload(add(commPoint, 32)))  // commPoint.y
            mstore(add(ptr, 128), voteId)  // 使用voteId替代optionId
            
            // 计算哈希
            preHash := keccak256(ptr, 160)  // 5 * 32 = 160 字节
        }
        
        uint256 gasUsed = startGas - gasleft();
        emit GasUsage("computeChallenge", gasUsed);
        
        return uint256(preHash) % N;
    }

    
    // 优化的曲线点验证函数 (使用bn128的曲线方程 y² = x³ + 3)
    function isOnCurve(uint256 x, uint256 y) internal pure returns (bool) {
        if (x >= P || y >= P) return false;
        
        uint256 yy = mulmod(y, y, P);
        uint256 xx = mulmod(x, x, P);
        uint256 xxx = mulmod(xx, x, P);
        
        return yy == addmod(xxx, B, P);
    }  

    // 调用椭圆曲线加法预编译合约 (bn128的add在地址0x6)
    function ecAdd(G1Point memory p1, G1Point memory p2) internal view returns (G1Point memory r) {
        if (p1.x == 0 && p1.y == 0) return p2;
        if (p2.x == 0 && p2.y == 0) return p1;
        if (p1.x == p2.x && p1.y == p2.y) return ecDouble(p1);
        if (p1.x == p2.x && p1.y != p2.y) return G1Point(0, 0);
        
        uint256[4] memory input;
        input[0] = p1.x;
        input[1] = p1.y;
        input[2] = p2.x;
        input[3] = p2.y;
        
        uint256[2] memory result;
        bool success;
        
        assembly {
            success := staticcall(
                sub(gas(), 2000),
                6,  // bn128 add is at 0x6
                input,
                128,
                result,
                64
            )
        }
        
        require(success, unicode"椭圆曲线加法运算失败");
        return G1Point(result[0], result[1]);
    }
    
    // 椭圆曲线点加倍
    function ecDouble(G1Point memory p) internal pure returns (G1Point memory r) {
        if (p.x == 0 && p.y == 0 || p.y == 0) return G1Point(0, 0);
        
        uint256 s;
        uint256 xCubed = mulmod(mulmod(p.x, p.x, P), p.x, P);
        uint256 doubleY = addmod(p.y, p.y, P);
        s = mulmod(3, xCubed, P);
        uint256 doubleYInv = modInv(doubleY, P);
        s = mulmod(s, doubleYInv, P);
        
        r.x = mulmod(s, s, P);
        uint256 doublePx = addmod(p.x, p.x, P);
        r.x = addmod(r.x, P - doublePx, P);
        
        r.y = addmod(p.x, P - r.x, P);
        r.y = mulmod(s, r.y, P);
        r.y = addmod(r.y, P - p.y, P);
        
        return r;
    }
    
    // 模逆元计算
    function modInv(uint256 a, uint256 m) private pure returns (uint256) {
        require(a != 0, unicode"无效输入：零值");
        
        a = a % m;
        require(a != 0, unicode"取模后得到无效输入：零值");
        
        uint256 power = m - 2;
        uint256 result = 1;
        uint256 base = a;
        
        while (power > 0) {
            if (power & 1 == 1) {
                result = mulmod(result, base, m);
            }
            base = mulmod(base, base, m);
            power >>= 1;
        }
        
        return result;
    }
    
    // 优化的椭圆曲线乘法 (bn128的mul在地址0x7)
    function ecMul(G1Point memory p, uint256 scalar) internal view returns (G1Point memory r) {
        if (scalar == 0 || p.x == 0 && p.y == 0) return G1Point(0, 0);
        if (scalar == 1) return p;
        
        uint256 scalarModN = scalar % N;
        if (scalarModN == 0) return G1Point(0, 0);
        if (scalarModN == 1) return p;
        
        require(isOnCurve(p.x, p.y), unicode"点不在曲线上");
        
        uint256[3] memory input;
        uint256[2] memory result;
        bool success;

        input[0] = p.x;
        input[1] = p.y;
        input[2] = scalarModN;
        
        assembly {
            success := staticcall(
                gas(),
                7,  // bn128 mul is at 0x7
                input,
                96,
                result,
                64
            )
        }
        r = G1Point(result[0], result[1]);
        
        require(isOnCurve(r.x, r.y), unicode"结果点不在曲线上");
        return r;
    }

}
