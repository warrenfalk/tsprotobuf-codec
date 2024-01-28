import Long from "long";
import * as W from "../src/write-field";
import * as KC from "../src/key-converters";
import { writable } from "./mock";
import { makeDelimitedWriter, makeFieldWriter } from "../src/write-field";
import { FieldWriter } from "../src/types";
import { isUndefined } from "util";
import { Instant, Duration } from "@js-joda/core";

type WriteTestCase<T> = {
    scenario: string,
    method: FieldWriter<T>,
    value: T | undefined,
    output: string,
    omit?: boolean,
    force?: boolean
}

function testWrite<T>({scenario, method, value, force, output, omit = false}: WriteTestCase<T>) {
    test(`has correct output for ${scenario}`, () => {
        const w = writable();
        const wrote = method(w, value, 5, force);
        expect(w.toHexString()).toBe(output);
        expect(wrote).toBe(!omit);
    })
}


test('write tag for field 1 of type 0 is correct', () => {
    const w = writable();
    W.tag(w, 1, 0);
    expect(w.toHexString()).toBe("08");
})

test('write tag for field 16 of type 2 is correct', () => {
    const w = writable();
    W.tag(w, 16, 2);
    expect(w.toHexString()).toBe("8201");
})

describe('writers', () => {
    const writeContents: W.ValueWriter<string> = (w, value) => {
        W.string(w, value, 5);
    }

    describe('makeDelimitedWriter', () => {
        it('should write a delimited message', () => {
            const writer = makeDelimitedWriter(writeContents)
            const w = writable();
            writer(w, "mattel aquarius");
            expect(w.toHexString()).toBe("112a0f6d617474656c206171756172697573");
        })
    })
    
    describe('makeFieldWriter', () => {
        it('should write tag and wire type', () => {
            const writer = makeFieldWriter(writeContents, isUndefined);
            const w = writable();
            writer(w, "mattel aquarius", 7);
            expect(w.toHexString()).toBe("3a2a0f6d617474656c206171756172697573");
        })
        it('should write raw data when no field is given', () => {
            const writer = W.makeFieldWriter(writeContents, isUndefined);
            const w = writable();
            writer(w, "mattel aquarius");
            expect(w.toHexString()).toBe("2a0f6d617474656c206171756172697573");
        })
        it('should write nothing for undefined values', () => {
            const writer = W.makeFieldWriter(writeContents, isUndefined);
            const w = writable();
            writer(w, undefined, 7);
            expect(w.toHexString()).toBe("");
        })
        it('should write nothing for default values', () => {
            const isDef = (v => v === "default") as ((v: string | "default") => v is "default");
            const writer = W.makeFieldWriter<string, "default">(writeContents, isDef);
            const w = writable();
            writer(w, "default", 7);
            expect(w.toHexString()).toBe("");
        })
    })
    
    describe('makeEncoder', () => {
        it('should return raw encoded bytes', () => {
            const encoder = W.makeEncoder(writeContents);
            const output = encoder("XY");
            expect(output).toEqual(new Uint8Array([42, 2, 88, 89]));
        })
    })

})

describe('well-known', () => {
    describe('timestamp', () => {
        it('can encode a value', () => {
            const subject = Instant.ofEpochSecond(323874855, 2000000);
            const w = writable();
            const wrote = W.timestamp(w, subject, 6);
            expect(wrote).toBeTruthy();
            expect(w.toHexString()).toBe(`320a08a7e0b79a011080897a`);
        })
    })
    describe('duration', () => {
        it('can encode a value', () => {
            const subject = Duration.ofSeconds(1).plusNanos(2000000);
            const w = writable();
            const wrote = W.duration(w, subject, 6);
            expect(wrote).toBeTruthy();
            expect(w.toHexString()).toBe(`320608011080897a`);
        })
    })
})

// ------------------------------------------------------------

describe('write method', () => {
    
    describe('int32', () => {
        const method = W.int32;
        testWrite({method, scenario: "number > 127", value: 150, output: "289601"});
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "1", value: 1, output: "2801"});
        testWrite({method, scenario: "multibyte", value: 1234567, output: "2887ad4b"});
        testWrite({method, scenario: "negative", value: -1, output: "28ffffffffffffffffff01"});
    })

    describe('int64', () => {
        const method = W.int64;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "> 32 bits", value: 150000000000, output: "2880b8c9e5ae04"});
        testWrite({method, scenario: "> 32 bits negative", value: -150000000000, output: "2880c8b69ad1fbffffff01"});
        testWrite({method, scenario: "negative special case low bits", value: -171798691840, output: "288080808080fbffffff01"});
    })

    describe('int64long', () => {
        const method = W.int64long;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0 unforced", value: Long.ZERO, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: Long.ZERO, force: true, output: "2800"});
        testWrite({method, scenario: "typical", value: Long.fromNumber(12345678901), output: "28b5b8f0fe2d"});
        testWrite({method, scenario: "typical negative", value: Long.fromNumber(-12345678901), output: "28cbc78f81d2ffffffff01"});
        testWrite({method, scenario: "typical number", value: 12345678901, output: "28b5b8f0fe2d"});
        testWrite({method, scenario: "max edge", value: Long.MAX_VALUE, output: "28ffffffffffffffff7f"});
        testWrite({method, scenario: "min edge", value: Long.MIN_VALUE, output: "2880808080808080808001"});
    })

    describe('int64decimal', () => {
        const method = W.int64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0 unforced", value: "0", output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: "0", force: true, output: "2800"});
        testWrite({method, scenario: "\"00\"", value: "00", output: "", omit: true});
        testWrite({method, scenario: "typical", value: "12345678901", output: "28b5b8f0fe2d"});
        testWrite({method, scenario: "typical negative", value: "-12345678901", output: "28cbc78f81d2ffffffff01"});
        testWrite({method, scenario: "typical number", value: 12345678901, output: "28b5b8f0fe2d"});
    })


    describe('bool', () => {
        const method = W.bool;
        testWrite({method, scenario: "true", value: true, output: "2801"});
        testWrite({method, scenario: "false", value: false, output: "", omit: true});
        testWrite({method, scenario: "false forced", value: false, force: true, output: "2800"});
    })

    describe('double', () => {
        const method = W.double;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "290000000000000000"});
        testWrite({method, scenario: "-0", value: -0, output: "290000000000000080"});
        testWrite({method, scenario: "1", value: 1, output: "29000000000000f03f"});
        testWrite({method, scenario: "-1", value: -1, output: "29000000000000f0bf"});
        testWrite({method, scenario: "typical", value: 12345.12345, output: "2958a835cd8f1cc840"});
        testWrite({method, scenario: "< 1", value: 0.12345, output: "297cf2b0506b9abf3f"});
        testWrite({method, scenario: "denormal", value: 5e-324, output: "290100000000000000"});
        testWrite({method, scenario: "NaN", value: NaN, output: "29ffffffffffffff7f"});
        testWrite({method, scenario: "-Infinity", value: -Infinity, output: "29000000000000f0ff"});
    })

    describe('fixed32', () => {
        const method = W.fixed32;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2d00000000"});
        testWrite({method, scenario: "1", value: 1, output: "2d01000000"});
        testWrite({method, scenario: "typical", value: 1234567, output: "2d87d61200"});
    })

    describe('float', () => {
        const method = W.float;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2d00000000"});
        testWrite({method, scenario: "-0", value: -0, output: "2d00000080"});
        testWrite({method, scenario: "1", value: 1, output: "2d0000803f"});
        testWrite({method, scenario: "typical", value: 12345.123046875, output: "2d7ee44046"});
        testWrite({method, scenario: "denormal", value: 4.999999675228202e-39, output: "2df7713600"});
        testWrite({method, scenario: "NaN", value: NaN, output: "2dffffff7f"});
        testWrite({method, scenario: "-Infinity", value: -Infinity, output: "2d000080ff"});
    })

    describe('sfixed32', () => {
        const method = W.sfixed32;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2d00000000"});
        testWrite({method, scenario: "typical", value: 123456, output: "2d40e20100"});
        testWrite({method, scenario: "typical negative", value: -10, output: "2df6ffffff"});
    })

    describe('fixed64', () => {
        const method = W.fixed64;
        testWrite({method, scenario: "0", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "290000000000000000"});
        testWrite({method, scenario: "1", value: 1, output: "290100000000000000"});
        testWrite({method, scenario: "typical > 32 bits", value: 12345678901, output: "29351cdcdf02000000"});
    })

    describe('fixed64long', () => {
        const method = W.fixed64long;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0", value: Long.ZERO, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: Long.ZERO, force: true, output: "290000000000000000"});
        testWrite({method, scenario: "1", value: Long.fromNumber(1), output: "290100000000000000"});
        testWrite({method, scenario: "typical > 32 bits", value: Long.fromNumber(12345678901), output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical number > 32 bits", value: 12345678901, output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical > 53 bits", value: Long.fromNumber(1234567890123456), output: "29c0ba8a3cd5620400"});
        testWrite({method, scenario: "max edge", value: Long.MAX_UNSIGNED_VALUE, output: "29ffffffffffffffff"});
    })

    describe('fixed64decimal', () => {
        const method = W.fixed64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "\"\"", value: "", output: "", omit: true});
        testWrite({method, scenario: "0", value: "0", output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: "0", force: true, output: "290000000000000000"});
        testWrite({method, scenario: "1", value: 1, output: "290100000000000000"});
        testWrite({method, scenario: "typical > 32 bits", value: "12345678901", output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical number > 32 bits", value: 12345678901, output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical > 53 bits", value: "1234567890123456", output: "29c0ba8a3cd5620400"});
    })

    describe('sfixed64', () => {
        const method = W.sfixed64;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "290000000000000000"});
        testWrite({method, scenario: "typical > 32 bits", value: 12345678901, output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical negative", value: -10, output: "29f6ffffffffffffff"});
        testWrite({method, scenario: "special case -0x100000000", value: -0x100000000, output: "2900000000ffffffff"});
    })

    describe('sfixed64long', () => {
        const method = W.sfixed64long;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0 unforced", value: Long.ZERO, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: Long.ZERO, force: true, output: "290000000000000000"});
        testWrite({method, scenario: "typical > 32 bits", value: Long.fromNumber(12345678901), output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical number > 32 bits", value: 12345678901, output: "29351cdcdf02000000"});
        testWrite({method, scenario: "typical negative", value: Long.fromNumber(-10), output: "29f6ffffffffffffff"});
        testWrite({method, scenario: "special case -0x100000000", value: Long.fromNumber(-0x100000000), output: "2900000000ffffffff"});
        testWrite({method, scenario: "max edge", value: Long.MAX_VALUE, output: "29ffffffffffffff7f"});
        testWrite({method, scenario: "min edge", value: Long.MIN_VALUE, output: "290000000000000080"});
    })

    describe('sfixed64decimal', () => {
        const method = W.sfixed64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "\"\"", value: "", output: "", omit: true});
        testWrite({method, scenario: "\"0\" unforced", value: "0", output: "", omit: true});
        testWrite({method, scenario: "\"0\" forced", value: "0", force: true, output: "290000000000000000"});
        testWrite({method, scenario: "\"00\"", value: "00", output: "", omit: true});
        testWrite({method, scenario: "typical string", value: "12345678901", output: "29351cdcdf02000000"});
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "290000000000000000"});
        testWrite({method, scenario: "typical numeric", value: 12345678901, output: "29351cdcdf02000000"});
    })

    describe('sint32', () => {
        const method = W.sint32;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "typical", value: 1234567, output: "288eda9601"});
        testWrite({method, scenario: "typical negative", value: -1234567, output: "288dda9601"});
    })

    describe('sint64', () => {
        const method = W.sint64;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "< 32 bits", value: 10, output: "2814"});
        testWrite({method, scenario: "< 32 bits negative", value: -10, output: "2813"});
        testWrite({method, scenario: "> 32 bits", value: 12345678901, output: "28eaf0e0fd5b"});
        testWrite({method, scenario: "> 32 bits negative", value: -12345678901, output: "28e9f0e0fd5b"});
        testWrite({method, scenario: "special case -0x100000000", value: -0x100000000, output: "28ffffffff1f"});
    })

    describe('sint64long', () => {
        const method = W.sint64long;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0 unforced", value: Long.ZERO, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: Long.ZERO, force: true, output: "2800"});
        testWrite({method, scenario: "typical", value: Long.fromNumber(12345678901), output: "28eaf0e0fd5b"});
        testWrite({method, scenario: "typical negative", value: Long.fromNumber(-12345678901), output: "28e9f0e0fd5b"});
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "typical number", value: 12345678901, output: "28eaf0e0fd5b"});
        testWrite({method, scenario: "typical negative number", value: -12345678901, output: "28e9f0e0fd5b"});
        testWrite({method, scenario: "max edge", value: Long.MAX_VALUE, output: "28feffffffffffffffff01"});
        testWrite({method, scenario: "min edge", value: Long.MIN_VALUE, output: "28ffffffffffffffffff01"});
    })

    describe('sint64decimal', () => {
        const method = W.sint64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "\"\"", value: "", output: "", omit: true});
        testWrite({method, scenario: "\"0\" unforced", value: "0", output: "", omit: true});
        testWrite({method, scenario: "\"0\" forced", value: "0", force: true, output: "2800"});
        testWrite({method, scenario: "\"00\"", value: "00", output: "", omit: true});
        testWrite({method, scenario: "typical string", value: "12345678901", output: "28eaf0e0fd5b"});
        testWrite({method, scenario: "typical negative string", value: "-12345678901", output: "28e9f0e0fd5b"});
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "typical number", value: 12345678901, output: "28eaf0e0fd5b"});
        testWrite({method, scenario: "typical negative number", value: -12345678901, output: "28e9f0e0fd5b"});
    })

    describe('string', () => {
        const method = W.string;
        testWrite({method, scenario: "\"\" unforced", value: "", output: "", omit: true});
        testWrite({method, scenario: "\"\" forced", value: "", force: true, output: "2a00"});
        testWrite({method, scenario: "simple", value: "the rain in spain", output: "2a11746865207261696e20696e20737061696e"});
        testWrite({method, scenario: "with unicode", value: "the 😘 in 🎵", output: "2a1074686520f09f989820696e20f09f8eb5"});
    })

    describe('bytes', () => {
        const method = W.bytes;
        testWrite({method, scenario: "[]", value: [], output: "", omit: true});
        testWrite({method, scenario: "[] forced", value: [], force: true, output: "2a00"});
        testWrite({method, scenario: "number[]", value: [1,2,3,4], output: "2a0401020304"});
        testWrite({method, scenario: "UintArray", value: Uint8Array.from([1,2,3,4]), output: "2a0401020304"});
    })

    describe('uint32', () => {
        const method = W.uint32;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "typical", value: 1234567, output: "2887ad4b"});
    })

    describe('uint64', () => {
        const method = W.uint64;
        testWrite({method, scenario: "0 unforced", value: 0, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: 0, force: true, output: "2800"});
        testWrite({method, scenario: "typical < 32 bit", value: 10, output: "280a"});
        testWrite({method, scenario: "typical > 32 bit", value: 12345678901, output: "28b5b8f0fe2d"});
    })

    describe('uint64long', () => {
        const method = W.uint64long;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0 unforced", value: Long.ZERO, output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: Long.ZERO, force: true, output: "2800"});
        testWrite({method, scenario: "typical < 32 bit", value: Long.fromNumber(10), output: "280a"});
        testWrite({method, scenario: "typical > 32 bit", value: Long.fromNumber(12345678901), output: "28b5b8f0fe2d"});
        testWrite({method, scenario: "typical number > 32 bit", value: 12345678901, output: "28b5b8f0fe2d"});
        testWrite({method, scenario: "max edge", value: Long.MAX_UNSIGNED_VALUE, output: "28ffffffffffffffffff01"});
    })

    describe('uint64decimal', () => {
        const method = W.uint64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true});
        testWrite({method, scenario: "0 unforced", value: "0", output: "", omit: true});
        testWrite({method, scenario: "0 forced", value: "0", force: true, output: "2800"});
        testWrite({method, scenario: "typical < 32 bit", value: "10", output: "280a"});
        testWrite({method, scenario: "typical > 32 bit", value: "12345678901", output: "28b5b8f0fe2d"});
        testWrite({method, scenario: "typical number > 32 bit", value: 12345678901, output: "28b5b8f0fe2d"});
    })

    describe('maybeDouble', () => {
        const method = W.maybeDouble;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2a00"})
        testWrite({method, scenario: "non-default", value: 10, output: "2a09090000000000002440"});
    })
    
    describe('maybeFloat', () => {
        const method = W.maybeFloat;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2a00"})
        testWrite({method, scenario: "non-default", value: 10, output: "2a050d00002041"});
    })
    
    describe('maybeInt64decimal', () => {
        const method = W.maybeInt64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2a00"})
        testWrite({method, scenario: "non-default", value: "10", output: "2a02080a"});
    })
    
    describe('maybeUint64decimal', () => {
        const method = W.maybeUint64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2a00"})
        testWrite({method, scenario: "non-default", value: "10", output: "2a02080a"});
    })
    
    describe('maybeInt32', () => {
        const method = W.maybeInt32;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2a00"})
        testWrite({method, scenario: "non-default", value: 10, output: "2a02080a"});
    })
    
    describe('maybeUint32', () => {
        const method = W.maybeUint32;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2a00"})
        testWrite({method, scenario: "non-default", value: 10, output: "2a02080a"});
    })
    
    describe('maybeBool', () => {
        const method = W.maybeBool;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: false, output: "2a00"})
        testWrite({method, scenario: "non-default", value: true, output: "2a020801"});
    })
    
    describe('maybeString', () => {
        const method = W.maybeString;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: "", output: "2a00"})
        testWrite({method, scenario: "non-default", value: "10", output: "2a040a023130"});
    })
    
    describe('maybeBytes', () => {
        const method = W.maybeBytes;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: new Uint8Array(0), output: "2a00"})
        testWrite({method, scenario: "non-default", value: new Uint8Array([10]), output: "2a030a010a"});
    })

    // optional 

    describe('optionalDouble', () => {
        const method = W.optionalDouble;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "290000000000000000"})
        testWrite({method, scenario: "non-default", value: 10, output: "290000000000002440"});
    })
    
    describe('optionalFloat', () => {
        const method = W.optionalFloat;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2d00000000"})
        testWrite({method, scenario: "non-default", value: 10, output: "2d00002041"});
    })
    
    describe('optionalInt64decimal', () => {
        const method = W.optionalInt64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2800"})
        testWrite({method, scenario: "non-default", value: "10", output: "280a"});
    })
    
    describe('optionalUint64decimal', () => {
        const method = W.optionalUint64decimal;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2800"})
        testWrite({method, scenario: "non-default", value: "10", output: "280a"});
    })
    
    describe('optionalInt32', () => {
        const method = W.optionalInt32;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2800"})
        testWrite({method, scenario: "non-default", value: 10, output: "280a"});
    })
    
    describe('optionalUint32', () => {
        const method = W.optionalUint32;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: 0, output: "2800"})
        testWrite({method, scenario: "non-default", value: 10, output: "280a"});
    })
    
    describe('optionalBool', () => {
        const method = W.optionalBool;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: false, output: "2800"})
        testWrite({method, scenario: "non-default", value: true, output: "2801"});
    })
    
    describe('optionalString', () => {
        const method = W.optionalString;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: "", output: "2a00"})
        testWrite({method, scenario: "non-default", value: "10", output: "2a023130"});
    })
    
    describe('optionalBytes', () => {
        const method = W.optionalBytes;
        testWrite({method, scenario: "undefined", value: undefined, output: "", omit: true})
        testWrite({method, scenario: "default", value: new Uint8Array(0), output: "2a00"})
        testWrite({method, scenario: "non-default", value: new Uint8Array([10]), output: "2a010a"});
    })

})

describe('write value only', () => {
    // I don't know if allowing a field number of zero is strictly necessary
    // but the behavior probably shouldn't change, so we'll test it for now
    // field numbers have to be non-zero in normal protocol buffers
    // but I want to differentiate between zero and undefined
    // TODO: even better would be to have different functions for int32.writeField and int32.writeVal
    it('writes value with zero field + wire-type', () => {
        const w = writable();
        const r = W.int32(w, 1, 0);
        expect(r).toBe(true);
        expect(w.toHexString()).toBe("0001");
    })
    it('writes value only without field + wire-type', () => {
        const w = writable();
        const r= W.int32(w, 1);
        expect(r).toBe(true);
        expect(w.toHexString()).toBe("01");
    })
})

describe('packed', () => {
    it('writes multiple instances', () => {
        const w = writable();
        W.packed(w, W.int32, [1, 0, 2], 5);
        expect(w.toHexString()).toBe("2a03010002");
    })

    it('writes nothing for empty packed', () => {
        const w = writable();
        W.packed(w, W.int32, [], 5);
        expect(w.toHexString()).toBe("");
    })

    it('writes nothing for undefined packed', () => {
        const w = writable();
        W.packed(w, W.int32, undefined, 5);
        expect(w.toHexString()).toBe("");
    })

    it('can write packed of surrogate-implemented type', () => {
        const w = writable();
        W.packed(w, W.uint64decimal, [12345678901, "12345678901"], 5);
        expect(w.toHexString()).toBe("2a0ab5b8f0fe2db5b8f0fe2d");
    })
})


describe('repeated', () => {
    it('writes multiple instances', () => {
        const w = writable();
        W.repeated(w, W.int32, [1, 0, 2], 5);
        expect(w.toHexString()).toBe("280128002802");
    })

    it('writes nothing for empty repeated', () => {
        const w = writable();
        W.repeated(w, W.int32, [], 5);
        expect(w.toHexString()).toBe("");
    })

    it('writes nothing for undefined repeated', () => {
        const w = writable();
        W.repeated(w, W.int32, undefined, 5);
        expect(w.toHexString()).toBe("");
    })

    it('can write repeated of surrogate-implemented type', () => {
        const w = writable();
        W.repeated(w, W.uint64decimal, [12345678901, "12345678901"], 5);
        expect(w.toHexString()).toBe("28b5b8f0fe2d28b5b8f0fe2d");
    })
})


describe('map', () => {
    it('writes multiple instances', () => {
        const w = writable();
        W.map(w, W.int32, KC.int32, W.int32, {1: 2, 2: 3}, 5);
        expect(w.toHexString()).toBe("2a04080110022a0408021003");
    })

    it('omits default values', () => {
        const w = writable();
        W.map(w, W.int32, KC.int32, W.int32, {1: 2, 2: 0}, 5);
        expect(w.toHexString()).toBe("2a04080110022a020802");
    })

    it('omits entries with undefined values', () => {
        const w = writable();
        W.map(w, W.int32, KC.int32, W.int32, {1: 2, 2: undefined}, 5);
        expect(w.toHexString()).toBe("2a0408011002");
    })

    it('omits default keys', () => {
        const w = writable();
        W.map(w, W.int32, KC.int32, W.int32, {1: 2, 0: 3}, 5);
        expect(w.toHexString()).toBe("2a0210032a0408011002");
    })

    it('writes nothing for empty map', () => {
        const w = writable();
        W.map(w, W.int32, KC.int32, W.int32, {}, 5);
        expect(w.toHexString()).toBe("");
    })

    it('writes nothing for undefined map', () => {
        const w = writable();
        W.map(w, W.int32, KC.int32, W.int32, undefined, 5);
        expect(w.toHexString()).toBe("");
    })

    it('can encode a Map()', () => {
        const w = writable();
        const map = new Map<number, number>([[1, 2], [2, 3]]);
        W.map(w, W.int32, KC.int32, W.int32, map, 5);
        expect(w.toHexString()).toBe("2a04080110022a0408021003");
    })

    it('can handle boolean keys', () => {
        const w = writable();
        W.map(w, W.bool, KC.bool, W.int32, {true: 2, false: 3}, 5);
        expect(w.toHexString()).toBe("2a04080110022a021003");
    })

    it('can handle string keys', () => {
        const w = writable();
        W.map(w, W.string, KC.string, W.int32, {"two": 2, "three": 3}, 5);
        expect(w.toHexString()).toBe("2a070a0374776f10022a090a0574687265651003");
    })
})
