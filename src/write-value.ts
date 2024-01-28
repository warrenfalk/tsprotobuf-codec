import { Writable } from "./types";
import { TWO_TO_32, TWO_TO_20, TWO_TO_52, FLOAT64_MAX, FLOAT64_MIN, FLOAT32_MAX, FLOAT32_MIN, TWO_TO_23 } from "./constants";
import Long from "long";

const utf8encode: (input: string) => Uint8Array = (() => { const encoder = new TextEncoder(); return encoder.encode.bind(encoder); })();

function length(writable: Writable, value: number): void {
    return int32(writable, value);
}

const varint32: (writable: Writable, value: number) => void
= (w, value) => {
    if (value >= 0) {
        let remain = value;
        while (remain >= 128) {
            const byte = 0x80 | (remain & 0x7F);
            w.writeByte(byte);
            remain = remain / 128;
        }
        w.writeByte(remain & 0x7F);
    }
    else {
        let remain = value;
        for (let i = 0; i < 9; i++) {
            const byte = 0x80 | (remain & 0x7f);
            w.writeByte(byte);
            remain = remain >> 7;
        }
        w.writeByte(1);
    }
}

const varint64: (writable: Writable, value: number) => void
= (w, v) => {
    // Convert to sign-magnitude representation.
    const sign = (v < 0);
    const value = Math.abs(v);
    // Extract low 32 bits and high 32 bits as unsigned integers.
    var lowBits = value >>> 0;
    var highBits = Math.floor((value - lowBits) / TWO_TO_32);
    highBits = highBits >>> 0;

    // Perform two's complement conversion if the sign bit was set.
    if (sign) {
        highBits = ~highBits >>> 0;
        lowBits = ~lowBits >>> 0;
        lowBits += 1;
        if (lowBits > 0xFFFFFFFF) {
            lowBits = 0;
            highBits++;
            /* istanbul ignore if */
            if (highBits > 0xFFFFFFFF) {
                // IMPOSSIBLE
                highBits = 0;
            }
        }
    }

    splitVarint64(w, lowBits, highBits);
}

const zigzagVarint32: (writable: Writable, value: number) => void
= (w, value) => varint32(w, ((value << 1) ^ (value >> 31)) >>> 0);

const zigzagVarint64: (writable: Writable, value: number) => void
= (w, v) => {
    // Convert to sign-magnitude and scale by 2 before we split the value.
    const sign = (v < 0);
    const value = Math.abs(v) * 2;

    // Extract low 32 bits and high 32 bits as unsigned integers.
    let lowBits = value >>> 0;
    let highBits = Math.floor((value - lowBits) / TWO_TO_32) >>> 0;

    // If the value is negative, subtract 1 from the split representation so we
    // don't lose the sign bit due to precision issues.
    if (sign) {
        if (lowBits == 0) {
            /* istanbul ignore if */
            if (highBits == 0) {
                // IMPOSSIBLE
                lowBits = 0xFFFFFFFF;
                highBits = 0xFFFFFFFF;
            }
            else {
                highBits--;
                lowBits = 0xFFFFFFFF;
            }
        }
        else {
            lowBits--;
        }
    }

    splitVarint64(w, lowBits, highBits);
}

const splitVarint64: (writable: Writable, low32: number, high32: number) => void
= (w, low, high) => {
    while (high > 0 || low > 127) {
        w.writeByte((low & 0x7f) | 0x80);
        low = ((low >>> 7) | (high << 25)) >>> 0;
        high = high >>> 7;
    }
    w.writeByte(low);
}

const rawLittleEndian32: (writable: Writable, value: number) => void
= (w, v) => {
    w.writeByte((v >>> 0) & 0xFF);
    w.writeByte((v >>> 8) & 0xFF);
    w.writeByte((v >>> 16) & 0xFF);
    w.writeByte((v >>> 24) & 0xFF);
}

const rawLittleEndian64: (writable: Writable, low32: number, high32: number) => void
= (w, low, high) => {
    rawLittleEndian32(w, low);
    rawLittleEndian32(w, high);
}

const denormalFloat64: (writable: Writable, sign: 0|1, value: number) => void
= (w, sign, value) => {
    // https://en.wikipedia.org/wiki/Denormal_number
    const mant = value / Math.pow(2, -1074);
    const mantHigh = (mant / TWO_TO_32);
    return rawLittleEndian64(w, mant >>> 0, ((sign << 31) | mantHigh) >>> 0);
}

const denormalFloat32: (writable: Writable, sign: 0|1, value: number) => void
= (w, sign, value) => {
    // https://en.wikipedia.org/wiki/Denormal_number
    const mant = Math.round(value / Math.pow(2, -149));
    return rawLittleEndian32(w, ((sign << 31) | mant) >>> 0);
}

const normalFloat64: (writable: Writable, sign: 0|1, value: number) => void
= (w, sign, value) => {
    // Compute the least significant exponent needed to represent the magnitude of
    // the value by repeadly dividing/multiplying by 2 until the magnitude
    // crosses 2. While tempting to use log math to find the exponent, at the
    // bounadaries of precision, the result can be off by one.
    const maxDoubleExponent = 1023;
    const minDoubleExponent = -1022;
    let x = value;
    let exp = 0;
    if (x >= 2) {
        while (x >= 2 && exp < maxDoubleExponent) {
        exp++;
        x = x / 2;
        }
    } else {
        while (x < 1 && exp > minDoubleExponent) {
            x = x * 2;
            exp--;
        }
    }
    const mant = value * Math.pow(2, -exp);
    
    const mantHigh = (mant * TWO_TO_20) & 0xFFFFF;
    const mantLow = (mant * TWO_TO_52) >>> 0;
    
    return rawLittleEndian64(w, mantLow, ((sign << 31) | ((exp + 1023) << 20) | mantHigh) >>> 0);
}

const normalFloat32: (writable: Writable, sign: 0|1, value: number) => void
= (w, sign, value) => {
    const exp = Math.floor(Math.log(value) / Math.LN2);
    const mant = Math.round((value * Math.pow(2, -exp)) * TWO_TO_23) & 0x7FFFFF;
    return rawLittleEndian32(w, ((sign << 31) | ((exp + 127) << 23) | mant) >>> 0);
}

// ---------------------------------------

export function int32(writable: Writable, value: number): void {
    return varint32(writable, value);
}

export function int64(writable: Writable, value: number): void {
    return varint64(writable, value);
}

export function int64long(writable: Writable, value: Long): void {
    return splitVarint64(writable, value.getLowBitsUnsigned(), value.getHighBitsUnsigned());
}

export function bool(writable: Writable, value: boolean): void {
    return writable.writeByte(value ? 1 : 0);
}

export function double(writable: Writable, value: number): void {
    const sign = (value < 0) ? 1 : 0;
    const absvalue = sign ? -value : value;

    return (
        // positive 0 or negative 0
        absvalue === 0 ? (1 / absvalue) > 0 ? rawLittleEndian64(writable, 0x00000000, 0x00000000) : rawLittleEndian64(writable, 0x00000000, 0x80000000) :
        // NaN
        isNaN(absvalue) ? rawLittleEndian64(writable, 0xFFFFFFFF, 0x7FFFFFFF) :
        // positive or negative infinities
        absvalue > FLOAT64_MAX ? rawLittleEndian64(writable, 0, ((sign << 31) | (0x7FF00000)) >>> 0) :
        // denormals
        absvalue < FLOAT64_MIN ? denormalFloat64(writable, sign, absvalue) :
        // normal
        normalFloat64(writable, sign, absvalue)
    );
}

export function fixed32(writable: Writable, value: number): void {
    return rawLittleEndian32(writable, value);
}

export function fixed64(writable: Writable, value: number): void {
    const low = value >>> 0;
    return rawLittleEndian64(writable, low, Math.floor((value - low) / TWO_TO_32) >>> 0);
}

export function fixed64long(writable: Writable, value: Long): void {
    return rawLittleEndian64(writable, value.getLowBitsUnsigned(), value.getHighBitsUnsigned());
}

export function float(writable: Writable, value: number): void {
    const sign = (value < 0) ? 1 : 0;
    const absvalue = sign ? -value : value;

    return (
        // positive 0 or negative 0
        absvalue === 0 ? (1 / absvalue) > 0 ? rawLittleEndian32(writable, 0x00000000) : rawLittleEndian32(writable, 0x80000000) :
        // NaN
        isNaN(absvalue) ? rawLittleEndian32(writable, 0x7FFFFFFF) :
        // positive or negative infinities
        absvalue > FLOAT32_MAX ? rawLittleEndian32(writable, ((sign << 31) | (0x7F800000)) >>> 0) :
        // denormals
        absvalue < FLOAT32_MIN ? denormalFloat32(writable, sign, absvalue) :
        // normal
        normalFloat32(writable, sign, absvalue)
    );
}

export function sfixed32(writable: Writable, value: number): void {
    return rawLittleEndian32(writable, value);
}

export function sfixed64(writable: Writable, value: number): void {
    // Convert to sign-magnitude representation.
    const sign = (value < 0);
    const absvalue = Math.abs(value);

    // Extract low 32 bits and high 32 bits as unsigned integers.
    let lowBits = absvalue >>> 0;
    let highBits = Math.floor((absvalue - lowBits) / TWO_TO_32);
    highBits = highBits >>> 0;

    // Perform two's complement conversion if the sign bit was set.
    if (sign) {
        highBits = ~highBits >>> 0;
        lowBits = ~lowBits >>> 0;
        lowBits += 1;
        if (lowBits > 0xFFFFFFFF) {
            lowBits = 0;
            highBits++;
            /* istanbul ignore if */
            if (highBits > 0xFFFFFFFF) {
                // IMPOSSIBLE
                highBits = 0;
            }
        }
    }

    return rawLittleEndian64(writable, lowBits, highBits);
}

export function sfixed64long(writable: Writable, value: Long): void {
    const low = value.getLowBitsUnsigned();
    const high = value.getHighBitsUnsigned();
    return rawLittleEndian64(writable, low, high);
}

export function sint32(writable: Writable, value: number): void {
    return zigzagVarint32(writable, value);
}

export function sint64(writable: Writable, value: number): void {
    return zigzagVarint64(writable, value);
}

export function sint64long(writable: Writable, value: Long): void {
    const zigzag = value.shiftLeft(1).xor(value.shiftRight(63));
    const low = zigzag.getLowBitsUnsigned();
    const high = zigzag.getHighBitsUnsigned();
    return splitVarint64(writable, low, high);
}

export function string(writable: Writable, value: string): void {
    const block = utf8encode(value);
    const size = block.length;
    length(writable, size);
    writable.writeBlock(block);
}

export function bytes(writable: Writable, value: ArrayBuffer | number[]): void {
    const b = new Uint8Array(value);
    length(writable, b.length);
    writable.writeBlock(b);
}

export function uint32(writable: Writable, value: number): void {
    return varint32(writable, value);
}

export function uint64(writable: Writable, value: number): void {
    return varint64(writable, value);
}

export function uint64long(writable: Writable, value: Long): void {
    const low = value.getLowBitsUnsigned();
    const high = value.getHighBitsUnsigned();
    return splitVarint64(writable, low, high);
}
