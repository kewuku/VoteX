import { bn254 } from '@noble/curves/bn254';
import { ProjPointType } from '@noble/curves/abstract/weierstrass';
import { VoteCrypto } from './VoteCrypto';
import { ECUtils } from './ECUtils';

export class VoteProof {
    private readonly G: ProjPointType<bigint>;
    private readonly SCHNORR_PROOF_LENGTH = 192; // C(64) + R(64) + s(32) + s'(32)

    // 辅助函数：将十六进制字符串转为字节数组
    public static hexToBytes(hex: string, targetLength?: number): Uint8Array {
        let cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
        
        // 确保十六进制字符串长度为偶数
        if (cleanHex.length % 2 !== 0) {
            cleanHex = '0' + cleanHex;
        }
        
        const bytes = new Uint8Array(targetLength || cleanHex.length / 2);
        const offset = targetLength ? targetLength - cleanHex.length / 2 : 0;
        
        for (let i = 0; i < cleanHex.length / 2; i++) {
            const byteValue = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
            if (isNaN(byteValue)) {
                throw new Error('无效的十六进制字符');
            }
            bytes[offset + i] = byteValue;
        }
        
        return bytes;
    }

    // 辅助函数：将字节数组转换为十六进制字符串
    public static bytesToHex(bytes: Uint8Array, includePrefix = false): string {
        const hex = Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        return includePrefix ? '0x' + hex : hex;
    }

    constructor() {
        this.G = VoteCrypto.getBasePoint();
    }

    async generateVoteProof(voteId: number, optionId: number): Promise<{
        proof: Uint8Array;
        commitment: string;
    }> {
        // 验证输入参数
        if (optionId <= 0) {
            throw new Error('选项ID必须大于0');  
        }

        try {
            // 生成混淆因子
            const blinding = VoteCrypto.generateBlinding();
            
            // 生成双基点Schnorr证明
            const proofData = this.generateSchnorrProof(blinding, optionId, voteId);
            
            // 将承诺点转换为十六进制字符串 (与合约格式一致)
            const commitment = VoteProof.bytesToHex(proofData.slice(0, 64), true);

            return { proof: proofData, commitment };
        } catch (error) {
            console.error('生成投票证明失败:', error);
            throw error;
        }
    }

    private generateSchnorrProof(blinding: Uint8Array, optionId: number, voteId: number): Uint8Array {
        try {
            const H = VoteCrypto.getAuxPoint();
            const optionBigInt = BigInt(optionId);
            const blindingBigInt = VoteCrypto.bytesToNumber(blinding);

            // 1. 范围检查
            if (optionBigInt <= 0n || optionBigInt >= ECUtils.N) {
                throw new Error('选项ID超出范围');
            }
            if (blindingBigInt <= 0n || blindingBigInt >= ECUtils.N) {
                throw new Error('混淆因子超出范围');
            }

            // 2. 计算承诺点 C = vG + rH
            const optionPoint = this.G.multiply(optionBigInt);
            const blindingPoint = H.multiply(blindingBigInt);
            const commitment = optionPoint.add(blindingPoint);
            
            // 3. 生成随机数 k 和 k'
            const k = VoteCrypto.generateBlinding();
            const kPrime = VoteCrypto.generateBlinding();
            const kBigInt = VoteCrypto.bytesToNumber(k);
            const kPrimeBigInt = VoteCrypto.bytesToNumber(kPrime);

            // 4. 计算 R = kG + k'H
            const kG = this.G.multiply(kBigInt);
            const kPrimeH = H.multiply(kPrimeBigInt);
            const R = kG.add(kPrimeH);

            // 5. 计算挑战值 e，使用voteId替代optionId
            const e = ECUtils.computeChallenge(R, commitment, voteId);
            const e_norm = e % ECUtils.N;

            // 6. 计算响应值 s 和 s'
            const ev = (e_norm * optionBigInt) % ECUtils.N;
            const er = (e_norm * blindingBigInt) % ECUtils.N;
            
            let s = (kBigInt + ev) % ECUtils.N;
            let sPrime = (kPrimeBigInt + er) % ECUtils.N;

            // 7. 组装证明数据
            const proofData = new Uint8Array(this.SCHNORR_PROOF_LENGTH);

            // 编码点坐标的辅助函数
            const encodePoint = (point: ProjPointType<bigint>, offset: number) => {
                const affine = point.toAffine();
                const xHex = affine.x.toString(16);
                const yHex = affine.y.toString(16);
                proofData.set(VoteProof.hexToBytes(xHex, 32), offset);
                proofData.set(VoteProof.hexToBytes(yHex, 32), offset + 32);
            };

            // 编码标量值的辅助函数
            const encodeScalar = (value: bigint, offset: number) => {
                const hex = value.toString(16);
                proofData.set(VoteProof.hexToBytes(hex, 32), offset);
            };

            // 写入承诺点 C (64字节)
            encodePoint(commitment, 0); 
            // 写入 R 点 (64字节)
            encodePoint(R, 64);
            // 写入 s 值 (32字节)
            encodeScalar(s, 128);
            // 写入 s' 值 (32字节)
            encodeScalar(sPrime, 160);

            return proofData;
        } catch (error) {
            console.error('生成Schnorr证明失败:', error);
            throw error;
        }
    }

    async verifyProof(proof: Uint8Array, optionId: number, voteId: number): Promise<boolean> {
        try {
            // 验证基本参数
            if (proof.length !== this.SCHNORR_PROOF_LENGTH) {
                throw new Error('证明数据长度必须为192字节');
            }
            if (optionId <= 0) {
                throw new Error('选项ID必须大于0');
            }

            // 解码证明组件
            const decodePoint = (data: Uint8Array, offset: number): ProjPointType<bigint> => {
                const xHex = VoteProof.bytesToHex(data.slice(offset, offset + 32));
                const yHex = VoteProof.bytesToHex(data.slice(offset + 32, offset + 64));
                return bn254.ProjectivePoint.fromAffine({
                    x: BigInt('0x' + xHex),
                    y: BigInt('0x' + yHex)
                });
            };

            const decodeScalar = (data: Uint8Array, offset: number): bigint => {
                const hex = VoteProof.bytesToHex(data.slice(offset, offset + 32));
                return BigInt('0x' + hex);
            };
            
            // 解码证明组件
            const commitmentPoint = decodePoint(proof, 0);
            const R = decodePoint(proof, 64);
            const s = decodeScalar(proof, 128);
            const sPrime = decodeScalar(proof, 160);

            // 格式化点的显示函数
            const formatPoint = (point: ProjPointType<bigint>) => {
                const affine = point.toAffine();
                return `(x: ${affine.x.toString()}, y: ${affine.y.toString()})`;
            };

            // 打印解码后的证明组件
            console.log('解码的证明组件:');
            console.log('承诺点 C:', formatPoint(commitmentPoint));
            console.log('R点:', formatPoint(R));
            console.log('s值:', s.toString());
            console.log('s\'值:', sPrime.toString());

            // 验证值范围
            if (!ECUtils.isOnCurve(commitmentPoint)) {
                console.error('承诺点不在曲线上');
                return false;
            }
            if (!ECUtils.isOnCurve(R)) {
                console.error('R点不在曲线上');
                return false;
            }
            if (s >= ECUtils.N || sPrime >= ECUtils.N) {
                console.error('标量值超出范围');
                return false;
            }

            // 计算挑战值 e, 使用voteId
            const e = ECUtils.computeChallenge(R, commitmentPoint, voteId);
            const e_norm = e % ECUtils.N;
            console.log('e:', e_norm.toString());

            // 验证等式 sG + s'H = R + eC
            const H = VoteCrypto.getAuxPoint();
            
            const sG = this.G.multiply(s);
            const sPrimeH = H.multiply(sPrime);
            const left = sG.add(sPrimeH);
            console.log('左边:', formatPoint(left));

            const eC = commitmentPoint.multiply(e_norm);
            const right = R.add(eC);
            console.log('右边:', formatPoint(right));
            console.log('等式成立，证明本地验证成功');
            
            return left.equals(right);

        } catch (error) {
            console.error('验证证明失败:', error);
            return false;
        }
    }
}
