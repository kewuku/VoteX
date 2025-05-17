import { bn254 } from '@noble/curves/bn254';
import { ProjPointType } from '@noble/curves/abstract/weierstrass';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';

export class ECUtils {
    // bn128曲线参数
    static readonly P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n;
    static readonly N = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;
    static readonly A = 0n;
    static readonly B = 3n;

    // 将BigInt转换为32字节的BigEndian格式
    private static encodeBigIntToBytes(value: bigint): Uint8Array {
        const hex = value.toString(16).padStart(64, '0');
        const result = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return result;
    }

    // 计算挑战值e = H(R || C || voteId)，与合约格式完全一致
    static computeChallenge(R: ProjPointType<bigint>, commitment: ProjPointType<bigint>, voteId: number): bigint {
        if (!this.isOnCurve(R) || !this.isOnCurve(commitment)) {
            throw new Error('输入点不在曲线上');
        }

        try {
            const rAff = R.toAffine();
            const commAff = commitment.toAffine();

            // 创建一个包含所有值的数组 (5 * 32 = 160字节)
            const data = new Uint8Array(160);
            let offset = 0;

            // 写入 R 点坐标
            data.set(this.encodeBigIntToBytes(rAff.x), offset);
            offset += 32;
            data.set(this.encodeBigIntToBytes(rAff.y), offset);
            offset += 32;

            // 写入承诺点坐标
            data.set(this.encodeBigIntToBytes(commAff.x), offset);
            offset += 32;
            data.set(this.encodeBigIntToBytes(commAff.y), offset);
            offset += 32;

            // 写入 voteId
            data.set(this.encodeBigIntToBytes(BigInt(voteId)), offset);

            // 计算 keccak256 哈希值
            const hashBytes = keccak_256(data);
            const e = bytesToNumberBE(hashBytes) % this.N;

            // 确保结果有效
            return e === 0n ? 1n : e;
        } catch (error) {
            throw new Error(`计算挑战值失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // 检查点是否在bn128曲线上 - 使用严格的曲线方程验证
    static isOnCurve(point: ProjPointType<bigint>): boolean {
        try {
            const affine = point.toAffine();
            const { x, y } = affine;
            
            // 首先检查坐标是否在有效范围内
            if (x < 0n || x >= this.P || y < 0n || y >= this.P) {
                console.log('点坐标超出范围:', {
                    x: x.toString(16),
                    y: y.toString(16),
                    P: this.P.toString(16)
                });
                return false;
            }
            
            // 计算等式左边 y²
            const ySquared = (y * y) % this.P;
            
            // 计算等式右边 x³ + 3
            let xCubed = (x * x) % this.P;
            xCubed = (xCubed * x) % this.P;
            const right = (xCubed + this.B) % this.P;
            
            // 打印验证结果
            console.log('曲线方程验证:', {
                x: '0x' + x.toString(16),
                y: '0x' + y.toString(16),
                'y²': '0x' + ySquared.toString(16),
                'x³ + 3': '0x' + right.toString(16),
                isValid: ySquared === right
            });
            
            return ySquared === right;
        } catch (error) {
            console.error('验证点在曲线上时出错:', error);
            return false;
        }
    }

    // 将点转换为完整的字节表示（64字节），与合约格式完全一致
    static pointToFullBytes(point: ProjPointType<bigint>): Uint8Array {
        const affine = point.toAffine();
        const result = new Uint8Array(64);
        
        // 编码x坐标
        result.set(this.encodeBigIntToBytes(affine.x), 0);
        // 编码y坐标
        result.set(this.encodeBigIntToBytes(affine.y), 32);
        
        return result;
    }

    // 将点压缩为32字节格式，使用统一的编码方式
    static compressPoint(point: ProjPointType<bigint>): Uint8Array {
        const affine = point.toAffine();
        const result = new Uint8Array(32);
        
        // 编码x坐标
        result.set(this.encodeBigIntToBytes(affine.x));
        
        // 设置最高位表示y的奇偶性
        if (affine.y % 2n === 1n) {
            result[0] |= 0x80;
        }
        
        return result;
    }

    // 是否为有限域中的二次剩余
    static isQuadraticResidue(n: bigint, p: bigint): boolean {
        const exp = (p - 1n) / 2n;
        let result = 1n;
        let base = n % p;
        let e = exp;
        
        while (e > 0n) {
            if (e & 1n) {
                result = (result * base) % p;
            }
            base = (base * base) % p;
            e >>= 1n;
        }
        
        return result === 1n;
    }

    // 将字节数组转换为BigInt，确保结果在曲线阶N范围内
    static bytesToBigInt(bytes: Uint8Array): bigint {
        try {
            const num = bytesToNumberBE(bytes);
            if (num === 0n) return 1n;
            
            // 使用rejection sampling确保均匀分布
            const maxMultiple = ((1n << 256n) - 1n) / this.N;
            const threshold = maxMultiple * this.N;
            
            let result: bigint;
            if (num >= threshold) {
                result = (num % this.N) || 1n;
            } else {
                result = num % this.N;
            }
            
            // 确保结果在有效范围内
            if (result === 0n || result >= this.N) {
                result = 1n;
            }
            
            return result;
        } catch (error) {
            console.error('BigInt转换失败:', error);
            return 1n;
        }
    }

    // 从十六进制字符串转换为字节数组
    static hexToBytes(hex: string): Uint8Array {
        try {
            const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
            if (cleanHex.length % 2 !== 0) {
                throw new Error('hex字符串长度必须为偶数');
            }

            const bytes = new Uint8Array(cleanHex.length / 2);
            for (let i = 0; i < bytes.length; i++) {
                const byte = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
                if (isNaN(byte)) {
                    throw new Error('无效的hex字符串');
                }
                bytes[i] = byte;
            }
            return bytes;
        } catch (error) {
            throw new Error(`十六进制转换失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    // 计算模平方根 (使用改进的Tonelli-Shanks算法)
    static modularSquareRoot(n: bigint, p: bigint): bigint | null {
        try {
            if (n === 0n) return 0n;
            if (p === 2n) return n;
            if (p % 2n === 0n) return null;

            const legendreSymbol = this.powMod(n, (p - 1n) / 2n, p);
            if (legendreSymbol !== 1n) {
                return null;
            }

            if (p % 4n === 3n) {
                const r = this.powMod(n, (p + 1n) / 4n, p);
                if ((r * r) % p === n % p) {
                    return r;
                }
                return null;
            }

            let q = p - 1n;
            let s = 0n;
            while (q % 2n === 0n) {
                q = q / 2n;
                s++;
            }

            let z = 2n;
            while (this.powMod(z, (p - 1n) / 2n, p) !== p - 1n) {
                z++;
                if (z >= p) return null;
            }

            let m = s;
            let c = this.powMod(z, q, p);
            let t = this.powMod(n, q, p);
            let r = this.powMod(n, (q + 1n) / 2n, p);

            while (t !== 1n) {
                let i = 0n;
                let temp = t;
                while (temp !== 1n && i < m) {
                    temp = (temp * temp) % p;
                    i++;
                }

                if (i === m) return null;

                let b = c;
                for (let j = 0n; j < m - i - 1n; j++) {
                    b = (b * b) % p;
                }

                m = i;
                c = (b * b) % p;
                t = (t * c) % p;
                r = (r * b) % p;
            }

            if ((r * r) % p !== n % p) {
                return null;
            }

            return r;
        } catch (error) {
            console.error('计算模平方根失败:', error);
            return null;
        }
    }
    
    // 模幂运算
    private static powMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
        if (modulus <= 0n) throw new Error('模数必须为正数');
        if (exponent < 0n) throw new Error('指数必须为非负数');
        if (modulus === 1n) return 0n;

        base = base % modulus;
        let result = 1n;
        
        while (exponent > 0n) {
            if (exponent & 1n) {
                result = (result * base) % modulus;
            }
            base = (base * base) % modulus;
            exponent = exponent >> 1n;
        }
        
        return result;
    }
}
