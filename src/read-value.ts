import {Readable, Tag, WireType, block, FieldValueReader} from "./types"
import * as join from "./join64";
import { Join64 } from "./join64";
import assertNever from "assert-never";

export const fieldFromTag: (tag: Tag) => number = (tag) => tag >>> 3;
export const wireTypeFromTag: (tag: Tag) => WireType = (tag) => (tag & 0x7) as WireType;

export const tag: (reader: Readable) => Tag | undefined
= (r) => r.isDone() ? undefined : varint32(r) as Tag;

export const varint32: FieldValueReader<number>
= (r) => {
    // This function is unrolled for performance reasons because it is called many many times

    let byte = r.readByte();
    let value = (byte & 0x7F);
    if (byte < 128) {
        return value;
    }

    byte = r.readByte();
    value |= (byte & 0x7F) << 7;
    if (byte < 128) {
      return value;
    }
  
    byte = r.readByte();
    value |= (byte & 0x7F) << 14;
    if (byte < 128) {
      return value;
    }
  
    byte = r.readByte();
    value |= (byte & 0x7F) << 21;
    if (byte < 128) {
      return value;
    }
  
    byte = r.readByte();
    value |= (byte & 0x0F) << 28;
    if (byte < 128) {
      // We're reading the high bits of an unsigned varint. The byte we just read
      // also contains bits 33 through 35, which we're going to discard.
      return value >>> 0;
    }
  
    // If we get here, we need to truncate coming bytes.
    if (r.readByte() < 128) return value;
    if (r.readByte() < 128) return value;
    if (r.readByte() < 128) return value;
    if (r.readByte() < 128) return value;
    if (r.readByte() < 128) return value;

    throw new Error("maximum size of varint exceeded with no terminator found");
}

export const signedVarint64: <T>(reader: Readable, join: Join64<T>) => T
= (r, join) => splitVarint64(r, join);

const splitVarint64: <T>(reader: Readable, join: Join64<T>) => T
= (r, join) => {
    let byte = 128;
    let low = 0;
    let high = 0;

    // Read the first four bytes of the varint, stopping at the terminator if we
    // see it.
    for (let i = 0; i < 4 && byte >= 128; i++) {
        byte = r.readByte();
        low |= (byte & 0x7F) << (i * 7);
    }

    if (byte >= 128) {
        // Read the fifth byte, which straddles the low and high dwords.
        byte = r.readByte();
        low |= (byte & 0x7F) << 28;
        high |= (byte & 0x7F) >> 4;
    }

    if (byte >= 128) {
        // Read the sixth through tenth byte.
        for (let i = 0; i < 5 && byte >= 128; i++) {
            byte = r.readByte();
            high |= (byte & 0x7F) << (i * 7 + 3);
        }
    }

    // If we did not see the terminator, the encoding was invalid.
    if (byte >= 128)
        throw new Error("maximum size of 64 bit varint exceeded without terminator");

    return join(low >>> 0, high >>> 0);
}

const splitZigzagVarint64: <T>(reader: Readable, join: Join64<T>) => T
= (r, join) => {
    return splitVarint64(r, (low, high) => fromZigzag64(low, high, join));    
}

const fromZigzag64: <T>(low: number, high: number, join: Join64<T>) => T
= (bitsLow, bitsHigh, join) => {
  // 64 bit math is:
  //   signmask = (zigzag & 1) ? -1 : 0;
  //   twosComplement = (zigzag >> 1) ^ signmask;
  //
  // To work with 32 bit, we can operate on both but "carry" the lowest bit
  // from the high word by shifting it up 31 bits to be the most significant bit
  // of the low word.
  var signFlipMask = -(bitsLow & 1);
  bitsLow = ((bitsLow >>> 1) | (bitsHigh << 31)) ^ signFlipMask;
  bitsHigh = (bitsHigh >>> 1) ^ signFlipMask;
  return join(bitsLow, bitsHigh);    
}

export const int32: FieldValueReader<number>
= (r) => varint32(r);

export const sint32: FieldValueReader<number>
= (r) => {
    const zigzag = varint32(r);
    return (zigzag >>> 1) ^ - (zigzag & 1);
}

export const int64decimal: FieldValueReader<string>
= (r) => signedVarint64(r, join.signedDecimal);

export const sint64decimal: FieldValueReader<string>
= (r) => splitZigzagVarint64(r, join.signedDecimal)

export const bool: (reader: Readable) => boolean
= (r) => !!varint32(r);

export const fixed32: FieldValueReader<number>
= (r) => sfixed32(r) >>> 0

export const sfixed32: FieldValueReader<number>
= (r) => {
    const a = r.readByte();
    const b = r.readByte();
    const c = r.readByte();
    const d = r.readByte();
    return (a << 0) | (b << 8) | (c << 16) | (d << 24);
}

export const fixed64hexpad: FieldValueReader<string>
= (r) => {
    const low = fixed32(r);
    const high = fixed32(r);
    return join.padHex(low, high);
}

export const fixed64decimal: FieldValueReader<string>
= (r) => {
    const low = fixed32(r);
    const high = fixed32(r);
    return join.unsignedDecimal(low, high);
}

export const fixed64decimalpad: FieldValueReader<string>
= (r) => {
    const unpadded = fixed64decimal(r);
    return `${"00000000000000000000".slice(unpadded.length)}${unpadded}`;
}

export const sfixed64decimal: FieldValueReader<string>
= (r) => {
    const low = fixed32(r);
    const high = fixed32(r);
    return join.signedDecimal(low, high);
}

export const double: FieldValueReader<number>
= (r) => {
    const low = fixed32(r);
    const high = fixed32(r);
    return join.float64(low, high);
}

export const float: FieldValueReader<number>
= (r) => {
    const bitsLow = fixed32(r);

    const sign = ((bitsLow >> 31) * 2 + 1);
    const exp = (bitsLow >>> 23) & 0xFF;
    const mant = bitsLow & 0x7FFFFF;

    return (
        // special
        (exp == 0xFF) ?
            (mant) ? NaN :
            sign * Infinity :
        // denormal
        (exp == 0) ? sign * Math.pow(2, -149) * mant :
        // normal
        sign * Math.pow(2, exp - 150) * (mant + Math.pow(2, 23))
    )
}

export const length: FieldValueReader<number>
= (r) => varint32(r)

export const uint32 = varint32;

export const uint64decimal: FieldValueReader<string>
= (r) => splitVarint64(r, join.unsignedDecimal);

export const uint64hex: FieldValueReader<string>
= (r) => splitVarint64(r, join.hex);

const utf8decode = (() => { const d = new TextDecoder("utf-8"); return d.decode.bind(d) })();

export const rawstring: (reader: Readable, length: number) => string
= (r, length) => {
    const block = rawbytes(r, length);
    return utf8decode(block);
}

export const string: FieldValueReader<string>
= (r) => {
    const size = length(r);
    return rawstring(r, size);
}

export const bytes: (reader: Readable) => Uint8Array
= (r) => {
    const size = length(r);
    return rawbytes(r, size);
}

export const rawbytes: (reader: Readable, length: number) => Uint8Array
= (r, length) => r.readBlock(length)

export const sub: (reader: Readable) => Readable
= (r) => {
    const length = varint32(r);
    return r.subreader(length);
}

export function skip(reader: Readable, wt: WireType): Uint8Array {
    switch (wt) {
        case WireType.Varint:
            {
                const bytes: number[] = [];
                for (;;) {
                    const byte = reader.readByte();
                    bytes.push(byte);
                    if (byte < 128) {
                        break;
                    }
                }
                return Uint8Array.from(bytes);
            }
        case WireType.Double:
            return rawbytes(reader, 8);
        case WireType.LengthDelim:
            {
                const bytes: number[] = [];
                let len = 0;
                for (let i = 0; i < 6; i++) {
                    const byte = reader.readByte();
                    bytes.push(byte);
                    len = (byte & 0x7F);
                    if (byte < 128) {
                        break;
                    }
                }
                const prefix = Uint8Array.from(bytes);
                const data = rawbytes(reader, len);
                const rval = new Uint8Array(prefix.length + data.length);
                rval.set(prefix);
                rval.set(data, prefix.length);
                return rval;
            }
        case WireType.Single:
            return rawbytes(reader, 4);
        case WireType.StartGroup:
        case WireType.EndGroup:
            throw new Error(`Skipping of wire type ${wt} is not implemented`)
        default:
            assertNever(wt);
    }
}