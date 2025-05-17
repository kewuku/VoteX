import { bn254 } from '@noble/curves/bn254';
import { ProjPointType } from '@noble/curves/abstract/weierstrass';
import { keccak_256 } from '@noble/hashes/sha3';
import { ECUtils } from './ECUtils';

// 提供投票系统所需的密码学基础功能,实现Pedersen承诺功能
export class VoteCrypto {
    // 系统参数
    private static readonly G = bn254.ProjectivePoint.BASE;
    private static _H: ProjPointType<bigint> | null = null;
    private static readonly ENTROPY_BYTES = 32;
    private static readonly GENERATION_ATTEMPTS = 50;
    
    // 缓存计算结果
    private static readonly pointCache = new Map<string, ProjPointType<bigint>>();
    private static readonly blindingCache = new WeakMap<Uint8Array, bigint>();

    // 预定义的辅助点H坐标 (与合约中完全相同)
    private static readonly H_X = 0x26d54f2fc05f6c2317596cefcb2ab3d23119b28b91cfb8e29cf991ed30dedc91n;
    private static readonly H_Y = 0x20fb6823bbd8388fec2202f1062cac2f39849868bc381634587e4d5e1c80cb85n;

    // 通过确定性过程生成辅助点H（返回单例实例）
    private static generateAuxiliaryPoint(): ProjPointType<bigint> {
        if (this._H !== null) {
            return this._H;
        }

        try {
            // 直接使用预定义的坐标创建点
            const H = bn254.ProjectivePoint.fromAffine({
                x: this.H_X,
                y: this.H_Y
            });
            
            // 验证生成点的有效性
            if (!ECUtils.isOnCurve(H)) {
                throw new Error('辅助点不在曲线上');
            }

            // 缓存点
            this._H = H;
            return H;
        } catch (error) {
            console.error('生成辅助点失败:', error);
            throw error;
        }
    }

    // 获取基点G
    static getBasePoint(): ProjPointType<bigint> {
        return this.G;
    }

    // 获取辅助点H（懒加载）
    static getAuxPoint(): ProjPointType<bigint> {
        if (!this._H) {
            this._H = this.generateAuxiliaryPoint();
        }
        return this._H;
    }

    // 生成随机混淆因子，重试直到得到合法值
    static generateBlinding(): Uint8Array {
        for (let i = 0; i < this.GENERATION_ATTEMPTS; i++) {
            try {
                // 使用更大的缓冲区来减少重试次数
                const array = new Uint8Array(this.ENTROPY_BYTES + 8);
                crypto.getRandomValues(array);
                
                // 使用ECUtils.bytesToBigInt确保生成的值在正确范围内
                const value = ECUtils.bytesToBigInt(array);
                // console.log('生成的随机值:', value.toString());
                
                // 验证生成的值是否在合法范围内
                if (value <= 0n || value >= ECUtils.N) {
                    console.warn('生成的随机值超出范围，重试中...');
                    continue;
                }
                
                // 将值规范化为32字节的BigEndian表示
                const result = new Uint8Array(this.ENTROPY_BYTES);
                const buffer = new ArrayBuffer(32);
                const view = new DataView(buffer);
                for (let i = 0; i < 4; i++) {
                    view.setBigUint64(24 - i * 8, (value >> BigInt(i * 64)) & ((1n << 64n) - 1n), false);
                }
                result.set(new Uint8Array(buffer));
                
                // 缓存转换结果
                this.blindingCache.set(result, value);
                return result;
            } catch (error) {
                console.error(`第${i + 1}次尝试生成混淆因子失败:`, error);
                if (i === this.GENERATION_ATTEMPTS - 1) {
                    throw new Error('无法生成有效的混淆因子');
                }
            }
        }
        throw new Error('无法生成有效的混淆因子');
    }

    // 将字节数组转换为大整数（使用缓存）
    static bytesToNumber(bytes: Uint8Array): bigint {
        const cached = this.blindingCache.get(bytes);
        if (cached !== undefined) {
            return cached;
        }
        
        const value = ECUtils.bytesToBigInt(bytes);
        
        // 存入缓存
        this.blindingCache.set(bytes, value);
        return value;
    }
    
    // 生成Pedersen承诺: C = vG + rH
    static async generatePedersenCommitment(value: number, blinding: Uint8Array): Promise<Uint8Array> {
        if (value <= 0) {
            console.error('generatePedersenCommitment失败: 承诺值必须大于0，当前值:', value);
            throw new Error('承诺值必须大于0');
        }
        
        try {
            const cacheKey = `${value}-${Array.from(blinding).join(',')}`;
            console.log('生成Pedersen承诺，输入参数:', {
                value,
                blindingLength: blinding.length,
                blindingPreview: Array.from(blinding.slice(0, 4))
            });

            const cached = this.pointCache.get(cacheKey);
            if (cached) {
                console.log('使用缓存的承诺点');
                return ECUtils.pointToFullBytes(cached);
            }
            
            // 确保v在有效范围内(1到N-1)
            const v = BigInt(value);
            console.log('转换value为BigInt:', v.toString());
            
            // 如果v大于N-1，我们需要重新映射到合法范围
            const adjustedV = v >= ECUtils.N ? (v % (ECUtils.N - 1n)) + 1n : v;
            console.log('调整后的v值:', adjustedV.toString());
            
            if (adjustedV <= 0n || adjustedV >= ECUtils.N) {
                console.error('generatePedersenCommitment失败: 调整后的承诺值超出范围:', {
                    adjustedV: adjustedV.toString(),
                    N: ECUtils.N.toString()
                });
                throw new Error('承诺值必须在1到N-1之间');
            }
            
            // 验证并转换混淆因子
            const r = this.bytesToNumber(blinding);
            console.log('混淆因子r:', r.toString());
            
            if (r <= 0n || r >= ECUtils.N) {
                console.error('generatePedersenCommitment失败: 混淆因子超出范围:', {
                    r: r.toString(),
                    N: ECUtils.N.toString()
                });
                throw new Error('混淆因子必须在1到N-1之间');
            }
            
            // 计算承诺点 C = vG + rH
            console.log('开始计算承诺点...', {
                adjustedV: adjustedV.toString(),
                r: r.toString()
            });

            const vG = this.G.multiply(adjustedV);
            const vGAff = vG.toAffine();
            console.log('vG点:', {
                x: vGAff.x.toString(16),
                y: vGAff.y.toString(16)
            });
            if (!ECUtils.isOnCurve(vG)) {
                console.error('generatePedersenCommitment失败: vG点不在曲线上');
                throw new Error('生成的vG点不在曲线上');
            }
            
            const rH = this.getAuxPoint().multiply(r);
            const rHAff = rH.toAffine();
            console.log('rH点:', {
                x: rHAff.x.toString(16),
                y: rHAff.y.toString(16)
            });
            if (!ECUtils.isOnCurve(rH)) {
                console.error('generatePedersenCommitment失败: rH点不在曲线上');
                throw new Error('生成的rH点不在曲线上');
            }
            
            const commitment = vG.add(rH);
            const commitmentAff = commitment.toAffine();
            console.log('最终承诺点:', {
                x: commitmentAff.x.toString(16),
                y: commitmentAff.y.toString(16)
            });
            if (!ECUtils.isOnCurve(commitment)) {
                console.error('generatePedersenCommitment失败: 最终承诺点不在曲线上');
                throw new Error('生成的承诺点不在曲线上');
            }
            
            // 缓存计算结果
            this.pointCache.set(cacheKey, commitment);
            
            // 返回完整的64字节表示
            const result = ECUtils.pointToFullBytes(commitment);
            console.log('承诺点转换为字节完成, 长度:', result.length);
            return result;
        } catch (error) {
            console.error('generatePedersenCommitment发生异常:', error);
            if (error instanceof Error) {
                throw new Error(`生成Pedersen承诺失败: ${error.message}`);
            }
            throw new Error('生成Pedersen承诺失败');
        }
    }
    
    // 验证Pedersen承诺，使用恒定时间比较
    static async verifyPedersenCommitment(
        commitment: Uint8Array, 
        value: number, 
        blinding: Uint8Array
    ): Promise<boolean> {
        try {
            const expectedCommitment = await this.generatePedersenCommitment(value, blinding);
            
            // 使用恒定时间比较以防止时序攻击
            if (commitment.length !== expectedCommitment.length) {
                return false;
            }
            
            let result = 0;
            for (let i = 0; i < commitment.length; i++) {
                result |= commitment[i] ^ expectedCommitment[i];
            }
            return result === 0;
        } catch (error) {
            return false;
        }
    }
    
    // 将点压缩为32字节
    static compressPointToBytes32(point: ProjPointType<bigint> | Uint8Array): Uint8Array {
        try {
            const projPoint = point instanceof Uint8Array ? 
                bn254.ProjectivePoint.fromHex(new Uint8Array([0x04, ...point])) : 
                point;
            return ECUtils.compressPoint(projPoint);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`压缩点失败: ${error.message}`);
            }
            throw new Error('压缩点失败');
        }
    }

    // 生成一个在bn128曲线上的有效点并进行验证 (测试函数)
    static testGenerateValidCurvePoint(): void {
        try {
            // 使用基点G作为起点
            const G = bn254.ProjectivePoint.BASE;
            console.log('基点G:', {
                x: '0x' + G.toAffine().x.toString(16),
                y: '0x' + G.toAffine().y.toString(16)
            });
            
            let attempts = 0;
            const maxAttempts = 100;
            let H: ProjPointType<bigint>;
            let affine;
            
            while (attempts < maxAttempts) {
                // 生成一个新的种子值
                const hashBytes = keccak_256(new TextEncoder().encode(`VoteX-H-Point-v1-${attempts}`));
                const seed = (BigInt('0x' + Array.from(hashBytes)
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('')) % (ECUtils.N - 1n)) + 1n;
                
                // 使用标量乘法生成新点
                H = G.multiply(seed);
                affine = H.toAffine();
                
                // 检查x和y的十六进制表示是否具有相同的位数
                const xHex = affine.x.toString(16);
                const yHex = affine.y.toString(16);
                
                console.log(`尝试 #${attempts + 1}:`, {
                    xLength: xHex.length,
                    yLength: yHex.length,
                    x: '0x' + xHex,
                    y: '0x' + yHex
                });
                
                if (xHex.length === yHex.length) {
                    // 验证点是否在曲线上
                    if (ECUtils.isOnCurve(H)) {
                        console.log('找到合适的点H！');
                        console.log('点H的坐标:', {
                            x: '0x' + xHex,
                            y: '0x' + yHex,
                            hexLength: xHex.length
                        });
                        return;
                    }
                }
                
                attempts++;
            }
            
            console.log(`在${maxAttempts}次尝试后未找到合适的点`);
            
        } catch (error) {
            console.error('生成测试点失败:', error);
        }
    }
}
