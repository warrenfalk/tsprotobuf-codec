import * as Customize from "../src/customize";
import { define, MessageDef } from "../src/messages";
import * as W from "../src/write-field";
import * as F from "../src/field-types";
import { writable } from "./mock";
import { fromHex } from "./functions";
import { WireType } from "../src/types";

describe(`surrogate`, () => {
    type MockRawStrict = {key: string, value: string};
    type MockRawValue = MockRawStrict | {key?: string, value?: string};
    const MockRaw = {} as any as MessageDef<MockRawStrict, MockRawValue>;
    define<MockRawStrict, MockRawValue>(MockRaw, {
        writeContents: (w, msg) => {
            W.string(w, msg.key, 1);
            W.string(w, msg.value, 2);
        },
        fields: [
            [1, "key", F.string],
            [2, "value", F.string],
        ],
    })
    
    const Surrogate = Customize.message(MockRaw).usingSurrogate({
        defVal: () => "default",
        isDef(v): v is "default" { return v === "default"; },
        fromSurrogate: (surrogateValue: string) => surrogateValue === "default" ? undefined : JSON.parse(surrogateValue),
        toSurrogate: (raw) => JSON.stringify(raw),
    })

    describe('mock assumptions', () => {
        it('MsgType encodes correctly', () => {
            const rawValue = {key: "mountain", value: "dew"};
            const w = writable();
            MockRaw.writeValue(w, rawValue);
            expect(w.toHexString()).toBe("0f0a086d6f756e7461696e1203646577");
        })

        it('MsgType decodes correctly', () => {
            const r = fromHex("0a086d6f756e7461696e1203646577");
            const rawValue = MockRaw.readValue(r);
            expect(rawValue).toBeDefined();
            expect(rawValue.key).toEqual("mountain");
            expect(rawValue.value).toEqual("dew");
        })
    })

    it('has appropriate default value', () => {
        expect(Surrogate.defVal()).toBe("default");
    })

    describe('writeValue/readValue', () => {
        it('can convert from surrogate form', () => {
            const surrogateValue = `{"key":"mountain","value":"dew"}`;
            const w = writable();
            Surrogate.writeValue(w, surrogateValue);
            expect(w.toHexString()).toBe("0f0a086d6f756e7461696e1203646577");
        })
    
        it('can convert to surrogate form', () => {
            const r = fromHex("0a086d6f756e7461696e1203646577");
            const surrogateValue = Surrogate.readValue(r)
            expect(surrogateValue).toBe(`{"key":"mountain","value":"dew"}`);
        })
    })

    describe('readMessageValue()', () => {
        it('can convert to surrogate form', () => {
            const r = fromHex("0a086d6f756e7461696e1203646577");
            const surrogateValue = Surrogate.readMessageValue(r)
            expect(surrogateValue).toBe(`{"key":"mountain","value":"dew"}`);
        })
    })

    describe('read()', () => {
        it('can convert from surrogate form', () => {
            const surrogateValue = `{"key":"mountain","value":"dew"}`;
            const w = writable();
            Surrogate.write(w, surrogateValue, 1);
            expect(w.toHexString()).toBe("0a0f0a086d6f756e7461696e1203646577");
        })
    
        it('can convert to surrogate form', () => {
            const r = fromHex("0f0a086d6f756e7461696e1203646577");
            const surrogateValue = Surrogate.read(r, WireType.LengthDelim, 1, () => "default")
            expect(surrogateValue).toBe(`{"key":"mountain","value":"dew"}`);
        })

        it('relays any errors in reading', () => {
            const r = fromHex("0f0a086d6f756e7461696e1203646577");
            // the wire type below is wrong, indicating that we just read a tag declaring a varint
            const surrogateValue = Surrogate.read(r, WireType.Varint, 1, () => "default")
            expect(surrogateValue).toBeInstanceOf(Error);
        })
    })

    describe('write()', () => {
        it('does not write if value is default value', () => {
            const w = writable();
            Surrogate.write(w, "default", 1);
            expect(w.toHexString()).toBe("");
        })
    })
})