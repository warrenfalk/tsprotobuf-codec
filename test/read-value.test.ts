import { Reader, ReadValue } from "../src/protobuf-codec-ts";
import { fromHex, hexToBytes } from "./functions";
import { WireType } from "../src/types";
const {fieldFromTag, wireTypeFromTag} = ReadValue;

describe('varint32', () => {
    it('can read 1234567 from known bytes', () => {
        const r = fromHex("87ad4b");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(1234567);
    })
    
    it('can read 0x12345678 from known bytes', () => {
        const r = fromHex("f8acd19101");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x12345678);
    })
    
    it('can read 0x12345678 from known bytes', () => {
        const r = fromHex("f8acd19101");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x12345678);
    })
    
    it('can read 0x76543210 from known bytes', () => {
        const r = fromHex("90e4d0b207");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x76543210);
    })
    
    it('truncates 6th byte', () => {
        const r = fromHex("90e4d0b2877f");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x76543210);
    })
    
    it('truncates 7th byte', () => {
        const r = fromHex("90e4d0b287ff7f");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x76543210);
    })
    
    it('truncates 8th byte', () => {
        const r = fromHex("90e4d0b287ffff7f");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x76543210);
    })
    
    it('truncates 9th byte', () => {
        const r = fromHex("90e4d0b287ffffff7f");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x76543210);
    })
    
    it('truncates 10th byte', () => {
        const r = fromHex("90e4d0b287ffffffff7f");
        const actual = ReadValue.varint32(r)
        expect(actual).toBe(0x76543210);
    })

    it('fails on 11th byte', () => {
        const r = fromHex("90e4d0b287ffffffffff7f");
        expect(() => ReadValue.varint32(r)).toThrow(/exceed/);
    })    
})

describe('skip', () => {
    it('can skip a varint', () => {
        const r = fromHex("90e4d0b287ff7ff8acd19101");
        const skipped = ReadValue.skip(r, WireType.Varint);
        expect(skipped).toEqual(hexToBytes("90e4d0b287ff7f"));
        const next = r.readBlock(5);
        expect(next).toEqual(hexToBytes("f8acd19101"));
    })

    it('can skip a double', () => {
        const r = fromHex("7cf2b0506b9abf3ff8acd19101");
        const skipped = ReadValue.skip(r, WireType.Double);
        expect(skipped).toEqual(hexToBytes("7cf2b0506b9abf3f"));
        const next = r.readBlock(5);
        expect(next).toEqual(hexToBytes("f8acd19101"));
    })

    it('can skip a single', () => {
        const r = fromHex("7ee44046f8acd19101");
        const skipped = ReadValue.skip(r, WireType.Single);
        expect(skipped).toEqual(hexToBytes("7ee44046"));
        const next = r.readBlock(5);
        expect(next).toEqual(hexToBytes("f8acd19101"));
    })

    it('can skip a length-delim', () => {
        const r = fromHex("11746865207261696e20696e20737061696ef8acd19101");
        const skipped = ReadValue.skip(r, WireType.LengthDelim);
        expect(skipped).toEqual(hexToBytes("11746865207261696e20696e20737061696e"));
        const next = r.readBlock(5);
        expect(next).toEqual(hexToBytes("f8acd19101"));
    })

    it('can skip a long length-delim', () => {
        const lengthDelim = `8877
            746865207261696e20696e20737061696e
            746865207261696e20696e20737061696e
            746865207261696e20696e20737061696e
            746865207261696e20696e20737061696e
            746865207261696e20696e20737061696e
            746865207261696e20696e20737061696e
            746865207261696e20696e20737061696e
            `
        const r = fromHex(`${lengthDelim}f8acd19101`);
        const skipped = ReadValue.skip(r, WireType.LengthDelim);
        expect(skipped).toEqual(hexToBytes(lengthDelim));
        const next = r.readBlock(5);
        expect(next).toEqual(hexToBytes("f8acd19101"));
    })

    it('throws on unsupported wire types', () => {
        const r = fromHex("11746865207261696e20696e20737061696ef8acd19101");
        expect(() => { ReadValue.skip(r, 6 as any as WireType) }).toThrow();
        // or we could just support these, but for now, expect this behavior
        expect(() => { ReadValue.skip(r, WireType.StartGroup) }).toThrow();
        expect(() => { ReadValue.skip(r, WireType.EndGroup) }).toThrow();
    })
})

describe('tag', () => {
    it('can read (1, 0) from known bytes', () => {
        const r = fromHex("08");
        const tag = ReadValue.tag(r)!;
        expect(tag).toBeDefined();
        const field = fieldFromTag(tag);
        const wireType = wireTypeFromTag(tag);
        expect(field).toBe(1);
        expect(wireType).toBe(0);
    })

    it('reads undefined at end of stream', () => {
        const r = fromHex("08");
        const first = ReadValue.tag(r)!;
        expect(first).toBeDefined();
        const second = ReadValue.tag(r)!;
        expect(second).not.toBeDefined();
    })

})

describe('int32', () => {
    it('can read 150 from known bytes', () => {
        const r = fromHex("9601");
        const actual = ReadValue.int32(r);
        expect(actual).toBe(150);
    })

    it('can read 1 from known bytes', () => {
        const r = fromHex("01");
        const actual = ReadValue.int32(r);
        expect(actual).toBe(1);
    })
    
    it('can read 1234567 from known bytes', () => {
        const r = fromHex("87ad4b");
        const actual = ReadValue.int32(r);
        expect(actual).toBe(1234567);
    })
    
    it('can read -1 from known bytes', () => {
        const r = fromHex("ffffffffffffffffff01");
        const actual = ReadValue.int32(r);
        expect(actual).toBe(-1);
    })
})

describe('int64', () => {
    it('can read 1500000000 from known bytes', () => {
        const r = fromHex("80b8c9e5ae04");
        const actual = ReadValue.int64decimal(r);
        expect(actual).toBe("150000000000");
    })
    
    it('can read -171798691840 from known bytes', () => {
        const r = fromHex("8080808080fbffffff01");
        const actual = ReadValue.int64decimal(r);
        expect(actual).toBe("-171798691840");
    })
    
    it('can read -1500000000 from known bytes', () => {
        const r = fromHex("80c8b69ad1fbffffff01");
        const actual = ReadValue.int64decimal(r);
        expect(actual).toBe("-150000000000");
    })
    
    it('can read 17604747090944 from known bytes', () => {
        const r = fromHex("80b8c9e5ae8004");
        const actual = ReadValue.int64decimal(r);
        expect(actual).toBe("17604747090944");
    })
    
    it('can read 2251812374731776 from known bytes', () => {
        const r = fromHex("80b8c9e5ae808004");
        const actual = ReadValue.int64decimal(r);
        expect(actual).toBe("2251812374731776");
    })    
})

// ----------------------------------------------------------

describe('bool', () => {
    it('can read true from known bytes', () => {
        const r = fromHex("01");
        const actual = ReadValue.bool(r);
        expect(actual).toBe(true);
    })
})

describe('double', () => {
    it('can read 1 from known bytes', () => {
        const r = fromHex("000000000000f03f");
        const actual = ReadValue.double(r);
        expect(actual).toBe(1);
    })
    
    it('can read -1 from known bytes', () => {
        const r = fromHex("000000000000f0bf");
        const actual = ReadValue.double(r);
        expect(actual).toBe(-1);
    })
    
    it('can read 12345.12345 from known bytes', () => {
        const r = fromHex("58a835cd8f1cc840");
        const actual = ReadValue.double(r);
        expect(actual).toBe(12345.12345);
    })
    
    it('can read 0.12345 from known bytes', () => {
        const r = fromHex("7cf2b0506b9abf3f");
        const actual = ReadValue.double(r);
        expect(actual).toBe(0.12345);
    })
    
    it('can read 5e-324 from known bytes', () => {
        const r = fromHex("0100000000000000");
        const actual = ReadValue.double(r);
        expect(actual).toBe(5e-324);
    })
    
    it('can read NaN from known bytes', () => {
        const r = fromHex("ffffffffffffff7f");
        const actual = ReadValue.double(r);
        expect(actual).toBeNaN();
    })

    it('can read -Infinity from known bytes', () => {
        const r = fromHex("000000000000f0ff");
        const actual = ReadValue.double(r);
        expect(actual).toBe(-Infinity);
    })
})

describe('fixed32', () => {
    it('can read 1 from known bytes', () => {
        const r = fromHex("01000000");
        const actual = ReadValue.fixed32(r);
        expect(actual).toBe(1);
    })
    
    it('can read 1234567 from known bytes', () => {
        const r = fromHex("87d61200");
        const actual = ReadValue.fixed32(r);
        expect(actual).toBe(1234567);
    })    
})

describe('fixed64decimalpad', () => {
    it('can read 1 from known bytes', () => {
        const r = fromHex("0100000000000000");
        const actual = ReadValue.fixed64decimalpad(r);
        expect(actual).toBe("00000000000000000001");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("351cdcdf02000000");
        const actual = ReadValue.fixed64decimalpad(r);
        expect(actual).toBe("00000000012345678901");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("ffffffffffffffff");
        const actual = ReadValue.fixed64decimalpad(r);
        expect(actual).toBe("18446744073709551615");
    })
})

describe('fixed64decimal', () => {
    it('can read 1 from known bytes', () => {
        const r = fromHex("0100000000000000");
        const actual = ReadValue.fixed64decimal(r);
        expect(actual).toBe("1");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("351cdcdf02000000");
        const actual = ReadValue.fixed64decimal(r);
        expect(actual).toBe("12345678901");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("ffffffffffffffff");
        const actual = ReadValue.fixed64decimal(r);
        expect(actual).toBe("18446744073709551615");
    })
})

describe('fixed64hexpad', () => {
    it('can read 1 from known bytes', () => {
        const r = fromHex("0100000000000000");
        const actual = ReadValue.fixed64hexpad(r);
        expect(actual).toBe("0000000000000001");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("351cdcdf020000ff");
        const actual = ReadValue.fixed64hexpad(r);
        expect(actual).toBe("ff000002dfdc1c35");
    })    
})

describe('float', () => {
    it('can read 1 from known bytes', () => {
        const r = fromHex("0000803f");
        const actual = ReadValue.float(r);
        expect(actual).toBe(1);
    })
    
    it('can read 12345.123046875 from known bytes', () => {
        const r = fromHex("7ee44046");
        const actual = ReadValue.float(r);
        expect(actual).toBe(12345.123046875);
    })
    
    it('can read 4.999999675228202e-39 from known bytes', () => {
        const r = fromHex("f7713600");
        const actual = ReadValue.float(r);
        expect(actual).toBe(4.999999675228202e-39);
    })
    
    it('can read NaN from known bytes', () => {
        const r = fromHex("ffffff7f");
        const actual = ReadValue.float(r);
        expect(actual).toBeNaN();
    })
    
    it('can read -Infinity from known bytes', () => {
        const r = fromHex("000080ff");
        const actual = ReadValue.float(r);
        expect(actual).toBe(-Infinity);
    })
})

describe('int64decimal', () => {
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("b5b8f0fe2d");
        const actual = ReadValue.int64decimal(r);
        expect(actual).toBe("12345678901");
    })
})

describe('length', () => {
    it('can read 1234 from known bytes', () => {
        const r = fromHex("d209");
        const actual = ReadValue.length(r);
        expect(actual).toBe(1234);
    })    
})

describe('sfixed32', () => {
    it('can read -10 from known bytes', () => {
        const r = fromHex("f6ffffff");
        const actual = ReadValue.sfixed32(r);
        expect(actual).toBe(-10);
    })
    
    it('can read 123456 from known bytes', () => {
        const r = fromHex("40e20100");
        const actual = ReadValue.sfixed32(r);
        expect(actual).toBe(123456);
    })
})

describe('sfixed64decimal', () => {
    it('can read -10 from known bytes', () => {
        const r = fromHex("f6ffffffffffffff");
        const actual = ReadValue.sfixed64decimal(r);
        expect(actual).toBe("-10");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("351cdcdf02000000");
        const actual = ReadValue.sfixed64decimal(r);
        expect(actual).toBe("12345678901");
    })
    
    it('can read -4294967296 from known bytes', () => {
        const r = fromHex("00000000ffffffff");
        const actual = ReadValue.sfixed64decimal(r);
        expect(actual).toBe("-4294967296");
    })
})

describe('sint32', () => {
    it('can read 10 from known bytes', () => {
        const r = fromHex("14");
        const actual = ReadValue.sint32(r);
        expect(actual).toBe(10);
    })
    
    it('can read -10 from known bytes', () => {
        const r = fromHex("13");
        const actual = ReadValue.sint32(r);
        expect(actual).toBe(-10);
    })
    
    it('can read 1234567 from known bytes', () => {
        const r = fromHex("8eda9601");
        const actual = ReadValue.sint32(r);
        expect(actual).toBe(1234567);
    })
    
    it('can read -1234567 from known bytes', () => {
        const r = fromHex("8dda9601");
        const actual = ReadValue.sint32(r);
        expect(actual).toBe(-1234567);
    })
})

describe('sint64decimal', () => {
    it('can read 10 from known bytes', () => {
        const r = fromHex("14");
        const actual = ReadValue.sint64decimal(r);
        expect(actual).toBe("10");
    })
    
    it('can read -10 from known bytes', () => {
        const r = fromHex("13");
        const actual = ReadValue.sint64decimal(r);
        expect(actual).toBe("-10");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("eaf0e0fd5b");
        const actual = ReadValue.sint64decimal(r);
        expect(actual).toBe("12345678901");
    })
    
    it('can read -12345678901 from known bytes', () => {
        const r = fromHex("e9f0e0fd5b");
        const actual = ReadValue.sint64decimal(r);
        expect(actual).toBe("-12345678901");
    })
    
    it('can read -12213813249 from known bytes', () => {
        const r = fromHex("818080805b");
        const actual = ReadValue.sint64decimal(r);
        expect(actual).toBe("-12213813249");
    })
})

describe('string', () => {
    it('can read "the rain in spain" from known bytes', () => {
        const r = fromHex("11746865207261696e20696e20737061696e");
        const actual = ReadValue.string(r);
        expect(actual).toBe("the rain in spain");
    })
    
    it('can read "the 😘 in 🎵" from known bytes', () => {
        const r = fromHex("1074686520f09f989820696e20f09f8eb5");
        const actual = ReadValue.string(r);
        expect(actual).toBe("the 😘 in 🎵")
    })    
})

describe('bytes', () => {
    it('can read 0x1234567890 from known bytes', () => {
        const r = fromHex("051234567890");
        const actual = ReadValue.bytes(r);
        expect(actual).toStrictEqual(hexToBytes("1234567890"))
    })    
})

describe('uint32', () => {
    it('can read 10 from known bytes', () => {
        const r = fromHex("0a");
        const actual = ReadValue.uint32(r);
        expect(actual).toBe(10);
    })
    
    it('can read 1234567 from known bytes', () => {
        const r = fromHex("87ad4b");
        const actual = ReadValue.uint32(r);
        expect(actual).toBe(1234567);
    })
})

describe('uint64decimal', () => {
    it('can read 10 from known bytes', () => {
        const r = fromHex("0a");
        const actual = ReadValue.uint64decimal(r);
        expect(actual).toBe("10");
    })
    
    it('can read 12345678901 from known bytes', () => {
        const r = fromHex("b5b8f0fe2d");
        const actual = ReadValue.uint64decimal(r);
        expect(actual).toBe("12345678901");
    })    
})

describe('uint64hex', () => {
    it('can read 0x2dfdc1c35 from known bytes', () => {
        const r = fromHex("b5b8f0fe2d");
        const actual = ReadValue.uint64hex(r);
        expect(actual).toBe("2dfdc1c35");
    })    
})

describe('uint64decimal', () => {
    it('fails on varint overflow', () => {
        const r = fromHex("b5b8f0fead808080808000");
        expect(() => ReadValue.uint64decimal(r)).toThrow(/exceed/);
    })
})

describe('sub', () => {
    test('can read sub message', () => {
        const r = fromHex("05b5b8f0fe2d010a");
        const r1 = ReadValue.sub(r);
        const r2 = ReadValue.sub(r);
        expect(ReadValue.uint64hex(r1)).toBe("2dfdc1c35");
        expect(ReadValue.uint64decimal(r2)).toBe("10");
    })
})
