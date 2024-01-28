import { TWO_TO_32, TWO_TO_52 } from "./constants";

// The purpose of this module is to provide some functions that can assemble 64 bit integers from 32 bit components
// This allows various algorithms to be implemented only once but have different 64 bit representations with no loss of precision

export type Join64<T> = (low: number, high: number) => T

export const hex: Join64<string> = (bitsLow, bitsHigh) => {
    const low = bitsLow.toString(16);
    return `${bitsHigh.toString(16)}${'00000000'.slice(low.length)}${low}`;
};

export const padHex: Join64<string> = (bitsLow, bitsHigh) => {
    const low = bitsLow.toString(16);
    const high = bitsHigh.toString(16);
    return `${'00000000'.slice(high.length)}${bitsHigh.toString(16)}${'00000000'.slice(low.length)}${low}`;
};

export const float64: Join64<number> = (low, high) => {
    const sign = ((high >> 31) * 2 + 1);
    const exp = (high >>> 20) & 0x7FF;
    const mant = TWO_TO_32 * (high & 0xFFFFF) + low;

    return (
        // special
        (exp == 0x7FF) ?
            (mant) ? NaN :
            sign * Infinity :
        // denormal
        (exp == 0) ? sign * Math.pow(2, -1074) * mant :
        // normal
        sign * Math.pow(2, exp - 1075) * (mant + TWO_TO_52)
    );
}

/**
 * losslessly convert unsigned 32+32 integer into 64 bit decimal string
 */ 
export const unsignedDecimal: Join64<string> = (bitsLow, bitsHigh) => {
    // Skip the expensive conversion if the number is small enough to use the
    // built-in conversions.
    if (bitsHigh <= 0x1FFFFF) {
        return '' + (TWO_TO_32 * bitsHigh + bitsLow);
    }
    
    // What this code is doing is essentially converting the input number from
    // base-2 to base-1e7, which allows us to represent the 64-bit range with
    // only 3 (very large) digits. Those digits are then trivial to convert to
    // a base-10 string.
    
    // The magic numbers used here are -
    // 2^24 = 16777216 = (1,6777216) in base-1e7.
    // 2^48 = 281474976710656 = (2,8147497,6710656) in base-1e7.
    
    // Split 32:32 representation into 16:24:24 representation so our
    // intermediate digits don't overflow.
    const low = bitsLow & 0xFFFFFF;
    const mid = (((bitsLow >>> 24) | (bitsHigh << 8)) >>> 0) & 0xFFFFFF;
    const high = (bitsHigh >> 16) & 0xFFFF;
    
    // Assemble our three base-1e7 digits, ignoring carries. The maximum
    // value in a digit at this step is representable as a 48-bit integer, which
    // can be stored in a 64-bit floating point number.
    let digitA = low + (mid * 6777216) + (high * 6710656);
    let digitB = mid + (high * 8147497);
    let digitC = (high * 2);
    
    // Apply carries from A to B and from B to C.
    const base = 10000000;
    /* istanbul ignore else */
    if (digitA >= base) {
        // ALWAYS (I don't see a way to not get here because built in conversion will have handled all cases where the condition is false)
        digitB += Math.floor(digitA / base);
        digitA %= base;
    }
    
    /* istanbul ignore else */
    if (digitB >= base) {
        // ALWAYS (I don't see a way to not get here because built in conversion will have handled all cases where the condition is false)
        digitC += Math.floor(digitB / base);
        digitB %= base;
    }
    
    // Convert base-1e7 digits to base-10, with optional leading zeroes.
    function decimalFrom1e7(digit1e7: number, needLeadingZeros: boolean) {
        const partial = digit1e7 ? String(digit1e7) : '';
        if (needLeadingZeros) {
            return '0000000'.slice(partial.length) + partial;
        }
        return partial;
    }
    
    return (
        decimalFrom1e7(digitC, /*needLeadingZeros=*/ false) +
        decimalFrom1e7(digitB, /*needLeadingZeros=*/ !!digitC) +
        // If the final 1e7 digit didn't need leading zeros, we would have
        // returned via the trivial code path at the top.
        decimalFrom1e7(digitA, /*needLeadingZeros=*/ true)
    );
}

/**
 * losslessly convert signed 32+32 integer into 64 bit decimal string
 */ 
export const signedDecimal: Join64<string> = (low, high) => {
    // If we're treating the input as a signed value and the high bit is set, do
    // a manual two's complement conversion before the decimal conversion.
    const negative = (high & 0x80000000);
    if (negative) {
        low = (~low + 1) >>> 0;
        const carry = (low == 0) ? 1 : 0;
        high = (~high + carry) >>> 0;
    }

    const result = unsignedDecimal(low >>> 0, high);
    return negative ? '-' + result : result;
}