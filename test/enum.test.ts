import * as Enums from "../src/enums";
import { fromHex } from './functions';
import { WireType } from "../src/types";
import { writable } from "./mock";

describe('enumeration', () => {
    const orig = ((n: number) => `${n} (orig)`) as any;
    const d = {from: orig}
    const enumeration = Enums.enumeration(() => d);
    const after = ((n: number) => `${n}`) as any
    d.from = after;
    expect(d.from).toBe(after);
    
    it('defers call to from()', () => {
        const v = enumeration.defVal();
        expect(v).toBe(`0`);
    })

    it('reads and converts field with valid wire type', () => {
        const r = fromHex(`01`);
        const v = enumeration.read(r, WireType.Varint, 1, () => `0` as any);
        if (v instanceof Error)
            fail("enumeration.read returned an error");
        expect(v).toBe(`1`);
    })

    it('fails on field with invalid wire type', () => {
        const r = fromHex(`01`);
        const v = enumeration.read(r, WireType.LengthDelim, 1, () => `0` as any);
        expect(v).toBeInstanceOf(Error);
    })
})

describe('makeEnumWriter', () => {
    it('should call toNumber() and write the result', () => {
        const toNumber = ((v: string | Enums.EnumValue<"name"> | undefined) => parseInt(`${v}`)) as Enums.EnumToNumber<string, "name">;
        const writer = Enums.makeEnumWriter<"name", string>(toNumber)
        const w = writable();
        writer(w, "10");
        expect(w.toHexString()).toBe("0a");
    })
})

describe('enum definition', () => {
    const DefOfCoolEnum = {
        "None": 0 as 0,
        "Groovy": 1 as 1,
        "Rad": 2 as 2,
    }
    const CoolEnum = {} as any as Enums.EnumDef<"CoolEnum", typeof DefOfCoolEnum>;
    Enums.define(CoolEnum, DefOfCoolEnum);
    
    describe('values', () => {
        const e1 = CoolEnum.Groovy;
    
        it('should implement toString', () => {
            expect(`${e1}`).toBe("Groovy");
        })
    
        it('should implement toNumber', () => {
            expect(e1.toNumber()).toBe(1);
        })
    
        it('should implement toJson', () => {
            expect(JSON.stringify({e1: e1})).toBe(`{"e1":"Groovy"}`);
        })
    })
    
    describe('enum constructor', () => {
        const coolEnumFrom = CoolEnum.from;
    
        it('should be constructable from a number', () => {
            const actual = coolEnumFrom(2);
            expect(`${actual}`).toBe("Rad");
        })
    
        it('should be constructable from a string', () => {
            const actual = coolEnumFrom("Groovy");
            expect(actual.toNumber()).toBe(1);
        })
    
        it('should be constructable from another enum', () => {
            const actual = coolEnumFrom(CoolEnum.Groovy);
            expect(actual.toNumber()).toBe(1);
        })
    
        it('should fail for number out of range', () => {
            expect(() => coolEnumFrom(3 as any)).toThrow(/invalid/i);
        })
    
        it('should fail for string out of domain', () => {
            expect(() => coolEnumFrom("Gnarly" as any)).toThrow(/invalid/i);
        })
    
        describe('makeToNumber', () => {
            const toNumber = Enums.makeToNumber(coolEnumFrom);
            it('should convert to number', () => {
                expect(toNumber("Groovy")).toBe(1);
            })
            it('should fail to convert invalid string to number', () => {
                expect(() => toNumber("Gnarly" as any)).toThrow(/invalid/i);
            })
            it('should pass undefined through', () => {
                expect(toNumber(undefined)).toBeUndefined();
            })
        })
    
        describe('makeToString', () => {
            const toString = Enums.makeToString(coolEnumFrom);
            it('should convert to string', () => {
                expect(toString(2)).toBe("Rad");
            })
            it('should fail to convert invalid number to string', () => {
                expect(() => toString("3" as any)).toThrow(/invalid/i);
            })
            it('should pass undefined through', () => {
                expect(toString(undefined)).toBeUndefined();
            })
        })
    
    })
})


